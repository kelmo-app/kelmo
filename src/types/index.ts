/* Core domain types for KELMO. UI code depends on these, never on mock data. */

export type DownloadStatus = 'downloading' | 'queued' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type Priority = 'high' | 'normal' | 'low';
/** IDM-style categories: each one has its own folder, created automatically. */
export type Category = 'General' | 'Compressed' | 'Documents' | 'Music' | 'Programs' | 'Video';
export type FileType =
  | 'iso'
  | 'archive'
  | 'executable'
  | 'package'
  | 'video'
  | 'audio'
  | 'image'
  | 'document'
  | 'dataset'
  | 'generic';
/** computed = hashed but nothing to compare against; verified = matches the checksum the website published. */
export type ChecksumStatus = 'none' | 'pending' | 'verifying' | 'computed' | 'verified' | 'mismatch';
/** What to do when every download has finished. */
export type AfterAllMode = 'none' | 'quit' | 'sleep' | 'shutdown';

export interface DownloadItem {
  id: string;
  fileName: string;
  url: string;
  sourceDomain: string;
  category: Category;
  fileType: FileType;
  totalBytes: number;
  downloadedBytes: number;
  /** 0..100 */
  progress: number;
  /** bytes / second */
  speed: number;
  /** seconds remaining, null when unknown / not running */
  eta: number | null;
  status: DownloadStatus;
  priority: Priority;
  connections: number;
  destination: string;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  checksumStatus: ChecksumStatus;
  checksumAlgo: 'SHA256' | 'SHA512' | 'SHA1' | 'MD5';
  /** The file's real hash, once computed. */
  checksum?: string;
  /** The checksum the website published (pasted by the user); the finished file is compared with it. */
  expectedChecksum?: string;
  queueId: string;
  /** Highest speed the (simulated) server will deliver, bytes/second. */
  peakSpeed: number;
  /** Per-download speed limit in bytes/second, 0 = unlimited. */
  speedLimit: number;
  retries: number;
  error: string | null;
  /** Active transfer time in seconds. */
  durationSec: number;
  /** Simulation flag — the mock engine will fail this transfer once. */
  simulateFailure?: boolean;
  /** Started manually: exempt from the queue's concurrency cap until it stops. */
  forceStart?: boolean;
  /** Browser session handed over by the extension (login-protected links). */
  referrer?: string;
  cookie?: string;
  userAgent?: string;
  /** Extra links to the same file: the engine downloads from all of them at once and the faster ones do more. */
  mirrors?: string[];
  /** Login for the site: user name, and the password sealed by the system keyring (never plain text). */
  authUser?: string;
  authSecret?: string;
  /** The address was replaced by the person: the engine continues the partial file under the new address. */
  adoptLink?: boolean;
  /** Set for video-site downloads (YouTube…): quality choice and expected size. */
  video?: { choice: string; size?: number; /** use the browser's login (cookies) for this site */ useLogin?: boolean };
  /** Server supports Range requests (set by the real engine). */
  resumable?: boolean;
  /** Torrents: path of the biggest file inside the destination folder (what Open plays). */
  mainFile?: string;
  /** Came from the browser extension: shows the IDM-style progress / complete windows. */
  viaPopup?: boolean;
}

export type QueueRunState = 'running' | 'paused';

export interface Queue {
  id: string;
  name: string;
  description: string;
  status: QueueRunState;
  /** Ordered item ids. Order == priority of execution inside the queue. */
  itemIds: string[];
  maxConcurrentDownloads: number;
  maxConnectionsPerDownload: number;
  /** bytes / second, 0 = unlimited */
  bandwidthLimit: number;
  retryFailed: boolean;
  autoStartNext: boolean;
  /** When true the queue only runs inside an enabled schedule rule window. */
  scheduled: boolean;
  pauseOnBattery: boolean;
  pauseOnVpnDisconnected: boolean;
  createdAt: number;
  /** Visual accent token for the queue card. */
  tone: 'cyan' | 'amber' | 'violet' | 'green' | 'slate';
}

export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Mon..Sun
export type AfterCompletion = 'none' | 'notify' | 'quit' | 'sleep' | 'shutdown';

export interface ScheduleRule {
  id: string;
  name: string;
  queueId: string;
  days: DayIndex[];
  /** "HH:mm" 24h. If end <= start the window wraps past midnight. */
  startTime: string;
  endTime: string;
  /** bytes / second, 0 = unlimited */
  bandwidthLimit: number;
  maxSimultaneous: number;
  afterCompletion: AfterCompletion;
  enabled: boolean;
}

export type ThemeMode = 'dark' | 'light' | 'system';
/** Whole-window colour schemes. "gold" is KELMO's own look (and honours Theme + Accent); the four warm systems (sand, navygold, royal, emerald) follow Theme light/dark; the rest set their own. */
export type PaletteKey = 'gold' | 'windows' | 'ivory' | 'slate' | 'graphite' | 'clean' | 'sand' | 'navygold' | 'royal' | 'emerald';
export type AccentKey = 'default' | 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose';

export interface NotificationPrefs {
  downloadCompleted: boolean;
  downloadFailed: boolean;
  queueFinished: boolean;
  schedulerStarted: boolean;
  desktop: boolean;
}

export interface StartupBehavior {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  confirmBeforeDelete: boolean;
}

export interface NetworkSettings {
  proxyMode: 'none' | 'system' | 'manual';
  proxyHost: string;
  proxyPort: number;
  vpnAwareness: boolean;
  timeoutSec: number;
  dnsServers: string;
  userAgent: string;
}

/** One time window of the bandwidth planner: during it, downloads share `limit` instead of the default limit. */
export interface BandwidthWindow {
  id: string;
  name: string;
  days: DayIndex[];
  /** "HH:mm" 24h. Ends before it starts = runs past midnight. */
  startTime: string;
  endTime: string;
  /** bytes / second, 0 = unlimited */
  limit: number;
  enabled: boolean;
}

export interface Settings {
  theme: ThemeMode;
  accentColor: AccentKey;
  palette: PaletteKey;
  /** Light theme only: colourful washes instead of flat ivory. */
  vibrant: boolean;
  density: 'comfortable' | 'compact';
  reduceMotion: boolean;
  sidebarCollapsed: boolean;
  /** "simple": list-first window like IDM. "advanced": the full workspace (Overview, Queues, Scheduler…). */
  uiMode: 'simple' | 'advanced';
  userName: string;
  /** The first-run setup wizard has been finished or skipped. */
  setupDone: boolean;
  language: string;
  defaultFolder: string;
  maxConnections: number;
  /** bytes / second, 0 = unlimited */
  bandwidthLimit: number;
  /** Time-of-day speed limits (top window wins); outside every window `bandwidthLimit` applies. */
  bandwidthPlan: BandwidthWindow[];
  retryAttempts: number;
  tempFileBehavior: 'keep' | 'delete-on-cancel' | 'delete-on-failure';
  fileAllocation: 'none' | 'prealloc' | 'sparse';
  /** Hash finished files with this algorithm ('off' = only when a checksum was pasted in the Add dialog). */
  checksumMode: 'off' | 'SHA256' | 'SHA512' | 'MD5';
  autoCategorize: boolean;
  /** Folder per category; missing = `<default folder>/<category>`. */
  categoryFolders: Partial<Record<Category, string>>;
  /** Show the small "Download complete" window for browser downloads. */
  showCompleteDialog: boolean;
  /** Offer to download file links as soon as they are copied (desktop app). */
  watchClipboard: boolean;
  /** Small always-on-top window that accepts links dragged from the browser (desktop app). */
  dropTarget: boolean;
  /** Show the small progress window for browser downloads. */
  showProgressWindow: boolean;
  notifications: NotificationPrefs;
  startupBehavior: StartupBehavior;
  network: NetworkSettings;
  logFolder: string;
  diagnosticMode: boolean;
}

export interface ActivityEntry {
  id: string;
  at: number;
  kind: 'completed' | 'failed' | 'added' | 'paused' | 'resumed' | 'removed' | 'verified' | 'queue' | 'scheduler';
  message: string;
  itemId?: string;
}

export interface SpeedSample {
  t: number;
  /** bytes/second */
  down: number;
  up: number;
}

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; run: () => void };
}

export interface AppNotification {
  id: string;
  at: number;
  tone: ToastTone;
  title: string;
  description?: string;
  read: boolean;
}

export interface NewDownloadInput {
  url: string;
  fileName?: string;
  destination?: string;
  category?: Category;
  startNow?: boolean;
  queueId?: string;
  connections?: number;
  /** bytes / second, 0 = unlimited */
  speedLimit?: number;
  priority?: Priority;
  referrer?: string;
  cookie?: string;
  userAgent?: string;
  mirrors?: string[];
  authUser?: string;
  authSecret?: string;
  /** A video-site page (YouTube…) downloaded through yt-dlp: the chosen quality and its expected size. */
  video?: { choice: string; size?: number; /** use the browser's login (cookies) for this site */ useLogin?: boolean };
  /** Checksum published by the website; compared with the finished file. */
  expectedChecksum?: string;
  viaPopup?: boolean;
}

export interface QueueStats {
  total: number;
  active: number;
  queued: number;
  paused: number;
  completed: number;
  failed: number;
  remainingBytes: number;
  speed: number;
}

export type QueueSectionKey = 'active' | 'next' | 'paused' | 'failed' | 'completed';
