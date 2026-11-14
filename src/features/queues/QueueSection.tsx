import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DownloadItem, Queue, QueueSectionKey } from '@/types';
import { cn } from '@/lib/cn';
import { useDownloadStore } from '@/store/instances';
import { QueueItemRow } from './QueueItemRow';
import type { QueueDnd } from './useQueueDnd';

export const SECTION_META: Record<QueueSectionKey, { title: string; hint: string; dot: string }> = {
  active: { title: 'Now', hint: 'Downloading now', dot: 'bg-accent2' },
  next: { title: 'Next', hint: 'Queued — starts automatically', dot: 'bg-c-blue' },
  paused: { title: 'Paused', hint: 'Waiting for you to resume', dot: 'bg-warn' },
  failed: { title: 'Needs attention', hint: 'Failed or cancelled', dot: 'bg-bad' },
  completed: { title: 'Completed', hint: 'Finished in this queue', dot: 'bg-ok' },
};

export interface QueueSectionProps {
  queue: Queue;
  section: QueueSectionKey;
  items: DownloadItem[];
  selectedId: string | null;
  dnd: QueueDnd;
  defaultOpen?: boolean;
  /** shown instead of rows when the section is empty */
  emptyText?: ReactNode;
}

export function QueueSection({ queue, section, items, selectedId, dnd, defaultOpen = true, emptyText }: QueueSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const reorderRelative = useDownloadStore((s) => s.reorderRelative);
  const meta = SECTION_META[section];
  const panelId = `section-${queue.id}-${section}`;

  return (
    <section aria-label={meta.title} data-testid={`section-${section}`}>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded text-[15px] font-semibold text-fg"
        >
          <ChevronDown size={16} className={cn('text-fg3 transition-transform', !open && '-rotate-90')} aria-hidden />
          <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', meta.dot)} />
          {meta.title}
          <span className="tnum text-fg2">({items.length})</span>
        </button>
        <span className="text-xs text-fg3">{meta.hint}</span>
      </div>

      {open && (
        <ul id={panelId} className="flex flex-col gap-2" aria-label={`${meta.title} downloads`}>
          {items.map((item, i) => (
            <QueueItemRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              dnd={dnd}
              canMoveUp={i > 0}
              canMoveDown={i < items.length - 1}
              onMoveUp={() => reorderRelative(queue.id, item.id, items[i - 1].id, 'before')}
              onMoveDown={() => reorderRelative(queue.id, item.id, items[i + 1].id, 'after')}
            />
          ))}
          {items.length === 0 && (
            <li className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-[13px] text-fg3">{emptyText ?? 'Nothing here.'}</li>
          )}
        </ul>
      )}
    </section>
  );
}
