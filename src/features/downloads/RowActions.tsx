import { Ban, Copy, Eye, FileText, FolderOpen, MoreHorizontal, Pause, Play, RotateCw, Trash2, ArrowRightLeft } from 'lucide-react';
import type { DownloadItem } from '@/types';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { useItemActions } from '@/hooks/useItemActions';
import { IconButton } from '@/components/ui/Button';
import { MenuItem, MenuPanel, MenuSeparator, Popover } from '@/components/ui/Popover';

/** Primary per-status action + overflow menu. Used by every list of downloads. */
export function RowActions({ item }: { item: DownloadItem }) {
  const a = useItemActions();
  const queues = useDownloadStore((s) => s.queues);
  const moveToQueue = useDownloadStore((s) => s.moveToQueue);
  const openDetail = useUiStore((s) => s.openDetail);
  const toast = useUiStore((s) => s.toast);
  const name = item.fileName;
  const live = item.status === 'downloading' || item.status === 'queued';
  const stoppable = live || item.status === 'paused';

  return (
    <div className="flex items-center justify-end gap-0.5">
      {live && (
        <IconButton label={`Pause ${name}`} onClick={() => a.pause(item.id)}>
          <Pause size={17} fill="currentColor" />
        </IconButton>
      )}
      {item.status === 'paused' && (
        <IconButton label={`Resume ${name}`} tone="accent" onClick={() => a.resume(item.id)}>
          <Play size={17} fill="currentColor" />
        </IconButton>
      )}
      {(item.status === 'failed' || item.status === 'cancelled') && (
        <IconButton label={`Retry ${name}`} tone="accent" onClick={() => a.retry(item.id)}>
          <RotateCw size={17} />
        </IconButton>
      )}
      {item.status === 'completed' && (
        <IconButton label={`Open folder for ${name}`} onClick={() => void a.openFolder(item.id)}>
          <FolderOpen size={17} />
        </IconButton>
      )}

      <Popover
        role="menu"
        width={232}
        trigger={
          <IconButton label={`More actions for ${name}`}>
            <MoreHorizontal size={18} />
          </IconButton>
        }
      >
        {(close) => (
          <MenuPanel>
            <MenuItem icon={<Eye size={15} />} label="View details" onSelect={() => openDetail(item.id)} close={close} />
            {live && <MenuItem icon={<Pause size={15} />} label="Pause" onSelect={() => a.pause(item.id)} close={close} />}
            {item.status === 'paused' && <MenuItem icon={<Play size={15} />} label="Resume" onSelect={() => a.resume(item.id)} close={close} />}
            {(item.status === 'failed' || item.status === 'cancelled') && <MenuItem icon={<RotateCw size={15} />} label="Retry" onSelect={() => a.retry(item.id)} close={close} />}
            {stoppable && <MenuItem icon={<Ban size={15} />} label="Cancel download" onSelect={() => a.cancel(item.id)} close={close} />}
            <MenuItem icon={<FolderOpen size={15} />} label="Open folder" onSelect={() => void a.openFolder(item.id)} close={close} />
            {item.status === 'completed' && <MenuItem icon={<FileText size={15} />} label="Open file" onSelect={() => void a.openFile(item.id)} close={close} />}
            {item.status === 'completed' && <MenuItem icon={<RotateCw size={15} />} label="Redownload" onSelect={() => a.redownload(item.id)} close={close} />}
            <MenuItem icon={<Copy size={15} />} label="Copy link" onSelect={() => void a.copyLink(item.id)} close={close} />
            {queues.length > 1 && (
              <>
                <MenuSeparator />
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg3">Move to queue</p>
                {queues
                  .filter((q) => q.id !== item.queueId)
                  .map((q) => (
                    <MenuItem
                      key={q.id}
                      icon={<ArrowRightLeft size={15} />}
                      label={q.name}
                      onSelect={() => {
                        moveToQueue(item.id, q.id);
                        toast({ tone: 'success', title: 'Moved to queue', description: `${name} → ${q.name}` }, 2400);
                      }}
                      close={close}
                    />
                  ))}
              </>
            )}
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={15} />} label="Remove" tone="danger" hint="Del" onSelect={() => a.remove(item.id)} close={close} />
          </MenuPanel>
        )}
      </Popover>
    </div>
  );
}
