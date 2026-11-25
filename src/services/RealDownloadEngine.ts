/**
 * RealDownloadEngine — adapter between the tick-based DownloadManager and the
 * asynchronous, event-driven engine that runs in Electron's main process
 * (engine/download.mjs, reached through the preload bridge).
 *
 * The manager keeps asking "how many bytes arrived?" every tick; we answer from
 * the latest progress event. Bytes never move through this class.
 */
import type { DownloadItem } from '../types/index.ts';
import { fileNameFromUrl } from '../lib/url.ts';
import type { DownloadEngine, EngineAdvance, EngineConfig, EngineContext, VerifyResult } from './DownloadEngine.ts';

export interface EngineEvent {
  id: string;
  type: 'progress' | 'state';
  downloaded?: number;
  total?: number;
  speed?: number;
  eta?: number | null;
  connections?: number;
  status?: 'connecting' | 'downloading' | 'completed' | 'failed' | 'paused' | 'cancelled';
  error?: string | null;
  fileName?: string | null;
  rangeOk?: boolean;
  /** Torrents: the biggest file inside the download folder (what "Open" plays). */
  mainFile?: string;
}

export interface EngineBridge {
  start(spec: { id: string; url: string; dir: string; fileName?: string; connections?: number; speedLimit?: number; queueId?: string; queueLimit?: number; authUser?: string; authSecret?: string; retries?: number; headers?: Record<string, string>; mirrors?: string[]; video?: { choice: string; size?: number; useLogin?: boolean }; autoName?: boolean; adopt?: boolean }): Promise<boolean>;
  pause(id: string): Promise<boolean>;
  cancel(id: string, loc?: { dir: string; fileName: string; video?: boolean }): Promise<boolean>;
  setSpeedLimit(id: string, bps: number): Promise<boolean>;
  setGlobalLimit(bps: number): Promise<boolean>;
  setQueueLimit?(id: string, bps: number): Promise<boolean>;
  configure?(cfg: EngineConfig): Promise<boolean>;
  verify?(spec: { dir: string; fileName: string; algo?: string; expected?: string }): Promise<VerifyResult | null>;
  onEvent(cb: (e: EngineEvent) => void): () => void;
}

interface Live {
  downloaded: number;
  total: number;
  speed: number;
  connections: number;
  status: NonNullable<EngineEvent['status']> | 'starting';
  error: string | null;
  fileName: string | null;
  rangeOk: boolean | null;
  mainFile?: string;
}

/** Request headers that make the engine look like the browser tab the link came from. */
export function headersFor(item: Pick<DownloadItem, 'referrer' | 'cookie' | 'userAgent'>): Record<string, string> | undefined {
  const h: Record<string, string> = {};
  if (item.referrer) h.Referer = item.referrer;
  if (item.cookie) h.Cookie = item.cookie;
  if (item.userAgent) h['User-Agent'] = item.userAgent;
  return Object.keys(h).length ? h : undefined;
}

export class RealDownloadEngine implements DownloadEngine {
  private live = new Map<string, Live>();

  private queueLimits = new Map<string, number>();

  constructor(private bridge: EngineBridge) {
    bridge.onEvent((e) => this.onEvent(e));
  }

  private onEvent(e: EngineEvent): void {
    const l = this.live.get(e.id);
    if (!l) return; // stale event from a download we already forgot (paused/cancelled)
    if (e.type === 'progress') {
      l.downloaded = e.downloaded ?? l.downloaded;
      l.total = e.total || l.total;
      l.speed = e.speed ?? 0;
      l.connections = e.connections ?? l.connections;
    } else if (e.status) {
      l.status = e.status;
      if (e.total) l.total = e.total;
      if (e.fileName) l.fileName = e.fileName;
      if (typeof e.rangeOk === 'boolean') l.rangeOk = e.rangeOk;
      if (e.mainFile) l.mainFile = e.mainFile;
      if (e.status === 'failed') l.error = e.error || 'Download failed';
    }
  }

  /** Start the transfer if it is not already known to the engine (also resumes after an app restart). */
  private ensure(item: DownloadItem): Live {
    let l = this.live.get(item.id);
    if (l) return l;
    l = { downloaded: item.downloadedBytes, total: 0, speed: 0, connections: 0, status: 'starting', error: null, fileName: null, rangeOk: null };
    this.live.set(item.id, l);
    this.bridge
      .start({ id: item.id, url: item.url, dir: item.destination, fileName: item.fileName, connections: item.connections, speedLimit: item.speedLimit, queueId: item.queueId, queueLimit: this.queueLimits.get(item.queueId) ?? 0, headers: headersFor(item), mirrors: item.mirrors, authUser: item.authUser, authSecret: item.authSecret, video: item.video, adopt: item.adoptLink === true, autoName: !item.video && item.fileName === fileNameFromUrl(item.url) })
      .catch((err: unknown) => {
        const cur = this.live.get(item.id);
        if (cur) {
          cur.status = 'failed';
          cur.error = err instanceof Error ? err.message : String(err);
        }
      });
    return l;
  }

  targetSpeed(item: DownloadItem, _ctx: EngineContext): number {
    return this.ensure(item).speed;
  }

  sync(item: DownloadItem): { totalBytes?: number; fileName?: string; connections?: number; resumable?: boolean; mainFile?: string } | null {
    const l = this.live.get(item.id);
    if (!l) return null;
    return { totalBytes: l.total || undefined, fileName: l.fileName || undefined, connections: l.connections || undefined, resumable: l.rangeOk ?? undefined, mainFile: l.mainFile };
  }

  advance(item: DownloadItem, _speed: number, _ctx: EngineContext): EngineAdvance {
    const l = this.ensure(item);
    if (l.status === 'failed') {
      this.live.delete(item.id);
      return { bytes: 0, error: l.error ?? 'Download failed' };
    }
    if (l.status === 'completed') {
      this.live.delete(item.id);
      // push the manager past its completion threshold (when the size was never known, what arrived is the size)
      const bytes = item.totalBytes > 0 ? Math.max(0, item.totalBytes - item.downloadedBytes) + 1 : Math.max(0, l.downloaded - item.downloadedBytes);
      return { bytes, done: true };
    }
    if (l.status === 'paused' || l.status === 'cancelled') {
      // the engine stopped on its own (rare); let the manager see no progress
      return { bytes: 0 };
    }
    return { bytes: Math.max(0, l.downloaded - item.downloadedBytes) };
  }

  onStart(item: DownloadItem): void {
    this.ensure(item);
  }

  onPause(item: DownloadItem): void {
    this.live.delete(item.id);
    void this.bridge.pause(item.id);
  }

  onCancel(item: DownloadItem): void {
    this.live.delete(item.id);
    // also tells the host where the temporary files are, for items that are paused/failed (not live)
    void this.bridge.cancel(item.id, { dir: item.destination, fileName: item.fileName, video: !!item.video });
  }

  onQueueLimit(queueId: string, bps: number): void {
    this.queueLimits.set(queueId, bps);
    void this.bridge.setQueueLimit?.(queueId, bps);
  }

  onSpeedLimit(item: DownloadItem, bps: number): void {
    void this.bridge.setSpeedLimit(item.id, bps);
  }

  async verify(item: DownloadItem, o: { algo: string; expected: string }): Promise<VerifyResult | null> {
    if (!this.bridge.verify) return null;
    return this.bridge.verify({ dir: item.destination, fileName: item.fileName, algo: o.algo, expected: o.expected });
  }

  configure(cfg: EngineConfig): void {
    void this.bridge.setGlobalLimit(cfg.globalBandwidthLimit);
    void this.bridge.configure?.(cfg);
  }
}
