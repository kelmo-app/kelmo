import { describe, expect, it } from 'vitest';
import { linksFromDrop } from './dropLinks';

describe('linksFromDrop', () => {
  it('reads a uri-list and ignores comments', () => {
    expect(linksFromDrop({ uriList: '# from the browser\r\nhttps://a.com/x.zip\r\nhttps://b.com/y.iso\r\n' })).toEqual(['https://a.com/x.zip', 'https://b.com/y.iso']);
  });
  it('falls back to plain text and skips non-web text', () => {
    expect(linksFromDrop({ text: 'look: https://a.com/x.zip and file:///etc/passwd and javascript:1' })).toEqual(['https://a.com/x.zip']);
    expect(linksFromDrop({ text: 'hello' })).toEqual([]);
    expect(linksFromDrop({})).toEqual([]);
  });
  it('removes duplicates', () => {
    expect(linksFromDrop({ text: 'https://a.com/x https://a.com/x' })).toEqual(['https://a.com/x']);
  });
});
