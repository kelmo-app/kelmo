import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { planTrash, trashFiles } = createRequire(import.meta.url)('../trash.cjs');

const HOME = '/home/u';
test('plans only <dir>/<name>, expands ~, and refuses anything risky', () => {
  const { targets, refused } = planTrash([
    { dir: '~/Downloads/KELMO/General', name: 'Movie' },
    { dir: '/home/u/Downloads', name: '../etc' },
    { dir: '/home/u/Downloads', name: 'a/b' },
    { dir: '/home/u/Downloads', name: '..' },
    { dir: '/home/u/Downloads', name: '' },
    { dir: '/', name: 'x' },
    { dir: '/home/u', name: 'x' },
    { dir: '/home', name: 'x' },
    { dir: 'relative/dir', name: 'x' },
    { name: 'x' },
  ], HOME);
  assert.deepEqual(targets, ['/home/u/Downloads/KELMO/General/Movie']);
  assert.equal(refused.length, 9);
});

test('moves the file or folder to the trash and removes .part/.kdm leftovers; missing files are not errors', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-trash-'));
  fs.mkdirSync(path.join(d, 'Torrent Folder')); fs.writeFileSync(path.join(d, 'Torrent Folder', 'v.mp4'), 'x');
  fs.writeFileSync(path.join(d, 'a.bin.part'), 'p'); fs.writeFileSync(path.join(d, 'a.bin.kdm'), 'k');
  const seen = [];
  const r = await trashFiles([{ dir: d, name: 'Torrent Folder' }, { dir: d, name: 'a.bin' }, { dir: d, name: 'gone.zip' }], { trashItem: async (p) => { seen.push(p); }, home: '/nowhere' });
  assert.deepEqual(seen, [path.join(d, 'Torrent Folder')]);
  assert.equal(r.trashed, 1); assert.equal(r.missing, 2); assert.deepEqual(r.failed, []);
  assert.equal(fs.existsSync(path.join(d, 'a.bin.part')), false);
  assert.equal(fs.existsSync(path.join(d, 'a.bin.kdm')), false);
});

test('a trash failure is reported, never turned into a hard delete', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-trash-')); fs.writeFileSync(path.join(d, 'f.iso'), 'x');
  const r = await trashFiles([{ dir: d, name: 'f.iso' }], { trashItem: async () => { throw new Error('no trash'); }, home: '/nowhere' });
  assert.deepEqual(r.failed, ['f.iso']); assert.equal(fs.existsSync(path.join(d, 'f.iso')), true);
});
