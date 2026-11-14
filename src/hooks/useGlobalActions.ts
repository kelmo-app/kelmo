import { useCallback } from 'react';
import { pluralize } from '@/lib/format';
import { useDownloadStore } from '@/store/instances';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';

/** Bulk actions that aren't tied to one row (pause all, clear completed…). */
export function useGlobalActions() {
  const pauseAll = useCallback((queueId?: string) => {
    const n = useDownloadStore.getState().pauseAll(queueId);
    useUiStore.getState().toast(
      n > 0 ? { tone: 'info', title: 'Paused', description: pluralize(n, 'download') } : { tone: 'info', title: 'Nothing to pause', description: 'No downloads are running.' },
      2400,
    );
  }, []);

  const resumeAll = useCallback((queueId?: string) => {
    const n = useDownloadStore.getState().resumeAll(queueId);
    useUiStore.getState().toast(
      n > 0 ? { tone: 'info', title: 'Resumed', description: pluralize(n, 'download') } : { tone: 'info', title: 'Nothing to resume', description: 'No downloads are paused.' },
      2400,
    );
  }, []);

  const clearCompleted = useCallback((queueId?: string) => {
    const store = useDownloadStore.getState();
    const count = Object.values(store.items).filter((i) => i.status === 'completed' && (!queueId || i.queueId === queueId)).length;
    if (count === 0) {
      useUiStore.getState().toast({ tone: 'info', title: 'Nothing to clear', description: 'There are no completed downloads.' }, 2400);
      return;
    }
    const run = () => {
      const n = useDownloadStore.getState().clearCompleted(queueId);
      useUiStore.getState().toast({ tone: 'success', title: 'Cleared', description: `${pluralize(n, 'completed record')} removed. Files stay on disk.` }, 3000);
    };
    if (!useSettingsStore.getState().settings.startupBehavior.confirmBeforeDelete) return run();
    useUiStore.getState().askConfirm({
      title: 'Clear completed downloads?',
      description: `${pluralize(count, 'completed record')} will be removed from KELMO. The files stay on disk.`,
      confirmLabel: 'Clear completed',
      tone: 'danger',
      onConfirm: run,
    });
  }, []);

  return { pauseAll, resumeAll, clearCompleted };
}
