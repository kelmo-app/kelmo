// HLS (".m3u8") downloads: read the playlist, fetch the many small pieces in parallel, join them into one file.
// Dependency-free (Node >= 18). GPL-3.0-or-later.
//
// Supported: master playlists (the best quality is chosen), plain and AES-128 encrypted pieces, fMP4 pieces (EXT-X-MAP),
// byte ranges, separate audio (needs ffmpeg to join), pause / resume, speed limits, retries, proxy.
// Not supported: live streams (no end), SAMPLE-AES / DRM. KDM does not try to get around copy protection.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { request } from './http.mjs';
import { Limiter } from './download.mjs';

const sleep = (ms, signal) =>
  new Promise((res) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });

/* ----------------------------------------------------------------------------------------- playlist parsing */

/** `KEY=value,KEY2="quoted, value"` → { KEY: 'value', KEY2: 'quoted, value' } */
export function parseAttrs(s) {
  const out = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
  return out;
}

const abs = (uri, base) => new URL(uri, base).href;

/**
 * @returns {{type:'master', variants:Array<{url:string,bandwidth:number,width:number,height:number,audio?:string}>, audio:Record<string,string>}
 *          | {type:'media', segments:Array<{url:string,duration:number,key:null|{uri:string,iv:string|null},range:null|{len:number,offset:number|null}}>, map:null|{url:string,range:null|object}, endList:boolean, mediaSequence:number}}
 */
export function parsePlaylist(text, baseUrl) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines[0] !== '#EXTM3U') throw new Error('This is not an HLS playlist');

  if (lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'))) {
    const variants = [];
    const audio = {}; // group id -> playlist url
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('#EXT-X-MEDIA:')) {
        const a = parseAttrs(l.slice(13));
        if (a.TYPE === 'AUDIO' && a.URI && a['GROUP-ID'] && (a.DEFAULT === 'YES' || !audio[a['GROUP-ID']])) audio[a['GROUP-ID']] = abs(a.URI, baseUrl);
      } else if (l.startsWith('#EXT-X-STREAM-INF:')) {
        const a = parseAttrs(l.slice(18));
        const next = lines.slice(i + 1).find((x) => !x.startsWith('#'));
        if (!next) continue;
        const [w, h] = String(a.RESOLUTION || '0x0').split('x').map(Number);
        variants.push({ url: abs(next, baseUrl), bandwidth: Number(a.BANDWIDTH) || 0, width: w || 0, height: h || 0, audio: a.AUDIO });
      }
    }
    if (!variants.length) throw new Error('The playlist lists no video');
    return { type: 'master', variants, audio };
  }

  const segments = [];
  let key = null;
  let map = null;
  let duration = 0;
  let range = null;
  let lastEnd = 0;
  let endList = false;
  let mediaSequence = 0;
  for (const l of lines) {
    if (l.startsWith('#EXT-X-MEDIA-SEQUENCE:')) mediaSequence = Number(l.slice(22)) || 0;
    else if (l.startsWith('#EXT-X-KEY:')) {
      const a = parseAttrs(l.slice(11));
      if (a.METHOD === 'NONE') key = null;
      else if (a.METHOD === 'AES-128' && a.URI) key = { uri: abs(a.URI, baseUrl), iv: a.IV || null };
      else throw new Error(`This stream uses ${a.METHOD || 'unknown'} protection, which KDM does not download`);
    } else if (l.startsWith('#EXT-X-MAP:')) {
      const a = parseAttrs(l.slice(11));
      if (a.URI) {
        let r = null;
        if (a.BYTERANGE) { const [len, off] = a.BYTERANGE.split('@').map(Number); r = { len, offset: Number.isFinite(off) ? off : 0 }; }
        map = { url: abs(a.URI, baseUrl), range: r };
      }
    } else if (l.startsWith('#EXTINF:')) duration = parseFloat(l.slice(8)) || 0;
    else if (l.startsWith('#EXT-X-BYTERANGE:')) {
      const [len, off] = l.slice(17).split('@').map(Number);
      range = { len, offset: Number.isFinite(off) ? off : null };
    } else if (l === '#EXT-X-ENDLIST') endList = true;
    else if (!l.startsWith('#')) {
      let r = range;
      if (r) {
        if (r.offset === null) r = { len: r.len, offset: lastEnd };
        lastEnd = r.offset + r.len;
      }
      segments.push({ url: abs(l, baseUrl), duration, key, range: r });
      duration = 0;
      range = null;
    }
  }
  return { type: 'media', segments, map, endList, mediaSequence };
}

/** The best variant: the highest bandwidth (then the biggest picture). */
export function pickVariant(variants) {
  return variants.slice().sort((a, b) => b.bandwidth - a.bandwidth || b.height - a.height)[0];
}

/** AES-128 IV: the one in the playlist, else the piece's sequence number as 16 big-endian bytes. */
export function ivFor(key, sequence) {
  if (key && key.iv) return Buffer.from(key.iv.replace(/^0x/i, '').padStart(32, '0'), 'hex');
  const iv = Buffer.alloc(16);
  iv.writeUInt32BE(sequence >>> 0, 12);
  return iv;
}

/** A link that is an HLS playlist: ".m3u8" in the address, or the marker the extension adds to playlists it found by content type. */
export const isHlsUrl = (u) => /\.m3u8(\?|#|$)/i.test(String(u)) || /#kdm-hls$/.test(String(u));

/** "Title.m3u8" / "Title" → "Title" (the extension is chosen when the playlist is known). */
export function hlsBaseName(name, url) {
  let n = path.basename(String(name || ''));
  if (!n) { try { n = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); } catch { n = ''; } }
  n = n.replace(/\.(m3u8?|mp4|ts|m4v)$/i, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  return n && !/^(master|index|playlist|manifest|video)$/i.test(n) ? n : 'video';
}

/** Is ffmpeg installed? Resolves with its path (or just the command name) or null. Result is remembered. */
let ffmpegCache;
export function findFfmpeg() {
  ffmpegCache ??= new Promise((res) => {
    execFile('ffmpeg', ['-version'], { timeout: 5000 }, (err) => res(err ? null : 'ffmpeg'));
  });
  return ffmpegCache;
}

function run(cmd, args) {
  return new Promise((res, rej) => execFile(cmd, args, { timeout: 6 * 3600 * 1000, maxBuffer: 1 << 20 }, (err, _o, stderr) => (err ? rej(new Error(String(stderr || err.message).split('\n').filter(Boolean).pop() || 'ffmpeg failed')) : res())));
}

/* ----------------------------------------------------------------------------------------- the download */

const NO_RETRY = new Set([400, 401, 403, 404, 410]);
const BUCKETS = 120; // the progress window's bar gets this many parts at most

export class HlsDownload extends EventEmitter {
  /** @param {{url:string,dir:string,fileName?:string,connections?:number,speedLimit?:number,sharedLimiter?:Limiter,retries?:number,headers?:object,proxy?:object|null,timeoutSec?:number,timeoutMs?:number,ffmpeg?:string|null,uniqueName?:(dir:string,name:string)=>string}} o */
  constructor(o) {
    super();
    this.url = String(o.url).replace(/#kdm-hls$/, '');
    this.dir = o.dir;
    this.base = hlsBaseName(o.fileName, this.url);
    this.fileName = undefined; // known once the playlist has been read
    this.connections = Math.max(1, Math.min(o.connections ?? 8, 8));
    this.limiter = o.speedLimit instanceof Limiter ? o.speedLimit : new Limiter(o.speedLimit ?? 0);
    this.shared = o.sharedLimiter ?? null;
    this.queueLimiter = o.queueLimiter ?? null;
    this.retries = o.retries ?? 3;
    this.headers = o.headers ?? {};
    this.proxy = o.proxy ?? null;
    this.timeoutMs = o.timeoutMs ?? Math.max(5000, (o.timeoutSec ?? 30) * 1000);
    this.ffmpeg = o.ffmpeg ?? null;
    this.uniqueName = o.uniqueName ?? ((_d, n) => n);
    this.status = 'queued';
    this.total = 0;
    this.rangeOk = true; // pieces can be resumed
    this.error = null;
    this.peakConnections = 0;
    this.isStream = true;
    this._ctl = null; this._stop = null; this._samples = []; this._active = 0; this._lastEmit = 0;
    this._wk = new Map();
    this._jobs = []; this._doneBytes = 0; this._doneCount = 0; this._keys = new Map();
  }

  get downloaded() { return this._doneBytes + [...this._wk.values()].reduce((a, w) => a + (w.cur || 0), 0); }
  _set(status) { this.status = status; this.emit('state', status); }

  async _get(url, signal, extra = {}, onChunk = null) {
    const ctl = new AbortController();
    const link = () => ctl.abort();
    if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', link, { once: true });
    let timer = setTimeout(() => ctl.abort(new Error('timeout')), this.timeoutMs);
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => ctl.abort(new Error('timeout')), this.timeoutMs); };
    try {
      const h = this._headersFor(url);
      const r = await request(url, { headers: { ...h, ...extra }, signal: ctl.signal, proxy: this.proxy });
      if (!r.ok) { await r.body?.cancel?.().catch?.(() => {}); const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
      arm();
      const parts = [];
      for await (const chunk of r.body) {
        arm();
        if (onChunk) await onChunk(chunk.length);
        parts.push(chunk);
      }
      return Buffer.concat(parts);
    } catch (e) {
      if (!signal.aborted && ctl.signal.aborted) throw new Error('timeout: the server did not answer');
      throw e;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', link); }
  }

  _headersFor(url) {
    try { if (new URL(url).origin === new URL(this.url).origin) return this.headers; } catch { /* fall through */ }
    const h = {};
    for (const k of Object.keys(this.headers)) if (k.toLowerCase() === 'user-agent' || k.toLowerCase() === 'referer') h[k] = this.headers[k];
    return h; // pieces often live on another host (CDN) and check the Referer, never the login cookie
  }

  async _retry(fn, signal) {
    for (let a = 0; ; a++) {
      try { return await fn(); } catch (e) {
        if (signal.aborted || a >= this.retries || NO_RETRY.has(e.status)) throw e;
        await sleep(Math.min(8000, 500 * 2 ** a), signal);
        if (signal.aborted) throw e;
      }
    }
  }

  async _playlist(url, signal) {
    const text = (await this._retry(() => this._get(url, signal), signal)).toString('utf8');
    return parsePlaylist(text, url);
  }

  /** Playlists → the list of pieces for each track (video, maybe separate audio). */
  async _plan(signal) {
    let pl = await this._playlist(this.url, signal);
    const tracks = [];
    if (pl.type === 'master') {
      const v = pickVariant(pl.variants);
      const audioUrl = v.audio && pl.audio[v.audio];
      const vp = await this._playlist(v.url, signal);
      if (vp.type !== 'media') throw new Error('Unexpected playlist layout');
      tracks.push(vp);
      if (audioUrl) {
        const ap = await this._playlist(audioUrl, signal);
        if (ap.type === 'media' && ap.segments.length) tracks.push(ap);
      }
    } else tracks.push(pl);
    for (const t of tracks) {
      if (!t.endList) throw new Error('This is a live stream (it has no end). KDM downloads finished videos only.');
      if (!t.segments.length) throw new Error('The playlist has no video pieces');
    }
    if (tracks.length > 1 && !this.ffmpeg) throw new Error('This video keeps its sound in a separate file. Install ffmpeg (Fedora: sudo dnf install ffmpeg-free) so KDM can join them.');
    return tracks;
  }

  async start() {
    if (this.status === 'downloading') return;
    this._ctl = new AbortController();
    const { signal } = this._ctl;
    this._stop = null; this.error = null; this._wk.clear();
    this._set('connecting');
    try {
      await fs.mkdir(this.dir, { recursive: true });
      const tracks = await this._plan(signal);
      const fmp4 = tracks.some((t) => t.map);
      const ext = this.ffmpeg || fmp4 ? 'mp4' : 'ts';
      if (!this.fileName) {
        this.fileName = this.uniqueName(this.dir, `${this.base}.${ext}`);
      }
      this.tmp = path.join(this.dir, `${this.fileName}.kdmparts`);
      await fs.mkdir(this.tmp, { recursive: true });
      this._jobs = [];
      tracks.forEach((t, ti) => {
        if (t.map) this._jobs.push({ track: ti, i: -1, url: t.map.url, range: t.map.range, key: null, seq: 0, size: 0, done: false });
        t.segments.forEach((s, i) => this._jobs.push({ track: ti, i, url: s.url, range: s.range, key: s.key, seq: t.mediaSequence + i, size: 0, done: false }));
      });
      this._tracks = tracks.length;
      this._resumeScan = await this._scanExisting();
      this._set('downloading');
      const timer = setInterval(() => this._emitProgress(true), 250);
      try {
        let next = 0;
        const todo = this._jobs.filter((j) => !j.done);
        const worker = async (n) => {
          const w = { n, bytes: 0, samples: [], state: 'connecting', cur: 0 };
          this._wk.set(n, w);
          for (;;) {
            if (signal.aborted) return;
            const j = todo[next++];
            if (!j) { w.state = 'done'; return; }
            try { await this._piece(j, signal, w); } catch (e) { this._ctl.abort(); throw e; } // one piece failed for good: stop the others
          }
        };
        await Promise.all(Array.from({ length: Math.min(this.connections, Math.max(1, todo.length)) }, (_, i) => worker(i + 1)));
      } finally { clearInterval(timer); }
      if (signal.aborted) throw new Error('aborted');
      await this._assemble(tracks);
      this._emitProgress(true);
      this._set('completed');
    } catch (e) {
      if (this._stop === 'cancelled') { await this._cleanup(); this._set('cancelled'); }
      else if (this._stop) this._set(this._stop);
      else { this.error = e.message; this._set('failed'); }
    }
  }

  _file(j) { return path.join(this.tmp, `${j.track}-${j.i + 1}.seg`); }

  /** Pieces fetched in an earlier run are kept: only the missing ones are downloaded again. */
  async _scanExisting() {
    let found = 0;
    for (const j of this._jobs) {
      try { j.size = (await fs.stat(this._file(j))).size; j.done = true; this._doneBytes += j.size; this._doneCount++; found++; } catch { /* not there yet */ }
    }
    this.total = this._estimate();
    return found;
  }

  _estimate() {
    if (!this._doneCount) return 0;
    return Math.round((this._doneBytes / this._doneCount) * this._jobs.length);
  }

  async _key(j, signal) {
    if (!this._keys.has(j.key.uri)) {
      const k = await this._retry(() => this._get(j.key.uri, signal), signal);
      if (k.length !== 16) throw new Error('The decryption key has the wrong size');
      this._keys.set(j.key.uri, k);
    }
    return this._keys.get(j.key.uri);
  }

  async _piece(j, signal, w) {
    w.state = 'receiving'; w.cur = 0;
    this._active++; this.peakConnections = Math.max(this.peakConnections, this._active);
    try {
      let buf = await this._retry(async () => {
        w.cur = 0;
        const extra = j.range ? { Range: `bytes=${j.range.offset}-${j.range.offset + j.range.len - 1}` } : {};
        return this._get(j.url, signal, extra, async (n) => {
          await this.limiter.take(n, signal);
          await this.shared?.take(n, signal);
          await this.queueLimiter?.take(n, signal);
          w.cur += n; w.bytes += n;
          const t = Date.now();
          w.samples.push([t, n]);
          while (w.samples.length && t - w.samples[0][0] > 3000) w.samples.shift();
          this._sample(n);
        });
      }, signal);
      if (j.key) {
        const d = crypto.createDecipheriv('aes-128-cbc', await this._key(j, signal), ivFor(j.key, j.seq));
        buf = Buffer.concat([d.update(buf), d.final()]);
      }
      const f = this._file(j);
      await fs.writeFile(`${f}.tmp`, buf);
      await fs.rename(`${f}.tmp`, f);
      j.size = buf.length; j.done = true;
      this._doneBytes += buf.length; this._doneCount++; w.cur = 0;
      this.total = this._estimate();
    } finally { this._active--; w.state = 'connecting'; }
  }

  /** Join the pieces of each track, then (with ffmpeg) put video and sound into one .mp4. */
  async _assemble(tracks) {
    const outs = [];
    for (let ti = 0; ti < tracks.length; ti++) {
      const out = path.join(this.dir, `${this.fileName}.${ti}.part`);
      const fh = await fs.open(out, 'w');
      try {
        for (const j of this._jobs.filter((x) => x.track === ti)) {
          await fh.write(await fs.readFile(this._file(j)));
        }
      } finally { await fh.close(); }
      outs.push(out);
    }
    const final = path.join(this.dir, this.fileName);
    const ext = path.extname(this.fileName).toLowerCase();
    if (this.ffmpeg && (outs.length > 1 || ext === '.mp4')) {
      try {
        const args = ['-y', '-v', 'error', ...outs.flatMap((o) => ['-i', o]), '-c', 'copy']; // ffmpeg adds the AAC fix for .mp4 itself
        if (outs.length > 1) args.push('-map', '0:v:0', '-map', '1:a:0');
        args.push('-movflags', '+faststart', '-f', 'mp4', `${final}.part`);
        await run(this.ffmpeg, args);
        await fs.rename(`${final}.part`, final);
        await Promise.all(outs.map((o) => fs.rm(o, { force: true })));
      } catch (e) {
        await fs.rm(`${final}.part`, { force: true });
        if (outs.length > 1) throw new Error(`Joining video and sound failed: ${e.message}`);
        // one track: keep the plain joined file as .ts
        this.fileName = this.uniqueName(this.dir, `${this.base}.ts`);
        await fs.rename(outs[0], path.join(this.dir, this.fileName));
      }
    } else {
      await fs.rename(outs[0], final);
    }
    this.total = (await fs.stat(path.join(this.dir, this.fileName))).size;
    this._doneBytes = this.total;
    await fs.rm(this.tmp, { recursive: true, force: true });
  }

  _sample(n) {
    const now = Date.now();
    this._samples.push([now, n]);
    while (this._samples.length && now - this._samples[0][0] > 3000) this._samples.shift();
    this._emitProgress(false);
  }
  get speed() {
    const now = Date.now();
    const s = this._samples.filter(([t]) => now - t <= 3000);
    if (!s.length) return 0;
    return s.reduce((a, [, n]) => a + n, 0) / Math.max(1, Math.min(3, (now - s[0][0]) / 1000));
  }

  /** Progress window: the file split into at most BUCKETS parts, each as full as its pieces are done. */
  get detail() {
    const now = Date.now();
    const rate = (samples) => {
      const s = samples.filter(([t]) => now - t <= 3000);
      return s.length ? s.reduce((a, [, n]) => a + n, 0) / Math.max(1, Math.min(3, (now - s[0][0]) / 1000)) : 0;
    };
    const workers = [...this._wk.values()].filter((w) => w.state !== 'done').sort((a, b) => a.n - b.n).map((w) => ({ n: w.n, bytes: w.bytes, speed: rate(w.samples), state: w.state }));
    const jobs = this._jobs;
    const total = this.total || 0;
    if (!jobs.length || !total) return { segments: [], workers };
    const per = Math.ceil(jobs.length / BUCKETS);
    const unit = total / jobs.length;
    const segments = [];
    for (let b = 0; b * per < jobs.length; b++) {
      const group = jobs.slice(b * per, (b + 1) * per);
      const start = Math.round(b * per * unit);
      const end = Math.round((b * per + group.length) * unit) - 1;
      const done = group.filter((j) => j.done).length;
      segments.push([start, start + Math.round(done * unit), end]);
    }
    return { segments, workers, mirrors: 1 };
  }

  _emitProgress(force) {
    const now = Date.now();
    if (!force && now - this._lastEmit < 200) return;
    this._lastEmit = now;
    const speed = this.speed;
    const total = this.total;
    const left = Math.max(0, total - this.downloaded);
    this.emit('progress', { downloaded: Math.min(this.downloaded, total || this.downloaded), total, speed, eta: speed > 0 && total ? left / speed : null, connections: this._active, detail: this.detail });
  }

  pause() { if (this._ctl && ['connecting', 'downloading'].includes(this.status)) { this._stop = 'paused'; this._ctl.abort(); } }
  async _cleanup() {
    if (this.fileName) {
      await fs.rm(this.tmp ?? path.join(this.dir, `${this.fileName}.kdmparts`), { recursive: true, force: true });
      for (let i = 0; i < 2; i++) await fs.rm(path.join(this.dir, `${this.fileName}.${i}.part`), { force: true });
      await fs.rm(path.join(this.dir, `${this.fileName}.part`), { force: true });
    }
  }
  async cancel() {
    this._stop = 'cancelled';
    if (['connecting', 'downloading'].includes(this.status)) { this._ctl.abort(); return; }
    await this._cleanup();
    this._set('cancelled');
  }
  setSpeedLimit(bytesPerSec) { this.limiter.rate = bytesPerSec; this.limiter.allow = Math.min(this.limiter.allow, bytesPerSec); }
}
