import { memo } from 'react';
import type { DownloadItem } from '@/types';
import { cn } from '@/lib/cn';
import { formatBytes, formatEta } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';
import { CategoryBadge, SpeedBadge, StatusBadge } from '@/components/Badges';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { ProgressBar } from '@/components/ProgressBar';
import { RowActions } from './RowActions';

export interface DownloadRowProps {
  item: DownloadItem;
  index: number;
  selectable?: boolean;
  checked?: boolean;
  active?: boolean;
  onToggle?: (id: string) => void;
}

function sizeText(item: DownloadItem): string {
  if (item.status === 'completed') return `${formatBytes(item.totalBytes)}`;
  return `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`;
}

function DownloadRowBase({ item, index, selectable, checked, active, onToggle }: DownloadRowProps) {
  const openDetail = useUiStore((s) => s.openDetail);
  const setActive = useUiStore((s) => s.setActiveId);
  const running = item.status === 'downloading';

  return (
    <tr
      aria-selected={active || checked || undefined}
      data-testid="download-row"
      data-id={item.id}
      data-status={item.status}
      onClick={() => setActive(item.id)}
      onDoubleClick={() => openDetail(item.id)}
      className={cn(
        'group relative border-t border-line transition-colors hover:bg-surface2/70',
        (active || checked) && 'bg-accent/[0.06]',
      )}
    >
      <td className="w-12 pl-5 pr-2 text-center align-middle" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>
        {selectable ? (
          <input
            type="checkbox"
            aria-label={`Select ${item.fileName}`}
            checked={!!checked}
            onChange={() => onToggle?.(item.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 cursor-pointer rounded accent-[rgb(var(--accent))]"
          />
        ) : (
          <span className="tnum text-[13px] text-fg3">{index + 1}</span>
        )}
      </td>

      <td className="max-w-[260px] px-3 2xl:max-w-[360px] align-middle" style={{ paddingTop: 'var(--row-py)', paddingBottom: 'var(--row-py)' }}>
        <div className="flex min-w-0 items-center gap-3">
          <FileTypeIcon type={item.fileType} category={item.category} />
          <div className="min-w-0">
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
            <p className="tnum truncate text-xs text-fg3">
              <span className="2xl:hidden">{sizeText(item)} · </span>
              {running && <span className="min-[1500px]:hidden">{formatEta(item.eta)} left · </span>}
              {item.sourceDomain}
            </p>
          </div>
        </div>
      </td>

      <td className="hidden px-3 align-middle 2xl:table-cell">
        <CategoryBadge category={item.category} />
      </td>

      <td className="min-w-[130px] px-3 align-middle">
        <ProgressBar value={item.progress} status={item.status} showValue label={`${item.fileName} progress`} />
      </td>

      <td className="tnum hidden whitespace-nowrap px-3 text-[13px] text-fg2 align-middle 2xl:table-cell">{sizeText(item)}</td>

      <td className="px-3 align-middle">
        <SpeedBadge speed={running ? item.speed : 0} />
      </td>

      <td className="tnum hidden whitespace-nowrap px-3 text-[13px] text-fg2 align-middle min-[1500px]:table-cell">{running ? formatEta(item.eta) : item.status === 'completed' ? 'Completed' : '—'}</td>

      <td className="tnum hidden px-3 text-[13px] text-fg2 align-middle 2xl:table-cell">{running ? item.connections : '—'}</td>

      <td className="whitespace-nowrap px-3 align-middle">
        <StatusBadge status={item.status} />
        {item.status === 'failed' && item.error && <p className="max-w-[160px] truncate text-[11px] text-bad" title={item.error}>{item.error}</p>}
      </td>

      <td className="w-[104px] pl-2 pr-4 align-middle">
        <RowActions item={item} />
      </td>
    </tr>
  );
}

export const DownloadRow = memo(DownloadRowBase);
