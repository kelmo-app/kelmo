// File checksums: stream the finished file through a hash, never loading it into memory.
import crypto from 'node:crypto';
import fs from 'node:fs';

const BY_NAME = { MD5: 'md5', SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512' };
const BY_LENGTH = { 32: 'MD5', 40: 'SHA1', 64: 'SHA256', 128: 'SHA512' };

/** A pasted checksum as plain lowercase hex: "SHA256: AB cd…" and "ab:cd" both work. Empty string when it is not hex. */
export function normalizeHash(text) {
  if (typeof text !== 'string') return '';
  const t = text.replace(/^\s*(md5|sha-?1|sha-?256|sha-?512)\s*[:=]?\s*/i, '').replace(/[\s:]/g, '').toLowerCase();
  return /^[0-9a-f]+$/.test(t) && BY_LENGTH[t.length] ? t : '';
}

/** Which algorithm a checksum belongs to, judged by its length (null when unknown). */
export function algoForHash(hex) {
  return BY_LENGTH[hex.length] ?? null;
}

/** @returns {Promise<string>} lowercase hex digest */
export function hashFile(file, algo = 'SHA256') {
  const name = BY_NAME[String(algo).toUpperCase().replace('-', '')];
  if (!name) return Promise.reject(new Error(`Unsupported checksum: ${algo}`));
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(name);
    const s = fs.createReadStream(file, { highWaterMark: 1024 * 1024 });
    s.on('error', reject);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

/**
 * Check a finished file. With an expected checksum the algorithm comes from its length and `match` says whether
 * it agrees; without one the file is hashed with `algo` and `match` is null (nothing to compare against).
 */
export async function verifyFile(file, { algo = 'SHA256', expected = '' } = {}) {
  const want = normalizeHash(expected);
  const use = want ? algoForHash(want) : String(algo).toUpperCase().replace('-', '');
  const hash = await hashFile(file, use);
  return { algo: use, hash, match: want ? hash === want : null };
}
