import type { PaletteKey, Settings } from '../types/index.ts';

/** Palettes that have both a light and a dark version and so follow Theme (Dark / Light / System). */
export const TWO_MODE_PALETTES: ReadonlySet<PaletteKey> = new Set<PaletteKey>(['sand', 'navygold', 'royal', 'emerald']);
/** Single-mode palettes that are light; every other single-mode palette is dark. */
export const LIGHT_PALETTES: ReadonlySet<PaletteKey> = new Set<PaletteKey>(['windows', 'ivory', 'clean']);
const KNOWN: ReadonlySet<string> = new Set(['windows', 'ivory', 'slate', 'graphite', 'clean', 'sand', 'navygold', 'royal', 'emerald']);

export type ResolvedTheme = 'dark' | 'light';

export function prefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

export function resolveTheme(theme: Settings['theme']): ResolvedTheme {
  if (theme === 'system') return prefersDark() ? 'dark' : 'light';
  return theme;
}

/** Writes theme/accent/density/motion onto <html>. Pure DOM, easy to test. */
export function applyAppearance(
  s: Pick<Settings, 'theme' | 'accentColor' | 'density' | 'reduceMotion'> & { vibrant?: boolean; palette?: PaletteKey },
  root: HTMLElement = document.documentElement,
): ResolvedTheme {
  // an unknown key (e.g. a scheme from an older build that no longer exists) falls back to KELMO Gold
  const palette = s.palette && KNOWN.has(s.palette) ? s.palette : null;
  const resolved: ResolvedTheme = palette && !TWO_MODE_PALETTES.has(palette) ? (LIGHT_PALETTES.has(palette) ? 'light' : 'dark') : resolveTheme(s.theme);
  root.setAttribute('data-theme', resolved);
  if (palette) root.setAttribute('data-palette', palette);
  else root.removeAttribute('data-palette');
  root.setAttribute('data-density', s.density);
  if (!palette && s.accentColor && s.accentColor !== 'default') root.setAttribute('data-accent', s.accentColor);
  else root.removeAttribute('data-accent');
  root.setAttribute('data-vibrant', s.vibrant && !palette ? 'true' : 'false');
  root.classList.toggle('reduce-motion', s.reduceMotion);
  return resolved;
}
