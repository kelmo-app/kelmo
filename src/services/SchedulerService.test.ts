import type { Queue, ScheduleRule } from '../types/index.ts';
import {
  activeRules,
  effectiveLimits,
  formatDays,
  isRuleActive,
  upcomingEvents,
  validateRule,
  weekBlocks,
  windowLengthMinutes,
} from './SchedulerService.ts';
import { createSeed } from '../data/seed.ts';
import { NOW } from '../test/helpers.ts';
import { MB } from '../lib/format.ts';

const night: ScheduleRule = {
  id: 'r', name: 'Night', queueId: 'q', days: [0, 1, 2, 3, 4, 5, 6], startTime: '23:00', endTime: '06:00',
  bandwidthLimit: 0, maxSimultaneous: 3, afterCompletion: 'none', enabled: true,
};
// 2026-10-22 is a Thursday
const at = (h: number, m = 0, day = 22) => new Date(2026, 9, day, h, m);

describe('SchedulerService', () => {
  it('detects overnight windows on both sides of midnight', () => {
    expect(isRuleActive(night, at(23, 30))).toBe(true);
    expect(isRuleActive(night, at(2, 0))).toBe(true);
    expect(isRuleActive(night, at(6, 0))).toBe(false);
    expect(isRuleActive(night, at(13, 0))).toBe(false);
  });

  it('wraps across the week boundary (Sunday night → Monday morning)', () => {
    const sundayOnly: ScheduleRule = { ...night, days: [6] };
    // 2026-10-25 is a Sunday, 2026-10-26 a Monday
    expect(isRuleActive(sundayOnly, at(23, 30, 25))).toBe(true); // Sun 23:30 — window start
    expect(isRuleActive(sundayOnly, at(2, 0, 26))).toBe(true); // Mon 02:00 — tail of Sunday's window
    expect(isRuleActive(sundayOnly, at(13, 0, 26))).toBe(false); // Mon afternoon — closed
    expect(isRuleActive(sundayOnly, at(2, 0, 25))).toBe(false); // Sun 02:00 — needs Saturday to be selected
  });

  it('ignores disabled rules', () => {
    expect(isRuleActive({ ...night, enabled: false }, at(23, 30))).toBe(false);
    expect(activeRules([night], at(23, 30))).toHaveLength(1);
  });

  it('computes window length including wrap', () => {
    expect(windowLengthMinutes(night)).toBe(7 * 60);
    expect(windowLengthMinutes({ startTime: '08:00', endTime: '10:00' })).toBe(120);
  });

  it('expands rules into week blocks, splitting overnight windows', () => {
    const blocks = weekBlocks([{ ...night, days: [0] }]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ dayIndex: 0, startMin: 23 * 60, endMin: 1440, continues: true });
    expect(blocks[1]).toMatchObject({ dayIndex: 1, startMin: 0, endMin: 6 * 60, continuation: true });
  });

  it('lists upcoming events soonest-first, including an open window', () => {
    const seed = createSeed(NOW);
    const events = upcomingEvents(seed.rules, at(23, 30), 4);
    expect(events[0].rule.id).toBe('r-night');
    expect(events[0].active).toBe(true);
    for (let i = 1; i < events.length; i++) expect(events[i].start.getTime()).toBeGreaterThanOrEqual(events[i - 1].start.getTime());
  });

  it('applies queue + rule limits and gating', () => {
    const queue = { id: 'q', scheduled: true, bandwidthLimit: 20 * MB, maxConcurrentDownloads: 5 } as Queue;
    const rule = { ...night, bandwidthLimit: 8 * MB, maxSimultaneous: 2 };
    const closed = effectiveLimits(queue, [rule], at(13));
    expect(closed.open).toBe(false);
    const open = effectiveLimits(queue, [rule], at(23, 30));
    expect(open.open).toBe(true);
    expect(open.bandwidth).toBe(8 * MB);
    expect(open.maxConcurrent).toBe(2);
    const free = effectiveLimits({ ...queue, scheduled: false }, [rule], at(13));
    expect(free.open).toBe(true);
    expect(free.bandwidth).toBe(20 * MB);
  });

  it('formats day sets', () => {
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(formatDays([0, 1, 2, 3, 4])).toBe('Mon–Fri');
    expect(formatDays([5])).toBe('Sat');
    expect(formatDays([0, 2, 4])).toBe('Mon, Wed, Fri');
    expect(formatDays([5, 6])).toBe('Weekends');
  });

  it('validates rule drafts', () => {
    const ok = { name: 'Weekend', queueId: 'q', days: [5] as ScheduleRule['days'], startTime: '01:00', endTime: '04:00', bandwidthLimit: 0, maxSimultaneous: 2 };
    expect(validateRule(ok)).toEqual({});
    expect(validateRule({ ...ok, name: ' ' }).name).toBeDefined();
    expect(validateRule({ ...ok, days: [] }).days).toBeDefined();
    expect(validateRule({ ...ok, startTime: '25:00' }).startTime).toBeDefined();
    expect(validateRule({ ...ok, endTime: '01:00' }).endTime).toBeDefined();
    expect(validateRule({ ...ok, maxSimultaneous: 0 }).maxSimultaneous).toBeDefined();
  });
});
