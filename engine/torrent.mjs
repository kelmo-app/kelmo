// BitTorrent downloads (magnet links and .torrent files) on top of the WebTorrent library.
// Same shape as the other engines (Download, HlsDownload, YtDlpDownload): an EventEmitter with
// start/pause/cancel/setSpeedLimit that emits 'state' and 'progress'. The client is injectable so tests
// can run without the real library or a network.
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Limiter } from './download.mjs';

export const isMagnet = (u) => /^magnet:\?/i.test(String(u || '').trim()) && /[?&]xt=urn:bt(?:ih|mh):/i.test(String(u));
const isTorrentFileUrl = (u) => {
  try {
    const x = new URL(u);
    return /^(https?|file):$/.test(x.protocol) && /\.torrent$/i.test(x.pathname);
  } catch { return false; }
};
/** A magnet link or a link to a .torrent file. */
/** Path (inside the download folder) of the biggest file of a torrent, or null. */
export function mainFileOf(files) {
  let best = null;
  for (const f of files || []) if (f && f.path && (!best || (f.length || 0) > (best.length || 0))) best = f;
  return best ? String(best.path) : null;
}

export const isTorrentUrl = (u) => isMagnet(u) || isTorrentFileUrl(u);

/** The name a magnet link carries ("dn=…"), or ''. */
export function magnetName(u) {
  try {
    const dn = new URL(String(u).trim()).searchParams.get('dn');
    return dn ? dn.replace(/[\\/\0]/g, '_').trim().slice(0, 200) : '';
  } catch { return ''; }
}

async function defaultClient(opts) {
  const mod = await import('webtorrent');
  const WebTorrent = mod.default ?? mod.WebTorrent;
  return new WebTorrent(opts);
}

// Public trackers added to magnet links, so a bare "magnet:?xt=…" (or one with dead trackers) still finds peers
// even when the DHT is slow or blocked on this network.
export const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.dler.org:6969/announce',
  'https://tracker.tamersunion.org:443/announce',
  'http://tracker.opentrackr.org:1337/announce',
];

const UNLIMITED = 1_000_000_000;
const log = (...a) => { try { console.log('[torrent]', ...a); } catch { /* no console */ } };

export class TorrentDownload extends EventEmitter {
  /** @param {{url:string,dir:string,speedLimit?:number|Limiter,sharedLimiter?:Limiter,queueLimiter?:Limiter,headers?:object,metadataTimeoutMs?:number,clientFactory?:(o:object)=>Promise<any>|any}} o */
  constructor(o) {
    super();
    this.url = o.url;
    this.dir = o.dir;
    this.limiter = o.speedLimit instanceof Limiter ? o.speedLimit : new Limiter(o.speedLimit ?? 0);
    this.shared = o.sharedLimiter ?? null;
    this.queueLimiter = o.queueLimiter ?? null;
    this.headers = o.headers || {};
    this.metadataTimeoutMs = o.metadataTimeoutMs ?? 120_000;
    this.clientFactory = o.clientFactory || defaultClient;
    this.fileName = magnetName(o.url) || undefined; // the real name arrives with the metadata
    this.status = 'queued';
    this.total = 0;
    this.rangeOk = true; // a torrent always continues where it was (the library checks the files on disk)
    this.error = null;
    this.isTorrent = true;
    this._client = null; this._torrent = null; this._timer = null; this._metaTimer = null; this._stop = null;
    this._last = { downloaded: 0, speed: 0, eta: null, peers: 0 };
  }

  get downloaded() { return this._last.downloaded; }
  _set(status) { this.status = status; this.emit('state', status); }

  _limitRate() {
    const rates = [this.limiter, this.queueLimiter, this.shared].map((l) => (l ? l.rate : 0)).filter((r) => r > 0);
    return rates.length ? Math.min(...rates) : 0;
  }
  _applyLimit() {
    if (!this._client) return;
    const r = this._limitRate();
    // Only ever ask the library to throttle when a limit is set. "Unlimited" is a very large number, never 0 or -1
    // (a library that reads those as "no data allowed" would stall the download).
    if (r > 0) this._client.throttleDownload?.(r);
    else if (this._throttled) this._client.throttleDownload?.(UNLIMITED);
    this._throttled = r > 0;
  }

  get detail() {
    return { segments: [], workers: [{ n: 1, bytes: this._last.downloaded, speed: this._last.speed, state: this.status === 'downloading' ? 'receiving' : 'idle' }] };
  }

  _emitProgress() {
    const t = this._torrent;
    if (t) {
      this._last = {
        downloaded: t.downloaded || 0,
        speed: this.status === 'downloading' ? t.downloadSpeed || 0 : 0,
        eta: Number.isFinite(t.timeRemaining) && t.timeRemaining > 0 && t.timeRemaining < 1e9 ? Math.round(t.timeRemaining / 1000) : null,
        peers: t.numPeers || 0,
      };
    }
    const total = this.total || 0;
    const downloaded = total ? Math.min(this._last.downloaded, total) : this._last.downloaded;
    this.emit('progress', { downloaded, total, speed: this._last.speed, eta: this._last.eta, connections: this._last.peers, detail: this.detail });
  }

  async _source() {
    if (isMagnet(this.url)) return this.url.trim();
    if (/^file:/i.test(this.url)) { // a .torrent file on this computer ("Open with KDM")
      const f = fileURLToPath(this.url);
      const st = await fs.stat(f);
      if (!/\.torrent$/i.test(f) || st.size > 10 * 1024 * 1024) throw new Error('That is not a .torrent file');
      const buf = await fs.readFile(f);
      if (buf[0] !== 0x64) throw new Error('That file is not a valid .torrent file');
      return buf;
    }
    const res = await fetch(this.url, { headers: this.headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`The .torrent file could not be fetched (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024 || buf[0] !== 0x64) throw new Error('That link is not a valid .torrent file');
    return buf;
  }

  _teardown() {
    clearInterval(this._timer); clearTimeout(this._metaTimer);
    this._timer = this._metaTimer = null;
    const c = this._client;
    this._client = null; this._torrent = null;
    return new Promise((res) => {
      if (!c) return res();
      try { c.destroy(() => res()); } catch { res(); }
    });
  }

  async _fail(msg) {
    log('FAILED:', msg);
    if (this._stop) return;
    this.error = msg;
    await this._teardown();
    this._set('failed');
  }

  async start() {
    if (['connecting', 'downloading'].includes(this.status)) return;
    this._stop = null; this.error = null; this._wired = false;
    this._set('connecting');
    try {
      const source = await this._source();
      if (this._stop) return;
      const client = await this.clientFactory({ dht: true, lsd: true, utp: false });
      if (this._stop) { try { client.destroy(); } catch { /* ignore */ } return; }
      this._client = client;
      client.on('error', (e) => void this._fail(friendly(e)));
      this._applyLimit();
      log('adding', typeof source === 'string' ? source.slice(0, 80) : `file (${source.length} bytes)`, '→', this.dir);
      const t = client.add(source, typeof source === 'string' ? { path: this.dir, announce: DEFAULT_TRACKERS } : { path: this.dir });
      this._torrent = t;
      t.on('warning', (e) => log('warning:', String(e && e.message ? e.message : e)));
      t.on('noPeers', (w) => log('no peers from', w));
      t.on('wire', () => { if (!this._wired) { this._wired = true; log('first peer connected'); } });
      t.on('error', (e) => void this._fail(friendly(e)));
      this._metaTimer = setTimeout(() => {
        if (!this.total) void this._fail('No sources found for this torrent. It may have no seeders, or the magnet link is incomplete.');
      }, this.metadataTimeoutMs);
      const onMeta = () => {
        log('metadata:', t.name, t.length, 'bytes,', (t.files || []).length, 'files');
        clearTimeout(this._metaTimer);
        this.total = t.length || 0;
        this.fileName = t.name || this.fileName;
        this.mainFile = mainFileOf(t.files); // the biggest file: what "Open" should play
        if (this.status === 'connecting') this.status = 'downloading';
        this.emit('state', this.status); // the host learns the real name and size
      };
      if (t.metadata || t.ready) onMeta(); else t.once('metadata', onMeta);
      t.once('done', async () => {
        this._emitProgress();
        this._last.downloaded = this.total;
        await this._teardown(); // KDM downloads; it does not keep seeding
        if (!this._stop) { this._emitProgress(); this._set('completed'); }
      });
      let tick = 0;
      this._timer = setInterval(() => {
        if (this.total) this._emitProgress();
        if (++tick % 10 === 0) log(`peers=${t.numPeers} down=${t.downloaded} speed=${Math.round(t.downloadSpeed || 0)} progress=${((t.progress || 0) * 100).toFixed(1)}% status=${this.status}`);
      }, 500);
    } catch (e) {
      await this._fail(friendly(e));
    }
  }

  pause() {
    if (!['connecting', 'downloading'].includes(this.status)) return;
    this._stop = 'paused';
    void this._teardown().then(() => this._set('paused')); // files stay; starting again re-checks them and continues
  }

  async cancel() {
    this._stop = 'cancelled';
    const t = this._torrent;
    const done = this.status === 'completed';
    if (t && !done) await new Promise((res) => { try { t.destroy({ destroyStore: true }, () => res()); } catch { res(); } });
    await this._teardown();
    this._set('cancelled');
  }

  setSpeedLimit(bytesPerSec) {
    this.limiter.rate = bytesPerSec;
    this.limiter.allow = Math.min(this.limiter.allow, bytesPerSec);
    this._applyLimit();
  }
}

function friendly(e) {
  const m = String(e && e.message ? e.message : e);
  if (/Cannot find (module|package) 'webtorrent'/i.test(m)) return 'The torrent engine is missing. Run "npm install" in the KDM folder (it needs the webtorrent package).';
  if (/ENOENT/.test(m)) return 'The .torrent file was not found. It may have been moved or deleted.';
  if (/ENOSPC/.test(m)) return 'The disk is full.';
  if (/EACCES|EPERM/.test(m)) return 'KDM is not allowed to write to that folder.';
  return m.slice(0, 300);
}
