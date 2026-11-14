import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { extractDownloadUrl, createClipboardWatcher } = createRequire(import.meta.url)('../clipboard-watch.cjs');

test('file links are recognised, other text is not', () => {
  assert.equal(extractDownloadUrl('https://x.com/files/Win11.iso'), 'https://x.com/files/Win11.iso');
  assert.equal(extractDownloadUrl('  http://a.b/c/d.tar.gz\n'), 'http://a.b/c/d.tar.gz');
  assert.equal(extractDownloadUrl('https://x.com/get/My%20Book.pdf'), 'https://x.com/get/My%20Book.pdf');
  assert.equal(extractDownloadUrl('https://x.com/index.html'), null);
  assert.equal(extractDownloadUrl('https://x.com/photo.jpg'), null);
  assert.equal(extractDownloadUrl('https://x.com/'), null);
  assert.equal(extractDownloadUrl('see https://x.com/a.zip please'), null);
  assert.equal(extractDownloadUrl('ftp://x.com/a.zip'), null);
  assert.equal(extractDownloadUrl('javascript:alert(1)//a.zip'), null);
  assert.equal(extractDownloadUrl('x'.repeat(3000) + '.zip'), null);
  assert.equal(extractDownloadUrl(undefined), null);
});

function harness(initial) {
  const s = { clip: initial, on: true, seen: [] };
  const w = createClipboardWatcher({ read: () => s.clip, enabled: () => s.on, onLink: (u) => s.seen.push(u), timers: { setInterval: () => 1, clearInterval() {} } });
  return { s, w };
}

test('content already on the clipboard at start is ignored; new links are offered once', () => {
  const { s, w } = harness('https://x.com/old.zip');
  w.tick(); assert.deepEqual(s.seen, []);
  s.clip = 'https://x.com/new.iso'; w.tick(); w.tick();
  assert.deepEqual(s.seen, ['https://x.com/new.iso']);
  s.clip = 'hello'; w.tick();
  s.clip = 'https://x.com/new.iso'; w.tick(); // copied again on purpose
  assert.equal(s.seen.length, 2);
});

test('disabled: nothing is read, and old content is not offered when it is switched on', () => {
  const { s, w } = harness('start');
  w.tick();
  s.on = false;
  s.clip = 'https://x.com/while-off.zip'; w.tick();
  s.on = true; w.tick();
  assert.deepEqual(s.seen, []);
  s.clip = 'https://x.com/after.zip'; w.tick();
  assert.deepEqual(s.seen, ['https://x.com/after.zip']);
});
