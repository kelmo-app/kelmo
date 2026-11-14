import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { request, parseProxyString } from '../http.mjs';

function origin() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push({ url: req.url, host: req.headers.host, cookie: req.headers.cookie, range: req.headers.range });
    if (req.url === '/redir') { res.writeHead(302, { location: '/final' }); return res.end(); }
    if (req.url === '/final') { res.writeHead(206, { 'content-range': 'bytes 0-4/100', 'content-length': 5 }); return res.end('hello'); }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, seen, port: srv.address().port })));
}

// A tiny HTTP proxy: forwards absolute-URI requests and supports CONNECT tunnels.
function proxy() {
  const log = { forwarded: [], connects: [] };
  const srv = http.createServer((req, res) => {
    log.forwarded.push(req.url);
    const u = new URL(req.url);
    const up = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    req.pipe(up);
  });
  srv.on('connect', (req, sock, head) => {
    log.connects.push(req.url);
    const [h, p] = req.url.split(':');
    const up = net.connect(+p, h, () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up); });
    up.on('error', () => sock.destroy());
    sock.on('error', () => up.destroy());
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, log, port: srv.address().port })));
}

test('no proxy: plain fetch is used (a real Response)', async () => {
  const o = await origin();
  const r = await request(`http://127.0.0.1:${o.port}/final`, { headers: { Range: 'bytes=0-4' } });
  assert.equal(r.status, 206);
  assert.equal(typeof r.headers.get, 'function');
  await r.body.cancel();
  o.srv.close();
});

test('through an HTTP proxy: request goes via the proxy, redirects are followed, body streams', async () => {
  const o = await origin();
  const p = await proxy();
  const r = await request(`http://127.0.0.1:${o.port}/redir`, { headers: { Range: 'bytes=0-4', Cookie: 'sid=1' }, proxy: { host: '127.0.0.1', port: p.port } });
  assert.equal(r.status, 206);
  assert.equal(r.ok, true);
  assert.equal(r.headers.get('Content-Range'), 'bytes 0-4/100');
  assert.ok(r.url.endsWith('/final'));
  let got = '';
  for await (const c of r.body) got += c.toString();
  assert.equal(got, 'hello');
  assert.deepEqual(p.log.forwarded.map((u) => new URL(u).pathname), ['/redir', '/final']);
  assert.equal(o.seen[0].range, 'bytes=0-4');
  o.srv.close(); p.srv.close();
});

test('through a proxy the answer can be read whole, like fetch (text and json): playlists, checksum lists', async () => {
  const o = await origin();
  const p = await proxy();
  const r = await request(`http://127.0.0.1:${o.port}/redir`, { proxy: { host: '127.0.0.1', port: p.port } });
  assert.equal(await r.text(), 'hello');
  const j = http.createServer((q, res) => { res.writeHead(200); res.end('{"a":1}'); });
  await new Promise((ok) => j.listen(0, '127.0.0.1', ok));
  const r2 = await request(`http://127.0.0.1:${j.address().port}/`, { proxy: { host: '127.0.0.1', port: p.port } });
  assert.deepEqual(await r2.json(), { a: 1 });
  o.srv.close(); j.close(); p.srv.close();
});

test('proxy: a 404 is reported as a status (not thrown), and abort works', async () => {
  const o = await origin();
  const p = await proxy();
  const r = await request(`http://127.0.0.1:${o.port}/nope`, { proxy: { host: '127.0.0.1', port: p.port } });
  assert.equal(r.status, 404);
  assert.equal(r.ok, false);
  await r.body.cancel();
  const ctl = new AbortController(); ctl.abort();
  await assert.rejects(() => request(`http://127.0.0.1:${o.port}/final`, { proxy: { host: '127.0.0.1', port: p.port }, signal: ctl.signal }));
  o.srv.close(); p.srv.close();
});

test('proxy: cookies are not sent to another site after a redirect', async () => {
  const b = await origin();
  const a = http.createServer((req, res) => { res.writeHead(302, { location: `http://127.0.0.1:${b.port}/final` }); res.end(); });
  await new Promise((r) => a.listen(0, '127.0.0.1', r));
  // 127.0.0.1 with another port is another origin
  const p = await proxy();
  const r = await request(`http://127.0.0.1:${a.address().port}/x`, { headers: { Cookie: 'sid=secret', Referer: 'https://site/' }, proxy: { host: '127.0.0.1', port: p.port } });
  await r.body.cancel();
  assert.equal(b.seen.at(-1).cookie, undefined);
  a.close(); b.srv.close(); p.srv.close();
});

test('proxy: a dead proxy is an error, a refused CONNECT too', async () => {
  await assert.rejects(() => request('http://127.0.0.1:9/x', { proxy: { host: '127.0.0.1', port: 1 } }));
  const refuse = http.createServer(); refuse.on('connect', (q, s) => { s.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise((r) => refuse.listen(0, '127.0.0.1', r));
  await assert.rejects(() => request('https://example.invalid/x', { proxy: { host: '127.0.0.1', port: refuse.address().port } }), /proxy refused/);
  refuse.close();
});

test('parseProxyString understands Chromium proxy answers', () => {
  assert.deepEqual(parseProxyString('PROXY proxy.corp:8080; DIRECT'), { host: 'proxy.corp', port: 8080 });
  assert.deepEqual(parseProxyString('HTTPS secure.corp:443'), { host: 'secure.corp', port: 443 });
  assert.equal(parseProxyString('DIRECT'), null);
  assert.equal(parseProxyString('SOCKS5 s:1080'), null);
  assert.equal(parseProxyString(''), null);
});
