import { AlertTriangle, ArrowDown, CheckCircle2, Clock3, Pause, ShieldAlert, ShieldCheck, ShieldQuestion, XCircle, Loader2, Zap } from 'lucide-react';
import type { Category, ChecksumStatus, DownloadStatus, Priority } from '@/types';
import { cn } from '@/lib/cn';
import { formatMBps, formatSpeed } from '@/lib/format';

/* ------------------------------------------------------------ StatusBadge */
const STATUS: Record<DownloadStatus, { label: string; cls: string; icon: typeof Clock3 }> = {
  downloading: { label: 'Downloading', cls: 'text-accent', icon: ArrowDown },
  queued: { label: 'Queued', cls: 'text-fg2', icon: Clock3 },
  paused: { label: 'Paused', cls: 'text-warn', icon: Pause },
  failed: { label: 'Failed', cls: 'text-bad', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', cls: 'text-fg3', icon: XCircle },
  completed: { label: 'Completed', cls: 'text-ok', icon: CheckCircle2 },
};

export function statusLabel(s: DownloadStatus): string {
  return STATUS[s].label;
}

/** Icon + text + colour — status is never conveyed by colour alone. */
export function StatusBadge({ status, className }: { status: DownloadStatus; className?: string }) {
  const { label, cls, icon: Icon } = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium', cls, className)}>
      <Icon size={14} aria-hidden strokeWidth={2.2} />
      <span>{label}</span>
    </span>
  );
}

/* ---------------------------------------------------------- CategoryBadge */
const CAT: Record<Category, string> = {
  General: 'text-c-slate border-c-slate/35 bg-c-slate/10',
  Compressed: 'text-c-teal border-c-teal/35 bg-c-teal/10',
  Documents: 'text-c-green border-c-green/35 bg-c-green/10',
  Music: 'text-c-orange border-c-orange/35 bg-c-orange/10',
  Programs: 'text-c-violet border-c-violet/35 bg-c-violet/10',
  Video: 'text-c-blue border-c-blue/35 bg-c-blue/10',
};

export const CATEGORY_COLOR: Record<Category, string> = {
  General: 'rgb(var(--c-slate))',
  Compressed: 'rgb(var(--c-teal))',
  Documents: 'rgb(var(--c-green))',
  Music: 'rgb(var(--c-orange))',
  Programs: 'rgb(var(--c-violet))',
  Video: 'rgb(var(--c-blue))',
};

export const CATEGORY_TONE: Record<Category, string> = {
  General: 'text-c-slate bg-c-slate/12',
  Compressed: 'text-c-teal bg-c-teal/12',
  Documents: 'text-c-green bg-c-green/12',
  Music: 'text-c-orange bg-c-orange/12',
  Programs: 'text-c-violet bg-c-violet/12',
  Video: 'text-c-blue bg-c-blue/12',
};

export function CategoryBadge({ category, className }: { category: Category; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium', CAT[category], className)}>
      {category}
    </span>
  );
}

/* --------------------------------------------------------- PriorityBadge */
const PRI: Record<Priority, string> = {
  high: 'text-accent2 border-accent2/50 bg-accent2/10',
  normal: 'text-fg2 border-line bg-surface2',
  low: 'text-fg3 border-line bg-transparent',
};

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-[58px] items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize', PRI[priority], className)}>
      {priority}
    </span>
  );
}

/* ------------------------------------------------------------ SpeedBadge */
export function SpeedBadge({ speed, className, precise }: { speed: number; className?: string; precise?: boolean }) {
  if (!speed || speed < 1) return <span className={cn('text-fg3', className)} aria-label="No transfer">—</span>;
  return (
    <span className={cn('tnum inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-fg', className)}>
      <Zap size={12} className="text-accent" aria-hidden />
      {precise ? formatSpeed(speed) : formatMBps(speed)}
    </span>
  );
}

/* ------------------------------------------------------- ChecksumBadge */
const CK: Record<ChecksumStatus, { label: (algo: string) => string; cls: string; icon: typeof ShieldCheck }> = {
  verified: { label: (a) => `${a} verified`, cls: 'text-ok', icon: ShieldCheck },
  verifying: { label: () => 'Verifying…', cls: 'text-accent', icon: Loader2 },
  computed: { label: (a) => `${a} calculated`, cls: 'text-ok', icon: ShieldCheck },
  pending: { label: () => 'Not verified yet', cls: 'text-fg3', icon: ShieldQuestion },
  none: { label: () => 'No checksum', cls: 'text-fg3', icon: ShieldQuestion },
  mismatch: { label: () => 'Checksum mismatch', cls: 'text-bad', icon: ShieldAlert },
};

export function ChecksumBadge({ status, algo = 'SHA256', compact }: { status: ChecksumStatus; algo?: string; compact?: boolean }) {
  const c = CK[status];
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]', c.cls)} title={c.label(algo)}>
      <Icon size={14} aria-hidden className={status === 'verifying' ? 'animate-spin' : undefined} />
      <span className={compact ? 'sr-only' : undefined}>{c.label(algo)}</span>
    </span>
  );
}
