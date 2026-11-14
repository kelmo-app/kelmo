import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DownloadItem } from '@/types';
import { cn } from '@/lib/cn';
import type { DownloadSortKey, SortDir } from '@/services/selectors';
import { useUiStore } from '@/store/uiStore';
import { DownloadRow } from './DownloadRow';

export interface DownloadTableProps {
  items: DownloadItem[];
  selectable?: boolean;
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  sort?: { key: DownloadSortKey; dir: SortDir };
  onSort?: (key: DownloadSortKey) => void;
  empty?: ReactNode;
  caption: string;
}

interface Col {
  label: string;
  sortKey?: DownloadSortKey;
  className?: string;
}

const COLS: Col[] = [
  { label: 'Name', sortKey: 'name' },
  { label: 'Category', className: 'hidden 2xl:table-cell' },
  { label: 'Progress', sortKey: 'progress' },
  { label: 'Size', sortKey: 'size', className: 'hidden 2xl:table-cell' },
  { label: 'Speed', sortKey: 'speed' },
  { label: 'ETA', className: 'hidden min-[1500px]:table-cell' },
  { label: 'Conn.', className: 'hidden 2xl:table-cell' },
  { label: 'Status', sortKey: 'status' },
];

export function DownloadTable({ items, selectable, selectedIds = [], onToggle, onToggleAll, sort, onSort, empty, caption }: DownloadTableProps) {
  const activeId = useUiStore((s) => s.activeId);
  const allChecked = items.length > 0 && items.every((i) => selectedIds.includes(i.id));
  const someChecked = !allChecked && items.some((i) => selectedIds.includes(i.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-[13px] text-fg2">
            <th scope="col" className="w-12 pb-2.5 pl-5 pr-2 text-center font-medium">
              {selectable ? (
                <input
                  type="checkbox"
                  aria-label="Select all downloads"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => onToggleAll?.(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded accent-[rgb(var(--accent))]"
                />
              ) : (
                '#'
              )}
            </th>
            {COLS.map((c) => {
              const active = sort && c.sortKey && sort.key === c.sortKey;
              return (
                <th
                  key={c.label}
                  scope="col"
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('px-3 pb-2.5 font-medium', c.className)}
                >
                  {c.sortKey && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.sortKey!)}
                      className={cn('inline-flex items-center gap-1 rounded transition hover:text-fg', active && 'text-fg')}
                    >
                      {c.label}
                      {active && (sort!.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
            <th scope="col" className="pb-2.5 pl-2 pr-4 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <DownloadRow
              key={item.id}
              item={item}
              index={i}
              selectable={selectable}
              checked={selectedIds.includes(item.id)}
              active={activeId === item.id}
              onToggle={onToggle}
            />
          ))}
        </tbody>
      </table>
      {items.length === 0 && empty}
    </div>
  );
}
