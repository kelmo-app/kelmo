import { useEffect, useState } from 'react';
import type { AfterAllMode } from '@/types';
import { windowTitle } from './popupLogic';
import { ProgressView, type ProgressAction, type ProgressTab } from './ProgressView';
import { useConnectionDetail } from './useConnectionDetail';
import { usePopupItem } from './usePopupItem';

const PREF = 'kdm:popup:details';
const HEIGHT = { expanded: 684, collapsed: 500 };

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF) !== '0';
  } catch {
    return true;
  }
}

/** Container: wires the window to the main process. All drawing is in ProgressView. */
export function ProgressPopup({ id }: { id: string }) {
  const api = window.kelmo!.popup;
  const item = usePopupItem(id);
  const { detail, history } = useConnectionDetail(id);
  const [tab, setTab] = useState<ProgressTab>('status');
  const [showDetails, setShowDetails] = useState(readPref);
  const [limitOn, setLimitOn] = useState(false);
  const [limitKb, setLimitKb] = useState(1024);
  const [showDone, setShowDone] = useState(true);
  const [afterAll, setAfterAll] = useState<AfterAllMode>('none');

  // the armed action lives in the main window; read it when this window opens
  useEffect(() => {
    void api.init().then((r) => r.config?.afterAll && setAfterAll(r.config.afterAll));
  }, [api]);

  useEffect(() => {
    document.title = windowTitle(item);
  }, [item]);

  // the window opens big; shrink it at once if the user last chose "Hide details"
  useEffect(() => {
    if (!showDetails) void api.resize({ height: HEIGHT.collapsed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!item) return <div className="p-6 text-sm text-fg3">Connecting…</div>;

  const toggleDetails = () => {
    const next = !showDetails;
    setShowDetails(next);
    try {
      localStorage.setItem(PREF, next ? '1' : '0');
    } catch {
      /* private mode: just don't remember */
    }
    void api.resize({ height: next ? HEIGHT.expanded : HEIGHT.collapsed });
  };

  const act = (action: ProgressAction, value?: number | string) => {
    if (action === 'afterAll') setAfterAll(value as AfterAllMode);
    void api.action({ id, action, value });
  };

  return (
    <ProgressView
      item={item}
      detail={detail}
      history={history}
      showDetails={showDetails}
      tab={tab}
      limitOn={limitOn}
      limitKb={limitKb}
      showDone={showDone}
      afterAll={afterAll}
      onTab={setTab}
      onToggleDetails={toggleDetails}
      onAction={act}
      onLimit={(on, kb) => {
        setLimitOn(on);
        setLimitKb(kb);
        act('limit', on ? Math.max(1, kb) * 1024 : 0);
      }}
      onShowDone={(v) => {
        setShowDone(v);
        void api.pref({ key: 'showCompleteDialog', value: v });
      }}
      onOpenFolder={() => void api.open({ id, what: 'folder' })}
      onCopyLink={() => void navigator.clipboard?.writeText(item.url).catch(() => {})}
      onClose={() => void api.close()}
    />
  );
}
