import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { platform } from '@/services/platform';

function isTyping(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable;
}

/** Global keyboard shortcuts (Ctrl/Cmd+N, K, comma; Space; Delete). */
export function useShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const ui = useUiStore.getState();

      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        ui.openAddDialog();
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.focusSearch();
        return;
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        navigate('/settings');
        return;
      }

      // The rest only apply when no dialog is open and the user isn't typing.
      if (isTyping(e.target) || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.altKey || mod) return;

      const targetIds = ui.selectedIds.length > 0 ? ui.selectedIds : ui.activeId ? [ui.activeId] : [];
      if (targetIds.length === 0) return;
      const store = useDownloadStore.getState();

      // Space on a focused button/link must keep its native meaning.
      const focusedInteractive = (e.target as HTMLElement | null)?.closest('button, a, [role="switch"], [role="radio"], [role="tab"], [role="menuitem"]');

      if (e.key === ' ' && !focusedInteractive) {
        e.preventDefault();
        const items = targetIds.map((id) => store.items[id]).filter(Boolean);
        const anyRunning = items.some((i) => i.status === 'downloading' || i.status === 'queued');
        if (anyRunning) {
          store.pauseMany(targetIds);
          ui.toast({ tone: 'info', title: 'Paused', description: `${items.length} download${items.length === 1 ? '' : 's'} paused` }, 2200);
        } else {
          store.resumeMany(targetIds);
          ui.toast({ tone: 'info', title: 'Resumed', description: `${items.length} download${items.length === 1 ? '' : 's'} resumed` }, 2200);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.key === 'Backspace' && !e.metaKey) return; // plain Backspace is too easy to hit
        e.preventDefault();
        requestRemove(targetIds);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

/** Remove downloads (list only, or list + files in the Trash), honouring the "Confirm before deleting" setting. */
export function requestRemove(ids: string[], afterRemove?: () => void): void {
  const ui = useUiStore.getState();
  const store = useDownloadStore.getState();
  const items = ids.map((id) => store.items[id]).filter(Boolean);
  if (items.length === 0) return;
  const run = (alsoFiles: boolean) => {
    const files = alsoFiles ? items.map((i) => ({ dir: i.destination, name: i.fileName })) : [];
    const live = items.some((i) => i.status !== 'completed');
    store.removeMany(ids);
    ui.setSelectedIds(ui.selectedIds.filter((x) => !ids.includes(x)));
    if (ui.detailId && ids.includes(ui.detailId)) ui.closeDetail();
    if (ui.activeId && ids.includes(ui.activeId)) ui.setActiveId(null);
    ui.toast({ tone: 'info', title: items.length === 1 ? 'Download removed' : `${items.length} downloads removed`, description: items.length === 1 ? items[0].fileName : undefined }, 2800);
    if (alsoFiles) {
      // a running transfer needs a moment to let go of its files before they can be moved
      window.setTimeout(() => {
        void platform.trashFiles(files).then((res) => {
          if (!res) return;
          const t = useUiStore.getState().toast;
          if (res.failed.length) t({ tone: 'error', title: 'Some files could not be moved to the Trash', description: res.failed.slice(0, 3).join(', ') }, 5000);
          else if (res.trashed) t({ tone: 'success', title: res.trashed === 1 ? 'File moved to the Trash' : `${res.trashed} items moved to the Trash`, description: 'You can restore them from the Trash.' }, 3500);
        });
      }, live ? 900 : 0);
    }
    afterRemove?.();
  };
  if (!useSettingsStore.getState().settings.startupBehavior.confirmBeforeDelete) return run(false);
  const one = items.length === 1;
  ui.askConfirm({
    title: one ? 'Remove this download?' : `Remove ${items.length} downloads?`,
    description: one
      ? `“${items[0].fileName}”: remove it from the list only, or also move the downloaded file to the Trash.`
      : `Remove the ${items.length} selected items from the list only, or also move their downloaded files to the Trash.`,
    confirmLabel: 'Remove from list',
    tone: 'danger',
    onConfirm: () => run(false),
    alt: { label: one ? 'Delete file too' : 'Delete files too', onConfirm: () => run(true) },
  });
}
