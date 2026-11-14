import { useEffect, useState } from 'react';
import type { PopupConfig } from '@/types/global';
import { useThemeEffect } from '@/hooks/useTheme';
import { AddPopup, type IncomingLink } from './AddPopup';
import { DonePopup } from './DonePopup';
import { DropPopup } from './DropPopup';
import { ProgressPopup } from './ProgressPopup';
import { TrayPopup } from './TrayPopup';

type Kind = 'add' | 'progress' | 'done' | 'drop' | 'tray';
type Init = { kind: Kind; payload: unknown; config: PopupConfig | null };

/** Root of the small windows. They never run the download manager — they only show it. */
export function PopupApp({ kind }: { kind: Kind }) {
  useThemeEffect();
  const [init, setInit] = useState<Init | null>(null);

  useEffect(() => {
    void window.kelmo?.popup.init().then(setInit);
  }, []);

  return (
    <div className="flex h-full flex-col bg-bg text-fg" data-testid={`popup-${kind}`}>
      {!init ? null : kind === 'add' ? (
        <AddPopup link={init.payload as IncomingLink} config={init.config} />
      ) : kind === 'drop' ? (
        <DropPopup />
      ) : kind === 'tray' ? (
        <TrayPopup />
      ) : kind === 'progress' ? (
        <ProgressPopup id={(init.payload as { id: string }).id} />
      ) : (
        <DonePopup id={(init.payload as { id: string }).id} />
      )}
    </div>
  );
}
