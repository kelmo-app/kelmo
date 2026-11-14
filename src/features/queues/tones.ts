import type { Queue } from '@/types';

export const QUEUE_TONES: Record<Queue['tone'], { dot: string; text: string; soft: string; label: string }> = {
  cyan: { dot: 'bg-accent', text: 'text-accent', soft: 'bg-accent/12', label: 'Accent' },
  amber: { dot: 'bg-accent2', text: 'text-accent2', soft: 'bg-accent2/14', label: 'Copper' },
  violet: { dot: 'bg-c-violet', text: 'text-c-violet', soft: 'bg-c-violet/12', label: 'Violet' },
  green: { dot: 'bg-c-green', text: 'text-c-green', soft: 'bg-c-green/12', label: 'Green' },
  slate: { dot: 'bg-c-slate', text: 'text-c-slate', soft: 'bg-c-slate/12', label: 'Slate' },
};
