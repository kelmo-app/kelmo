// KDM download engine — dependency-free (Node >= 18). GPL-3.0-or-later.
// Features: multi-connection segmented download, dynamic segmentation (idle
// connections split the largest remaining segment), pause/resume across
// restarts via a sidecar state file, global speed limit, retry with backoff.
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { request } from './http.mjs';

const sleep = (ms, signal) =>
  new Promise((res) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });

/** Shared token-bucket limiter. bytesPerSec = 0 means unlimited. */
export class Limiter {
  constructor(bytesPerSec = 0) { this.rate = bytesPerSec; this.allow = bytesPerSec; this.last = Date.now(); }
  async take(n, signal) {
    if (!this.rate) return;
    for (;;) {
      const now = Date.now();
      this.allow = Math.min(this.rate, this.allow + ((now - this.last) / 1000) * this.rate);
      this.last = now;
      if (this.allow >= 0) { this.allow -= n; return; }
      await sleep(Math.ceil((-this.allow / this.rate) * 1000), signal);
      if (signal?.aborted) return;
    }
  }
}

export function fileNameFrom(url, headers) {
  const cd = headers.get('content-disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
  const raw = m ? decodeURIComponent(m[1] || m[2]) : decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  return path.basename(raw).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_') || 'download.bin';
}

/** Quick look at a link without downloading it: size, real file name, resume support, content type. */
export async function probeUrl(url, headers = {}, timeoutMs = 8000, proxy = null) {
  const r = await request(url, { headers: { ...headers, Range: 'bytes=0-0' }, signal: AbortSignal.timeout(timeoutMs), proxy });
  let size = 0, rangeOk = false;
  if (r.status === 206) {
    const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
    if (m) { size = +m[1]; rangeOk = true; }
  } else if (r.ok) size = +(r.headers.get('content-length') || 0);
  else { await r.body?.cancel().catch(() => {}); throw new Error(`HTTP ${r.status}`); }
  const out = {
    size, rangeOk,
    fileName: fileNameFrom(r.url || url, r.headers),
    contentType: (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(),
    finalUrl: r.url || url,
  };
  await r.body?.cancel().catch(() => {});
  return out;
}

/**
 * Link health check: never throws. Says whether the link answers, how fast, and why not if it doesn't.
 * `{ ok: true, ...probeUrl result, ms }` or `{ ok: false, status, error }` (status 0 = no HTTP answer).
 */
function hostOf(u) { try { return new URL(u).host; } catch { return ''; } }

export async function checkLink(url, headers = {}, timeoutMs = 8000, proxy = null) {
  const t0 = Date.now();
  try {
    const info = await probeUrl(url, headers, timeoutMs, proxy);
    return { ok: true, ...info, ms: Date.now() - t0 };
  } catch (e) {
    const m = /^HTTP (\d+)/.exec(e?.message || '');
    if (m) return { ok: false, status: +m[1], error: e.message };
    return { ok: false, status: 0, error: e?.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
}

export class Download extends EventEmitter {
  /** @param {{url:string,dir:string,fileName?:string,connections?:number,speedLimit?:number|Limiter,retries?:number,headers?:Record<string,string>,minSplit?:number}} o */
  constructor(o) {
    super();
    this.url = o.url; this.dir = o.dir; this.fileName = o.fileName;
    this.connections = o.connections ?? 8;
    this.limiter = o.speedLimit instanceof Limiter ? o.speedLimit : new Limiter(o.speedLimit ?? 0);
    this.shared = o.sharedLimiter ?? null; // global limiter shared by all downloads
    this.queueLimiter = o.queueLimiter ?? null; // limiter shared by the downloads of one queue
    this.retries = o.retries ?? 3;
    this.allocation = ['none', 'sparse', 'prealloc'].includes(o.allocation) ? o.allocation : 'sparse';
    this.headers = o.headers ?? {};
    this.proxy = o.proxy ?? null; // { host, port } or null = direct
    this.timeoutMs = o.timeoutMs ?? Math.max(5000, (o.timeoutSec ?? 30) * 1000);
    this.mirrors = (o.mirrors ?? []).filter((u) => /^https?:\/\//i.test(u) && u !== o.url).slice(0, 8);
    this.sources = [{ url: this.url, bad: 0 }];
    this.minSplit = o.minSplit ?? 256 * 1024;
    this.status = 'queued'; this.total = 0; this.rangeOk = false;
    this.segments = []; this.error = null; this.peakConnections = 0;
    this._ctl = null; this._fh = null; this._samples = []; this._active = 0; this._lastEmit = 0;
    this._wk = new Map(); // per-connection stats for the progress window
  }

  get downloaded() {
    if (!this.rangeOk) return this._streamed ?? 0;
    return this.total - this.segments.reduce((a, s) => a + Math.max(0, s.end - s.pos + 1), 0);
  }
  get part() { return path.join(this.dir, this.fileName + '.part'); }
  get statePath() { return path.join(this.dir, this.fileName + '.kdm'); }

  _set(status) { this.status = status; this.emit('state', status); }

  async _probe(signal) {
    const { r, done } = await this._req(this.url, { ...this.headers, Range: 'bytes=0-0' }, signal);
    done();
    if (r.status === 206) {
      const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
      if (m) { this.total = +m[1]; this.rangeOk = true; }
    } else if (r.ok) {
      this.total = +(r.headers.get('content-length') || 0);
    } else throw new Error(`HTTP ${r.status}`);
    this.etag = r.headers.get('etag') || null;
    this.fileName ??= fileNameFrom(r.url || this.url, r.headers);
    await r.body?.cancel().catch(() => {});
  }

  /**
   * One request with a "no answer" timeout for connecting and waiting for the headers.
   * `ctl` aborts just this request (the caller uses it as a stall watchdog while the body streams);
   * `done()` unlinks it from the download's own abort signal.
   */
  async _req(url, headers, parent) {
    const ctl = new AbortController();
    const link = () => ctl.abort();
    if (parent?.aborted) ctl.abort(); else parent?.addEventListener('abort', link, { once: true });
    const done = () => parent?.removeEventListener('abort', link);
    const timer = setTimeout(() => ctl.abort(new Error('timeout')), this.timeoutMs);
    try {
      const r = await request(url, { headers, signal: ctl.signal, proxy: this.proxy });
      return { r, ctl, done };
    } catch (e) {
      done();
      if (!parent?.aborted && ctl.signal.aborted) throw new Error('timeout: the server did not answer');
      throw e;
    } finally { clearTimeout(timer); }
  }

  /** Login cookies and referer belong to the site they came from: other hosts only get the user-agent. */
  _headersFor(url) {
    try { if (new URL(url).origin === new URL(this.url).origin) return this.headers; } catch { /* fall through */ }
    const h = {};
    for (const k of Object.keys(this.headers)) if (k.toLowerCase() === 'user-agent') h[k] = this.headers[k];
    return h;
  }

  /** The main link, or the first mirror that answers when the main one is down. */
  async _probeAny(signal) {
    const all = [this.url, ...this.mirrors];
    let last;
    for (const c of all) {
      this.url = c;
      try { await this._probe(signal); this.mirrors = all.filter((u) => u !== c); this._known = all; return; }
      catch (e) { if (signal.aborted) throw e; last = e; }
    }
    this.url = all[0];
    throw last;
  }

  /** Keep only mirrors that really serve the same file (same size, ranges honoured). */
  async _vetMirrors(signal) {
    this.sources = [{ url: this.url, bad: 0 }];
    if (!this.mirrors.length || !this.rangeOk) return;
    const check = async (u) => {
      const { r, done } = await this._req(u, { ...this._headersFor(u), Range: 'bytes=0-0' }, signal);
      done();
      const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
      await r.body?.cancel().catch(() => {});
      if (r.status !== 206 || !m || +m[1] !== this.total) throw new Error('not the same file');
    };
    const res = await Promise.allSettled(this.mirrors.map(check));
    this.mirrors.forEach((u, i) => { if (res[i].status === 'fulfilled') this.sources.push({ url: u, bad: 0 }); });
  }

  async start() {
    if (this.status === 'downloading') return;
    this._ctl = new AbortController();
    const { signal } = this._ctl;
    this._stop = null; this.error = null;
    this._wk.clear();
    this._set('connecting');
    try {
      await fs.mkdir(this.dir, { recursive: true });
      await this._probeAny(signal);
      await this._vetMirrors(signal);
      await this._loadOrInit();
      this._set('downloading');
      const timer = setInterval(() => this._emitProgress(true), 250);
      try {
        if (this.rangeOk) {
          const n = this.segments.filter((s) => s.pos <= s.end).length || 1;
          await Promise.all(Array.from({ length: Math.min(n, this.connections) }, (_, i) => this._worker(signal, i + 1)));
        } else await this._single(signal);
      } finally { clearInterval(timer); }
      await this._finish();
    } catch (e) {
      if (this._stop === 'cancelled') { await this._fh?.close().catch(() => {}); this._fh = null; await this._cleanup(); this._set('cancelled'); }
      else if (this._stop) { await this._persist(); await this._fh?.close().catch(() => {}); this._fh = null; this._set(this._stop); }
      else { this.error = e.message; await this._persist().catch(() => {}); await this._fh?.close().catch(() => {}); this._fh = null; this._set('failed'); }
    }
  }

  async _loadOrInit() {
    let saved = null;
    try { saved = JSON.parse(await fs.readFile(this.statePath, 'utf8')); } catch {}
    const ok = saved && (saved.url === this.url || (this._known ?? [this.url]).includes(saved.url)) && saved.total === this.total && saved.etag === this.etag && this.rangeOk;
    if (ok) { this.segments = saved.segments; this._fh = await fs.open(this.part, 'r+'); return; }
    this._fh = await fs.open(this.part, 'w+');
    this._streamed = 0;
    if (!this.rangeOk || !this.total) { this.segments = []; return; }
    if (this.allocation !== 'none') await this._fh.truncate(this.total);
    if (this.allocation === 'prealloc') {
      // really reserve the space now, and find out early if the disk is too small
      const block = Buffer.alloc(4 * 1024 * 1024);
      for (let pos = 0; pos < this.total; pos += block.length) await this._fh.write(block, 0, Math.min(block.length, this.total - pos), pos);
    }
    const n = Math.max(1, Math.min(this.connections, Math.ceil(this.total / this.minSplit)));
    const size = Math.ceil(this.total / n);
    this.segments = Array.from({ length: n }, (_, i) => {
      const start = i * size;
      return { start, pos: start, end: Math.min(this.total - 1, start + size - 1) };
    }).filter((s) => s.start <= s.end);
  }

  /** Claim an unclaimed segment, or split the largest active one in half. */
  _claim() {
    let seg = this.segments.find((s) => !s.busy && s.pos <= s.end);
    if (seg) { seg.busy = true; return seg; }
    let big = null;
    for (const s of this.segments) if (s.busy && s.end - s.pos + 1 > this.minSplit * 2 && (!big || s.end - s.pos > big.end - big.pos)) big = s;
    if (!big) return null;
    const mid = big.pos + Math.floor((big.end - big.pos + 1) / 2);
    seg = { start: mid, pos: mid, end: big.end, busy: true };
    big.end = mid - 1;
    this.segments.push(seg);
    return seg;
  }

  async _worker(signal, n = 1) {
    const w = { n, bytes: 0, samples: [], state: 'connecting', src: (n - 1) % this.sources.length };
    this._wk.set(n, w);
    for (let seg; (seg = this._claim()); ) {
      let attempt = 0;
      for (;;) {
        try { await this._fetchSegment(seg, signal, w); break; }
        catch (e) {
          if (signal.aborted) { seg.busy = false; throw e; }
          if (++attempt > this.retries) { seg.busy = false; w.state = 'failed'; throw e; }
          w.state = 'retrying';
          this._rotate(w);
          await sleep(300 * 2 ** attempt, signal);
          if (signal.aborted) { seg.busy = false; throw new Error('aborted'); }
        }
      }
      seg.busy = false;
    }
    w.state = 'finished';
  }

  /** After a failure: blame this source and move the worker to the next healthy one. */
  _rotate(w) {
    const n = this.sources.length;
    if (n < 2) return;
    this.sources[w.src % n].bad++;
    for (let i = 1; i <= n; i++) {
      const j = (w.src + i) % n;
      if (this.sources[j].bad < 2) { w.src = j; return; }
    }
    this.sources.forEach((x) => { x.bad = 0; }); // everything looks bad: start over rather than give up
  }

  async _fetchSegment(seg, signal, w = { bytes: 0, samples: [], state: '', src: 0 }) {
    if (seg.pos > seg.end) return;
    w.state = 'connecting';
    const url = this.sources[w.src % this.sources.length].url;
    const { r, ctl, done } = await this._req(url, { ...this._headersFor(url), Range: `bytes=${seg.pos}-${seg.end}` }, signal);
    if (r.status !== 206) { done(); await r.body?.cancel?.().catch?.(() => {}); throw new Error(`HTTP ${r.status} (range not honoured)`); }
    this._active++; this.peakConnections = Math.max(this.peakConnections, this._active);
    w.state = 'receiving';
    let stall;
    const arm = () => { clearTimeout(stall); stall = setTimeout(() => ctl.abort(new Error('timeout')), this.timeoutMs); };
    arm();
    try {
      for await (const chunk of r.body) {
        arm();
        if (seg.pos > seg.end) break; // another worker took our tail
        const buf = chunk.length > seg.end - seg.pos + 1 ? chunk.subarray(0, seg.end - seg.pos + 1) : chunk;
        await this.limiter.take(buf.length, signal);
        await this.shared?.take(buf.length, signal);
        await this.queueLimiter?.take(buf.length, signal);
        await this._fh.write(buf, 0, buf.length, seg.pos);
        seg.pos += buf.length;
        w.bytes += buf.length;
        const t = Date.now();
        w.samples.push([t, buf.length]);
        while (w.samples.length && t - w.samples[0][0] > 3000) w.samples.shift();
        this._sample(buf.length);
      }
    } catch (e) {
      if (!signal.aborted && ctl.signal.aborted) throw new Error('timeout: the connection stalled');
      throw e;
    } finally { clearTimeout(stall); done(); this._active--; }
    if (seg.pos <= seg.end) throw new Error('connection closed early');
  }

  async _single(signal) {
    const { r, ctl, done } = await this._req(this.url, this.headers, signal);
    if (!r.ok) { done(); throw new Error(`HTTP ${r.status}`); }
    this._active = 1; this.peakConnections = 1; this._streamed = 0;
    let stall;
    const arm = () => { clearTimeout(stall); stall = setTimeout(() => ctl.abort(new Error('timeout')), this.timeoutMs); };
    arm();
    try {
      for await (const chunk of r.body) {
        arm();
        await this.limiter.take(chunk.length, signal);
        await this.shared?.take(chunk.length, signal);
        await this.queueLimiter?.take(chunk.length, signal);
        await this._fh.write(chunk, 0, chunk.length, this._streamed);
        this._streamed += chunk.length; this._sample(chunk.length);
      }
    } catch (e) {
      if (!signal.aborted && ctl.signal.aborted) throw new Error('timeout: the connection stalled');
      throw e;
    } finally { clearTimeout(stall); done(); this._active = 0; }
    this.total ||= this._streamed;
  }

  /** Live view for the progress window: how far each part of the file is, and what each connection is doing. */
  get detail() {
    const now = Date.now();
    const rate = (samples) => {
      const s = samples.filter(([t]) => now - t <= 3000);
      return s.length ? s.reduce((a, [, n]) => a + n, 0) / Math.max(1, Math.min(3, (now - s[0][0]) / 1000)) : 0;
    };
    if (!this.rangeOk) {
      return { segments: [], workers: this._active ? [{ n: 1, bytes: this._streamed ?? 0, speed: this.speed, state: 'receiving' }] : [] };
    }
    const segments = this.segments.map((s) => [s.start, s.pos, s.end]).sort((a, b) => a[0] - b[0]);
    const workers = [...this._wk.values()].sort((a, b) => a.n - b.n).map((w) => ({ n: w.n, bytes: w.bytes, speed: rate(w.samples), state: w.state, ...(this.sources.length > 1 ? { host: hostOf(this.sources[w.src % this.sources.length].url) } : {}) }));
    return { segments, workers, mirrors: this.sources.length };
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
  _emitProgress(force) {
    const now = Date.now();
    if (!force && now - this._lastEmit < 200) return;
    this._lastEmit = now;
    const speed = this.speed, left = Math.max(0, this.total - this.downloaded);
    this.emit('progress', { downloaded: this.downloaded, total: this.total, speed, eta: speed > 0 && this.total ? left / speed : null, connections: this._active, detail: this.detail });
  }

  async _persist() {
    if (!this.rangeOk || !this.segments.length) return;
    const segments = this.segments.map(({ start, pos, end }) => ({ start, pos, end }));
    await fs.writeFile(this.statePath, JSON.stringify({ url: this.url, total: this.total, etag: this.etag, segments }));
  }

  async _finish() {
    await this._fh.close(); this._fh = null;
    if (this.rangeOk && this.downloaded < this.total) throw new Error('incomplete download');
    await fs.rename(this.part, path.join(this.dir, this.fileName));
    await fs.rm(this.statePath, { force: true });
    this._emitProgress(true);
    this._set('completed');
  }

  pause() { if (this._ctl && ['connecting', 'downloading'].includes(this.status)) { this._stop = 'paused'; this._ctl.abort(); } }
  async _cleanup() { if (this.fileName) { await fs.rm(this.part, { force: true }); await fs.rm(this.statePath, { force: true }); } }
  async cancel() {
    this._stop = 'cancelled';
    if (['connecting', 'downloading'].includes(this.status)) { this._ctl.abort(); return; }
    await this._cleanup(); this._set('cancelled');
  }
  setSpeedLimit(bytesPerSec) { this.limiter.rate = bytesPerSec; this.limiter.allow = Math.min(this.limiter.allow, bytesPerSec); }
}
