import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { resolveOpenTarget, biggestMedia } = createRequire(import.meta.url)('../open-target.cjs');

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-open-'));
const put = (f, n) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(n, 1)); };

test('a torrent folder opens its biggest video, not the subtitle or poster', () => {
  const d = mk();
  put(path.join(d, 'Movie', 'Movie.mp4'), 5000);
  put(path.join(d, 'Movie', 'Movie.srt'), 90);
  put(path.join(d, 'Movie', 'poster.jpg'), 300);
  assert.equal(resolveOpenTarget(path.join(d, 'Movie')), path.join(d, 'Movie', 'Movie.mp4'));
});
test('finds the video inside sub-folders and picks the biggest of several', () => {
  const d = mk();
  put(path.join(d, 'S', 'ep1.mkv'), 100); put(path.join(d, 'S', 'x', 'ep2.mkv'), 900);
  assert.equal(biggestMedia(d), path.join(d, 'S', 'x', 'ep2.mkv'));
});
test('a plain file stays as it is', () => {
  const d = mk(); const f = path.join(d, 'a.mp4'); put(f, 10);
  assert.equal(resolveOpenTarget(f), f);
});
test('a folder with nothing safe to open stays a folder; a missing path is passed through', () => {
  const d = mk(); put(path.join(d, 'a.sh'), 5);
  assert.equal(resolveOpenTarget(d), d);
  assert.equal(resolveOpenTarget(path.join(d, 'nope')), path.join(d, 'nope'));
});

test('a torrent folder with only an archive opens the archive; scripts/executables are never picked', () => {
  const d = mk();
  put(path.join(d, 'Office', 'Office.rar'), 8000);
  put(path.join(d, 'Office', 'readme.txt'), 10);
  put(path.join(d, 'Office', 'Setup.exe'), 99999);
  assert.equal(resolveOpenTarget(path.join(d, 'Office')), path.join(d, 'Office', 'Office.rar'));
  const only = mk(); put(path.join(only, 'T', 'run.sh'), 50);
  assert.equal(resolveOpenTarget(path.join(only, 'T')), path.join(only, 'T'));
});
