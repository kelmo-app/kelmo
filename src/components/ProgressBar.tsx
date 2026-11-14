import type { DownloadStatus } from '@/types';
import { cn } from '@/lib/cn';
import { clamp } from '@/lib/format';

const fill: Record<DownloadStatus, string> = {
  downloading: 'bg-accent',
  queued: 'bg-fg3',
  paused: 'bg-warn',
  failed: 'bg-bad',
  cancelled: 'bg-fg3',
  completed: 'bg-ok',
};

export interface ProgressBarProps {
  value: number;
  status?: DownloadStatus;
  size?: 'xs' | 'sm' | 'md';
  label?: string;
  showValue?: boolean;
  className?: string;
}

export function ProgressBar({ value, status = 'downloading', size = 'sm', label, showValue, className }: ProgressBarProps) {
  const v = clamp(value, 0, 100);
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
        aria-label={label ?? 'Download progress'}
        className={cn('relative min-w-[56px] flex-1 overflow-hidden rounded-full bg-surface3', size === 'xs' ? 'h-1' : size === 'sm' ? 'h-1.5' : 'h-2.5')}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', fill[status], status === 'downloading' && v < 100 && 'progress-active')}
          style={{ width: `${v}%` }}
        />
      </div>
      {showValue && <span className="tnum w-10 shrink-0 text-right text-[13px] text-fg2">{Math.round(v)}%</span>}
    </div>
  );
}

/** Circular progress ring used in the queue "Now" rows. */
export function ProgressRing({ value, size = 44, status = 'downloading' }: { value: number; size?: number; status?: DownloadStatus }) {
  const v = clamp(value, 0, 100);
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = status === 'paused' ? 'rgb(var(--warn))' : status === 'failed' ? 'rgb(var(--bad))' : status === 'completed' ? 'rgb(var(--ok))' : 'rgb(var(--accent))';
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label="Download progress"
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'rgb(var(--surface3))' }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ stroke: color, transition: 'stroke-dashoffset .5s ease-out' }}
        />
      </svg>
      <span className="tnum absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-fg">{Math.round(v)}%</span>
    </div>
  );
}
