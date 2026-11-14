import { DownloadManager, type ManagerEvent } from '../services/DownloadManager.ts';
import { createSeed, mulberry32 } from '../data/seed.ts';

/** Thursday 22 Oct 2026, 13:02 local — no schedule window is open at this time. */
export const NOW = new Date(2026, 9, 22, 13, 2, 0).getTime();

export interface Harness {
  manager: DownloadManager;
  events: ManagerEvent[];
  clock: { now: number };
  /** advance simulated time by `seconds` in 0.5s ticks */
  run: (seconds: number) => void;
}

export function makeHarness(start = NOW): Harness {
  const seed = createSeed(start);
  const clock = { now: start };
  const manager = new DownloadManager(
    { items: seed.items, queues: seed.queues, activity: seed.activity, history: seed.history },
    { clock: () => clock.now, random: mulberry32(7), rules: seed.rules },
  );
  const events: ManagerEvent[] = [];
  manager.onEvent((e) => events.push(e));
  return {
    manager,
    events,
    clock,
    run(seconds: number) {
      const steps = Math.round(seconds / 0.5);
      for (let i = 0; i < steps; i++) {
        clock.now += 500;
        manager.tick(0.5, clock.now);
      }
    },
  };
}
