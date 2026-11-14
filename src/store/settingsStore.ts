import { create } from 'zustand';
import type { Settings } from '@/types';
import { defaultSettings } from '@/data/defaults';
import { storage, type StorageService } from '@/services/StorageService';

type Nested = 'notifications' | 'startupBehavior' | 'network';

export interface SettingsState {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  updateNested: <K extends Nested>(key: K, patch: Partial<Settings[K]>) => void;
  reset: () => void;
  exportJson: () => string;
  importJson: (json: string) => { ok: true } | { ok: false; error: string };
}

/** Deep-merge stored settings over defaults so new fields always have values. */
export function mergeSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Settings>;
  return {
    ...defaultSettings,
    ...s,
    notifications: { ...defaultSettings.notifications, ...(s.notifications ?? {}) },
    startupBehavior: { ...defaultSettings.startupBehavior, ...(s.startupBehavior ?? {}) },
    network: { ...defaultSettings.network, ...(s.network ?? {}) },
  };
}

export function createSettingsStore(store: StorageService = storage) {
  const initial = mergeSettings(store.read<unknown>('settings', null));
  return create<SettingsState>((set, get) => {
    const commit = (settings: Settings) => {
      store.write('settings', settings);
      set({ settings });
    };
    return {
      settings: initial,
      update: (patch) => commit({ ...get().settings, ...patch }),
      updateNested: (key, patch) => commit({ ...get().settings, [key]: { ...get().settings[key], ...patch } }),
      reset: () => commit({ ...defaultSettings, setupDone: get().settings.setupDone }),
      exportJson: () => JSON.stringify({ app: 'kelmo', version: 1, settings: get().settings }, null, 2),
      importJson: (json) => {
        try {
          const parsed = JSON.parse(json) as { app?: string; settings?: unknown };
          if (!parsed || typeof parsed !== 'object' || !parsed.settings || typeof parsed.settings !== 'object') {
            return { ok: false, error: 'This file does not look like a KELMO settings export.' };
          }
          commit(mergeSettings(parsed.settings));
          return { ok: true };
        } catch {
          return { ok: false, error: 'The file is not valid JSON.' };
        }
      },
    };
  });
}

export const useSettingsStore = createSettingsStore();
