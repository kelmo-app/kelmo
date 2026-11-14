// Video capture: the pure detection rules (extension/media.js) and the background wiring with a fake browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { createBridgeServer, listenOnFirstFree } = createRequire(import.meta.url)('../bridge-server.cjs');

const read = (f) => fs.readFileSync(new URL(`../../extension/${f}`, import.meta.url), 'utf8');
const g = {};
vm.runInNewContext(read('media.js'), { globalThis: g, URL });
const M = g.KdmMedia;

const plain = (v) => (v === null ? null : JSON.parse(JSON.stringify(v))); // objects made inside the sandbox belong to another realm
const hit = (url, headers = {}, o = {}) => plain(M.classify({ url, headers, status: 200, type: 'media', ...o }));

test('a normal mp4 is a video; its size comes from Content-Length', () => {
  assert.deepEqual(hit('https://cdn.test/v/clip.mp4', { 'content-type': 'video/mp4', 'content-length': '52428800' }), { url: 'https://cdn.test/v/clip.mp4', kind: 'video', ext: 'mp4', size: 52428800 });
});
test('partial (206) answers report the whole file size from Content-Range', () => {
  const r = hit('https://cdn.test/a.webm', { 'content-type': 'video/webm', 'content-range': 'bytes 0-1023/9000000', 'content-length': '1024' }, { status: 206 });
  assert.equal(r.size, 9000000);
});
test('tiny files, pieces of a stream, images and failed answers are ignored', () => {
  assert.equal(hit('https://cdn.test/ad.mp4', { 'content-type': 'video/mp4', 'content-length': '40000' }), null);
  assert.equal(hit('https://cdn.test/seg-12.ts', { 'content-type': 'video/mp2t', 'content-length': '900000' }), null);
  assert.equal(hit('https://cdn.test/v/chunk_7.m4s', { 'content-type': 'video/iso.segment' }), null);
  assert.equal(hit('https://cdn.test/x.mp4', { 'content-type': 'video/mp4' }, { type: 'image' }), null);
  assert.equal(hit('https://cdn.test/x.mp4', { 'content-type': 'video/mp4', 'content-length': '9999999' }, { status: 404 }), null);
  assert.equal(hit('ftp://cdn.test/x.mp4', { 'content-type': 'video/mp4' }), null);
});
test('octet-stream with a media extension still counts; a page or zip does not', () => {
  assert.equal(hit('https://cdn.test/movie.mkv', { 'content-type': 'application/octet-stream', 'content-length': '70000000' }).kind, 'video');
  assert.equal(hit('https://cdn.test/song.mp3', { 'content-type': 'audio/mpeg', 'content-length': '5000000' }).ext, 'mp3');
  assert.equal(hit('https://cdn.test/file.zip', { 'content-type': 'application/octet-stream', 'content-length': '70000000' }), null);
  assert.equal(hit('https://cdn.test/page', { 'content-type': 'text/html' }), null);
});
test('HLS and DASH playlists are recognised as streams (not downloadable yet)', () => {
  assert.equal(hit('https://cdn.test/live/master.m3u8', { 'content-type': 'application/vnd.apple.mpegurl' }).kind, 'hls');
  assert.equal(hit('https://cdn.test/a/manifest.mpd', { 'content-type': 'application/dash+xml' }).kind, 'dash');
});
test('the list keeps one entry per video (byte-range URLs collapse), newest first, capped', () => {
  let list = [];
  list = M.addToList(list, { url: 'https://cdn.test/a.mp4?range=0-99', kind: 'video', ext: 'mp4', size: 0 });
  list = M.addToList(list, { url: 'https://cdn.test/a.mp4?range=100-199', kind: 'video', ext: 'mp4', size: 5000000 });
  assert.equal(list.length, 1);
  assert.equal(list[0].size, 5000000);
  for (let i = 0; i < 50; i++) list = M.addToList(list, { url: `https://cdn.test/v${i}.mp4`, kind: 'video', ext: 'mp4', size: 1 });
  assert.equal(list.length, M.MAX_LIST);
  assert.equal(list[0].url, 'https://cdn.test/v49.mp4');
});
test('the page button prefers the biggest video file over audio and streams', () => {
  const best = M.pickBest([
    { url: 'u1', kind: 'audio', ext: 'm4a', size: 9e6 },
    { url: 'u2', kind: 'video', ext: 'mp4', size: 3e6 },
    { url: 'u3', kind: 'video', ext: 'mp4', size: 8e6 },
    { url: 'u4', kind: 'hls', ext: 'm3u8', size: 0 },
  ]);
  assert.equal(best.url, 'u3');
  // no files: an HLS playlist, the master one first; the list is newest first so the last entry was asked first
  assert.equal(M.pickBest([{ url: 'https://c.test/hi.m3u8', kind: 'hls' }, { url: 'https://c.test/master.m3u8', kind: 'hls' }, { url: 'https://c.test/x.m3u8', kind: 'hls' }]).url, 'https://c.test/master.m3u8');
  assert.equal(M.pickBest([{ url: 'https://c.test/b.m3u8', kind: 'hls' }, { url: 'https://c.test/a.m3u8', kind: 'hls' }]).url, 'https://c.test/a.m3u8');
  assert.equal(M.pickBest([{ url: 'd', kind: 'dash' }]), null);
  assert.equal(M.hlsUrl('https://c.test/a.m3u8?t=1'), 'https://c.test/a.m3u8?t=1');
  assert.equal(M.hlsUrl('https://c.test/play/12'), 'https://c.test/play/12#kdm-hls');
});
test('file names: page title first, else the name in the URL, never unsafe characters', () => {
  assert.equal(M.suggestName('My: "Trip" / 2026', 'https://x.test/a.mp4', 'mp4'), 'My Trip 2026.mp4');
  assert.equal(M.suggestName('', 'https://x.test/path/holiday%20film.mp4?x=1', 'mp4'), 'holiday film.mp4');
  assert.equal(M.suggestName('', 'https://x.test/stream/12345', 'mp4'), 'video.mp4');
});

// ---- background wiring ------------------------------------------------------------------
const TOKEN = 'b'.repeat(32);
const added = [];
const server = createBridgeServer({ token: TOKEN, version: '1', onAdd: (r) => added.push(r) });
await listenOnFirstFree(server, 47631, 5);

function loadBackground() {
  const store = { token: TOKEN, enabled: true };
  const mem = {};
  let onHeaders; let onMessage; let onUpdated;
  const badges = [];
  const tabs = { 5: { id: 5, url: 'https://site.test/watch?v=1', title: 'Cool Video' } };
  const chrome = {
    storage: { local: { get: async (d) => ({ ...d, ...store }), set: async (v) => Object.assign(store, v) }, session: { get: async (k) => ({ [k]: mem[k] }), set: async (o) => Object.assign(mem, o), remove: (k) => delete mem[k] } },
    downloads: { onCreated: { addListener() {} }, onDeterminingFilename: { addListener() {} } },
    cookies: { getAll: async () => [{ name: 'sid', value: 'abc' }] },
    action: { setBadgeText: (o) => badges.push(o), setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener() {} } },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener: (f) => { onMessage = f; } } },
    webRequest: { onHeadersReceived: { addListener: (f) => { onHeaders = f; } } },
    tabs: { get: async (id) => tabs[id], query: async () => [tabs[5]], onUpdated: { addListener: (f) => { onUpdated = f; } }, onRemoved: { addListener() {} } },
  };
  const gl = { chrome, navigator: { userAgent: 'TestUA/1' } };
  const sandbox = { chrome, URL, fetch, AbortSignal, setTimeout, console, globalThis: gl, importScripts: () => vm.runInNewContext(read('media.js'), { globalThis: gl, URL }) };
  vm.runInNewContext(read('background.js'), sandbox);
  const ask = (msg, sender = {}) => new Promise((res) => { const r = onMessage(msg, sender, res); if (r !== true) setTimeout(() => res(undefined), 50); });
  const respond = (url, headers, extra = {}) => onHeaders({ tabId: 5, url, type: 'media', statusCode: 200, responseHeaders: Object.entries(headers).map(([name, value]) => ({ name, value })), ...extra });
  return { respond, ask, badges, tabs, navigate: () => onUpdated(5, { status: 'loading', url: 'https://site.test/next' }) };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test('a video the page loads is listed for its tab, with a badge count', async () => {
  const x = loadBackground();
  x.respond('https://cdn.test/v.mp4', { 'Content-Type': 'video/mp4', 'Content-Length': '30000000' });
  x.respond('https://cdn.test/seg1.ts', { 'Content-Type': 'video/mp2t', 'Content-Length': '900000' });
  await settle();
  const r = await x.ask({ type: 'media-list' });
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].url, 'https://cdn.test/v.mp4');
  assert.equal(x.badges.at(-1).text, '1');
});
test('Download from the popup reaches KDM with the page as referrer, the page title as name and the login cookies', async () => {
  const x = loadBackground();
  const res = await x.ask({ type: 'media-send', tabId: 5, url: 'https://cdn.test/v.mp4', ext: 'mp4' });
  assert.equal(res.ok, true);
  assert.equal(added.at(-1).url, 'https://cdn.test/v.mp4');
  assert.equal(added.at(-1).referrer, 'https://site.test/watch?v=1');
  assert.equal(added.at(-1).fileName, 'Cool Video.mp4');
  assert.equal(added.at(-1).cookie, 'sid=abc');
});
test('the button on the page: a real video address is sent as is; a blob: video uses what the network showed', async () => {
  const x = loadBackground();
  let res = await x.ask({ type: 'media-grab', src: 'https://cdn.test/direct.mp4' }, { tab: { id: 5 } });
  assert.equal(res.ok, true);
  assert.equal(added.at(-1).url, 'https://cdn.test/direct.mp4');
  x.respond('https://cdn.test/big.mp4', { 'Content-Type': 'video/mp4', 'Content-Length': '90000000' });
  await settle();
  res = await x.ask({ type: 'media-grab', src: 'blob:https://site.test/1234' }, { tab: { id: 5 } });
  assert.equal(res.ok, true);
  assert.equal(added.at(-1).url, 'https://cdn.test/big.mp4');
});
test('an HLS stream goes to KDM as a playlist link with the page title as .mp4 name', async () => {
  const x = loadBackground();
  x.respond('https://cdn.test/hls/master.m3u8', { 'Content-Type': 'application/vnd.apple.mpegurl' });
  x.respond('https://cdn.test/api/stream/9', { 'Content-Type': 'application/x-mpegURL' });
  await settle();
  let res = await x.ask({ type: 'media-send', tabId: 5, url: 'https://cdn.test/hls/master.m3u8', ext: 'm3u8' });
  assert.equal(res.ok, true);
  assert.equal(added.at(-1).url, 'https://cdn.test/hls/master.m3u8');
  assert.equal(added.at(-1).fileName, 'Cool Video.mp4');
  res = await x.ask({ type: 'media-send', tabId: 5, url: 'https://cdn.test/api/stream/9', ext: 'm3u8' });
  assert.equal(added.at(-1).url, 'https://cdn.test/api/stream/9#kdm-hls');
  // the page button on a blob: video picks the master playlist when no video file was seen
  res = await x.ask({ type: 'media-grab', src: 'blob:https://site.test/77' }, { tab: { id: 5 } });
  assert.equal(res.ok, true);
  assert.equal(added.at(-1).url, 'https://cdn.test/hls/master.m3u8');
});
test('the Referer is the player page that asked for the video (an iframe), not just the tab address', async () => {
  const x = loadBackground();
  x.respond('https://cdn.test/emb.mp4', { 'Content-Type': 'video/mp4', 'Content-Length': '30000000' }, { documentUrl: 'https://player.test/embed/42' });
  await settle();
  await x.ask({ type: 'media-send', tabId: 5, url: 'https://cdn.test/emb.mp4', ext: 'mp4' });
  assert.equal(added.at(-1).referrer, 'https://player.test/embed/42');
  await x.ask({ type: 'media-grab', src: 'https://cdn.test/other.mp4' }, { tab: { id: 5 }, url: 'https://frame.test/p/1' });
  assert.equal(added.at(-1).referrer, 'https://frame.test/p/1');
});
test('Chrome only tells the origin of the requester: that is used as Referer', async () => {
  const x = loadBackground();
  x.respond('https://cdn.test/c.mp4', { 'Content-Type': 'video/mp4', 'Content-Length': '30000000' }, { initiator: 'https://player.test' });
  await settle();
  await x.ask({ type: 'media-send', tabId: 5, url: 'https://cdn.test/c.mp4', ext: 'mp4' });
  assert.equal(added.at(-1).referrer, 'https://player.test/');
});
test('blob: video and nothing detected: the button says so instead of sending something wrong', async () => {
  const x = loadBackground();
  const res = await x.ask({ type: 'media-grab', src: 'blob:https://site.test/9' }, { tab: { id: 5 } });
  assert.deepEqual(plain(res), { ok: false, reason: 'none' });
});
test('opening another page in the tab empties its list', async () => {
  const x = loadBackground();
  x.respond('https://cdn.test/v.mp4', { 'Content-Type': 'video/mp4', 'Content-Length': '30000000' });
  await settle();
  x.navigate();
  await settle();
  assert.equal((await x.ask({ type: 'media-list' })).list.length, 0);
});
test.after(() => server.close());

test('video-site pages: a YouTube watch page is one; a playlist, a file link or another site is not', () => {
  assert.equal(M.isVideoSitePage('https://www.youtube.com/watch?v=abc123'), true);
  assert.equal(M.isVideoSitePage('https://youtu.be/abc123'), true);
  assert.equal(M.isVideoSitePage('https://www.youtube.com/shorts/abc123'), true);
  assert.equal(M.isVideoSitePage('https://vimeo.com/12345'), true);
  assert.equal(M.isVideoSitePage('https://www.youtube.com/'), false);
  assert.equal(M.isVideoSitePage('https://www.youtube.com/playlist?list=PL1'), false);
  assert.equal(M.isVideoSitePage('https://www.youtube.com/watch'), false);
  assert.equal(M.isVideoSitePage('https://cdn.vimeo.com/v/clip.mp4'), false);
  assert.equal(M.isVideoSitePage('https://example.com/watch?v=1'), false);
  assert.equal(M.isVideoSitePage('javascript:alert(1)'), false);
  assert.equal(M.isVideoSitePage('not a url'), false);
});
test('on a YouTube page the button and the popup send the page itself (for KDM\'s video downloader), not stream pieces', async () => {
  const x = loadBackground();
  const page = 'https://www.youtube.com/watch?v=abc123';
  x.tabs[5] = { id: 5, url: page, title: 'A Video - YouTube' };
  x.respond('https://rr1.googlevideo.com/videoplayback?id=1', { 'Content-Type': 'video/mp4', 'Content-Length': '90000000' });
  await settle();
  const list = await x.ask({ type: 'media-list' });
  assert.equal(list.site, page);
  assert.equal(list.list.length, 0);
  let res = await x.ask({ type: 'media-grab', src: 'blob:https://www.youtube.com/9' }, { tab: { id: 5, url: page } });
  assert.equal(res.ok, true);
  assert.equal(added.at(-1).url, page);
  res = await x.ask({ type: 'page-send', url: 'https://youtu.be/zzz999' });
  assert.equal(res.ok, true);
  assert.equal(added.at(-1).url, 'https://youtu.be/zzz999');
  const before = added.length;
  await x.ask({ type: 'page-send', url: 'https://evil.test/watch?v=1' }); // only video sites are accepted
  assert.equal(added.length, before);
});
