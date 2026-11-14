import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import type { BandwidthWindow, DayIndex } from '@/types';
import { cn } from '@/lib/cn';
import { uid } from '@/lib/id';
import { formatMBps } from '@/lib/format';
import { BANDWIDTH_PRESETS } from '@/data/defaults';
import { ALL_DAYS, DAY_LABELS, DAY_LABELS_LONG } from '@/services/SchedulerService';
import { useBandwidthNow } from '@/hooks/useBandwidthNow';
import { useSettingsStore } from '@/store/settingsStore';
import { SectionCard } from '@/components/Common';
import { Button } from '@/components/ui/Button';
import { Select, TextField, Toggle } from '@/components/ui/Fields';

const limitLabel = (bps: number) => (bps > 0 ? formatMBps(bps) : 'unlimited');

/** Time-of-day speed limits: slow downloads in work hours, go full speed at night. The top window that is running wins. */
export function BandwidthPlanner() {
  const plan = useSettingsStore((s) => s.settings.bandwidthPlan);
  const base = useSettingsStore((s) => s.settings.bandwidthLimit);
  const update = useSettingsStore((s) => s.update);
  const now = useBandwidthNow();

  const set = (next: BandwidthWindow[]) => update({ bandwidthPlan: next });
  const patch = (id: string, p: Partial<BandwidthWindow>) => set(plan.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const toggleDay = (w: BandwidthWindow, d: DayIndex) =>
    patch(w.id, { days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d].sort((a, b) => a - b) });
  const add = () =>
    set([...plan, { id: uid('bw'), name: plan.length ? `Window ${plan.length + 1}` : 'Work hours', days: [0, 1, 2, 3, 4], startTime: '09:00', endTime: '18:00', limit: 2 * 1024 * 1024, enabled: true }]);

  const options = (w: BandwidthWindow) =>
    BANDWIDTH_PRESETS.some((p) => p.value === w.limit) ? BANDWIDTH_PRESETS : [...BANDWIDTH_PRESETS, { label: formatMBps(w.limit), value: w.limit }];

  return (
    <SectionCard
      title="Bandwidth planner"
      icon={CalendarClock}
      actions={<Button size="sm" icon={<Plus size={14} />} onClick={add}>Add window</Button>}
      bodyClassName="px-5 pb-5"
    >
      <p className="mb-3 text-[13px] text-fg2" role="status" data-testid="planner-now">
        Right now: <span className="font-semibold text-fg">{limitLabel(now.limit)}</span>{' '}
        {now.window ? <>— “{now.window.name}” until {now.window.endTime}</> : <>— the default limit ({limitLabel(base)}); no window is running</>}
      </p>
      {plan.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-[13px] text-fg3">
          No windows yet. Add one, for example “Mon–Fri 09:00–18:00 at 2 MB/s” so downloads don’t slow your work, and let them run free at night.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {plan.map((w) => (
            <li key={w.id} className={cn('rounded-xl border border-line bg-surface2/40 p-3', !w.enabled && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <TextField label="Name" srOnlyLabel value={w.name} onChange={(e) => patch(w.id, { name: e.target.value })} className="w-44" />
                <TextField label="From" srOnlyLabel type="time" value={w.startTime} onChange={(e) => patch(w.id, { startTime: e.target.value })} className="w-28" />
                <span className="text-fg3" aria-hidden>–</span>
                <TextField label="To" srOnlyLabel type="time" value={w.endTime} onChange={(e) => patch(w.id, { endTime: e.target.value })} className="w-28" />
                <Select<number> label="Speed limit" srOnlyLabel value={w.limit} onValueChange={(v) => patch(w.id, { limit: v })} options={options(w).map((p) => ({ value: p.value, label: p.label }))} fieldClassName="w-36" />
                <div className="ml-auto flex items-center gap-2">
                  <Toggle label={`${w.name} on`} checked={w.enabled} onChange={(v) => patch(w.id, { enabled: v })} />
                  <button type="button" aria-label={`Delete ${w.name}`} title="Delete" className="rounded-md p-1.5 text-fg3 hover:bg-bad/10 hover:text-bad" onClick={() => set(plan.filter((x) => x.id !== w.id))}>
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>
              <div role="group" aria-label="Days of the week" className="mt-2.5 flex flex-wrap gap-1.5">
                {ALL_DAYS.map((d) => {
                  const on = w.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={DAY_LABELS_LONG[d]}
                      onClick={() => toggleDay(w, d)}
                      className={cn('h-8 min-w-[44px] rounded-full border px-2.5 text-[12.5px] font-medium transition', on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-fg2 hover:text-fg')}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  );
                })}
              </div>
              {w.endTime <= w.startTime && <p className="mt-2 text-[12px] text-fg3">Runs past midnight into the next day.</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-fg3">If two windows overlap, the one higher in the list wins. Outside every window the default limit applies (Settings → Download Engine).</p>
    </SectionCard>
  );
}
