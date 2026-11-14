import { useMemo, useState } from 'react';
import { Archive, CheckCircle2, FolderOpen, LayoutGrid, List } from 'lucide-react';
import { formatBytes, GB } from '@/lib/format';
import { categoryBreakdown, inLibraryRange, matchesQuery, type LibraryRange } from '@/services/selectors';
import { useUiStore } from '@/store/uiStore';
import { useItems } from '@/hooks/useDownloadData';
import { CATEGORY_COLOR } from '@/components/Badges';
import { EmptyState, PageHeader, SectionCard, Tabs, StatCard } from '@/components/Common';
import { StorageChart } from '@/components/charts/StorageChart';
import { FilterBar, FilterSelect } from '@/components/FilterBar';
import { Segmented } from '@/components/ui/Fields';
import { LibraryGrid } from '@/features/library/LibraryGrid';
import { LibraryTable } from '@/features/library/LibraryTable';
import type { Category, DownloadItem } from '@/types';

type Tab = 'all' | Category;
type SortKey = 'date' | 'name' | 'size';

const SORTERS: Record<SortKey, (a: DownloadItem, b: DownloadItem) => number> = {
  date: (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0),
  name: (a, b) => a.fileName.localeCompare(b.fileName),
  size: (a, b) => b.totalBytes - a.totalBytes,
};

export default function LibraryPage() {
  const all = useItems();
  const query = useUiStore((s) => s.query);
  const [tab, setTab] = useState<Tab>('all');
  const [range, setRange] = useState<LibraryRange>('all');
  const [sort, setSort] = useState<SortKey>('date');
  const [view, setView] = useState<'list' | 'grid'>('list');

  const completed = useMemo(() => all.filter((i) => i.status === 'completed'), [all]);
  const searched = useMemo(() => completed.filter((i) => matchesQuery(i, query) && inLibraryRange(i.completedAt, range)), [completed, query, range]);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: searched.length, General: 0, Compressed: 0, Documents: 0, Music: 0, Programs: 0, Video: 0 };
    for (const i of searched) if (i.category in c) c[i.category as Tab] += 1;
    return c;
  }, [searched]);
  const visible = useMemo(() => {
    const list = tab === 'all' ? searched : searched.filter((i) => i.category === tab);
    return [...list].sort(SORTERS[sort]);
  }, [searched, tab, sort]);

  const totalBytes = completed.reduce((s, i) => s + i.totalBytes, 0);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = completed.filter((i) => (i.completedAt ?? 0) >= weekAgo).length;
  const verified = completed.filter((i) => i.checksumStatus === 'verified').length;
  const slices = useMemo(() => categoryBreakdown(completed), [completed]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Library" subtitle="Your downloads, organized for what’s next." />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <SectionCard title="Completed files" icon={FolderOpen} className="min-h-[420px]">
          <div className="flex flex-col gap-4 px-5 pb-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Tabs<Tab>
                label="Library category"
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'all', label: 'All', count: counts.all },
                  { value: 'Documents', label: 'Documents', count: counts.Documents },
                  { value: 'Video', label: 'Video', count: counts.Video },
                  { value: 'Music', label: 'Music', count: counts.Music },
                  { value: 'Programs', label: 'Programs', count: counts.Programs },
                  { value: 'Compressed', label: 'Compressed', count: counts.Compressed },
                  { value: 'General', label: 'General', count: counts.General },
                ]}
              />
              <Segmented<'list' | 'grid'>
                label="Layout"
                value={view}
                onChange={setView}
                options={[
                  { value: 'list', label: <List size={15} />, ariaLabel: 'List view' },
                  { value: 'grid', label: <LayoutGrid size={15} />, ariaLabel: 'Grid view' },
                ]}
              />
            </div>
            <FilterBar>
              <FilterSelect<LibraryRange>
                label="Date"
                value={range}
                onChange={setRange}
                options={[
                  { value: 'all', label: 'All time' },
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: 'Last 7 days' },
                  { value: 'month', label: 'Last 30 days' },
                  { value: 'older', label: 'Older' },
                ]}
              />
              <FilterSelect<SortKey>
                label="Sort by"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'date', label: 'Date completed' },
                  { value: 'name', label: 'Name' },
                  { value: 'size', label: 'Size' },
                ]}
              />
            </FilterBar>
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon={Archive}
              title={completed.length === 0 ? 'Your library is empty' : 'No files match'}
              description={completed.length === 0 ? 'Completed downloads will appear here, verified and organized.' : 'Try a different category, date range or search term.'}
            />
          ) : view === 'list' ? (
            <LibraryTable items={visible} />
          ) : (
            <LibraryGrid items={visible} />
          )}
        </SectionCard>

        <div className="flex flex-col gap-5">
          <SectionCard title="Archive overview" icon={Archive} bodyClassName="px-5 pb-5">
            <div className="grid grid-cols-2 gap-3 pb-4">
              <StatCard icon={Archive} label="Archived" value={totalBytes >= GB ? `${(totalBytes / GB).toFixed(1)} GB` : formatBytes(totalBytes)} sub={`${completed.length} files`} tone="accent" />
              <StatCard icon={CheckCircle2} label="Verified" value={verified} sub={`${completed.length ? Math.round((verified / completed.length) * 100) : 0}% of library`} tone="green" />
            </div>
            <div className="flex items-center gap-5">
              <StorageChart slices={slices} centerLabel={formatBytes(totalBytes)} centerSub="archived" />
              <ul className="min-w-0 flex-1 space-y-2">
                {slices.map((s) => (
                  <li key={s.category} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLOR[s.category] }} />
                      <span className="truncate text-fg">{s.category}</span>
                    </span>
                    <span className="tnum shrink-0 text-fg2">{formatBytes(s.bytes)} · {s.percent.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
              <div><dt className="text-fg3">Completed this week</dt><dd className="tnum text-[18px] font-semibold text-fg">{thisWeek}</dd></div>
              <div><dt className="text-fg3">Total downloads</dt><dd className="tnum text-[18px] font-semibold text-fg">{completed.length}</dd></div>
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
