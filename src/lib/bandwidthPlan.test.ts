import { describe, expect, it } from 'vitest';
import type { BandwidthWindow } from '@/types';
import { dayIndex, effectiveLimit, windowActive } from './bandwidthPlan';

const MB = 1024 * 1024;
const win = (o: Partial<BandwidthWindow>): BandwidthWindow => ({ id: 'w', name: 'w', days: [0, 1, 2, 3, 4, 5, 6], startTime: '09:00', endTime: '18:00', limit: 2 * MB, enabled: true, ...o });
// 2026-10-26 is a Monday
const at = (day: number, hh: number, mm = 0) => new Date(2026, 9, 26 + day, hh, mm);

describe('bandwidth planner', () => {
  it('Monday is 0 and Sunday is 6', () => {
    expect(dayIndex(at(0, 12))).toBe(0);
    expect(dayIndex(at(6, 12))).toBe(6);
  });
  it('a daytime window includes its start and excludes its end', () => {
    const w = win({ days: [0, 1, 2, 3, 4] });
    expect(windowActive(w, at(0, 9, 0))).toBe(true);
    expect(windowActive(w, at(0, 17, 59))).toBe(true);
    expect(windowActive(w, at(0, 18, 0))).toBe(false);
    expect(windowActive(w, at(0, 8, 59))).toBe(false);
    expect(windowActive(w, at(5, 12))).toBe(false); // Saturday
  });
  it('a night window runs past midnight and belongs to the day it started on', () => {
    const w = win({ days: [4], startTime: '22:00', endTime: '06:00' }); // Friday night
    expect(windowActive(w, at(4, 23))).toBe(true);
    expect(windowActive(w, at(5, 3))).toBe(true); // Saturday 03:00
    expect(windowActive(w, at(5, 23))).toBe(false); // Saturday night is not Friday
    expect(windowActive(w, at(4, 3))).toBe(false); // Friday 03:00 belongs to Thursday night
  });
  it('same start and end means all day; disabled or empty windows never run; bad times are ignored', () => {
    expect(windowActive(win({ startTime: '00:00', endTime: '00:00' }), at(2, 15))).toBe(true);
    expect(windowActive(win({ enabled: false }), at(0, 10))).toBe(false);
    expect(windowActive(win({ days: [] }), at(0, 10))).toBe(false);
    expect(windowActive(win({ startTime: 'x' }), at(0, 10))).toBe(false);
  });
  it('the first running window decides (even "unlimited"); otherwise the default limit', () => {
    const night = win({ id: 'n', startTime: '01:00', endTime: '07:00', limit: 0 });
    const day = win({ id: 'd', limit: 2 * MB });
    const plan = [night, day];
    expect(effectiveLimit(plan, 10 * MB, at(0, 3)).limit).toBe(0);
    expect(effectiveLimit(plan, 10 * MB, at(0, 3)).window?.id).toBe('n');
    expect(effectiveLimit(plan, 10 * MB, at(0, 10)).limit).toBe(2 * MB);
    expect(effectiveLimit(plan, 10 * MB, at(0, 20))).toEqual({ limit: 10 * MB, window: null });
    expect(effectiveLimit(undefined, 5 * MB, at(0, 20)).limit).toBe(5 * MB);
  });
});
