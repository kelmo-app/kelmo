import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Fields';
import { formatBytes } from '@/lib/format';
import { fullPath } from './popupLogic';
import { FileArt } from './FileArt';
import { artKind } from './fileArt';
import { usePopupItem } from './usePopupItem';

const inputCls = 'h-9 w-full rounded-md border border-line bg-surface2 px-3 font-mono text-[13px] text-fg';

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
  const thumb = item && artKind(item.fileName) === 'image' && window.location.protocol === 'file:'
    ? encodeURI('file://' + (fullPath(item).startsWith('/') ? '' : '/') + fullPath(item).replace(/\\/g, '/'))
    : undefined;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        {item ? <FileArt kind={artKind(item.fileName)} size={52} src={thumb} /> : <CheckCircle2 className="text-ok" size={28} aria-hidden />}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="text-ok" size={16} aria-hidden /> Download complete</p>
          <p className="text-[13px] text-fg3">{item ? `Downloaded ${formatBytes(item.totalBytes || item.downloadedBytes)}` : 'Finished'}</p>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        Address
        <input readOnly className={inputCls} value={item?.url ?? ''} aria-label="Address" />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        The file saved as
        <input readOnly className={inputCls} value={item ? fullPath(item) : ''} aria-label="Saved as" />
      </label>
      <div className="mt-auto flex items-center justify-between gap-2">
        <Checkbox checked={hide} onCheckedChange={setHide} label="Don’t show this dialog again" />
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void open('file')} disabled={!item}>Open</Button>
          <Button onClick={() => void open('folder')} disabled={!item}>Open folder</Button>
          <Button onClick={() => void close()}>Close</Button>
        </div>
      </div>
    </div>
  );
}
