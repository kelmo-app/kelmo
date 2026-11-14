import { describe, expect, it } from 'vitest';
import { MAX_MIRRORS, parseMirrors } from './mirrors';

describe('parseMirrors', () => {
  it('keeps valid links, drops junk, duplicates and the main link', () => {
    const t = 'https://a.com/f.iso\nnot a link\nhttps://a.com/f.iso  ftp://x/y\nhttps://main.com/f.iso\nhttp://b.org/f.iso';
    expect(parseMirrors(t, 'https://main.com/f.iso')).toEqual(['https://a.com/f.iso', 'http://b.org/f.iso']);
  });
  it('is empty for empty input and capped at the limit', () => {
    expect(parseMirrors('')).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => `https://m${i}.com/f`).join('\n');
    expect(parseMirrors(many).length).toBe(MAX_MIRRORS);
  });
});
