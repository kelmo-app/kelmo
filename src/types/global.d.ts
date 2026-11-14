export {};

export interface EngineEvent {
  id: string;
  type: 'progress' | 'state';
  // progress
  downloaded?: number;
  total?: number;
  speed?: number;
  eta?: number | null;
  connections?: number;
  // state
  status?: 'connecting' | 'downloading' | 'completed' | 'failed' | 'paused' | 'cancelled';
  error?: string | null;
  fileName?: string | null;
  rangeOk?: boolean;
  path?: string | null;
}

declare global {
  interface Window {
    /** Present only inside Electron (see electron/preload.cjs). */
    kelmo?: {
      isElectron: true;
      openPath: (path: string) => Promise<{ ok: boolean; error?: string }>;
      showInFolder: (path: string) => Promise<{ ok: boolean }>;
      pickFolder: () => Promise<string | null>;
      pickTorrent: () => Promise<string | null>;
      clipboardLink: () => Promise<string>;
      setMinimizeToTray: (enabled: boolean) => Promise<boolean>;
      setAutostart: (enabled: boolean) => Promise<boolean>;
      browserInfo: () => Promise<{ token: string; port: number | null }>;
      onExternalAdd: (cb: (req: { url: string; fileName?: string; referrer?: string; cookie?: string; userAgent?: string }) => void) => () => void;
      diskInfo: (path: string) => Promise<{ total: number; free: number } | null>;
      engine: {
        start: (spec: { id: string; url: string; dir: string; fileName?: string; connections?: number; speedLimit?: number; retries?: number; headers?: Record<string, string>; mirrors?: string[]; video?: { choice: string; size?: number; useLogin?: boolean } }) => Promise<boolean>;
        probe: (spec: { url: string; headers?: Record<string, string>; auth?: { user: string; password: string }; wantStatus?: boolean }) => Promise<LinkInfo | LinkProbeFail | null>;
        health: (spec: { url: string; headers?: Record<string, string>; authUser?: string; authSecret?: string }) => Promise<LinkHealthRaw>;
        pause: (id: string) => Promise<boolean>;
        cancel: (id: string, loc?: { dir: string; fileName: string; video?: boolean }) => Promise<boolean>;
        setSpeedLimit: (id: string, bps: number) => Promise<boolean>;
        setGlobalLimit: (bps: number) => Promise<boolean>;
        setQueueLimit: (id: string, bps: number) => Promise<boolean>;
        configure: (cfg: import('../services/DownloadEngine').EngineConfig) => Promise<boolean>;
        verify: (spec: { dir: string; fileName: string; algo?: string; expected?: string }) => Promise<import('../services/DownloadEngine').VerifyResult | null>;
        onEvent: (cb: (e: EngineEvent) => void) => () => void;
      };
      /** YouTube and other video sites, through yt-dlp (downloaded once, with the user's consent). */
      video: {
        status: () => Promise<VideoStatus>;
        install: () => Promise<{ ok: true; version: string } | { ok: false; error: string }>;
        probe: (url: string, opts?: { cookie?: string }) => Promise<VideoInfo | { ok: false; needInstall?: boolean; error?: string }>;
      };
      secret: {
        seal: (password: string) => Promise<string>;
        info: () => Promise<{ strong: boolean }>;
      };
      popup: {
        init: () => Promise<{ kind: 'add' | 'progress' | 'done' | 'drop' | 'tray'; payload: unknown; config: PopupConfig | null }>;
        snapshot: () => Promise<PopupItem[]>;
        close: () => Promise<boolean>;
        confirm: (spec: PopupAddSpec) => Promise<boolean>;
        action: (msg: { id: string; action: 'pause' | 'resume' | 'cancel' | 'limit' | 'after' | 'afterAll'; value?: number | string }) => Promise<boolean>;
        pref: (msg: { key: 'showCompleteDialog' | 'showProgressWindow' | 'dropTarget'; value: boolean }) => Promise<boolean>;
        rememberFolder: (msg: { category: string; folder: string }) => Promise<boolean>;
        open: (msg: { id: string; what: 'file' | 'folder' }) => Promise<{ ok: boolean; error?: string }>;
        pickFolder: () => Promise<string | null>;
        pickTorrent: () => Promise<string | null>;
        resize: (msg: { height: number }) => Promise<boolean>;
        dropLinks: (links: string[]) => Promise<number>;
        openMain: () => Promise<boolean>;
        trayAdd: (url: string) => Promise<boolean>;
        trayDo: (what: 'openMain' | 'addUrl' | 'queue' | 'folder' | 'settings') => Promise<boolean>;
        onDetail: (cb: (msg: { id: string; detail: ConnectionDetail }) => void) => () => void;
        onItems: (cb: (list: PopupItem[]) => void) => () => void;
      };
      host: {
        ready: () => void;
        publish: (msg: { items?: PopupItem[]; config?: PopupConfig; busy?: boolean }) => void;
        popupAdded: (msg: { id: string; show: boolean }) => void;
        itemDone: (msg: { id: string; showDialog: boolean }) => void;
        afterAll: (mode: string) => Promise<'none' | 'quit' | 'done' | 'cancelled' | 'unsupported' | 'busy'>;
        on: (channel: 'kdm:popup-add' | 'kdm:popup-action' | 'kdm:popup-pref' | 'kdm:popup-folder' | 'kdm:popup-batch' | 'kdm:popup-nav', cb: (msg: any) => void) => () => void;
      };
      platformInfo: () => Promise<{ platform: string; version: string }>;
    };
  }
}

/** What a quick request to the link reveals (shown in the Add dialog, like IDM's file info). */
/** Settings the popup windows need, published by the main window. */
export interface PopupConfig {
  categories: Array<{ name: string; folder: string }>;
  showCompleteDialog: boolean;
  showProgressWindow: boolean;
  /** One-shot "when everything is finished" action, shown on the progress window's On completion tab. */
  afterAll?: 'none' | 'quit' | 'sleep' | 'shutdown';
  defaultConnections: number;
  /** Offer to download links copied to the clipboard. */
  watchClipboard: boolean;
  /** Show the small floating drop target. */
  dropTarget: boolean;
}

export interface PopupAddSpec {
  url: string;
  fileName: string;
  dir: string;
  category: string;
  startNow: boolean;
  referrer?: string;
  cookie?: string;
  userAgent?: string;
  mirrors?: string[];
  /** A login typed in the window; the main process seals the password before anything is stored. */
  authUser?: string;
  authPassword?: string;
  /** Video-site link: the quality chosen in the window and its expected size in bytes. */
  video?: { choice: string; size?: number; useLogin?: boolean };
}

/** The part of a download the small windows need. */
export interface PopupItem {
  id: string;
  url: string;
  fileName: string;
  destination: string;
  status: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number;
  eta: number | null;
  connections: number;
  speedLimit: number;
  resumable: boolean | null;
  error: string | null;
  afterOpen: 'none' | 'file' | 'folder';
}

/** What the engine's link check answered (see src/lib/linkHealth.ts for the wording). */
export type LinkHealthRaw = ({ ok: true; ms: number } & LinkInfo) | { ok: false; status: number; error: string };

/** Answer of a quick look that failed with an HTTP status, when the caller asked for the reason (`wantStatus`). */
export interface LinkProbeFail {
  ok: false;
  status: number;
}

export interface LinkInfo {
  size: number;
  rangeOk: boolean;
  fileName: string;
  contentType: string;
  finalUrl: string;
}

/** Live detail of one transfer, straight from the engine (nothing is estimated). */
export interface ConnectionDetail {
  /** [start, pos, end] byte ranges of the file; `pos` is how far each one has got. Empty for single-stream downloads. */
  segments: Array<[number, number, number]>;
  workers: Array<{ n: number; bytes: number; speed: number; state: string; /** only when mirrors are in use */ host?: string }>;
  /** how many sources (main link + vetted mirrors) the download uses */
  mirrors?: number;
}

export interface VideoStatus {
  installed: boolean;
  version: string;
  /** true when KDM downloaded it itself (so KDM can update it) */
  managed: boolean;
  /** ffmpeg is needed to join separate video and sound (the best qualities) */
  ffmpeg: boolean;
  /** a JavaScript runtime (deno or node) that YouTube needs; null when none is installed */
  runtime: string | null;
}

export interface VideoInfo {
  ok: true;
  playlist: boolean;
  title: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  live: boolean;
  heights: number[];
  /** qualities that are one ready-made file (usable without ffmpeg) */
  muxedHeights?: number[];
  sizes?: Record<string, number>;
  audioSize?: number;
  audioOnly: boolean;
  count?: number;
}
