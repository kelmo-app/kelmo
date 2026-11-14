// Video sites (YouTube and friends) through yt-dlp, an open-source (Unlicense) downloader that knows how those sites work.
// KDM does not bundle it: with the user's permission it fetches the official release from GitHub into its own folder,
// checks the published SHA-256, and runs it as a separate program. Dependency-free (Node >= 18). GPL-3.0-or-later.
//
// What this file does: find / install yt-dlp, look at a link (quality list), and run a download with real progress,
// pause / resume (yt-dlp continues its .part files), cancel and a speed limit.
// What it does not do: bypass DRM, or anything yt-dlp itself cannot do. Sites change often; updating yt-dlp fixes most breakage.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { request } from './http.mjs';
import { Limiter } from './download.mjs';

/* ----------------------------------------------------------------------------------------- which links */

/** Sites that need yt-dlp: a plain download of these pages would only save a web page. Keep in sync with src/lib/videoSites.ts. */
const SITES = [
  /(^|\.)youtube\.com$/, /^youtu\.be$/, /(^|\.)youtube-nocookie\.com$/,
  /(^|\.)vimeo\.com$/, /(^|\.)dailymotion\.com$/, /^dai\.ly$/, /(^|\.)bilibili\.com$/, /^b23\.tv$/,
  /(^|\.)twitch\.tv$/, /(^|\.)tiktok\.com$/, /(^|\.)instagram\.com$/, /(^|\.)facebook\.com$/, /^fb\.watch$/,
  /(^|\.)twitter\.com$/, /(^|\.)x\.com$/, /(^|\.)reddit\.com$/, /(^|\.)soundcloud\.com$/, /(^|\.)bandcamp\.com$/,
];

/** Is this a page of a video site (not a direct file link on it)? */
export function isVideoSiteUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.toLowerCase();
  if (!SITES.some((re) => re.test(host))) return false;
  if (/\.(mp4|webm|mkv|mp3|m4a|jpg|png|zip)$/i.test(u.pathname)) return false; // a direct file
  if (/(^|\.)youtube\.com$/.test(host)) {
    const p = u.pathname;
    if (p === '/watch') return u.searchParams.has('v');
    return p === '/playlist' || /^\/(shorts|live|embed|v)\/[\w-]+/.test(p); // not the home page, search results or a channel's tabs
  }
  return true;
}

/* ----------------------------------------------------------------------------------------- finding / installing */

const isWin = (p = process.platform) => p === 'win32';
const binName = (p = process.platform) => (isWin(p) ? 'yt-dlp.exe' : 'yt-dlp');

/** The name of the release file for this system, or null when yt-dlp has no standalone build for it. */
export function assetFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return arch === 'arm64' ? 'yt-dlp_arm64.exe' : 'yt-dlp.exe';
  if (platform === 'linux') return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : arch === 'x64' ? 'yt-dlp_linux' : null;
  if (platform === 'darwin') return 'yt-dlp_macos';
  return null;
}

function run(cmd, args, { timeout = 15000, maxBuffer = 1 << 20, env } = {}) {
  return new Promise((res, rej) => execFile(cmd, args, { timeout, maxBuffer, env: env ? { ...process.env, ...env } : process.env, windowsHide: true }, (err, stdout, stderr) => (err ? rej(Object.assign(err, { stderr: String(stderr || '') })) : res(String(stdout)))));
}

/** The yt-dlp KDM will use: its own downloaded copy first, else one the system provides. { path, version, managed } or null. */
export async function findYtDlp(dir) {
  const own = path.join(dir, binName());
  for (const [p, managed] of [[own, true], ['yt-dlp', false]]) {
    try {
      if (managed) await fs.access(p);
      const version = (await run(p, ['--version'])).trim();
      if (version) return { path: p, version, managed };
    } catch { /* try the next one */ }
  }
  return null;
}

/** Download the official release, check it against the published SHA-256 list, then put it in place. */
export async function installYtDlp({ dir, base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download', platform = process.platform, arch = process.arch, proxy = null, onProgress } = {}) {
  const asset = assetFor(platform, arch);
  if (!asset) throw new Error(`There is no yt-dlp build for ${platform}/${arch}`);
  const get = async (name) => {
    const r = await request(`${base}/${name}`, { proxy });
    if (!r.ok) throw new Error(`Could not download ${name} (HTTP ${r.status})`);
    return r;
  };
  const sums = await (await get('SHA2-256SUMS')).text();
  const line = sums.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).find((p) => p.length >= 2 && p[p.length - 1].replace(/^\*/, '') === asset);
  const expected = line && /^[a-f0-9]{64}$/i.test(line[0]) ? line[0].toLowerCase() : '';
  if (!expected) throw new Error('The checksum list does not contain this file, so it was not installed');

  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${binName(platform)}.download`);
  const r = await get(asset);
  const total = Number(r.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  const out = await fs.open(tmp, 'w', 0o755);
  let got = 0;
  try {
    for await (const chunk of r.body) {
      hash.update(chunk);
      await out.write(chunk);
      got += chunk.length;
      onProgress?.({ downloaded: got, total });
    }
  } finally { await out.close(); }
  if (hash.digest('hex') !== expected) {
    await fs.rm(tmp, { force: true });
    throw new Error('The downloaded file does not match its published checksum, so it was thrown away');
  }
  const dest = path.join(dir, binName(platform));
  await fs.chmod(tmp, 0o755);
  await fs.rename(tmp, dest);
  const version = (await run(dest, ['--version']).catch(() => '')).trim();
  return { path: dest, version, managed: true };
}

/** JavaScript runtimes yt-dlp can use to solve YouTube's puzzles: Deno is its default, Node is accepted when named. */
let runtimeCache = null;
const onPath = () => {
  runtimeCache ??= (async () => {
    for (const cmd of ['deno', 'node', 'bun']) {
      try { await run(cmd, ['--version'], { timeout: 4000 }); return cmd; } catch { /* next */ }
    }
    return null;
  })();
  return runtimeCache;
};
/** What to hand to yt-dlp: a runtime found on the system, else (installed app, no Node on the computer) the program's own Electron acting as Node. */
export const jsRuntimeFrom = (found, fallbackPath) => found || (fallbackPath ? `node:${fallbackPath}` : null);
export async function findJsRuntime(fallbackPath) { return jsRuntimeFrom(await onPath(), fallbackPath); }
/** Electron only behaves like Node for the helper when told to. */
export const runtimeEnv = (runtime) => (typeof runtime === 'string' && runtime.startsWith('node:') ? { ELECTRON_RUN_AS_NODE: '1' } : undefined);
export const jsArgs = (runtime) => (runtime && runtime !== 'deno' ? ['--js-runtimes', runtime] : []);

/* ----------------------------------------------------------------------------------------- looking at a link */

const cleanName = (s) => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120);

/** What the File Info window needs from yt-dlp's JSON. Pure, so it can be tested without a network. */
export function summarize(j) {
  if (!j || typeof j !== 'object') throw new Error('Unexpected answer from yt-dlp');
  if (j._type === 'playlist') {
    return { ok: true, playlist: true, title: cleanName(j.title) || 'Playlist', count: Array.isArray(j.entries) ? j.entries.length : 0, heights: [], audioOnly: false, live: false };
  }
  const formats = Array.isArray(j.formats) ? j.formats : [];
  const duration = Number(j.duration) || 0;
  // YouTube often gives no file size: then the bit rate (kbit/s) times the length is a close estimate
  const size = (f) => Number(f.filesize || f.filesize_approx) || (duration && Number(f.tbr || f.vbr || f.abr) ? Math.round(Number(f.tbr || f.vbr || f.abr) * 125 * duration) : 0);
  const video = formats.filter((f) => f.vcodec && f.vcodec !== 'none' && f.height);
  const audio = formats.filter((f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
  const bestAudio = audio.slice().sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0))[0];
  const heights = [...new Set(video.map((f) => f.height))].sort((a, b) => b - a);
  // qualities that come as one ready-made file (sound included): the only ones usable without ffmpeg
  const muxedHeights = [...new Set(video.filter((f) => f.acodec && f.acodec !== 'none').map((f) => f.height))].sort((a, b) => b - a);
  const sizes = {};
  for (const h of heights) {
    const best = video.filter((f) => f.height === h).sort((a, b) => (Number(b.tbr) || 0) - (Number(a.tbr) || 0))[0];
    const hasOwnAudio = best.acodec && best.acodec !== 'none';
    const own = size(best);
    sizes[h] = own ? own + (hasOwnAudio ? 0 : bestAudio ? size(bestAudio) : 0) : 0; // unknown stays unknown: the sound alone would be a wrong total
  }
  return {
    ok: true,
    playlist: false,
    title: cleanName(j.title) || cleanName(j.id) || 'video',
    uploader: cleanName(j.uploader || j.channel || ''),
    duration,
    thumbnail: typeof j.thumbnail === 'string' && /^https:\/\//.test(j.thumbnail) ? j.thumbnail : '',
    live: !!j.is_live,
    heights,
    muxedHeights,
    sizes,
    audioSize: bestAudio ? size(bestAudio) : 0,
    audioOnly: heights.length === 0 && audio.length > 0,
    id: typeof j.id === 'string' ? j.id : '',
  };
}

/**
 * The browser's cookies as a Netscape cookie file (what yt-dlp's --cookies reads), kept only for the time one yt-dlp process runs.
 * `header` is a Cookie header ("a=1; b=2") as the browser extension sends it; every cookie is attached to the site's main domain.
 * Returns the file path, or '' when there is nothing usable.
 */
export async function writeCookieFile(header, url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return ''; }
  const labels = host.split('.');
  const domain = '.' + (/(^|\.)youtube(-nocookie)?\.com$/.test(host) || host === 'youtu.be' ? 'youtube.com' : labels.slice(-2).join('.'));
  const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
  const lines = String(header || '').split(';').map((p) => p.trim()).filter(Boolean).flatMap((p) => {
    const i = p.indexOf('=');
    if (i <= 0) return [];
    const name = p.slice(0, i).trim();
    const value = p.slice(i + 1).trim();
    if (/[\t\r\n]/.test(name + value)) return [];
    return [`${domain}\tTRUE\t/\tTRUE\t${exp}\t${name}\t${value}`];
  });
  if (!lines.length) return '';
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kdm-ck-'));
  const file = path.join(dir, 'cookies.txt');
  await fs.writeFile(file, `# Netscape HTTP Cookie File\n${lines.join('\n')}\n`, { mode: 0o600 });
  return file;
}
export async function removeCookieFile(file) {
  if (!file) return;
  await fs.rm(path.dirname(file), { recursive: true, force: true }).catch(() => {});
}

/** The yt-dlp `-f` selector for a choice: "best", a height like "720", or "audio". Without ffmpeg only ready-made single files can be used. */
export function formatSelector(choice, hasFfmpeg) {
  const h = /^\d{3,4}$/.test(String(choice)) ? Number(choice) : 0;
  if (choice === 'audio') return 'ba/b';
  if (hasFfmpeg) return h ? `bv*[height<=${h}]+ba/b[height<=${h}]/b` : 'bv*+ba/b';
  return h ? `b[height<=${h}]/b` : 'b';
}

export async function probeVideo({ bin, url, runtime, proxy, cookie, timeoutMs = 60000 }) {
  const cookieFile = cookie ? await writeCookieFile(cookie, url) : '';
  try { return await probeWith({ bin, url, runtime, proxy, cookieFile, timeoutMs }); } finally { await removeCookieFile(cookieFile); }
}

async function probeWith({ bin, url, runtime, proxy, cookieFile, timeoutMs }) {
  const args = ['-J', '--no-playlist', '--no-warnings', '--no-call-home', ...jsArgs(runtime), ...(cookieFile ? ['--cookies', cookieFile] : [])];
  if (proxy?.host) args.push('--proxy', `http://${proxy.host}:${proxy.port}`);
  const attempt = async (a) => run(bin, [...a, '--', url], { timeout: timeoutMs, maxBuffer: 256 << 20, env: runtimeEnv(runtime) });
  let out;
  try { out = await attempt(args); } catch (e) {
    if (/no such option|unrecognized arguments/i.test(e.stderr || '')) out = await attempt(args.filter((x) => x !== '--no-call-home')); // older yt-dlp
    else throw new Error(friendlyError(e.stderr) || 'yt-dlp could not read this link');
  }
  return summarize(JSON.parse(out));
}

/** The reason from yt-dlp's last "ERROR:" line, trimmed to something a person can read. */
export function friendlyError(stderr) {
  const lines = String(stderr || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const err = lines.filter((l) => /^ERROR:/i.test(l)).pop() || lines.pop() || '';
  return err.replace(/^ERROR:\s*(\[[^\]]+\]\s*[\w-]*:\s*)?/i, '').replace(/\x1b\[[0-9;]*m/g, '').slice(0, 300);
}

/* ----------------------------------------------------------------------------------------- the download */

const PROGRESS = 'download:KDMP|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress.filename)s';
const num = (s) => { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : 0; };

/** One progress line of ours → numbers, or null for any other line. */
export function parseProgress(line) {
  if (!line.startsWith('KDMP|')) return null;
  const p = line.split('|');
  return { downloaded: num(p[1]), total: num(p[2]) || num(p[3]), speed: num(p[4]), eta: p[5] && p[5] !== 'NA' ? num(p[5]) || null : null, file: p.slice(6).join('|') };
}

const TEMP_RE = /\.(part|ytdl|temp)$|\.f\d+(\.[a-z0-9]+)?(\.part)?$|\.part-Frag\d+$/i;

export class YtDlpDownload extends EventEmitter {
  /** @param {{url:string,dir:string,fileName?:string,bin:string,choice?:string,expectedTotal?:number,speedLimit?:number|Limiter,sharedLimiter?:Limiter,queueLimiter?:Limiter,proxy?:object|null,ffmpeg?:string|null,runtime?:string|null,uniqueName?:(dir:string,name:string)=>string}} o */
  constructor(o) {
    super();
    this.url = o.url;
    this.dir = o.dir;
    this.bin = o.bin;
    this.choice = o.choice || 'best';
    this.expectedTotal = num(o.expectedTotal);
    this.limiter = o.speedLimit instanceof Limiter ? o.speedLimit : new Limiter(o.speedLimit ?? 0);
    this.shared = o.sharedLimiter ?? null;
    this.queueLimiter = o.queueLimiter ?? null;
    this.proxy = o.proxy ?? null;
    this.ffmpeg = o.ffmpeg ?? null;
    this.runtime = o.runtime ?? null;
    this.cookie = typeof o.cookie === 'string' ? o.cookie : ''; // the browser's login for the site (only when the user chose to use it)
    this._cookieFile = '';
    this.base = cleanName((o.fileName || 'video').replace(/\.[a-z0-9]{2,4}$/i, '')) || 'video';
    this.ext = (String(o.fileName || '').match(/\.([a-z0-9]{2,4})$/i) || [])[1] || (this.choice === 'audio' ? 'm4a' : 'mp4');
    this.fileName = o.fileName ? `${this.base}.${this.ext}` : undefined;
    this.status = 'queued';
    this.total = this.expectedTotal;
    this.rangeOk = true; // yt-dlp continues from its .part files
    this.error = null;
    this.isStream = true;
    this._child = null; this._stop = null; this._doneBytes = 0; this._cur = 0; this._curFile = ''; this._curTotal = 0;
    this._speed = 0; this._eta = null; this._lastEmit = 0; this._errLines = [];
  }

  get downloaded() { return this._doneBytes + this._cur; }
  _set(status) { this.status = status; this.emit('state', status); }

  /** The one speed cap that applies: the smallest non-zero of this download's, the queue's and the global limit. */
  _limitRate() {
    const rates = [this.limiter, this.queueLimiter, this.shared].map((l) => (l ? l.rate : 0)).filter((r) => r > 0);
    return rates.length ? Math.min(...rates) : 0;
  }

  _args() {
    const a = ['--newline', '--no-playlist', '--no-warnings', '--continue', '--no-colors', '--progress-template', PROGRESS,
      '-f', formatSelector(this.choice, !!this.ffmpeg), '-o', path.join(this.dir, `${this.base}.%(ext)s`), '--concurrent-fragments', '4', '--retries', '5', '--fragment-retries', '5'];
    if (this.choice === 'audio' && this.ffmpeg) a.push('-x', '--audio-format', 'mp3');
    else if (this.ffmpeg) a.push('--merge-output-format', 'mp4');
    if (this.ffmpeg && this.ffmpeg !== 'ffmpeg') a.push('--ffmpeg-location', this.ffmpeg);
    const rate = this._limitRate();
    if (rate > 0) a.push('--limit-rate', String(Math.max(1024, Math.round(rate))));
    if (this.proxy?.host) a.push('--proxy', `http://${this.proxy.host}:${this.proxy.port}`);
    if (this._cookieFile) a.push('--cookies', this._cookieFile);
    a.push(...jsArgs(this.runtime), '--', this.url);
    return a;
  }

  _onLine(line) {
    const p = parseProgress(line);
    if (!p) {
      if (/^ERROR:/i.test(line)) this._errLines.push(line);
      return;
    }
    if (p.file && p.file !== this._curFile) { // yt-dlp moved on to the next file (video, then audio)
      if (this._curFile) this._doneBytes += this._curTotal || this._cur;
      this._curFile = p.file;
    }
    this._cur = p.downloaded;
    this._curTotal = p.total || this._curTotal;
    this._speed = p.speed;
    this._eta = p.eta;
    if (!this.expectedTotal) this.total = this._doneBytes + (this._curTotal || 0);
    this._emitProgress(false);
  }

  _emitProgress(force) {
    const now = Date.now();
    if (!force && now - this._lastEmit < 250) return;
    this._lastEmit = now;
    const total = this.total || 0;
    const downloaded = total ? Math.min(this.downloaded, total) : this.downloaded;
    this.emit('progress', { downloaded, total, speed: this.status === 'downloading' ? this._speed : 0, eta: this._eta, connections: 1, detail: this.detail });
  }

  get detail() { return { segments: [], workers: [{ n: 1, bytes: this.downloaded, speed: this._speed, state: this.status === 'downloading' ? 'receiving' : 'idle' }] }; }

  async start() {
    if (this.status === 'downloading' || this.status === 'connecting') return;
    this._stop = null; this.error = null; this._errLines = [];
    this._doneBytes = 0; this._cur = 0; this._curFile = ''; this._curTotal = 0;
    this._set('connecting');
    try { await fs.mkdir(this.dir, { recursive: true }); } catch (e) { this.error = e.message; return this._set('failed'); }
    for (;;) {
      const code = await this._spawn();
      if (this._stop === 'restart') { this._stop = null; this._set('connecting'); continue; } // the speed limit changed
      if (this._stop === 'cancelled') { await this._cleanup(); return this._set('cancelled'); }
      if (this._stop) return this._set(this._stop);
      if (code === 0) {
        const done = await this._finalFile();
        if (!done) { this.error = 'yt-dlp finished but the file was not found'; return this._set('failed'); }
        this.fileName = done.name;
        this.total = done.size;
        this._cur = done.size; this._doneBytes = 0;
        this._emitProgress(true);
        return this._set('completed');
      }
      const message = friendlyError(this._errLines.join('\n'));
      this.error = message || (code === null ? 'yt-dlp could not be started' : `yt-dlp stopped (code ${code})`);
      return this._set('failed');
    }
  }

  async _spawn() {
    this._cookieFile = this.cookie ? await writeCookieFile(this.cookie, this.url) : '';
    const cleanup = () => removeCookieFile(this._cookieFile);
    return new Promise((resolve) => {
      let child;
      try { child = spawn(this.bin, this._args(), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, ...runtimeEnv(this.runtime) } }); } catch (e) { this._errLines.push(`ERROR: ${e.message}`); void cleanup(); return resolve(null); }
      this._child = child;
      let buf = '';
      const feed = (chunk, isErr) => {
        buf += chunk.toString('utf8');
        let i;
        while ((i = buf.search(/\r|\n/)) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line) this._onLine(line);
          void isErr;
        }
      };
      child.stdout.on('data', (c) => { if (this.status === 'connecting') this._set('downloading'); feed(c, false); });
      child.stderr.on('data', (c) => feed(c, true));
      child.on('error', (e) => { this._errLines.push(`ERROR: ${e.message}`); this._child = null; cleanup().then(() => resolve(null)); });
      child.on('close', async (code) => { this._child = null; if (buf.trim()) this._onLine(buf.trim()); await cleanup(); resolve(code); }); // the cookie file is gone before anyone is told the download ended
    });
  }

  /** The finished file: the biggest file called "<name>.<something>" that is not one of yt-dlp's temporary pieces. */
  async _finalFile() {
    const names = (await fs.readdir(this.dir)).filter((n) => n.startsWith(`${this.base}.`) && !TEMP_RE.test(n));
    let best = null;
    for (const n of names) {
      const st = await fs.stat(path.join(this.dir, n)).catch(() => null);
      if (st && st.isFile() && (!best || st.size > best.size)) best = { name: n, size: st.size };
    }
    return best;
  }

  async _cleanup() {
    let names = [];
    try { names = await fs.readdir(this.dir); } catch { return; }
    for (const n of names) if (n.startsWith(`${this.base}.`) && TEMP_RE.test(n)) await fs.rm(path.join(this.dir, n), { force: true });
  }

  pause() {
    if (this._child && ['connecting', 'downloading'].includes(this.status)) { this._stop = 'paused'; this._child.kill('SIGTERM'); }
  }

  async cancel() {
    this._stop = 'cancelled';
    if (this._child) { this._child.kill('SIGTERM'); return; }
    await this._cleanup();
    this._set('cancelled');
  }

  /** A new speed cap takes effect by restarting yt-dlp (it continues where it was). */
  setSpeedLimit(bytesPerSec) {
    this.limiter.rate = bytesPerSec;
    this.limiter.allow = Math.min(this.limiter.allow, bytesPerSec);
    if (this._child && this.status === 'downloading' && !this._stop) { this._stop = 'restart'; this._child.kill('SIGTERM'); }
  }
}

/** "My video.mp4" exists → "My video (1).mp4". Leftover temporary pieces mean we are resuming, so the name stays. */
export function uniqueVideoName(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let files = [];
  try { files = fsSync.readdirSync(dir); } catch { return name; }
  const finished = (b) => files.some((n) => n.startsWith(`${b}.`) && !TEMP_RE.test(n));
  const partial = (b) => files.some((n) => n.startsWith(`${b}.`) && TEMP_RE.test(n));
  if (!finished(base) || partial(base)) return name;
  for (let i = 1; i < 1000; i++) {
    const b = `${base} (${i})`;
    if (!finished(b) || partial(b)) return `${b}${ext}`;
  }
  return name;
}

/** Remove only yt-dlp's temporary pieces for a video (never the finished file). */
export async function removeVideoPartials(dir, fileName) {
  const ext = path.extname(String(fileName));
  const base = path.basename(String(fileName)).slice(0, path.basename(String(fileName)).length - ext.length);
  let names = [];
  try { names = await fs.readdir(dir); } catch { return; }
  for (const n of names) if (n.startsWith(`${base}.`) && TEMP_RE.test(n)) await fs.rm(path.join(dir, n), { force: true });
}
