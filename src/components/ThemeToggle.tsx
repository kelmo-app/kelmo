import { Monitor, Moon, Sun } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useResolvedTheme, useToggleTheme } from '@/hooks/useTheme';
import { IconButton } from './ui/Button';
import { Segmented } from './ui/Fields';
import type { ThemeMode } from '@/types';

/** One-click dark/light toggle for the top bar. */
export function ThemeToggle({ tipPos = 'bottom' }: { tipPos?: 'top' | 'bottom' | 'right' }) {
  const resolved = useResolvedTheme();
  const toggle = useToggleTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <IconButton label={`Switch to ${next} theme`} tipPos={tipPos} onClick={toggle} data-testid="theme-toggle" aria-pressed={resolved === 'light'}>
      {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}

/** Dark / Light / System segmented switch (sidebar footer, settings). */
export function ThemeSwitcher({ size = 'sm', className }: { size?: 'sm' | 'md'; className?: string }) {
  const theme = useSettingsStore((s) => s.settings.theme);
  const update = useSettingsStore((s) => s.update);
  return (
    <Segmented<ThemeMode>
      label="Theme"
      size={size}
      className={className}
      value={theme}
      onChange={(v) => update({ theme: v })}
      options={[
        { value: 'dark', label: <Moon size={14} />, ariaLabel: 'Dark theme' },
        { value: 'light', label: <Sun size={14} />, ariaLabel: 'Light theme' },
        { value: 'system', label: <Monitor size={14} />, ariaLabel: 'System theme' },
      ]}
    />
  );
}
