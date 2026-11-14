import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHeaders, cleanProxy, withUserAgent } from '../host.mjs';

test('cleanHeaders keeps only cookie/referer/user-agent, one line, lower-cased', () => {
  assert.deepEqual(cleanHeaders({ Cookie: 'a=1\r\nX-Evil: 1', Referer: 'https://x/', 'User-Agent': 'UA', Authorization: 'secret', Host: 'evil' }),
    { cookie: 'a=1X-Evil: 1', referer: 'https://x/', 'user-agent': 'UA' });
  assert.deepEqual(cleanHeaders(null), {});
  assert.deepEqual(cleanHeaders({ cookie: 5, referer: '  ' }), {});
});

test('cleanProxy accepts only a plain host and port', () => {
  assert.deepEqual(cleanProxy({ host: 'proxy.corp', port: '8080' }), { host: 'proxy.corp', port: 8080 });
  assert.equal(cleanProxy({ host: 'a b', port: 80 }), null);
  assert.equal(cleanProxy({ host: 'x', port: 0 }), null);
  assert.equal(cleanProxy({ host: 'x', port: 70000 }), null);
  assert.equal(cleanProxy(null), null);
});

test('the User-Agent setting is a default; the browser\'s own wins', () => {
  assert.deepEqual(withUserAgent({}, 'MyUA/1'), { 'user-agent': 'MyUA/1' });
  assert.deepEqual(withUserAgent({ 'user-agent': 'Browser' }, 'MyUA/1'), { 'user-agent': 'Browser' });
  assert.deepEqual(withUserAgent({ cookie: 'a=1' }, '  '), { cookie: 'a=1' });
  assert.equal(withUserAgent({}, 'a\r\nX: 1')['user-agent'], 'a  X: 1');
});

// ---- queue speed cap -----------------------------------------------------------------
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHost } from '../host.mjs';

test('downloads of one queue share its speed cap; another queue is not slowed', async () => {
  const body = Buffer.alloc(300000, 7);
  const server = http.createServer((req, res) => {
    const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
    if (m) { const a = +m[1]; const b = Math.min(+m[2], body.length - 1); res.writeHead(206, { 'content-range': `bytes ${a}-${b}/${body.length}`, 'content-length': b - a + 1 }); return res.end(body.subarray(a, b + 1)); }
    res.writeHead(200, { 'content-length': body.length }); res.end(body);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = (n) => `http://127.0.0.1:${server.address().port}/f${n}.bin`;
  const done = new Set();
  const host = createHost((e) => { if (e.type === 'state' && e.status === 'completed') done.add(e.id); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-q-'));
  const until = async (ids, ms) => { const t0 = Date.now(); while (!ids.every((i) => done.has(i))) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 20)); } return Date.now() - t0; };

  // two downloads in queue "slow": 600 KB together at 200 KB/s (the first 200 KB are a burst) -> about 2 s
  const t0 = Date.now();
  host.setQueueLimit('slow', 200000);
  await host.start({ id: 'a', url: url(1), dir, fileName: 'a.bin', queueId: 'slow' });
  await host.start({ id: 'b', url: url(2), dir, fileName: 'b.bin', queueId: 'slow' });
  // a third one in another queue is untouched
  await host.start({ id: 'c', url: url(3), dir, fileName: 'c.bin', queueId: 'fast' });
  const fast = await until(['c'], 5000);
  assert.ok(fast < 1000, `other queue took ${fast} ms`);
  await until(['a', 'b'], 15000);
  assert.ok(Date.now() - t0 > 1200, `the capped queue finished in ${Date.now() - t0} ms`);
  // limit removed while running = unlimited again (and a bad id is ignored)
  host.setQueueLimit('slow', 0);
  host.setQueueLimit('../bad id', 5);
  server.closeAllConnections?.(); await new Promise((ok) => server.close(ok));
});

// ---- logins (HTTP Basic) --------------------------------------------------------------
import { splitAuth, basicHeader } from '../host.mjs';

test('splitAuth moves a login out of the address; a header from the app wins; junk is ignored', () => {
  const a = splitAuth({ url: 'https://al%40ice:p%3Ass@files.test/a b.zip?x=1' });
  assert.equal(a.url, 'https://files.test/a%20b.zip?x=1');
  assert.equal(a.headers.authorization, basicHeader('al@ice', 'p:ss'));
  assert.deepEqual(splitAuth({ url: 'https://files.test/a.zip' }), { url: 'https://files.test/a.zip', headers: {} });
  assert.equal(splitAuth({ url: 'https://u:p@f.test/a', basicAuth: 'Basic QQ==' }).headers.authorization, 'Basic QQ==');
  assert.deepEqual(splitAuth({ url: 'https://f.test/a', basicAuth: 'Bearer evil\r\nX: 1' }).headers, {});
});

test('a protected file downloads with the login, fails without it, and the login is not sent to another site', async () => {
  const body = Buffer.alloc(120000, 9);
  const seen = [];
  const other = http.createServer((req, res) => { seen.push(req.headers.authorization || null); res.writeHead(200, { 'content-length': body.length }); res.end(body); });
  await new Promise((ok) => other.listen(0, 'localhost', ok));
  const main = http.createServer((req, res) => {
    if (req.url === '/jump') { res.writeHead(302, { location: `http://localhost:${other.address().port}/file.bin` }); return res.end(); }
    if (req.headers.authorization !== basicHeader('alice', 'pw 1')) { res.writeHead(401, { 'www-authenticate': 'Basic realm="x"' }); return res.end('no'); }
    const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
    if (m) { const a = +m[1]; const b = Math.min(+m[2], body.length - 1); res.writeHead(206, { 'content-range': `bytes ${a}-${b}/${body.length}`, 'content-length': b - a + 1 }); return res.end(body.subarray(a, b + 1)); }
    res.writeHead(200, { 'content-length': body.length }); res.end(body);
  });
  await new Promise((ok) => main.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${main.address().port}`;
  const events = [];
  const host = createHost((e) => events.push(e));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-auth-'));
  const finished = async (id) => { const t0 = Date.now(); while (!events.some((e) => e.id === id && ['completed', 'failed'].includes(e.status))) { if (Date.now() - t0 > 8000) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 20)); } return events.filter((e) => e.id === id && e.type === 'state').at(-1); };

  // quick look: without a login the reason is the 401; with the login it shows size and name
  await assert.rejects(host.probe({ url: `${base}/secret.bin` }), /HTTP 401/);
  const info = await host.probe({ url: `${base}/secret.bin`, basicAuth: basicHeader('alice', 'pw 1') });
  assert.equal(info.size, body.length);

  await host.start({ id: 'no', url: `${base}/secret.bin`, dir, fileName: 'no.bin', retries: 0 });
  const bad = await finished('no');
  assert.equal(bad.status, 'failed');
  assert.match(bad.error, /401/);

  await host.start({ id: 'yes', url: `${base}/secret.bin`, dir, fileName: 'yes.bin', basicAuth: basicHeader('alice', 'pw 1') });
  assert.equal((await finished('yes')).status, 'completed');
  assert.deepEqual(fs.readFileSync(path.join(dir, 'yes.bin')), body);

  // the login written in the address works too (fetch alone would refuse such an address)
  await host.start({ id: 'url', url: `http://alice:pw%201@127.0.0.1:${main.address().port}/secret.bin`, dir, fileName: 'url.bin' });
  assert.equal((await finished('url')).status, 'completed');

  // redirected to another site: the login stays behind
  seen.length = 0;
  await host.start({ id: 'jump', url: `${base}/jump`, dir, fileName: 'jump.bin', basicAuth: basicHeader('alice', 'pw 1') });
  assert.equal((await finished('jump')).status, 'completed');
  assert.ok(seen.length > 0 && seen.every((a) => a === null), `other site saw: ${JSON.stringify(seen)}`);

  for (const s of [main, other]) { s.closeAllConnections?.(); await new Promise((ok) => s.close(ok)); }
});
