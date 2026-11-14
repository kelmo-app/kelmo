import { Pause, Play, Trash2, X } from 'lucide-react';
import { pluralize } from '@/lib/format';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { requestRemove } from '@/hooks/useShortcuts';
import { Button } from '@/components/ui/Button';

/** Appears when one or more rows are ticked. */
export function BulkBar({ ids }: { ids: string[] }) {
  const pauseMany = useDownloadStore((s) => s.pauseMany);
  const resumeMany = useDownloadStore((s) => s.resumeMany);
  const clear = useUiStore((s) => s.clearSelection);
  const toast = useUiStore((s) => s.toast);
  if (ids.length === 0) return null;
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-line bg-accent/[0.07] px-5 py-2.5" data-testid="bulk-bar">
      <p className="mr-2 text-[13px] font-medium text-fg" aria-live="polite">
        {pluralize(ids.length, 'download')} selected
      </p>
      <Button
        size="sm"
        variant="secondary"
        icon={<Pause size={14} />}
        onClick={() => {
          pauseMany(ids);
          toast({ tone: 'info', title: 'Paused', description: pluralize(ids.length, 'download') }, 2200);
        }}
      >
        Pause
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={<Play size={14} />}
        onClick={() => {
          resumeMany(ids);
          toast({ tone: 'info', title: 'Resumed', description: pluralize(ids.length, 'download') }, 2200);
        }}
      >
        Resume
      </Button>
      <Button size="sm" variant="outline" className="text-bad hover:bg-bad/10" icon={<Trash2 size={14} />} onClick={() => requestRemove(ids)}>
        Delete
      </Button>
      <Button size="sm" variant="ghost" className="ml-auto" icon={<X size={14} />} onClick={clear}>
        Clear selection
      </Button>
    </div>
  );
}
