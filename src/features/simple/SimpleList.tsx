import type { KeyboardEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DownloadItem } from '@/types';
import { cn } from '@/lib/cn';
import { formatBytes, formatEta, formatShortDate, formatSpeed } from '@/lib/format';
import type { DownloadSortKey, SortDir } from '@/services/selectors';
import { StatusBadge } from '@/components/Badges';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { ProgressBar } from '@/components/ProgressBar';

interface Col {
  label: string;
  sortKey?: DownloadSortKey;
  width: string;
  className?: string;
}

const COLS: Col[] = [
  { label: 'File name', sortKey: 'name', width: '32%' },
  { label: 'Size', sortKey: 'size', width: '9%' },
  { label: 'Status', sortKey: 'status', width: '19%' },
  { label: 'Speed', sortKey: 'speed', width: '9%' },
  { label: 'Time left', width: '8%' },
  { label: 'Category', width: '11%' },
  { label: 'Date added', sortKey: 'date', width: '12%' },
];

export interface SimpleListProps {
  items: DownloadItem[];
  selectedIds: string[];
  sort: { key: DownloadSortKey; dir: SortDir };
  onSort: (key: DownloadSortKey) => void;
  onSelect: (id: string, mods: { ctrl: boolean; shift: boolean }) => void;
  onOpen: (id: string) => void;
  /** Right-click on a row (client coordinates). */
  onMenu?: (id: string, x: number, y: number) => void;
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
  empty: ReactNode;
}

function StatusCell({ item }: { item: DownloadItem }) {
  if (item.status === 'downloading') return <ProgressBar value={item.progress} status={item.status} showValue label={`${item.fileName} progress`} />;
  return (
    <div className="min-w-0">
      <StatusBadge status={item.status} />
      {item.status === 'paused' && item.progress > 0 && <span className="tnum ml-1.5 text-xs text-fg3">{Math.floor(item.progress)}%</span>}
      {item.status === 'failed' && item.error && (
        <p className="truncate text-[11px] text-bad" title={item.error}>
          {item.error}
        </p>
      )}
    </div>
  );
}

/** The list the whole window is about: one clear row per file. */
export function SimpleList({ items, selectedIds, sort, onSort, onSelect, onOpen, onMenu, onKey, empty }: SimpleListProps) {
  return (
    <div className="min-h-0 flex-1 overflow-auto outline-none" tabIndex={0} onKeyDown={onKey} role="region" aria-label="Downloads list">
      <table className="w-full min-w-[860px] table-fixed border-collapse text-left">
        <caption className="sr-only">Downloads</caption>
        <colgroup>
          {COLS.map((c) => (
            <col key={c.label} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="text-xs text-fg3">
            {COLS.map((c) => {
              const active = c.sortKey === sort.key;
              return (
                <th key={c.label} scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className="border-b border-line px-3 py-2 font-medium">
                  {c.sortKey ? (
                    <button type="button" onClick={() => onSort(c.sortKey!)} className={cn('inline-flex items-center gap-1 rounded hover:text-fg', active && 'text-fg')}>
                      {c.label}
                      {active && (sort.dir === 'asc' ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const selected = selectedIds.includes(item.id);
            const running = item.status === 'downloading';
            return (
              <tr
                key={item.id}
                data-testid="download-row"
                data-id={item.id}
                data-status={item.status}
                aria-selected={selected}
                onClick={(e) => onSelect(item.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
                onDoubleClick={() => onOpen(item.id)}
                onContextMenu={(e) => {
                  if (!onMenu) return;
                  e.preventDefault();
                  onMenu(item.id, e.clientX, e.clientY);
                }}
                className={cn('cursor-default select-none border-b border-line/60 transition-colors', selected ? 'bg-accent/[0.13]' : 'hover:bg-surface2/60')}
              >
                <td className="px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileTypeIcon type={item.fileType} category={item.category} size="sm" />
                    <span className="truncate text-[13.5px] font-medium text-fg" title={item.fileName}>
                      {item.fileName}
                    </span>
                  </div>
                </td>
                <td className="tnum truncate px-3 text-[13px] text-fg2">{item.totalBytes ? formatBytes(item.totalBytes) : '—'}</td>
                <td className="px-3">
                  <StatusCell item={item} />
                </td>
                <td className="tnum truncate px-3 text-[13px] text-fg2">{running && item.speed > 0 ? formatSpeed(item.speed) : '—'}</td>
                <td className="tnum truncate px-3 text-[13px] text-fg2">{running && item.eta != null ? formatEta(item.eta) : '—'}</td>
                <td className="truncate px-3 text-[13px] text-fg2" title={item.destination}>
                  {item.category}
                </td>
                <td className="tnum truncate px-3 text-[13px] text-fg3">{formatShortDate(item.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length === 0 && empty}
    </div>
  );
}
