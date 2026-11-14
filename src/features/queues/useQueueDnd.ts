import { useCallback, useState } from 'react';
import { useDownloadStore } from '@/store/instances';

export type DropPlace = 'before' | 'after';

export interface QueueDnd {
  dragId: string | null;
  over: { id: string; place: DropPlace } | null;
  start: (id: string) => void;
  end: () => void;
  hover: (id: string, place: DropPlace) => void;
  drop: (targetId: string) => void;
}

/** Drag-and-drop ordering state for one queue. Mouse users drag; keyboard users use the move buttons. */
export function useQueueDnd(queueId: string): QueueDnd {
  const reorderRelative = useDownloadStore((s) => s.reorderRelative);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<QueueDnd['over']>(null);

  const end = useCallback(() => {
    setDragId(null);
    setOver(null);
  }, []);

  const drop = useCallback(
    (targetId: string) => {
      if (dragId && over && dragId !== targetId) reorderRelative(queueId, dragId, targetId, over.place);
      end();
    },
    [dragId, over, queueId, reorderRelative, end],
  );

  return {
    dragId,
    over,
    start: setDragId,
    end,
    hover: (id, place) => setOver((cur) => (cur && cur.id === id && cur.place === place ? cur : { id, place })),
    drop,
  };
}
