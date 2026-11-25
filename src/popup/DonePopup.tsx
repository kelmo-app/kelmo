import { useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Fields';
import { formatBytes } from '@/lib/format';
import { fullPath } from './popupLogic';
import { FileArt } from './FileArt';
import { artKind } from './fileArt';
import { usePopupItem } from './usePopupItem';

/** IDM's "Download complete": where it went, Open / Open folder / Close, and "don't show again". */
export function DonePopup({ id }: { id: string }) {
  const api = window.kelmo!.popup;
  const item = usePopupItem(id);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    document.title = item ? `Download complete — ${item.fileName}` : 'Download complete';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void api.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, api]);

  const close = async () => {
    if (hide) await api.pref({ key: 'showCompleteDialog', value: false });
    await api.close();
  };
  const open = async (what: 'file' | 'folder') => {
    await api.open({ id, what });
    await close();
  };

  // A real thumbnail only for finished images, and only where the window may read local files.
  const thumb = item && artKind(item.mainFile || item.fileName) === 'image' && window.location.protocol === 'file:'
    ? encodeURI('file://' + (fullPath(item).startsWith('/') ? '' : '/') + fullPath(item).replace(/\\/g, '/'))
    : undefined;

  return (
    <div className="flex h-full flex-col justify-between gap-3 p-4">
      <div className="flex items-center gap-3.5">
        {item ? <FileArt kind={artKind(item.mainFile || item.fileName)} size={56} src={thumb} /> : <CheckCircle2 className="text-ok" size={32} aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-snug text-fg" title={item?.fileName}>{item?.fileName ?? 'Download complete'}</p>
          <p className="truncate font-mono text-xs text-fg3" title={item ? fullPath(item) : ''}>{item ? fullPath(item) : ''}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end leading-tight">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-ok"><CheckCircle2 size={16} aria-hidden /> Download complete</span>
          <span className="tnum text-[15px] font-semibold text-fg">{item ? formatBytes(item.totalBytes || item.downloadedBytes) : ''}</span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface3" aria-hidden><div className="h-full w-full rounded-full bg-ok" /></div>
      <div className="flex items-center justify-between gap-2">
        <Checkbox checked={hide} onCheckedChange={setHide} label="Don’t show this again" />
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void open('file')} disabled={!item}>Open</Button>
          <Button onClick={() => void open('folder')} disabled={!item} icon={<FolderOpen size={15} aria-hidden />}>Open folder</Button>
          <Button onClick={() => void close()}>Close</Button>
        </div>
      </div>
    </div>
  );
}
