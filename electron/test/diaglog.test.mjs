import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { createDiagLogger, redactUrl } = createRequire(import.meta.url)('../diag-log.cjs');

test('links are logged without query, login or fragment', () => {
  assert.equal(redactUrl('https://user:pw@files.example.com:8443/a/b.iso?token=SECRET&x=1#frag'), 'https://files.example.com:8443/a/b.iso');
  assert.equal(redactUrl('nonsense'), '(invalid link)');
});

test('nothing is written unless diagnostic mode is on; lines go to a per-day file, one line each', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-log-'));
  let cfg = { diagnostic: false, logFolder: dir };
  const log = createDiagLogger({ fs, now: () => new Date('2026-10-28T10:00:00Z'), getCfg: () => cfg });
  assert.equal(log('hidden'), false);
  assert.deepEqual(fs.readdirSync(dir), []);
  cfg = { diagnostic: true, logFolder: dir };
  assert.equal(log('state d1 failed: HTTP 403\r\ninjected line'), true);
  const text = fs.readFileSync(path.join(dir, 'kdm-2026-10-28.log'), 'utf8');
  assert.equal(text.split('\n').filter(Boolean).length, 1);
  assert.match(text, /^2026-10-28T10:00:00.000Z state d1 failed: HTTP 403 injected line$/m);
});

test('an unwritable folder never throws', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-log-')), 'a-file');
  fs.writeFileSync(file, 'x'); // a folder cannot be made inside a file
  const log = createDiagLogger({ fs, getCfg: () => ({ diagnostic: true, logFolder: path.join(file, 'logs') }) });
  assert.equal(log('x'), false);
});
