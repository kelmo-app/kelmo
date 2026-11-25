'use strict';
// Reading a YouTube-like page takes ~10 s (yt-dlp). The browser extension tells KDM early ("this page may be downloaded"),
// the answer is kept for a few minutes, and the "Download File Info" window then opens already knowing it.
// Two askers of the same page share one run, so a click during the warm-up just waits for what is already under way.

// Same sites the extension offers the video button on; nothing else may start a background read.
const PREWARM_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|bilibili\.com|twitch\.tv|tiktok\.com|instagram\.com|facebook\.com|twitter\.com|x\.com|reddit\.com|soundcloud\.com|bandcamp\.com)$/i;

function isPrewarmable(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && PREWARM_HOSTS.test(u.hostname);
  } catch { return false; }
}

function createVideoCache({ probe, now = Date.now, ttlMs = 10 * 60_000, max = 12 }) {
  const map = new Map(); // key -> { at, promise }
  const keyOf = (url) => String(url).replace(/#.*$/, '');

  function get(url, { cookie } = {}) {
    if (cookie) return probe(url, { cookie }); // a login is never cached or shared
    const key = keyOf(url);
    const hit = map.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.promise;
    const promise = Promise.resolve()
      .then(() => probe(url))
      .then((r) => {
        if (!r || r.ok === false) map.delete(key); // failures are not remembered: the next ask tries again
        return r;
      }, (e) => { map.delete(key); throw e; });
    map.set(key, { at: now(), promise });
    while (map.size > max) map.delete(map.keys().next().value);
    return promise;
  }

  /** Fire and forget: read the page in the background. */
  function warm(url) {
    if (!isPrewarmable(url)) return false;
    void get(url).catch(() => {});
    return true;
  }

  return { get, warm, size: () => map.size };
}

module.exports = { createVideoCache, isPrewarmable };
