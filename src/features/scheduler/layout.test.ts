import { describe, expect, it } from 'vitest';
import type { WeekBlock } from '@/services/SchedulerService';
import { layoutDayBlocks } from './layout';

const block = (id: string, startMin: number, endMin: number): WeekBlock => ({
  id,
  ruleId: id,
  dayIndex: 0,
  startMin,
  endMin,
  continuation: false,
  continues: false,
});

describe('layoutDayBlocks', () => {
  it('keeps a lone block at full width', () => {
    const [a] = layoutDayBlocks([block('a', 60, 120)]);
    expect(a.lane).toBe(0);
    expect(a.lanes).toBe(1);
  });

  it('puts overlapping blocks into separate lanes', () => {
    const out = layoutDayBlocks([block('night', 0, 360), block('linux', 0, 360), block('x', 120, 180)]);
    expect(out.every((b) => b.lanes === 3)).toBe(true);
    expect(new Set(out.map((b) => b.lane)).size).toBe(3);
  });

  it('does not widen clusters that merely touch', () => {
    const out = layoutDayBlocks([block('a', 0, 60), block('b', 60, 120)]);
    expect(out.map((b) => b.lanes)).toEqual([1, 1]);
    expect(out.map((b) => b.lane)).toEqual([0, 0]);
  });

  it('reuses a freed lane inside one cluster', () => {
    const out = layoutDayBlocks([block('a', 0, 120), block('b', 30, 60), block('c', 70, 110)]);
    const c = out.find((b) => b.id === 'c')!;
    expect(c.lane).toBe(1);
    expect(out.every((b) => b.lanes === 2)).toBe(true);
  });
});
