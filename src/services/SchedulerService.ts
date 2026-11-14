/**
 * SchedulerService — pure functions that turn ScheduleRules into time windows.
 * Days are Mon=0 … Sun=6. A rule's `days` are the days on which a window STARTS;
 * when end <= start the window wraps past midnight into the following day.
 */
import type { DayIndex, Queue, ScheduleRule } from '../types/index.ts';

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_LABELS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const ALL_DAYS: DayIndex[] = [0, 1, 2, 3, 4, 5, 6];
const DAY_MS = 86_400_000;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

export function fromMinutes(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function jsDayToIndex(jsDay: number): DayIndex {
  return ((jsDay + 6) % 7) as DayIndex;
}

export function isValidTime(hhmm: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm);
}

export function windowLengthMinutes(rule: Pick<ScheduleRule, 'startTime' | 'endTime'>): number {
  const s = toMinutes(rule.startTime);
  const e = toMinutes(rule.endTime);
  return e > s ? e - s : 1440 - s + e;
}

export function isRuleActive(rule: ScheduleRule, date: Date): boolean {
  if (!rule.enabled) return false;
  const day = jsDayToIndex(date.getDay());
  const mins = date.getHours() * 60 + date.getMinutes();
  const s = toMinutes(rule.startTime);
  const e = toMinutes(rule.endTime);
  if (e > s) return rule.days.includes(day) && mins >= s && mins < e;
  if (mins >= s && rule.days.includes(day)) return true;
  const prev = ((day + 6) % 7) as DayIndex;
  return mins < e && rule.days.includes(prev);
}

export function activeRules(rules: ScheduleRule[], date: Date): ScheduleRule[] {
  return rules.filter((r) => isRuleActive(r, date));
}

export interface EffectiveLimits {
  /** false => the queue is gated off by its schedule right now */
  open: boolean;
  /** bytes/second, 0 = unlimited */
  bandwidth: number;
  maxConcurrent: number;
  rule: ScheduleRule | null;
}

function minNonZero(a: number, b: number): number {
  if (!a) return b;
  if (!b) return a;
  return Math.min(a, b);
}

/** What a queue is allowed to do at `date`, combining its own policy with active rules. */
export function effectiveLimits(queue: Queue, rules: ScheduleRule[], date: Date): EffectiveLimits {
  const active = rules.filter((r) => r.queueId === queue.id && isRuleActive(r, date));
  if (active.length === 0) {
    return { open: !queue.scheduled, bandwidth: queue.bandwidthLimit, maxConcurrent: queue.maxConcurrentDownloads, rule: null };
  }
  const rule = active[0];
  return {
    open: true,
    bandwidth: minNonZero(queue.bandwidthLimit, rule.bandwidthLimit),
    maxConcurrent: Math.max(1, Math.min(queue.maxConcurrentDownloads, rule.maxSimultaneous || queue.maxConcurrentDownloads)),
    rule,
  };
}

export interface WeekBlock {
  id: string;
  ruleId: string;
  dayIndex: DayIndex;
  startMin: number;
  endMin: number;
  /** block is the tail of a window that started the previous day */
  continuation: boolean;
  /** block runs to the end of day and continues tomorrow */
  continues: boolean;
}

/** Expand rules into positioned blocks for a Mon–Sun grid (24h = 1440 minutes). */
export function weekBlocks(rules: ScheduleRule[]): WeekBlock[] {
  const out: WeekBlock[] = [];
  for (const rule of rules) {
    const s = toMinutes(rule.startTime);
    const e = toMinutes(rule.endTime);
    for (const day of rule.days) {
      if (e > s) {
        out.push({ id: `${rule.id}-${day}`, ruleId: rule.id, dayIndex: day, startMin: s, endMin: e, continuation: false, continues: false });
      } else {
        out.push({ id: `${rule.id}-${day}-a`, ruleId: rule.id, dayIndex: day, startMin: s, endMin: 1440, continuation: false, continues: true });
        if (e > 0) {
          const next = ((day + 1) % 7) as DayIndex;
          out.push({ id: `${rule.id}-${day}-b`, ruleId: rule.id, dayIndex: next, startMin: 0, endMin: e, continuation: true, continues: false });
        }
      }
    }
  }
  return out;
}

export interface UpcomingEvent {
  id: string;
  rule: ScheduleRule;
  start: Date;
  end: Date;
  active: boolean;
}

function atMinutes(base: Date, mins: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  return new Date(d.getTime() + mins * 60_000);
}

/** Next occurrences (including a window that is open right now), soonest first. */
export function upcomingEvents(rules: ScheduleRule[], from: Date, count = 6, horizonDays = 14): UpcomingEvent[] {
  const events: UpcomingEvent[] = [];
  const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  // begin one day back so overnight windows already in progress are included
  for (let offset = -1; offset <= horizonDays; offset++) {
    const day = new Date(startOfToday.getTime() + offset * DAY_MS);
    const idx = jsDayToIndex(day.getDay());
    for (const rule of rules) {
      if (!rule.enabled || !rule.days.includes(idx)) continue;
      const start = atMinutes(day, toMinutes(rule.startTime));
      const end = new Date(start.getTime() + windowLengthMinutes(rule) * 60_000);
      if (end.getTime() <= from.getTime()) continue;
      events.push({
        id: `${rule.id}-${start.getTime()}`,
        rule,
        start,
        end,
        active: start.getTime() <= from.getTime() && from.getTime() < end.getTime(),
      });
    }
  }
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events.slice(0, count);
}

export function formatDays(days: DayIndex[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return 'Every day';
  if (set.length === 0) return 'No days';
  if (set.length === 5 && set.join() === '0,1,2,3,4') return 'Mon–Fri';
  if (set.length === 2 && set.join() === '5,6') return 'Weekends';
  // collapse consecutive runs of 3+ days into ranges
  const parts: string[] = [];
  let i = 0;
  while (i < set.length) {
    let j = i;
    while (j + 1 < set.length && set[j + 1] === set[j] + 1) j++;
    if (j - i >= 2) parts.push(`${DAY_LABELS[set[i]]}–${DAY_LABELS[set[j]]}`);
    else for (let k = i; k <= j; k++) parts.push(DAY_LABELS[set[k]]);
    i = j + 1;
  }
  return parts.join(', ');
}

export interface RuleDraft {
  name: string;
  queueId: string;
  days: DayIndex[];
  startTime: string;
  endTime: string;
  bandwidthLimit: number;
  maxSimultaneous: number;
}

export type RuleErrors = Partial<Record<keyof RuleDraft, string>>;

export function validateRule(draft: RuleDraft): RuleErrors {
  const errors: RuleErrors = {};
  if (!draft.name.trim()) errors.name = 'Give the rule a name.';
  else if (draft.name.trim().length > 40) errors.name = 'Keep the name under 40 characters.';
  if (!draft.queueId) errors.queueId = 'Choose a queue.';
  if (draft.days.length === 0) errors.days = 'Select at least one day.';
  if (!isValidTime(draft.startTime)) errors.startTime = 'Use the 24-hour format, e.g. 23:00.';
  if (!isValidTime(draft.endTime)) errors.endTime = 'Use the 24-hour format, e.g. 06:00.';
  if (!errors.startTime && !errors.endTime && draft.startTime === draft.endTime) {
    errors.endTime = 'End time must differ from start time.';
  }
  if (!Number.isFinite(draft.maxSimultaneous) || draft.maxSimultaneous < 1 || draft.maxSimultaneous > 20) {
    errors.maxSimultaneous = 'Choose between 1 and 20 downloads.';
  }
  if (!Number.isFinite(draft.bandwidthLimit) || draft.bandwidthLimit < 0) {
    errors.bandwidthLimit = 'Bandwidth cannot be negative.';
  }
  return errors;
}
