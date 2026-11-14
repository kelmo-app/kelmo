import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { MenuEntry, RowAction } from './rowMenu';

interface Props {
  x: number;
  y: number;
  entries: MenuEntry[];
  onPick: (action: RowAction) => void;
  onClose: () => void;
}

const pad = 6;

/** Keeps a box inside the window: flips left/up when it would stick out. */
function place(x: number, y: number, w: number, h: number) {
  const left = x + w + pad > window.innerWidth ? Math.max(pad, x - w) : x;
  const top = y + h + pad > window.innerHeight ? Math.max(pad, window.innerHeight - h - pad) : y;
  return { left, top };
}

function Panel({ x, y, entries, onPick, onClose, sub }: Props & { sub?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [open, setOpen] = useState<number | null>(null);
  const [focus, setFocus] = useState(-1);
  const rows = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.kind !== 'sep' && !e.disabled);

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos(place(x, y, r.width, r.height));
  }, [x, y]);

  useEffect(() => {
    if (sub) return;
    ref.current?.focus();
  }, [sub]);

  const move = (d: 1 | -1) => {
    if (rows.length === 0) return;
    const at = rows.findIndex((r) => r.i === focus);
    setFocus(rows[(at + d + rows.length) % rows.length].i);
  };

  const onKey = (ev: ReactKeyEvent) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); move(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
    else if (ev.key === 'ArrowRight' && focus >= 0 && entries[focus].kind === 'sub') { ev.preventDefault(); setOpen(focus); }
    else if (ev.key === 'ArrowLeft' && sub) { ev.preventDefault(); onClose(); }
    else if (ev.key === 'Enter' && focus >= 0) {
      ev.preventDefault();
      const e = entries[focus];
      if (e.kind === 'item' && !e.disabled) onPick(e.action);
      else if (e.kind === 'sub' && !e.disabled) setOpen(focus);
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKey}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[200] min-w-[190px] rounded-lg border border-line bg-surface p-1 text-[13px] shadow-xl outline-none"
      data-testid={sub ? 'row-submenu' : 'row-menu'}
    >
      {entries.map((e, i) => {
        if (e.kind === 'sep') return <div key={i} role="separator" className="my-1 h-px bg-line" />;
        const isSub = e.kind === 'sub';
        const danger = e.kind === 'item' && e.danger;
        return (
          <div key={i} className="relative">
            <button
              type="button"
              role="menuitem"
              disabled={e.disabled}
              aria-haspopup={isSub ? 'menu' : undefined}
              onMouseEnter={() => { setFocus(e.disabled ? -1 : i); setOpen(isSub && !e.disabled ? i : null); }}
              onClick={() => (isSub ? setOpen(i) : e.kind === 'item' && onPick(e.action))}
              className={cn(
                'flex w-full items-center gap-6 rounded-md px-3 py-1.5 text-left outline-none transition disabled:cursor-not-allowed disabled:opacity-40',
                danger ? 'text-bad hover:bg-bad/12' : 'text-fg hover:bg-accent/10 hover:text-accent',
                focus === i && !e.disabled && (danger ? 'bg-bad/12' : 'bg-accent/10 text-accent'),
              )}
            >
              <span className="flex-1">{e.label}</span>
              {e.kind === 'item' && e.shortcut && <span className="text-[11px] text-fg3">{e.shortcut}</span>}
              {isSub && <ChevronRight size={14} aria-hidden />}
            </button>
            {isSub && open === i && !e.disabled && <SubPanel parent={ref} entries={e.children} onPick={onPick} onClose={() => setOpen(null)} />}
          </div>
        );
      })}
    </div>
  );
}

/** The "Add to queue" list: opens beside its row. */
function SubPanel({ parent, entries, onPick, onClose }: { parent: RefObject<HTMLDivElement>; entries: MenuEntry[]; onPick: (a: RowAction) => void; onClose: () => void }) {
  const r = parent.current?.getBoundingClientRect();
  const x = r ? r.right - 2 : 0;
  const y = r ? r.top : 0;
  // a sub-menu hangs off the main panel, so flip to its left side when there is no room on the right
  const flip = r && x + 200 > window.innerWidth;
  return <Panel sub x={flip && r ? r.left - 200 : x} y={y} entries={entries} onPick={onPick} onClose={onClose} />;
}

/** IDM-style right-click menu for a download row. */
export function RowMenu(props: Props) {
  const { onClose } = props;
  useEffect(() => {
    const close = () => onClose();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const outside = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[role="menu"]')) onClose(); };
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', outside);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close);
    };
  }, [onClose]);
  return createPortal(<Panel {...props} />, document.body);
}
