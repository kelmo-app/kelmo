import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashFile, normalizeHash, algoForHash, verifyFile } from '../hash.mjs';

const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const ABC_MD5 = '900150983cd24fb0d6963f7d28e17f72';

function tmpFile(text) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-hash-')), 'a.bin');
  fs.writeFileSync(f, text);
  return f;
}

test('hashFile matches the known digests', async () => {
  const f = tmpFile('abc');
  assert.equal(await hashFile(f, 'SHA256'), ABC_SHA256);
  assert.equal(await hashFile(f, 'md5'), ABC_MD5);
  await assert.rejects(hashFile(f, 'crc32'));
});

test('normalizeHash accepts labels, spaces, colons and capitals; rejects non-hex', () => {
  assert.equal(normalizeHash(`SHA256: ${ABC_SHA256.toUpperCase()}`), ABC_SHA256);
  assert.equal(normalizeHash(ABC_MD5.match(/../g).join(':')), ABC_MD5);
  assert.equal(normalizeHash('  '), '');
  assert.equal(normalizeHash('hello world'), '');
  assert.equal(normalizeHash('abcd'), ''); // not a known length
});

test('algoForHash goes by length', () => {
  assert.equal(algoForHash(ABC_SHA256), 'SHA256');
  assert.equal(algoForHash(ABC_MD5), 'MD5');
  assert.equal(algoForHash('a'.repeat(40)), 'SHA1');
  assert.equal(algoForHash('a'.repeat(128)), 'SHA512');
});

test('verifyFile: match, mismatch, and hash-only', async () => {
  const f = tmpFile('abc');
  assert.deepEqual(await verifyFile(f, { expected: ABC_SHA256 }), { algo: 'SHA256', hash: ABC_SHA256, match: true });
  const bad = await verifyFile(f, { expected: 'f'.repeat(64) });
  assert.equal(bad.match, false);
  assert.deepEqual(await verifyFile(f, { algo: 'MD5' }), { algo: 'MD5', hash: ABC_MD5, match: null });
  assert.equal((await verifyFile(f, { expected: ABC_MD5 })).match, true); // algorithm chosen from the length
});
