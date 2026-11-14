import { describe, expect, it } from 'vitest';
import { domainOf, fileNameFromUrl, isMagnetUrl, isTorrentFileUrl, isValidUrl, looksLikeUrl } from './url.ts';

const MAGNET = 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=Zorin%20OS%2017&tr=udp%3A%2F%2Ftracker.example%3A80';

describe('magnet links', () => {
  it('are accepted as links', () => {
    expect(isMagnetUrl(MAGNET)).toBe(true);
    expect(isValidUrl(MAGNET)).toBe(true);
    expect(looksLikeUrl(MAGNET)).toBe(true);
  });
  it('need a torrent hash', () => {
    expect(isMagnetUrl('magnet:?dn=x')).toBe(false);
    expect(isValidUrl('magnet:?dn=x')).toBe(false);
  });
  it('use the display name and a torrent source', () => {
    expect(fileNameFromUrl(MAGNET)).toBe('Zorin OS 17');
    expect(fileNameFromUrl('magnet:?xt=urn:btih:abc')).toBe('Torrent');
    expect(domainOf(MAGNET)).toBe('torrent');
  });
});

describe('.torrent files on this computer', () => {
  it('are links too', () => {
    const u = 'file:///home/markhor/Downloads/Zorin%20OS%2017.torrent';
    expect(isTorrentFileUrl(u)).toBe(true);
    expect(isValidUrl(u)).toBe(true);
    expect(fileNameFromUrl(u)).toBe('Zorin OS 17');
    expect(domainOf(u)).toBe('torrent');
    expect(isTorrentFileUrl('file:///etc/passwd')).toBe(false);
  });
});
