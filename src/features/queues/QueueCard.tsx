import { Pause, Play, SlidersHorizontal } from 'lucide-react';
import type { Queue, QueueStats } from '@/types';
import { cn } from '@/lib/cn';
import { formatBytes, formatMBps } from '@/lib/format';
import { IconButton } from '@/components/ui/Button';
import { QUEUE_TONES } from './tones';

export interface QueueCardProps {
  queue: Queue;
  stats: QueueStats;
  selected: boolean;
  onSelect: () => void;
  onToggleRun: () => void;
  onSettings: () => void;
}

/** One queue at a glance. The body selects it; the icon buttons act on it. */
export function QueueCard({ queue, stats, selected, onSelect, onToggleRun, onSettings }: QueueCardProps) {
  const tone = QUEUE_TONES[queue.tone];
  const running = queue.status === 'running';
  return (
    <div
      data-testid="queue-card"
      data-queue-id={queue.id}
      className={cn(
        'relative flex w-[268px] shrink-0 flex-col gap-3 rounded-xl border bg-surface p-4 shadow-soft transition',
        selected ? 'border-accent/60 shadow-glow' : 'border-line hover:border-fg3/50',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${queue.name}, ${running ? 'running' : 'paused'}. ${stats.active} active of ${stats.total} items`}
        className="absolute inset-0 rounded-xl"
      />
      <div className="pointer-events-none flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tone.dot)} />
          <h3 className="truncate text-[14px] font-semibold text-fg">{queue.name}</h3>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
            running ? 'bg-ok/12 text-ok' : 'bg-warn/12 text-warn',
          )}
        >
          {running ? 'Running' : 'Paused'}
        </span>
      </div>

      <dl className="pointer-events-none grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div>
          <dt className="text-fg3">Active / total</dt>
          <dd className="tnum text-[13px] font-medium text-fg">
            {stats.active} / {stats.total}
          </dd>
        </div>
        <div>
          <dt className="text-fg3">Speed</dt>
          <dd className="tnum text-[13px] font-medium text-fg">{stats.speed > 0 ? formatMBps(stats.speed) : '—'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-fg3">Remaining</dt>
          <dd className="tnum text-[13px] font-medium text-fg">{stats.remainingBytes > 0 ? formatBytes(stats.remainingBytes) : 'Nothing left'}</dd>
        </div>
      </dl>

      <div className="relative z-10 -mb-1 flex items-center justify-between border-t border-line pt-2.5">
        <p className="text-[11px] text-fg3">{queue.scheduled ? 'Scheduled' : 'Always on'}</p>
        <div className="flex items-center gap-0.5">
          <IconButton size="sm" label={running ? `Pause queue ${queue.name}` : `Start queue ${queue.name}`} tone={running ? 'default' : 'accent'} onClick={onToggleRun}>
            {running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
          </IconButton>
          <IconButton size="sm" label={`Settings for ${queue.name}`} onClick={onSettings}>
            <SlidersHorizontal size={15} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
