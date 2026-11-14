import { categoryBreakdown, computeTotals, filterDownloads, inLibraryRange, sortDownloads } from './selectors.ts';
import { StorageService, MemoryStore } from './StorageService.ts';
import { createSeed } from '../data/seed.ts';
import { defaultSettings } from '../data/defaults.ts';
import { NOW } from '../test/helpers.ts';

const seed = createSeed(NOW);

describe('filtering & search', () => {
  it('searches by name, domain and category (case-insensitive)', () => {
    expect(filterDownloads(seed.items, { query: 'UBUNTU' }).map((i) => i.id)).toContain('d-ubuntu');
    expect(filterDownloads(seed.items, { query: 'blender.org' }).length).toBeGreaterThan(0);
    expect(filterDownloads(seed.items, { query: 'documents' }).every((i) => i.category === 'Documents' || i.fileName.toLowerCase().includes('documents') || i.url.toLowerCase().includes('documents') || i.destination.toLowerCase().includes('documents') || i.sourceDomain.includes('documents'))).toBe(true);
    expect(filterDownloads(seed.items, { query: 'zzzz-no-match' })).toHaveLength(0);
  });

  it('filters by status, category and queue', () => {
    const downloading = filterDownloads(seed.items, { status: 'downloading' });
    expect(downloading.length).toBe(4);
    expect(downloading.every((i) => i.status === 'downloading')).toBe(true);
    expect(filterDownloads(seed.items, { status: 'failed' }).map((i) => i.id)).toEqual(['d-libreoffice']);
    expect(filterDownloads(seed.items, { category: 'Programs' }).every((i) => i.category === 'Programs')).toBe(true);
    expect(filterDownloads(seed.items, { queueId: 'q-work' }).every((i) => i.queueId === 'q-work')).toBe(true);
    const active = filterDownloads(seed.items, { status: 'active' });
    expect(active.every((i) => i.status === 'downloading' || i.status === 'queued')).toBe(true);
  });

  it('combines filters', () => {
    const r = filterDownloads(seed.items, { status: 'completed', category: 'Documents', query: 'pdf' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.fileName.toLowerCase().includes('pdf') || i.url.includes('pdf'))).toBe(true);
  });
});

describe('sorting', () => {
  it('sorts by name asc / size desc / speed desc', () => {
    const byName = sortDownloads(seed.items, 'name', 'asc').map((i) => i.fileName);
    expect([...byName].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))).toEqual(byName);
    const bySize = sortDownloads(seed.items, 'size', 'desc');
    expect(bySize[0].totalBytes).toBeGreaterThanOrEqual(bySize[1].totalBytes);
    const bySpeed = sortDownloads(seed.items, 'speed', 'desc');
    expect(bySpeed[0].speed).toBeGreaterThanOrEqual(bySpeed[1].speed);
  });

  it('sorts by status so running items lead', () => {
    expect(sortDownloads(seed.items, 'status', 'asc')[0].status).toBe('downloading');
  });
});

describe('totals & library helpers', () => {
  it('computes dashboard totals', () => {
    const t = computeTotals(seed.items, NOW);
    expect(t.active).toBe(4);
    expect(t.connections).toBe(8 + 3 + 6 + 4);
    expect(t.speed).toBeGreaterThan(0);
    expect(t.eta).toBeGreaterThan(0);
    expect(t.completedToday).toBeGreaterThanOrEqual(3);
    expect(t.failed).toBe(1);
  });

  it('applies library date ranges', () => {
    const done = seed.items.filter((i) => i.status === 'completed');
    const week = done.filter((i) => inLibraryRange(i.completedAt, 'week', NOW));
    const older = done.filter((i) => inLibraryRange(i.completedAt, 'older', NOW));
    expect(week.length).toBeGreaterThan(0);
    expect(older.length).toBeGreaterThan(0);
    expect(week.length + older.length).toBeLessThanOrEqual(done.length);
  });

  it('breaks storage down by category and sums to ~100%', () => {
    const slices = categoryBreakdown(seed.items.filter((i) => i.status === 'completed'));
    const total = slices.reduce((s, x) => s + x.percent, 0);
    expect(Math.round(total)).toBe(100);
  });
});

describe('StorageService (settings persistence)', () => {
  it('round-trips JSON and survives a "restart"', () => {
    const backing = new MemoryStore();
    const a = new StorageService(backing);
    a.write('settings', { ...defaultSettings, theme: 'light', maxConnections: 12 });
    const b = new StorageService(backing); // new instance, same backing store
    const loaded = b.read('settings', defaultSettings);
    expect(loaded.theme).toBe('light');
    expect(loaded.maxConnections).toBe(12);
  });

  it('falls back when data is missing or corrupt', () => {
    const backing = new MemoryStore();
    backing.setItem('kelmo:v1:settings', '{not json');
    const s = new StorageService(backing);
    expect(s.read('settings', defaultSettings).theme).toBe('dark');
    expect(s.read('missing', 42)).toBe(42);
  });
});
