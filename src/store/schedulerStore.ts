import { create } from 'zustand';
import type { ScheduleRule } from '@/types';
import { uid } from '@/lib/id';
import { createSeed } from '@/data/seed';
import { storage, type StorageService } from '@/services/StorageService';

export interface SchedulerState {
  rules: ScheduleRule[];
  addRule: (rule: Omit<ScheduleRule, 'id'>) => ScheduleRule;
  updateRule: (id: string, patch: Partial<Omit<ScheduleRule, 'id'>>) => void;
  deleteRule: (id: string) => void;
  toggleRule: (id: string) => void;
  resetRules: () => void;
}

export function createSchedulerStore(store: StorageService = storage, seedRules: ScheduleRule[] = createSeed().rules) {
  const initial = store.read<ScheduleRule[] | null>('rules', null) ?? seedRules;
  return create<SchedulerState>((set, get) => {
    const commit = (rules: ScheduleRule[]) => {
      store.write('rules', rules);
      set({ rules });
    };
    return {
      rules: initial,
      addRule: (rule) => {
        const created: ScheduleRule = { ...rule, id: uid('r') };
        commit([...get().rules, created]);
        return created;
      },
      updateRule: (id, patch) => commit(get().rules.map((r) => (r.id === id ? { ...r, ...patch } : r))),
      deleteRule: (id) => commit(get().rules.filter((r) => r.id !== id)),
      toggleRule: (id) => commit(get().rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))),
      resetRules: () => commit(seedRules),
    };
  });
}

export const useSchedulerStore = createSchedulerStore();
