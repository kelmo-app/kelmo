import type { Settings } from '../types/index.ts';
import { MB } from '../lib/format.ts';

export const APP_VERSION = '0.9.0';
export const DEFAULT_FOLDER = '~/Downloads/KELMO';

export const defaultSettings: Settings = {
  theme: 'dark',
  accentColor: 'default',
  vibrant: true,
  density: 'comfortable',
  reduceMotion: false,
  sidebarCollapsed: false,
  uiMode: 'simple',
  userName: 'Alex',
  setupDone: false,
  language: 'en',
  defaultFolder: DEFAULT_FOLDER,
  maxConnections: 8,
  bandwidthLimit: 0,
  bandwidthPlan: [],
  retryAttempts: 3,
  tempFileBehavior: 'keep',
  fileAllocation: 'sparse',
  checksumMode: 'SHA256',
  autoCategorize: true,
  categoryFolders: {},
  showCompleteDialog: true,
  showProgressWindow: true,
  watchClipboard: false,
  dropTarget: false,
  notifications: {
    downloadCompleted: true,
    downloadFailed: true,
    queueFinished: true,
    schedulerStarted: false,
    desktop: true,
  },
  startupBehavior: {
    launchOnStartup: false,
    minimizeToTray: true,
    confirmBeforeDelete: true,
  },
  network: {
    proxyMode: 'system',
    proxyHost: '',
    proxyPort: 8080,
    vpnAwareness: true,
    timeoutSec: 30,
    dnsServers: '',
    userAgent: '',
  },
  logFolder: '~/.local/share/kelmo/logs',
  diagnosticMode: false,
};

/** First-run speed profiles: real engine settings, nothing cosmetic. */
export const SPEED_PROFILES = [
  { id: 'max', title: 'Maximum Speed', tagline: 'Go as fast as possible', connections: 16, limit: 0,
    text: 'Up to 16 connections per download and no speed limit. Uses all of your bandwidth.' },
  { id: 'balanced', title: 'Balanced', tagline: 'A great all-round experience', connections: 8, limit: 0,
    text: '8 connections per download, no speed limit. Fast, and kind to your network.' },
  { id: 'background', title: 'Background', tagline: 'Download quietly', connections: 4, limit: 5 * MB,
    text: '4 connections and a 5 MB/s limit, so you can keep working while downloads run.' },
] as const;

export const BANDWIDTH_PRESETS: Array<{ label: string; value: number }> = [
  { label: 'Unlimited', value: 0 },
  { label: '0.5 MB/s', value: MB / 2 },
  { label: '1 MB/s', value: 1 * MB },
  { label: '2 MB/s', value: 2 * MB },
  { label: '5 MB/s', value: 5 * MB },
  { label: '10 MB/s', value: 10 * MB },
  { label: '20 MB/s', value: 20 * MB },
  { label: '50 MB/s', value: 50 * MB },
  { label: '100 MB/s', value: 100 * MB },
];

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'ur', label: 'اردو' },
  { value: 'pt', label: 'Português' },
];
