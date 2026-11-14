import { create } from 'zustand';
import type { ActivityEntry, DownloadItem, NewDownloadInput, Priority, Queue, SpeedSample } from '@/types';
import type { DownloadManager } from '@/services/DownloadManager';

export interface DownloadStoreState {
  items: Record<string, DownloadItem>;
  queues: Queue[];
  activity: ActivityEntry[];
  history: SpeedSample[];
  rev: number;
  ready: boolean;

  addDownload: (input: NewDownloadInput) => DownloadItem;
  pause: (id: string) => void;
  resume: (id: string) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  removeMany: (ids: string[]) => void;
  pauseMany: (ids: string[]) => void;
  resumeMany: (ids: string[]) => void;
  pauseAll: (queueId?: string) => number;
  resumeAll: (queueId?: string) => number;
  clearCompleted: (queueId?: string) => number;
  redownload: (id: string) => DownloadItem | null;
  setPriority: (id: string, p: Priority) => void;
  setConnections: (id: string, n: number) => void;
  setSpeedLimit: (id: string, bps: number) => void;

  moveToQueue: (id: string, queueId: string, index?: number) => void;
  reorder: (queueId: string, id: string, toIndex: number) => void;
  reorderRelative: (queueId: string, id: string, targetId: string, place: 'before' | 'after') => void;
  reorderByPriority: (queueId: string) => void;
  createQueue: (input: Partial<Queue> & { name: string }) => Queue;
  updateQueue: (id: string, patch: Partial<Omit<Queue, 'id' | 'itemIds' | 'createdAt'>>) => void;
  deleteQueue: (id: string, moveTo?: string) => boolean;
  pauseQueue: (id: string) => void;
  startQueue: (id: string) => void;
}

/**
 * Binds a DownloadManager to React. The store holds a *snapshot* and forwards
 * every action to the manager, so UI code never touches engine internals.
 */
export function createDownloadStore(manager: DownloadManager) {
  return create<DownloadStoreState>((set) => {
    const snap = () => {
      const s = manager.getState();
      return { items: s.items, queues: s.queues, activity: s.activity, history: s.history, rev: s.rev };
    };
    manager.subscribe(() => set(snap()));
    return {
      ...snap(),
      ready: true,
      addDownload: (i) => manager.addDownload(i),
      pause: (id) => void manager.pause(id),
      resume: (id) => void manager.resume(id),
      cancel: (id) => void manager.cancel(id),
      retry: (id) => void manager.retry(id),
      remove: (id) => void manager.remove(id),
      removeMany: (ids) => void manager.removeMany(ids),
      pauseMany: (ids) => void manager.pauseMany(ids),
      resumeMany: (ids) => void manager.resumeMany(ids),
      pauseAll: (q) => manager.pauseAll(q),
      resumeAll: (q) => manager.resumeAll(q),
      clearCompleted: (q) => manager.clearCompleted(q),
      redownload: (id) => manager.redownload(id),
      setPriority: (id, p) => void manager.setPriority(id, p),
      setConnections: (id, n) => void manager.setConnections(id, n),
      setSpeedLimit: (id, b) => void manager.setSpeedLimit(id, b),
      moveToQueue: (id, q, idx) => void manager.moveToQueue(id, q, idx),
      reorder: (q, id, to) => void manager.reorder(q, id, to),
      reorderRelative: (q, id, t, place) => void manager.reorderRelative(q, id, t, place),
      reorderByPriority: (q) => void manager.reorderByPriority(q),
      createQueue: (i) => manager.createQueue(i),
      updateQueue: (id, p) => void manager.updateQueue(id, p),
      deleteQueue: (id, to) => manager.deleteQueue(id, to),
      pauseQueue: (id) => void manager.pauseQueue(id),
      startQueue: (id) => void manager.startQueue(id),
    };
  });
}

export type DownloadStore = ReturnType<typeof createDownloadStore>;
