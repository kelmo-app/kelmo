import { useEffect, useState } from 'react';
import type { ConnectionDetail } from '@/types/global';
import { pushHistory } from './popupLogic';

/** Live per-connection detail of one download (fed by the engine through the main process). */
export function useConnectionDetail(id: string): { detail: ConnectionDetail | null; history: Record<number, number[]> } {
  const [state, setState] = useState<{ detail: ConnectionDetail | null; history: Record<number, number[]> }>({ detail: null, history: {} });
  useEffect(() => {
    const api = window.kelmo?.popup;
    if (!api) return;
    return api.onDetail((msg) => {
      if (msg.id !== id) return;
      setState((s) => ({ detail: msg.detail, history: pushHistory(s.history, msg.detail.workers) }));
    });
  }, [id]);
  return state;
}
