import { describe, expect, it } from 'vitest';
import { MAX_BATCH, expandPattern, parseBatch } from './batch';

describe('expandPattern', () => {
  it('numbers, zero padding and letters', () => {
    expect(expandPattern('https://x.com/g.part[1-3].rar')).toEqual(['https://x.com/g.part1.rar', 'https://x.com/g.part2.rar', 'https://x.com/g.part3.rar']);
    expect(expandPattern('https://x.com/p[08-10]')).toEqual(['https://x.com/p08', 'https://x.com/p09', 'https://x.com/p10']);
    expect(expandPattern('https://x.com/[a-c].zip')).toEqual(['https://x.com/a.zip', 'https://x.com/b.zip', 'https://x.com/c.zip']);
  });
  it('several ranges multiply; bad ranges stay as text', () => {
    expect(expandPattern('https://x.com/[1-2]/f[1-2]').length).toBe(4);
    expect(expandPattern('https://x.com/f[5-2]')).toEqual(['https://x.com/f[5-2]']);
    expect(expandPattern('https://x.com/f[1-9999]')).toEqual(['https://x.com/f[1-9999]']);
    expect(expandPattern('http://[::1]/file.zip')).toEqual(['http://[::1]/file.zip']);
  });
});

describe('parseBatch', () => {
  it('lines and patterns, skipping junk and duplicates', () => {
    const r = parseBatch('https://a.com/1.zip\nhello\nhttps://a.com/1.zip\nhttps://b.com/p[1-2].rar ftp://x/y');
    expect(r.urls).toEqual(['https://a.com/1.zip', 'https://b.com/p1.rar', 'https://b.com/p2.rar']);
    expect(r.invalid).toBe(2);
    expect(r.truncated).toBe(false);
  });
  it('is capped', () => {
    const r = parseBatch(Array.from({ length: MAX_BATCH + 5 }, (_, i) => `https://a.com/${i}`).join('\n'));
    expect(r.urls.length).toBe(MAX_BATCH);
    expect(r.truncated).toBe(true);
    expect(parseBatch('').urls).toEqual([]);
  });
});
