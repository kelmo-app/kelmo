import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  isVideoSiteUrl, assetFor, summarize, formatSelector, parseProgress, friendlyError, findYtDlp, installYtDlp, probeVideo,
  YtDlpDownload, uniqueVideoName, removeVideoPartials, jsArgs, jsRuntimeFrom, runtimeEnv, writeCookieFile, removeCookieFile,
} from '../ytdlp.mjs';
import { createHost } from '../host.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(here, 'fixtures', 'fake-ytdlp.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-yt-'));
/** A folder with the fake installed as KDM's own yt-dlp. */
function withFake() {
  const dir = tmp();
  fs.copyFileSync(FAKE, path.join(dir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'));
  fs.chmodSync(path.join(dir, 'yt-dlp'), 0o755);
  return dir;
}
const waitFor = (d, status, ms = 8000) => new Promise((res, rej) => {
  if (d.status === status) return res();
  const t = setTimeout(() => rej(new Error(`timeout waiting for ${status}, is ${d.status}: ${d.error}`)), ms);
  const on = (s) => { if (s === status) { clearTimeout(t); d.off('state', on); res(); } };
  d.on('state', on);
});

test('which links belong to yt-dlp', () => {
  for (const u of ['https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', 'https://m.youtube.com/shorts/xyz', 'https://vimeo.com/123', 'https://www.bilibili.com/video/BV1', 'https://www.youtube.com/playlist?list=PL1']) assert.equal(isVideoSiteUrl(u), true, u);
  for (const u of ['https://www.youtube.com/', 'https://www.youtube.com/watch', 'https://www.youtube.com/results?search_query=x', 'https://example.com/a.mp4', 'https://cdn.vimeo.com/x.mp4', 'ftp://youtu.be/abc', 'not a url']) assert.equal(isVideoSiteUrl(u), false, u);
});

test('release file names per system', () => {
  assert.equal(assetFor('linux', 'x64'), 'yt-dlp_linux');
  assert.equal(assetFor('linux', 'arm64'), 'yt-dlp_linux_aarch64');
  assert.equal(assetFor('win32', 'x64'), 'yt-dlp.exe');
  assert.equal(assetFor('freebsd', 'x64'), null);
});

test('summarize: qualities, sizes, a clean title; playlists are recognised', () => {
  const j = JSON.parse(execFileSync(FAKE, ['-J'], { encoding: 'utf8' }));
  const s = summarize(j);
  assert.equal(s.title, 'My Great Video');
  assert.deepEqual(s.heights, [1080, 720, 360]);
  assert.deepEqual(s.muxedHeights, [360]);
  assert.equal(s.sizes[720], 40_000_000 + 5_000_000); // video + the best audio
  assert.equal(s.sizes[360], 10_000_000); // already has sound
  assert.equal(s.sizes[1080], 95_000_000);
  assert.equal(s.duration, 125);
  assert.equal(s.live, false);
  assert.equal(summarize({ _type: 'playlist', title: 'Mix', entries: [{}, {}] }).playlist, true);
  assert.throws(() => summarize(null));
});

test('format selectors: joined streams need ffmpeg, otherwise only ready-made files', () => {
  assert.equal(formatSelector('720', true), 'bv*[height<=720]+ba/b[height<=720]/b');
  assert.equal(formatSelector('best', true), 'bv*+ba/b');
  assert.equal(formatSelector('720', false), 'b[height<=720]/b');
  assert.equal(formatSelector('audio', true), 'ba/b');
  assert.equal(formatSelector('720; rm -rf', false), 'b'); // never pasted into the command line
});

test('progress lines and error lines', () => {
  assert.deepEqual(parseProgress('KDMP|500|1000|NA|2500.5|3|/x/a|b.mp4'), { downloaded: 500, total: 1000, speed: 2500.5, eta: 3, file: '/x/a|b.mp4' });
  assert.equal(parseProgress('KDMP|500|NA|9000|NA|NA|/f').total, 9000);
  assert.equal(parseProgress('[download] 5%'), null);
  assert.equal(friendlyError('WARNING: x\nERROR: [youtube] abc: Video unavailable'), 'Video unavailable');
  assert.equal(friendlyError(''), '');
  assert.deepEqual(jsArgs('node'), ['--js-runtimes', 'node']);
  assert.deepEqual(jsArgs('deno'), []);
  assert.deepEqual(jsArgs(null), []);
});

test('findYtDlp: KDM\'s own copy is found and reports its version', async () => {
  const dir = withFake();
  const r = await findYtDlp(dir);
  assert.equal(r.managed, true);
  assert.equal(r.version, '2099.01.01');
});

async function releaseServer(content, sumFor) {
  const sums = `${sumFor ?? crypto.createHash('sha256').update(content).digest('hex')}  yt-dlp_linux\n${'0'.repeat(64)}  yt-dlp.exe\n`;
  const srv = http.createServer((req, res) => {
    if (req.url === '/SHA2-256SUMS') return res.end(sums);
    if (req.url === '/yt-dlp_linux') { res.setHeader('content-length', content.length); return res.end(content); }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}` };
}

test('install: downloads, verifies the published checksum, makes it executable', async () => {
  const content = fs.readFileSync(FAKE);
  const { srv, base } = await releaseServer(content);
  try {
    const dir = path.join(tmp(), 'bin');
    const seen = [];
    const r = await installYtDlp({ dir, base, platform: 'linux', arch: 'x64', onProgress: (p) => seen.push(p.downloaded) });
    assert.equal(r.version, '2099.01.01');
    assert.ok(fs.statSync(r.path).mode & 0o100);
    assert.ok(seen.length > 0);
    assert.ok(!fs.existsSync(path.join(dir, 'yt-dlp.download')));
  } finally { srv.close(); }
});

test('install: a file that does not match its checksum is thrown away, and nothing is installed', async () => {
  const { srv, base } = await releaseServer(fs.readFileSync(FAKE), 'a'.repeat(64));
  try {
    const dir = path.join(tmp(), 'bin');
    await assert.rejects(installYtDlp({ dir, base, platform: 'linux', arch: 'x64' }), /checksum/);
    assert.ok(!fs.existsSync(path.join(dir, 'yt-dlp')));
    assert.ok(!fs.existsSync(path.join(dir, 'yt-dlp.download')));
  } finally { srv.close(); }
});

test('install: a checksum list without our file refuses to install', async () => {
  const srv = http.createServer((req, res) => res.end(req.url === '/SHA2-256SUMS' ? `${'a'.repeat(64)}  other-file\n` : 'x'));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    await assert.rejects(installYtDlp({ dir: tmp(), base: `http://127.0.0.1:${srv.address().port}`, platform: 'linux', arch: 'x64' }), /checksum list/);
  } finally { srv.close(); }
});

test('probeVideo returns the summary; a failing link gives yt-dlp\'s own reason', async () => {
  const dir = withFake();
  const s = await probeVideo({ bin: path.join(dir, 'yt-dlp'), url: 'https://www.youtube.com/watch?v=abc', runtime: 'node' });
  assert.equal(s.title, 'My Great Video');
  process.env.KDM_FAKE_FAIL = '1';
  try {
    await assert.rejects(probeVideo({ bin: path.join(dir, 'yt-dlp'), url: 'https://www.youtube.com/watch?v=abc' }), /Video unavailable/);
  } finally { delete process.env.KDM_FAKE_FAIL; }
});

test('download: real progress across two files, joined name, command line is right', async () => {
  const bin = path.join(withFake(), 'yt-dlp');
  const dir = tmp();
  const log = path.join(tmp(), 'args.log');
  process.env.KDM_FAKE_LOG = log;
  process.env.KDM_FAKE_SLOW = '1'; // slow enough that the 4-per-second progress updates are seen
  try {
    const d = new YtDlpDownload({ url: 'https://www.youtube.com/watch?v=abc', dir, bin, fileName: 'My Great Video.mp4', choice: '720', expectedTotal: 1200, ffmpeg: 'ffmpeg', runtime: 'node', speedLimit: 2 * 1024 * 1024, proxy: { host: 'p.example', port: 8080 } });
    const progress = [];
    d.on('progress', (p) => progress.push(p));
    void d.start();
    await waitFor(d, 'completed');
    assert.equal(d.fileName, 'My Great Video.mp4');
    assert.ok(fs.existsSync(path.join(dir, 'My Great Video.mp4')));
    assert.ok(!fs.existsSync(path.join(dir, 'My Great Video.mp4.part')));
    assert.ok(progress.length >= 2);
    assert.ok(progress.every((p) => p.total === 1200)); // the size from the quality list, so the bar does not jump when audio starts
    const mid = progress.find((p) => p.downloaded > 1000 && p.downloaded < 1200);
    assert.ok(mid, 'the second file adds to the first');
    const a = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n').pop());
    assert.equal(a[a.indexOf('-f') + 1], 'bv*[height<=720]+ba/b[height<=720]/b');
    assert.equal(a[a.indexOf('--limit-rate') + 1], String(2 * 1024 * 1024));
    assert.equal(a[a.indexOf('--proxy') + 1], 'http://p.example:8080');
    assert.deepEqual(a.slice(a.indexOf('--js-runtimes'), a.indexOf('--js-runtimes') + 2), ['--js-runtimes', 'node']);
    assert.ok(a.includes('--merge-output-format'));
    assert.equal(a[a.length - 1], 'https://www.youtube.com/watch?v=abc');
    assert.equal(a[a.length - 2], '--'); // the link can never be read as an option
  } finally { delete process.env.KDM_FAKE_LOG; delete process.env.KDM_FAKE_SLOW; }
});

test('download: without ffmpeg only ready-made files are requested', async () => {
  const bin = path.join(withFake(), 'yt-dlp');
  const log = path.join(tmp(), 'args.log');
  process.env.KDM_FAKE_LOG = log;
  try {
    const d = new YtDlpDownload({ url: 'https://vimeo.com/1', dir: tmp(), bin, fileName: 'v.mp4', choice: '1080', ffmpeg: null });
    void d.start();
    await waitFor(d, 'completed');
    const a = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n').pop());
    assert.equal(a[a.indexOf('-f') + 1], 'b[height<=1080]/b');
    assert.ok(!a.includes('--merge-output-format'));
  } finally { delete process.env.KDM_FAKE_LOG; }
});

test('download: pause stops yt-dlp, resume continues, cancel removes only the temporary pieces', async () => {
  const bin = path.join(withFake(), 'yt-dlp');
  const dir = tmp();
  process.env.KDM_FAKE_SLOW = '1';
  try {
    const d = new YtDlpDownload({ url: 'https://vimeo.com/1', dir, bin, fileName: 'clip.mp4', choice: 'best' });
    void d.start();
    await waitFor(d, 'downloading');
    await new Promise((r) => setTimeout(r, 300));
    d.pause();
    await waitFor(d, 'paused');
    assert.ok(fs.existsSync(path.join(dir, 'clip.mp4.part')), 'yt-dlp keeps its partial file for resuming');
    delete process.env.KDM_FAKE_SLOW;
    void d.start();
    await waitFor(d, 'completed');
    assert.ok(fs.existsSync(path.join(dir, 'clip.mp4')));

    process.env.KDM_FAKE_SLOW = '1';
    fs.writeFileSync(path.join(dir, 'other.mp4'), 'keep me');
    const c = new YtDlpDownload({ url: 'https://vimeo.com/2', dir, bin, fileName: 'second.mp4' });
    void c.start();
    await waitFor(c, 'downloading');
    await new Promise((r) => setTimeout(r, 200));
    await c.cancel();
    await waitFor(c, 'cancelled');
    assert.ok(!fs.existsSync(path.join(dir, 'second.mp4.part')));
    assert.ok(fs.existsSync(path.join(dir, 'other.mp4')));
    assert.ok(fs.existsSync(path.join(dir, 'clip.mp4')), 'a finished download is never touched');
  } finally { delete process.env.KDM_FAKE_SLOW; }
});

test('download: changing the speed limit restarts yt-dlp with the new cap and it still finishes', async () => {
  const bin = path.join(withFake(), 'yt-dlp');
  const log = path.join(tmp(), 'args.log');
  process.env.KDM_FAKE_LOG = log;
  process.env.KDM_FAKE_SLOW = '1';
  try {
    const d = new YtDlpDownload({ url: 'https://vimeo.com/1', dir: tmp(), bin, fileName: 'v.mp4' });
    void d.start();
    await waitFor(d, 'downloading');
    await new Promise((r) => setTimeout(r, 300));
    delete process.env.KDM_FAKE_SLOW;
    d.setSpeedLimit(512 * 1024);
    await waitFor(d, 'completed');
    const runs = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(runs.length >= 2);
    assert.equal(runs[runs.length - 1][runs[runs.length - 1].indexOf('--limit-rate') + 1], String(512 * 1024));
  } finally { delete process.env.KDM_FAKE_SLOW; delete process.env.KDM_FAKE_LOG; }
});

test('download: a refusal from the site shows yt-dlp\'s reason', async () => {
  const bin = path.join(withFake(), 'yt-dlp');
  process.env.KDM_FAKE_FAIL = '1';
  try {
    const d = new YtDlpDownload({ url: 'https://www.youtube.com/watch?v=abc', dir: tmp(), bin, fileName: 'v.mp4' });
    void d.start();
    await waitFor(d, 'failed');
    assert.match(d.error, /Sign in to confirm you are not a bot/);
  } finally { delete process.env.KDM_FAKE_FAIL; }
});

test('download: a program that cannot be started fails cleanly', async () => {
  const d = new YtDlpDownload({ url: 'https://vimeo.com/1', dir: tmp(), bin: '/nonexistent/yt-dlp', fileName: 'v.mp4' });
  void d.start();
  await waitFor(d, 'failed');
  assert.ok(d.error);
});

test('names: an existing video is not overwritten; leftovers mean "resume"; partial clean-up spares finished files', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.mp4'), 'done');
  assert.equal(uniqueVideoName(dir, 'a.mp4'), 'a (1).mp4');
  assert.equal(uniqueVideoName(dir, 'new.mp4'), 'new.mp4');
  fs.writeFileSync(path.join(dir, 'b.mp4'), 'done');
  fs.writeFileSync(path.join(dir, 'b.mp4.part'), 'half');
  assert.equal(uniqueVideoName(dir, 'b.mp4'), 'b.mp4');
  fs.writeFileSync(path.join(dir, 'b.f137.mp4.part'), 'half');
  await removeVideoPartials(dir, 'b.mp4');
  assert.ok(!fs.existsSync(path.join(dir, 'b.mp4.part')));
  assert.ok(!fs.existsSync(path.join(dir, 'b.f137.mp4.part')));
  assert.ok(fs.existsSync(path.join(dir, 'b.mp4')));
});

test('host: a video-site link is routed to yt-dlp; status, probe and the "not installed" answer work', async () => {
  const ytdlpDir = withFake();
  const events = [];
  const host = createHost((e) => events.push(e), { ytdlpDir, ffmpeg: null, jsRuntime: null });
  const st = await host.videoStatus();
  assert.deepEqual({ installed: st.installed, managed: st.managed, ffmpeg: st.ffmpeg, runtime: st.runtime }, { installed: true, managed: true, ffmpeg: false, runtime: null });
  const info = await host.videoProbe({ url: 'https://www.youtube.com/watch?v=abc' });
  assert.deepEqual(info.heights, [1080, 720, 360]);

  const dir = tmp();
  await host.start({ id: 'v1', url: 'https://www.youtube.com/watch?v=abc', dir, fileName: 'My Great Video.mp4', video: { choice: '360', size: 1200 } });
  const t0 = Date.now();
  while (!events.some((e) => e.id === 'v1' && e.status === 'completed') && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 25));
  const done = events.find((e) => e.id === 'v1' && e.status === 'completed');
  assert.ok(done, 'completed');
  assert.equal(done.path, path.join(dir, 'My Great Video.mp4'));
  assert.ok(events.some((e) => e.id === 'v1' && e.type === 'progress'));

  const bare = createHost((e) => events.push(e), { ytdlpDir: tmp(), ffmpeg: null, jsRuntime: null });
  assert.equal((await bare.videoStatus()).managed, false);
  assert.deepEqual(await bare.videoProbe({ url: 'https://www.youtube.com/watch?v=abc' }), { ok: false, needInstall: true });
  await bare.start({ id: 'v2', url: 'https://www.youtube.com/watch?v=abc', dir, fileName: 'x.mp4' });
  const fail = events.find((e) => e.id === 'v2' && e.status === 'failed');
  assert.match(fail.error, /not installed/);
});

test('JavaScript runtime: a system one wins; without one the installed app lends its own Electron as Node (and only then sets the switch)', () => {
  assert.equal(jsRuntimeFrom('deno', '/opt/KELMO/kelmo'), 'deno');
  assert.equal(jsRuntimeFrom('node', '/opt/KELMO/kelmo'), 'node');
  assert.equal(jsRuntimeFrom(null, '/opt/KELMO/kelmo'), 'node:/opt/KELMO/kelmo');
  assert.equal(jsRuntimeFrom(null, undefined), null);
  assert.deepEqual(jsArgs('node:/opt/KELMO/kelmo'), ['--js-runtimes', 'node:/opt/KELMO/kelmo']);
  assert.deepEqual(runtimeEnv('node:/opt/KELMO/kelmo'), { ELECTRON_RUN_AS_NODE: '1' });
  assert.equal(runtimeEnv('node'), undefined);
  assert.equal(runtimeEnv(null), undefined);
});

test('summarize: no file sizes from the site -> estimated from bit rate x length; if the video part is unknown the total stays unknown', () => {
  const j = { title: 'T', duration: 100, formats: [
    { height: 2160, vcodec: 'vp9', acodec: 'none', tbr: 8000 },
    { height: 720, vcodec: 'avc1', acodec: 'none', tbr: 1600 },
    { height: 360, vcodec: 'avc1', acodec: 'none' },
    { vcodec: 'none', acodec: 'opus', abr: 128, tbr: 128 },
  ] };
  const s = summarize(j);
  assert.equal(s.sizes[2160], 8000 * 125 * 100 + 128 * 125 * 100);
  assert.equal(s.sizes[720], 1600 * 125 * 100 + 128 * 125 * 100);
  assert.equal(s.sizes[360], 0);
  assert.equal(s.audioSize, 128 * 125 * 100);
  assert.equal(summarize({ ...j, duration: 0 }).sizes[2160], 0);
});

test('cookies: the browser login becomes a Netscape cookie file on the site\'s main domain, and is deleted afterwards', async () => {
  const f = await writeCookieFile('SID=abc; HSID=def; bad=a\tb; =x', 'https://www.youtube.com/watch?v=1');
  const body = fs.readFileSync(f, 'utf8');
  assert.match(body, /^# Netscape HTTP Cookie File\n/);
  const rows = body.trim().split('\n').slice(1).map((l) => l.split('\t'));
  assert.deepEqual(rows.map((r) => [r[0], r[1], r[2], r[3], r[5], r[6]]), [['.youtube.com', 'TRUE', '/', 'TRUE', 'SID', 'abc'], ['.youtube.com', 'TRUE', '/', 'TRUE', 'HSID', 'def']]);
  assert.ok(Number(rows[0][4]) > Date.now() / 1000);
  if (process.platform !== 'win32') assert.equal(fs.statSync(f).mode & 0o077, 0); // only the user can read it
  await removeCookieFile(f);
  assert.equal(fs.existsSync(f), false);
  assert.equal(path.basename(path.dirname(await writeCookieFile('a=1', 'https://youtu.be/x'))).startsWith('kdm-ck-'), true);
  assert.match(fs.readFileSync(await writeCookieFile('a=1', 'https://player.vimeo.com/video/1'), 'utf8'), /\.vimeo\.com\tTRUE/);
  assert.equal(await writeCookieFile('', 'https://www.youtube.com/'), '');
  assert.equal(await writeCookieFile('a=1', 'not a url'), '');
});

test('cookies: probing and downloading hand yt-dlp the file only when a login was given, and remove it afterwards', async () => {
  const bin = path.join(withFake(), 'yt-dlp');
  const log = path.join(tmp(), 'args.log');
  process.env.KDM_FAKE_LOG = log;
  try {
    await probeVideo({ bin, url: 'https://www.youtube.com/watch?v=abc', cookie: 'SID=secret1' });
    let lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    const args = JSON.parse(lines[0]);
    const file = args[args.indexOf('--cookies') + 1];
    assert.match(lines[1], /SID\\tsecret1/);
    assert.equal(fs.existsSync(file), false);

    fs.writeFileSync(log, '');
    const d = new YtDlpDownload({ url: 'https://www.youtube.com/watch?v=abc', dir: tmp(), bin, fileName: 'v.mp4', cookie: 'SID=secret2' });
    void d.start();
    await waitFor(d, 'completed');
    lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    const dArgs = JSON.parse(lines[0]);
    const dFile = dArgs[dArgs.indexOf('--cookies') + 1];
    assert.match(lines[1], /SID\\tsecret2/);
    assert.equal(fs.existsSync(dFile), false);

    fs.writeFileSync(log, '');
    await probeVideo({ bin, url: 'https://www.youtube.com/watch?v=abc' });
    assert.equal(JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n')[0]).includes('--cookies'), false);
  } finally { delete process.env.KDM_FAKE_LOG; }
});
