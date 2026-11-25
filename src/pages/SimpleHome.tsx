import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Download, Magnet, Pause, Play, Plus, Search, SearchX, Settings as SettingsIcon, Trash2, Eraser, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { APP_VERSION } from '@/data/defaults';
import { formatBytes, formatSpeed } from '@/lib/format';
import { platform } from '@/services/platform';
import { filterDownloads, sortDownloads, type DownloadSortKey, type SortDir } from '@/services/selectors';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { useItems, useTotals } from '@/hooks/useDownloadData';
import { useGlobalActions } from '@/hooks/useGlobalActions';
import { useDiskUsage } from '@/hooks/useDisk';
import { useBandwidthNow } from '@/hooks/useBandwidthNow';
import { AFTER_ALL_OPTIONS } from '@/lib/afterAll';
import { requestRemove } from '@/hooks/useShortcuts';
import { useItemActions } from '@/hooks/useItemActions';
import { RowMenu } from '@/features/simple/RowMenu';
import { buildRowMenu, menuTargets, resumeKind, type RowAction } from '@/features/simple/rowMenu';
import { EmptyState, Wordmark } from '@/components/Common';
import { ModeSwitch } from '@/components/ModeSwitch';
import { SimpleTree } from '@/features/simple/SimpleTree';
import { SimpleList } from '@/features/simple/SimpleList';
import { SimpleDetail } from '@/features/simple/SimpleDetail';
import { applyTree, nextSelection, stepActive, treeCounts, type TreeFilter } from '@/features/simple/simpleLogic';

function ToolButton({ icon: Icon, label, onClick, disabled, danger, title }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; title?: string }) {
  // Every button looks the same until you use it: the one you hovered or clicked turns copper
  // (red for the delete buttons), so it is always clear which one you pressed.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={cn(
        'flex min-w-[62px] flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium outline-none transition disabled:cursor-not-allowed disabled:opacity-35',
        danger
          ? 'text-bad/85 hover:bg-bad/12 hover:text-bad focus:bg-bad/15 focus:text-bad'
          : 'text-fg2 hover:bg-accent/10 hover:text-accent focus:bg-accent/15 focus:text-accent focus:ring-1 focus:ring-accent/40',
      )}
    >
      <Icon size={20} strokeWidth={1.7} aria-hidden />
      {label}
    </button>
  );
}

const Sep = () => <span aria-hidden className="mx-1.5 h-9 w-px bg-line" />;

/**
 * The default window, like IDM: a toolbar, the category tree and — above all — the list of downloads.
 * Everything else (Overview, Queues, Scheduler…) is one click away but never in the way.
 */
export default function SimpleHome() {
  const navigate = useNavigate();
  const items = useItems();
  const totals = useTotals();
  const disk = useDiskUsage(items);
  const bw = useBandwidthNow();
  const afterAll = useUiStore((s) => s.afterAll);
  const setAfterAll = useUiStore((s) => s.setAfterAll);
  const query = useUiStore((s) => s.query);
  const setQuery = useUiStore((s) => s.setQuery);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const setSelectedIds = useUiStore((s) => s.setSelectedIds);
  const setActiveId = useUiStore((s) => s.setActiveId);
  const activeId = useUiStore((s) => s.activeId);
  const openAdd = useUiStore((s) => s.openAddDialog);
  const focusTick = useUiStore((s) => s.focusSearchTick);
  const openDetail = useUiStore((s) => s.openDetail);
  const pauseMany = useDownloadStore((s) => s.pauseMany);
  const resumeMany = useDownloadStore((s) => s.resumeMany);
  const { pauseAll, resumeAll, clearCompleted } = useGlobalActions();
  const queues = useDownloadStore((s) => s.queues);
  const itemActions = useItemActions();
  const toast = useUiStore((s) => s.toast);
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);

  const [filter, setFilter] = useState<TreeFilter>({ kind: 'all' });
  const [sort, setSort] = useState<{ key: DownloadSortKey; dir: SortDir }>({ key: 'date', dir: 'desc' });
  const anchor = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl+K focuses the search box
  useEffect(() => {
    if (focusTick > 0) searchRef.current?.focus();
  }, [focusTick]);

  const counts = useMemo(() => treeCounts(items), [items]);
  const rows = useMemo(() => sortDownloads(filterDownloads(applyTree(items, filter), { query }), sort.key, sort.dir), [items, filter, query, sort]);
  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const selected = useMemo(() => selectedIds.filter((id) => visibleIds.includes(id)), [selectedIds, visibleIds]);
  const single = selected.length === 1 ? (rows.find((r) => r.id === selected[0]) ?? null) : null;

  const onSort = (key: DownloadSortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  const select = (id: string, mods: { ctrl: boolean; shift: boolean }) => {
    setSelectedIds(nextSelection(selected, id, mods, anchor.current, visibleIds));
    if (!mods.shift) anchor.current = id;
    setActiveId(id);
  };

  // Right-click: act on the whole selection when the clicked row is part of it, else select just that row first.
  const openMenu = (id: string, x: number, y: number) => {
    let ids = selected;
    if (!selected.includes(id)) {
      ids = [id];
      setSelectedIds(ids);
      anchor.current = id;
      setActiveId(id);
    }
    setMenu({ x, y, ids });
  };
  const menuItems = menu ? menuTargets(menu.ids[0], menu.ids, items) : [];
  const runMenu = (action: RowAction) => {
    const targets = menuItems;
    setMenu(null);
    const first = targets[0];
    if (!first) return;
    if (action.startsWith('queue:')) {
      const queueId = action.slice(6);
      const name = queues.find((q) => q.id === queueId)?.name ?? 'queue';
      const store = useDownloadStore.getState();
      targets.forEach((t) => store.moveToQueue(t.id, queueId));
      toast({ tone: 'success', title: targets.length === 1 ? `Added to “${name}”` : `${targets.length} downloads added to “${name}”`, description: targets.length === 1 ? first.fileName : undefined }, 2600);
      return;
    }
    switch (action) {
      case 'open': void itemActions.openFile(first.id); break;
      case 'folder': void itemActions.openFolder(first.id); break;
      case 'redownload': itemActions.redownload(first.id); break;
      case 'copy': void itemActions.copyLink(first.id); break;
      case 'properties': openDetail(first.id); break;
      case 'remove': requestRemove(targets.map((t) => t.id)); break;
      case 'stop': targets.filter((t) => t.status === 'downloading' || t.status === 'queued').forEach((t) => itemActions.pause(t.id)); break;
      case 'resume':
        targets.forEach((t) => {
          const k = resumeKind(t);
          if (k === 'resume') itemActions.resume(t.id);
          else if (k === 'retry') itemActions.retry(t.id);
        });
        break;
    }
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const id = stepActive(visibleIds, activeId, e.key === 'ArrowDown' ? 1 : -1);
      if (id) select(id, { ctrl: false, shift: e.shiftKey });
    } else if (e.key === 'Enter' && activeId) openDetail(activeId);
    else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setSelectedIds(visibleIds);
    }
  };

  const filtersActive = query !== '' || filter.kind !== 'all';
  const heading =
    filter.kind === 'category' ? filter.category : filter.kind === 'unfinished' ? 'Unfinished' : filter.kind === 'finished' ? 'Finished' : 'All downloads';

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg text-fg" data-testid="simple-home">
      <header className="flex shrink-0 items-center gap-1 border-b border-line bg-surface/80 px-3 py-1.5">
        <div className="mr-3 hidden min-[1250px]:block">
          <Wordmark collapsed />
        </div>
        <ToolButton icon={Plus} label="Add URL" onClick={() => openAdd()} title="Add a download (Ctrl+N)" />
        {platform.isElectron && (
          <ToolButton
            icon={Magnet}
            label="Add Torrent"
            onClick={async () => { const f = await platform.pickTorrent(); if (f) openAdd(f); }}
            title="Choose a .torrent file (or paste a magnet link in Add URL)"
          />
        )}
        <ToolButton
          icon={Play}
          label="Resume"
          onClick={() => (selected.length ? resumeMany(selected) : resumeAll())}
          title={selected.length ? 'Resume the selected downloads' : 'Resume all paused downloads'}
        />
        <ToolButton
          icon={Pause}
          label="Pause"
          onClick={() => (selected.length ? pauseMany(selected) : pauseAll())}
          title={selected.length ? 'Pause the selected downloads' : 'Pause all running downloads'}
        />
        <Sep />
        <div className="flex items-center rounded-xl border border-bad/25 bg-bad/5 px-0.5" role="group" aria-label="Remove from the list">
          <ToolButton danger icon={Trash2} label="Delete" onClick={() => requestRemove(selected)} disabled={selected.length === 0} title="Remove the selected downloads: from the list only, or also move their files to the Trash" />
          <ToolButton danger icon={Eraser} label="Clear finished" onClick={() => clearCompleted()} title="Remove all completed downloads from the list (files stay on disk)" />
        </div>
        <Sep />
        <ToolButton icon={CalendarClock} label="Scheduler" onClick={() => navigate('/scheduler')} />
        <ToolButton icon={SettingsIcon} label="Options" onClick={() => navigate('/settings')} />

        <div className="ml-auto flex items-center gap-3">
          <label className="relative block">
            <span className="sr-only">Search downloads</span>
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg3" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files…"
              className="h-8 w-[210px] rounded-md border border-line bg-surface2 pl-8 pr-2.5 text-[13px] text-fg placeholder:text-fg3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </label>
          <ModeSwitch />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <SimpleTree filter={filter} onFilter={setFilter} counts={counts} />
        <section className="flex min-w-0 flex-1 flex-col" aria-label={heading}>
          <SimpleList
            items={rows}
            selectedIds={selected}
            sort={sort}
            onSort={onSort}
            onSelect={select}
            onOpen={openDetail}
            onMenu={openMenu}
            onKey={onKey}
            empty={
              filtersActive ? (
                <EmptyState
                  icon={SearchX}
                  title="No downloads here"
                  description={query ? 'Nothing matches your search.' : `There are no downloads in “${heading}”.`}
                  action={{ label: 'Show all downloads', onClick: () => { setQuery(''); setFilter({ kind: 'all' }); } }}
                />
              ) : (
                <EmptyState icon={Download} title="No downloads yet" description="Click Add URL, or send a link from your browser with the KDM extension." action={{ label: 'Add URL', onClick: () => openAdd() }} />
              )
            }
          />
          <SimpleDetail item={single} selectedCount={selected.length} />
        </section>
      </div>

      <footer className="flex shrink-0 items-center gap-5 border-t border-line bg-surface px-4 py-1.5 text-xs text-fg3" role="status">
        <span>
          {totals.active > 0 ? `${totals.active} active · ${formatSpeed(totals.speed)}` : 'Ready'}
        </span>
        <span>
          {rows.length} of {items.length} shown
        </span>
        <span>{formatBytes(disk.free)} free{disk.real ? '' : ' (estimate)'}</span>
        {bw.limit > 0 && (
          <span className="text-accent" title={bw.window ? `Bandwidth planner: ${bw.window.name} until ${bw.window.endTime}` : 'Default speed limit'}>
            Limit {formatSpeed(bw.limit)}
          </span>
        )}
        <label className={afterAll === 'none' ? 'ml-auto flex items-center gap-1.5' : 'ml-auto flex items-center gap-1.5 text-accent'} title="Runs once, after every download has finished">
          When all done
          <select
            value={afterAll}
            onChange={(e) => setAfterAll(e.target.value as typeof afterAll)}
            className="rounded border border-line bg-surface2 px-1 py-0.5 text-xs text-fg"
            aria-label="When all downloads finish"
          >
            {AFTER_ALL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <span className="tnum">KDM {APP_VERSION} · GPLv3</span>
      </footer>
      {menu && <RowMenu x={menu.x} y={menu.y} entries={buildRowMenu(menuItems, queues)} onPick={runMenu} onClose={() => setMenu(null)} />}
    </div>
  );
}
