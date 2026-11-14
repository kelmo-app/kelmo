// Video / audio detection for the KDM extension. Pure functions only (no browser APIs), so they can be tested in Node.
// Loaded by background.js (importScripts in Chrome's service worker, a plain script in Firefox) and exposed as KdmMedia.
(function (root) {
  const MEDIA_EXT = { mp4: 'video', m4v: 'video', webm: 'video', mkv: 'video', mov: 'video', flv: 'video', avi: 'video', mp3: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', opus: 'audio', flac: 'audio', wav: 'audio' };
  const SKIP_TYPES = new Set(['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'ping', 'csp_report', 'websocket']);
  const MIN_BYTES = 300 * 1024; // smaller files are ads, sound effects or stream pieces
  const MAX_LIST = 30;

  /** Pieces of a stream (".ts", ".m4s", "seg-12.mp4"…) are not downloads of their own. */
  function looksLikeSegment(url) {
    return /\.(ts|m4s|m4f|cmfv|cmfa)(\?|#|$)/i.test(url) || /[/_-](seg(ment)?|chunk|frag(ment)?)[-_]?\d+/i.test(url);
  }

  function extOf(url) {
    try {
      const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
      return m ? m[1].toLowerCase() : '';
    } catch { return ''; }
  }

  /** The same video is fetched many times with different byte ranges; keep one entry for it. */
  function dedupeKey(url) {
    try {
      const u = new URL(url);
      for (const k of ['range', 'bytestart', 'byteend', 'rn', 'rbuf', 'start', 'end', 'ptr']) u.searchParams.delete(k);
      u.hash = '';
      return u.href;
    } catch { return url; }
  }

  /** Total size of the file: from Content-Range for partial (206) answers, else Content-Length. 0 when unknown. */
  function totalSize(status, headers) {
    const range = headers['content-range'];
    if (status === 206 && range) {
      const m = /\/(\d+)\s*$/.exec(range);
      if (m) return Number(m[1]);
    }
    const len = Number(headers['content-length']);
    return Number.isFinite(len) && len > 0 && status !== 206 ? len : 0;
  }

  /**
   * @param {{ url: string, type?: string, status?: number, headers: Record<string,string> }} r  headers keys lowercase
   * @returns {{ url: string, kind: 'video'|'audio'|'hls'|'dash', ext: string, size: number } | null}
   */
  function classify(r) {
    if (!r || typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url)) return null;
    if (r.type && SKIP_TYPES.has(r.type)) return null;
    const status = r.status || 200;
    if (status !== 200 && status !== 206) return null;
    const ct = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = extOf(r.url);

    if (/mpegurl/.test(ct) || ext === 'm3u8') return { url: r.url, kind: 'hls', ext: 'm3u8', size: 0 };
    if (/dash\+xml/.test(ct) || ext === 'mpd') return { url: r.url, kind: 'dash', ext: 'mpd', size: 0 };
    if (looksLikeSegment(r.url)) return null;

    let kind = null;
    if (ct.startsWith('video/')) kind = 'video';
    else if (ct.startsWith('audio/')) kind = 'audio';
    else if ((ct === 'application/octet-stream' || ct === 'binary/octet-stream' || ct === '') && MEDIA_EXT[ext]) kind = MEDIA_EXT[ext];
    else if (ct === 'application/ogg') kind = 'audio';
    if (!kind) return null;

    const size = totalSize(status, r.headers);
    if (size && size < MIN_BYTES) return null;
    const e = ext && MEDIA_EXT[ext] ? ext : ct.split('/')[1] === 'mpeg' ? 'mp3' : ct.split('/')[1] || (kind === 'video' ? 'mp4' : 'mp3');
    return { url: r.url, kind, ext: e.replace(/^x-/, '').replace('quicktime', 'mov'), size };
  }

  /** A readable file name: the page title when there is one (that is what people recognise), else the name in the URL. */
  function suggestName(title, url, ext) {
    const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    let fromUrl = '';
    try {
      const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
      fromUrl = /\.[a-z0-9]{2,5}$/i.test(last) ? clean(last) : '';
    } catch { /* keep empty */ }
    const t = clean(title);
    if (t && t.length > 2) return `${t}.${ext}`;
    return fromUrl || `video.${ext}`;
  }

  /** Newest first, one entry per video, never more than MAX_LIST. A known size replaces an unknown one. */
  function addToList(list, entry) {
    const key = dedupeKey(entry.url);
    const old = list.find((e) => dedupeKey(e.url) === key);
    if (old) {
      if (entry.size && !old.size) old.size = entry.size;
      return list;
    }
    return [entry, ...list].slice(0, MAX_LIST);
  }

  /** The one the page button should send: files first (biggest), else an HLS playlist: the master one, else the first the page asked for. */
  function pickBest(list) {
    const files = list.filter((e) => e.kind === 'video' || e.kind === 'audio');
    if (files.length) {
      const pool = files.some((e) => e.kind === 'video') ? files.filter((e) => e.kind === 'video') : files;
      return pool.slice().sort((a, b) => (b.size || 0) - (a.size || 0))[0];
    }
    const hls = list.filter((e) => e.kind === 'hls');
    return hls.find((e) => /master/i.test(e.url)) || hls[hls.length - 1] || null; // the list is newest first: the last one was asked first
  }

  /** KDM recognises playlists by ".m3u8" in the address; a playlist found by its content type gets an invisible marker (a #fragment is never sent to a server). */
  function hlsUrl(url) {
    return /\.m3u8(\?|#|$)/i.test(url) ? url : `${url.replace(/#.*$/, '')}#kdm-hls`;
  }

  /** Header array from webRequest -> lowercase object. */
  function headerMap(arr) {
    const out = {};
    for (const h of arr || []) if (h && h.name) out[String(h.name).toLowerCase()] = String(h.value || '');
    return out;
  }

  // Pages of video sites cannot be downloaded as a file; KDM hands them to yt-dlp. Same rule as src/lib/videoSites.ts and engine/ytdlp.mjs.
  const SITES = [/(^|\.)youtube\.com$/, /^youtu\.be$/, /(^|\.)youtube-nocookie\.com$/, /(^|\.)vimeo\.com$/, /(^|\.)dailymotion\.com$/, /^dai\.ly$/, /(^|\.)bilibili\.com$/, /^b23\.tv$/,
    /(^|\.)twitch\.tv$/, /(^|\.)tiktok\.com$/, /(^|\.)instagram\.com$/, /(^|\.)facebook\.com$/, /^fb\.watch$/, /(^|\.)twitter\.com$/, /(^|\.)x\.com$/, /(^|\.)reddit\.com$/, /(^|\.)soundcloud\.com$/, /(^|\.)bandcamp\.com$/];
  function isVideoSitePage(url) {
    let u;
    try { u = new URL(String(url).trim()); } catch { return false; }
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    if (!SITES.some((re) => re.test(host))) return false;
    if (/\.(mp4|webm|mkv|mp3|m4a|jpg|png|zip)$/i.test(u.pathname)) return false;
    if (/(^|\.)youtube\.com$/.test(host)) {
      if (u.pathname === '/watch') return u.searchParams.has('v');
      return /^\/(shorts|live|embed|v)\/[\w-]+/.test(u.pathname); // a playlist page is not one video
    }
    return true;
  }

  root.KdmMedia = { isVideoSitePage, classify, suggestName, addToList, pickBest, hlsUrl, headerMap, looksLikeSegment, MAX_LIST };
})(typeof globalThis !== 'undefined' ? globalThis : this);
