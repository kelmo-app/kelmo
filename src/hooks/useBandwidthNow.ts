import { useEffect, useState } from 'react';
import { effectiveLimit, type EffectiveLimit } from '@/lib/bandwidthPlan';
import { useSettingsStore } from '@/store/settingsStore';

/** The speed limit in force right now (default limit or the planner window that is running). Refreshes every 30 s. */
export function useBandwidthNow(): EffectiveLimit {
  const plan = useSettingsStore((s) => s.settings.bandwidthPlan);
  const base = useSettingsStore((s) => s.settings.bandwidthLimit);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return effectiveLimit(plan, base, now);
}
