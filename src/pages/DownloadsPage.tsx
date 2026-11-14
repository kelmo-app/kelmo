import { useMemo, useState } from 'react';
import { ArrowDownUp, ArrowDown, ArrowUp, Download, LayoutList, Pause, Play, Plus, Rows3, SearchX, Trash2 } from 'lucide-react';
import type { Category, DownloadItem, DownloadStatus } from '@/types';
import { CATEGORIES } from '@/lib/url';
import { filterDownloads, sortDownloads, type DownloadSortKey, type SortDir } from '@/services/selectors';
import { storage } from '@/services/StorageService';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { useItems, useTotals } from '@/hooks/useDownloadData';
import { useGlobalActions } from '@/hooks/useGlobalActions';
import { EmptyState, PageHeader, SectionCard, Tabs } from '@/components/Common';
import { FilterBar, FilterSelect } from '@/components/FilterBar';
import { Button, IconButton } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Fields';
import { BulkBar } from '@/features/downloads/BulkBar';
import { DownloadCard } from '@/features/downloads/DownloadCard';
import { DownloadTable } from '@/features/downloads/DownloadTable';

type StatusTab = 'all' | 'active' | 'paused' | 'completed' | 'failed';
type View = 'table' | 'list';

const FAILED: DownloadStatus[] = ['failed', 'cancelled'];

function applyTab(items: DownloadItem[], tab: StatusTab): DownloadItem[] {
  switch (tab) {
    case 'active':
      return items.filter((i) => i.status === 'downloading' || i.status === 'queued');
    case 'paused':
      return items.filter((i) => i.status === 'paused');
    case 'completed':
      return items.filter((i) => i.status === 'completed');
    case 'failed':
      return items.filter((i) => FAILED.includes(i.status));
    default:
      return items;
  }
}

const SORT_OPTIONS: Array<{ value: DownloadSortKey; label: string }> = [
  { value: 'date', label: 'Date added' },
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
  { value: 'speed', label: 'Speed' },
  { value: 'status', label: 'Status' },
  { value: 'progress', label: 'Progress' },
];

export default function DownloadsPage() {
  const items = useItems();
  const totals = useTotals();
  const queues = useDownloadStore((s) => s.queues);
  const query = useUiStore((s) => s.query);
  const setQuery = useUiStore((s) => s.setQuery);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const setSelectedIds = useUiStore((s) => s.setSelectedIds);
  const toggleSelected = useUiStore((s) => s.toggleSelected);
  const activeId = useUiStore((s) => s.activeId);
  const openAdd = useUiStore((s) => s.openAddDialog);
  const { pauseAll, resumeAll, clearCompleted } = useGlobalActions();

  const [tab, setTab] = useState<StatusTab>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [queueId, setQueueId] = useState<string>('all');
  const [sort, setSort] = useState<{ key: DownloadSortKey; dir: SortDir }>({ key: 'date', dir: 'desc' });
  const [view, setViewState] = useState<View>(() => storage.read<View>('ui:downloadsView', 'table'));
  const setView = (v: View) => {
    setViewState(v);
    storage.write('ui:downloadsView', v);
  };

  // everything except the tab, so tab counts stay meaningful
  const base = useMemo(() => filterDownloads(items, { query, category, queueId }), [items, query, category, queueId]);
  const counts = useMemo(
    () => ({
      all: base.length,
      active: applyTab(base, 'active').length,
      paused: applyTab(base, 'paused').length,
      completed: applyTab(base, 'completed').length,
      failed: applyTab(base, 'failed').length,
    }),
    [base],
  );
  const rows = useMemo(() => sortDownloads(applyTab(base, tab), sort.key, sort.dir), [base, tab, sort]);
  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const selected = useMemo(() => selectedIds.filter((id) => visibleIds.has(id)), [selectedIds, visibleIds]);

  const filtersActive = query !== '' || category !== 'all' || queueId !== 'all' || tab !== 'all';
  const resetFilters = () => {
    setQuery('');
    setCategory('all');
    setQueueId('all');
    setTab('all');
  };

  const onSort = (key: DownloadSortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Downloads"
        subtitle="Every transfer in one place — search, filter and act in bulk."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openAdd()}>
            Add download
          </Button>
        }
      />

      <SectionCard
        title="All downloads"
        icon={Download}
        actions={
          <>
            {totals.active > 0 ? (
              <Button size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => pauseAll()}>
                Pause all
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => resumeAll()}>
                Resume all
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<Trash2 size={14} />} onClick={() => clearCompleted()}>
              Clear completed
            </Button>
          </>
        }
        bodyClassName="pb-1"
      >
        <div className="flex flex-col gap-4 px-5 pb-4">
          <Tabs<StatusTab>
            label="Filter by status"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'active', label: 'Active', count: counts.active },
              { value: 'paused', label: 'Paused', count: counts.paused },
              { value: 'completed', label: 'Completed', count: counts.completed },
              { value: 'failed', label: 'Failed', count: counts.failed },
            ]}
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <FilterBar>
              <FilterSelect<Category | 'all'>
                label="Category"
                value={category}
                onChange={setCategory}
                options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
              />
              <FilterSelect label="Queue" value={queueId} onChange={setQueueId} options={[{ value: 'all', label: 'All queues' }, ...queues.map((q) => ({ value: q.id, label: q.name }))]} />
              <FilterSelect<DownloadSortKey> label="Sort by" value={sort.key} onChange={(key) => setSort((s) => ({ ...s, key }))} options={SORT_OPTIONS} />
              <IconButton
                label={sort.dir === 'asc' ? 'Sorted ascending. Switch to descending' : 'Sorted descending. Switch to ascending'}
                onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
                className="border border-line"
              >
                {sort.dir === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              </IconButton>
            </FilterBar>
            <div className="flex items-center gap-3">
              <p className="tnum hidden text-xs text-fg3 sm:block" aria-live="polite" data-testid="result-count">
                <ArrowDownUp size={12} className="mr-1 inline" aria-hidden />
                {rows.length} of {items.length} shown
              </p>
              <Segmented<View>
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { value: 'table', label: <Rows3 size={16} />, ariaLabel: 'Table view' },
                  { value: 'list', label: <LayoutList size={16} />, ariaLabel: 'List view' },
                ]}
              />
            </div>
          </div>
        </div>

        <BulkBar ids={selected} />

        {view === 'table' ? (
          <DownloadTable
            items={rows}
            caption="All downloads"
            selectable
            selectedIds={selected}
            onToggle={toggleSelected}
            onToggleAll={(checked) => setSelectedIds(checked ? rows.map((r) => r.id) : [])}
            sort={sort}
            onSort={onSort}
            empty={<NoResults filtersActive={filtersActive} onReset={resetFilters} onAdd={() => openAdd()} />}
          />
        ) : rows.length === 0 ? (
          <NoResults filtersActive={filtersActive} onReset={resetFilters} onAdd={() => openAdd()} />
        ) : (
          <ul className="divide-y divide-line border-t border-line" aria-label="All downloads">
            {rows.map((item) => (
              <DownloadCard key={item.id} item={item} checked={selected.includes(item.id)} active={activeId === item.id} onToggle={toggleSelected} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function NoResults({ filtersActive, onReset, onAdd }: { filtersActive: boolean; onReset: () => void; onAdd: () => void }) {
  return filtersActive ? (
    <EmptyState icon={SearchX} title="No downloads match these filters" description="Try a different search or clear the filters." action={{ label: 'Clear filters', onClick: onReset }} />
  ) : (
    <EmptyState icon={Download} title="No downloads yet" description="Paste a link to start your first download." action={{ label: 'Add download', onClick: onAdd }} />
  );
}
