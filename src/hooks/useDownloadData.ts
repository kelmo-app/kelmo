import { useMemo } from 'react';
import { useDownloadStore } from '@/store/instances';
import { computeTotals } from '@/services/selectors';
import type { DownloadItem } from '@/types';

/** All items as an array. Re-derives only when the manager commits a change. */
export function useItems(): DownloadItem[] {
  const items = useDownloadStore((s) => s.items);
  return useMemo(() => Object.values(items), [items]);
}

export function useTotals() {
  const items = useItems();
  return useMemo(() => computeTotals(items), [items]);
}
