import { useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatClock12, formatMBps } from '@/lib/format';
import { formatDays, upcomingEvents } from '@/services/SchedulerService';
import { useDownloadStore } from '@/store/instances';
import { useSchedulerStore } from '@/store/schedulerStore';
import { useUiStore } from '@/store/uiStore';
import { useNow } from '@/hooks/useBrowser';
import { EmptyState, PageHeader, SectionCard } from '@/components/Common';
import { BandwidthChart } from '@/components/charts/BandwidthChart';
import { Button, IconButton } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Fields';
import { ScheduleRuleEditor, AFTER_COMPLETION_LABELS } from '@/features/scheduler/ScheduleRuleEditor';
import { SchedulerCalendar } from '@/features/scheduler/SchedulerCalendar';
import { ruleStyle } from '@/features/scheduler/layout';

/** "in 3 h", "in 2 days" — counterpart of formatRelative for future times. */
function formatUntil(target: Date, now: Date): string {
  const mins = Math.max(1, Math.round((target.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `in ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `in ${h} h`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line py-2.5 first:border-t-0">
      <dt className="text-[13px] text-fg3">{label}</dt>
      <dd className="text-right text-[13px] font-medium text-fg">{children}</dd>
    </div>
  );
}

export default function SchedulerPage() {
  const rules = useSchedulerStore((s) => s.rules);
  const toggleRule = useSchedulerStore((s) => s.toggleRule);
  const deleteRule = useSchedulerStore((s) => s.deleteRule);
  const queues = useDownloadStore((s) => s.queues);
  const history = useDownloadStore((s) => s.history);
  const openRuleEditor = useUiStore((s) => s.openRuleEditor);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const toast = useUiStore((s) => s.toast);
  const now = useNow(30_000);

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(rules[0]?.id ?? null);
  const selected = rules.find((r) => r.id === selectedId) ?? null;
  const queueName = (id: string) => queues.find((q) => q.id === id)?.name ?? 'Unknown queue';
  const upcoming = useMemo(() => upcomingEvents(rules, now, 6), [rules, now]);
  const selectedIndex = selected ? rules.findIndex((r) => r.id === selected.id) : 0;

  const onDelete = (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    askConfirm({
      title: 'Delete this rule?',
      description: `“${rule.name}” will no longer run. Downloads already in the queue are not affected.`,
      confirmLabel: 'Delete rule',
      tone: 'danger',
      onConfirm: () => {
        deleteRule(id);
        if (selectedId === id) setSelectedId(rules.find((r) => r.id !== id)?.id ?? null);
        toast({ tone: 'info', title: 'Rule deleted', description: rule.name }, 2600);
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Scheduler"
        subtitle="Plan your download windows, set limits, and keep everything in control."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openRuleEditor(null)}>
            New rule
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <SectionCard title="Weekly plan" icon={CalendarClock} bodyClassName="pb-4">
          <SchedulerCalendar
            rules={rules}
            weekOffset={weekOffset}
            onWeekChange={setWeekOffset}
            selectedRuleId={selectedId}
            onSelect={setSelectedId}
            onEdit={(id) => openRuleEditor(id)}
            now={now}
          />
        </SectionCard>

        <div className="flex flex-col gap-5">
          <SectionCard
            title="Rule details"
            actions={
              selected && (
                <>
                  <IconButton label="Edit rule" onClick={() => openRuleEditor(selected.id)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label="Delete rule" tone="danger" onClick={() => onDelete(selected.id)}>
                    <Trash2 size={16} />
                  </IconButton>
                </>
              )
            }
            bodyClassName="px-5 pb-5"
          >
            {selected ? (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className={cn('h-8 w-8 shrink-0 rounded-md', ruleStyle(selectedIndex).chip)} />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-fg">{selected.name}</p>
                      <p className="text-[12px] text-fg3">{selected.enabled ? 'Active download window' : 'Disabled — will not run'}</p>
                    </div>
                  </div>
                  <Toggle checked={selected.enabled} onChange={() => toggleRule(selected.id)} label={`${selected.name} enabled`} />
                </div>
                <dl>
                  <Detail label="Queue">{queueName(selected.queueId)}</Detail>
                  <Detail label="Days">{formatDays(selected.days)}</Detail>
                  <Detail label="Window">
                    {formatClock12(selected.startTime)} – {formatClock12(selected.endTime)}
                  </Detail>
                  <Detail label="Bandwidth cap">{selected.bandwidthLimit ? formatMBps(selected.bandwidthLimit) : 'Unlimited'}</Detail>
                  <Detail label="Simultaneous downloads">{selected.maxSimultaneous}</Detail>
                  <Detail label="After completion">{AFTER_COMPLETION_LABELS[selected.afterCompletion]}</Detail>
                </dl>
              </div>
            ) : (
              <EmptyState icon={CalendarClock} title="No rule selected" description="Pick a block on the calendar or create a new rule." />
            )}
          </SectionCard>

          <SectionCard title={`Rules (${rules.length})`} bodyClassName="px-2 pb-3">
            {rules.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No rules yet" description="Rules decide when a queue is allowed to download." />
            ) : (
              <ul className="flex flex-col">
                {rules.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface2">
                    <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', ruleStyle(i).chip, !r.enabled && 'opacity-40')} />
                    <button type="button" onClick={() => setSelectedId(r.id)} className="min-w-0 flex-1 text-left" aria-label={`Select rule ${r.name}`}>
                      <span className={cn('block truncate text-[13px] font-medium', selectedId === r.id ? 'text-accent' : 'text-fg')}>{r.name}</span>
                      <span className="block truncate text-[12px] text-fg3">
                        {formatDays(r.days)} · {formatClock12(r.startTime)} – {formatClock12(r.endTime)}
                      </span>
                    </button>
                    <Toggle size="sm" checked={r.enabled} onChange={() => toggleRule(r.id)} label={`${r.name} enabled`} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Upcoming" bodyClassName="px-2 pb-3">
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nothing scheduled" description="Enable a rule to see its next run here." />
          ) : (
            <ul>
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-surface2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-fg">{e.rule.name}</p>
                    <p className="text-[12px] text-fg3">
                      {e.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {formatClock12(e.rule.startTime)} – {formatClock12(e.rule.endTime)}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium', e.active ? 'bg-ok/15 text-ok' : 'bg-surface3 text-fg2')}>
                    {e.active ? 'Running now' : formatUntil(e.start, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Network throughput" bodyClassName="px-5 pb-4">
          <BandwidthChart samples={history} window={90} height={160} showUpload />
        </SectionCard>
      </div>

      <ScheduleRuleEditor onSaved={setSelectedId} />
    </div>
  );
}
