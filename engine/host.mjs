// Engine host — owns all live Download instances and speaks a tiny command/event
// protocol. Electron-agnostic: electron/main.cjs wires it to IPC, tests call it directly.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Download, Limiter, probeUrl, checkLink } from './download.mjs';
import { verifyFile } from './hash.mjs';
import { HlsDownload, isHlsUrl, hlsBaseName, findFfmpeg } from './hls.mjs';
import { TorrentDownload, isTorrentUrl } from './torrent.mjs';
import { YtDlpDownload, isVideoSiteUrl, findYtDlp, installYtDlp, probeVideo, findJsRuntime, uniqueVideoName, removeVideoPartials } from './ytdlp.mjs';

const TERMINAL = new Set(['completed', 'failed', 'paused', 'cancelled']);

export function expandHome(p) {
  if (!p) return os.homedir();
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

/** "report.pdf" exists → "report (1).pdf". A leftover .part file means we are resuming, so keep the name. */
export function uniqueName(dir, name) {
  const taken = (n) => fs.existsSync(path.join(dir, n));
  if (!taken(name) || taken(name + '.part')) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const cand = `${base} (${i})${ext}`;
    if (!taken(cand) || taken(cand + '.part')) return cand;
  }
  return name;
}

/** Delete only KDM's own temporary files (.part / .kdm) — never the finished download. */
async function removePartials(dir, fileName) {
  const name = path.basename(String(fileName));
  await fsp.rm(path.join(dir, name + '.part'), { force: true });
  await fsp.rm(path.join(dir, name + '.kdm'), { force: true });
  // HLS leftovers: the downloaded pieces and the half-joined tracks
  await fsp.rm(path.join(dir, name + '.kdmparts'), { recursive: true, force: true });
  for (const i of [0, 1]) await fsp.rm(path.join(dir, `${name}.${i}.part`), { force: true });
}

function waitTerminal(d) {
  return new Promise((res) => {
    if (TERMINAL.has(d.status)) return res();
    const on = (s) => { if (TERMINAL.has(s)) { d.off('state', on); res(); } };
    d.on('state', on);
  });
}

/** @param {(event: object) => void} emit */
/** Only these request headers may come from the UI, one line each. */
export function cleanHeaders(h) {
  const out = {};
  if (!h || typeof h !== 'object') return out;
  for (const [k, v] of Object.entries(h)) {
    const name = ['cookie', 'referer', 'user-agent'].find((n) => n === String(k).toLowerCase());
    if (name && typeof v === 'string') {
      const val = v.replace(/[\r\n\0]/g, '').trim().slice(0, 16 * 1024);
      if (val) out[name] = val;
    }
  }
  return out;
}

/** Only a plain { host, port } is accepted as a proxy. */
export function cleanProxy(p) {
  if (!p || typeof p.host !== 'string' || !/^[\w.-]{1,253}$/.test(p.host)) return null;
  const port = Math.trunc(+p.port);
  return port >= 1 && port <= 65535 ? { host: p.host, port } : null;
}
/** The person's own User-Agent setting is the default; the browser's (from the extension) wins when present. */
export function withUserAgent(headers, ua) {
  if (headers['user-agent'] || typeof ua !== 'string' || !ua.trim()) return headers;
  return { ...headers, 'user-agent': ua.replace(/[\r\n]/g, ' ').trim().slice(0, 512) };
}
const timeoutMs = (spec) => (Number.isFinite(+spec.timeoutSec) && +spec.timeoutSec > 0 ? Math.max(5, +spec.timeoutSec) * 1000 : 8000);

/** "Basic …" header value for a login (a user name cannot contain ":", RFC 7617). */
export function basicHeader(user, pass) {
  return `Basic ${Buffer.from(`${String(user).replace(/:/g, '')}:${pass}`, 'utf8').toString('base64')}`;
}
const okBasic = (v) => (typeof v === 'string' && /^Basic [A-Za-z0-9+/=]{1,4000}$/.test(v) ? v : null);

/**
 * A login inside the address ("https://user:pass@host/file") moves into an Authorization header, because `fetch`
 * refuses addresses that carry a login. `basicAuth` (already a header value) from the app wins over the address.
 */
export function splitAuth(spec) {
  let url = spec.url;
  let basic = okBasic(spec.basicAuth);
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      if (!basic) basic = basicHeader(decodeURIComponent(u.username), decodeURIComponent(u.password));
      u.username = '';
      u.password = '';
      url = u.href;
    }
  } catch { /* the caller rejects invalid links */ }
  return { url, headers: basic ? { authorization: basic } : {} };
}

/** A playlist link is shown as the file it will become (.mp4 with ffmpeg, else .ts); there is no size to show. */
function streamInfo(info, url, ffmpeg) {
  const isPlaylist = isHlsUrl(url) || /mpegurl/i.test(info.contentType || '');
  if (!isPlaylist) return info;
  return { ...info, size: 0, rangeOk: false, stream: true, fileName: `${hlsBaseName('', url)}.${ffmpeg ? 'mp4' : 'ts'}` };
}

/** @param {(event: object) => void} emit  @param {{ ffmpeg?: string | null, ytdlpDir?: string, jsRuntime?: string | null, jsFallback?: string }} [opts] ffmpeg: path, or null for "not installed"; unset = look for it. ytdlpDir: where KDM keeps its copy of yt-dlp. */
export function createHost(emit, opts = {}) {
  const live = new Map();
  const ffmpegPath = () => (opts.ffmpeg !== undefined ? Promise.resolve(opts.ffmpeg) : findFfmpeg());
  const ytdlpDir = opts.ytdlpDir || path.join(os.homedir(), '.kdm', 'bin');
  const jsRuntime = () => (opts.jsRuntime !== undefined ? Promise.resolve(opts.jsRuntime) : findJsRuntime(opts.jsFallback));
  const shared = new Limiter(0);
  const queues = new Map(); // queue id -> Limiter shared by every download of that queue
  const queueLimiter = (id) => {
    if (typeof id !== 'string' || !/^[\w.:-]{1,80}$/.test(id)) return null;
    if (!queues.has(id)) queues.set(id, new Limiter(0));
    return queues.get(id);
  };
  const setRate = (l, bps) => { l.rate = Math.max(0, +bps || 0); l.allow = Math.min(l.allow, l.rate); };

  async function start(spec) {
    if (!spec || typeof spec.id !== 'string' || !(/^https?:\/\//i.test(spec.url || '') || isTorrentUrl(spec.url))) throw new Error('Invalid download request');
    const prev = live.get(spec.id);
    if (prev) {
      if (!prev._stop && !TERMINAL.has(prev.status)) return; // already running: start is idempotent
      await waitTerminal(prev);
    }
    const dir = expandHome(spec.dir);
    const auth = splitAuth(spec);
    spec = { ...spec, url: auth.url };
    const common = {
      url: spec.url,
      dir,
      connections: spec.connections || 8,
      speedLimit: spec.speedLimit || 0,
      sharedLimiter: shared,
      queueLimiter: (() => { const l = queueLimiter(spec.queueId); if (l && spec.queueLimit !== undefined) setRate(l, spec.queueLimit); return l; })(),
      retries: Number.isFinite(+spec.retries) ? Math.max(0, Math.min(10, +spec.retries)) : 3,
      headers: withUserAgent({ ...cleanHeaders(spec.headers), ...auth.headers }, spec.userAgent),
      proxy: cleanProxy(spec.proxy),
      timeoutSec: Number.isFinite(+spec.timeoutSec) && +spec.timeoutSec > 0 ? +spec.timeoutSec : 30,
    };
    const torrent = isTorrentUrl(spec.url);
    const hls = !torrent && (isHlsUrl(spec.url) || /\.m3u8?$/i.test(String(spec.fileName || '')));
    const video = !hls && !torrent && (spec.video || isVideoSiteUrl(spec.url));
    let bin = null;
    if (video) {
      bin = await findYtDlp(ytdlpDir);
      if (!bin) {
        emit({ id: spec.id, type: 'state', status: 'failed', error: 'The video downloader is not installed yet: Settings → Video sites → Install', fileName: spec.fileName ?? null, total: 0, rangeOk: false, path: null });
        return;
      }
    }
    const d = torrent
      ? new TorrentDownload({ ...common, clientFactory: opts.torrentClient })
      : video
      ? new YtDlpDownload({
        ...common,
        bin: bin.path,
        fileName: spec.fileName ? uniqueVideoName(dir, spec.fileName) : undefined,
        choice: spec.video && typeof spec.video.choice === 'string' ? spec.video.choice : 'best',
        expectedTotal: spec.video && Number.isFinite(+spec.video.size) ? +spec.video.size : 0,
        ffmpeg: await ffmpegPath(),
        runtime: await jsRuntime(),
        cookie: spec.video && spec.video.useLogin && spec.headers ? (spec.headers.Cookie || spec.headers.cookie || '') : '',
      })
      : hls
      ? new HlsDownload({ ...common, fileName: spec.fileName, ffmpeg: await ffmpegPath(), uniqueName })
      : new Download({
        ...common,
        fileName: spec.fileName ? uniqueName(dir, spec.fileName) : undefined,
        allocation: spec.allocation,
        mirrors: Array.isArray(spec.mirrors) ? spec.mirrors.filter((u) => typeof u === 'string' && u.length < 4096).slice(0, 8) : [],
      });
    live.set(spec.id, d);
    d.on('progress', (p) => emit({ id: spec.id, type: 'progress', ...p }));
    d.on('state', (status) => {
      emit({
        id: spec.id, type: 'state', status, error: d.error,
        fileName: d.fileName ?? null, total: d.total, rangeOk: d.rangeOk,
        path: d.fileName ? path.join(d.dir, d.fileName) : null,
      });
      if (TERMINAL.has(status) && live.get(spec.id) === d) live.delete(spec.id);
    });
    void d.start();
  }

  return {
    start,
    pause: (id) => live.get(id)?.pause(),
    cancel: async (id, loc) => {
      const d = live.get(id);
      if (d) return d.cancel();
      if (loc && typeof loc.dir === 'string' && typeof loc.fileName === 'string') {
        await removePartials(expandHome(loc.dir), loc.fileName);
        if (loc.video) await removeVideoPartials(expandHome(loc.dir), loc.fileName);
      }
    },
    setSpeedLimit: (id, bps) => live.get(id)?.setSpeedLimit(Math.max(0, +bps || 0)),
    /** The speed cap of one queue, shared by all its downloads (0 = unlimited). */
    setQueueLimit: (id, bps) => { const l = queueLimiter(id); if (l) setRate(l, bps); },
    setGlobalLimit: (bps) => { shared.rate = Math.max(0, +bps || 0); shared.allow = Math.min(shared.allow, shared.rate); },
    probe: async (spec) => {
      if (!spec || !/^https?:\/\//i.test(spec.url || '')) throw new Error('Invalid link');
      const a = splitAuth(spec);
      const info = await probeUrl(a.url, withUserAgent({ ...cleanHeaders(spec.headers), ...a.headers }, spec.userAgent), timeoutMs(spec), cleanProxy(spec.proxy));
      return streamInfo(info, a.url, await ffmpegPath());
    },
    health: async (spec) => {
      if (!spec || !/^https?:\/\//i.test(spec.url || '')) return { ok: false, status: 0, error: 'invalid' };
      const a = splitAuth(spec);
      const r = await checkLink(a.url, withUserAgent({ ...cleanHeaders(spec.headers), ...a.headers }, spec.userAgent), timeoutMs(spec), cleanProxy(spec.proxy));
      return r.ok ? streamInfo(r, a.url, await ffmpegPath()) : r;
    },
    /** Hash a finished download. `expected` (optional) is the checksum the website published. */
    verify: async (spec) => {
      if (!spec || typeof spec.dir !== 'string' || typeof spec.fileName !== 'string') throw new Error('Invalid verify request');
      const file = path.join(expandHome(spec.dir), path.basename(spec.fileName));
      return verifyFile(file, { algo: typeof spec.algo === 'string' ? spec.algo : 'SHA256', expected: typeof spec.expected === 'string' ? spec.expected : '' });
    },
    /** Is the video downloader (yt-dlp) there, and what it needs to do its best (ffmpeg to join video and sound, a JavaScript runtime for YouTube). */
    videoStatus: async () => {
      const bin = await findYtDlp(ytdlpDir);
      return { installed: !!bin, version: bin ? bin.version : '', managed: bin ? bin.managed : false, ffmpeg: !!(await ffmpegPath()), runtime: await jsRuntime() };
    },
    /** Download the official yt-dlp (checked against its published SHA-256) into KDM's own folder. Also used to update it. */
    videoInstall: async (spec = {}) => {
      const r = await installYtDlp({ dir: ytdlpDir, proxy: cleanProxy(spec.proxy), base: spec.base });
      return { ok: true, version: r.version };
    },
    /** What is behind a video-site link: title, length, available qualities. */
    videoProbe: async (spec) => {
      if (!spec || !/^https?:\/\//i.test(spec.url || '')) throw new Error('Invalid link');
      const bin = await findYtDlp(ytdlpDir);
      if (!bin) return { ok: false, needInstall: true };
      return probeVideo({ bin: bin.path, url: spec.url, runtime: await jsRuntime(), proxy: cleanProxy(spec.proxy), cookie: typeof spec.cookie === 'string' ? spec.cookie.slice(0, 16384) : '' });
    },
    activeCount: () => live.size,
  };
}
