import { useCallback } from 'react';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { platform } from '@/services/platform';
import { requestRemove } from './useShortcuts';

/** One place for per-download actions so every screen behaves identically. */
export function useItemActions() {
  const store = useDownloadStore.getState;
  const toast = useUiStore.getState().toast;

  const pause = useCallback((id: string) => store().pause(id), [store]);
  const resume = useCallback((id: string) => store().resume(id), [store]);

  const cancel = useCallback(
    (id: string) => {
      const it = store().items[id];
      if (!it) return;
      useUiStore.getState().askConfirm({
        title: 'Cancel this download?',
        description: `“${it.fileName}” will stop. You can retry it later from the list.`,
        confirmLabel: 'Cancel download',
        cancelLabel: 'Keep downloading',
        tone: 'danger',
        onConfirm: () => {
          store().cancel(id);
          toast({ tone: 'warning', title: 'Download cancelled', description: it.fileName }, 3000);
        },
      });
    },
    [store, toast],
  );

  const retry = useCallback(
    (id: string) => {
      store().retry(id);
      toast({ tone: 'info', title: 'Retrying download', description: store().items[id]?.fileName }, 2500);
    },
    [store, toast],
  );

  const remove = useCallback((id: string) => requestRemove([id]), []);

  const openFolder = useCallback(
    async (id: string) => {
      const it = store().items[id];
      if (!it) return;
      const res = await platform.showInFolder(`${it.destination}/${it.fileName}`);
      useUiStore.getState().toast(
        res.simulated
          ? { tone: 'info', title: 'Open folder', description: `Would open ${it.destination} (desktop app only)` }
          : { tone: res.ok ? 'success' : 'error', title: res.ok ? 'Opened folder' : 'Could not open folder', description: it.destination },
        2600,
      );
    },
    [store],
  );

  const openFile = useCallback(
    async (id: string) => {
      const it = store().items[id];
      if (!it) return;
      const res = await platform.openPath(`${it.destination}/${it.fileName}`);
      useUiStore.getState().toast(
        res.simulated
          ? { tone: 'info', title: 'Open file', description: `Would open ${it.fileName} (desktop app only)` }
          : { tone: res.ok ? 'success' : 'error', title: res.ok ? 'Opening file' : 'Could not open file', description: res.error ?? it.fileName },
        2600,
      );
    },
    [store],
  );

  const redownload = useCallback(
    (id: string) => {
      const it = store().redownload(id);
      if (it) toast({ tone: 'success', title: 'Download restarted', description: it.fileName }, 2600);
    },
    [store, toast],
  );

  const copyLink = useCallback(
    async (id: string) => {
      const it = store().items[id];
      if (!it) return;
      try {
        await navigator.clipboard.writeText(it.url);
        toast({ tone: 'success', title: 'Link copied', description: it.sourceDomain }, 2000);
      } catch {
        toast({ tone: 'warning', title: 'Could not copy link', description: 'Clipboard access was denied.' }, 3000);
      }
    },
    [store, toast],
  );

  return { pause, resume, cancel, retry, remove, openFolder, openFile, redownload, copyLink };
}
