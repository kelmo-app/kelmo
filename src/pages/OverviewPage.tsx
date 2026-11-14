import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, CheckCircle2, Clock, Download, HardDrive, Inbox, ListChecks, Network, Pause, Play, Plus, Route, Trash2, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes, formatClock, formatMBps, formatRelative, greeting, GB, pluralize } from '@/lib/format';
import { computeQueueStats } from '@/services/QueueManager';
import { filterDownloads, sortDownloads } from '@/services/selectors';
import { useDownloadStore } from '@/store/instances';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { useDiskUsage } from '@/hooks/useDisk';
import { useItems, useTotals } from '@/hooks/useDownloadData';
import { useGlobalActions } from '@/hooks/useGlobalActions';
import { EmptyState, PageHeader, SectionCard, StatCard } from '@/components/Common';
import { BandwidthChart } from '@/components/charts/BandwidthChart';
import { RingGauge } from '@/components/charts/StorageChart';
import { Button, IconButton } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Fields';
import { DownloadTable } from '@/features/downloads/DownloadTable';
import type { ActivityEntry } from '@/types';

const ACTIVITY_ICON: Record<ActivityEntry['kind'], { icon: LucideIcon; cls: string }> = {
  completed: { icon: CheckCircle2, cls: 'text-ok' },
  failed: { icon: XCircle, cls: 'text-bad' },
  added: { icon: Plus, cls: 'text-accent' },
  paused: { icon: Pause, cls: 'text-warn' },
  resumed: { icon: Play, cls: 'text-accent' },
  removed: { icon: Trash2, cls: 'text-fg3' },
  verified: { icon: CheckCircle2, cls: 'text-ok' },
  queue: { icon: ListChecks, cls: 'text-accent2' },
  scheduler: { icon: Clock, cls: 'text-accent2' },
};

const MAX_ROWS = 8;

export default function OverviewPage() {
  const navigate = useNavigate();
  const items = useItems();
  const totals = useTotals();
  const queues = useDownloadStore((s) => s.queues);
  const itemsById = useDownloadStore((s) => s.items);
  const history = useDownloadStore((s) => s.history);
  const activity = useDownloadStore((s) => s.activity);
  const userName = useSettingsStore((s) => s.settings.userName);
  const query = useUiStore((s) => s.query);
  const openAdd = useUiStore((s) => s.openAddDialog);
  const { pauseAll, resumeAll, clearCompleted } = useGlobalActions();
  const [windowSize, setWindowSize] = useState<'live' | 'long'>('live');

  const disk = useDiskUsage(items);
  const last = history[history.length - 1];
  const todayBytes = useMemo(() => {
    const start = new Date().setHours(0, 0, 0, 0);
    return items.filter((i) => i.status === 'completed' && (i.completedAt ?? 0) >= start).reduce((s, i) => s + i.totalBytes, 0);
  }, [items]);
  const inQueue = totals.queued + totals.paused;
  const totalLive = totals.active + inQueue;

  // Active work first, then the freshest completions.
  const rows = useMemo(() => {
    const filtered = filterDownloads(items, { query });
    const unfinished = sortDownloads(
      filtered.filter((i) => i.status !== 'completed'),
      'status',
      'asc',
    );
    const done = sortDownloads(
      filtered.filter((i) => i.status === 'completed'),
      'date',
      'desc',
    ).slice(0, 2);
    return [...unfinished, ...done];
  }, [items, query]);
  const shown = rows.slice(0, MAX_ROWS);
  const hiddenCount = rows.length - shown.length;

  const health = Math.max(40, Math.min(100, 100 - totals.failed * 9 - (totals.active === 0 && totalLive > 0 ? 6 : 0)));
  const healthy = health >= 80;

  const queueRows = queues.map((q) => ({ q, stats: computeQueueStats(q, itemsById) }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={
          <>
            {greeting()}, <span className="text-accent">{userName}</span>
          </>
        }
        subtitle="More downloads. A more open world."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,480px)]">
        <div className="grid grid-cols-1 content-start gap-5 sm:grid-cols-2">
          <StatCard icon={Download} label="Active downloads" value={totals.active} sub={`of ${pluralize(totalLive, 'download')} in progress`} tone="accent" />
          <StatCard icon={CheckCircle2} label="Completed today" value={totals.completedToday} sub={`${formatBytes(todayBytes)} received`} tone="green" />
          <StatCard
            icon={HardDrive}
            label="Remaining storage"
            value={`${(disk.free / GB).toFixed(0)} GB`}
            sub={`${disk.usedPercent.toFixed(0)}% of ${formatBytes(disk.total, 0)} used`}
            tone="blue"
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-surface3" role="progressbar" aria-label="Disk used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(disk.usedPercent)}>
              <div className="h-full rounded-full bg-c-blue" style={{ width: `${disk.usedPercent}%` }} />
            </div>
          </StatCard>
          <StatCard
            icon={Clock}
            label="Estimated time left"
            value={totals.eta == null ? '—' : formatClock(totals.eta)}
            sub={totals.eta == null ? 'Nothing running' : `${formatBytes(totals.remainingBytes)} remaining`}
            tone="amber"
          />
        </div>

        <SectionCard
          title="Network & performance"
          icon={Activity}
          actions={
            <Segmented
              label="Chart range"
              size="sm"
              value={windowSize}
              onChange={setWindowSize}
              options={[
                { value: 'live', label: 'Live' },
                { value: 'long', label: '3 min' },
              ]}
            />
          }
        >
          <div className="px-5 pb-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="tnum text-[32px] font-semibold leading-none text-fg" data-testid="total-speed">
                  {formatMBps(totals.speed)}
                </p>
                <p className="mt-1 text-[13px] text-fg2">Total bandwidth</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/12 text-accent" aria-hidden>
                  <Network size={20} />
                </span>
                <div>
                  <p className="tnum text-xl font-semibold leading-none text-fg">{totals.connections}</p>
                  <p className="mt-1 text-[13px] text-fg2">Active connections</p>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <BandwidthChart samples={history} window={windowSize === 'live' ? 60 : 180} height={132} showUpload />
            </div>
            {last && (
              <p className="tnum mt-1 flex gap-4 text-xs text-fg3">
                <span>↓ {formatMBps(last.down)}</span>
                <span>↑ {formatMBps(last.up)}</span>
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={`Active downloads (${totals.active})`}
        icon={Download}
        actions={
          <>
            {totals.active > 0 ? (
              <Button size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => pauseAll()}>
                Pause all
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => resumeAll()}>
                Resume all
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<Trash2 size={14} />} onClick={() => clearCompleted()}>
              Clear completed
            </Button>
            <IconButton label="Open all downloads" onClick={() => navigate('/downloads')}>
              <ArrowRight size={17} />
            </IconButton>
          </>
        }
        bodyClassName="pb-1"
      >
        <DownloadTable
          items={shown}
          caption="Active and recent downloads"
          empty={
            <EmptyState
              icon={query ? Inbox : Download}
              title={query ? `No downloads match “${query}”` : 'No downloads yet'}
              description={query ? 'Try a different file name, category or source.' : 'Paste a link to start your first download.'}
              action={query ? undefined : { label: 'Add download', onClick: () => openAdd() }}
            />
          }
        />
        {hiddenCount > 0 && (
          <div className="border-t border-line px-5 py-3 text-[13px]">
            <Link to="/downloads" className="font-medium text-accent hover:underline">
              View {hiddenCount} more in Downloads →
            </Link>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <SectionCard
          title={`Download queue (${inQueue})`}
          icon={ListChecks}
          actions={
            <Button size="sm" variant="secondary" iconRight={<ArrowRight size={14} />} onClick={() => navigate('/queues')}>
              View queues
            </Button>
          }
        >
          <ul className="divide-y divide-line px-5 pb-2">
            {queueRows.map(({ q, stats }) => (
              <li key={q.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <Link to={`/queues/${q.id}`} className="min-w-0 truncate font-medium text-fg hover:text-accent">
                  {q.name}
                </Link>
                <span className="tnum flex shrink-0 items-center gap-3 text-fg2">
                  <span>{stats.active} active</span>
                  <span className="text-fg3">{stats.queued + stats.paused} waiting</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', q.status === 'running' ? 'bg-ok/12 text-ok' : 'bg-warn/12 text-warn')}>
                    {q.status === 'running' ? 'Running' : 'Paused'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Connection health" icon={Route}>
          <div className="flex flex-col gap-4 px-5 pb-5">
            <div className="flex items-center gap-4">
              <RingGauge value={health} size={88} label={`Connection health ${health} percent`} />
              <div>
                <p className={cn('text-[15px] font-semibold', healthy ? 'text-ok' : 'text-warn')}>{healthy ? 'Healthy' : 'Needs attention'}</p>
                <p className="text-[13px] text-fg2">
                  {totals.failed > 0 ? `${pluralize(totals.failed, 'download')} failed or cancelled.` : 'Everything looks good. Keep going!'}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Recent activity" icon={Activity}>
          {activity.length === 0 ? (
            <EmptyState icon={Activity} title="No activity yet" description="Downloads you add, finish or pause appear here." className="py-8" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-2" aria-label="Recent activity">
              {activity.slice(0, 6).map((a) => {
                const { icon: Icon, cls } = ACTIVITY_ICON[a.kind];
                return (
                  <li key={a.id} className="flex items-start gap-3 py-2.5">
                    <Icon size={16} className={cn('mt-0.5 shrink-0', cls)} aria-hidden />
                    <p className="min-w-0 flex-1 truncate text-[13px] text-fg" title={a.message}>
                      {a.message}
                    </p>
                    <time className="shrink-0 text-xs text-fg3" dateTime={new Date(a.at).toISOString()}>
                      {formatRelative(a.at)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
