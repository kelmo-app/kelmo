import { useCallback, useEffect, useState } from 'react';
import { platform } from '@/services/platform';
import { isVideoSite } from '@/lib/videoSites';
import type { VideoInfo, VideoStatus } from '@/types/global';

export type VideoState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'install'; installing: boolean; error?: string }
  | { kind: 'ready'; info: VideoInfo }
  | { kind: 'error'; message: string };

/**
 * For a link to a video site (YouTube…): is the video downloader installed, and if so what is behind the link.
 * `kind: 'none'` means the link is an ordinary file link and nothing here applies.
 */
export function useVideoLink(url: string, enabled = true, cookie = '') {
  const target = enabled && isVideoSite(url) ? url.trim() : '';
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [state, setState] = useState<VideoState>({ kind: 'none' });
  const [tick, setTick] = useState(0);
  // YouTube sometimes asks "are you a robot?": then (and only if the user agrees) the browser's login is used for this video
  const [loginOn, setLoginOn] = useState(false);
  useEffect(() => setLoginOn(false), [target]);

  useEffect(() => {
    if (!target) {
      setState({ kind: 'none' });
      return;
    }
    let stale = false;
    setState({ kind: 'loading' });
    const t = window.setTimeout(async () => {
      const st = await platform.videoStatus().catch(() => null);
      if (stale) return;
      setStatus(st);
      if (!st) return setState({ kind: 'error', message: 'Downloading from video sites needs the KDM desktop app.' });
      if (!st.installed) return setState({ kind: 'install', installing: false });
      const r = await platform.probeVideo(target, loginOn && cookie ? { cookie } : undefined).catch(() => ({ ok: false as const, error: 'Could not read this link.' }));
      if (stale) return;
      if (r.ok) {
        if (r.playlist) return setState({ kind: 'error', message: 'This is a playlist. Open one video and send that link.' });
        if (r.live) return setState({ kind: 'error', message: 'Live streams are not supported yet.' });
        return setState({ kind: 'ready', info: r });
      }
      if ('needInstall' in r && r.needInstall) return setState({ kind: 'install', installing: false });
      setState({ kind: 'error', message: ('error' in r && r.error) || 'Could not read this video.' });
    }, 400);
    return () => {
      stale = true;
      window.clearTimeout(t);
    };
  }, [target, tick, loginOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const install = useCallback(async () => {
    setState({ kind: 'install', installing: true });
    const r = await platform.installVideo();
    if (r.ok) setTick((x) => x + 1);
    else setState({ kind: 'install', installing: false, error: r.error });
  }, []);
  const retry = useCallback(() => setTick((x) => x + 1), []);

  const useLogin = useCallback(() => setLoginOn(true), []);
  return { state, status, install, retry, loginOn, canUseLogin: !!cookie, useLogin };
}
