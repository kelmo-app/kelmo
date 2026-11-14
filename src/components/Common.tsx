import { useId, type ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './ui/Button';

/* -------------------------------------------------------------- Logo */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  // the KELMO cube: three gold faces (same in light and dark)
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE9A8" /><stop offset="1" stopColor="#F7C24F" /></linearGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F6AE3C" /><stop offset="1" stopColor="#E08A1C" /></linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#CC7418" /><stop offset="1" stopColor="#97500E" /></linearGradient>
      </defs>
      <g strokeLinejoin="round" strokeWidth="1.2">
        <path d="M32 5 L55.5 18.5 L32 32 L8.5 18.5Z" fill={`url(#${id}t)`} stroke={`url(#${id}t)`} />
        <path d="M8.5 18.5 L32 32 L32 59 L8.5 45.5Z" fill={`url(#${id}l)`} stroke={`url(#${id}l)`} />
        <path d="M32 32 L55.5 18.5 L55.5 45.5 L32 59Z" fill={`url(#${id}r)`} stroke={`url(#${id}r)`} />
      </g>
    </svg>
  );
}

export function Wordmark({ collapsed, showTagline = true }: { collapsed?: boolean; showTagline?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={collapsed ? 30 : 32} />
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[19px] font-semibold tracking-[0.22em] text-fg">KELMO</div>
          {showTagline && <div className="text-[11px] text-fg2">The Open Download Workspace</div>}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------- PageHeader */
export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-fg 2xl:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-fg2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------- StatCard */
export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'accent' | 'blue' | 'green' | 'amber' | 'violet';
  children?: ReactNode;
  className?: string;
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  accent: 'bg-accent/12 text-accent',
  blue: 'bg-c-blue/12 text-c-blue',
  green: 'bg-ok/12 text-ok',
  amber: 'bg-accent2/14 text-accent2',
  violet: 'bg-c-violet/12 text-c-violet',
};

export function StatCard({ icon: Icon, label, value, sub, tone = 'accent', children, className }: StatCardProps) {
  return (
    <div className={cn('card card-pad flex min-w-0 flex-col gap-3 transition hover:shadow-lift', className)}>
      <div className="flex items-center gap-3.5">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', TONES[tone])} aria-hidden>
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] text-fg2">{label}</div>
          <div className="tnum truncate text-[26px] font-semibold leading-tight text-fg">{value}</div>
          {sub && <div className="tnum truncate text-xs text-fg3">{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

/* --------------------------------------------------------- EmptyState */
export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface2 text-fg3" aria-hidden>
        <Icon size={26} strokeWidth={1.6} />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-fg">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-[13px] text-fg2">{description}</p>}
      </div>
      {action && (
        <Button variant="accent-outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- Skeletons */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading downloads" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="hidden h-2 w-40 md:block" />
          <Skeleton className="hidden h-3.5 w-16 lg:block" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/* ----------------------------------------------------- ErrorBanner */
export function ErrorBanner({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
      <div className="flex-1">
        <p className="font-semibold text-bad">{title}</p>
        {children && <p className="mt-0.5 text-fg2">{children}</p>}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------- Section card */
export function SectionCard({
  title,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('card flex min-w-0 flex-col', className)}>
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold text-fg">
          {Icon && <Icon size={18} className="text-accent" aria-hidden />}
          {title}
        </h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------ Tabs */
export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Tabs<T extends string>({ items, value, onChange, label, className }: { items: Array<TabItem<T>>; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-medium transition',
              active ? 'border-accent/50 bg-accent/12 text-accent' : 'border-transparent text-fg2 hover:bg-surface2 hover:text-fg',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('tnum rounded-full px-1.5 text-[11px]', active ? 'bg-accent/20' : 'bg-surface3 text-fg3')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
