import { clamp, formatBytes, formatClock, formatClock12, formatEta, formatMBps, formatRelative } from './format.ts';
import { classifyFile, domainOf, fileNameFromUrl, isValidUrl } from './url.ts';

describe('format helpers', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1.2 * 1024 ** 3)).toBe('1.2 GB');
    expect(formatBytes(512 * 1024 ** 2)).toBe('512 MB');
  });

  it('formats speed and ETA', () => {
    expect(formatMBps(42.8 * 1024 ** 2)).toBe('42.8 MB/s');
    expect(formatEta(28)).toBe('28s');
    expect(formatEta(134)).toBe('2m 14s');
    expect(formatEta(3720)).toBe('1h 02m');
    expect(formatEta(null)).toBe('—');
    expect(formatClock(134)).toBe('02:14');
  });

  it('formats times', () => {
    expect(formatClock12('23:00')).toBe('11:00 PM');
    expect(formatClock12('00:00')).toBe('12:00 AM');
    expect(formatClock12('06:30')).toBe('6:30 AM');
    expect(formatRelative(Date.now() - 2 * 3600_000)).toBe('2 hours ago');
  });

  it('clamps', () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});

describe('url helpers', () => {
  it('validates urls', () => {
    expect(isValidUrl('https://releases.ubuntu.com/a.iso')).toBe(true);
    expect(isValidUrl('ftp://ftp.gnu.org/gnu/a.tar.gz')).toBe(true);
    expect(isValidUrl('ubuntu.com/a.iso')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('derives file names, domains and categories', () => {
    expect(fileNameFromUrl('https://x.org/a/b/My%20File.zip?token=1')).toBe('My File.zip');
    expect(domainOf('https://www.python.org/x')).toBe('python.org');
    expect(classifyFile('ubuntu.iso')).toEqual({ fileType: 'iso', category: 'General' });
    expect(classifyFile('report.pdf').category).toBe('Documents');
    expect(classifyFile('movie.mkv').category).toBe('Video');
    expect(classifyFile('thing.tar.xz').category).toBe('Compressed');
    expect(classifyFile('thing.weird').category).toBe('General');
  });
});
