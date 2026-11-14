import { useEffect } from 'react';
import { manager, STATE_KEY, useDownloadStore } from '@/store/instances';
import { useSchedulerStore } from '@/store/schedulerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { configFromSettings } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { storage } from '@/services/StorageService';
import { platform } from '@/services/platform';
import { formatBytes } from '@/lib/format';
import { formatDays } from '@/services/SchedulerService';
import { usePopupHost } from './usePopupHost';

const TICK_MS = 500;

/**
 * Drives the simulation, mirrors settings/rules into the manager, persists
 * state and turns manager events into toasts + notifications.
 * Mounted once, at the top of the app.
 */
export function useEngineLoop(): void {
  usePopupHost();
  // heartbeat
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const nowPerf = performance.now();
      // clamp so a suspended laptop doesn't "download" for hours in one tick
      const dt = Math.min(2, (nowPerf - last) / 1000);
      last = nowPerf;
      manager.tick(dt, Date.now());
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // settings → manager
  useEffect(() => {
    const apply = () => manager.setConfig(configFromSettings(useSettingsStore.getState().settings));
    apply();
    const unsub = useSettingsStore.subscribe(apply);
    // the bandwidth planner changes the limit as the clock moves on
    const clock = window.setInterval(apply, 30_000);
    return () => {
      unsub();
      window.clearInterval(clock);
    };
  }, []);

  // schedule rules → manager
  useEffect(() => {
    manager.setRules(useSchedulerStore.getState().rules);
    return useSchedulerStore.subscribe((s, prev) => {
      if (s.rules !== prev.rules) manager.setRules(s.rules);
    });
  }, []);

  // links handed over by the browser extension → Add download dialog
  useEffect(() => {
    return platform.onExternalAdd((req) => {
      useUiStore.getState().openAddDialog(req.url, undefined, { referrer: req.referrer, cookie: req.cookie, userAgent: req.userAgent });
      useUiStore.getState().toast({ tone: 'info', title: 'Link received from browser', description: req.fileName ?? req.url }, 3000);
    });
  }, []);

  // persistence (debounced)
  useEffect(() => {
    let timer: number | undefined;
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => storage.write(STATE_KEY, manager.serialize()), 1200);
    };
    const unsub = manager.subscribe(save);
    const flush = () => storage.write(STATE_KEY, manager.serialize());
    window.addEventListener('beforeunload', flush);
    return () => {
      unsub();
      window.clearTimeout(timer);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  // events → toasts / notifications
  useEffect(() => {
    return manager.onEvent((e) => {
      const { notifications } = useSettingsStore.getState().settings;
      const ui = useUiStore.getState();
      const desktop = (title: string, body: string) => notifications.desktop && platform.notify(title, body);
      const store = useDownloadStore.getState();

      switch (e.type) {
        case 'completed': {
          if (!notifications.downloadCompleted) return;
          const title = 'Download completed';
          const description = `${e.item.fileName} · ${formatBytes(e.item.totalBytes)}`;
          ui.toast({ tone: 'success', title, description, action: { label: 'Open folder', run: () => void platform.showInFolder(e.item.destination) } });
          ui.pushNotification({ tone: 'success', title, description });
          desktop(title, description);
          break;
        }
        case 'failed': {
          if (e.willRetry) return;
          if (!notifications.downloadFailed) return;
          const title = 'Download failed';
          const description = `${e.item.fileName}: ${e.item.error ?? 'Unknown error'}`;
          ui.toast({ tone: 'error', title, description, action: { label: 'Retry', run: () => store.retry(e.item.id) } }, 7000);
          ui.pushNotification({ tone: 'error', title, description });
          desktop(title, description);
          break;
        }
        case 'queueFinished': {
          if (!notifications.queueFinished) return;
          const title = 'Queue finished';
          const description = `${e.queue.name} has no more pending downloads.`;
          ui.toast({ tone: 'info', title, description });
          ui.pushNotification({ tone: 'info', title, description });
          desktop(title, description);
          break;
        }
        case 'schedulerStarted': {
          if (!notifications.schedulerStarted) return;
          const title = 'Scheduler started';
          const description = `${e.rule.name} (${formatDays(e.rule.days)}) is now running.`;
          ui.toast({ tone: 'info', title, description });
          ui.pushNotification({ tone: 'info', title, description });
          desktop(title, description);
          break;
        }
        case 'checksumMismatch': {
          // always shown: a wrong checksum means the file is damaged or not the one that was published
          const title = 'Checksum does not match';
          const description = `${e.item.fileName}: the ${e.item.checksumAlgo} of the file differs from the one you gave. Download it again.`;
          ui.toast({ tone: 'error', title, description, action: { label: 'Retry', run: () => store.retry(e.item.id) } }, 10000);
          ui.pushNotification({ tone: 'error', title, description });
          desktop(title, description);
          break;
        }
        case 'verified':
          break;
      }
    });
  }, []);
}
