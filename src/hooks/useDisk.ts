import { useEffect, useMemo, useState } from 'react';
import type { DownloadItem } from '@/types';
import { diskUsage, type DiskUsage } from '@/services/disk';
import { platform } from '@/services/platform';
import { useSettingsStore } from '@/store/settingsStore';

/** Real disk space in the desktop app (polled), simulated numbers in the browser preview. */
export function useDiskUsage(items: DownloadItem[]): DiskUsage & { real: boolean } {
  const folder = useSettingsStore((s) => s.settings.defaultFolder);
  const [real, setReal] = useState<{ total: number; free: number } | null>(null);

  useEffect(() => {
    if (!platform.isElectron) return;
    let alive = true;
    const poll = async () => {
      const r = await platform.diskInfo(folder);
      if (alive && r) setReal(r);
    };
    void poll();
    const id = window.setInterval(poll, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [folder]);

  return useMemo(() => {
    if (!real) return { ...diskUsage(items), real: false };
    const used = real.total - real.free;
    const downloads = items.reduce((s, i) => s + (i.status === 'cancelled' ? 0 : i.downloadedBytes), 0);
    return { total: real.total, used, free: real.free, usedPercent: real.total ? (used / real.total) * 100 : 0, downloads, real: true };
  }, [real, items]);
}
