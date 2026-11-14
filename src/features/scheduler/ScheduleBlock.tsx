import type { ScheduleRule } from '@/types';
import { cn } from '@/lib/cn';
import { fromMinutes, type WeekBlock } from '@/services/SchedulerService';
import type { LaidOutBlock } from './layout';
import { ruleStyle } from './layout';

export interface ScheduleBlockProps {
  block: LaidOutBlock;
  rule: ScheduleRule;
  tone: ReturnType<typeof ruleStyle>;
  selected: boolean;
  hourHeight: number;
  dayLabel: string;
  onSelect: () => void;
  onEdit: () => void;
}

function timeRange(b: WeekBlock): string {
  return `${fromMinutes(b.startMin)} – ${b.endMin >= 1440 ? '24:00' : fromMinutes(b.endMin)}`;
}

/** One scheduled window on the weekly grid. */
export function ScheduleBlock({ block, rule, tone, selected, hourHeight, dayLabel, onSelect, onEdit }: ScheduleBlockProps) {
  const top = (block.startMin / 60) * hourHeight;
  const height = Math.max(20, ((block.endMin - block.startMin) / 60) * hourHeight - 2);
  const width = 100 / block.lanes;
  return (
    <button
      type="button"
      data-testid="schedule-block"
      data-rule-id={rule.id}
      aria-pressed={selected}
      aria-label={`${rule.name}, ${dayLabel} ${timeRange(block)}, ${rule.enabled ? 'enabled' : 'disabled'}`}
      onClick={onSelect}
      onDoubleClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEdit();
        }
      }}
      style={{ top, height, left: `calc(${block.lane * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-md border px-1.5 py-1 text-left text-fg transition hover:brightness-110',
        tone.block,
        !rule.enabled && 'border-dashed opacity-50',
        selected && 'z-[5] ring-2 ring-accent ring-offset-1 ring-offset-surface',
        block.continuation && 'rounded-t-none border-t-0',
        block.continues && 'rounded-b-none border-b-0',
      )}
    >
      <span className="truncate text-[12px] font-semibold leading-tight">{rule.name}</span>
      {height > 34 && <span className="tnum truncate text-[11px] leading-tight text-fg2">{timeRange(block)}</span>}
      {!rule.enabled && height > 52 && <span className="mt-auto text-[10px] font-medium uppercase tracking-wide text-fg3">Off</span>}
    </button>
  );
}
