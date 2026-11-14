/** Checksum helpers for the Add dialog (the hashing itself happens in engine/hash.mjs). */

const BY_LENGTH: Record<number, string> = { 32: 'MD5', 40: 'SHA1', 64: 'SHA256', 128: 'SHA512' };

/** "SHA256: AB cd…" and "ab:cd…" become plain lowercase hex; '' when the text is not a known checksum. */
export function normalizeChecksum(text: string): string {
  const t = text.replace(/^\s*(md5|sha-?1|sha-?256|sha-?512)\s*[:=]?\s*/i, '').replace(/[\s:]/g, '').toLowerCase();
  return /^[0-9a-f]+$/.test(t) && BY_LENGTH[t.length] ? t : '';
}

/** Which algorithm a checksum belongs to, judged by its length. */
export function checksumAlgo(hex: string): string | null {
  return BY_LENGTH[hex.length] ?? null;
}

/** Error text for the Add dialog; '' when empty (optional) or valid. */
export function checksumError(text: string): string {
  if (!text.trim()) return '';
  return normalizeChecksum(text) ? '' : 'This is not a checksum. Paste the MD5, SHA-1, SHA-256 or SHA-512 value from the website.';
}
