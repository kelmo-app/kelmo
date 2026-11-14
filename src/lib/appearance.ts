import type { Settings } from '../types/index.ts';

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
  s: Pick<Settings, 'theme' | 'accentColor' | 'density' | 'reduceMotion'> & { vibrant?: boolean },
  root: HTMLElement = document.documentElement,
): ResolvedTheme {
  const resolved = resolveTheme(s.theme);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-density', s.density);
  if (s.accentColor && s.accentColor !== 'default') root.setAttribute('data-accent', s.accentColor);
  else root.removeAttribute('data-accent');
  root.setAttribute('data-vibrant', s.vibrant ? 'true' : 'false');
  root.classList.toggle('reduce-motion', s.reduceMotion);
  return resolved;
}
