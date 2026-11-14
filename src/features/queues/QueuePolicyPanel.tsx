import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import type { Queue } from '@/types';
import { BANDWIDTH_PRESETS } from '@/data/defaults';
import { formatMBps } from '@/lib/format';
import { useDownloadStore } from '@/store/instances';
import { SectionCard } from '@/components/Common';
import { NumberField, Select, Toggle } from '@/components/ui/Fields';

function PolicyToggle({ label, description, checked, onChange }: { label: string; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{label}</p>
        {description && <p className="text-xs text-fg3">{description}</p>}
      </div>
      <Toggle label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

/** Edits take effect immediately — there is no separate "save" step. */
export function QueuePolicyPanel({ queue }: { queue: Queue }) {
  const update = useDownloadStore((s) => s.updateQueue);
  const bandwidthOptions = BANDWIDTH_PRESETS.some((p) => p.value === queue.bandwidthLimit)
    ? BANDWIDTH_PRESETS
    : [...BANDWIDTH_PRESETS, { label: formatMBps(queue.bandwidthLimit), value: queue.bandwidthLimit }];

  return (
    <SectionCard title="Queue policy" icon={Gauge} bodyClassName="px-5 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Simultaneous downloads"
          min={1}
          max={10}
          value={queue.maxConcurrentDownloads}
          onValueChange={(n) => Number.isInteger(n) && n >= 1 && n <= 10 && update(queue.id, { maxConcurrentDownloads: n })}
        />
        <NumberField
          label="Connections per download"
          min={1}
          max={16}
          value={queue.maxConnectionsPerDownload}
          onValueChange={(n) => Number.isInteger(n) && n >= 1 && n <= 16 && update(queue.id, { maxConnectionsPerDownload: n })}
        />
      </div>
      <Select
        fieldClassName="mt-3"
        label="Bandwidth limit"
        value={queue.bandwidthLimit}
        onValueChange={(n) => update(queue.id, { bandwidthLimit: n })}
        options={bandwidthOptions.map((p) => ({ value: p.value, label: p.label }))}
      />
      <div className="mt-2 divide-y divide-line">
        <PolicyToggle label="Retry failed downloads" description="Try again automatically with back-off." checked={queue.retryFailed} onChange={(v) => update(queue.id, { retryFailed: v })} />
        <PolicyToggle label="Start next item automatically" checked={queue.autoStartNext} onChange={(v) => update(queue.id, { autoStartNext: v })} />
        <PolicyToggle
          label="Schedule queue"
          description={
            <>
              Only run inside schedule windows.{' '}
              <Link to="/scheduler" className="text-accent hover:underline">
                Edit rules
              </Link>
            </>
          }
          checked={queue.scheduled}
          onChange={(v) => update(queue.id, { scheduled: v })}
        />
        <PolicyToggle label="Pause on battery" description="Hold transfers when the system is on battery." checked={queue.pauseOnBattery} onChange={(v) => update(queue.id, { pauseOnBattery: v })} />
        <PolicyToggle
          label="Pause when VPN disconnects"
          description="Needs “VPN awareness” in Settings → Network."
          checked={queue.pauseOnVpnDisconnected}
          onChange={(v) => update(queue.id, { pauseOnVpnDisconnected: v })}
        />
      </div>
    </SectionCard>
  );
}
