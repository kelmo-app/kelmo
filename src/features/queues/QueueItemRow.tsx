import { memo, type KeyboardEvent } from 'react';
import { GripVertical, Link2 } from 'lucide-react';
import type { DownloadItem, Priority } from '@/types';
import { cn } from '@/lib/cn';
import { formatBytes, formatEta } from '@/lib/format';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { PriorityBadge, SpeedBadge, StatusBadge } from '@/components/Badges';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { ProgressBar, ProgressRing } from '@/components/ProgressBar';
import { RowActions } from '@/features/downloads/RowActions';
import type { QueueDnd } from './useQueueDnd';

const NEXT_PRIORITY: Record<Priority, Priority> = { high: 'normal', normal: 'low', low: 'high' };

export interface QueueItemRowProps {
  item: DownloadItem;
  selected: boolean;
  dnd: QueueDnd;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function QueueItemRowBase({ item, selected, dnd, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: QueueItemRowProps) {
  const setActive = useUiStore((s) => s.setActiveId);
  const openDetail = useUiStore((s) => s.openDetail);
  const setPriority = useDownloadStore((s) => s.setPriority);
  const running = item.status === 'downloading';
  const dropHere = dnd.over && dnd.over.id === item.id && dnd.dragId !== item.id ? dnd.over.place : null;

  const onHandleKey = (e: KeyboardEvent) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowUp' && canMoveUp) {
      e.preventDefault();
      onMoveUp();
    } else if (e.key === 'ArrowDown' && canMoveDown) {
      e.preventDefault();
      onMoveDown();
    }
  };

  const meta =
    item.status === 'completed'
      ? `${formatBytes(item.totalBytes)} · completed`
      : `${formatBytes(item.downloadedBytes)} of ${formatBytes(item.totalBytes)}${running && item.eta != null ? ` • ${formatEta(item.eta)} left` : ''}`;

  return (
    <li
      data-testid="queue-item"
      data-id={item.id}
      data-status={item.status}
      aria-current={selected ? 'true' : undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        dnd.start(item.id);
      }}
      onDragOver={(e) => {
        if (!dnd.dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = e.currentTarget.getBoundingClientRect();
        dnd.hover(item.id, e.clientY < r.top + r.height / 2 ? 'before' : 'after');
      }}
      onDrop={(e) => {
        e.preventDefault();
        dnd.drop(item.id);
      }}
      onDragEnd={dnd.end}
      onClick={() => setActive(item.id)}
      onDoubleClick={() => openDetail(item.id)}
      className={cn(
        'relative flex items-center gap-3 rounded-lg border bg-surface2/50 px-3 py-2.5 transition hover:bg-surface2',
        selected ? 'border-accent/50 bg-accent/[0.06]' : 'border-line',
        dnd.dragId === item.id && 'opacity-40',
        dropHere === 'before' && 'before:absolute before:-top-[5px] before:inset-x-2 before:h-0.5 before:rounded before:bg-accent',
        dropHere === 'after' && 'after:absolute after:-bottom-[5px] after:inset-x-2 after:h-0.5 after:rounded after:bg-accent',
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${item.fileName}. Drag, or hold Alt and press the up or down arrow.`}
        data-tip="Drag to reorder"
        onKeyDown={onHandleKey}
        onClick={(e) => e.stopPropagation()}
        className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-fg3 hover:text-fg active:cursor-grabbing"
      >
        <GripVertical size={16} aria-hidden />
      </button>

      <FileTypeIcon type={item.fileType} category={item.category} size="lg" />

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openDetail(item.id);
          }}
          title={item.fileName}
          className="block max-w-full truncate rounded text-left text-[14px] font-medium text-fg hover:text-accent"
        >
          {item.fileName}
        </button>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-fg3">
          <Link2 size={12} aria-hidden className="shrink-0" />
          <span className="truncate">{item.sourceDomain}</span>
        </p>
        <p className="tnum mt-0.5 truncate text-xs text-fg2">{meta}</p>
      </div>

      {running ? (
        <ProgressRing value={item.progress} size={48} status={item.status} />
      ) : (
        <div className="hidden w-[150px] shrink-0 items-center md:flex">
          <ProgressBar value={item.progress} status={item.status} showValue label={`${item.fileName} progress`} />
        </div>
      )}

      <button
        type="button"
        aria-label={`Priority ${item.priority}. Click to change.`}
        data-tip="Change priority"
        onClick={(e) => {
          e.stopPropagation();
          setPriority(item.id, NEXT_PRIORITY[item.priority]);
        }}
        className="shrink-0 rounded-full"
      >
        <PriorityBadge priority={item.priority} />
      </button>

      <div className="hidden w-[92px] shrink-0 justify-end lg:flex">
        {running ? <SpeedBadge speed={item.speed} /> : <StatusBadge status={item.status} className="text-xs" />}
      </div>

      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <RowActions item={item} />
      </div>
    </li>
  );
}

export const QueueItemRow = memo(QueueItemRowBase);
