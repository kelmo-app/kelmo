import { describe, expect, it } from 'vitest';
import { applyAppearance } from './appearance.ts';

const fakeRoot = () => {
  const attrs = new Map<string, string>();
  const classes = new Set<string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    classList: { toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)) },
  } as unknown as HTMLElement & { attrs: Map<string, string> };
};

describe('applyAppearance palettes', () => {
  const base = { theme: 'dark' as const, accentColor: 'rose' as const, density: 'comfortable' as const, reduceMotion: false, vibrant: true };
  it('gold (default) changes nothing', () => {
    const r = fakeRoot();
    applyAppearance({ ...base, palette: 'gold' }, r);
    expect(r.attrs.has('data-palette')).toBe(false);
    expect(r.attrs.get('data-accent')).toBe('rose');
    expect(r.attrs.get('data-theme')).toBe('dark');
  });
  it('a light palette forces light, a dark one forces dark, and they drop accent and washes', () => {
    const r = fakeRoot();
    applyAppearance({ ...base, palette: 'clean' }, r);
    expect(r.attrs.get('data-palette')).toBe('clean');
    expect(r.attrs.get('data-theme')).toBe('light');
    expect(r.attrs.has('data-accent')).toBe(false);
    expect(r.attrs.get('data-vibrant')).toBe('false');
    applyAppearance({ ...base, theme: 'light', palette: 'slate' }, r);
    expect(r.attrs.get('data-theme')).toBe('dark');
    applyAppearance({ ...base, palette: 'gold' }, r);
    expect(r.attrs.has('data-palette')).toBe(false);
  });
});

describe('two-mode palettes', () => {
  const base = { accentColor: 'rose' as const, density: 'comfortable' as const, reduceMotion: false, vibrant: true };
  it('follow Theme, so each has light and dark', () => {
    const r = fakeRoot();
    for (const palette of ['sand', 'navygold', 'royal', 'emerald'] as const) {
      applyAppearance({ ...base, theme: 'light', palette }, r);
      expect(r.attrs.get('data-theme')).toBe('light');
      expect(r.attrs.get('data-palette')).toBe(palette);
      applyAppearance({ ...base, theme: 'dark', palette }, r);
      expect(r.attrs.get('data-theme')).toBe('dark');
    }
  });
  it('an unknown old key falls back to gold', () => {
    const r = fakeRoot();
    applyAppearance({ ...base, theme: 'dark', palette: 'mono' as never }, r);
    expect(r.attrs.has('data-palette')).toBe(false);
  });
});

describe('applyAppearance', () => {
  it('sets accent and vibrant', () => {
    const r = fakeRoot();
    applyAppearance({ theme: 'light', accentColor: 'violet', density: 'compact', reduceMotion: false, vibrant: true }, r);
    expect(r.attrs.get('data-accent')).toBe('violet');
    expect(r.attrs.get('data-vibrant')).toBe('true');
    expect(r.attrs.get('data-theme')).toBe('light');
  });
  it('removes the accent for copper default', () => {
    const r = fakeRoot();
    applyAppearance({ theme: 'dark', accentColor: 'rose', density: 'comfortable', reduceMotion: false }, r);
    applyAppearance({ theme: 'dark', accentColor: 'default', density: 'comfortable', reduceMotion: false }, r);
    expect(r.attrs.has('data-accent')).toBe(false);
    expect(r.attrs.get('data-vibrant')).toBe('false');
  });
});
