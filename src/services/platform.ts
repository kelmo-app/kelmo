import type { LinkHealthRaw, LinkInfo, VideoInfo, VideoStatus } from '../types/global';
/**
 * Platform bridge. In Electron these call the main process through the preload
 * bridge; in a plain browser (dev:web, tests) they degrade to simulations so
 * every button still gives feedback.
 */
export interface PlatformResult {
  ok: boolean;
  /** true when the action was only simulated (no real OS call was made) */
  simulated: boolean;
  error?: string;
}

const bridge = () => (typeof window !== 'undefined' ? window.kelmo : undefined);

export const platform = {
  get isElectron(): boolean {
    return !!bridge();
  },

  async openPath(path: string): Promise<PlatformResult> {
    const b = bridge();
    if (!b) return { ok: true, simulated: true };
    const res = await b.openPath(path);
    return { ok: res.ok, simulated: false, error: res.error };
  },

  /** Moves downloaded files/folders to the Trash (desktop app only). */
  async trashFiles(entries: Array<{ dir: string; name: string }>): Promise<{ trashed: number; missing: number; failed: string[] } | null> {
    const b = bridge();
    if (!b || !entries.length) return null;
    try { return await b.trashFiles(entries); } catch { return null; }
  },

  async showInFolder(path: string): Promise<PlatformResult> {
    const b = bridge();
    if (!b) return { ok: true, simulated: true };
    const res = await b.showInFolder(path);
    return { ok: res.ok, simulated: false };
  },

  /** A link on the clipboard (http/https/magnet), or ''. */
  async clipboardLink(): Promise<string> {
    const b = bridge();
    try { return b ? (await b.clipboardLink()) || '' : ''; } catch { return ''; }
  },

  async pickTorrent(): Promise<string | null> {
    const b = bridge();
    return b ? b.pickTorrent() : null;
  },

  async pickFolder(): Promise<string | null> {
    const b = bridge();
    return b ? b.pickFolder() : null;
  },

  /** Pairing token + port for the browser extension (desktop app only). */
  async browserInfo(): Promise<{ token: string; port: number | null } | null> {
    const b = bridge();
    return b ? b.browserInfo() : null;
  },

  /** Links sent by the browser extension. Returns an unsubscribe function. */
  onExternalAdd(cb: (req: { url: string; fileName?: string; referrer?: string; cookie?: string; userAgent?: string }) => void): () => void {
    return bridge()?.onExternalAdd(cb) ?? (() => {});
  },

  /** Real free/total space (desktop app only). */
  async diskInfo(path: string): Promise<{ total: number; free: number } | null> {
    const b = bridge();
    return b ? b.diskInfo(path) : null;
  },

  /** Is this link still alive? Desktop app only; null in the browser preview. */
  async checkLink(url: string, headers?: Record<string, string>, login?: { authUser?: string; authSecret?: string }): Promise<LinkHealthRaw | null> {
    const b = bridge();
    return b ? b.engine.health({ url, headers, ...login }) : null;
  },

  /** Ask the engine what a link is (size, name, resume support). Desktop app only; null when unknown. */
  async probeLink(url: string, headers?: Record<string, string>, auth?: { user: string; password: string }): Promise<{ info: LinkInfo | null; status?: number }> {
    const b = bridge();
    if (!b) return { info: null };
    const r = await b.engine.probe({ url, headers, auth, wantStatus: true });
    if (r && 'ok' in r) return { info: null, status: r.status };
    return { info: r };
  },

  /** Is the video downloader (yt-dlp) installed? Desktop app only. */
  async videoStatus(): Promise<VideoStatus | null> {
    const b = bridge();
    return b ? b.video.status() : null;
  },

  /** Download / update the video downloader (official release, checked against its published SHA-256). */
  async installVideo(): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
    const b = bridge();
    return b ? b.video.install() : { ok: false, error: 'Desktop app only' };
  },

  /** Title and available qualities of a video-site link. */
  async probeVideo(url: string, opts?: { cookie?: string }): Promise<VideoInfo | { ok: false; needInstall?: boolean; error?: string }> {
    const b = bridge();
    return b ? b.video.probe(url, opts) : { ok: false, error: 'Desktop app only' };
  },

  /** Seal a password with the system keyring (desktop app only; '' elsewhere). */
  async sealPassword(password: string): Promise<string> {
    const b = bridge();
    return b ? b.secret.seal(password) : '';
  },

  async setAutostart(enabled: boolean): Promise<boolean> {
    return (await bridge()?.setAutostart(enabled)) ?? false;
  },

  async setMinimizeToTray(enabled: boolean): Promise<void> {
    await bridge()?.setMinimizeToTray(enabled);
  },

  notify(title: string, body: string): void {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') new Notification(title, { body, silent: true });
      else if (Notification.permission === 'default') void Notification.requestPermission();
    } catch {
      /* desktop notifications are best-effort */
    }
  },
};
