import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DayIndex, ScheduleRule } from '@/types';
import { cn } from '@/lib/cn';
import { formatShortDate } from '@/lib/format';
import { DAY_LABELS, DAY_LABELS_LONG, fromMinutes, weekBlocks } from '@/services/SchedulerService';
import { Button, IconButton } from '@/components/ui/Button';
import { layoutDayBlocks, ruleStyle } from './layout';
import { ScheduleBlock } from './ScheduleBlock';

const HOUR_H = 24; // px per hour
const HOURS = Array.from({ length: 13 }, (_, i) => i * 2); // 00:00 … 24:00 every 2h

/** Monday 00:00 of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const idx = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - idx);
  return d;
}

export interface SchedulerCalendarProps {
  rules: ScheduleRule[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  selectedRuleId: string | null;
  onSelect: (ruleId: string) => void;
  onEdit: (ruleId: string) => void;
  now: Date;
}

export function SchedulerCalendar({ rules, weekOffset, onWeekChange, selectedRuleId, onSelect, onEdit, now }: SchedulerCalendarProps) {
  const monday = useMemo(() => {
    const m = startOfWeek(now);
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [now, weekOffset]);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const sunday = days[6];
  const todayIdx = weekOffset === 0 ? (((now.getDay() + 6) % 7) as DayIndex) : null;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const byDay = useMemo(() => {
    const all = weekBlocks(rules);
    return Array.from({ length: 7 }, (_, d) => layoutDayBlocks(all.filter((b) => b.dayIndex === d)));
  }, [rules]);
  const ruleIndex = (id: string) => rules.findIndex((r) => r.id === id);
  const label = `${formatShortDate(monday.getTime())} – ${formatShortDate(sunday.getTime())}, ${sunday.getFullYear()}`;

  return (
    <div data-testid="scheduler-calendar">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-5">
        <div className="flex items-center gap-2">
          <IconButton label="Previous week" onClick={() => onWeekChange(weekOffset - 1)} className="border border-line">
            <ChevronLeft size={17} />
          </IconButton>
          <IconButton label="Next week" onClick={() => onWeekChange(weekOffset + 1)} className="border border-line">
            <ChevronRight size={17} />
          </IconButton>
          <p className="tnum ml-2 text-[15px] font-semibold text-fg" aria-live="polite">
            {label}
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={weekOffset === 0} onClick={() => onWeekChange(0)}>
          Today
        </Button>
      </div>

      <div className="overflow-x-auto px-5 pb-5">
        <div className="min-w-[720px]" role="group" aria-label="Weekly schedule, Monday to Sunday">
          {/* day headers */}
          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] text-center">
            <span />
            {days.map((d, i) => (
              <div key={i} className={cn('pb-2', todayIdx === i && 'text-accent')}>
                <p className="text-[13px] font-semibold">{DAY_LABELS[i]}</p>
                <p className={cn('tnum text-xs', todayIdx === i ? 'text-accent' : 'text-fg3')}>{formatShortDate(d.getTime())}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))]" style={{ height: HOUR_H * 24 }}>
            {/* time axis */}
            <div className="relative" aria-hidden>
              {HOURS.map((h) => (
                <span
                  key={h}
                  className="tnum absolute right-2 -translate-y-1/2 text-[11px] text-fg3"
                  style={{ top: h * HOUR_H }}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {days.map((d, dayIdx) => (
              <div
                key={dayIdx}
                role="group"
                aria-label={`${DAY_LABELS_LONG[dayIdx]} ${formatShortDate(d.getTime())}`}
                className={cn('relative border-l border-line', todayIdx === dayIdx && 'bg-accent/[0.04]')}
                style={{
                  backgroundImage: 'linear-gradient(to bottom, rgb(var(--line) / 0.7) 1px, transparent 1px)',
                  backgroundSize: `100% ${HOUR_H * 2}px`,
                }}
              >
                {byDay[dayIdx].map((b) => {
                  const rule = rules.find((r) => r.id === b.ruleId);
                  if (!rule) return null;
                  const idx = ruleIndex(rule.id);
                  return (
                    <ScheduleBlock
                      key={b.id}
                      block={b}
                      rule={rule}
                      tone={ruleStyle(idx)}
                      selected={selectedRuleId === rule.id}
                      hourHeight={HOUR_H}
                      dayLabel={DAY_LABELS_LONG[dayIdx]}
                      onSelect={() => onSelect(rule.id)}
                      onEdit={() => onEdit(rule.id)}
                    />
                  );
                })}
                {todayIdx === dayIdx && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: (nowMin / 60) * HOUR_H }}>
                    <span className="-ml-1 h-2 w-2 rounded-full bg-bad" />
                    <span className="h-px flex-1 bg-bad" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-fg3">
          Times are local ({fromMinutes(nowMin)} now). Select a block to see its rule; double-click or press Enter on it to edit.
        </p>
      </div>
    </div>
  );
}
