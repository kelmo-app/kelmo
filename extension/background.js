// KDM browser extension — hands downloads to the KDM desktop app over a loopback API.
// If KDM is not running (or not paired) the browser downloads the file as usual.
const api = globalThis.chrome;
if (typeof importScripts === 'function') { try { importScripts('media.js'); } catch { /* media detection is optional */ } }
const M = globalThis.KdmMedia;
const PORTS = [47631, 47632, 47633, 47634, 47635];

const getSettings = () => api.storage.local.get({ token: '', enabled: true, port: null, prewarm: true });

async function findPort(preferred) {
  const order = preferred ? [preferred, ...PORTS.filter((p) => p !== preferred)] : PORTS;
  for (const p of order) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/ping`, { signal: AbortSignal.timeout(800) });
      const j = await r.json();
      if (j && j.app === 'kdm') return p;
    } catch { /* try next port */ }
  }
  return null;
}

// The browser's login session for this URL, so protected links keep working in KDM.
async function sessionFor(url) {
  try {
    const list = await api.cookies.getAll({ url });
    const cookie = list.map((c) => `${c.name}=${c.value}`).join('; ');
    return { cookie: cookie || undefined, userAgent: globalThis.navigator ? globalThis.navigator.userAgent : undefined };
  } catch { return {}; } // no permission / unsupported: send without cookies
}

// Pairing without copying anything: the browser starts KDM's small native host (only for this extension's ID) and it answers with the token.
const NATIVE_HOST = 'org.kelmo.kdm';
async function nativeToken() {
  try {
    if (!api.runtime.sendNativeMessage) return '';
    const r = await api.runtime.sendNativeMessage(NATIVE_HOST, { op: 'pair' });
    return r && r.ok && /^[a-f0-9]{32}$/.test(r.token) ? r.token : '';
  } catch { return ''; } // KDM not installed, or the host is not registered for this browser
}

/** The saved token, fetched automatically when there is none (or `fresh` after KDM rejected the old one). */
async function ensureToken(s, fresh = false) {
  if (s.token && !fresh) return s.token;
  const t = await nativeToken();
  if (t && t !== s.token) { await api.storage.local.set({ token: t }); return t; }
  return fresh ? '' : s.token;
}

async function sendToKdm(url, extra = {}) {
  const s = await getSettings();
  let token = await ensureToken(s);
  if (!token) return { ok: false, reason: 'no-token' };
  const port = await findPort(s.port);
  if (!port) return { ok: false, reason: 'offline' };
  if (port !== s.port) await api.storage.local.set({ port });
  const body = JSON.stringify({ url, ...(await sessionFor(url)), ...extra });
  const post = (t) => fetch(`http://127.0.0.1:${port}/add`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kdm-token': t }, body });
  try {
    let r = await post(token);
    if (r.status === 401) { // the saved token is old (KDM was reinstalled): ask KDM for the current one and try once more
      const t = await ensureToken({ ...s, token }, true);
      if (t) r = await post(t);
    }
    return r.ok ? { ok: true } : { ok: false, reason: r.status === 401 ? 'bad-token' : 'error' };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

// Tell KDM "this video page may be downloaded" so its window opens already knowing the formats. Best effort, silent.
const warmed = new Map();
async function prewarm(pageUrl) {
  try {
    const s = await getSettings();
    if (!s.enabled || !s.prewarm || !s.token) return;
    const key = pageUrl.replace(/#.*$/, '');
    if (Date.now() - (warmed.get(key) || 0) < 5 * 60_000) return;
    warmed.set(key, Date.now());
    if (warmed.size > 30) warmed.delete(warmed.keys().next().value);
    const port = await findPort(s.port);
    if (!port) return;
    await fetch(`http://127.0.0.1:${port}/prewarm`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kdm-token': s.token }, body: JSON.stringify({ url: pageUrl }) });
  } catch { /* never disturb browsing */ }
}

function badge(text, color) {
  api.action.setBadgeText({ text });
  if (color) api.action.setBadgeBackgroundColor({ color });
  if (text) setTimeout(() => api.action.setBadgeText({ text: '' }), 4000);
}

// Decide whether KDM takes this download. Returns true when KDM accepted it
// (the browser's own copy has then been cancelled and erased).
async function takeOver(item) {
  const s = await getSettings();
  if (!s.enabled || !(await ensureToken(s))) return false;
  const url = item.finalUrl || item.url;
  if (!/^https?:\/\//i.test(url || '')) return false; // blob:, data:, file: stay in the browser
  const res = await sendToKdm(url, { referrer: item.referrer || undefined });
  if (!res.ok) { badge('!', '#d97706'); return false; } // browser keeps its own download
  try { await api.downloads.cancel(item.id); await api.downloads.erase({ id: item.id }); } catch { /* already gone */ }
  badge('\u2713', '#16a34a');
  return true;
}

// Chrome / Brave / Edge: the browser WAITS for this listener before it shows its
// "Save as" dialog, so cancelling here means that dialog never appears.
// If KDM refuses, suggest() lets the browser carry on exactly as normal.
const early = !!(api.downloads.onDeterminingFilename && api.downloads.onDeterminingFilename.addListener);
if (early) {
  api.downloads.onDeterminingFilename.addListener((item, suggest) => {
    takeOver(item).then(
      (taken) => { if (!taken) suggest(); },
      () => suggest(),
    );
    return true; // async: we call suggest() ourselves
  });
} else {
  // Firefox has no such hook: take over as soon as the download is created.
  api.downloads.onCreated.addListener((item) => takeOver(item));
}

// Right-click → "Download with KDM"
const VIDEO_SITE_PATTERNS = ['*://*.youtube.com/*', '*://youtu.be/*', '*://*.vimeo.com/*', '*://*.dailymotion.com/*', '*://*.bilibili.com/*', '*://*.twitch.tv/*', '*://*.tiktok.com/*',
  '*://*.instagram.com/*', '*://*.facebook.com/*', '*://*.twitter.com/*', '*://x.com/*', '*://*.reddit.com/*', '*://*.soundcloud.com/*', '*://*.bandcamp.com/*'];
api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({ id: 'kdm-link', title: 'Download with KDM', contexts: ['link', 'video', 'audio', 'image'] });
  api.contextMenus.create({ id: 'kdm-page', title: 'Download this video with KDM', contexts: ['page'], documentUrlPatterns: VIDEO_SITE_PATTERNS });
});
api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'kdm-page') {
    const ok = M && M.isVideoSitePage(info.pageUrl) && (await sendToKdm(info.pageUrl, { fileName: M.suggestName(tab && tab.title, info.pageUrl, 'mp4') })).ok;
    badge(ok ? '✓' : '!', ok ? '#16a34a' : '#d97706');
    return;
  }
  const url = info.linkUrl || info.srcUrl;
  if (!url) return;
  const res = await sendToKdm(url, { referrer: info.pageUrl });
  badge(res.ok ? '✓' : '!', res.ok ? '#16a34a' : '#d97706');
});

// Popup / options ask for a connection check.
api.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'status') {
    (async () => {
      const s = await getSettings();
      const port = await findPort(s.port);
      if (!port) return reply({ running: false, paired: false });
      let paired = false;
      const check = async (t) => {
        try { return (await fetch(`http://127.0.0.1:${port}/check`, { headers: { 'x-kdm-token': t } })).ok; } catch { return false; }
      };
      let token = await ensureToken(s);
      if (token) paired = await check(token);
      if (!paired) { token = await ensureToken({ ...s, token }, true); if (token) paired = await check(token); }
      reply({ running: true, paired, port });
    })();
    return true; // async reply
  }
});

// ---------------------------------------------------------------------------------------------
// Video capture: watch what each tab loads, remember the videos, offer "Download with KDM".
// Needs the webRequest permission; without it (or without media.js) everything above still works.
// ---------------------------------------------------------------------------------------------
if (M && api.webRequest && api.webRequest.onHeadersReceived && api.tabs) {
  const memory = new Map();
  const sess = api.storage && api.storage.session;
  let chain = Promise.resolve(); // one write at a time: the service worker may be woken by several responses at once

  const readList = async (tabId) => {
    if (sess) { try { const k = `media:${tabId}`; return (await sess.get(k))[k] || []; } catch { /* fall through */ } }
    return memory.get(tabId) || [];
  };
  const writeList = async (tabId, list) => {
    memory.set(tabId, list);
    if (sess) { try { await sess.set({ [`media:${tabId}`]: list }); } catch { /* memory copy is enough */ } }
  };
  const showCount = (tabId, n) => {
    try {
      api.action.setBadgeText({ tabId, text: n ? String(n) : '' });
      if (n) api.action.setBadgeBackgroundColor({ tabId, color: '#b45309' });
    } catch { /* tab already closed */ }
  };

  api.webRequest.onHeadersReceived.addListener(
    (d) => {
      if (!d || d.tabId < 0) return;
      const hit = M.classify({ url: d.url, type: d.type, status: d.statusCode, headers: M.headerMap(d.responseHeaders) });
      if (!hit) return;
      chain = chain.then(async () => {
        const ref = d.documentUrl || (d.initiator && /^https?:/.test(d.initiator) ? `${d.initiator}/` : undefined); // the player page that asked for the file
        const list = M.addToList(await readList(d.tabId), { ...hit, ref, at: Date.now() });
        await writeList(d.tabId, list);
        showCount(d.tabId, list.length);
      }).catch(() => {});
    },
    { urls: ['http://*/*', 'https://*/*'] },
    ['responseHeaders'],
  );

  // a new page in the tab: its list starts empty
  api.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading' && change.url) chain = chain.then(() => { showCount(tabId, 0); return writeList(tabId, []); }).catch(() => {});
  });
  api.tabs.onRemoved.addListener((tabId) => {
    memory.delete(tabId);
    if (sess) { try { sess.remove(`media:${tabId}`); } catch { /* nothing stored */ } }
  });

  // Video servers often check the Referer: it must be the PLAYER's page (often an iframe), not just the tab's address.
  const sendVideo = async (tabId, item) => {
    let tab = null;
    try { tab = await api.tabs.get(tabId); } catch { /* tab gone: send without page info */ }
    const stream = item.kind === 'hls';
    const url = stream ? M.hlsUrl(item.url) : item.url; // a stream is saved as .mp4 (or .ts without ffmpeg)
    const res = await sendToKdm(url, { referrer: item.ref || (tab && tab.url), fileName: M.suggestName(tab && tab.title, item.url, stream ? 'mp4' : item.ext || 'mp4') });
    if (tabId >= 0) { try { api.action.setBadgeText({ tabId, text: res.ok ? '\u2713' : '!' }); } catch { /* ignore */ } }
    return res;
  };

  api.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg) return;
    if (msg.type === 'media-list') {
      (async () => {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        // on YouTube and similar sites the page itself is the download (its stream pieces are not usable files)
        if (tab && tab.url && M.isVideoSitePage(tab.url)) return reply({ tabId: tab.id, title: tab.title || '', list: [], site: tab.url });
        reply(tab ? { tabId: tab.id, title: tab.title || '', list: await readList(tab.id) } : { tabId: -1, title: '', list: [] });
      })();
      return true;
    }
    if (msg.type === 'page-send' && typeof msg.url === 'string' && M.isVideoSitePage(msg.url)) {
      sendToKdm(msg.url, { fileName: M.suggestName(sender && sender.tab && sender.tab.title, msg.url, 'mp4') }).then(reply, () => reply({ ok: false, reason: 'error' }));
      return true;
    }
    if (msg.type === 'media-send' && typeof msg.url === 'string' && typeof msg.tabId === 'number') {
      (async () => {
        const known = (await readList(msg.tabId)).find((e) => e.url === msg.url);
        return sendVideo(msg.tabId, { url: msg.url, ext: msg.ext, ref: known && known.ref, kind: known && known.kind });
      })().then(reply, () => reply({ ok: false, reason: 'error' }));
      return true;
    }
    if (msg.type === 'prewarm' && sender && sender.tab && sender.tab.url && M.isVideoSitePage(sender.tab.url)) {
      prewarm(sender.tab.url);
      return false;
    }
    if (msg.type === 'media-grab' && sender && sender.tab) {
      (async () => {
        const tabId = sender.tab.id;
        if (sender.tab.url && M.isVideoSitePage(sender.tab.url)) return reply(await sendToKdm(sender.tab.url, { fileName: M.suggestName(sender.tab.title, sender.tab.url, 'mp4') })); // YouTube etc.: KDM's video downloader takes the page
        const direct = typeof msg.src === 'string' && /^https?:\/\//i.test(msg.src) && !M.looksLikeSegment(msg.src) ? msg.src : null;
        const list = await readList(tabId);
        const known = direct && list.find((e) => e.url === direct);
        // the page that holds the <video> (sender.url) is the right referrer, also when it is an iframe
        const best = direct ? { url: direct, ext: (direct.split('?')[0].match(/\.([a-z0-9]{2,4})$/i) || [])[1] || 'mp4', ref: sender.url || (known && known.ref), kind: /\.m3u8(\?|#|$)/i.test(direct) ? 'hls' : undefined } : M.pickBest(list);
        if (!best) return reply({ ok: false, reason: 'none' });
        reply(await sendVideo(tabId, best));
      })();
      return true;
    }
  });
}
