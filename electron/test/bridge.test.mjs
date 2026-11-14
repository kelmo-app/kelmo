import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
const { createBridgeServer, listenOnFirstFree } = createRequire(import.meta.url)('../bridge-server.cjs');

const TOKEN = 'secret-token-123';
const added = [];
const server = createBridgeServer({ token: TOKEN, version: '9.9.9', onAdd: (r) => added.push(r) });
const port = await listenOnFirstFree(server, 48731, 10);

// node's fetch forbids setting Host/Origin freely, so use http.request
const call = (method, path, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
const ext = { origin: 'chrome-extension://abcdefg' };
const auth = { ...ext, 'x-kdm-token': TOKEN, 'content-type': 'application/json' };

test('ping identifies KDM without a token', async () => {
  const r = await call('GET', '/ping', { headers: ext });
  assert.deepEqual([r.status, r.json.app, r.json.version], [200, 'kdm', '9.9.9']);
});
test('add requires the token', async () => {
  assert.equal((await call('POST', '/add', { headers: { ...ext, 'x-kdm-token': 'nope' }, body: { url: 'https://a.b/c.zip' } })).status, 401);
  assert.equal((await call('POST', '/add', { headers: ext, body: { url: 'https://a.b/c.zip' } })).status, 401);
  assert.equal(added.length, 0);
});
test('add with token reaches onAdd, file name is sanitised', async () => {
  const r = await call('POST', '/add', { headers: auth, body: { url: 'https://files.example.com/a%20b.zip', fileName: '../evil/na:me.zip', referrer: 'https://example.com/page', cookie: 'sid=1; t=2\r\nX: y', userAgent: 'UA/1' } });
  assert.equal(r.status, 200);
  assert.deepEqual(added.at(-1), { url: 'https://files.example.com/a%20b.zip', fileName: '.._evil_na_me.zip', referrer: 'https://example.com/page', cookie: 'sid=1; t=2X: y', userAgent: 'UA/1' });
});
test('web pages are refused (origin check)', async () => {
  const r = await call('POST', '/add', { headers: { origin: 'https://evil.com', 'x-kdm-token': TOKEN }, body: { url: 'https://a.b/c.zip' } });
  assert.equal(r.status, 403);
  assert.equal((await call('GET', '/ping', { headers: { origin: 'https://evil.com' } })).status, 403);
});
test('DNS-rebinding style Host header is refused', async () => {
  const r = await call('GET', '/ping', { headers: { host: 'evil.example.com' } });
  assert.equal(r.status, 403);
});
test('bad input: non-http urls, invalid json, wrong route', async () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://x/y', 'not a url']) {
    assert.equal((await call('POST', '/add', { headers: auth, body: { url } })).status, 400, url);
  }
  assert.equal((await call('POST', '/add', { headers: auth, body: '{oops' })).status, 400);
  assert.equal((await call('GET', '/nothing', { headers: ext })).status, 404);
});
test('/check validates the token; oversized bodies are rejected', async () => {
  assert.equal((await call('GET', '/check', { headers: auth })).status, 200);
  assert.equal((await call('GET', '/check', { headers: ext })).status, 401);
  const big = await call('POST', '/add', { headers: auth, body: JSON.stringify({ url: 'https://a.b/' + 'x'.repeat(70000) }) }).catch((e) => ({ status: 'closed:' + e.code }));
  assert.ok(big.status === 413 || String(big.status).startsWith('closed'), String(big.status));
});
test('after all', () => server.close());
