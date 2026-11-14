import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Download, Limiter } from '../download.mjs';

const SIZE = 12 * 1024 * 1024;
const DATA = crypto.randomBytes(SIZE);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function serve({ ranges = true, perConnBps = 0, deny = false, wrongSize = false } = {}) {
  const stats = { connections: 0, bytes: 0, cookies: [] };
  const srv = http.createServer((req, res) => {
    stats.connections++;
    stats.cookies.push(req.headers.cookie);
    if (deny) { res.writeHead(503); res.end(); return; }
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    let start = 0, end = SIZE - 1, code = 200;
    const h = { 'content-type': 'application/octet-stream', etag: '"v1"', 'content-disposition': 'attachment; filename="sample file.bin"' };
    if (ranges) h['accept-ranges'] = 'bytes';
    if (ranges && m) { start = +m[1]; end = m[2] ? Math.min(+m[2], SIZE - 1) : SIZE - 1; code = 206; h['content-range'] = `bytes ${start}-${end}/${wrongSize ? SIZE + 5 : SIZE}`; }
    h['content-length'] = end - start + 1;
    res.writeHead(code, h);
    let pos = start;
    const pump = () => {
      while (pos <= end) {
        const n = Math.min(64 * 1024, end - pos + 1);
        const ok = res.write(DATA.subarray(pos, pos + n)); pos += n; stats.bytes += n;
        if (perConnBps) { setTimeout(pump, (n / perConnBps) * 1000); return; }
        if (!ok) { res.once('drain', pump); return; }
      }
      res.end();
    };
    pump();
    res.on('close', () => { pos = end + 1; });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, stats, url: `http://127.0.0.1:${srv.address().port}/x` })));
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-'));
const done = (d) => new Promise((r) => d.on('state', (s) => ['completed', 'failed', 'paused', 'cancelled'].includes(s) && r(s)));

test('segmented download is byte-exact and uses several connections', async () => {
  const { srv, stats, url } = await serve();
  const dir = tmp(); const d = new Download({ url, dir, connections: 6 });
  const p = done(d); d.start();
  assert.equal(await p, 'completed');
  assert.equal(d.fileName, 'sample file.bin');
  assert.equal(sha(fs.readFileSync(path.join(dir, d.fileName))), sha(DATA));
  assert.ok(d.peakConnections > 1, 'peak connections ' + d.peakConnections);
  assert.ok(!fs.existsSync(d.part) && !fs.existsSync(d.statePath));
  srv.close();
});

test('dynamic segmentation: idle connections split the slowest segment', async () => {
  const { srv, stats, url } = await serve({ perConnBps: 6 * 1024 * 1024 });
  const dir = tmp(); const d = new Download({ url, dir, connections: 2, minSplit: 128 * 1024 });
  // start with 2 segments; one finishes only after splitting happens → connections > initial
  const p = done(d); d.start(); assert.equal(await p, 'completed');
  assert.equal(sha(fs.readFileSync(path.join(dir, d.fileName))), sha(DATA));
  assert.ok(d.segments.length >= 2);
  srv.close();
});

test('pause persists state and resume continues without restarting', async () => {
  const { srv, url } = await serve({ perConnBps: 4 * 1024 * 1024 });
  const dir = tmp();
  let d = new Download({ url, dir, connections: 4 });
  d.start();
  await new Promise((r) => setTimeout(r, 700));
  const p1 = done(d); d.pause(); assert.equal(await p1, 'paused');
  const mid = d.downloaded; assert.ok(mid > 0 && mid < SIZE, 'mid=' + mid);
  assert.ok(fs.existsSync(d.statePath));
  d = new Download({ url, dir, connections: 4 });   // simulates app restart
  const p2 = done(d); d.start(); assert.equal(await p2, 'completed');
  assert.equal(sha(fs.readFileSync(path.join(dir, d.fileName))), sha(DATA));
  srv.close();
});

test('server without range support falls back to a single stream', async () => {
  const { srv, url } = await serve({ ranges: false });
  const dir = tmp(); const d = new Download({ url, dir, connections: 8 });
  const p = done(d); d.start(); assert.equal(await p, 'completed');
  assert.equal(d.rangeOk, false); assert.equal(d.peakConnections, 1);
  assert.equal(sha(fs.readFileSync(path.join(dir, d.fileName))), sha(DATA));
  srv.close();
});

test('speed limit is respected', async () => {
  const { srv, url } = await serve();
  const dir = tmp(); const limit = 4 * 1024 * 1024; // 4 MB/s → ~3s for 12 MB
  const d = new Download({ url, dir, connections: 4, speedLimit: limit });
  const t0 = Date.now(); const p = done(d); d.start(); await p;
  const secs = (Date.now() - t0) / 1000;
  assert.ok(secs > 1.8, `finished too fast: ${secs}s`);
  srv.close();
});

test('cancel removes partial files; bad URL fails with message', async () => {
  const { srv, url } = await serve({ perConnBps: 2 * 1024 * 1024 });
  const dir = tmp(); const d = new Download({ url, dir });
  d.start(); await new Promise((r) => setTimeout(r, 400));
  const p = done(d); await d.cancel(); assert.equal(await p, 'cancelled');
  assert.deepEqual(fs.readdirSync(dir), []);
  srv.close();
  const bad = new Download({ url: 'http://127.0.0.1:1/nope', dir: tmp(), retries: 0 });
  const p2 = done(bad); bad.start(); assert.equal(await p2, 'failed'); assert.ok(bad.error);
});

test('_claim splits the largest busy segment when nothing is unclaimed', () => {
  const d = new Download({ url: 'http://x/', dir: '.', minSplit: 100 });
  d.segments = [{ start: 0, pos: 900, end: 999, busy: true }, { start: 1000, pos: 1000, end: 4999, busy: true }];
  const s = d._claim();
  assert.deepEqual([s.start, s.end], [3000, 4999]);
  assert.equal(d.segments[1].end, 2999);
  d.segments = [{ start: 0, pos: 900, end: 999, busy: true }];
  assert.equal(d._claim(), null); // tails smaller than 2*minSplit are never split
});

test('shared (global) limiter throttles a download on its own', async () => {
  const { srv, url } = await serve();
  const dir = tmp(); const shared = new Limiter(5 * 1024 * 1024); // 5 MB burst, then 5 MB/s → ≈1.4 s
  const d = new Download({ url, dir, connections: 4, sharedLimiter: shared });
  const t0 = Date.now(); const p = done(d); d.start(); assert.equal(await p, 'completed');
  assert.ok((Date.now() - t0) / 1000 > 1.0, "should be throttled (burst 5MB, then 5MB/s)");
  srv.close();
});

test('custom headers (cookie / referer) reach the server on every request', async () => {
  const seen = [];
  const { srv, url } = await new Promise((r) => {
    const s = http.createServer((req, res) => {
      seen.push({ cookie: req.headers.cookie, referer: req.headers.referer, ua: req.headers['user-agent'] });
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      const start = m ? +m[1] : 0, end = m && m[2] ? +m[2] : 999;
      res.writeHead(206, { 'content-range': `bytes ${start}-${end}/1000`, 'content-length': end - start + 1, 'content-disposition': 'attachment; filename="s.bin"' });
      res.end(Buffer.alloc(end - start + 1, 1));
    });
    s.listen(0, '127.0.0.1', () => r({ srv: s, url: `http://127.0.0.1:${s.address().port}/f` }));
  });
  const dir = tmp();
  const d = new Download({ url, dir, connections: 2, headers: { cookie: 'sid=abc', referer: 'https://site.example/page', 'user-agent': 'KDM-test' } });
  await d.start();
  srv.close();
  assert.equal(d.status, 'completed');
  assert.ok(seen.length >= 2);
  for (const s of seen) assert.deepEqual(s, { cookie: 'sid=abc', referer: 'https://site.example/page', ua: 'KDM-test' });
});

test('probeUrl reports size, real file name, resume support and content type without downloading', async () => {
  const { probeUrl } = await import('../download.mjs');
  const { srv, url } = await serve({ ranges: true });
  const a = await probeUrl(url);
  assert.equal(a.size, SIZE);
  assert.equal(a.rangeOk, true);
  assert.equal(a.fileName, 'sample file.bin');
  assert.equal(a.contentType, 'application/octet-stream');
  srv.close();
  const s2 = await serve({ ranges: false });
  const b = await probeUrl(s2.url);
  assert.equal(b.size, SIZE);
  assert.equal(b.rangeOk, false);
  s2.srv.close();
  await assert.rejects(() => probeUrl('http://127.0.0.1:1/none', {}, 1500));
});

test('checkLink: alive, HTTP error and unreachable are told apart and it never throws', async () => {
  const { checkLink } = await import('../download.mjs');
  const { srv, url } = await serve({ ranges: true });
  const a = await checkLink(url);
  assert.equal(a.ok, true); assert.equal(a.size, SIZE); assert.equal(a.rangeOk, true); assert.ok(a.ms >= 0);
  srv.close();
  const gone = http.createServer((q, r) => { r.writeHead(403); r.end(); });
  await new Promise((r) => gone.listen(0, '127.0.0.1', r));
  const b = await checkLink(`http://127.0.0.1:${gone.address().port}/x.zip`);
  gone.close();
  assert.deepEqual([b.ok, b.status], [false, 403]);
  const c = await checkLink('http://127.0.0.1:1/none', {}, 1500);
  assert.deepEqual([c.ok, c.status, c.error], [false, 0, 'unreachable']);
});

test('progress carries real per-connection detail: segments cover the file, workers report bytes and state', async () => {
  const { srv, url } = await serve({ ranges: true, perConnBps: 4 * 1024 * 1024 });
  const dir = tmp();
  const d = new Download({ url, dir, connections: 4 });
  let last = null, sawReceiving = false;
  d.on('progress', (p) => { last = p.detail; if (p.detail.workers.some((w) => w.state === 'receiving')) sawReceiving = true; });
  await d.start();
  srv.close();
  assert.equal(d.status, 'completed');
  assert.ok(sawReceiving, 'a worker was seen receiving data');
  assert.ok(last.segments.length >= 1);
  // segments are ordered, never overlap, and stay inside the file
  let prevEnd = -1;
  for (const [start, pos, end] of last.segments) {
    assert.ok(start > prevEnd && pos >= start && end < SIZE + 1);
    prevEnd = end;
  }
  const bytes = last.workers.reduce((a, w) => a + w.bytes, 0);
  assert.ok(bytes <= SIZE && bytes > 0, `workers account for the transfer (${bytes})`);
  assert.deepEqual(last.workers.map((w) => w.n), last.workers.map((w) => w.n).sort((a, b) => a - b));
});

test('mirrors: the file comes from several sources, byte-exact, and the faster one does more of the work', async () => {
  const slow = await serve({ perConnBps: 1 * 1024 * 1024 });
  const fast = await serve({ perConnBps: 8 * 1024 * 1024 });
  const dir = tmp();
  const d = new Download({ url: slow.url, mirrors: [fast.url], dir, connections: 4, minSplit: 128 * 1024 });
  const p = done(d); d.start();
  assert.equal(await p, 'completed');
  assert.equal(sha(fs.readFileSync(path.join(dir, d.fileName))), sha(DATA));
  assert.equal(d.sources.length, 2);
  assert.ok(slow.stats.bytes > 0 && fast.stats.bytes > 0, 'both sources were used');
  assert.ok(fast.stats.bytes > slow.stats.bytes, `fast ${fast.stats.bytes} should beat slow ${slow.stats.bytes}`);
  slow.srv.close(); fast.srv.close();
});

test('mirrors: when the main link is down a mirror takes over', async () => {
  const dead = await serve({ deny: true });
  const good = await serve();
  const dir = tmp();
  const d = new Download({ url: dead.url, mirrors: [good.url], dir, connections: 3 });
  const p = done(d); d.start();
  assert.equal(await p, 'completed');
  assert.equal(sha(fs.readFileSync(path.join(dir, d.fileName))), sha(DATA));
  dead.srv.close(); good.srv.close();
});

test('mirrors: a different file is rejected, and login cookies never go to another site', async () => {
  const main = await serve();
  const other = await serve({ wrongSize: true });
  const same = await serve();
  const dir = tmp();
  const d = new Download({ url: main.url, mirrors: [other.url, same.url], dir, connections: 4, headers: { cookie: 'sid=secret', 'user-agent': 'UA' } });
  const p = done(d); d.start();
  assert.equal(await p, 'completed');
  assert.equal(sha(fs.readFileSync(path.join(dir, d.fileName))), sha(DATA));
  assert.equal(d.sources.length, 2, 'the wrong-size mirror was dropped');
  assert.equal(other.stats.bytes, 1, 'only the 1-byte check ever reached it');
  assert.ok(main.stats.cookies.includes('sid=secret'));
  assert.deepEqual([...new Set(same.stats.cookies)], [undefined], 'mirror never saw the cookie');
  main.srv.close(); other.srv.close(); same.srv.close();
});

test('a connection that stalls is cut after the timeout and the download fails with a clear reason', async () => {
  const srv = http.createServer((req, res) => {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const start = m ? +m[1] : 0, end = m && m[2] ? +m[2] : SIZE - 1;
    res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${SIZE}`, 'content-length': end - start + 1, 'content-disposition': 'attachment; filename="s.bin"' });
    if (end === start) return res.end(DATA.subarray(start, start + 1)); // the size check answers
    res.write(DATA.subarray(start, start + 1000)); // ... then goes silent forever
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const dir = tmp();
  const d = new Download({ url: `http://127.0.0.1:${srv.address().port}/s`, dir, connections: 1, retries: 0, timeoutMs: 400 });
  const t0 = Date.now();
  const p = done(d); d.start();
  assert.equal(await p, 'failed');
  assert.match(d.error, /timeout/);
  assert.ok(Date.now() - t0 < 4000);
  srv.closeAllConnections?.(); srv.close();
});

test('through a proxy the file arrives byte-exact (and really went through the proxy)', async () => {
  const { srv, url } = await serve({ ranges: true });
  const hits = [];
  const px = http.createServer((req, res) => {
    hits.push(req.url);
    const u = new URL(req.url);
    const up = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    req.pipe(up);
  });
  await new Promise((r) => px.listen(0, '127.0.0.1', r));
  const dir = tmp();
  const d = new Download({ url, dir, connections: 4, proxy: { host: '127.0.0.1', port: px.address().port } });
  const p = done(d); d.start();
  assert.equal(await p, 'completed');
  assert.equal(sha(fs.readFileSync(path.join(dir, d.fileName))), sha(DATA));
  assert.ok(hits.length >= 4, 'requests went through the proxy: ' + hits.length);
  srv.close(); px.close();
});

test('file allocation: sparse, none and prealloc all produce the same byte-exact file; prealloc reserves the full size up front', async () => {
  for (const allocation of ['sparse', 'none', 'prealloc']) {
    const { srv, url } = await serve({ ranges: true });
    const dir = tmp();
    const d = new Download({ url, dir, connections: 3, allocation });
    let partSize = -1;
    d.on('state', (st) => { if (st === 'downloading') partSize = fs.statSync(d.part).size; });
    const p = done(d); d.start();
    assert.equal(await p, 'completed', allocation);
    assert.equal(sha(fs.readFileSync(path.join(dir, d.fileName))), sha(DATA), allocation);
    if (allocation === 'none') assert.equal(partSize, 0, 'none: the file is not pre-sized');
    else assert.equal(partSize, SIZE, `${allocation}: the file is pre-sized`);
    srv.close();
  }
});
