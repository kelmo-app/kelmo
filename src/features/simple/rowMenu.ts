import type { DownloadItem, Queue } from '@/types';

export type RowAction = 'open' | 'folder' | 'redownload' | 'resume' | 'stop' | 'copy' | 'remove' | 'properties' | `queue:${string}`;

export type MenuEntry =
  | { kind: 'item'; action: RowAction; label: string; disabled?: boolean; danger?: boolean; shortcut?: string }
  | { kind: 'sep' }
  | { kind: 'sub'; label: string; disabled?: boolean; children: MenuEntry[] };

const canResume = (i: DownloadItem) => i.status === 'paused' || i.status === 'failed' || i.status === 'cancelled';
const canStop = (i: DownloadItem) => i.status === 'downloading' || i.status === 'queued';

/**
 * What the right-click menu offers, like IDM's: only real actions, and the ones that make no sense for the
 * download(s) in question are greyed out. `targets` is the selection when the clicked row is part of it, else just that row.
 */
export function buildRowMenu(targets: DownloadItem[], queues: Queue[]): MenuEntry[] {
  if (targets.length === 0) return [];
  const one = targets.length === 1 ? targets[0] : null;
  const queueEntries = (excludeId?: string): MenuEntry[] =>
    queues.filter((q) => q.id !== excludeId).map((q) => ({ kind: 'item' as const, action: `queue:${q.id}` as RowAction, label: q.name }));

  if (one) {
    const others = queueEntries(one.queueId);
    return [
      { kind: 'item', action: 'open', label: 'Open', disabled: one.status !== 'completed' },
      { kind: 'item', action: 'folder', label: 'Open folder' },
      { kind: 'sep' },
      { kind: 'item', action: 'redownload', label: 'Redownload', disabled: one.status === 'downloading' },
      { kind: 'item', action: 'resume', label: 'Resume download', disabled: !canResume(one) },
      { kind: 'item', action: 'stop', label: 'Stop download', disabled: !canStop(one) },
      { kind: 'item', action: 'copy', label: 'Copy link' },
      { kind: 'sep' },
      { kind: 'item', action: 'remove', label: 'Remove', danger: true, shortcut: 'Del' },
      { kind: 'sub', label: 'Add to queue', disabled: others.length === 0, children: others },
      { kind: 'sep' },
      { kind: 'item', action: 'properties', label: 'Properties' },
    ];
  }

  return [
    { kind: 'item', action: 'resume', label: 'Resume downloads', disabled: !targets.some(canResume) },
    { kind: 'item', action: 'stop', label: 'Stop downloads', disabled: !targets.some(canStop) },
    { kind: 'sep' },
    { kind: 'item', action: 'remove', label: `Remove ${targets.length} downloads`, danger: true, shortcut: 'Del' },
    { kind: 'sub', label: 'Add to queue', disabled: queues.length === 0, children: queueEntries() },
  ];
}

/** Which downloads a right-click acts on: the whole selection when the clicked row is in it, else only that row. */
export function menuTargets(clickedId: string, selectedIds: string[], all: DownloadItem[]): DownloadItem[] {
  const ids = selectedIds.includes(clickedId) ? selectedIds : [clickedId];
  return ids.map((id) => all.find((i) => i.id === id)).filter((i): i is DownloadItem => !!i);
}

/** What "resume" means for one download: a paused one continues, a failed or cancelled one is retried. */
export function resumeKind(item: DownloadItem): 'resume' | 'retry' | null {
  return item.status === 'paused' ? 'resume' : item.status === 'failed' || item.status === 'cancelled' ? 'retry' : null;
}
