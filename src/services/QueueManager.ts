/**
 * QueueManager — pure helpers for ordering and summarising queues.
 * No state is held here; DownloadManager owns state and calls these.
 */
import type { DownloadItem, Priority, Queue, QueueSectionKey, QueueStats } from '../types/index.ts';

export const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export function computeQueueStats(queue: Queue, items: Record<string, DownloadItem>): QueueStats {
  const stats: QueueStats = { total: 0, active: 0, queued: 0, paused: 0, completed: 0, failed: 0, remainingBytes: 0, speed: 0 };
  for (const id of queue.itemIds) {
    const it = items[id];
    if (!it) continue;
    stats.total += 1;
    switch (it.status) {
      case 'downloading':
        stats.active += 1;
        stats.speed += it.speed;
        stats.remainingBytes += it.totalBytes - it.downloadedBytes;
        break;
      case 'queued':
        stats.queued += 1;
        stats.remainingBytes += it.totalBytes - it.downloadedBytes;
        break;
      case 'paused':
        stats.paused += 1;
        stats.remainingBytes += it.totalBytes - it.downloadedBytes;
        break;
      case 'completed':
        stats.completed += 1;
        break;
      case 'failed':
      case 'cancelled':
        stats.failed += 1;
        break;
    }
  }
  return stats;
}

export function sectionKeyFor(queue: Queue, item: DownloadItem): QueueSectionKey {
  switch (item.status) {
    case 'downloading':
      return 'active';
    case 'queued':
      return queue.status === 'paused' ? 'paused' : 'next';
    case 'paused':
      return 'paused';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'completed':
      return 'completed';
  }
}

export function sectionize(queue: Queue, items: Record<string, DownloadItem>): Record<QueueSectionKey, DownloadItem[]> {
  const out: Record<QueueSectionKey, DownloadItem[]> = { active: [], next: [], paused: [], failed: [], completed: [] };
  for (const id of queue.itemIds) {
    const it = items[id];
    if (!it) continue;
    out[sectionKeyFor(queue, it)].push(it);
  }
  return out;
}

/** Move `id` so that it ends up at `toIndex` (0-based, clamped). Returns a new array. */
export function reorderIds(ids: string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const next = ids.slice();
  next.splice(from, 1);
  const to = Math.max(0, Math.min(next.length, toIndex));
  next.splice(to, 0, id);
  return next;
}

/** Move `id` directly before/after `targetId`. Used by drag-and-drop. */
export function moveRelative(ids: string[], id: string, targetId: string, place: 'before' | 'after'): string[] {
  if (id === targetId) return ids;
  const without = ids.filter((x) => x !== id);
  const t = without.indexOf(targetId);
  if (t === -1) return ids;
  const next = without.slice();
  next.splice(place === 'before' ? t : t + 1, 0, id);
  return next;
}

/** Stable sort by priority (high → low). Completed items keep their relative position. */
export function sortIdsByPriority(ids: string[], items: Record<string, DownloadItem>): string[] {
  return ids
    .map((id, index) => ({ id, index, rank: PRIORITY_RANK[items[id]?.priority ?? 'normal'] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.id);
}

/** Next queued items that should start, honouring priority first then queue order. */
export function pickNextQueued(queue: Queue, items: Record<string, DownloadItem>, slots: number): DownloadItem[] {
  if (slots <= 0) return [];
  const queued = queue.itemIds
    .map((id, index) => ({ it: items[id], index }))
    .filter((x) => x.it && x.it.status === 'queued')
    .sort((a, b) => PRIORITY_RANK[a.it.priority] - PRIORITY_RANK[b.it.priority] || a.index - b.index);
  return queued.slice(0, slots).map((x) => x.it);
}

export function isQueueFinished(queue: Queue, items: Record<string, DownloadItem>): boolean {
  const live = queue.itemIds.filter((id) => {
    const s = items[id]?.status;
    return s === 'downloading' || s === 'queued';
  });
  const hasCompleted = queue.itemIds.some((id) => items[id]?.status === 'completed');
  return live.length === 0 && hasCompleted;
}
