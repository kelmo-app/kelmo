import type { DownloadItem } from '@/types';
import { formatBytes, formatDateTime, formatDuration } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';
import { CategoryBadge, ChecksumBadge } from '@/components/Badges';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { LibraryActions } from './LibraryActions';

export function LibraryTable({ items }: { items: DownloadItem[] }) {
  const openDetail = useUiStore((s) => s.openDetail);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-[13px]">
        <caption className="sr-only">Completed downloads</caption>
        <thead>
          <tr className="border-y border-line text-[12px] text-fg3">
            <th scope="col" className="px-5 py-2.5 font-medium">Name</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Folder</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Completed</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Size</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Duration</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Checksum</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Source</th>
            <th scope="col" className="px-5 py-2.5 text-right font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} data-testid="library-row" className="border-b border-line/60 transition-colors last:border-b-0 hover:bg-surface2/70">
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3">
                  <FileTypeIcon type={it.fileType} category={it.category} size="sm" />
                  <div className="min-w-0">
                    <button type="button" onClick={() => openDetail(it.id)} className="block max-w-[320px] truncate rounded text-left font-medium text-fg hover:text-accent" title={it.fileName}>
                      {it.fileName}
                    </button>
                    <CategoryBadge category={it.category} className="mt-0.5" />
                  </div>
                </div>
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-fg2" title={it.destination}>{it.destination}</td>
              <td className="tnum whitespace-nowrap px-3 py-2.5 text-fg2">{it.completedAt ? formatDateTime(it.completedAt) : '—'}</td>
              <td className="tnum whitespace-nowrap px-3 py-2.5 text-fg">{formatBytes(it.totalBytes)}</td>
              <td className="tnum whitespace-nowrap px-3 py-2.5 text-fg2">{formatDuration(it.durationSec)}</td>
              <td className="px-3 py-2.5"><ChecksumBadge status={it.checksumStatus} algo={it.checksumAlgo} /></td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-fg2">{it.sourceDomain}</td>
              <td className="px-5 py-2.5"><div className="flex justify-end"><LibraryActions item={it} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
