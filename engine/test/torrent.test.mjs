import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { isMagnet, isTorrentUrl, magnetName, TorrentDownload } from '../torrent.mjs';
import { createHost } from '../host.mjs';

const MAGNET = 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=Zorin%20OS%2017&tr=udp%3A%2F%2Ftracker.example%3A80';

/** A stand-in for the WebTorrent client: metadata after a moment, then progress, then done. */
function fakeClientFactory(log = [], { neverMetadata = false, doneMs = 80 } = {}) {
  return () => {
    const client = new EventEmitter();
    client.throttleDownload = (r) => log.push(['throttle', r]);
    client.destroy = (cb) => { log.push(['client.destroy']); cb && cb(); };
    client.add = (source, o) => {
      log.push(['add', typeof source === 'string' ? source : 'buffer', o.path]); log.push(['announce', (o.announce || []).length]);
      const t = new EventEmitter();
      Object.assign(t, { length: 1000, name: 'Zorin OS 17', downloaded: 0, downloadSpeed: 0, timeRemaining: Infinity, numPeers: 0, metadata: null, ready: false });
      t.destroy = (opts, cb) => { log.push(['torrent.destroy', !!(opts && opts.destroyStore)]); cb && cb(); };
      if (!neverMetadata) {
        setTimeout(() => { t.metadata = Buffer.alloc(1); t.emit('metadata'); t.numPeers = 3; t.downloaded = 400; t.downloadSpeed = 800; t.timeRemaining = 1500; }, 20);
        setTimeout(() => { t.downloaded = 1000; t.emit('done'); }, doneMs);
      }
      return t;
    };
    return client;
  };
}
const waitFor = (d, status, ms = 3000) => new Promise((res, rej) => {
  if (d.status === status) return res();
  const t = setTimeout(() => rej(new Error(`timeout waiting for ${status}, is ${d.status}: ${d.error}`)), ms);
  const on = (s) => { if (s === status) { clearTimeout(t); d.off('state', on); res(); } };
  d.on('state', on);
});

test('which links are torrents', () => {
  assert.equal(isMagnet(MAGNET), true);
  assert.equal(isTorrentUrl('https://example.org/files/linux.torrent'), true);
  assert.equal(isTorrentUrl('https://example.org/files/linux.torrent?x=1'), true);
  for (const u of ['magnet:?dn=nothing', 'magnet:', 'https://example.org/a.iso', 'ftp://example.org/a.torrent', 'javascript:alert(1)', '', null]) assert.equal(isTorrentUrl(u), false, String(u));
  assert.equal(magnetName(MAGNET), 'Zorin OS 17');
  assert.equal(magnetName('magnet:?xt=urn:btih:abc&dn=..%2F..%2Fetc'), '.._.._etc');
  assert.equal(magnetName('magnet:?xt=urn:btih:abc'), '');
});

test('a magnet link downloads: connecting → downloading (name and size) → completed', async () => {
  const log = [];
  const d = new TorrentDownload({ url: MAGNET, dir: '/tmp/x', clientFactory: fakeClientFactory(log) });
  assert.equal(d.fileName, 'Zorin OS 17');
  const states = []; const progress = [];
  d.on('state', (s) => states.push(s)); d.on('progress', (p) => progress.push(p));
  void d.start();
  await waitFor(d, 'completed');
  assert.equal(d.total, 1000);
  assert.deepEqual([...new Set(states)], ['connecting', 'downloading', 'completed']);
  assert.ok(progress.some((p) => p.connections === 3 && p.speed === 800 && p.eta === 2));
  assert.equal(progress.at(-1).downloaded, 1000);
  assert.deepEqual(log.find((l) => l[0] === 'add'), ['add', MAGNET, '/tmp/x']);
  assert.ok(log.some((l) => l[0] === 'client.destroy'), 'the client is closed, no seeding');
  assert.ok(log.find((l) => l[0] === 'announce')[1] >= 5, 'public trackers are added to magnet links');
});

test('pause keeps the files; cancel before the end deletes what was downloaded', async () => {
  const log = [];
  const d = new TorrentDownload({ url: MAGNET, dir: '/tmp/x', clientFactory: fakeClientFactory(log, { doneMs: 5000 }) });
  void d.start();
  await new Promise((r) => setTimeout(r, 40));
  d.pause();
  await waitFor(d, 'paused');
  assert.ok(!log.some((l) => l[0] === 'torrent.destroy'));
  void d.start(); // resume = add again; the library re-checks the files
  await new Promise((r) => setTimeout(r, 40));
  await d.cancel();
  assert.equal(d.status, 'cancelled');
  assert.ok(log.some((l) => l[0] === 'torrent.destroy' && l[1] === true));
});

test('no metadata in time → a clear failure', async () => {
  const d = new TorrentDownload({ url: MAGNET, dir: '/tmp/x', metadataTimeoutMs: 60, clientFactory: fakeClientFactory([], { neverMetadata: true }) });
  void d.start();
  await waitFor(d, 'failed');
  assert.match(d.error, /No sources found/);
});

test('without a limit the library is never asked to throttle (0 or -1 could stall it)', async () => {
  const log = [];
  const d = new TorrentDownload({ url: MAGNET, dir: '/tmp/x', clientFactory: fakeClientFactory(log) });
  void d.start();
  await waitFor(d, 'completed');
  assert.deepEqual(log.filter((l) => l[0] === 'throttle'), []);
});

test('the smallest speed limit wins and reaches the client', async () => {
  const log = [];
  const d = new TorrentDownload({ url: MAGNET, dir: '/tmp/x', speedLimit: 500_000, clientFactory: fakeClientFactory(log) });
  void d.start();
  await waitFor(d, 'downloading');
  assert.deepEqual(log.find((l) => l[0] === 'throttle'), ['throttle', 500_000]);
  d.setSpeedLimit(0);
  assert.deepEqual(log.filter((l) => l[0] === 'throttle').at(-1), ['throttle', 1_000_000_000]);
  await d.cancel();
});

test('a missing library gives advice, not a stack trace', async () => {
  const d = new TorrentDownload({ url: MAGNET, dir: '/tmp/x', clientFactory: () => { throw new Error("Cannot find package 'webtorrent' imported from x"); } });
  void d.start();
  await waitFor(d, 'failed');
  assert.match(d.error, /npm install/);
});

test('a .torrent link is fetched and handed over as a file', async () => {
  const body = Buffer.concat([Buffer.from('d4:infod4:name3:abce'), Buffer.from('e')]);
  const srv = http.createServer((req, res) => { res.end(body); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const log = [];
  const d = new TorrentDownload({ url: `http://127.0.0.1:${srv.address().port}/a.torrent`, dir: '/tmp/x', clientFactory: fakeClientFactory(log) });
  void d.start();
  await waitFor(d, 'completed');
  srv.close();
  assert.deepEqual(log.find((l) => l[0] === 'add'), ['add', 'buffer', '/tmp/x']);
});

test('host: a magnet link starts a torrent and reports name, size and completion', async () => {
  const events = [];
  const host = createHost((e) => events.push(e), { torrentClient: fakeClientFactory() });
  await host.start({ id: 't1', url: MAGNET, dir: '/tmp/x' });
  await new Promise((r) => setTimeout(r, 250));
  const states = events.filter((e) => e.type === 'state');
  assert.equal(states.at(-1).status, 'completed');
  assert.equal(states.at(-1).fileName, 'Zorin OS 17');
  assert.equal(states.at(-1).total, 1000);
  assert.equal(host.activeCount(), 0);
  await assert.rejects(host.start({ id: 't2', url: 'magnet:?dn=x', dir: '/tmp/x' }), /Invalid/);
});

test('a .torrent file on this computer ("Open with KDM") is read and handed over', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-t-'));
  const good = path.join(dir, 'Zorin OS.torrent');
  fs.writeFileSync(good, Buffer.from('d4:infod4:name3:abcee'));
  const bad = path.join(dir, 'fake.torrent');
  fs.writeFileSync(bad, 'hello');
  assert.equal(isTorrentUrl(pathToFileURL(good).href), true);
  assert.equal(isTorrentUrl(pathToFileURL(path.join(dir, 'a.txt')).href), false);
  const log = [];
  const d = new TorrentDownload({ url: pathToFileURL(good).href, dir: '/tmp/x', clientFactory: fakeClientFactory(log) });
  void d.start();
  await waitFor(d, 'completed');
  assert.deepEqual(log.find((l) => l[0] === 'add'), ['add', 'buffer', '/tmp/x']);
  const b = new TorrentDownload({ url: pathToFileURL(bad).href, dir: '/tmp/x', clientFactory: fakeClientFactory([]) });
  void b.start();
  await waitFor(b, 'failed');
  assert.match(b.error, /not a valid/);
  const m = new TorrentDownload({ url: pathToFileURL(path.join(dir, 'gone.torrent')).href, dir: '/tmp/x', clientFactory: fakeClientFactory([]) });
  void m.start();
  await waitFor(m, 'failed');
  assert.match(m.error, /not found/);
  fs.rmSync(dir, { recursive: true });
});
