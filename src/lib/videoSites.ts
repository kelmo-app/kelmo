import type { VideoInfo, VideoStatus } from '@/types/global';

/** Same rule as engine/ytdlp.mjs (isVideoSiteUrl): pages of video sites, which only yt-dlp can turn into a file. */
const SITES = [
  /(^|\.)youtube\.com$/, /^youtu\.be$/, /(^|\.)youtube-nocookie\.com$/,
  /(^|\.)vimeo\.com$/, /(^|\.)dailymotion\.com$/, /^dai\.ly$/, /(^|\.)bilibili\.com$/, /^b23\.tv$/,
  /(^|\.)twitch\.tv$/, /(^|\.)tiktok\.com$/, /(^|\.)instagram\.com$/, /(^|\.)facebook\.com$/, /^fb\.watch$/,
  /(^|\.)twitter\.com$/, /(^|\.)x\.com$/, /(^|\.)reddit\.com$/, /(^|\.)soundcloud\.com$/, /(^|\.)bandcamp\.com$/,
];

export function isVideoSite(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.toLowerCase();
  if (!SITES.some((re) => re.test(host))) return false;
  if (/\.(mp4|webm|mkv|mp3|m4a|jpg|png|zip)$/i.test(u.pathname)) return false;
  if (/(^|\.)youtube\.com$/.test(host)) {
    if (u.pathname === '/watch') return u.searchParams.has('v');
    return u.pathname === '/playlist' || /^\/(shorts|live|embed|v)\/[\w-]+/.test(u.pathname);
  }
  return true;
}

export interface VideoChoice {
  value: string;
  label: string;
  /** expected size in bytes, 0 when unknown */
  size: number;
}

const heightLabel = (h: number) => (h >= 2160 ? `${h}p (4K)` : h >= 1440 ? `${h}p (2K)` : h >= 1080 ? `${h}p (Full HD)` : h >= 720 ? `${h}p (HD)` : `${h}p`);

/**
 * The qualities to offer. Joining separate video and sound needs ffmpeg, so without it only the ready-made
 * files are listed (and `limited` tells the window to explain why the better ones are missing).
 */
export function videoChoices(info: VideoInfo, ffmpeg: boolean): { choices: VideoChoice[]; limited: boolean } {
  const usable = ffmpeg ? info.heights : (info.muxedHeights ?? []);
  const limited = !ffmpeg && info.heights.length > usable.length;
  const out: VideoChoice[] = [];
  if (usable.length) {
    out.push({ value: 'best', label: `Best available (${usable[0]}p)`, size: info.sizes?.[usable[0]] ?? 0 });
    for (const h of usable.slice(0, 8)) out.push({ value: String(h), label: heightLabel(h), size: info.sizes?.[h] ?? 0 });
  } else if (!info.audioOnly) {
    out.push({ value: 'best', label: 'Best available', size: 0 });
  }
  if (info.audioOnly || info.heights.length > 0) out.push({ value: 'audio', label: ffmpeg ? 'Audio only (MP3)' : 'Audio only', size: info.audioSize ?? 0 });
  return { choices: out, limited };
}

/** The file name offered for a video: its title with the extension the choice gives. */
export function videoFileName(title: string, choice: string, ffmpeg: boolean): string {
  const ext = choice === 'audio' ? (ffmpeg ? 'mp3' : 'm4a') : 'mp4';
  return `${title}.${ext}`;
}

export function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** What the window says when the video downloader cannot do its best on this computer. Empty when everything is fine. */
export function videoHints(url: string, status: VideoStatus | null): string[] {
  if (!status) return [];
  const hints: string[] = [];
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* no hint */
  }
  if (/youtube\.com$|youtu\.be$/.test(host) && !status.runtime) {
    hints.push('YouTube works best with Deno or Node installed (for example: sudo dnf install nodejs). Without it some qualities may be missing.');
  }
  return hints;
}
