import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, FolderOpen, Layers, Pause, Play, Plus, Settings as SettingsIcon } from 'lucide-react';
import type { PopupItem } from '@/types/global';
import { LogoMark } from '@/components/Common';
import { ProgressBar } from '@/components/ProgressBar';
import { formatBytes, formatSpeed } from '@/lib/format';

const MAX_ROWS = 4;

/** Live list of every active download, fed by the main window through the main process. */
function useActiveItems(): PopupItem[] {
  const [items, setItems] = useState<PopupItem[]>([]);
  useEffect(() => {
    const api = window.kelmo?.popup;
    if (!api) return;
    let alive = true;
    const set = (list: PopupItem[]) => alive && setItems(list.filter((i) => ['downloading', 'queued', 'paused'].includes(i.status)));
    void api.snapshot().then(set);
    const off = api.onItems(set);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return items;
}

const percent = (i: PopupItem) => (i.totalBytes > 0 ? Math.min(100, (i.downloadedBytes / i.totalBytes) * 100) : 0);

function Row({ icon: Icon, label, onClick, disabled }: { icon: typeof Plus; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface2/60 text-[13px] text-fg transition hover:bg-surface3 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Icon className="h-3.5 w-3.5 text-accent" aria-hidden /> {label}
    </button>
  );
}

function ToolButton({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] text-fg2 transition hover:bg-surface2 hover:text-fg">
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  );
}

/** Quick Monitor: what a left click on the tray icon shows. */
export function TrayPopup() {
  const api = window.kelmo?.popup;
  const items = useActiveItems();
  const root = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState('');
  const linkRef = useRef<HTMLInputElement>(null);

  const running = useMemo(() => items.filter((i) => i.status === 'downloading'), [items]);
  const queued = items.filter((i) => i.status === 'queued').length;
  const paused = items.filter((i) => i.status === 'paused');
  const speed = running.reduce((n, i) => n + (i.speed || 0), 0);
  const shown = [...running, ...items.filter((i) => i.status === 'queued')].slice(0, MAX_ROWS);
  const hidden = running.length + queued - shown.length;

  // the window follows the content height
  useEffect(() => {
    const el = root.current;
    if (!el || !api) return;
    const fit = () => void api.resize({ height: Math.max(200, Math.min(1000, Math.ceil(el.getBoundingClientRect().height))) });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [api]);

  // Esc closes it, like a menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (adding) setAdding(false);
      else void api?.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api, adding]);

  // "Add URL" opens a paste box right here (filled with a link you just copied); Enter sends it to the small Download File Info window
  const startAdd = async () => {
    setAdding(true);
    const copied = await window.kelmo?.clipboardLink?.();
    if (copied) setLink((cur) => cur || copied);
    window.setTimeout(() => linkRef.current?.select(), 0);
  };
  const sendLink = () => {
    const url = link.trim();
    if (!/^https?:\/\/\S+$/i.test(url) && !/^magnet:\?xt=urn:bt/i.test(url)) return;
    void api?.trayAdd(url);
    setLink('');
    setAdding(false);
  };

  const go = (what: 'openMain' | 'addUrl' | 'queue' | 'folder' | 'settings') => void api?.trayDo(what);
  const act = (list: PopupItem[], action: 'pause' | 'resume') => list.forEach((i) => void api?.action({ id: i.id, action }));

  return (
    <div ref={root} className="flex cursor-default select-none flex-col gap-3 border border-line bg-bg p-3.5" data-testid="tray-popup">
      <header className="flex items-center justify-between" style={{ WebkitAppRegion: 'drag' } as CSSProperties} title="Drag to move">
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <div className="leading-tight">
            <div className="text-[16px] font-semibold tracking-[0.2em] text-fg">KELMO</div>
            <div className="text-[11px] text-fg2">Quick Monitor</div>
          </div>
        </div>
        <div className="tnum text-[15px] font-semibold text-accent" title="Total speed">{running.length ? formatSpeed(speed) : '—'}</div>
      </header>

      <button
        type="button"
        onClick={() => go('openMain')}
        className="flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-medium text-accent-fg shadow-soft transition hover:brightness-105"
      >
        <ArrowUpRight className="h-4 w-4" aria-hidden /> Open KELMO
      </button>

      <div className="flex items-center justify-between text-[12px] text-fg2">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${running.length ? 'bg-ok' : 'bg-fg3'}`} aria-hidden />
          <b className="text-fg">{running.length}</b> active
          {queued > 0 && <span> · {queued} queued</span>}
          {paused.length > 0 && <span> · {paused.length} paused</span>}
        </span>
      </div>

      {shown.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface/70">
          {shown.map((i, idx) => (
            <article key={i.id} className={`px-3 py-2.5 ${idx > 0 ? 'border-t border-line' : ''}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-fg" title={i.fileName}>{i.fileName}</span>
                <span className="tnum shrink-0 text-[12px] text-accent">{i.status === 'queued' ? 'Queued' : formatSpeed(i.speed)}</span>
              </div>
              <div className="mt-0.5 mb-1.5 text-[11px] text-fg3">
                {i.totalBytes > 0 ? `${formatBytes(i.downloadedBytes)} / ${formatBytes(i.totalBytes)} · ${Math.round(percent(i))}%` : formatBytes(i.downloadedBytes)}
              </div>
              <ProgressBar value={percent(i)} status={i.status === 'queued' ? 'queued' : 'downloading'} size="xs" />
            </article>
          ))}
          {hidden > 0 && <div className="border-t border-line px-3 py-1.5 text-center text-[11px] text-fg3">+{hidden} more in KELMO</div>}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-[13px] text-fg3">No active downloads</div>
      )}

      <div className="flex gap-2">
        <Row icon={Pause} label="Pause all" onClick={() => act([...running, ...items.filter((i) => i.status === 'queued')], 'pause')} disabled={running.length + queued === 0} />
        <Row icon={Play} label="Resume all" onClick={() => act(paused, 'resume')} disabled={paused.length === 0} />
        <Row icon={Plus} label="Add URL" onClick={() => (adding ? setAdding(false) : void startAdd())} />
      </div>

      {adding && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendLink();
          }}
        >
          <input
            ref={linkRef}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste a link or magnet…"
            spellCheck={false}
            autoFocus
            aria-label="Link to download"
            className="h-9 min-w-0 flex-1 select-text rounded-lg border border-line bg-surface2 px-3 font-mono text-[12px] text-fg outline-none focus:border-accent"
          />
          <button type="submit" className="h-9 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-accent-fg transition hover:brightness-105">Add</button>
        </form>
      )}

      <nav className="flex items-center gap-1 border-t border-line pt-2">
        <ToolButton icon={Layers} label="Queues" onClick={() => go('queue')} />
        <ToolButton icon={FolderOpen} label="Folder" onClick={() => go('folder')} />
        <ToolButton icon={SettingsIcon} label="Settings" onClick={() => go('settings')} />
      </nav>
    </div>
  );
}
