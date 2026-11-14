// Runs extension/background.js in a sandbox with a fake `chrome` API against the real bridge server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { createBridgeServer, listenOnFirstFree } = createRequire(import.meta.url)('../bridge-server.cjs');

const TOKEN = 'a'.repeat(32);
const added = [];
let server = createBridgeServer({ token: TOKEN, version: '1', onAdd: (r) => added.push(r) });
await listenOnFirstFree(server, 47631, 5);

function loadExtension(store) {
  const calls = { cancel: [], erase: [], badge: [] };
  let onCreated, onClicked, onDet;
  const chrome = {
    storage: { local: { get: async (d) => ({ ...d, ...store }), set: async (v) => Object.assign(store, v) } },
    downloads: { onCreated: { addListener: (f) => (onCreated = f) }, ...(store.__noEarly ? {} : { onDeterminingFilename: { addListener: (f) => (onDet = f) } }), cancel: async (id) => calls.cancel.push(id), erase: async (q) => calls.erase.push(q.id) },
    cookies: { getAll: async ({ url }) => (store.__noCookies ? Promise.reject(new Error('no perm')) : [{ name: 'sid', value: 'abc' }, { name: 'lang', value: 'en' }]) },
    action: { setBadgeText: ({ text }) => calls.badge.push(text), setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener: (f) => (onClicked = f) } },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
  };
  vm.runInNewContext(fs.readFileSync(new URL('../../extension/background.js', import.meta.url), 'utf8'), {
    chrome, fetch, AbortSignal, setTimeout, console, globalThis: { chrome, navigator: { userAgent: 'TestUA/1' } },
  });
  calls.suggested = 0;
  // Simulates the browser: with the early hook it waits for suggest() or a cancel.
  const created = (item) => onDet
    ? new Promise((res) => { const r = onDet(item, () => { calls.suggested++; res(); }); assert.equal(r, true); setTimeout(res, 1500); }).then(() => new Promise((r) => setTimeout(r, 20)))
    : onCreated(item);
  return { calls, created, clicked: (info) => onClicked(info) };
}

test('paired + KDM running: link goes to KDM and the browser download is cancelled', async () => {
  const x = loadExtension({ token: TOKEN, enabled: true });
  await x.created({ id: 7, url: 'https://files.example.com/big.iso', referrer: 'https://example.com/dl' });
  assert.equal(added.at(-1).url, 'https://files.example.com/big.iso');
  assert.equal(added.at(-1).referrer, 'https://example.com/dl');
  assert.deepEqual([x.calls.cancel, x.calls.erase], [[7], [7]]);
});
test('early hook: browser is never released to show its dialog when KDM took the download', async () => {
  const x = loadExtension({ token: TOKEN, enabled: true });
  await x.created({ id: 11, url: 'https://files.example.com/early.pdf' });
  assert.equal(x.calls.suggested, 0);
  assert.deepEqual(x.calls.cancel, [11]);
});
test('Firefox path (no early hook): onCreated still hands over', async () => {
  const x = loadExtension({ token: TOKEN, enabled: true, __noEarly: true });
  await x.created({ id: 12, url: 'https://files.example.com/ff.pdf' });
  assert.deepEqual(x.calls.cancel, [12]);
});
test('browser login (cookies) and user-agent go along with the link', async () => {
  const x = loadExtension({ token: TOKEN, enabled: true });
  await x.created({ id: 13, url: 'https://files.example.com/private.pdf' });
  assert.equal(added.at(-1).cookie, 'sid=abc; lang=en');
  assert.equal(added.at(-1).userAgent, 'TestUA/1');
});
test('cookie access refused: link still goes to KDM, just without cookies', async () => {
  const x = loadExtension({ token: TOKEN, enabled: true, __noCookies: true });
  await x.created({ id: 14, url: 'https://files.example.com/pub.pdf' });
  assert.equal(added.at(-1).url, 'https://files.example.com/pub.pdf');
  assert.equal(added.at(-1).cookie, undefined);
});
test('right-click "Download with KDM" sends the link', async () => {
  const n = added.length;
  const x = loadExtension({ token: TOKEN, enabled: true });
  await x.clicked({ linkUrl: 'https://files.example.com/doc.pdf', pageUrl: 'https://example.com/' });
  assert.equal(added.length, n + 1);
  assert.equal(added.at(-1).url, 'https://files.example.com/doc.pdf');
});
test('wrong token, disabled, or no token: the browser keeps its download', async () => {
  const n = added.length;
  for (const store of [{ token: 'b'.repeat(32), enabled: true }, { token: TOKEN, enabled: false }, { token: '', enabled: true }]) {
    const x = loadExtension(store);
    await x.created({ id: 1, url: 'https://files.example.com/x.zip' });
    assert.deepEqual(x.calls.cancel, [], JSON.stringify(store));
    assert.equal(x.calls.suggested, 1, 'browser must be released');
  }
  assert.equal(added.length, n);
});
test('blob:/data:/file: URLs are never intercepted', async () => {
  const x = loadExtension({ token: TOKEN, enabled: true });
  for (const url of ['blob:https://a/1', 'data:text/plain,hi', 'file:///tmp/a.txt']) await x.created({ id: 2, url });
  assert.deepEqual(x.calls.cancel, []);
});
test('KDM not running: browser download is left alone and a warning badge shows', async () => {
  await new Promise((r) => server.close(r));
  const x = loadExtension({ token: TOKEN, enabled: true });
  await x.created({ id: 9, url: 'https://files.example.com/y.zip' });
  assert.deepEqual(x.calls.cancel, []);
  assert.equal(x.calls.suggested, 1);
  assert.ok(x.calls.badge.includes('!'));
});
