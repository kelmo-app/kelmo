/**
 * DownloadManager — framework-agnostic owner of all download/queue state.
 *
 * It knows nothing about React. The Zustand store subscribes to it and the UI
 * calls its methods through the store. Byte movement is delegated to a
 * `DownloadEngine`, so swapping the mock for a real downloader is a one-line
 * change where the manager is constructed.
 */
import type {
  ActivityEntry,
  Category,
  DownloadItem,
  NewDownloadInput,
  Priority,
  Queue,
  ScheduleRule,
  SpeedSample,
} from '../types/index.ts';
import { categoryFolder, classifyFile, domainOf, fileNameFromUrl, isValidUrl, normalizeCategory } from '../lib/url.ts';
import { uid } from '../lib/id.ts';
import { clamp, GB, MB } from '../lib/format.ts';
import { type DownloadEngine, MockDownloadEngine } from './DownloadEngine.ts';
import { isQueueFinished, moveRelative, pickNextQueued, PRIORITY_RANK, reorderIds, sortIdsByPriority } from './QueueManager.ts';
import { activeRules, effectiveLimits } from './SchedulerService.ts';

export interface ManagerState {
  items: Record<string, DownloadItem>;
  queues: Queue[];
  activity: ActivityEntry[];
  history: SpeedSample[];
  /** increments on every committed change; handy for memoisation and tests */
  rev: number;
}

export interface ManagerConfig {
  /** bytes/second, 0 = unlimited */
  globalBandwidthLimit: number;
  retryAttempts: number;
  defaultFolder: string;
  categoryFolders?: Partial<Record<Category, string>>;
  defaultConnections: number;
  autoCategorize: boolean;
  tempFileBehavior: 'keep' | 'delete-on-cancel' | 'delete-on-failure';
  /** Network and engine settings the real engine applies (the simulated one ignores them). */
  timeoutSec: number;
  userAgent: string;
  proxyMode: 'none' | 'system' | 'manual';
  proxyHost: string;
  proxyPort: number;
  fileAllocation: 'none' | 'sparse' | 'prealloc';
  /** Hash finished files ('off' = only when the person pasted a checksum). Needs an engine that can verify. */
  checksumMode: 'off' | 'SHA256' | 'SHA512' | 'MD5';
  diagnostic: boolean;
  logFolder: string;
  /** Environment signals — a platform service can feed these in later. */
  onBattery: boolean;
  vpnAware: boolean;
  vpnConnected: boolean;
  /** Demo only: pretend to verify checksums. Real engines leave this off (status stays "none"). */
  simulateVerification: boolean;
}

export type ManagerEvent =
  | { type: 'completed'; item: DownloadItem }
  | { type: 'failed'; item: DownloadItem; willRetry: boolean }
  | { type: 'queueFinished'; queue: Queue }
  | { type: 'schedulerStarted'; rule: ScheduleRule }
  | { type: 'verified'; item: DownloadItem }
  | { type: 'checksumMismatch'; item: DownloadItem };

export interface ManagerInit {
  items: DownloadItem[];
  queues: Queue[];
  activity?: ActivityEntry[];
  history?: SpeedSample[];
}

export interface ManagerOptions {
  engine?: DownloadEngine;
  clock?: () => number;
  random?: () => number;
  config?: Partial<ManagerConfig>;
  rules?: ScheduleRule[];
}

export const defaultManagerConfig: ManagerConfig = {
  globalBandwidthLimit: 0,
  retryAttempts: 3,
  defaultFolder: '~/Downloads/KELMO',
  defaultConnections: 8,
  autoCategorize: true,
  tempFileBehavior: 'keep',
  timeoutSec: 30,
  userAgent: '',
  proxyMode: 'system',
  proxyHost: '',
  proxyPort: 8080,
  fileAllocation: 'sparse',
  checksumMode: 'off',
  diagnostic: false,
  logFolder: '',
  onBattery: false,
  vpnAware: false,
  vpnConnected: true,
  simulateVerification: true,
};

type Listener = (state: ManagerState) => void;
type EventListener = (event: ManagerEvent) => void;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MAX_ACTIVITY = 60;
const MAX_HISTORY = 180;
const VERIFY_DELAY_MS = 2500;

export class DownloadManager {
  private state: ManagerState;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private rules: ScheduleRule[];
  private activeRuleIds = new Set<string>();
  private config: ManagerConfig;
  private engine: DownloadEngine;
  private clock: () => number;
  private random: () => number;
  private sampleAcc = 0;

  constructor(init: ManagerInit, opts: ManagerOptions = {}) {
    this.engine = opts.engine ?? new MockDownloadEngine();
    this.clock = opts.clock ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.config = { ...defaultManagerConfig, ...opts.config };
    this.rules = opts.rules ?? [];
    this.state = {
      items: Object.fromEntries(init.items.map((i) => [i.id, { ...i, category: normalizeCategory(i.category, i.fileName) }])),
      queues: init.queues,
      activity: init.activity ?? [],
      history: init.history ?? [],
      rev: 0,
    };
    // Rules that are already open at startup are not "new" — don't announce them.
    this.activeRuleIds = new Set(activeRules(this.rules, new Date(this.clock())).map((r) => r.id));
  }

  // ---------------------------------------------------------------- observation
  getState(): ManagerState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onEvent(fn: EventListener): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  getConfig(): ManagerConfig {
    return this.config;
  }

  setConfig(patch: Partial<ManagerConfig>): void {
    this.config = { ...this.config, ...patch };
    const c = this.config;
    this.engine.configure?.({
      globalBandwidthLimit: c.globalBandwidthLimit,
      retryAttempts: c.retryAttempts,
      timeoutSec: c.timeoutSec,
      userAgent: c.userAgent,
      proxyMode: c.proxyMode,
      proxyHost: c.proxyHost,
      proxyPort: c.proxyPort,
      fileAllocation: c.fileAllocation,
      diagnostic: c.diagnostic,
      logFolder: c.logFolder,
    });
  }

  setRules(rules: ScheduleRule[]): void {
    this.rules = rules;
    // keep "started" detection quiet when rules are edited
    this.activeRuleIds = new Set(activeRules(rules, new Date(this.clock())).map((r) => r.id));
    this.commit({});
  }

  reset(init: ManagerInit): void {
    this.state = {
      items: Object.fromEntries(init.items.map((i) => [i.id, { ...i, category: normalizeCategory(i.category, i.fileName) }])),
      queues: init.queues,
      activity: init.activity ?? [],
      history: init.history ?? [],
      rev: this.state.rev + 1,
    };
    this.notify();
  }

  /** Plain-JSON snapshot for persistence. */
  serialize(): ManagerInit {
    return {
      items: Object.values(this.state.items),
      queues: this.state.queues,
      activity: this.state.activity,
      history: this.state.history.slice(-30),
    };
  }

  // ------------------------------------------------------------------- internals
  private notify(): void {
    for (const l of this.listeners) l(this.state);
  }

  private emit(e: ManagerEvent): void {
    for (const l of this.eventListeners) l(e);
  }

  private commit(patch: Partial<Omit<ManagerState, 'rev'>>): void {
    this.state = { ...this.state, ...patch, rev: this.state.rev + 1 };
    this.notify();
  }

  private log(kind: ActivityEntry['kind'], message: string, itemId?: string, at = this.clock()): ActivityEntry {
    return { id: uid('act'), at, kind, message, itemId };
  }

  private pushActivity(entries: ActivityEntry[]): ActivityEntry[] {
    return [...entries.reverse(), ...this.state.activity].slice(0, MAX_ACTIVITY);
  }

  private queueOf(id: string): Queue | undefined {
    return this.state.queues.find((q) => q.id === id);
  }

  private queueOpen(queue: Queue, date: Date): { open: boolean; bandwidth: number; maxConcurrent: number } {
    const lim = effectiveLimits(queue, this.rules, date);
    let open = lim.open && queue.status === 'running';
    if (queue.pauseOnBattery && this.config.onBattery) open = false;
    if (queue.pauseOnVpnDisconnected && this.config.vpnAware && !this.config.vpnConnected) open = false;
    return { open, bandwidth: lim.bandwidth, maxConcurrent: lim.maxConcurrent };
  }

  /** Start an item if its queue is open; otherwise leave it waiting in the queue. */
  private tryStart(item: DownloadItem, now: number): DownloadItem {
    const queue = this.queueOf(item.queueId);
    const gate = queue ? this.queueOpen(queue, new Date(now)) : { open: false };
    if (!gate.open) return { ...item, status: 'queued', speed: 0, eta: null, forceStart: false };
    this.engine.onStart?.(item);
    return {
      ...item,
      status: 'downloading',
      forceStart: true,
      error: null,
      startedAt: item.startedAt ?? now,
    };
  }

  private stopped(item: DownloadItem, status: DownloadItem['status']): DownloadItem {
    return { ...item, status, speed: 0, eta: null, forceStart: false };
  }

  // ----------------------------------------------------------------- download ops
  addDownload(input: NewDownloadInput): DownloadItem {
    const url = input.url.trim();
    if (!isValidUrl(url)) throw new Error('Enter a valid http, https, ftp or magnet link.');
    const now = this.clock();
    const fileName = input.fileName?.trim() || fileNameFromUrl(url);
    const auto = classifyFile(fileName);
    const category: Category = input.category ?? (this.config.autoCategorize ? auto.category : 'General');
    const fallbackQueue = this.state.queues[0];
    const queue = (input.queueId && this.queueOf(input.queueId)) || fallbackQueue;
    if (!queue) throw new Error('Create a queue before adding downloads.');

    const h = hash(fileName + url);
    const totalBytes = Math.round((60 + (h % 2400)) * MB * (auto.fileType === 'iso' ? 1.6 : 1)); // 60 MB … ~3–5 GB
    const connections = clamp(input.connections ?? this.config.defaultConnections, 1, 16);
    const item: DownloadItem = {
      id: uid('d'),
      fileName,
      url,
      sourceDomain: domainOf(url),
      category,
      fileType: auto.fileType,
      totalBytes: Math.min(totalBytes, 6 * GB),
      downloadedBytes: 0,
      progress: 0,
      speed: 0,
      eta: null,
      status: 'queued',
      priority: input.priority ?? 'normal',
      connections,
      destination: input.destination?.trim() || categoryFolder(category, this.config.defaultFolder, this.config.categoryFolders),
      viaPopup: input.viaPopup,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      checksumStatus: 'pending',
      checksumAlgo: 'SHA256',
      queueId: queue.id,
      peakSpeed: (5 + (h % 17)) * MB,
      speedLimit: input.speedLimit ?? 0,
      referrer: input.referrer,
      cookie: input.cookie,
      userAgent: input.userAgent,
      mirrors: input.mirrors?.length ? input.mirrors.slice(0, 8) : undefined,
      authUser: input.authUser?.trim() || undefined,
      authSecret: input.authUser?.trim() ? input.authSecret || undefined : undefined,
      expectedChecksum: input.expectedChecksum?.trim() || undefined,
      video: input.video,
      retries: 0,
      error: null,
      durationSec: 0,
      simulateFailure: /fail/i.test(url) || undefined,
    };

    const start = input.startNow !== false;
    const placed = start ? this.tryStart(item, now) : this.stopped(item, 'paused');
    const queues = this.state.queues.map((q) => (q.id === queue.id ? { ...q, itemIds: [...q.itemIds, item.id] } : q));
    this.commit({
      items: { ...this.state.items, [item.id]: placed },
      queues,
      activity: this.pushActivity([this.log('added', `${fileName} added to ${queue.name}`, item.id, now)]),
    });
    return placed;
  }

  private patchItem(id: string, fn: (item: DownloadItem, now: number) => DownloadItem | null, activity?: (item: DownloadItem) => ActivityEntry): boolean {
    const item = this.state.items[id];
    if (!item) return false;
    const now = this.clock();
    const next = fn(item, now);
    if (!next) return false;
    this.commit({
      items: { ...this.state.items, [id]: next },
      activity: activity ? this.pushActivity([activity(next)]) : this.state.activity,
    });
    return true;
  }

  pause(id: string): boolean {
    return this.patchItem(
      id,
      (it) => {
        if (it.status !== 'downloading' && it.status !== 'queued') return null;
        this.engine.onPause?.(it);
        return this.stopped(it, 'paused');
      },
      (it) => this.log('paused', `${it.fileName} paused`, it.id),
    );
  }

  resume(id: string): boolean {
    return this.patchItem(
      id,
      (it, now) => {
        if (it.status !== 'paused') return null;
        return this.tryStart(it, now);
      },
      (it) => this.log('resumed', `${it.fileName} resumed`, it.id),
    );
  }

  cancel(id: string): boolean {
    return this.patchItem(
      id,
      (it) => {
        if (it.status === 'completed' || it.status === 'cancelled') return null;
        this.engine.onCancel?.(it);
        const next = this.stopped(it, 'cancelled');
        if (this.config.tempFileBehavior === 'delete-on-cancel') {
          return { ...next, downloadedBytes: 0, progress: 0 };
        }
        return next;
      },
      (it) => this.log('paused', `${it.fileName} cancelled`, it.id),
    );
  }

  retry(id: string): boolean {
    return this.patchItem(
      id,
      (it, now) => {
        if (it.status !== 'failed' && it.status !== 'cancelled') return null;
        return this.tryStart({ ...it, error: null, simulateFailure: false, retries: 0 }, now);
      },
      (it) => this.log('resumed', `Retrying ${it.fileName}`, it.id),
    );
  }

  remove(id: string): boolean {
    const item = this.state.items[id];
    if (!item) return false;
    this.engine.onCancel?.(item);
    const { [id]: _gone, ...rest } = this.state.items;
    void _gone;
    this.commit({
      items: rest,
      queues: this.state.queues.map((q) => (q.itemIds.includes(id) ? { ...q, itemIds: q.itemIds.filter((x) => x !== id) } : q)),
      activity: this.pushActivity([this.log('removed', `${item.fileName} removed`, undefined)]),
    });
    return true;
  }

  removeMany(ids: string[]): number {
    let n = 0;
    for (const id of ids) if (this.remove(id)) n++;
    return n;
  }

  pauseMany(ids: string[]): number {
    return ids.reduce((n, id) => n + (this.pause(id) ? 1 : 0), 0);
  }

  resumeMany(ids: string[]): number {
    return ids.reduce((n, id) => n + (this.resume(id) ? 1 : 0), 0);
  }

  /** Pause every running/queued transfer (optionally scoped to one queue). */
  pauseAll(queueId?: string): number {
    const ids = Object.values(this.state.items)
      .filter((i) => (!queueId || i.queueId === queueId) && (i.status === 'downloading' || i.status === 'queued'))
      .map((i) => i.id);
    return this.pauseMany(ids);
  }

  resumeAll(queueId?: string): number {
    const ids = Object.values(this.state.items)
      .filter((i) => (!queueId || i.queueId === queueId) && i.status === 'paused')
      .map((i) => i.id);
    return this.resumeMany(ids);
  }

  clearCompleted(queueId?: string): number {
    const ids = Object.values(this.state.items)
      .filter((i) => i.status === 'completed' && (!queueId || i.queueId === queueId))
      .map((i) => i.id);
    return this.removeMany(ids);
  }

  setPriority(id: string, priority: Priority): boolean {
    return this.patchItem(id, (it) => (it.priority === priority ? null : { ...it, priority }));
  }

  setConnections(id: string, connections: number): boolean {
    return this.patchItem(id, (it) => ({ ...it, connections: clamp(Math.round(connections), 1, 16) }));
  }

  private queueLimits = new Map<string, number>();

  /** Tell the engine when a queue's speed cap changes (its own limit, or the one of an open schedule window). */
  private syncQueueLimit(queueId: string, bandwidth: number): void {
    const bps = bandwidth > 0 ? bandwidth : 0;
    if ((this.queueLimits.get(queueId) ?? 0) === bps) return;
    this.queueLimits.set(queueId, bps);
    this.engine.onQueueLimit?.(queueId, bps);
  }

  setSpeedLimit(id: string, bytesPerSec: number): boolean {
    const limit = Math.max(0, bytesPerSec);
    const ok = this.patchItem(id, (it) => ({ ...it, speedLimit: limit }));
    if (ok) this.engine.onSpeedLimit?.(this.state.items[id], limit);
    return ok;
  }

  redownload(id: string): DownloadItem | null {
    const it = this.state.items[id];
    if (!it) return null;
    return this.addDownload({
      url: it.url,
      fileName: it.fileName,
      destination: it.destination,
      category: it.category,
      queueId: it.queueId,
      connections: it.connections,
      priority: it.priority,
      startNow: true,
    });
  }

  // ----------------------------------------------------------------- queue ops
  moveToQueue(id: string, queueId: string, index?: number): boolean {
    const item = this.state.items[id];
    const target = this.queueOf(queueId);
    if (!item || !target) return false;
    if (item.queueId === queueId && index === undefined) return false;
    const queues = this.state.queues.map((q) => {
      if (q.id === item.queueId && q.id !== queueId) return { ...q, itemIds: q.itemIds.filter((x) => x !== id) };
      if (q.id === queueId) {
        const without = q.itemIds.filter((x) => x !== id);
        const at = index === undefined ? without.length : clamp(index, 0, without.length);
        without.splice(at, 0, id);
        return { ...q, itemIds: without };
      }
      return q;
    });
    this.commit({
      items: { ...this.state.items, [id]: { ...item, queueId } },
      queues,
      activity: this.pushActivity([this.log('queue', `${item.fileName} moved to ${target.name}`, id)]),
    });
    return true;
  }

  reorder(queueId: string, id: string, toIndex: number): boolean {
    const q = this.queueOf(queueId);
    if (!q || !q.itemIds.includes(id)) return false;
    const itemIds = reorderIds(q.itemIds, id, toIndex);
    if (itemIds.join() === q.itemIds.join()) return false;
    this.commit({ queues: this.state.queues.map((x) => (x.id === queueId ? { ...x, itemIds } : x)) });
    return true;
  }

  reorderRelative(queueId: string, id: string, targetId: string, place: 'before' | 'after'): boolean {
    const q = this.queueOf(queueId);
    if (!q) return false;
    const itemIds = moveRelative(q.itemIds, id, targetId, place);
    if (itemIds.join() === q.itemIds.join()) return false;
    this.commit({ queues: this.state.queues.map((x) => (x.id === queueId ? { ...x, itemIds } : x)) });
    return true;
  }

  reorderByPriority(queueId: string): boolean {
    const q = this.queueOf(queueId);
    if (!q) return false;
    const itemIds = sortIdsByPriority(q.itemIds, this.state.items);
    if (itemIds.join() === q.itemIds.join()) return false;
    this.commit({ queues: this.state.queues.map((x) => (x.id === queueId ? { ...x, itemIds } : x)) });
    return true;
  }

  createQueue(input: Partial<Queue> & { name: string }): Queue {
    const queue: Queue = {
      id: uid('q'),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      status: 'running',
      itemIds: [],
      maxConcurrentDownloads: input.maxConcurrentDownloads ?? 3,
      maxConnectionsPerDownload: input.maxConnectionsPerDownload ?? 8,
      bandwidthLimit: input.bandwidthLimit ?? 0,
      retryFailed: input.retryFailed ?? true,
      autoStartNext: input.autoStartNext ?? true,
      scheduled: input.scheduled ?? false,
      pauseOnBattery: input.pauseOnBattery ?? false,
      pauseOnVpnDisconnected: input.pauseOnVpnDisconnected ?? false,
      createdAt: this.clock(),
      tone: input.tone ?? 'cyan',
    };
    this.commit({
      queues: [...this.state.queues, queue],
      activity: this.pushActivity([this.log('queue', `Queue “${queue.name}” created`)]),
    });
    return queue;
  }

  updateQueue(id: string, patch: Partial<Omit<Queue, 'id' | 'itemIds' | 'createdAt'>>): boolean {
    if (!this.queueOf(id)) return false;
    this.commit({ queues: this.state.queues.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
    return true;
  }

  /** Delete a queue; its downloads move to `moveTo` (default: the first remaining queue). */
  deleteQueue(id: string, moveTo?: string): boolean {
    const q = this.queueOf(id);
    if (!q || this.state.queues.length <= 1) return false;
    const rest = this.state.queues.filter((x) => x.id !== id);
    const dest = rest.find((x) => x.id === moveTo) ?? rest[0];
    const items = { ...this.state.items };
    for (const itemId of q.itemIds) if (items[itemId]) items[itemId] = { ...items[itemId], queueId: dest.id };
    this.commit({
      items,
      queues: rest.map((x) => (x.id === dest.id ? { ...x, itemIds: [...x.itemIds, ...q.itemIds] } : x)),
      activity: this.pushActivity([this.log('queue', `Queue “${q.name}” deleted`)]),
    });
    return true;
  }

  pauseQueue(id: string): boolean {
    const q = this.queueOf(id);
    if (!q || q.status === 'paused') return false;
    this.commit({
      queues: this.state.queues.map((x) => (x.id === id ? { ...x, status: 'paused' } : x)),
      activity: this.pushActivity([this.log('queue', `${q.name} paused`)]),
    });
    return true;
  }

  startQueue(id: string): boolean {
    const q = this.queueOf(id);
    if (!q || q.status === 'running') return false;
    this.commit({
      queues: this.state.queues.map((x) => (x.id === id ? { ...x, status: 'running' } : x)),
      activity: this.pushActivity([this.log('queue', `${q.name} started`)]),
    });
    return true;
  }

  // ------------------------------------------------------------------- the tick
  /** Advance the simulation by `dt` seconds. Call this on an interval. */
  tick(dt: number, now: number = this.clock()): void {
    const date = new Date(now);
    const ctx = { dt, now, random: this.random };
    const items: Record<string, DownloadItem> = { ...this.state.items };
    const newActivity: ActivityEntry[] = [];
    const events: ManagerEvent[] = [];
    let dirty = false;

    // 1) schedule windows opening
    const openNow = activeRules(this.rules, date);
    for (const rule of openNow) {
      if (!this.activeRuleIds.has(rule.id)) {
        const q = this.queueOf(rule.queueId);
        events.push({ type: 'schedulerStarted', rule });
        newActivity.push(this.log('scheduler', `${rule.name} window opened${q ? ` for ${q.name}` : ''}`, undefined, now));
      }
    }
    this.activeRuleIds = new Set(openNow.map((r) => r.id));

    // 2) rebalance: close gates, enforce concurrency, start waiting items
    const gates = new Map<string, { open: boolean; bandwidth: number; maxConcurrent: number }>();
    for (const q of this.state.queues) {
      const gate = this.queueOpen(q, date);
      gates.set(q.id, gate);
      this.syncQueueLimit(q.id, gate.bandwidth);
      const running = q.itemIds.map((id) => items[id]).filter((i) => i && i.status === 'downloading');

      if (!gate.open) {
        for (const it of running) {
          items[it.id] = this.stopped(it, 'queued');
          dirty = true;
        }
        continue;
      }

      const free = running.filter((i) => !i.forceStart);
      const excess = running.length - gate.maxConcurrent;
      if (excess > 0 && free.length > 0) {
        const order = [...free].sort(
          (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || q.itemIds.indexOf(b.id) - q.itemIds.indexOf(a.id),
        );
        for (const it of order.slice(0, Math.min(excess, order.length))) {
          items[it.id] = this.stopped(it, 'queued');
          dirty = true;
        }
      }

      if (q.autoStartNext) {
        const runningNow = q.itemIds.filter((id) => items[id]?.status === 'downloading').length;
        for (const it of pickNextQueued(q, items, gate.maxConcurrent - runningNow)) {
          this.engine.onStart?.(it);
          items[it.id] = { ...it, status: 'downloading', startedAt: it.startedAt ?? now, error: null };
          dirty = true;
        }
      }
    }

    // 3) advance running transfers (queue caps first, then the global cap)
    const speeds = new Map<string, number>();
    for (const q of this.state.queues) {
      const gate = gates.get(q.id);
      if (!gate?.open) continue;
      const running = q.itemIds.map((id) => items[id]).filter((i) => i && i.status === 'downloading');
      const targets = running.map((it) => ({
        id: it.id,
        v: Math.min(this.engine.targetSpeed(it, ctx), it.speedLimit > 0 ? it.speedLimit : Infinity),
      }));
      const sum = targets.reduce((s, t) => s + t.v, 0);
      const factor = gate.bandwidth > 0 && sum > gate.bandwidth ? gate.bandwidth / sum : 1;
      for (const t of targets) speeds.set(t.id, t.v * factor);
    }
    const total = [...speeds.values()].reduce((s, v) => s + v, 0);
    const g = this.config.globalBandwidthLimit;
    const globalFactor = g > 0 && total > g ? g / total : 1;

    const touchedQueues = new Set<string>();
    const toVerify: string[] = [];
    let totalSpeed = 0;
    for (const [id, raw] of speeds) {
      let it = items[id];
      if (!it) continue;
      const meta = this.engine.sync?.(it);
      if (meta) {
        const total = meta.totalBytes && meta.totalBytes > 0 ? meta.totalBytes : it.totalBytes;
        const name = meta.fileName || it.fileName;
        const conns = meta.connections && meta.connections > 0 ? meta.connections : it.connections;
        const resumable = meta.resumable ?? it.resumable;
        if (total !== it.totalBytes || name !== it.fileName || conns !== it.connections || resumable !== it.resumable) {
          const auto = name !== it.fileName ? classifyFile(name) : null;
          it = {
            ...it,
            totalBytes: total,
            fileName: name,
            connections: conns,
            resumable,
            ...(auto && this.config.autoCategorize ? { fileType: auto.fileType } : {}),
          };
          items[id] = it;
          dirty = true;
        }
      }
      const speed = raw * globalFactor;
      const res = this.engine.advance(it, speed, ctx);
      dirty = true;

      if (res.error) {
        const q = this.queueOf(it.queueId);
        const willRetry = !!q?.retryFailed && it.retries < this.config.retryAttempts;
        const failed: DownloadItem = {
          ...it,
          status: willRetry ? 'queued' : 'failed',
          error: willRetry ? null : res.error,
          retries: it.retries + (willRetry ? 1 : 0),
          simulateFailure: false,
          speed: 0,
          eta: null,
          forceStart: false,
          downloadedBytes: this.config.tempFileBehavior === 'delete-on-failure' ? 0 : it.downloadedBytes,
          progress: this.config.tempFileBehavior === 'delete-on-failure' ? 0 : it.progress,
        };
        items[id] = failed;
        events.push({ type: 'failed', item: failed, willRetry });
        newActivity.push(
          this.log('failed', willRetry ? `${it.fileName} failed — retrying (${failed.retries}/${this.config.retryAttempts})` : `${it.fileName} failed: ${res.error}`, id, now),
        );
        continue;
      }

      const downloaded = it.downloadedBytes + res.bytes;
      if (downloaded >= it.totalBytes - 0.5) {
        const completed: DownloadItem = {
          ...it,
          downloadedBytes: it.totalBytes,
          progress: 100,
          speed: 0,
          eta: null,
          status: 'completed',
          completedAt: now,
          durationSec: it.durationSec + dt,
          checksumStatus: this.wantsVerify(it) ? 'verifying' : this.config.simulateVerification ? 'verifying' : 'none',
          forceStart: false,
        };
        if (this.wantsVerify(it)) toVerify.push(id);
        items[id] = completed;
        touchedQueues.add(it.queueId);
        events.push({ type: 'completed', item: completed });
        newActivity.push(this.log('completed', `${it.fileName} downloaded`, id, now));
      } else {
        totalSpeed += speed;
        const remaining = it.totalBytes - downloaded;
        items[id] = {
          ...it,
          downloadedBytes: downloaded,
          progress: (downloaded / it.totalBytes) * 100,
          speed,
          eta: speed > 1 ? remaining / speed : null,
          durationSec: it.durationSec + dt,
        };
      }
    }

    // 4) checksum verification finishing
    for (const id of Object.keys(items)) {
      const it = items[id];
      if (!this.engine.verify && it.checksumStatus === 'verifying' && it.completedAt && now - it.completedAt >= VERIFY_DELAY_MS) {
        const bad = /corrupt/i.test(it.url);
        const next: DownloadItem = { ...it, checksumStatus: bad ? 'mismatch' : 'verified' };
        items[id] = next;
        dirty = true;
        if (!bad) {
          events.push({ type: 'verified', item: next });
          newActivity.push(this.log('verified', `${it.fileName} — ${it.checksumAlgo} verified`, id, now));
        }
      }
    }

    // 5) queue finished?
    for (const qid of touchedQueues) {
      const q = this.queueOf(qid);
      if (q && isQueueFinished(q, items)) {
        events.push({ type: 'queueFinished', queue: q });
        newActivity.push(this.log('queue', `${q.name} finished`, undefined, now));
      }
    }

    // 6) throughput history (1 sample / second)
    this.sampleAcc += dt;
    let history = this.state.history;
    if (this.sampleAcc >= 1) {
      this.sampleAcc = 0;
      history = [...history, { t: now, down: totalSpeed, up: totalSpeed * 0.035 + this.random() * 0.2 * MB }].slice(-MAX_HISTORY);
      dirty = true;
    }

    if (dirty || newActivity.length) {
      this.commit({
        items,
        history,
        activity: newActivity.length ? this.pushActivity(newActivity) : this.state.activity,
      });
    }
    for (const e of events) this.emit(e);
    for (const id of toVerify) void this.startVerify(id);
  }

  /** A real engine can hash the file when it is done: always with a pasted checksum, otherwise if the setting asks for it. */
  private wantsVerify(it: DownloadItem): boolean {
    return !!this.engine.verify && (!!it.expectedChecksum || this.config.checksumMode !== 'off');
  }

  private async startVerify(id: string): Promise<void> {
    const it = this.state.items[id];
    if (!it || !this.engine.verify) return;
    let result: Awaited<ReturnType<NonNullable<DownloadEngine['verify']>>> = null;
    try {
      result = await this.engine.verify(it, { algo: this.config.checksumMode === 'off' ? 'SHA256' : this.config.checksumMode, expected: it.expectedChecksum ?? '' });
    } catch {
      result = null;
    }
    const cur = this.state.items[id];
    if (!cur) return; // removed while hashing
    const now = this.clock();
    if (!result) {
      // the file could not be read (moved or deleted): say nothing was checked rather than guessing
      this.commit({ items: { ...this.state.items, [id]: { ...cur, checksumStatus: 'none' } } });
      return;
    }
    const algo = (result.algo === 'MD5' || result.algo === 'SHA1' || result.algo === 'SHA512' ? result.algo : 'SHA256') as DownloadItem['checksumAlgo'];
    const status = result.match === null ? 'computed' : result.match ? 'verified' : 'mismatch';
    const next: DownloadItem = { ...cur, checksumStatus: status, checksumAlgo: algo, checksum: result.hash };
    const message =
      status === 'mismatch' ? `${cur.fileName} — ${algo} does NOT match the checksum you gave` : status === 'verified' ? `${cur.fileName} — ${algo} verified` : `${cur.fileName} — ${algo} ${result.hash.slice(0, 12)}…`;
    this.commit({ items: { ...this.state.items, [id]: next }, activity: this.pushActivity([this.log('verified', message, id, now)]) });
    if (status === 'verified') this.emit({ type: 'verified', item: next });
    else if (status === 'mismatch') this.emit({ type: 'checksumMismatch', item: next });
  }
}
