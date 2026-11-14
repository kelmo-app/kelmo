/** Pure derivations over manager state. UI and tests share these. */
import type { Category, DownloadItem, DownloadStatus } from '../types/index.ts';

export interface Totals {
  active: number;
  queued: number;
  paused: number;
  failed: number;
  completedToday: number;
  completedTotal: number;
  /** bytes/second across all running transfers */
  speed: number;
  connections: number;
  remainingBytes: number;
  /** bytes of everything not yet finished (the "Total size" tile) */
  pendingTotalBytes: number;
  /** seconds, null when nothing is running */
  eta: number | null;
}

function startOfDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function computeTotals(items: DownloadItem[], now = Date.now()): Totals {
  const t: Totals = {
    active: 0, queued: 0, paused: 0, failed: 0, completedToday: 0, completedTotal: 0,
    speed: 0, connections: 0, remainingBytes: 0, pendingTotalBytes: 0, eta: null,
  };
  const dayStart = startOfDay(now);
  for (const it of items) {
    switch (it.status) {
      case 'downloading':
        t.active += 1;
        t.speed += it.speed;
        t.connections += it.connections;
        t.remainingBytes += it.totalBytes - it.downloadedBytes;
        t.pendingTotalBytes += it.totalBytes;
        break;
      case 'queued':
        t.queued += 1;
        t.remainingBytes += it.totalBytes - it.downloadedBytes;
        t.pendingTotalBytes += it.totalBytes;
        break;
      case 'paused':
        t.paused += 1;
        t.remainingBytes += it.totalBytes - it.downloadedBytes;
        t.pendingTotalBytes += it.totalBytes;
        break;
      case 'failed':
      case 'cancelled':
        t.failed += 1;
        break;
      case 'completed':
        t.completedTotal += 1;
        if ((it.completedAt ?? 0) >= dayStart) t.completedToday += 1;
        break;
    }
  }
  if (t.active > 0 && t.speed > 0) {
    const runningRemaining = items.filter((i) => i.status === 'downloading').reduce((s, i) => s + i.totalBytes - i.downloadedBytes, 0);
    t.eta = runningRemaining / t.speed;
  }
  return t;
}

export const STATUS_ORDER: Record<DownloadStatus, number> = {
  downloading: 0,
  queued: 1,
  paused: 2,
  failed: 3,
  cancelled: 4,
  completed: 5,
};

export type DownloadSortKey = 'date' | 'name' | 'size' | 'speed' | 'status' | 'progress';
export type SortDir = 'asc' | 'desc';

export interface DownloadFilter {
  query?: string;
  category?: Category | 'all';
  status?: DownloadStatus | 'all' | 'active';
  queueId?: string | 'all';
}

export function matchesQuery(item: DownloadItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.fileName, item.sourceDomain, item.category, item.url, item.destination].some((v) => v.toLowerCase().includes(q));
}

export function filterDownloads(items: DownloadItem[], f: DownloadFilter): DownloadItem[] {
  return items.filter((it) => {
    if (f.query && !matchesQuery(it, f.query)) return false;
    if (f.category && f.category !== 'all' && it.category !== f.category) return false;
    if (f.queueId && f.queueId !== 'all' && it.queueId !== f.queueId) return false;
    if (f.status && f.status !== 'all') {
      if (f.status === 'active') {
        if (it.status !== 'downloading' && it.status !== 'queued') return false;
      } else if (it.status !== f.status) return false;
    }
    return true;
  });
}

export function sortDownloads(items: DownloadItem[], key: DownloadSortKey, dir: SortDir = 'desc'): DownloadItem[] {
  const mul = dir === 'asc' ? 1 : -1;
  const cmp = (a: DownloadItem, b: DownloadItem): number => {
    switch (key) {
      case 'name':
        return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
      case 'size':
        return a.totalBytes - b.totalBytes;
      case 'speed':
        return a.speed - b.speed;
      case 'progress':
        return a.progress - b.progress;
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      case 'date':
      default:
        return a.createdAt - b.createdAt;
    }
  };
  return [...items].sort((a, b) => mul * cmp(a, b) || a.fileName.localeCompare(b.fileName));
}

export type LibraryRange = 'all' | 'today' | 'week' | 'month' | 'older';

export function inLibraryRange(ts: number | null, range: LibraryRange, now = Date.now()): boolean {
  if (range === 'all') return true;
  if (ts == null) return false;
  const day = 86_400_000;
  const age = now - ts;
  switch (range) {
    case 'today':
      return ts >= startOfDay(now);
    case 'week':
      return age <= 7 * day;
    case 'month':
      return age <= 30 * day;
    case 'older':
      return age > 30 * day;
  }
}

export interface CategorySlice {
  category: Category;
  bytes: number;
  count: number;
  percent: number;
}

export function categoryBreakdown(items: DownloadItem[]): CategorySlice[] {
  const map = new Map<Category, { bytes: number; count: number }>();
  for (const it of items) {
    const cur = map.get(it.category) ?? { bytes: 0, count: 0 };
    cur.bytes += it.totalBytes;
    cur.count += 1;
    map.set(it.category, cur);
  }
  const total = [...map.values()].reduce((s, v) => s + v.bytes, 0) || 1;
  return [...map.entries()]
    .map(([category, v]) => ({ category, bytes: v.bytes, count: v.count, percent: (v.bytes / total) * 100 }))
    .sort((a, b) => b.bytes - a.bytes);
}
