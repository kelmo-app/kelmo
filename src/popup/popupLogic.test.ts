import { describe, expect, it } from 'vitest';
import { categoryOfName, findUnfinishedMatch, folderFor, fullPath, percentOf, popupItems, progressRows, pushHistory, segmentBar, sparkPoints, statusText, windowTitle } from './popupLogic';
import { categoryFolder, classifyFile, normalizeCategory } from '@/lib/url';
import type { DownloadItem } from '@/types';
import type { PopupItem } from '@/types/global';

const item = (o: Partial<PopupItem> = {}): PopupItem => ({
  id: 'd1', url: 'https://x.test/a.zip', fileName: 'a.zip', destination: '~/Downloads/KDM/Compressed', status: 'downloading',
  totalBytes: 1000, downloadedBytes: 250, speed: 100, eta: 7, connections: 4, speedLimit: 0, resumable: true, error: null, afterOpen: 'none', ...o,
});

describe('findUnfinishedMatch', () => {
  const list = [
    { id: 'a', fileName: 'Movie.mkv', totalBytes: 1000, downloadedBytes: 400, status: 'failed' },
    { id: 'b', fileName: 'Other.zip', totalBytes: 500, downloadedBytes: 100, status: 'paused' },
  ];
  it('same name and exactly the same size is the same file', () => {
    expect(findUnfinishedMatch(list, { fileName: 'movie (1).mkv', size: 1000 })?.item.id).toBe('a');
  });
  it('a different size or name is not offered', () => {
    expect(findUnfinishedMatch(list, { fileName: 'Movie.mkv', size: 999 })).toBeNull();
    expect(findUnfinishedMatch(list, { fileName: 'Else.mkv', size: 1000 })).toBeNull();
    expect(findUnfinishedMatch(list, { fileName: 'Movie.mkv', size: 0 })).toBeNull();
  });
  it('when the person asked for a new address that download is offered even under another name', () => {
    expect(findUnfinishedMatch(list, { fileName: 'download', size: 500 }, 'b')).toMatchObject({ waiting: true, item: { id: 'b' } });
    expect(findUnfinishedMatch(list, { fileName: 'download', size: 777 }, 'b')).toBeNull();
    expect(findUnfinishedMatch(list, { fileName: 'download', size: 0 }, 'b')?.item.id).toBe('b');
  });
});

describe('IDM-style categories', () => {
  it('sorts files like IDM does', () => {
    expect(classifyFile('a.zip').category).toBe('Compressed');
    expect(classifyFile('a.mp4').category).toBe('Video');
    expect(classifyFile('a.mp3').category).toBe('Music');
    expect(classifyFile('a.pdf').category).toBe('Documents');
    expect(classifyFile('a.exe').category).toBe('Programs');
    expect(classifyFile('a.unknown').category).toBe('General');
  });
  it('maps categories saved by older versions', () => {
    expect(normalizeCategory('Archives')).toBe('Compressed');
    expect(normalizeCategory('Applications')).toBe('Programs');
    expect(normalizeCategory('Other')).toBe('General');
    expect(normalizeCategory('Media', 'song.flac')).toBe('Music');
    expect(normalizeCategory('Video')).toBe('Video');
  });
  it('uses the user folder for a category, else <default>/<category>', () => {
    expect(categoryFolder('Video', '~/Downloads/KDM/')).toBe('~/Downloads/KDM/Video');
    expect(categoryFolder('Video', '~/Downloads/KDM', { Video: '/mnt/movies' })).toBe('/mnt/movies');
    expect(categoryFolder('Video', '~/d', { Video: '  ' })).toBe('~/d/Video');
    expect(categoryFolder('General', '~/Downloads/KDM/')).toBe('~/Downloads/KDM');
    expect(categoryFolder('General', '~/d', { General: '/x' })).toBe('/x');
  });
  it('popup folder lookup falls back to General', () => {
    const f = [{ name: 'General', folder: '/g' }, { name: 'Music', folder: '/m' }];
    expect(folderFor('Music', f)).toBe('/m');
    expect(folderFor('Nope', f)).toBe('/g');
    expect(categoryOfName('x.mp3')).toBe('Music');
  });
});

describe('progress window text', () => {
  it('shows percent, rate, time left and resume like IDM', () => {
    const r = progressRows(item());
    expect(r.resume).toBe('Yes');
    expect(r.rate).not.toBe('—');
    expect(r.downloaded).toContain('25');
    expect(percentOf(item())).toBe(25);
    expect(windowTitle(item())).toBe('25% a.zip');
  });
  it('unknown / paused / failed states', () => {
    expect(progressRows(item({ resumable: null, status: 'paused' })).resume).toBe('—');
    expect(progressRows(item({ status: 'paused' })).rate).toBe('—');
    expect(statusText(item({ status: 'failed', error: 'HTTP 404' }))).toBe('Error: HTTP 404');
    expect(percentOf(item({ status: 'completed', downloadedBytes: 0 }))).toBe(100);
    expect(fullPath(item({ destination: '~/x/', fileName: 'f.bin' }))).toBe('~/x/f.bin');
  });
});

describe('what the small windows get to see', () => {
  const base = { id: 'a', status: 'downloading', completedAt: null } as unknown as DownloadItem;
  it('browser downloads and every active one; finished ones only for a while', () => {
    const now = 1_000_000_000;
    const list = [
      { ...base, id: 'a', viaPopup: true },
      { ...base, id: 'b', viaPopup: false },
      { ...base, id: 'c', viaPopup: true, status: 'completed', completedAt: now - 60_000 },
      { ...base, id: 'd', viaPopup: true, status: 'completed', completedAt: now - 3 * 3_600_000 },
      { ...base, id: 'e', viaPopup: false, status: 'completed', completedAt: now - 60_000 },
    ] as DownloadItem[];
    expect(popupItems(list, new Map(), now).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
  it('carries the per-download "after completion" choice', () => {
    const out = popupItems([{ ...base, viaPopup: true }] as DownloadItem[], new Map([['a', 'folder' as const]]));
    expect(out[0].afterOpen).toBe('folder');
  });
  it('passes a torrent\'s main file along so the small windows pick the right icon', () => {
    const out = popupItems([{ ...base, viaPopup: true, mainFile: 'Office/Office.rar' }, { ...base, id: 'b', viaPopup: true }] as DownloadItem[], new Map());
    expect(out[0].mainFile).toBe('Office/Office.rar');
    expect('mainFile' in out[1]).toBe(false);
  });
});

describe('connection detail helpers', () => {
  it('segmentBar draws only the downloaded part of every segment, as percent of the file', () => {
    const { filled, marks } = segmentBar([[0, 250, 499], [500, 500, 999]], 1000);
    expect(filled).toEqual([{ left: 0, width: 25 }]);
    expect(marks).toEqual([50]);
  });
  it('segmentBar clamps a finished segment and ignores unknown totals', () => {
    expect(segmentBar([[0, 1000, 999]], 1000).filled).toEqual([{ left: 0, width: 100 }]);
    expect(segmentBar([[0, 5, 9]], 0)).toEqual({ filled: [], marks: [] });
  });
  it('pushHistory keeps a bounded window per connection', () => {
    let h: Record<number, number[]> = {};
    for (let i = 0; i < 50; i++) h = pushHistory(h, [{ n: 1, bytes: 0, speed: i, state: 'receiving' }, { n: 2, bytes: 0, speed: 1, state: 'receiving' }], 10);
    expect(h[1]).toHaveLength(10);
    expect(h[1][9]).toBe(49);
    expect(h[2]).toHaveLength(10);
  });
  it('sparkPoints stays inside the box', () => {
    expect(sparkPoints([], 100, 20)).toBe('0,20 100,20');
    const pts = sparkPoints([0, 10, 5], 100, 20).split(' ').map((p) => p.split(',').map(Number));
    expect(pts).toHaveLength(3);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(20);
    }
  });
});
