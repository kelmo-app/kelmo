import { useEffect, useState } from 'react';
import { Activity, Cpu, Globe, HardDrive } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes, formatSpeed } from '@/lib/format';
import { platform } from '@/services/platform';
import { useItems, useTotals } from '@/hooks/useDownloadData';
import { useDiskUsage } from '@/hooks/useDisk';

type Tone = 'ok' | 'warn';

function Chip({ icon: Icon, title, detail, status, tone }: { icon: typeof Globe; title: string; detail: string; status: string; tone: Tone }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface2/50 px-3 py-2.5">
      <Icon size={20} className="shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-fg">{title}</p>
        <p className="truncate text-[12px] text-fg3">{detail}</p>
      </div>
      <span className={cn('flex items-center gap-1.5 text-[12px] font-medium', tone === 'ok' ? 'text-ok' : 'text-warn')}>
        <span className={cn('h-2 w-2 rounded-full', tone === 'ok' ? 'bg-ok' : 'bg-warn')} aria-hidden />
        {status}
      </span>
    </div>
  );
}

/** Real status only: the bridge port, free disk space and what the engine is doing right now. */
export function SystemHealth() {
  const items = useItems();
  const totals = useTotals();
  const disk = useDiskUsage(items);
  const [bridge, setBridge] = useState<'checking' | 'online' | 'offline' | 'n/a'>(platform.isElectron ? 'checking' : 'n/a');

  useEffect(() => {
    if (!platform.isElectron) return;
    void platform.browserInfo().then((i) => setBridge(i && i.port ? 'online' : 'offline'));
  }, []);

  const everythingOk = bridge !== 'offline';
  return (
    <section aria-label="System health" className="rounded-xl border border-line bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={18} className="text-accent" aria-hidden />
        <h2 className="text-[15px] font-semibold text-fg">System health</h2>
        <span className="text-[13px] text-fg3">{everythingOk ? 'Everything looks good.' : 'The browser bridge is not running.'}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Chip
          icon={Globe}
          title="Browser Bridge"
          detail={bridge === 'online' ? 'Connected and ready' : bridge === 'n/a' ? 'Desktop app only' : bridge === 'checking' ? 'Checking…' : 'Not listening'}
          status={bridge === 'online' ? 'Online' : bridge === 'offline' ? 'Offline' : bridge === 'checking' ? '…' : 'Preview'}
          tone={bridge === 'offline' ? 'warn' : 'ok'}
        />
        <Chip icon={HardDrive} title="Storage" detail={`${formatBytes(disk.free)} free`} status={disk.free < 2 * 1024 ** 3 ? 'Low' : 'Available'} tone={disk.free < 2 * 1024 ** 3 ? 'warn' : 'ok'} />
        <Chip icon={Cpu} title="Download Engine" detail={`${totals.active} active · ${totals.queued} queued · ${formatSpeed(totals.speed)}`} status="Ready" tone="ok" />
      </div>
    </section>
  );
}
