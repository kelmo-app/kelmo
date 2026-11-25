import { useEffect } from 'react';
import { applyAppearance, resolveTheme, type ResolvedTheme } from '@/lib/appearance';
import { useSettingsStore } from '@/store/settingsStore';
import { platform } from '@/services/platform';

/** Applies theme/accent/density/motion to <html> and reacts to OS theme changes. */
export function useThemeEffect(): void {
  const theme = useSettingsStore((s) => s.settings.theme);
  const accent = useSettingsStore((s) => s.settings.accentColor);
  const density = useSettingsStore((s) => s.settings.density);
  const reduceMotion = useSettingsStore((s) => s.settings.reduceMotion);
  const minimizeToTray = useSettingsStore((s) => s.settings.startupBehavior.minimizeToTray);
  const vibrant = useSettingsStore((s) => s.settings.vibrant);
  const palette = useSettingsStore((s) => s.settings.palette);
  const launchOnStartup = useSettingsStore((s) => s.settings.startupBehavior.launchOnStartup);

  useEffect(() => {
    applyAppearance({ theme, accentColor: accent, density, reduceMotion, vibrant, palette });
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyAppearance({ theme, accentColor: accent, density, reduceMotion, vibrant, palette });
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme, accent, density, reduceMotion, vibrant, palette]);

  useEffect(() => {
    void platform.setMinimizeToTray(minimizeToTray);
  }, [minimizeToTray]);

  useEffect(() => {
    void platform.setAutostart(launchOnStartup);
  }, [launchOnStartup]);
}

export function useResolvedTheme(): ResolvedTheme {
  const theme = useSettingsStore((s) => s.settings.theme);
  return resolveTheme(theme);
}

/** Toggle between dark and light (explicitly leaves "system" mode). */
export function useToggleTheme(): () => void {
  const update = useSettingsStore((s) => s.update);
  return () => {
    const current = resolveTheme(useSettingsStore.getState().settings.theme);
    update({ theme: current === 'dark' ? 'light' : 'dark' });
  };
}
