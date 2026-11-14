import type { WeekBlock } from '@/services/SchedulerService';

export interface LaidOutBlock extends WeekBlock {
  /** 0-based horizontal lane inside its overlap cluster */
  lane: number;
  /** how many lanes the cluster has — block width is 1/lanes */
  lanes: number;
}

/**
 * Places overlapping blocks of ONE day side by side (like a calendar app).
 * Blocks that don't overlap anything keep the full column width.
 */
export function layoutDayBlocks(blocks: WeekBlock[]): LaidOutBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: LaidOutBlock[] = [];
  let cluster: LaidOutBlock[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const b of cluster) b.lanes = lanes;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const block of sorted) {
    if (cluster.length > 0 && block.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= block.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.endMin);
    } else {
      laneEnds[lane] = block.endMin;
    }
    cluster.push({ ...block, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, block.endMin);
  }
  flush();
  return out;
}

/** Tailwind class sets for rule colours (static strings so Tailwind keeps them). */
export const RULE_STYLES = [
  { block: 'border-accent/55 bg-accent/[0.16]', chip: 'bg-accent', text: 'text-accent' },
  { block: 'border-accent2/55 bg-accent2/[0.16]', chip: 'bg-accent2', text: 'text-accent2' },
  { block: 'border-c-violet/55 bg-c-violet/[0.16]', chip: 'bg-c-violet', text: 'text-c-violet' },
  { block: 'border-c-blue/55 bg-c-blue/[0.16]', chip: 'bg-c-blue', text: 'text-c-blue' },
  { block: 'border-c-green/55 bg-c-green/[0.16]', chip: 'bg-c-green', text: 'text-c-green' },
  { block: 'border-c-teal/55 bg-c-teal/[0.16]', chip: 'bg-c-teal', text: 'text-c-teal' },
] as const;

export function ruleStyle(index: number) {
  return RULE_STYLES[((index % RULE_STYLES.length) + RULE_STYLES.length) % RULE_STYLES.length];
}
