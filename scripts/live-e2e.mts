// End-to-end check of the live pipeline without Electron:
// DownloadManager → RealDownloadEngine → (bridge) → engine host → real HTTP server → disk.
// Run: npm run test:live
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DownloadManager } from '../src/services/DownloadManager.ts';
import { RealDownloadEngine, type EngineBridge, type EngineEvent } from '../src/services/RealDownloadEngine.ts';
import { createSeed } from '../src/data/seed.ts';
// @ts-expect-error plain ESM JS
import { createHost } from '../engine/host.mjs';

const SIZE = 10 * 1024 * 1024;
const DATA = crypto.randomBytes(SIZE);
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

const srv = http.createServer((req, res) => {
  if (req.url?.startsWith('/missing')) { res.writeHead(404); return res.end(); }
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  let s = 0, e = SIZE - 1, code = 200;
  const h: Record<string, string | number> = { etag: '"v1"', 'accept-ranges': 'bytes' };
  if (m) { s = +m[1]; e = m[2] ? Math.min(+m[2], SIZE - 1) : SIZE - 1; code = 206; h['content-range'] = `bytes ${s}-${e}/${SIZE}`; }
  h['content-length'] = e - s + 1;
  res.writeHead(code, h);
  let pos = s;
  const pump = () => { // ~1.3 MB/s per connection so pause/resume is observable
    if (res.destroyed) return;
    if (pos > e) return void res.end();
    const n = Math.min(64 * 1024, e - pos + 1);
    res.write(DATA.subarray(pos, pos + n)); pos += n;
    setTimeout(pump, 50);
  };
  pump();
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;

// bridge = host, in-process
const listeners = new Set<(e: EngineEvent) => void>();
const host = createHost((ev: EngineEvent) => listeners.forEach((l) => l(ev)));
const bridge: EngineBridge = {
  start: async (spec) => (await host.start(spec), true),
  pause: async (id) => (host.pause(id), true),
  cancel: async (id, loc) => (await host.cancel(id, loc), true),
  setSpeedLimit: async (id, b) => (host.setSpeedLimit(id, b), true),
  setGlobalLimit: async (b) => (host.setGlobalLimit(b), true),
  onEvent: (cb) => (listeners.add(cb), () => listeners.delete(cb)),
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-live-'));
const seed = createSeed();
const mgr = new DownloadManager(
  { items: [], queues: seed.queues.map((q) => ({ ...q, itemIds: [] })), activity: [], history: [] },
  { engine: new RealDownloadEngine(bridge), config: { defaultFolder: dir, simulateVerification: false } },
);
const events: string[] = [];
mgr.onEvent((e) => events.push(e.type));

let last = Date.now();
const tick = () => { const n = Date.now(); mgr.tick((n - last) / 1000, n); last = n; };
const until = async (cond: () => boolean, ms = 20000, what = 'condition') => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what + ' ' + JSON.stringify(Object.values(mgr.getState().items).map((i) => [i.status, i.progress.toFixed(0), i.error]))); tick(); await new Promise((r) => setTimeout(r, 100)); }
};
const item = (id: string) => mgr.getState().items[id];

// 1) happy path: complete + byte-exact + real size learned from the server
const a = mgr.addDownload({ url: `${base}/files/sample.bin`, destination: dir, startNow: true });
await until(() => item(a.id).status === 'completed', 20000, 'completion');
assert.equal(item(a.id).totalBytes, SIZE, 'size synced from server');
assert.equal(sha(fs.readFileSync(path.join(dir, 'sample.bin'))), sha(DATA), 'file is byte-exact');
assert.ok(events.includes('completed'));
console.log('✔ download completes, size synced, file byte-exact');

// 1b) same URL again → saved as "sample (1).bin", the first file is untouched; checksum is not faked
const a2 = mgr.addDownload({ url: `${base}/files/sample.bin`, destination: dir, startNow: true });
await until(() => item(a2.id).status === 'completed', 20000, 'duplicate completion');
assert.equal(item(a2.id).fileName, 'sample (1).bin', 'name collision gets a suffix');
assert.ok(fs.existsSync(path.join(dir, 'sample.bin')) && fs.existsSync(path.join(dir, 'sample (1).bin')));
assert.equal(item(a.id).checksumStatus, 'none', 'live mode must not fake a verified checksum');
console.log('✔ duplicate name → "sample (1).bin"; checksum honestly "none"');

// 2) pause → resume continues and finishes correctly
const b = mgr.addDownload({ url: `${base}/files/second.bin`, destination: dir, startNow: true, connections: 2 });
await until(() => item(b.id).progress > 15 && item(b.id).status === 'downloading', 20000, 'progress > 15%');
mgr.pause(b.id);
await new Promise((r) => setTimeout(r, 400)); tick();
const pausedAt = item(b.id).downloadedBytes;
assert.equal(item(b.id).status, 'paused');
await new Promise((r) => setTimeout(r, 500)); tick();
assert.ok(item(b.id).downloadedBytes <= pausedAt + 256 * 1024, 'no progress while paused');
mgr.resume(b.id);
await until(() => item(b.id).status === 'completed', 20000, 'resume completion');
assert.equal(sha(fs.readFileSync(path.join(dir, 'second.bin'))), sha(DATA), 'resumed file byte-exact');
console.log('✔ pause / resume works and the file is still byte-exact');

// 3) HTTP error → failed with a useful message
const c = mgr.addDownload({ url: `${base}/missing.bin`, destination: dir, startNow: true });
mgr.updateQueue(mgr.getState().queues[0].id, { retryFailed: false });
await until(() => item(c.id).status === 'failed', 20000, 'failure');
assert.match(String(item(c.id).error), /404/);
console.log('✔ HTTP 404 → failed with message:', item(c.id).error);

// 4) removing a paused download deletes its .part/.kdm leftovers, but never a finished file
const d = mgr.addDownload({ url: `${base}/files/third.bin`, destination: dir, startNow: true, connections: 2 });
await until(() => item(d.id).progress > 10 && item(d.id).status === 'downloading', 20000, 'third progress');
mgr.pause(d.id);
await new Promise((r) => setTimeout(r, 500)); tick();
assert.ok(fs.existsSync(path.join(dir, 'third.bin.part')) && fs.existsSync(path.join(dir, 'third.bin.kdm')), 'partials exist while paused');
mgr.remove(d.id);
await new Promise((r) => setTimeout(r, 300));
assert.ok(!fs.existsSync(path.join(dir, 'third.bin.part')) && !fs.existsSync(path.join(dir, 'third.bin.kdm')), 'partials removed with the item');
mgr.remove(a.id); // finished file must survive removal from the list
await new Promise((r) => setTimeout(r, 300));
assert.ok(fs.existsSync(path.join(dir, 'sample.bin')), 'completed file is never deleted');
console.log('✔ remove cleans .part/.kdm leftovers and keeps finished files');

srv.closeAllConnections?.(); srv.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log('\nLIVE PIPELINE OK');
process.exit(0);
