/* KDM browser bridge — a tiny local HTTP API the browser extension talks to.
 * Security: loopback only, Host header must be 127.0.0.1/localhost (anti DNS-rebinding),
 * Origin must be a browser-extension origin (web pages are refused), and /add + /check need the pairing token. */
const http = require('node:http');
const crypto = require('node:crypto');

const MAX_BODY = 64 * 1024;
const ORIGIN_OK = /^(chrome-extension|moz-extension|safari-web-extension):\/\//;
const HOST_OK = /^(127\.0\.0\.1|localhost)(:\d+)?$/;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cleanFileName(v) {
  if (typeof v !== 'string') return undefined;
  const n = v.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 200);
  return n || undefined;
}

/** Header values must be one line and sane in size. */
function cleanHeader(v, max) {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/[\r\n\x00]/g, '').trim().slice(0, max);
  return t || undefined;
}

function createBridgeServer({ token, version, onAdd, onPrewarm }) {
  return http.createServer((req, res) => {
    const origin = req.headers.origin;
    const cors = origin
      ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type,x-kdm-token', 'access-control-allow-methods': 'GET,POST,OPTIONS', vary: 'origin' }
      : {};
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors });
      res.end(code === 204 ? undefined : JSON.stringify(obj));
    };

    if (!HOST_OK.test(req.headers.host || '')) return send(403, { error: 'forbidden host' });
    if (origin && !ORIGIN_OK.test(origin)) return send(403, { error: 'forbidden origin' });
    if (req.method === 'OPTIONS') return send(204);
    const authed = safeEqual(req.headers['x-kdm-token'] || '', token);

    if (req.method === 'GET' && req.url === '/ping') return send(200, { app: 'kdm', version });
    if (req.method === 'GET' && req.url === '/check') return authed ? send(200, { ok: true }) : send(401, { error: 'bad token' });

    if (req.method === 'POST' && req.url === '/add') {
      if (!authed) return send(401, { error: 'bad token' });
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { send(413, { error: 'too large' }); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'invalid json' }); }
        let url;
        try { url = new URL(String(body.url)); } catch { return send(400, { error: 'invalid url' }); }
        if (!/^https?:$/.test(url.protocol) || url.href.length > 4096) return send(400, { error: 'unsupported url' });
        onAdd({
          url: url.href,
          fileName: cleanFileName(body.fileName),
          referrer: typeof body.referrer === 'string' && /^https?:\/\//.test(body.referrer) ? body.referrer.slice(0, 2048) : undefined,
          cookie: cleanHeader(body.cookie, 16 * 1024),
          userAgent: cleanHeader(body.userAgent, 512),
        });
        send(200, { ok: true });
      });
      return;
    }
    // The extension says "this video page is about to be downloaded": KDM can read it in the background so the window opens ready.
    if (req.method === 'POST' && req.url === '/prewarm') {
      if (!authed) return send(401, { error: 'bad token' });
      const chunks = [];
      let size = 0;
      req.on('data', (c) => { size += c.length; if (size > 8 * 1024) { send(413, { error: 'too large' }); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (res.writableEnded) return;
        let url;
        try { url = new URL(String(JSON.parse(Buffer.concat(chunks).toString('utf8')).url)); } catch { return send(400, { error: 'invalid url' }); }
        if (!/^https?:$/.test(url.protocol) || url.href.length > 4096) return send(400, { error: 'unsupported url' });
        try { if (onPrewarm) onPrewarm(url.href); } catch { /* never let a warm-up break the bridge */ }
        send(200, { ok: true });
      });
      return;
    }
    send(404, { error: 'not found' });
  });
}

/** Listen on the first free port in [start, start+tries). Resolves with the port. */
function listenOnFirstFree(server, start = 47631, tries = 5) {
  return new Promise((resolve, reject) => {
    let port = start;
    const attempt = () => {
      const onErr = (e) => {
        server.removeListener('listening', onOk);
        if (e.code === 'EADDRINUSE' && port < start + tries - 1) { port++; attempt(); } else reject(e);
      };
      const onOk = () => { server.removeListener('error', onErr); resolve(port); };
      server.once('error', onErr);
      server.once('listening', onOk);
      server.listen(port, '127.0.0.1');
    };
    attempt();
  });
}

module.exports = { createBridgeServer, listenOnFirstFree, safeEqual, cleanFileName };
