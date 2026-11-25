import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createVideoCache, isPrewarmable } = createRequire(import.meta.url)('../video-cache.cjs');

test('two askers share one run; later asks are served from memory', async () => {
  let runs = 0;
  const c = createVideoCache({ probe: async () => { runs++; await new Promise((r) => setTimeout(r, 20)); return { ok: true, title: 't' }; } });
  const [a, b] = await Promise.all([c.get('https://youtu.be/x'), c.get('https://youtu.be/x#frag')]);
  assert.equal(a.title, 't'); assert.equal(b.title, 't');
  await c.get('https://youtu.be/x');
  assert.equal(runs, 1);
});
test('failures are not remembered, expiry works, cookies bypass the cache', async () => {
  let runs = 0, t = 0, fail = true;
  const c = createVideoCache({ now: () => t, ttlMs: 100, probe: async () => { runs++; return fail ? { ok: false, error: 'x' } : { ok: true }; } });
  await c.get('https://youtu.be/y'); fail = false;
  await c.get('https://youtu.be/y'); assert.equal(runs, 2);
  await c.get('https://youtu.be/y'); assert.equal(runs, 2);
  t = 500; await c.get('https://youtu.be/y'); assert.equal(runs, 3);
  await c.get('https://youtu.be/y', { cookie: 'a=b' }); await c.get('https://youtu.be/y', { cookie: 'a=b' }); assert.equal(runs, 5);
});
test('only known video sites may be warmed', () => {
  assert.equal(isPrewarmable('https://www.youtube.com/watch?v=1'), true);
  assert.equal(isPrewarmable('https://evil.example/watch'), false);
  assert.equal(isPrewarmable('http://localhost:1234/'), false);
  assert.equal(isPrewarmable('file:///x'), false);
  assert.equal(isPrewarmable('https://notyoutube.com/'), false);
});
