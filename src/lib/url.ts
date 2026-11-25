import type { Category, FileType } from '../types/index.ts';

/** A magnet link (BitTorrent). */
export function isMagnetUrl(raw: string): boolean {
  return /^magnet:\?/i.test(raw.trim()) && /[?&]xt=urn:bt(ih|mh):/i.test(raw);
}

/** A .torrent file on this computer ("Open with KDM"). */
export function isTorrentFileUrl(raw: string): boolean {
  return /^file:\/\/\/?[^\s?#]+\.torrent$/i.test(raw.trim());
}

export function isValidUrl(raw: string): boolean {
  if (isMagnetUrl(raw) || isTorrentFileUrl(raw)) return true;
  try {
    const u = new URL(raw.trim());
    return ['http:', 'https:', 'ftp:'].includes(u.protocol) && !!u.hostname.includes('.');
  } catch {
    return false;
  }
}

export function looksLikeUrl(raw: string): boolean {
  return /^(https?|ftp):\/\//i.test(raw.trim()) || isMagnetUrl(raw) || isTorrentFileUrl(raw);
}

export function domainOf(raw: string): string {
  if (isMagnetUrl(raw) || isTorrentFileUrl(raw)) return 'torrent';
  try {
    return new URL(raw.trim()).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

export function fileNameFromUrl(raw: string): string {
  if (isTorrentFileUrl(raw)) { try { return decodeURIComponent(raw.trim().split('/').pop() || '').replace(/\.torrent$/i, '') || 'Torrent'; } catch { return 'Torrent'; } }
  if (isMagnetUrl(raw)) {
    try { return new URL(raw.trim()).searchParams.get('dn')?.replace(/[\\/:*?"<>|\0]/g, '_').trim().slice(0, 150) || 'Torrent'; } catch { return 'Torrent'; }
  }
  try {
    const u = new URL(raw.trim());
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
    return last || 'download.bin';
  } catch {
    return 'download.bin';
  }
}

const EXT_MAP: Array<[RegExp, FileType, Category]> = [
  [/\.(iso|img)$/i, 'iso', 'General'],
  [/\.(appimage|deb|rpm|flatpak|snap)$/i, 'package', 'Programs'],
  [/\.(exe|msi|dmg|pkg|apk)$/i, 'executable', 'Programs'],
  [/\.(zip|7z|rar|tar|tar\.gz|tgz|tar\.xz|tar\.zst|tar\.bz2|gz|xz|bz2|zst|ace|arj)$/i, 'archive', 'Compressed'],
  [/\.(mkv|mp4|mov|avi|webm|flv|wmv|m4v|mpg|mpeg|3gp|ogv)$/i, 'video', 'Video'],
  [/\.(mp3|flac|wav|ogg|m4a|aac|wma|opus)$/i, 'audio', 'Music'],
  [/\.(jpg|jpeg|png|gif|webp|svg|tiff)$/i, 'image', 'General'],
  [/\.(pdf|docx?|xlsx?|pptx?|md|txt|epub|odt|rtf|mobi|djvu)$/i, 'document', 'Documents'],
  [/\.(csv|parquet|jsonl|sqlite)$/i, 'dataset', 'General'],
];

export function classifyFile(fileName: string): { fileType: FileType; category: Category } {
  for (const [re, fileType, category] of EXT_MAP) {
    if (re.test(fileName)) return { fileType, category };
  }
  return { fileType: 'generic', category: 'General' };
}

export const CATEGORIES: Category[] = ['General', 'Compressed', 'Documents', 'Music', 'Programs', 'Video'];

/** Maps categories saved by older versions onto the current ones. */
const LEGACY: Record<string, Category> = {
  'Linux Images': 'General',
  Applications: 'Programs',
  Media: 'Video',
  Archives: 'Compressed',
  Other: 'General',
};
export function normalizeCategory(c: unknown, fileName = ''): Category {
  if (typeof c === 'string' && (CATEGORIES as string[]).includes(c)) return c as Category;
  if (c === 'Media' && fileName) return classifyFile(fileName).category;
  return (typeof c === 'string' && LEGACY[c]) || 'General';
}

/** Folder for a category: the user's choice, else `<default folder>/<category>`. */
export function categoryFolder(category: Category, defaultFolder: string, overrides: Partial<Record<Category, string>> = {}): string {
  const o = overrides[category]?.trim();
  // like IDM: files that fit no category go straight into the main folder; the other categories get a folder of their own
  if (o) return o;
  const base = defaultFolder.replace(/\/+$/, '');
  return category === 'General' ? base : `${base}/${category}`;
}
