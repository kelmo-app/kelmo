import { memo } from 'react';
import type { DownloadItem } from '@/types';
import { cn } from '@/lib/cn';
import { formatBytes, formatEta } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';
import { CategoryBadge, SpeedBadge, StatusBadge } from '@/components/Badges';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { ProgressBar } from '@/components/ProgressBar';
import { RowActions } from './RowActions';

export interface DownloadCardProps {
  item: DownloadItem;
  checked: boolean;
  active: boolean;
  onToggle: (id: string) => void;
}

function DownloadCardBase({ item, checked, active, onToggle }: DownloadCardProps) {
  const openDetail = useUiStore((s) => s.openDetail);
  const setActive = useUiStore((s) => s.setActiveId);
  const running = item.status === 'downloading';
  return (
    <li
      data-testid="download-row"
      data-id={item.id}
      data-status={item.status}
      onClick={() => setActive(item.id)}
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 transition-colors hover:bg-surface2/70', (active || checked) && 'bg-accent/[0.06]')}
    >
      <input
        type="checkbox"
        aria-label={`Select ${item.fileName}`}
        checked={checked}
        onChange={() => onToggle(item.id)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 cursor-pointer rounded accent-[rgb(var(--accent))]"
      />
      <FileTypeIcon type={item.fileType} category={item.category} />
      <div className="min-w-[200px] flex-1">
        <button type="button" onClick={() => openDetail(item.id)} className="block max-w-full truncate rounded text-left text-[14px] font-medium text-fg hover:text-accent" title={item.fileName}>
          {item.fileName}
        </button>
        <p className="tnum mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg3">
          <span>{item.status === 'completed' ? formatBytes(item.totalBytes) : `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`}</span>
          <span aria-hidden>·</span>
          <span>{item.sourceDomain}</span>
        </p>
      </div>
      <CategoryBadge category={item.category} className="hidden md:inline-flex" />
      <div className="w-[200px] max-w-full">
        <ProgressBar value={item.progress} status={item.status} showValue label={`${item.fileName} progress`} />
        <p className="tnum mt-1 flex justify-between text-xs text-fg3">
          <SpeedBadge speed={running ? item.speed : 0} className="text-xs" />
          <span>{running ? formatEta(item.eta) : ''}</span>
        </p>
      </div>
      <StatusBadge status={item.status} className="w-[110px]" />
      <RowActions item={item} />
    </li>
  );
}

export const DownloadCard = memo(DownloadCardBase);
