/**
 * Application singletons: the manager, plus the React stores bound to it.
 * This is the one composition root — swap `MockDownloadEngine` for a real
 * engine here and nothing else needs to change.
 */
import { DownloadManager, type ManagerConfig, type ManagerInit } from '@/services/DownloadManager';
import { MockDownloadEngine, type DownloadEngine } from '@/services/DownloadEngine';
import { RealDownloadEngine } from '@/services/RealDownloadEngine';
import { createSeed } from '@/data/seed';
import { storage } from '@/services/StorageService';
import type { Settings } from '@/types';
import { effectiveLimit } from '@/lib/bandwidthPlan';
import { createDownloadStore } from './downloadStore';
import { useSchedulerStore } from './schedulerStore';
import { useSettingsStore } from './settingsStore';

export function configFromSettings(s: Settings, now: Date = new Date()): Partial<ManagerConfig> {
  return {
    // the planner may lower (or lift) the default limit for the current time of day
    globalBandwidthLimit: effectiveLimit(s.bandwidthPlan, s.bandwidthLimit, now).limit,
    retryAttempts: s.retryAttempts,
    defaultFolder: s.defaultFolder,
    categoryFolders: s.categoryFolders,
    defaultConnections: s.maxConnections,
    autoCategorize: s.autoCategorize,
    tempFileBehavior: s.tempFileBehavior,
    timeoutSec: s.network.timeoutSec,
    userAgent: s.network.userAgent,
    proxyMode: s.network.proxyMode,
    proxyHost: s.network.proxyHost,
    proxyPort: s.network.proxyPort,
    fileAllocation: s.fileAllocation,
    checksumMode: s.checksumMode,
    diagnostic: s.diagnosticMode,
    logFolder: s.logFolder,
    vpnAware: s.network.vpnAwareness,
    simulateVerification: !isLive,
  };
}

/**
 * Inside Electron the real engine (engine/download.mjs, via the preload bridge) moves
 * the bytes and the workspace starts empty. In a plain browser (dev:web, tests)
 * the simulated engine and demo data are used.
 */
export const isLive = typeof window !== 'undefined' && !!window.kelmo?.engine;

/** localStorage key for the persisted workspace — live and demo data never mix. */
export const STATE_KEY = isLive ? 'state:live' : 'state';

function createEngine(): DownloadEngine {
  return isLive && window.kelmo ? new RealDownloadEngine(window.kelmo.engine) : new MockDownloadEngine();
}

function loadInitial(): ManagerInit {
  const saved = storage.read<ManagerInit | null>(STATE_KEY, null);
  if (saved && Array.isArray(saved.items) && Array.isArray(saved.queues) && saved.queues.length > 0) return saved;
  const seed = createSeed();
  // Live mode starts with your queues but none of the fake downloads.
  if (isLive) return { items: [], queues: seed.queues.map((q) => ({ ...q, itemIds: [] })), activity: [], history: [] };
  return { items: seed.items, queues: seed.queues, activity: seed.activity, history: seed.history };
}

export const manager = new DownloadManager(loadInitial(), {
  engine: createEngine(),
  config: configFromSettings(useSettingsStore.getState().settings),
  rules: useSchedulerStore.getState().rules,
});

export const useDownloadStore = createDownloadStore(manager);

/** Reset the workspace: demo data in the browser, an empty one in the desktop app. */
export function resetDemoData(): void {
  const seed = createSeed();
  manager.reset(
    isLive
      ? { items: [], queues: seed.queues.map((q) => ({ ...q, itemIds: [] })), activity: [], history: [] }
      : { items: seed.items, queues: seed.queues, activity: seed.activity, history: seed.history },
  );
  useSchedulerStore.getState().resetRules();
  manager.setRules(useSchedulerStore.getState().rules);
  storage.remove(STATE_KEY);
}
