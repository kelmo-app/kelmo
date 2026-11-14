import type { DownloadItem } from '@/types';
import { formatBytes, formatDate, formatDuration } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';
import { ChecksumBadge } from '@/components/Badges';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { LibraryActions } from './LibraryActions';

export function LibraryGrid({ items }: { items: DownloadItem[] }) {
  const openDetail = useUiStore((s) => s.openDetail);
  return (
    <ul className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((it) => (
        <li key={it.id} data-testid="library-card" className="flex flex-col gap-3 rounded-xl border border-line bg-surface2/50 p-4 transition hover:border-accent/40 hover:bg-surface2">
          <div className="flex items-start gap-3">
            <FileTypeIcon type={it.fileType} category={it.category} size="lg" />
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => openDetail(it.id)} className="block max-w-full truncate rounded text-left text-[14px] font-medium text-fg hover:text-accent" title={it.fileName}>
                {it.fileName}
              </button>
              <p className="truncate text-[12px] text-fg3">{it.sourceDomain}</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-[12px]">
            <div><dt className="text-fg3">Size</dt><dd className="tnum font-medium text-fg">{formatBytes(it.totalBytes)}</dd></div>
            <div><dt className="text-fg3">Took</dt><dd className="tnum font-medium text-fg">{formatDuration(it.durationSec)}</dd></div>
            <div><dt className="text-fg3">Done</dt><dd className="tnum font-medium text-fg">{it.completedAt ? formatDate(it.completedAt) : '—'}</dd></div>
          </dl>
          <p className="truncate text-[12px] text-fg3" title={it.destination}>{it.destination}</p>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
            <ChecksumBadge status={it.checksumStatus} algo={it.checksumAlgo} />
            <LibraryActions item={it} />
          </div>
        </li>
      ))}
    </ul>
  );
}
