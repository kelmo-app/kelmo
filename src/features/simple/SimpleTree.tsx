import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, CalendarClock, CheckCheck, DownloadCloud, FileText, Film, Layers, List, Music, Package, File as FileIcon, type LucideIcon } from 'lucide-react';
import type { Category } from '@/types';
import { CATEGORIES } from '@/lib/url';
import { cn } from '@/lib/cn';
import type { TreeCounts, TreeFilter } from './simpleLogic';

const CAT_ICON: Record<Category, LucideIcon> = {
  General: FileIcon,
  Compressed: Archive,
  Documents: FileText,
  Music,
  Programs: Package,
  Video: Film,
};

function Node({ icon: Icon, label, count, active, onClick, indent }: { icon: LucideIcon; label: string; count?: number; active?: boolean; onClick: () => void; indent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition',
        indent && 'pl-5',
        active ? 'bg-accent/12 font-medium text-accent' : 'text-fg2 hover:bg-surface2 hover:text-fg',
      )}
    >
      <Icon size={15} strokeWidth={1.8} aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="tnum text-xs text-fg3">{count}</span>}
    </button>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="px-2.5 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-fg3">{children}</h3>;
}

/** IDM-style tree: All / Unfinished / Finished, the categories, and the other tools. */
export function SimpleTree({ filter, onFilter, counts }: { filter: TreeFilter; onFilter: (f: TreeFilter) => void; counts: TreeCounts }) {
  const go = useNavigate();
  return (
    <nav aria-label="Downloads" className="flex w-[212px] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface/70 px-2 pb-3 pt-2">
      <Heading>Downloads</Heading>
      <Node icon={List} label="All downloads" count={counts.all} active={filter.kind === 'all'} onClick={() => onFilter({ kind: 'all' })} />
      <Node icon={DownloadCloud} label="Unfinished" count={counts.unfinished} active={filter.kind === 'unfinished'} onClick={() => onFilter({ kind: 'unfinished' })} />
      <Node icon={CheckCheck} label="Finished" count={counts.finished} active={filter.kind === 'finished'} onClick={() => onFilter({ kind: 'finished' })} />

      <Heading>Categories</Heading>
      {CATEGORIES.map((c) => (
        <Node key={c} indent icon={CAT_ICON[c]} label={c} count={counts.byCategory[c]} active={filter.kind === 'category' && filter.category === c} onClick={() => onFilter({ kind: 'category', category: c })} />
      ))}

      <Heading>More tools</Heading>
      <Node icon={Layers} label="Queues" onClick={() => go('/queues')} />
      <Node icon={CalendarClock} label="Scheduler" onClick={() => go('/scheduler')} />
    </nav>
  );
}
