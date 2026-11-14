import { describe, expect, it } from 'vitest';
import type { VideoInfo } from '@/types/global';
import { formatDuration, isVideoSite, videoChoices, videoFileName, videoHints } from './videoSites';

const info = (o: Partial<VideoInfo> = {}): VideoInfo => ({ ok: true, playlist: false, title: 'T', live: false, heights: [1080, 720, 360], muxedHeights: [360], sizes: { 1080: 95, 720: 45, 360: 10 }, audioSize: 5, audioOnly: false, ...o });

describe('video site links (same rule as the engine)', () => {
  it('pages of video sites are recognised', () => {
    for (const u of ['https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', 'https://m.youtube.com/shorts/xyz', 'https://vimeo.com/123', 'https://www.bilibili.com/video/BV1', 'https://www.youtube.com/playlist?list=PL1']) expect(isVideoSite(u)).toBe(true);
  });
  it('home pages, searches, direct files and other schemes are not', () => {
    for (const u of ['https://www.youtube.com/', 'https://www.youtube.com/watch', 'https://www.youtube.com/results?search_query=x', 'https://example.com/a.mp4', 'https://cdn.vimeo.com/x.mp4', 'ftp://youtu.be/abc', 'not a url']) expect(isVideoSite(u)).toBe(false);
  });
});

describe('quality choices', () => {
  it('with ffmpeg every height is offered, best first, plus audio', () => {
    const { choices, limited } = videoChoices(info(), true);
    expect(choices.map((c) => c.value)).toEqual(['best', '1080', '720', '360', 'audio']);
    expect(choices[0].label).toBe('Best available (1080p)');
    expect(choices[1].label).toBe('1080p (Full HD)');
    expect(choices[0].size).toBe(95);
    expect(limited).toBe(false);
  });
  it('without ffmpeg only ready-made files are offered, and the window is told why the rest are missing', () => {
    const { choices, limited } = videoChoices(info(), false);
    expect(choices.map((c) => c.value)).toEqual(['best', '360', 'audio']);
    expect(limited).toBe(true);
  });
  it('a sound-only link offers audio only', () => {
    const { choices } = videoChoices(info({ heights: [], muxedHeights: [], audioOnly: true }), true);
    expect(choices.map((c) => c.value)).toEqual(['audio']);
  });
  it('a link without a quality list still offers "best"', () => {
    expect(videoChoices(info({ heights: [], muxedHeights: [], audioOnly: false }), true).choices.map((c) => c.value)).toEqual(['best']);
  });
  it('never more than 8 heights', () => {
    const heights = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144, 100];
    expect(videoChoices(info({ heights, muxedHeights: heights }), true).choices.filter((c) => /^\d+$/.test(c.value))).toHaveLength(8);
  });
});

describe('names, time and hints', () => {
  it('file name follows the choice', () => {
    expect(videoFileName('My clip', '720', true)).toBe('My clip.mp4');
    expect(videoFileName('My clip', 'audio', true)).toBe('My clip.mp3');
    expect(videoFileName('My clip', 'audio', false)).toBe('My clip.m4a');
  });
  it('duration reads like a player', () => {
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(0)).toBe('');
  });
  it('YouTube without a JavaScript runtime gets a hint; others and a ready system do not', () => {
    const base = { installed: true, version: 'x', managed: true, ffmpeg: true };
    expect(videoHints('https://www.youtube.com/watch?v=a', { ...base, runtime: null })).toHaveLength(1);
    expect(videoHints('https://www.youtube.com/watch?v=a', { ...base, runtime: 'node' })).toEqual([]);
    expect(videoHints('https://vimeo.com/1', { ...base, runtime: null })).toEqual([]);
    expect(videoHints('https://vimeo.com/1', null)).toEqual([]);
  });
});
