import { create } from 'zustand';
import type { AfterAllMode, AppNotification, Toast, ToastTone } from '@/types';
import { uid } from '@/lib/id';

/** Login session / referrer handed over by the browser extension. */
export interface BrowserSession {
  referrer?: string;
  cookie?: string;
  userAgent?: string;
}

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
}

export interface UiState {
  /** global search (top bar) — pages filter by this */
  query: string;
  setQuery: (q: string) => void;
  /** incremented to ask the top bar to focus its search field */
  focusSearchTick: number;
  focusSearch: () => void;

  addDialog: { open: boolean; prefillUrl?: string; queueId?: string; session?: BrowserSession; batchLinks?: string };
  openAddDialog: (prefillUrl?: string, queueId?: string, session?: BrowserSession, batchLinks?: string) => void;
  closeAddDialog: () => void;

  /** One-shot: what to do when every download has finished (not remembered across runs on purpose). */
  afterAll: AfterAllMode;
  setAfterAll: (m: AfterAllMode) => void;

  detailId: string | null;
  openDetail: (id: string) => void;
  closeDetail: () => void;

  /** ids ticked for bulk actions */
  selectedIds: string[];
  /** the row the keyboard acts on (Space / Delete) */
  activeId: string | null;
  setSelectedIds: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
  setActiveId: (id: string | null) => void;

  ruleEditor: { open: boolean; ruleId: string | null };
  openRuleEditor: (ruleId?: string | null) => void;
  closeRuleEditor: () => void;

  queueEditor: { open: boolean; queueId: string | null };
  openQueueEditor: (queueId?: string | null) => void;
  closeQueueEditor: () => void;

  confirm: ConfirmRequest | null;
  askConfirm: (req: ConfirmRequest) => void;
  closeConfirm: () => void;

  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'> & { id?: string }, ttl?: number) => string;
  dismissToast: (id: string) => void;

  notifications: AppNotification[];
  pushNotification: (n: { tone: ToastTone; title: string; description?: string }) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
}

const MAX_TOASTS = 4;

export const useUiStore = create<UiState>((set, get) => ({
  query: '',
  setQuery: (query) => set({ query }),
  focusSearchTick: 0,
  focusSearch: () => set((s) => ({ focusSearchTick: s.focusSearchTick + 1 })),

  addDialog: { open: false },
  openAddDialog: (prefillUrl, queueId, session, batchLinks) => set({ addDialog: { open: true, prefillUrl, queueId, session, batchLinks } }),
  closeAddDialog: () => set({ addDialog: { open: false } }),

  afterAll: 'none',
  setAfterAll: (afterAll) => set({ afterAll }),

  detailId: null,
  openDetail: (id) => set({ detailId: id, activeId: id }),
  closeDetail: () => set({ detailId: null }),

  selectedIds: [],
  activeId: null,
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  toggleSelected: (id) =>
    set((s) => ({ selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] })),
  clearSelection: () => set({ selectedIds: [] }),
  setActiveId: (activeId) => set({ activeId }),

  ruleEditor: { open: false, ruleId: null },
  openRuleEditor: (ruleId = null) => set({ ruleEditor: { open: true, ruleId } }),
  closeRuleEditor: () => set({ ruleEditor: { open: false, ruleId: null } }),

  queueEditor: { open: false, queueId: null },
  openQueueEditor: (queueId = null) => set({ queueEditor: { open: true, queueId } }),
  closeQueueEditor: () => set({ queueEditor: { open: false, queueId: null } }),

  confirm: null,
  askConfirm: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),

  toasts: [],
  toast: (t, ttl = 4200) => {
    const id = t.id ?? uid('toast');
    set((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== id), { ...t, id }].slice(-MAX_TOASTS) }));
    if (ttl > 0) setTimeout(() => get().dismissToast(id), ttl);
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  notifications: [],
  pushNotification: (n) =>
    set((s) => ({
      notifications: [{ id: uid('n'), at: Date.now(), read: false, ...n }, ...s.notifications].slice(0, 40),
    })),
  markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
  clearNotifications: () => set({ notifications: [] }),
}));
