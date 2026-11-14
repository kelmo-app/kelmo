import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createPower, commandFor } = createRequire(import.meta.url)('../power.cjs');

function make(over = {}) {
  const calls = { exec: [], quit: 0, log: [] };
  const power = createPower({
    platform: 'linux',
    execFile: (f, a, cb) => { calls.exec.push([f, a]); cb(null); },
    quit: () => { calls.quit++; },
    confirm: () => new Promise(() => {}), // nobody answers: the countdown decides
    seconds: 0.02,
    log: (m) => calls.log.push(m),
    ...over,
  });
  return { power, calls };
}

test('commands per platform', () => {
  assert.deepEqual(commandFor('linux', 'shutdown'), ['systemctl', ['poweroff']]);
  assert.deepEqual(commandFor('linux', 'sleep'), ['systemctl', ['suspend']]);
  assert.equal(commandFor('win32', 'shutdown')[0], 'shutdown');
  assert.equal(commandFor('plan9', 'sleep'), null);
});

test('none does nothing, quit quits at once without a countdown', async () => {
  const { power, calls } = make();
  assert.equal(await power.trigger('none'), 'none');
  assert.equal(await power.trigger('bogus'), 'none');
  assert.equal(await power.trigger('quit'), 'quit');
  assert.equal(calls.quit, 1);
  assert.equal(calls.exec.length, 0);
});

test('shutdown runs after the countdown when nobody answers', async () => {
  const { power, calls } = make();
  assert.equal(await power.trigger('shutdown'), 'done');
  assert.deepEqual(calls.exec, [['systemctl', ['poweroff']]]);
});

test('Cancel stops it; "now" does not wait', async () => {
  const a = make({ confirm: async () => false, seconds: 60 });
  assert.equal(await a.power.trigger('sleep'), 'cancelled');
  assert.equal(a.calls.exec.length, 0);
  const b = make({ confirm: async () => true, seconds: 60 });
  assert.equal(await b.power.trigger('sleep'), 'done');
  assert.deepEqual(b.calls.exec, [['systemctl', ['suspend']]]);
});

test('a second trigger while the countdown is on screen is ignored; unsupported systems are reported', async () => {
  const { power } = make({ seconds: 0.05 });
  const first = power.trigger('shutdown');
  assert.equal(await power.trigger('shutdown'), 'busy');
  await first;
  const u = make({ platform: 'plan9' });
  assert.equal(await u.power.trigger('shutdown'), 'unsupported');
});

test('a failing command is logged, not thrown', async () => {
  const { power, calls } = make({ execFile: (f, a, cb) => cb(new Error('denied')) });
  assert.equal(await power.trigger('shutdown'), 'done');
  assert.ok(calls.log.some((m) => m.includes('denied')));
});
