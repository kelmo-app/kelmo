import type { AfterAllMode } from '@/types';

export const AFTER_ALL_OPTIONS: Array<{ value: AfterAllMode; label: string }> = [
  { value: 'none', label: 'Do nothing' },
  { value: 'quit', label: 'Quit KDM' },
  { value: 'sleep', label: 'Put the computer to sleep' },
  { value: 'shutdown', label: 'Shut the computer down' },
];

export interface AfterAllWatch {
  prev: Record<string, string>;
  /** a download finished since the action was armed */
  sawDone: boolean;
}

export const freshWatch = (items: Array<{ id: string; status: string }>): AfterAllWatch => ({
  prev: Object.fromEntries(items.map((i) => [i.id, i.status])),
  sawDone: false,
});

/**
 * Called on every change of the download list. `fire` becomes true once something finished since the
 * action was armed AND nothing is transferring or waiting any more. Pausing everything never fires it.
 */
export function stepAfterAll(w: AfterAllWatch, items: Array<{ id: string; status: string }>): { watch: AfterAllWatch; fire: boolean } {
  let sawDone = w.sawDone;
  const prev: Record<string, string> = {};
  for (const i of items) {
    if (i.status === 'completed' && w.prev[i.id] && w.prev[i.id] !== 'completed') sawDone = true;
    prev[i.id] = i.status;
  }
  const busy = items.some((i) => i.status === 'downloading' || i.status === 'queued');
  return { watch: { prev, sawDone }, fire: sawDone && !busy };
}
