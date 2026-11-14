import type { BandwidthWindow, DayIndex } from '@/types';

const toMin = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};

/** Monday = 0 … Sunday = 6 (JS has Sunday = 0). */
export const dayIndex = (d: Date): DayIndex => ((d.getDay() + 6) % 7) as DayIndex;

/** Is this window running at `now`? A window that ends before it starts runs past midnight; same start and end = all day. */
export function windowActive(w: BandwidthWindow, now: Date): boolean {
  if (!w.enabled || w.days.length === 0) return false;
  const s = toMin(w.startTime), e = toMin(w.endTime);
  if (s === null || e === null) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const today = dayIndex(now);
  const yesterday = ((today + 6) % 7) as DayIndex;
  if (s === e) return w.days.includes(today);
  if (s < e) return w.days.includes(today) && t >= s && t < e;
  // wraps past midnight: the evening part belongs to the start day, the morning part to the day before
  return (w.days.includes(today) && t >= s) || (w.days.includes(yesterday) && t < e);
}

export interface EffectiveLimit {
  /** bytes / second, 0 = unlimited */
  limit: number;
  /** the window that decided it, or null when the default limit applies */
  window: BandwidthWindow | null;
}

/** The first running window (top of the list) decides, even if it says "unlimited". Otherwise the default limit. */
export function effectiveLimit(plan: BandwidthWindow[] | undefined, base: number, now: Date): EffectiveLimit {
  for (const w of plan ?? []) if (windowActive(w, now)) return { limit: Math.max(0, w.limit), window: w };
  return { limit: base, window: null };
}
