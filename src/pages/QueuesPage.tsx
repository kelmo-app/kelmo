import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Layers, Pause, Play, Plus, SearchX, SlidersHorizontal } from 'lucide-react';
import type { DownloadItem, QueueSectionKey } from '@/types';
import { cn } from '@/lib/cn';
import { computeQueueStats, sectionize } from '@/services/QueueManager';
import { matchesQuery } from '@/services/selectors';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { EmptyState, PageHeader } from '@/components/Common';
import { Button } from '@/components/ui/Button';
import { QueueCard } from '@/features/queues/QueueCard';
import { QueueInspector } from '@/features/queues/QueueInspector';
import { QueuePolicyPanel } from '@/features/queues/QueuePolicyPanel';
import { QueueSection } from '@/features/queues/QueueSection';
import { QueueHealthCard, QueueQuickActions } from '@/features/queues/QueueSidePanels';
import { QueueEditorDialog } from '@/features/queues/QueueEditorDialog';
import { QUEUE_TONES } from '@/features/queues/tones';
import { useQueueDnd } from '@/features/queues/useQueueDnd';

const ORDER: QueueSectionKey[] = ['active', 'next', 'paused', 'failed', 'completed'];

export default function QueuesPage() {
  const { queueId } = useParams();
  const navigate = useNavigate();
  const queues = useDownloadStore((s) => s.queues);
  const items = useDownloadStore((s) => s.items);
  const startQueue = useDownloadStore((s) => s.startQueue);
  const pauseQueue = useDownloadStore((s) => s.pauseQueue);
  const query = useUiStore((s) => s.query);
  const activeId = useUiStore((s) => s.activeId);
  const openAdd = useUiStore((s) => s.openAddDialog);
  const openQueueEditor = useUiStore((s) => s.openQueueEditor);
  const toast = useUiStore((s) => s.toast);

  const queue = queueId ? queues.find((q) => q.id === queueId) : queues[0];
  const dnd = useQueueDnd(queue?.id ?? '');
  const stats = useMemo(() => queues.map((q) => ({ q, s: computeQueueStats(q, items) })), [queues, items]);
  const current = stats.find((x) => x.q.id === queue?.id)?.s;

  const sections = useMemo(() => {
    if (!queue) return null;
    const raw = sectionize(queue, items);
    const out = {} as Record<QueueSectionKey, DownloadItem[]>;
    for (const k of ORDER) out[k] = query ? raw[k].filter((i) => matchesQuery(i, query)) : raw[k];
    return out;
  }, [queue, items, query]);

  const toggleRun = (id: string, running: boolean, name: string) => {
    if (running) pauseQueue(id);
    else startQueue(id);
    toast({ tone: 'info', title: running ? 'Queue paused' : 'Queue started', description: name }, 2200);
  };

  const header = (
    <PageHeader
      eyebrow="Queue Studio"
      title="Queue Studio"
      subtitle="Drag, drop, and organize your downloads. Flexible. Powerful. Yours."
      actions={
        <>
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => openQueueEditor(null)}>
            New queue
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAdd(undefined, queue?.id)}>
            Add downloads
          </Button>
        </>
      }
    />
  );

  if (!queue || !sections || !current) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyState
          icon={Layers}
          title="That queue doesn’t exist"
          description="It may have been deleted. Pick another queue to continue."
          action={{ label: 'Go to Queue Studio', onClick: () => navigate('/queues') }}
        />
        <QueueEditorDialog />
      </div>
    );
  }

  const running = queue.status === 'running';
  const tone = QUEUE_TONES[queue.tone];
  const total = ORDER.reduce((n, k) => n + sections[k].length, 0);
  const selectedItem = activeId && items[activeId]?.queueId === queue.id ? items[activeId] : undefined;

  return (
    <div className="flex flex-col gap-5">
      {header}

      <nav aria-label="Queues" className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex gap-3">
          {stats.map(({ q, s }) => (
            <QueueCard
              key={q.id}
              queue={q}
              stats={s}
              selected={q.id === queue.id}
              onSelect={() => navigate(`/queues/${q.id}`)}
              onToggleRun={() => toggleRun(q.id, q.status === 'running', q.name)}
              onSettings={() => openQueueEditor(q.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => openQueueEditor(null)}
            className="flex w-[180px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[13px] font-medium text-fg2 transition hover:border-accent/60 hover:text-accent"
          >
            <Plus size={20} aria-hidden />
            New queue
          </button>
        </div>
      </nav>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <section aria-label={`${queue.name} downloads`} className="card min-w-0 p-5" data-testid="queue-workspace">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2.5 text-[18px] font-semibold text-fg">
                <span aria-hidden className={cn('h-3 w-3 rounded-full', tone.dot)} />
                {queue.name}
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', running ? 'bg-ok/12 text-ok' : 'bg-warn/12 text-warn')}>{running ? 'Running' : 'Paused'}</span>
              </h2>
              <p className="mt-0.5 text-[13px] text-fg2">{queue.description || 'No description.'}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={running ? 'secondary' : 'primary'}
                icon={running ? <Pause size={15} /> : <Play size={15} />}
                onClick={() => toggleRun(queue.id, running, queue.name)}
              >
                {running ? 'Pause queue' : 'Start queue'}
              </Button>
              <Button variant="secondary" icon={<SlidersHorizontal size={15} />} onClick={() => openQueueEditor(queue.id)}>
                Settings
              </Button>
            </div>
          </header>

          {total === 0 ? (
            query ? (
              <EmptyState icon={SearchX} title={`No downloads in this queue match “${query}”`} description="Clear the search to see everything in the queue." />
            ) : (
              <EmptyState icon={Layers} title="This queue is empty" description="Add a download or move one here from another queue." action={{ label: 'Add download', onClick: () => openAdd(undefined, queue.id) }} />
            )
          ) : (
            <div className="flex flex-col gap-6" onDragLeave={(e) => e.currentTarget === e.target && dnd.end()}>
              {ORDER.filter((k) => k !== 'failed' || sections.failed.length > 0).map((k) => (
                <QueueSection
                  key={k}
                  queue={queue}
                  section={k}
                  items={sections[k]}
                  selectedId={selectedItem?.id ?? null}
                  dnd={dnd}
                  defaultOpen={k !== 'completed' || !!query}
                  emptyText={k === 'active' ? 'Nothing is downloading right now.' : k === 'next' ? 'No items are waiting.' : k === 'paused' ? 'No paused items.' : 'Nothing completed yet.'}
                />
              ))}
              <p className="text-center text-xs text-fg3">
                Tip: drag a row by its handle to reorder, or focus the handle and press <kbd className="kbd">Alt</kbd> + <kbd className="kbd">↑</kbd>/<kbd className="kbd">↓</kbd>.
              </p>
            </div>
          )}
        </section>

        <aside aria-label="Queue controls" className="flex min-w-0 flex-col gap-5">
          <QueueInspector item={selectedItem} />
          <QueuePolicyPanel queue={queue} />
          <QueueHealthCard queue={queue} stats={current} />
          <QueueQuickActions queue={queue} />
          <p className="px-1 text-xs text-fg3">
            Want this queue to run on a timetable?{' '}
            <Link to="/scheduler" className="text-accent hover:underline">
              Open the Scheduler
            </Link>
            .
          </p>
        </aside>
      </div>

      <QueueEditorDialog />
    </div>
  );
}
