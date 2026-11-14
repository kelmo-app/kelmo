import type { ConnectionDetail } from '@/types/global';
import { formatBytes, formatSpeed } from '@/lib/format';
import { segmentBar, sparkPoints, WORKER_STATE } from './popupLogic';

/** IDM's "start positions and download progress by connections": the file as one bar, filled where data has arrived. */
export function SegmentBar({ detail, total }: { detail: ConnectionDetail | null; total: number }) {
  const { filled, marks } = segmentBar(detail?.segments ?? [], total);
  return (
    <div
      className="relative h-3.5 w-full overflow-hidden rounded-md border border-line bg-surface2"
      role="img"
      aria-label="Download progress by part of the file"
      data-testid="segment-bar"
    >
      {filled.map((c, i) => (
        <span key={i} className="absolute inset-y-0 bg-accent" style={{ left: `${c.left}%`, width: `${Math.max(c.width, 0.3)}%` }} />
      ))}
      {marks.map((m, i) => (
        <span key={i} className="absolute inset-y-0 w-px bg-bg/80" style={{ left: `${m}%` }} />
      ))}
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  return (
    <svg viewBox="0 0 90 18" width="90" height="18" aria-hidden className="text-accent">
      <polyline points={sparkPoints(values, 90, 18)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** One row per connection: what it has downloaded, what it is doing, how fast, and a small speed graph. */
export function ConnectionTable({ detail, history }: { detail: ConnectionDetail | null; history: Record<number, number[]> }) {
  const workers = detail?.workers ?? [];
  const most = Math.max(1, ...workers.map((w) => w.bytes));
  const multi = workers.some((w) => w.host);
  return (
    <div className="max-h-[170px] overflow-auto rounded-md border border-line" data-testid="connection-table">
      <table className="w-full table-fixed border-collapse text-left text-[12.5px]">
        <thead className="sticky top-0 bg-surface text-fg3">
          <tr>
            <th className="w-9 px-2 py-1.5 font-medium">#</th>
            <th className="w-[92px] px-2 py-1.5 font-medium">Downloaded</th>
            <th className="px-2 py-1.5 font-medium">Share</th>
            {multi && <th className="w-[120px] px-2 py-1.5 font-medium">Source</th>}
            <th className="w-[128px] px-2 py-1.5 font-medium">Current state</th>
            <th className="w-[84px] px-2 py-1.5 font-medium">Speed</th>
            <th className="w-[104px] px-2 py-1.5 font-medium">Graph</th>
          </tr>
        </thead>
        <tbody>
          {workers.length === 0 && (
            <tr>
              <td colSpan={multi ? 7 : 6} className="px-2 py-4 text-center text-fg3">
                Waiting for connections…
              </td>
            </tr>
          )}
          {workers.map((w) => (
            <tr key={w.n} className="border-t border-line/60">
              <td className="tnum px-2 py-1 text-fg3">{w.n}</td>
              <td className="tnum px-2 py-1 text-fg">{formatBytes(w.bytes)}</td>
              <td className="px-2 py-1">
                <div className="h-1.5 overflow-hidden rounded bg-surface2">
                  <div className="h-full rounded bg-accent/80" style={{ width: `${(w.bytes / most) * 100}%` }} />
                </div>
              </td>
              {multi && <td className="truncate px-2 py-1 text-fg2" title={w.host}>{w.host}</td>}
              <td className={`truncate px-2 py-1 ${w.state === 'failed' ? 'text-bad' : w.state === 'retrying' ? 'text-warn' : 'text-fg2'}`}>{WORKER_STATE[w.state] ?? w.state}</td>
              <td className="tnum px-2 py-1 text-fg2">{w.state === 'receiving' && w.speed > 0 ? formatSpeed(w.speed) : '—'}</td>
              <td className="px-2 py-1">
                <Spark values={history[w.n] ?? []} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
