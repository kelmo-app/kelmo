import { useEffect, useState } from 'react';
import type { PopupItem } from '@/types/global';

/** Live view of one download, fed by the main window through the main process. */
export function usePopupItem(id: string | null): PopupItem | null {
  const [item, setItem] = useState<PopupItem | null>(null);
  useEffect(() => {
    const api = window.kelmo?.popup;
    if (!api || !id) return;
    let alive = true;
    const pick = (list: PopupItem[]) => {
      const found = list.find((i) => i.id === id);
      if (alive && found) setItem(found);
    };
    void api.snapshot().then(pick);
    const off = api.onItems(pick);
    return () => {
      alive = false;
      off();
    };
  }, [id]);
  return item;
}
