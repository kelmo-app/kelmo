import { Github, Scale } from 'lucide-react';
import { APP_VERSION } from '@/data/defaults';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LogoMark } from '../Common';

export const GPL_STATEMENT = 'KELMO is open-source software released under the GPLv3 license.';

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="About KELMO"
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose} data-autofocus>
          Close
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <LogoMark size={56} />
        <div>
          <p className="text-xl font-semibold tracking-[0.22em] text-fg">KELMO</p>
          <p className="text-[13px] text-fg2">The Open Download Workspace</p>
          <p className="tnum mt-1 text-xs text-fg3">Version {APP_VERSION}</p>
        </div>
        <p className="max-w-xs text-[13px] text-fg2">
          An open-source alternative to classic download managers for Windows and Linux — queues, scheduling and a verified library, built for freedom.
        </p>
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface2 px-3 py-2 text-[13px] text-fg">
          <Scale size={15} className="shrink-0 text-accent" aria-hidden />
          {GPL_STATEMENT}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-fg3">
          <Github size={13} aria-hidden /> Contributions are welcome.
        </p>
      </div>
    </Modal>
  );
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['Ctrl', 'N'], label: 'Add download' },
  { keys: ['Ctrl', 'K'], label: 'Focus search' },
  { keys: ['Ctrl', ','], label: 'Open settings' },
  { keys: ['Space'], label: 'Pause / resume the selected download' },
  { keys: ['Delete'], label: 'Remove the selected download' },
  { keys: ['Esc'], label: 'Close dialog or drawer' },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="On macOS use ⌘ instead of Ctrl."
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose} data-autofocus>
          Done
        </Button>
      }
    >
      <ul className="divide-y divide-line">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
            <span className="text-fg">{s.label}</span>
            <span className="flex gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="kbd">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
