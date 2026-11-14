import { useState, type CSSProperties } from 'react';
import { DownloadCloud, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { linksFromDrop } from '@/lib/dropLinks';

type DragStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' };
const drag: DragStyle = { WebkitAppRegion: 'drag' };
const noDrag: DragStyle = { WebkitAppRegion: 'no-drag' };

/**
 * The small floating "drop target": drag a link from the browser onto it and the File Info window opens.
 * (Tray and taskbar icons cannot receive drops on Linux/Windows, so this is the IDM-style answer.)
 */
export function DropPopup() {
  const api = window.kelmo!.popup;
  const [over, setOver] = useState(false);
  const [note, setNote] = useState('');

  const flash = (t: string) => {
    setNote(t);
    window.setTimeout(() => setNote(''), 2200);
  };

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden border border-line bg-surface" title="Drop links here · double-click to open KDM">
      <div className="flex h-4 shrink-0 items-center justify-end bg-surface2" style={drag}>
        <button
          type="button"
          aria-label="Hide the drop target"
          title="Hide (turn it back on in Settings)"
          className="flex h-4 w-4 items-center justify-center text-fg3 hover:text-bad"
          style={noDrag}
          onClick={() => void api.pref({ key: 'dropTarget', value: false })}
        >
          <X size={11} aria-hidden />
        </button>
      </div>
      <div
        data-testid="drop-zone"
        className={cn('flex flex-1 flex-col items-center justify-center gap-1 transition', over ? 'bg-accent/20 text-accent' : 'text-fg2')}
        style={noDrag}
        onDoubleClick={() => void api.openMain()}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const links = linksFromDrop({ uriList: e.dataTransfer.getData('text/uri-list'), text: e.dataTransfer.getData('text/plain') });
          if (!links.length) return flash('No link');
          void api.dropLinks(links);
        }}
      >
        <DownloadCloud size={30} strokeWidth={1.6} aria-hidden />
        <span className="text-[11px] font-medium">{note || (over ? 'Release' : 'Drop link')}</span>
      </div>
    </div>
  );
}
