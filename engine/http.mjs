// HTTP for the engine. Normally this is plain `fetch`. Only when a proxy is configured does it use
// a small client of its own (Node's built-in fetch cannot be pointed at a proxy without extra packages).
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

/** The Response-like parts the engine uses: status, ok, url, headers.get(), body (async iterable of Buffers, cancel()). */
function adapt(res, url) {
  const headers = new Map(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v)]));
  return {
    status: res.statusCode,
    ok: res.statusCode >= 200 && res.statusCode < 300,
    url,
    headers: { get: (n) => headers.get(String(n).toLowerCase()) ?? null },
    body: { [Symbol.asyncIterator]: () => res[Symbol.asyncIterator](), cancel: async () => { res.destroy(); } },
    // like fetch: playlists, checksum lists and JSON are read whole
    text: async () => { const parts = []; for await (const c of res) parts.push(c); return Buffer.concat(parts).toString('utf8'); },
    json: async () => JSON.parse(await (async () => { const parts = []; for await (const c of res) parts.push(c); return Buffer.concat(parts).toString('utf8'); })()),
  };
}

function abortError() {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

/** Open a CONNECT tunnel to host:port through the proxy and resolve with the raw socket. */
function tunnel(proxy, host, port, signal) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: proxy.host, port: proxy.port, method: 'CONNECT', path: `${host}:${port}`, headers: { Host: `${host}:${port}` }, signal });
    req.once('connect', (res, socket) => {
      if (res.statusCode === 200) resolve(socket);
      else { socket.destroy(); reject(new Error(`proxy refused (HTTP ${res.statusCode})`)); }
    });
    req.once('error', reject);
    req.end();
  });
}

async function once(url, { headers, signal, proxy }) {
  const u = new URL(url);
  const secure = u.protocol === 'https:';
  const port = Number(u.port) || (secure ? 443 : 80);
  const h = { ...headers, Host: u.host, 'Accept-Encoding': 'identity', Connection: 'close' };
  let opts;
  if (secure) {
    const raw = await tunnel(proxy, u.hostname, port, signal);
    const socket = tls.connect({ socket: raw, servername: u.hostname });
    opts = { createConnection: () => socket, method: 'GET', path: u.pathname + u.search, headers: h, signal };
  } else {
    opts = { host: proxy.host, port: proxy.port, method: 'GET', path: url, headers: h, signal };
  }
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request(opts, resolve);
    req.once('error', reject);
    req.end();
  });
}

async function viaProxy(url, { headers = {}, signal, proxy }) {
  let cur = url;
  let hdrs = headers;
  for (let hops = 0; hops < 10; hops++) {
    if (signal?.aborted) throw abortError();
    const res = await once(cur, { headers: hdrs, signal, proxy });
    const loc = res.headers.location;
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc) {
      res.resume();
      const next = new URL(loc, cur).toString();
      if (new URL(next).origin !== new URL(cur).origin) {
        // never hand a login cookie to another site
        hdrs = Object.fromEntries(Object.entries(hdrs).filter(([k]) => !['cookie', 'referer', 'authorization'].includes(k.toLowerCase())));
      }
      cur = next;
      continue;
    }
    return adapt(res, cur);
  }
  throw new Error('too many redirects');
}

/** `fetch`-compatible GET. `proxy` = { host, port } or null/undefined for a direct connection. */
export function request(url, { headers, signal, proxy } = {}) {
  if (!proxy || !proxy.host) return fetch(url, { headers, signal });
  return viaProxy(url, { headers, signal, proxy });
}

/** First proxy of a Chromium proxy string ("PROXY a:8080; DIRECT") that we can use, or null. SOCKS is not supported. */
export function parseProxyString(s) {
  for (const part of String(s || '').split(';')) {
    const m = /^\s*(PROXY|HTTPS?)\s+([^\s:]+):(\d{1,5})\s*$/i.exec(part);
    if (m) return { host: m[2], port: +m[3] };
    if (/^\s*DIRECT\s*$/i.test(part)) return null;
  }
  return null;
}
