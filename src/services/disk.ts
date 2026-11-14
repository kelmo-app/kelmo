/** Simulated disk usage. A real build would ask the OS (e.g. via an IPC call). */
import type { DownloadItem } from '../types/index.ts';
import { GB, TB } from '../lib/format.ts';

export const DISK_TOTAL = 1 * TB;
/** Everything on the disk that isn't a KELMO download. */
export const DISK_BASELINE_USED = 540 * GB;

export interface DiskUsage {
  total: number;
  used: number;
  free: number;
  /** 0..100 */
  usedPercent: number;
  /** bytes held by KELMO downloads */
  downloads: number;
}

export function diskUsage(items: DownloadItem[]): DiskUsage {
  const downloads = items.reduce((s, i) => s + (i.status === 'cancelled' ? 0 : i.downloadedBytes), 0);
  const used = Math.min(DISK_TOTAL, DISK_BASELINE_USED + downloads);
  return { total: DISK_TOTAL, used, free: DISK_TOTAL - used, usedPercent: (used / DISK_TOTAL) * 100, downloads };
}
