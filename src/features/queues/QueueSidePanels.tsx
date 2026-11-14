import { ArrowDownUp, HeartPulse, Pause, Play, Trash2, Zap } from 'lucide-react';
import type { Queue, QueueStats } from '@/types';
import { cn } from '@/lib/cn';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { useGlobalActions } from '@/hooks/useGlobalActions';
import { RingGauge } from '@/components/charts/StorageChart';
import { SectionCard } from '@/components/Common';
import { Button } from '@/components/ui/Button';

export function queueHealth(queue: Queue, stats: QueueStats): number {
  return Math.max(20, Math.min(100, 100 - stats.failed * 15 - (queue.status === 'paused' ? 12 : 0)));
}

export function QueueHealthCard({ queue, stats }: { queue: Queue; stats: QueueStats }) {
  const health = queueHealth(queue, stats);
  const good = health >= 85;
  return (
    <SectionCard title="Queue health" icon={HeartPulse} bodyClassName="px-5 pb-5">
      <div className="flex items-center gap-4">
        <RingGauge value={health} size={92} label={`Queue health ${health} percent`} />
        <div>
          <p className={cn('flex items-center gap-2 text-[15px] font-semibold', good ? 'text-ok' : 'text-warn')}>
            <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', good ? 'bg-ok' : 'bg-warn')} />
            {good ? 'Healthy' : queue.status === 'paused' ? 'Paused' : 'Needs attention'}
          </p>
          <p className="text-[13px] text-fg2">{good ? 'Everything looks good. Keep going!' : stats.failed > 0 ? 'Some downloads failed. Retry them below.' : 'Start the queue to continue.'}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface2/50 text-center">
        {[
          ['Active', stats.active],
          ['Errors', stats.failed],
          ['In queue', stats.queued + stats.paused],
        ].map(([label, value]) => (
          <div key={label} className="px-2 py-2.5">
            <dd className="tnum text-lg font-semibold text-fg">{value}</dd>
            <dt className="text-xs text-fg3">{label}</dt>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

export function QueueQuickActions({ queue }: { queue: Queue }) {
  const { pauseAll, resumeAll, clearCompleted } = useGlobalActions();
  const reorderByPriority = useDownloadStore((s) => s.reorderByPriority);
  const toast = useUiStore((s) => s.toast);
  return (
    <SectionCard title="Quick actions" icon={Zap} bodyClassName="grid grid-cols-2 gap-2.5 px-5 pb-5">
      <Button variant="secondary" icon={<Play size={15} />} onClick={() => resumeAll(queue.id)}>
        Start all
      </Button>
      <Button variant="secondary" icon={<Pause size={15} />} onClick={() => pauseAll(queue.id)}>
        Pause all
      </Button>
      <Button variant="secondary" icon={<Trash2 size={15} />} onClick={() => clearCompleted(queue.id)}>
        Clear completed
      </Button>
      <Button
        variant="secondary"
        icon={<ArrowDownUp size={15} />}
        onClick={() => {
          reorderByPriority(queue.id);
          toast({ tone: 'success', title: 'Reordered by priority', description: queue.name }, 2400);
        }}
      >
        Reorder by priority
      </Button>
    </SectionCard>
  );
}
