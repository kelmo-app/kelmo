'use strict';
// Clipboard watcher: when you copy a link to a downloadable file, KDM offers to download it.
// Only plain, single http(s) links to file types people actually download are offered
// (not web pages, not images), and each copied text is offered once.

const FILE_EXT = /\.(iso|img|zip|7z|rar|tar|tgz|gz|xz|bz2|zst|exe|msi|dmg|pkg|apk|deb|rpm|appimage|flatpak|snap|mkv|mp4|mov|avi|webm|flv|wmv|m4v|mpg|mpeg|3gp|mp3|flac|wav|ogg|m4a|aac|opus|pdf|docx?|xlsx?|pptx?|epub|mobi|djvu|torrent|bin)$/i;
const MAX_LEN = 2048;

/** The link inside copied text if it looks like a file download, else null. */
function extractDownloadUrl(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t || t.length > MAX_LEN || /\s/.test(t)) return null;
  let u;
  try { u = new URL(t); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let name = '';
  try { name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || ''); } catch { name = u.pathname; }
  return FILE_EXT.test(name) ? t : null;
}

/**
 * Polls `read()` and calls `onLink(url)` for each new downloadable link.
 * The first reading only records what is already on the clipboard (nothing pops up at startup).
 * While `enabled()` is false nothing is read at all.
 */
function createClipboardWatcher({ read, enabled, onLink, intervalMs = 1500, timers = { setInterval, clearInterval } }) {
  let last = null;
  let handle = null;
  const tick = () => {
    if (!enabled()) { last = null; return; } // re-arm: turning it on later must not offer old content
    let text;
    try { text = read(); } catch { return; }
    if (last === null) { last = text; return; }
    if (text === last) return;
    last = text;
    const url = extractDownloadUrl(text);
    if (url) onLink(url);
  };
  return {
    start() { if (!handle) handle = timers.setInterval(tick, intervalMs); },
    stop() { if (handle) { timers.clearInterval(handle); handle = null; } },
    tick, // exposed for tests
  };
}

module.exports = { extractDownloadUrl, createClipboardWatcher };
