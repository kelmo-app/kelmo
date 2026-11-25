/** Pure helpers for the small IDM-style windows (kept free of React so they are unit-testable). */
import type { Category, DownloadItem } from '@/types';
import type { ConnectionDetail, PopupItem, UnfinishedItem } from '@/types/global';
import { CATEGORIES, classifyFile, normalizeCategory } from '@/lib/url';
import { formatBytes, formatEta, formatSpeed } from '@/lib/format';

export interface CategoryFolder {
  name: string;
  folder: string;
}

export const FALLBACK_FOLDERS: CategoryFolder[] = CATEGORIES.map((name) => ({ name, folder: name === 'General' ? '~/Downloads/KELMO' : `~/Downloads/KELMO/${name}` }));

export function folderFor(category: string, folders: CategoryFolder[]): string {
  const list = folders.length ? folders : FALLBACK_FOLDERS;
  return (list.find((c) => c.name === category) ?? list.find((c) => c.name === 'General') ?? list[0]).folder;
}

const baseName = (n: string) => n.trim().toLowerCase().replace(/ \(\d+\)(?=\.[^.]+$|$)/, '');

/**
 * A link that arrives while a half-finished download exists: is it the same file under a new address (an expired
 * or broken link opened again from the page)? The person asking for a new address ("waiting") is trusted; otherwise
 * the size must match exactly and the name must be the same.
 */
export function findUnfinishedMatch(
  list: UnfinishedItem[] | undefined,
  found: { fileName: string; size: number },
  waitingId?: string | null,
): { item: UnfinishedItem; waiting: boolean } | null {
  if (!list || !list.length) return null;
  const sizeOk = (it: UnfinishedItem) => !(found.size > 0 && it.totalBytes > 0) || found.size === it.totalBytes;
  if (waitingId) {
    const w = list.find((i) => i.id === waitingId);
    if (w && sizeOk(w)) return { item: w, waiting: true };
  }
  if (!(found.size > 0)) return null;
  const hit = list.find((i) => i.totalBytes === found.size && i.downloadedBytes > 0 && baseName(i.fileName) === baseName(found.fileName));
  return hit ? { item: hit, waiting: false } : null;
}

export function categoryOfName(fileName: string): Category {
  return normalizeCategory(classifyFile(fileName).category, fileName);
}

export function percentOf(it: Pick<PopupItem, 'totalBytes' | 'downloadedBytes' | 'status'>): number {
  if (it.status === 'completed') return 100;
  if (!it.totalBytes) return 0;
  return Math.max(0, Math.min(100, (it.downloadedBytes / it.totalBytes) * 100));
}

export function statusText(it: Pick<PopupItem, 'status' | 'speed' | 'error' | 'downloadedBytes'>): string {
  switch (it.status) {
    case 'completed': return 'Complete';
    case 'paused': return 'Paused';
    case 'failed': return it.error ? `Error: ${it.error}` : 'Error';
    case 'cancelled': return 'Cancelled';
    case 'queued': return 'Waiting in queue…';
    default: return it.speed > 0 || it.downloadedBytes > 0 ? 'Receiving data…' : 'Connecting…';
  }
}

export interface ProgressRows {
  size: string;
  downloaded: string;
  rate: string;
  left: string;
  resume: string;
  connections: string;
}

export function progressRows(it: PopupItem): ProgressRows {
  const pct = percentOf(it);
  const active = it.status === 'downloading';
  return {
    size: it.totalBytes ? formatBytes(it.totalBytes) : 'Unknown',
    downloaded: `${formatBytes(it.downloadedBytes)} (${pct.toFixed(pct >= 99.95 || pct === 0 ? 0 : 1)} %)`,
    rate: active && it.speed > 0 ? formatSpeed(it.speed) : '—',
    left: active && it.eta != null ? formatEta(it.eta) : '—',
    resume: it.resumable === null ? '—' : it.resumable ? 'Yes' : 'No',
    connections: active && it.connections > 0 ? String(it.connections) : '—',
  };
}

export function windowTitle(it: PopupItem | null): string {
  if (!it) return 'KDM';
  return it.status === 'completed' ? `Complete — ${it.fileName}` : `${Math.floor(percentOf(it))}% ${it.fileName || 'Connecting…'}`;
}

export function fullPath(it: Pick<PopupItem, 'destination' | 'fileName'>): string {
  return `${it.destination.replace(/\/+$/, '')}/${it.fileName}`;
}

export type After = 'none' | 'file' | 'folder';
const KEEP_FINISHED_MS = 10 * 60_000;

/** Pure: which downloads the small windows need to know about right now (browser downloads, and any active one for the tray). */
export function popupItems(items: DownloadItem[], after: Map<string, After>, now = Date.now()): PopupItem[] {
  return items
    .filter((i) => {
      const finished = ['completed', 'cancelled'].includes(i.status);
      if (!finished && ['downloading', 'queued', 'paused'].includes(i.status)) return true; // the tray's Quick Monitor lists every active download
      return i.viaPopup && (!finished || now - (i.completedAt ?? now) < KEEP_FINISHED_MS);
    })
    .map((i) => ({
      id: i.id,
      url: i.url,
      fileName: i.fileName,
      ...(i.mainFile ? { mainFile: i.mainFile } : {}),
      destination: i.destination,
      status: i.status,
      totalBytes: i.totalBytes,
      downloadedBytes: i.downloadedBytes,
      speed: i.speed,
      eta: i.eta,
      connections: i.connections,
      speedLimit: i.speedLimit,
      resumable: i.resumable ?? null,
      error: i.error,
      afterOpen: after.get(i.id) ?? 'none',
    }));
}


// ---------------------------------------------------------------- per-connection detail (real engine data)

export interface BarCell {
  /** percent of the file */
  left: number;
  width: number;
}

/** Downloaded parts of the file as bar cells, plus the percent positions where segments begin. */
export function segmentBar(segments: ConnectionDetail['segments'], total: number): { filled: BarCell[]; marks: number[] } {
  if (!total || total <= 0) return { filled: [], marks: [] };
  const pct = (b: number) => Math.max(0, Math.min(100, (b / total) * 100));
  const filled: BarCell[] = [];
  const marks: number[] = [];
  for (const [start, pos, end] of segments) {
    const upto = Math.min(pos, end + 1);
    if (start > 0) marks.push(pct(start));
    if (upto > start) filled.push({ left: pct(start), width: pct(upto) - pct(start) });
  }
  return { filled, marks };
}

export const WORKER_STATE: Record<string, string> = {
  connecting: 'Connecting…',
  receiving: 'Receiving data…',
  retrying: 'Retrying…',
  finished: 'Finished',
  failed: 'Failed',
};

/** Keeps the last `max` speed samples of every connection, for the little graphs. */
export function pushHistory(history: Record<number, number[]>, workers: ConnectionDetail['workers'], max = 40): Record<number, number[]> {
  const next: Record<number, number[]> = {};
  for (const w of workers) next[w.n] = [...(history[w.n] ?? []), w.speed].slice(-max);
  return next;
}

/** SVG polyline points for a sparkline that fits a w×h box (flat line at the bottom when there is no speed). */
export function sparkPoints(values: number[], w: number, h: number): string {
  if (values.length < 2) return `0,${h} ${w},${h}`;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  return values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(' ');
}
