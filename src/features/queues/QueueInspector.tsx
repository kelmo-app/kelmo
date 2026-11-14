import { ArrowUpToLine, Eye, MousePointerClick, Pause, Play, RotateCw, Trash2 } from 'lucide-react';
import type { DownloadItem, Priority } from '@/types';
import { formatBytes, formatEta, formatMBps } from '@/lib/format';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { useItemActions } from '@/hooks/useItemActions';
import { CategoryBadge, StatusBadge } from '@/components/Badges';
import { EmptyState, SectionCard } from '@/components/Common';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { ProgressBar } from '@/components/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Fields';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface2/60 px-3 py-2">
      <p className="text-[11px] text-fg3">{label}</p>
      <p className="tnum text-[13px] font-semibold text-fg">{value}</p>
    </div>
  );
}

/** Right-hand panel for whichever download is selected in the queue. */
export function QueueInspector({ item }: { item: DownloadItem | undefined }) {
  const queues = useDownloadStore((s) => s.queues);
  const setPriority = useDownloadStore((s) => s.setPriority);
  const moveToQueue = useDownloadStore((s) => s.moveToQueue);
  const openDetail = useUiStore((s) => s.openDetail);
  const toast = useUiStore((s) => s.toast);
  const a = useItemActions();

  if (!item) {
    return (
      <SectionCard title="Inspector" icon={MousePointerClick}>
        <EmptyState icon={MousePointerClick} title="Nothing selected" description="Select a download to see its details and controls here." className="py-8" />
      </SectionCard>
    );
  }

  const running = item.status === 'downloading';
  const live = running || item.status === 'queued';
  const queue = queues.find((q) => q.id === item.queueId);

  return (
    <SectionCard title="Inspector" icon={MousePointerClick} bodyClassName="px-5 pb-5" >
      <div data-testid="queue-inspector" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <FileTypeIcon type={item.fileType} category={item.category} size="lg" />
          <div className="min-w-0">
            <p className="break-words text-[14px] font-semibold leading-snug text-fg">{item.fileName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={item.status} />
              <CategoryBadge category={item.category} />
            </div>
          </div>
        </div>

        <ProgressBar value={item.progress} status={item.status} size="md" showValue label={`${item.fileName} progress`} />

        <div className="grid grid-cols-2 gap-2">
          <Tile label="Downloaded" value={`${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`} />
          <Tile label="Speed" value={running ? formatMBps(item.speed) : '—'} />
          <Tile label="ETA" value={running ? formatEta(item.eta) : '—'} />
          <Tile label="Connections" value={running ? String(item.connections) : '—'} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select<Priority>
            label="Priority"
            value={item.priority}
            onValueChange={(p) => setPriority(item.id, p)}
            options={[
              { value: 'high', label: 'High' },
              { value: 'normal', label: 'Normal' },
              { value: 'low', label: 'Low' },
            ]}
          />
          <Select
            label="Queue"
            value={item.queueId}
            onValueChange={(q) => {
              moveToQueue(item.id, q);
              toast({ tone: 'success', title: 'Moved to queue', description: `${item.fileName} → ${queues.find((x) => x.id === q)?.name}` }, 2400);
            }}
            options={queues.map((q) => ({ value: q.id, label: q.name }))}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {live && (
            <Button size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => a.pause(item.id)}>
              Pause
            </Button>
          )}
          {item.status === 'paused' && (
            <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => a.resume(item.id)}>
              Resume
            </Button>
          )}
          {(item.status === 'failed' || item.status === 'cancelled') && (
            <Button size="sm" variant="primary" icon={<RotateCw size={14} />} onClick={() => a.retry(item.id)}>
              Retry
            </Button>
          )}
          {item.status !== 'completed' && queue && (
            <Button
              size="sm"
              variant="outline"
              icon={<ArrowUpToLine size={14} />}
              onClick={() => {
                moveToQueue(item.id, queue.id, 0);
                toast({ tone: 'info', title: 'Moved to top of queue', description: item.fileName }, 2200);
              }}
            >
              Move to top
            </Button>
          )}
          <Button size="sm" variant="outline" icon={<Eye size={14} />} onClick={() => openDetail(item.id)}>
            Details
          </Button>
          <Button size="sm" variant="outline" className="text-bad hover:bg-bad/10" icon={<Trash2 size={14} />} onClick={() => a.remove(item.id)}>
            Remove
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
