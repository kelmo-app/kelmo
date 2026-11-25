/**
 * DownloadEngine — the seam between KELMO and whatever actually moves bytes.
 *
 * The UI and DownloadManager only talk to this interface. `MockDownloadEngine`
 * simulates transfers for the prototype; a real implementation (Node streams,
 * aria2 over RPC, libcurl, …) can replace it without touching any UI code.
 */
import type { DownloadItem } from '../types/index.ts';

export interface EngineContext {
  /** seconds since the previous tick */
  dt: number;
  now: number;
  random: () => number;
}

export interface EngineAdvance {
  /** bytes received during this tick */
  bytes: number;
  /** set when the transfer failed */
  error?: string;
  /** set by a real engine when the transfer finished (needed when the size was never known) */
  done?: boolean;
}

export interface VerifyResult {
  algo: string;
  hash: string;
  /** null when there was nothing to compare against */
  match: boolean | null;
}

/** Settings an engine enforces itself. */
export interface EngineConfig {
  /** bytes/second, 0 = unlimited */
  globalBandwidthLimit: number;
  retryAttempts?: number;
  timeoutSec?: number;
  userAgent?: string;
  proxyMode?: 'none' | 'system' | 'manual';
  proxyHost?: string;
  proxyPort?: number;
  fileAllocation?: 'none' | 'sparse' | 'prealloc';
  diagnostic?: boolean;
  logFolder?: string;
}

export interface DownloadEngine {
  /** The speed (bytes/s) this transfer would reach if nothing throttled it. */
  targetSpeed(item: DownloadItem, ctx: EngineContext): number;
  /** Move the transfer forward at `speed` bytes/s for ctx.dt seconds. */
  advance(item: DownloadItem, speed: number, ctx: EngineContext): EngineAdvance;
  /**
   * Real engines learn facts asynchronously (file size after the first request,
   * the server-chosen file name). Return them here; the manager merges them.
   */
  sync?(item: DownloadItem): { totalBytes?: number; fileName?: string; connections?: number; resumable?: boolean; mainFile?: string } | null;
  /** Global settings the engine must enforce itself (e.g. the shared speed cap). */
  configure?(cfg: EngineConfig): void;
  /** Hash a finished file. With `expected` the algorithm follows its length and `match` says whether it agrees. null = could not be read. */
  verify?(item: DownloadItem, o: { algo: string; expected: string }): Promise<VerifyResult | null>;
  /** The user changed this download's own speed limit. */
  onSpeedLimit?(item: DownloadItem, bytesPerSec: number): void;
  /** The combined speed cap of a queue (its own limit, or a schedule window's); 0 = unlimited. Shared by the queue's downloads. */
  onQueueLimit?(queueId: string, bytesPerSec: number): void;
  /** Lifecycle hooks — real engines open/close sockets and files here. */
  onStart?(item: DownloadItem): void;
  onPause?(item: DownloadItem): void;
  onCancel?(item: DownloadItem): void;
}

const ERRORS = [
  'Connection reset by peer (ECONNRESET)',
  'Server returned HTTP 503 (Service Unavailable)',
  'Timed out waiting for mirror response',
];

/** Simulated transfers: fluctuating speeds, smooth ramp-up, optional one-shot failure. */
export class MockDownloadEngine implements DownloadEngine {
  targetSpeed(item: DownloadItem, ctx: EngineContext): number {
    const connFactor = Math.min(1.2, 0.4 + item.connections * 0.1);
    const jitter = 0.72 + ctx.random() * 0.5; // 0.72 … 1.22
    const raw = item.peakSpeed * connFactor * jitter;
    // exponential smoothing so numbers drift instead of jumping
    const smoothed = item.speed > 0 ? item.speed * 0.55 + raw * 0.45 : raw * 0.35;
    return Math.max(0, smoothed);
  }

  advance(item: DownloadItem, speed: number, ctx: EngineContext): EngineAdvance {
    if (item.simulateFailure && item.progress >= 30) {
      return { bytes: 0, error: ERRORS[Math.floor(ctx.random() * ERRORS.length)] };
    }
    const remaining = item.totalBytes - item.downloadedBytes;
    return { bytes: Math.min(remaining, Math.max(0, speed * ctx.dt)) };
  }
}
