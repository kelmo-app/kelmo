import type { ReactNode } from 'react';
import { Ban, Copy, FolderOpen, Pause, Play, RotateCw, Trash2 } from 'lucide-react';
import type { DownloadItem, Priority } from '@/types';
import { BANDWIDTH_PRESETS } from '@/data/defaults';
import { formatBytes, formatDateTime, formatDuration, formatEta, formatMBps } from '@/lib/format';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { useItemActions } from '@/hooks/useItemActions';
import { Button } from '@/components/ui/Button';
import { Select, Slider } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { CategoryBadge, ChecksumBadge, StatusBadge } from '@/components/Badges';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { ProgressBar } from '@/components/ProgressBar';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
      <dt className="shrink-0 text-fg2">{label}</dt>
      <dd className="min-w-0 break-words text-right text-fg">{children}</dd>
    </div>
  );
}

/** Slide-in panel with everything about one download. */
export function DetailDrawer() {
  const id = useUiStore((s) => s.detailId);
  const close = useUiStore((s) => s.closeDetail);
  const item = useDownloadStore((s) => (id ? s.items[id] : undefined));
  return (
    <Modal open={!!id && !!item} onClose={close} title="Download details" variant="drawer" testId="detail-drawer">
      {item && <DrawerBody item={item} />}
    </Modal>
  );
}

function DrawerBody({ item }: { item: DownloadItem }) {
  const a = useItemActions();
  const queues = useDownloadStore((s) => s.queues);
  const { setPriority, setConnections, setSpeedLimit, moveToQueue } = useDownloadStore.getState();
  const toast = useUiStore.getState().toast;
  const queue = queues.find((q) => q.id === item.queueId);
  const live = item.status === 'downloading' || item.status === 'queued';
  const stoppable = live || item.status === 'paused';
  const running = item.status === 'downloading';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <FileTypeIcon type={item.fileType} category={item.category} size="lg" />
        <div className="min-w-0">
          <h3 className="break-words text-[15px] font-semibold leading-snug text-fg">{item.fileName}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            <CategoryBadge category={item.category} />
          </div>
        </div>
      </div>

      <div>
        <ProgressBar value={item.progress} status={item.status} size="md" showValue label={`${item.fileName} progress`} />
        <p className="tnum mt-1.5 text-xs text-fg2">
          {formatBytes(item.downloadedBytes)} of {formatBytes(item.totalBytes)}
          {running && ` · ${formatMBps(item.speed)} · ${formatEta(item.eta)} left`}
        </p>
        {item.error && item.status === 'failed' && (
          <p role="alert" className="mt-2 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-fg">
            <span className="font-semibold text-bad">Failed:</span> {item.error}
          </p>
        )}
      </div>

      {/* connection segments */}
      {running && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-fg2">Connections ({item.connections})</p>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: item.connections }, (_, i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full bg-accent/70" style={{ opacity: 0.45 + ((i * 37) % 55) / 100 }} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {live && (
          <Button variant="secondary" icon={<Pause size={15} />} onClick={() => a.pause(item.id)}>
            Pause
          </Button>
        )}
        {item.status === 'paused' && (
          <Button variant="primary" icon={<Play size={15} />} onClick={() => a.resume(item.id)}>
            Resume
          </Button>
        )}
        {(item.status === 'failed' || item.status === 'cancelled') && (
          <Button variant="primary" icon={<RotateCw size={15} />} onClick={() => a.retry(item.id)}>
            Retry
          </Button>
        )}
        {stoppable && (
          <Button variant="outline" icon={<Ban size={15} />} onClick={() => a.cancel(item.id)}>
            Cancel
          </Button>
        )}
        <Button variant="outline" icon={<FolderOpen size={15} />} onClick={() => void a.openFolder(item.id)}>
          Open folder
        </Button>
        <Button variant="outline" icon={<Copy size={15} />} onClick={() => void a.copyLink(item.id)}>
          Copy link
        </Button>
        <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => a.remove(item.id)}>
          Remove
        </Button>
      </div>

      {item.status !== 'completed' && (
        <section aria-label="Transfer settings" className="flex flex-col gap-4 rounded-lg border border-line bg-surface2/50 p-4">
          <Slider label="Connections" min={1} max={16} value={item.connections} onChange={(n) => setConnections(item.id, n)} />
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
              label="Speed limit"
              value={item.speedLimit}
              onValueChange={(n) => setSpeedLimit(item.id, n)}
              options={
                BANDWIDTH_PRESETS.some((p) => p.value === item.speedLimit)
                  ? BANDWIDTH_PRESETS.map((p) => ({ value: p.value, label: p.label }))
                  : [...BANDWIDTH_PRESETS, { label: formatMBps(item.speedLimit), value: item.speedLimit }].map((p) => ({ value: p.value, label: p.label }))
              }
            />
          </div>
        </section>
      )}

      <Select
        label="Queue"
        value={item.queueId}
        onValueChange={(q) => {
          moveToQueue(item.id, q);
          toast({ tone: 'success', title: 'Moved to queue', description: `${item.fileName} → ${queues.find((x) => x.id === q)?.name}` }, 2400);
        }}
        options={queues.map((q) => ({ value: q.id, label: q.name }))}
      />

      <dl className="divide-y divide-line border-t border-line">
        <Row label="Source">{item.sourceDomain}</Row>
        <Row label="URL">
          <span className="font-mono text-xs">{item.url}</span>
        </Row>
        <Row label="Destination">
          <span className="font-mono text-xs">{item.destination}</span>
        </Row>
        <Row label="Queue">{queue?.name ?? '—'}</Row>
        <Row label="Priority">
          <span className="capitalize">{item.priority}</span>
        </Row>
        <Row label="Added">{formatDateTime(item.createdAt)}</Row>
        {item.completedAt && <Row label="Completed">{formatDateTime(item.completedAt)}</Row>}
        {item.durationSec > 0 && <Row label="Active time">{formatDuration(item.durationSec)}</Row>}
        <Row label="Retries">{item.retries}</Row>
        <Row label="Checksum">
          <ChecksumBadge status={item.checksumStatus} algo={item.checksumAlgo} />
        </Row>
        {item.checksum && (
          <Row label={item.checksumAlgo}>
            <span className="flex items-center gap-2">
              <span className="break-all font-mono text-[11px]">{item.checksum}</span>
              <button type="button" className="shrink-0 text-fg3 hover:text-fg" aria-label="Copy checksum" onClick={() => void navigator.clipboard?.writeText(item.checksum ?? '').catch(() => {})}>
                <Copy size={13} />
              </button>
            </span>
          </Row>
        )}
        {item.expectedChecksum && (
          <Row label="Expected">
            <span className="break-all font-mono text-[11px]">{item.expectedChecksum}</span>
          </Row>
        )}
      </dl>
    </div>
  );
}
