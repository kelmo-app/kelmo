import { useEffect, useState, type ReactNode } from 'react';
import { HeartPulse, FolderOpen, Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isMagnetUrl } from '@/lib/url';
import { describeHealth, type HealthReport } from '@/lib/linkHealth';
import { headersFor } from '@/services/RealDownloadEngine';
import type { DownloadItem } from '@/types';
import { formatBytes, pluralize } from '@/lib/format';
import { platform } from '@/services/platform';
import { ProgressBar } from '@/components/ProgressBar';
import { ChecksumBadge } from '@/components/Badges';
import { Button } from '@/components/ui/Button';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 leading-tight">
      <p className="text-[10.5px] uppercase tracking-wide text-fg3">{label}</p>
      <p className="tnum truncate text-[13px] font-medium text-fg">{children}</p>
    </div>
  );
}

/** Thin strip under the list: facts about the selected download. Only real data — nothing invented. */
export function SimpleDetail({ item, selectedCount }: { item: DownloadItem | null; selectedCount: number }) {
  if (selectedCount > 1) {
    return (
      <div className="flex h-[58px] shrink-0 items-center border-t border-line bg-surface px-4 text-[13px] text-fg2" data-testid="simple-detail">
        {pluralize(selectedCount, 'download')} selected
      </div>
    );
  }
  if (!item) {
    return (
      <div className="flex h-[58px] shrink-0 items-center border-t border-line bg-surface px-4 text-[13px] text-fg3" data-testid="simple-detail">
        Select a download to see its details. Double-click for everything.
      </div>
    );
  }
  return <Selected item={item} />;
}

function Selected({ item }: { item: DownloadItem }) {
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  useEffect(() => setReport(null), [item.id]);

  const check = async () => {
    if (isMagnetUrl(item.url) || /\.torrent(\?|#|$)/i.test(item.url)) {
      setReport({ state: 'alive', tone: 'ok', title: 'Torrent', detail: 'No server to ask: speed depends on how many peers (seeders) are online. Watch the Connections number once it starts.' });
      return;
    }
    setChecking(true);
    setReport(null);
    const raw = await platform.checkLink(item.url, headersFor(item), { authUser: item.authUser, authSecret: item.authSecret });
    setChecking(false);
    setReport(raw
      ? describeHealth(raw, { fileName: item.fileName, totalBytes: item.totalBytes, downloadedBytes: item.downloadedBytes })
      : { state: 'offline', tone: 'warn', title: 'Desktop app only', detail: 'Link checks run in the KDM desktop app.' });
  };

  const path = `${item.destination.replace(/\/+$/, '')}/${item.fileName}`;
  const running = item.status === 'downloading';
  return (
    <div className="flex h-[58px] shrink-0 items-center gap-6 border-t border-line bg-surface px-4" data-testid="simple-detail">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-fg" title={item.fileName}>
          {item.fileName}
        </p>
        {report ? (
          <p className={cn('truncate text-xs', report.tone === 'ok' ? 'text-ok' : report.tone === 'warn' ? 'text-warn' : 'text-bad')} title={report.detail} role="status">
            <span className="font-semibold">{report.title}</span> — {report.detail}
          </p>
        ) : (
          <p className="truncate text-xs text-fg3" title={path}>
            {path}
          </p>
        )}
      </div>
      <Fact label="Downloaded">
        {formatBytes(item.downloadedBytes)}
        {item.totalBytes ? ` of ${formatBytes(item.totalBytes)}` : ''}
      </Fact>
      <Fact label="Resume">{item.resumable === undefined ? '—' : item.resumable ? 'Yes' : 'No'}</Fact>
      <Fact label="Connections">{running && item.connections > 0 ? item.connections : '—'}</Fact>
      {item.status === 'completed' && item.checksumStatus !== 'none' && item.checksumStatus !== 'pending' && (
        <button
          type="button"
          className="shrink-0 text-left leading-tight"
          title={item.checksum ? `${item.checksumAlgo}: ${item.checksum}\nClick to copy` : undefined}
          onClick={() => item.checksum && void navigator.clipboard?.writeText(item.checksum).catch(() => {})}
        >
          <p className="text-[10.5px] uppercase tracking-wide text-fg3">Checksum</p>
          <ChecksumBadge status={item.checksumStatus} algo={item.checksumAlgo} />
        </button>
      )}
      <div className="w-40 shrink-0">
        <ProgressBar value={item.progress} status={item.status} showValue label="Selected download progress" />
      </div>
      {item.status !== 'completed' && (
        <Button size="sm" variant="secondary" disabled={checking} icon={checking ? <Loader2 size={14} className="animate-spin" /> : <HeartPulse size={14} />} onClick={() => void check()} title="Ask the server if this link still works">
          Check link
        </Button>
      )}
      {item.status === 'completed' && (
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => void platform.openPath(path)}>
            Open
          </Button>
          <Button size="sm" variant="secondary" icon={<FolderOpen size={14} />} onClick={() => void platform.showInFolder(path)}>
            Open folder
          </Button>
        </div>
      )}
    </div>
  );
}
