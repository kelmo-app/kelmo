/**
 * The main window owns the download manager. While it sits hidden in the tray it also serves the
 * small IDM-style windows: it publishes a compact snapshot of the browser downloads, executes the
 * actions those windows send back (pause, cancel, speed limit…) and announces completions.
 */
import { useEffect } from 'react';
import type { DownloadItem } from '@/types';
import type { PopupConfig, UnfinishedItem } from '@/types/global';
import { CATEGORIES, categoryFolder, normalizeCategory } from '@/lib/url';
import { popupItems } from '@/popup/popupLogic';
import { useDownloadStore } from '@/store/instances';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { freshWatch, stepAfterAll, type AfterAllWatch } from '@/lib/afterAll';
import type { AfterAllMode } from '@/types';
import { platform } from '@/services/platform';

type After = 'none' | 'file' | 'folder';

export function buildPopupConfig(s: ReturnType<typeof useSettingsStore.getState>['settings'], afterAll: AfterAllMode = 'none', extra: { unfinished?: UnfinishedItem[]; waitingId?: string | null } = {}): PopupConfig {
  return {
    ...extra,
    afterAll,
    categories: CATEGORIES.map((name) => ({ name, folder: categoryFolder(name, s.defaultFolder, s.categoryFolders) })),
    showCompleteDialog: s.showCompleteDialog,
    showProgressWindow: s.showProgressWindow,
    defaultConnections: s.maxConnections,
    watchClipboard: s.watchClipboard,
    dropTarget: s.dropTarget,
  };
}

export function usePopupHost(): void {
  useEffect(() => {
    const host = window.kelmo?.host;
    if (!host) return;
    const after = new Map<string, After>();
    const prev = new Map<string, string>(Object.values(useDownloadStore.getState().items).map((i) => [i.id, i.status]));
    let timer: number | undefined;
    let watch: AfterAllWatch | null = null; // armed "when all downloads finish" action

    const flush = () => {
      timer = undefined;
      const settings = useSettingsStore.getState().settings;
      const all = Object.values(useDownloadStore.getState().items);
      const finished: DownloadItem[] = [];
      for (const it of all) {
        if (it.viaPopup && it.status === 'completed' && prev.get(it.id) && prev.get(it.id) !== 'completed') finished.push(it);
        prev.set(it.id, it.status);
      }
      // busy = something is transferring or waiting for its turn; when it is false the tray can free the window's memory
      const busy = all.some((i) => i.status === 'downloading' || i.status === 'queued');
      // "When all downloads finish": armed in the progress window or the status bar; fires once, then disarms itself
      const armed = useUiStore.getState().afterAll;
      let fire: AfterAllMode | null = null;
      if (armed === 'none') watch = null;
      else {
        const r = stepAfterAll(watch ?? freshWatch(all), all);
        watch = r.watch;
        if (r.fire) {
          fire = armed;
          watch = null;
          useUiStore.getState().setAfterAll('none');
        }
      }
      host.publish({ items: popupItems(all, after), config: buildPopupConfig(settings, useUiStore.getState().afterAll, {
          unfinished: all
            .filter((i) => ['failed', 'paused', 'cancelled'].includes(i.status) && i.downloadedBytes > 0 && !i.video && !/^magnet:/i.test(i.url))
            .slice(0, 50)
            .map((i) => ({ id: i.id, fileName: i.fileName, totalBytes: i.totalBytes, downloadedBytes: i.downloadedBytes, status: i.status })),
          waitingId: useUiStore.getState().linkWaitId,
        }), busy });
      if (fire) void host.afterAll(fire);
      for (const it of finished) {
        host.itemDone({ id: it.id, showDialog: settings.showCompleteDialog });
        const mode = after.get(it.id) ?? 'none';
        if (mode !== 'none') {
          const file = `${it.destination}/${it.fileName}`;
          void (mode === 'file' ? platform.openPath(file) : platform.showInFolder(file));
        }
        after.delete(it.id);
      }
    };
    const schedule = () => {
      if (timer === undefined) timer = window.setTimeout(flush, 400);
    };

    const offs = [
      host.on('kdm:popup-add', (spec) => {
        const s = useSettingsStore.getState().settings;
        try {
          if (spec.replaceId) {
            // the same file under a new address: continue the partial download instead of adding another one
            const ok = useDownloadStore.getState().replaceLink(spec.replaceId, { url: spec.url, referrer: spec.referrer, cookie: spec.cookie, userAgent: spec.userAgent });
            if (useUiStore.getState().linkWaitId === spec.replaceId) useUiStore.getState().setLinkWait(null);
            flush();
            if (ok) {
              host.popupAdded({ id: spec.replaceId, show: s.showProgressWindow });
              useUiStore.getState().toast({ tone: 'success', title: 'Continuing from where it stopped', description: 'The new address is being used for the same file.' }, 4000);
              return;
            }
            useUiStore.getState().toast({ tone: 'error', title: 'Could not continue that download', description: 'It is no longer waiting. Add the link as a new download instead.' }, 5000);
            return;
          }
          const item = useDownloadStore.getState().addDownload({
            url: spec.url,
            fileName: spec.fileName || undefined,
            destination: spec.dir,
            category: normalizeCategory(spec.category, spec.fileName),
            startNow: !!spec.startNow,
            connections: s.maxConnections,
            referrer: spec.referrer,
            cookie: spec.cookie,
            userAgent: spec.userAgent,
            mirrors: spec.mirrors,
            authUser: spec.authUser,
            authSecret: spec.authSecret,
            video: spec.video,
            viaPopup: true,
          });
          flush();
          host.popupAdded({ id: item.id, show: !!spec.startNow && s.showProgressWindow });
        } catch (err) {
          useUiStore.getState().toast({ tone: 'error', title: 'Could not add the download', description: err instanceof Error ? err.message : String(err) }, 5000);
        }
      }),
      host.on('kdm:popup-batch', (links: string[]) => {
        useUiStore.getState().openAddDialog(undefined, undefined, undefined, links.join('\n'));
      }),
      host.on('kdm:popup-nav', (msg: { to?: string }) => {
        // from the tray's Quick Monitor (HashRouter: the route is the hash)
        if (msg?.to === 'addUrl') useUiStore.getState().openAddDialog();
        else if (msg?.to === 'queue') window.location.hash = '#/queues';
        else if (msg?.to === 'settings') window.location.hash = '#/settings';
      }),
      host.on('kdm:popup-action', (msg) => {
        const st = useDownloadStore.getState();
        if (msg.action === 'pause') st.pause(msg.id);
        else if (msg.action === 'resume') (st.items[msg.id]?.status === 'failed' ? st.retry : st.resume)(msg.id);
        else if (msg.action === 'cancel') st.cancel(msg.id);
        else if (msg.action === 'limit') st.setSpeedLimit(msg.id, Math.max(0, Number(msg.value) || 0));
        else if (msg.action === 'afterAll') {
          const m = String(msg.value);
          useUiStore.getState().setAfterAll(m === 'quit' || m === 'sleep' || m === 'shutdown' ? m : 'none');
        } else if (msg.action === 'after') after.set(msg.id, msg.value === 'file' || msg.value === 'folder' ? msg.value : 'none');
        flush();
      }),
      host.on('kdm:popup-pref', (msg) => {
        useSettingsStore.getState().update({ [msg.key]: !!msg.value });
      }),
      host.on('kdm:popup-folder', (msg) => {
        const cat = normalizeCategory(msg.category);
        const cur = useSettingsStore.getState().settings.categoryFolders;
        useSettingsStore.getState().update({ categoryFolders: { ...cur, [cat]: String(msg.folder) } });
      }),
      useDownloadStore.subscribe(schedule),
      useSettingsStore.subscribe(schedule),
      useUiStore.subscribe((st, prev) => {
        if (st.afterAll !== prev.afterAll || st.linkWaitId !== prev.linkWaitId) schedule();
      }),
    ];
    flush();
    host.ready(); // every listener above exists now: the main process may start sending
    return () => {
      offs.forEach((off) => off());
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
}
