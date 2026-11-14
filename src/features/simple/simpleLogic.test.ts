import { describe, expect, it } from 'vitest';
import type { DownloadItem } from '@/types';
import { applyTree, nextSelection, rangeIds, stepActive, treeCounts } from './simpleLogic';

const mk = (id: string, status: DownloadItem['status'], category: DownloadItem['category']) => ({ id, status, category }) as DownloadItem;
const items = [mk('a', 'downloading', 'Video'), mk('b', 'completed', 'Programs'), mk('c', 'paused', 'Video'), mk('d', 'completed', 'Documents'), mk('e', 'failed', 'General')];

describe('simple window tree', () => {
  it('filters like IDM: All / Unfinished / Finished / category', () => {
    expect(applyTree(items, { kind: 'all' })).toHaveLength(5);
    expect(applyTree(items, { kind: 'unfinished' }).map((i) => i.id)).toEqual(['a', 'c', 'e']);
    expect(applyTree(items, { kind: 'finished' }).map((i) => i.id)).toEqual(['b', 'd']);
    expect(applyTree(items, { kind: 'category', category: 'Video' }).map((i) => i.id)).toEqual(['a', 'c']);
  });
  it('counts per node', () => {
    const c = treeCounts(items);
    expect([c.all, c.unfinished, c.finished]).toEqual([5, 3, 2]);
    expect([c.byCategory.Video, c.byCategory.Programs, c.byCategory.Music]).toEqual([2, 1, 0]);
  });
});

describe('simple window selection', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  it('click selects only that row', () => expect(nextSelection(['a', 'b'], 'c', { ctrl: false, shift: false }, 'a', ids)).toEqual(['c']));
  it('ctrl toggles', () => {
    expect(nextSelection(['a'], 'c', { ctrl: true, shift: false }, 'a', ids)).toEqual(['a', 'c']);
    expect(nextSelection(['a', 'c'], 'c', { ctrl: true, shift: false }, 'a', ids)).toEqual(['a']);
  });
  it('shift selects a range from the anchor, in either direction', () => {
    expect(nextSelection(['b'], 'd', { ctrl: false, shift: true }, 'b', ids)).toEqual(['b', 'c', 'd']);
    expect(rangeIds(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });
  it('arrow keys move and clamp', () => {
    expect(stepActive(ids, null, 1)).toBe('a');
    expect(stepActive(ids, 'b', 1)).toBe('c');
    expect(stepActive(ids, 'a', -1)).toBe('a');
    expect(stepActive(ids, 'e', 1)).toBe('e');
    expect(stepActive([], null, 1)).toBeNull();
  });
});
