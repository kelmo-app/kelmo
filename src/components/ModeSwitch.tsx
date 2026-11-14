import { LayoutList, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Settings } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { Segmented } from './ui/Fields';
import { IconButton } from './ui/Button';

type Mode = Settings['uiMode'];

/** Simple (list-first, like IDM) ⇄ Advanced (the full workspace). */
export function useUiMode(): { mode: Mode; setMode: (m: Mode) => void } {
  const mode = useSettingsStore((s) => s.settings.uiMode);
  const update = useSettingsStore((s) => s.update);
  const navigate = useNavigate();
  return {
    mode,
    setMode: (m) => {
      update({ uiMode: m });
      navigate(m === 'simple' ? '/downloads' : '/overview');
    },
  };
}

export function ModeSwitch({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  const { mode, setMode } = useUiMode();
  if (collapsed) {
    return (
      <IconButton label={mode === 'simple' ? 'Switch to Advanced view' : 'Switch to Simple view'} tipPos="right" onClick={() => setMode(mode === 'simple' ? 'advanced' : 'simple')}>
        {mode === 'simple' ? <LayoutDashboard size={18} /> : <LayoutList size={18} />}
      </IconButton>
    );
  }
  return (
    <Segmented<Mode>
      label="Interface"
      size="sm"
      className={className}
      value={mode}
      onChange={setMode}
      options={[
        { value: 'simple', label: 'Simple', ariaLabel: 'Simple view' },
        { value: 'advanced', label: 'Advanced', ariaLabel: 'Advanced view' },
      ]}
    />
  );
}
