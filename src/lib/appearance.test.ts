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
