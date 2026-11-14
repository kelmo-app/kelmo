import { describe, expect, it } from 'vitest';
import { checksumAlgo, checksumError, normalizeChecksum } from './checksum';

const SHA256 = 'a'.repeat(64);

describe('checksum helpers', () => {
  it('accepts plain, prefixed, spaced and colon-separated hashes', () => {
    expect(normalizeChecksum(SHA256.toUpperCase())).toBe(SHA256);
    expect(normalizeChecksum(`SHA256: ${SHA256}`)).toBe(SHA256);
    expect(normalizeChecksum(`sha-256 = ${'ab:'.repeat(31)}ab`)).toBe('ab'.repeat(32));
    expect(normalizeChecksum('  ' + 'f'.repeat(32) + '\n')).toBe('f'.repeat(32));
  });
  it('rejects text that is not a checksum', () => {
    expect(normalizeChecksum('hello')).toBe('');
    expect(normalizeChecksum('abc123')).toBe('');
    expect(normalizeChecksum('z'.repeat(64))).toBe('');
  });
  it('names the algorithm by length', () => {
    expect(checksumAlgo('a'.repeat(32))).toBe('MD5');
    expect(checksumAlgo('a'.repeat(40))).toBe('SHA1');
    expect(checksumAlgo(SHA256)).toBe('SHA256');
    expect(checksumAlgo('a'.repeat(128))).toBe('SHA512');
    expect(checksumAlgo('a')).toBeNull();
  });
  it('only complains about a non-empty, invalid value', () => {
    expect(checksumError('')).toBe('');
    expect(checksumError('   ')).toBe('');
    expect(checksumError(SHA256)).toBe('');
    expect(checksumError('nope')).not.toBe('');
  });
});
