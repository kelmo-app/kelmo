/** Pure helpers for the Simple (list-first) window, kept free of React so they can be unit-tested. */
import type { Category, DownloadItem } from '@/types';
import { CATEGORIES } from '@/lib/url';

export type TreeFilter =
  | { kind: 'all' }
  | { kind: 'unfinished' }
  | { kind: 'finished' }
  | { kind: 'category'; category: Category };

export const isFinished = (i: DownloadItem): boolean => i.status === 'completed';

export function applyTree(items: DownloadItem[], f: TreeFilter): DownloadItem[] {
  switch (f.kind) {
    case 'unfinished':
      return items.filter((i) => !isFinished(i));
    case 'finished':
      return items.filter(isFinished);
    case 'category':
      return items.filter((i) => i.category === f.category);
    default:
      return items;
  }
}

export interface TreeCounts {
  all: number;
  unfinished: number;
  finished: number;
  byCategory: Record<Category, number>;
}

export function treeCounts(items: DownloadItem[]): TreeCounts {
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let finished = 0;
  for (const i of items) {
    if (isFinished(i)) finished++;
    if (i.category in byCategory) byCategory[i.category]++;
  }
  return { all: items.length, unfinished: items.length - finished, finished, byCategory };
}

/** Ids between two rows (inclusive), in list order. */
export function rangeIds(visible: string[], a: string, b: string): string[] {
  const i = visible.indexOf(a);
  const j = visible.indexOf(b);
  if (i === -1 || j === -1) return [b];
  const [from, to] = i < j ? [i, j] : [j, i];
  return visible.slice(from, to + 1);
}

/** Windows-style row selection: click = only this row, Ctrl = toggle, Shift = range from the anchor. */
export function nextSelection(current: string[], id: string, mods: { ctrl: boolean; shift: boolean }, anchor: string | null, visible: string[]): string[] {
  if (mods.shift && anchor) return rangeIds(visible, anchor, id);
  if (mods.ctrl) return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  return [id];
}

/** Arrow-key movement: the id one row up/down (clamped), or the first row when nothing is active. */
export function stepActive(visible: string[], activeId: string | null, delta: 1 | -1): string | null {
  if (visible.length === 0) return null;
  const i = activeId ? visible.indexOf(activeId) : -1;
  if (i === -1) return visible[delta === 1 ? 0 : visible.length - 1];
  return visible[Math.max(0, Math.min(visible.length - 1, i + delta))];
}
