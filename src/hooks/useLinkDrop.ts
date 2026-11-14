import { useEffect, useState } from 'react';
import { linksFromDrop } from '@/lib/dropLinks';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';

const carries = (e: DragEvent) => {
  const t = Array.from(e.dataTransfer?.types ?? []);
  return t.includes('text/uri-list') || t.includes('text/plain') || t.includes('Files');
};

/**
 * Drag a link from the browser onto the KDM window: the Add download dialog opens with it
 * (several links open the "many links" mode). Always cancels the browser's own handling, so a dropped
 * file or link can never navigate the window away. Returns true while something is being dragged over.
 */
export function useLinkDrop(): boolean {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let depth = 0;
    const ready = () => useSettingsStore.getState().settings.setupDone;
    const onEnter = (e: DragEvent) => {
      if (!carries(e)) return;
      e.preventDefault();
      depth++;
      if (ready()) setOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (!carries(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!carries(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      if (!ready()) return;
      const links = linksFromDrop({ uriList: e.dataTransfer?.getData('text/uri-list'), text: e.dataTransfer?.getData('text/plain') });
      if (!links.length) {
        useUiStore.getState().toast({ tone: 'info', title: 'No web link found', description: 'Drag a link (or selected link text) from your browser.' }, 2800);
        return;
      }
      if (links.length === 1) useUiStore.getState().openAddDialog(links[0]);
      else useUiStore.getState().openAddDialog(undefined, undefined, undefined, links.join('\n'));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return over;
}
