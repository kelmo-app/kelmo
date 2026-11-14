// HLS downloads against a small local server: playlists, plain and AES-128 pieces, resume, errors, host wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HlsDownload, parsePlaylist, parseAttrs, pickVariant, ivFor, isHlsUrl, hlsBaseName } from '../hls.mjs';
import { createHost, uniqueName } from '../host.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-hls-'));
const piece = (n, size = 20000) => crypto.createHash('sha256').update(String(n)).digest().subarray(0, 1).length && Buffer.alloc(size, n + 1);
const cat = (bufs) => Buffer.concat(bufs);
const waitFor = (d, ...states) => new Promise((res) => { if (states.includes(d.status)) return res(d.status); d.on('state', (s) => states.includes(s) && res(s)); });

/** routes: path -> Buffer | string | (req,res)=>void.  Records every request. */
async function serve(routes) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    const r = routes[req.url.split('?')[0]];
    if (r === undefined) { res.writeHead(404); return res.end('no'); }
    if (typeof r === 'function') return r(req, res);
    res.writeHead(200, { 'content-type': typeof r === 'string' ? 'application/vnd.apple.mpegurl' : 'video/mp2t' });
    res.end(r);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, seen, close: () => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); }) };
}

const mediaList = (n, extra = '', prefix = 's') =>
  `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n${extra}${Array.from({ length: n }, (_, i) => `#EXTINF:6.0,\n${prefix}${i}.ts\n`).join('')}#EXT-X-ENDLIST\n`;

/* ---------------------------------------------------------------------------------------- parsing */
test('attributes with quoted commas are read correctly', () => {
  assert.deepEqual(parseAttrs('BANDWIDTH=800000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=640x360'), { BANDWIDTH: '800000', CODECS: 'avc1.4d401f,mp4a.40.2', RESOLUTION: '640x360' });
});
test('master playlist: variants with sizes; the best one is picked; separate audio is found', () => {
  const m = parsePlaylist('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="en",DEFAULT=YES,URI="audio/en.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,AUDIO="aud"\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,AUDIO="aud"\nhigh/index.m3u8\n', 'https://c.test/v/master.m3u8');
  assert.equal(m.type, 'master');
  assert.equal(pickVariant(m.variants).url, 'https://c.test/v/high/index.m3u8');
  assert.equal(m.audio.aud, 'https://c.test/v/audio/en.m3u8');
});
test('media playlist: relative pieces, key, init map, byte ranges and the end marker', () => {
  const p = parsePlaylist('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:7\n#EXT-X-KEY:METHOD=AES-128,URI="k.bin",IV=0x000102030405060708090a0b0c0d0e0f\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\na.m4s\n#EXT-X-BYTERANGE:1000@0\n#EXTINF:4,\nb.mp4\n#EXT-X-BYTERANGE:500\n#EXTINF:4,\nb.mp4\n#EXT-X-ENDLIST\n', 'https://c.test/x/p.m3u8');
  assert.equal(p.type, 'media');
  assert.equal(p.mediaSequence, 7);
  assert.equal(p.map.url, 'https://c.test/x/init.mp4');
  assert.equal(p.segments[0].url, 'https://c.test/x/a.m4s');
  assert.equal(p.segments[0].key.uri, 'https://c.test/x/k.bin');
  assert.deepEqual(p.segments[1].range, { len: 1000, offset: 0 });
  assert.deepEqual(p.segments[2].range, { len: 500, offset: 1000 }); // continues where the last range ended
  assert.equal(p.endList, true);
});
test('protected (SAMPLE-AES) streams and non-playlists are refused with a clear message', () => {
  assert.throws(() => parsePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="x"\n#EXTINF:4,\na.ts\n', 'https://c.test/p.m3u8'), /protection/);
  assert.throws(() => parsePlaylist('<html>', 'https://c.test/p.m3u8'), /not an HLS/);
});
test('IV: from the playlist, else the piece number; link and name helpers', () => {
  assert.equal(ivFor({ iv: '0x0F' }, 3).toString('hex'), '0000000000000000000000000000000f');
  assert.equal(ivFor(null, 258).toString('hex'), '00000000000000000000000000000102');
  assert.equal(isHlsUrl('https://a.test/x/master.m3u8?t=1'), true);
  assert.equal(isHlsUrl('https://a.test/play/12#kdm-hls'), true);
  assert.equal(isHlsUrl('https://a.test/a.mp4'), false);
  assert.equal(hlsBaseName('My Film.m3u8', 'https://a.test/x'), 'My Film');
  assert.equal(hlsBaseName('', 'https://a.test/x/master.m3u8'), 'video');
});

/* ---------------------------------------------------------------------------------------- downloading */
test('pieces are fetched in parallel and joined in order (.ts without ffmpeg)', async () => {
  const pieces = Array.from({ length: 12 }, (_, i) => piece(i));
  const routes = { '/v/index.m3u8': mediaList(12) };
  pieces.forEach((b, i) => { routes[`/v/s${i}.ts`] = b; });
  const srv = await serve(routes);
  const dir = tmp();
  const d = new HlsDownload({ url: `${srv.base}/v/index.m3u8`, dir, fileName: 'Film.m3u8', ffmpeg: null, uniqueName });
  const progress = [];
  d.on('progress', (p) => progress.push(p));
  d.start();
  assert.equal(await waitFor(d, 'completed', 'failed'), 'completed', d.error);
  assert.equal(d.fileName, 'Film.ts');
  assert.deepEqual(fs.readFileSync(path.join(dir, 'Film.ts')), cat(pieces));
  assert.equal(d.total, 12 * 20000);
  assert.ok(progress.some((p) => p.total > 0 && p.detail.segments.length > 0), 'progress window gets a bar');
  assert.deepEqual(fs.readdirSync(dir), ['Film.ts'], 'no leftovers');
  await srv.close();
});
test('a master playlist leads to the best variant', async () => {
  const hi = [piece(7), piece(8)];
  const srv = await serve({
    '/m.m3u8': '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=320x180\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=900,RESOLUTION=1280x720\nhigh.m3u8\n',
    '/low.m3u8': mediaList(1, '', 'l'), '/l0.ts': piece(1),
    '/high.m3u8': mediaList(2, '', 'h'), '/h0.ts': hi[0], '/h1.ts': hi[1],
  });
  const dir = tmp();
  const d = new HlsDownload({ url: `${srv.base}/m.m3u8`, dir, ffmpeg: null, uniqueName });
  d.start();
  assert.equal(await waitFor(d, 'completed', 'failed'), 'completed', d.error);
  assert.deepEqual(fs.readFileSync(path.join(dir, d.fileName)), cat(hi));
  assert.ok(!srv.seen.some((r) => r.url.startsWith('/l0')), 'low quality never fetched');
  await srv.close();
});
test('AES-128 pieces are decrypted (IV from the playlist and from the piece number)', async () => {
  const key = crypto.randomBytes(16);
  const iv0 = Buffer.alloc(16, 5);
  const plain = [piece(1, 5000), piece(2, 7000), piece(3, 3000)];
  const enc = (buf, iv) => { const c = crypto.createCipheriv('aes-128-cbc', key, iv); return Buffer.concat([c.update(buf), c.final()]); };
  const list = `#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x${iv0.toString('hex')}\n#EXTINF:6,\ns0.ts\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:6,\ns1.ts\n#EXTINF:6,\ns2.ts\n#EXT-X-ENDLIST\n`;
  const srv = await serve({ '/e.m3u8': list, '/key.bin': key, '/s0.ts': enc(plain[0], iv0), '/s1.ts': enc(plain[1], ivFor(null, 1)), '/s2.ts': enc(plain[2], ivFor(null, 2)) });
  const dir = tmp();
  const d = new HlsDownload({ url: `${srv.base}/e.m3u8`, dir, fileName: 'Secret', ffmpeg: null, uniqueName });
  d.start();
  assert.equal(await waitFor(d, 'completed', 'failed'), 'completed', d.error);
  assert.deepEqual(fs.readFileSync(path.join(dir, d.fileName)), cat(plain));
  await srv.close();
});
test('live streams (no end) are refused; a missing piece fails with its HTTP status', async () => {
  const srv = await serve({ '/live.m3u8': '#EXTM3U\n#EXTINF:6,\na.ts\n', '/gone.m3u8': mediaList(3), '/s0.ts': piece(0), '/s1.ts': piece(1) /* s2 missing */ });
  let d = new HlsDownload({ url: `${srv.base}/live.m3u8`, dir: tmp(), ffmpeg: null, uniqueName });
  d.start();
  assert.equal(await waitFor(d, 'completed', 'failed'), 'failed');
  assert.match(d.error, /live stream/);
  d = new HlsDownload({ url: `${srv.base}/gone.m3u8`, dir: tmp(), ffmpeg: null, uniqueName, retries: 0 });
  d.start();
  assert.equal(await waitFor(d, 'completed', 'failed'), 'failed');
  assert.match(d.error, /HTTP 404/);
  await srv.close();
});
test('separate audio without ffmpeg: a clear instruction instead of a silent video', async () => {
  const srv = await serve({
    '/m.m3u8': '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",DEFAULT=YES,URI="a.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=900,AUDIO="a"\nv.m3u8\n',
    '/a.m3u8': mediaList(1, '', 'a'), '/v.m3u8': mediaList(1, '', 'v'),
  });
  const d = new HlsDownload({ url: `${srv.base}/m.m3u8`, dir: tmp(), ffmpeg: null, uniqueName });
  d.start();
  assert.equal(await waitFor(d, 'completed', 'failed'), 'failed');
  assert.match(d.error, /ffmpeg/);
  await srv.close();
});
test('pieces on another host get the Referer and User-Agent, never the login cookie', async () => {
  const cdn = await serve({ '/s0.ts': piece(0) });
  const cdnBase = cdn.base.replace('127.0.0.1', 'localhost');
  const site = await serve({ '/p.m3u8': `#EXTM3U\n#EXTINF:6,\n${cdnBase}/s0.ts\n#EXT-X-ENDLIST\n` });
  const d = new HlsDownload({ url: `${site.base}/p.m3u8`, dir: tmp(), ffmpeg: null, uniqueName, headers: { referer: 'https://player.test/embed', cookie: 'sid=1', 'user-agent': 'UA/1' } });
  d.start();
  assert.equal(await waitFor(d, 'completed', 'failed'), 'completed', d.error);
  const h = cdn.seen[0].headers;
  assert.equal(h.referer, 'https://player.test/embed');
  assert.equal(h['user-agent'], 'UA/1');
  assert.equal(h.cookie, undefined);
  assert.equal(site.seen[0].headers.cookie, 'sid=1');
  await site.close(); await cdn.close();
});
test('pause keeps the downloaded pieces; the next run fetches only what is missing', async () => {
  const pieces = Array.from({ length: 10 }, (_, i) => piece(i, 30000));
  let slow = true;
  const routes = { '/p.m3u8': mediaList(10) };
  pieces.forEach((b, i) => {
    routes[`/s${i}.ts`] = (_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp2t', 'content-length': b.length });
      if (i >= 4 && slow) { res.write(b.subarray(0, 100)); return; } // never finishes: the connection hangs
      res.end(b);
    };
  });
  const srv = await serve(routes);
  const dir = tmp();
  const mk = () => new HlsDownload({ url: `${srv.base}/p.m3u8`, dir, fileName: 'R.m3u8', ffmpeg: null, uniqueName, connections: 2, timeoutSec: 30 });
  const d1 = mk();
  d1.start();
  await new Promise((r) => setTimeout(r, 600));
  d1.pause();
  assert.equal(await waitFor(d1, 'paused', 'failed', 'completed'), 'paused');
  const kept = fs.readdirSync(path.join(dir, 'R.ts.kdmparts')).filter((f) => f.endsWith('.seg')).length;
  assert.ok(kept >= 4 && kept < 10, `kept ${kept}`);
  slow = false;
  srv.seen.length = 0;
  const d2 = mk();
  d2.start();
  assert.equal(await waitFor(d2, 'completed', 'failed'), 'completed', d2.error);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'R.ts')), cat(pieces));
  const refetched = srv.seen.filter((r) => /^\/s\d+\.ts/.test(r.url)).length;
  assert.ok(refetched <= 10 - kept, `refetched ${refetched}, kept ${kept}`);
  await srv.close();
});
test('cancel removes every temporary file', async () => {
  const routes = { '/p.m3u8': mediaList(6) };
  for (let i = 0; i < 6; i++) routes[`/s${i}.ts`] = (_q, res) => { res.writeHead(200, { 'content-length': 1000 }); res.write(Buffer.alloc(10)); };
  const srv = await serve(routes);
  const dir = tmp();
  const d = new HlsDownload({ url: `${srv.base}/p.m3u8`, dir, ffmpeg: null, uniqueName });
  d.start();
  await new Promise((r) => setTimeout(r, 300));
  await d.cancel();
  assert.equal(await waitFor(d, 'cancelled', 'failed'), 'cancelled');
  assert.deepEqual(fs.readdirSync(dir), []);
  await srv.close();
});
test('the speed limit applies to streams too', async () => {
  const pieces = Array.from({ length: 4 }, (_, i) => piece(i, 100000));
  const routes = { '/p.m3u8': mediaList(4) };
  pieces.forEach((b, i) => { routes[`/s${i}.ts`] = b; });
  const srv = await serve(routes);
  const t0 = Date.now();
  const d = new HlsDownload({ url: `${srv.base}/p.m3u8`, dir: tmp(), ffmpeg: null, uniqueName, speedLimit: 200000 });
  d.start();
  assert.equal(await waitFor(d, 'completed', 'failed'), 'completed', d.error);
  assert.ok(Date.now() - t0 > 600, `took ${Date.now() - t0} ms for 400 KB at 200 KB/s`);
  await srv.close();
});

/* ---------------------------------------------------------------------------------------- through the host */
test('host: an .m3u8 link starts an HLS download; probe shows the file it will become', async () => {
  const pieces = [piece(1), piece(2)];
  const srv = await serve({ '/watch/master.m3u8': mediaList(2), '/watch/s0.ts': pieces[0], '/watch/s1.ts': pieces[1] });
  const events = [];
  const host = createHost((e) => events.push(e), { ffmpeg: null });
  const info = await host.probe({ url: `${srv.base}/watch/master.m3u8` });
  assert.equal(info.stream, true);
  assert.equal(info.fileName, 'video.ts');
  const dir = tmp();
  await host.start({ id: 'h1', url: `${srv.base}/watch/master.m3u8`, dir, fileName: 'Taj Story.mp4' });
  await new Promise((res) => { const t = setInterval(() => { if (events.some((e) => e.id === 'h1' && ['completed', 'failed'].includes(e.status))) { clearInterval(t); res(); } }, 50); });
  const last = events.filter((e) => e.type === 'state').at(-1);
  assert.equal(last.status, 'completed', last.error);
  assert.equal(last.fileName, 'Taj Story.ts');
  assert.deepEqual(fs.readFileSync(path.join(dir, 'Taj Story.ts')), cat(pieces));
  await srv.close();
});
test('host: a playlist found by content type (marker #kdm-hls) is also recognised', async () => {
  const srv = await serve({ '/play/12': mediaList(1), '/play/s0.ts': piece(3) });
  const events = [];
  const host = createHost((e) => events.push(e), { ffmpeg: null });
  const dir = tmp();
  await host.start({ id: 'h2', url: `${srv.base}/play/12#kdm-hls`, dir, fileName: 'Clip.mp4' });
  await new Promise((res) => { const t = setInterval(() => { if (events.some((e) => e.id === 'h2' && ['completed', 'failed'].includes(e.status))) { clearInterval(t); res(); } }, 50); });
  assert.equal(events.filter((e) => e.type === 'state').at(-1).status, 'completed');
  assert.ok(fs.existsSync(path.join(dir, 'Clip.ts')));
  await srv.close();
});

let hasFfmpeg = false;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); hasFfmpeg = true; } catch { /* not installed here */ }
test('with ffmpeg the joined stream becomes a real .mp4', { skip: !hasFfmpeg && 'ffmpeg is not installed here' }, async () => {
  const dir = tmp();
  const src = path.join(dir, 'src.ts');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=4:size=160x90:rate=10', '-f', 'lavfi', '-i', 'sine=duration=4', '-c:v', 'libx264', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', '-hls_segment_filename', path.join(dir, 'seg%d.ts'), path.join(dir, 'out.m3u8')]);
  const routes = {};
  for (const f of fs.readdirSync(dir)) routes[`/${f}`] = f.endsWith('.m3u8') ? fs.readFileSync(path.join(dir, f), 'utf8') : fs.readFileSync(path.join(dir, f));
  const srv = await serve(routes);
  const out = tmp();
  const d = new HlsDownload({ url: `${srv.base}/out.m3u8`, dir: out, fileName: 'T', ffmpeg: 'ffmpeg', uniqueName });
  d.start();
  assert.equal(await waitFor(d, 'completed', 'failed'), 'completed', d.error);
  assert.equal(d.fileName, 'T.mp4');
  const probe = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(out, 'T.mp4'), '-f', 'null', '-'], { encoding: 'utf8' });
  assert.equal(probe, '');
  await srv.close();
  void src;
});
