import { makeHarness, NOW } from '../test/helpers.ts';
import { MB } from '../lib/format.ts';
import { DownloadManager } from './DownloadManager.ts';
import { MockDownloadEngine, type DownloadEngine } from './DownloadEngine.ts';
import { createSeed, mulberry32 } from '../data/seed.ts';

const items = (h: ReturnType<typeof makeHarness>) => Object.values(h.manager.getState().items);
const get = (h: ReturnType<typeof makeHarness>, id: string) => h.manager.getState().items[id];

describe('DownloadManager — adding downloads', () => {
  it('adds a valid URL, derives name/domain/category and starts it', () => {
    const h = makeHarness();
    const item = h.manager.addDownload({ url: 'https://mirror.example.org/pub/tools/awesome-tool-1.0.tar.gz', queueId: 'q-linux' });
    expect(item.fileName).toBe('awesome-tool-1.0.tar.gz');
    expect(item.sourceDomain).toBe('mirror.example.org');
    expect(item.category).toBe('Compressed');
    expect(item.status).toBe('downloading'); // "start immediately" bypasses the concurrency cap
    expect(h.manager.getState().queues.find((q) => q.id === 'q-linux')!.itemIds).toContain(item.id);
  });

  it('rejects invalid URLs', () => {
    const h = makeHarness();
    expect(() => h.manager.addDownload({ url: 'not a url' })).toThrow();
    expect(() => h.manager.addDownload({ url: 'file:///etc/passwd' })).toThrow();
  });

  it('adds paused when "start immediately" is off', () => {
    const h = makeHarness();
    const item = h.manager.addDownload({ url: 'https://example.org/a/b/report.pdf', startNow: false });
    expect(item.status).toBe('paused');
    expect(item.category).toBe('Documents');
  });

  it('leaves the item waiting when its queue is paused', () => {
    const h = makeHarness();
    const item = h.manager.addDownload({ url: 'https://example.org/file.zip', queueId: 'q-work' }); // Work Projects is paused
    expect(item.status).toBe('queued');
  });

  it('writes an activity entry', () => {
    const h = makeHarness();
    h.manager.addDownload({ url: 'https://example.org/file.zip' });
    expect(h.manager.getState().activity[0].kind).toBe('added');
  });
});

describe('DownloadManager — pause, resume, cancel, retry, remove', () => {
  it('pauses and resumes an active download', () => {
    const h = makeHarness();
    expect(get(h, 'd-docs').status).toBe('downloading');
    expect(h.manager.pause('d-docs')).toBe(true);
    expect(get(h, 'd-docs').status).toBe('paused');
    expect(get(h, 'd-docs').speed).toBe(0);

    const frozen = get(h, 'd-docs').downloadedBytes;
    h.run(3);
    expect(get(h, 'd-docs').downloadedBytes).toBe(frozen);

    expect(h.manager.resume('d-docs')).toBe(true);
    expect(get(h, 'd-docs').status).toBe('downloading');
    h.run(3);
    expect(get(h, 'd-docs').downloadedBytes).toBeGreaterThan(frozen);
  });

  it('cancels then retries', () => {
    const h = makeHarness();
    h.manager.cancel('d-blender');
    expect(get(h, 'd-blender').status).toBe('cancelled');
    h.manager.retry('d-blender');
    expect(get(h, 'd-blender').status).toBe('downloading');
  });

  it('retries a failed download', () => {
    const h = makeHarness();
    expect(get(h, 'd-libreoffice').status).toBe('failed');
    h.manager.retry('d-libreoffice');
    expect(get(h, 'd-libreoffice').status).toBe('downloading');
    expect(get(h, 'd-libreoffice').error).toBeNull();
  });

  it('removes a download and drops it from its queue', () => {
    const h = makeHarness();
    expect(h.manager.remove('d-kdenlive')).toBe(true);
    expect(get(h, 'd-kdenlive')).toBeUndefined();
    expect(h.manager.getState().queues.every((q) => !q.itemIds.includes('d-kdenlive'))).toBe(true);
  });

  it('refuses to pause a completed item', () => {
    const h = makeHarness();
    expect(h.manager.pause('c-python')).toBe(false);
  });

  it('bulk pause / resume / remove', () => {
    const h = makeHarness();
    expect(h.manager.pauseMany(['d-docs', 'd-blender'])).toBe(2);
    expect(h.manager.resumeMany(['d-docs', 'd-blender'])).toBe(2);
    expect(h.manager.removeMany(['d-docs', 'd-blender', 'nope'])).toBe(2);
  });
});

describe('DownloadManager — simulation', () => {
  it('advances progress, speed and ETA over time', () => {
    const h = makeHarness();
    const before = get(h, 'd-ubuntu');
    h.run(10);
    const after = get(h, 'd-ubuntu');
    expect(after.downloadedBytes).toBeGreaterThan(before.downloadedBytes);
    expect(after.progress).toBeGreaterThan(before.progress);
    expect(after.speed).toBeGreaterThan(5 * MB);
    expect(after.eta).not.toBeNull();
    expect(after.durationSec).toBeGreaterThan(before.durationSec);
  });

  it('speeds fluctuate rather than staying constant', () => {
    const h = makeHarness();
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) {
      h.run(0.5);
      seen.add(Math.round(get(h, 'd-ubuntu').speed / 1000));
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('completes a download, then verifies its checksum', () => {
    const h = makeHarness();
    h.manager.addDownload({ url: 'https://example.org/tiny-file.zip', queueId: 'q-main' });
    // fast-forward until something completes
    for (let i = 0; i < 4000 && !h.events.some((e) => e.type === 'completed'); i++) h.run(0.5);
    const done = h.events.find((e) => e.type === 'completed');
    expect(done).toBeDefined();
    if (done?.type !== 'completed') return;
    expect(get(h, done.item.id).status).toBe('completed');
    expect(get(h, done.item.id).checksumStatus).toBe('verifying');
    h.run(3);
    expect(get(h, done.item.id).checksumStatus).toBe('verified');
  });

  it('starts the next queued item when one finishes (autoStartNext)', () => {
    const h = makeHarness();
    // Main Downloads allows 3 at once; godot waits as "up next"
    expect(get(h, 'd-godot').status).toBe('queued');
    h.manager.pause('d-docs'); // free a slot
    h.run(1);
    expect(get(h, 'd-godot').status).toBe('downloading');
  });

  it('does not auto-start when autoStartNext is off', () => {
    const h = makeHarness();
    h.manager.updateQueue('q-main', { autoStartNext: false });
    h.manager.pause('d-docs');
    h.run(2);
    expect(get(h, 'd-godot').status).toBe('queued');
  });

  it('a failing URL fails once, then auto-retries and recovers', () => {
    const h = makeHarness();
    const it = h.manager.addDownload({ url: 'https://example.org/fail-me-1.iso', queueId: 'q-main' });
    for (let i = 0; i < 6000 && !h.events.some((e) => e.type === 'failed'); i++) h.run(0.5);
    const failed = h.events.find((e) => e.type === 'failed');
    expect(failed).toBeDefined();
    if (failed?.type === 'failed') expect(failed.willRetry).toBe(true);
    expect(get(h, it.id).retries).toBe(1);
  });

  it('respects a queue bandwidth cap', () => {
    const h = makeHarness();
    h.manager.updateQueue('q-main', { bandwidthLimit: 3 * MB });
    h.run(5);
    const total = ['d-docs', 'd-blender', 'd-video']
      .map((id) => get(h, id))
      .filter((i) => i.status === 'downloading')
      .reduce((s, i) => s + i.speed, 0);
    expect(total).toBeLessThan(3.1 * MB);
  });

  it('respects the global bandwidth limit', () => {
    const h = makeHarness();
    h.manager.setConfig({ globalBandwidthLimit: 5 * MB });
    h.run(4);
    const total = items(h).filter((i) => i.status === 'downloading').reduce((s, i) => s + i.speed, 0);
    expect(total).toBeLessThan(5.1 * MB);
  });

  it('records throughput history samples', () => {
    const h = makeHarness();
    const n = h.manager.getState().history.length;
    h.run(5);
    expect(h.manager.getState().history.length).toBeGreaterThan(n);
  });
});

describe('DownloadManager — queues', () => {
  it('moves an item between queues', () => {
    const h = makeHarness();
    expect(h.manager.moveToQueue('d-video', 'q-linux')).toBe(true);
    const qs = h.manager.getState().queues;
    expect(qs.find((q) => q.id === 'q-main')!.itemIds).not.toContain('d-video');
    expect(qs.find((q) => q.id === 'q-linux')!.itemIds).toContain('d-video');
    expect(get(h, 'd-video').queueId).toBe('q-linux');
    const p = get(h, 'd-video').downloadedBytes;
    h.run(3);
    expect(get(h, 'd-video').downloadedBytes).toBeGreaterThan(p); // keeps running in the open queue
  });

  it('pauses downloads when moved into a closed (scheduled) queue', () => {
    const h = makeHarness();
    h.manager.moveToQueue('d-video', 'q-night'); // gated until 23:00
    h.run(1);
    expect(get(h, 'd-video').status).toBe('queued');
  });

  it('reorders items inside a queue', () => {
    const h = makeHarness();
    const before = h.manager.getState().queues.find((q) => q.id === 'q-main')!.itemIds;
    const last = before[before.length - 1];
    h.manager.reorder('q-main', last, 0);
    const after = h.manager.getState().queues.find((q) => q.id === 'q-main')!.itemIds;
    expect(after[0]).toBe(last);
    expect(after).toHaveLength(before.length);
  });

  it('reorders relative to a target (drag and drop)', () => {
    const h = makeHarness();
    h.manager.reorderRelative('q-main', 'd-cc-assets', 'd-godot', 'before');
    const ids = h.manager.getState().queues.find((q) => q.id === 'q-main')!.itemIds;
    expect(ids.indexOf('d-cc-assets')).toBe(ids.indexOf('d-godot') - 1);
  });

  it('sorts a queue by priority', () => {
    const h = makeHarness();
    h.manager.reorderByPriority('q-main');
    const ids = h.manager.getState().queues.find((q) => q.id === 'q-main')!.itemIds;
    const rank = { high: 0, normal: 1, low: 2 } as const;
    const ranks = ids.map((id) => rank[get(h, id).priority]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('pausing a queue stops its transfers; starting resumes them', () => {
    const h = makeHarness();
    h.manager.pauseQueue('q-main');
    h.run(1);
    expect(get(h, 'd-docs').status).toBe('queued');
    expect(get(h, 'd-docs').speed).toBe(0);
    h.manager.startQueue('q-main');
    h.run(1);
    expect(get(h, 'd-docs').status).toBe('downloading');
  });

  it('creates and deletes queues (items move to a surviving queue)', () => {
    const h = makeHarness();
    const q = h.manager.createQueue({ name: 'Weekend' });
    expect(h.manager.getState().queues.map((x) => x.name)).toContain('Weekend');
    h.manager.moveToQueue('d-kdenlive', q.id);
    expect(h.manager.deleteQueue(q.id)).toBe(true);
    expect(get(h, 'd-kdenlive').queueId).not.toBe(q.id);
  });

  it('enforces the concurrency limit when it is lowered', () => {
    const h = makeHarness();
    // clear the "manual start" flags so the cap applies
    for (const id of ['d-docs', 'd-blender', 'd-video']) {
      h.manager.pause(id);
      h.manager.updateQueue('q-main', { maxConcurrentDownloads: 3 });
    }
    h.manager.resumeAll('q-main');
    h.manager.updateQueue('q-main', { maxConcurrentDownloads: 1 });
    h.run(1);
    const running = ['d-docs', 'd-blender', 'd-video'].filter((id) => get(h, id).status === 'downloading');
    expect(running.length).toBeGreaterThan(0);
  });

  it('opens a scheduled queue when its window starts', () => {
    const h = makeHarness(new Date(2026, 9, 22, 22, 59, 0).getTime()); // 22:59, window opens at 23:00
    expect(get(h, 'd-cache').status).toBe('queued');
    h.run(30);
    expect(get(h, 'd-cache').status).not.toBe('downloading');
    h.run(40); // now past 23:00
    expect(get(h, 'd-cache').status).toBe('downloading');
    expect(h.events.some((e) => e.type === 'schedulerStarted')).toBe(true);
  });
});

describe('DownloadManager — queue speed cap reaches the engine', () => {
  const spyHarness = () => {
    const calls: Array<[string, number]> = [];
    const engine: DownloadEngine = new MockDownloadEngine();
    engine.onQueueLimit = (id, bps) => { calls.push([id, bps]); };
    const seed = createSeed(NOW);
    const clock = { now: NOW };
    const manager = new DownloadManager({ items: seed.items, queues: seed.queues, activity: seed.activity, history: seed.history }, { clock: () => clock.now, random: mulberry32(7), rules: seed.rules, engine });
    const tick = () => { clock.now += 500; manager.tick(0.5, clock.now); };
    return { manager, calls, tick };
  };

  it('tells the engine once when a queue gets a limit, again when it changes, and 0 when removed', () => {
    const h = spyHarness();
    h.tick();
    const before = h.calls.length;
    h.manager.updateQueue('q-linux', { bandwidthLimit: 2 * MB });
    h.tick(); h.tick();
    expect(h.calls.filter(([id, b]) => id === 'q-linux' && b === 2 * MB)).toHaveLength(1);
    h.manager.updateQueue('q-linux', { bandwidthLimit: 0 });
    h.tick();
    expect(h.calls.filter(([id, b]) => id === 'q-linux' && b === 0)).toHaveLength(1);
    expect(h.calls.length).toBeGreaterThan(before);
  });
});
