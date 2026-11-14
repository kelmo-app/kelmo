import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, Copy, FolderOpen, Gauge, Pause, Play, RotateCcw, Settings2, Download, X } from 'lucide-react';
import type { ConnectionDetail, PopupItem } from '@/types/global';
import { cn } from '@/lib/cn';
import { formatBytes, formatEta, formatSpeed } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Fields';
import { AFTER_ALL_OPTIONS } from '@/lib/afterAll';
import type { AfterAllMode } from '@/types';
import { ART_LABEL, artKind } from './fileArt';
import { FileArt } from './FileArt';
import { ConnectionTable, SegmentBar } from './ConnectionPanel';
import { fullPath, percentOf, progressRows, statusText } from './popupLogic';

export type ProgressTab = 'status' | 'limit' | 'after';
export type ProgressAction = 'pause' | 'resume' | 'cancel' | 'limit' | 'after' | 'afterAll';

export interface ProgressViewProps {
  item: PopupItem;
  detail: ConnectionDetail | null;
  history: Record<number, number[]>;
  showDetails: boolean;
  tab: ProgressTab;
  limitOn: boolean;
  limitKb: number;
  showDone: boolean;
  afterAll: AfterAllMode;
  onTab: (t: ProgressTab) => void;
  onToggleDetails: () => void;
  onAction: (action: ProgressAction, value?: number | string) => void;
  onLimit: (on: boolean, kb: number) => void;
  onShowDone: (v: boolean) => void;
  onOpenFolder: () => void;
  onCopyLink: () => void;
  onClose: () => void;
}

function Fact({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Icon size={20} strokeWidth={1.7} className="shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 leading-tight">
        <p className="tnum truncate text-[15px] font-semibold text-fg">{value}</p>
        <p className="text-xs text-fg3">{label}</p>
      </div>
    </div>
  );
}

function Row({ k, children, tone }: { k: string; children: ReactNode; tone?: 'ok' | 'bad' }) {
  return (
    <>
      <dt className="text-fg3">{k}</dt>
      <dd className={cn('min-w-0 truncate', tone === 'ok' && 'font-medium text-ok', tone === 'bad' && 'font-medium text-bad')}>{children}</dd>
    </>
  );
}

/** IDM's running-download window, restyled: art, facts, one big bar, and (optionally) every connection. */
export function ProgressView(p: ProgressViewProps) {
  const { item } = p;
  const pct = percentOf(item);
  const rows = progressRows(item);
  const kind = artKind(item.fileName);
  const paused = item.status === 'paused';
  const failed = item.status === 'failed';
  const finished = item.status === 'completed' || item.status === 'cancelled';
  const running = item.status === 'downloading';
  const tab = (t: ProgressTab, label: string, Icon: typeof Gauge) => (
    <button
      type="button"
      onClick={() => p.onTab(t)}
      className={cn(
        'flex items-center gap-2 rounded-t-lg border border-b-0 px-3.5 py-2 text-[13px] transition',
        p.tab === t ? 'border-line bg-surface font-medium text-fg' : 'border-transparent text-fg3 hover:text-fg',
      )}
    >
      <Icon size={15} aria-hidden /> {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 [&>*]:shrink-0" data-testid="progress-view">
      <div className="-mb-3 flex gap-1 border-b border-line">
        {tab('status', 'Download status', Download)}
        {tab('limit', 'Speed limiter', Gauge)}
        {tab('after', 'On completion', Settings2)}
      </div>

      <section className="rounded-b-lg rounded-tr-lg border border-t-0 border-line bg-surface p-4 text-[13px]">
        {p.tab === 'status' && (
          <div className="flex gap-4">
            <FileArt kind={kind} size={112} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold text-fg" title={item.fileName}>
                {item.fileName || 'Connecting…'}
              </p>
              <p className="truncate font-mono text-xs text-fg3" title={fullPath(item)}>
                {fullPath(item)}
              </p>
              <dl className="mt-3 grid grid-cols-[128px_1fr] gap-y-1">
                <Row k="Status" tone={failed ? 'bad' : running ? 'ok' : undefined}>
                  {statusText(item)}
                </Row>
                <Row k="Category">{ART_LABEL[kind]}</Row>
                <Row k="File size">{rows.size}</Row>
                <Row k="Downloaded">{rows.downloaded}</Row>
                <Row k="Transfer rate">{rows.rate}</Row>
                <Row k="Time left">{rows.left}</Row>
                <Row k="Resume capability">{rows.resume}</Row>
              </dl>
            </div>
          </div>
        )}
        {p.tab === 'limit' && (
          <div className="flex flex-col gap-3">
            <Checkbox checked={p.limitOn} onCheckedChange={(on) => p.onLimit(on, p.limitKb)} label="Use speed limiter for this download" />
            <label className="flex items-center gap-2">
              Limit to
              <input
                type="number"
                min={1}
                className="h-8 w-28 rounded-md border border-line bg-surface2 px-2 text-sm text-fg"
                value={p.limitKb}
                onChange={(e) => p.onLimit(p.limitOn, Math.max(1, Number(e.target.value) || 1))}
                aria-label="Speed limit in KB per second"
              />
              KB/s <span className="text-fg3">(≈ {(p.limitKb / 1024).toFixed(2)} MB/s)</span>
            </label>
            <p className="text-xs text-fg3">Applies right away. Other downloads are not affected.</p>
          </div>
        )}
        {p.tab === 'after' && (
          <div className="flex flex-col gap-2.5">
            <p className="text-fg3">When this download finishes:</p>
            {(['none', 'file', 'folder'] as const).map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="after" checked={item.afterOpen === m} onChange={() => p.onAction('after', m)} className="accent-[rgb(var(--accent))]" />
                {m === 'none' ? 'Do nothing' : m === 'file' ? 'Open the file' : 'Open the folder'}
              </label>
            ))}
            <Checkbox checked={p.showDone} onCheckedChange={p.onShowDone} label="Show the “Download complete” window" />
            <div className="mt-1 border-t border-line pt-3">
              <p className="mb-1.5 text-fg3">When <b className="font-medium text-fg">all</b> downloads have finished:</p>
              {AFTER_ALL_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 py-0.5">
                  <input type="radio" name="afterAll" checked={p.afterAll === o.value} onChange={() => p.onAction('afterAll', o.value)} className="accent-[rgb(var(--accent))]" />
                  {o.label}
                </label>
              ))}
              {p.afterAll === 'sleep' || p.afterAll === 'shutdown' ? <p className="mt-1.5 text-xs text-fg3">You get 60 seconds to press Cancel before anything happens.</p> : null}
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center gap-4">
        <div className="h-3.5 flex-1 overflow-hidden rounded-full border border-line bg-surface2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Download progress">
          <div className={cn('h-full rounded-full transition-[width] duration-300', failed ? 'bg-bad' : paused ? 'bg-warn' : 'bg-accent')} style={{ width: `${pct}%` }} />
        </div>
        <span className="tnum min-w-[96px] text-right text-[26px] font-semibold leading-none text-accent">{pct.toFixed(2)}%</span>
      </div>

      <div className="flex items-center gap-5">
        <Fact icon={Gauge} label="Current speed" value={running && item.speed > 0 ? formatSpeed(item.speed) : '—'} />
        <Fact icon={Download} label="Time left" value={running && item.eta != null ? formatEta(item.eta) : '—'} />
        <Fact icon={Copy} label="Downloaded" value={`${formatBytes(item.downloadedBytes)}${item.totalBytes ? ` / ${formatBytes(item.totalBytes)}` : ''}`} />
        <div className="ml-auto flex gap-2">
          {!finished && !failed && (
            <Button variant="primary" onClick={() => p.onAction(paused ? 'resume' : 'pause')} icon={paused ? <Play size={15} /> : <Pause size={15} />}>
              {paused ? 'Resume' : 'Pause'}
            </Button>
          )}
          {failed && (
            <Button variant="primary" onClick={() => p.onAction('resume')} icon={<RotateCcw size={15} />}>
              Retry
            </Button>
          )}
          <Button
            onClick={() => {
              if (!finished) p.onAction('cancel');
              p.onClose();
            }}
            icon={<X size={15} />}
          >
            {finished ? 'Close' : 'Cancel'}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={p.onToggleDetails} icon={p.showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />} aria-expanded={p.showDetails}>
          {p.showDetails ? 'Hide details' : 'Show details'}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] text-fg3">
            {item.resumable === false ? 'Single connection — this server does not allow splitting the file' : `Progress by connection${p.detail?.workers.length ? ` (${p.detail.workers.length})` : ''}`}
          </p>
          <SegmentBar detail={p.detail} total={item.totalBytes} />
        </div>
      </div>

      {p.showDetails && <ConnectionTable detail={p.detail} history={p.history} />}

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button size="sm" onClick={p.onOpenFolder} icon={<FolderOpen size={14} />}>
          Open folder
        </Button>
        <Button size="sm" onClick={p.onCopyLink} icon={<Copy size={14} />}>
          Copy link
        </Button>
      </div>
    </div>
  );
}
