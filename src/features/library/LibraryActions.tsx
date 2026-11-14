import { ExternalLink, FolderOpen, RotateCcw, Trash2 } from 'lucide-react';
import type { DownloadItem } from '@/types';
import { useItemActions } from '@/hooks/useItemActions';
import { IconButton } from '@/components/ui/Button';

/** Open file · open folder · redownload · delete record. */
export function LibraryActions({ item }: { item: DownloadItem }) {
  const a = useItemActions();
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label={`Open ${item.fileName}`} onClick={() => void a.openFile(item.id)}>
        <ExternalLink size={16} />
      </IconButton>
      <IconButton label="Open folder" onClick={() => void a.openFolder(item.id)}>
        <FolderOpen size={16} />
      </IconButton>
      <IconButton label="Redownload" onClick={() => a.redownload(item.id)}>
        <RotateCcw size={16} />
      </IconButton>
      <IconButton label="Delete record" tone="danger" onClick={() => a.remove(item.id)}>
        <Trash2 size={16} />
      </IconButton>
    </div>
  );
}
