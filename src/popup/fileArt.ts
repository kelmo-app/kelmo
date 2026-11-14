/** Which artwork a file gets in the small windows. Pure, so it can be tested. */
export type ArtKind = 'iso' | 'software' | 'pdf' | 'audio' | 'archive' | 'image' | 'video' | 'document' | 'font' | 'code' | 'generic';

const EXT: Record<ArtKind, string[]> = {
  iso: ['iso', 'img', 'dmg', 'vhd', 'vhdx', 'vmdk'],
  software: ['exe', 'msi', 'deb', 'rpm', 'appimage', 'apk', 'pkg', 'flatpak', 'snap', 'run', 'bat'],
  pdf: ['pdf'],
  audio: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'wma'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'tgz', 'cab'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tif', 'tiff', 'ico'],
  video: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg', '3gp'],
  document: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'rtf', 'epub', 'mobi', 'csv', 'md'],
  font: ['ttf', 'otf', 'woff', 'woff2'],
  code: ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'rs', 'go', 'json', 'html', 'css', 'sh', 'yml', 'yaml', 'xml', 'sql', 'php', 'rb'],
  generic: [],
};

const BY_EXT = new Map<string, ArtKind>();
for (const [kind, list] of Object.entries(EXT) as Array<[ArtKind, string[]]>) for (const e of list) BY_EXT.set(e, kind);

export function artKind(fileName: string): ArtKind {
  const m = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return (m && BY_EXT.get(m[1].toLowerCase())) || 'generic';
}

export const ART_LABEL: Record<ArtKind, string> = {
  iso: 'Disk image',
  software: 'Software',
  pdf: 'PDF document',
  audio: 'Audio',
  archive: 'Archive',
  image: 'Image',
  video: 'Video',
  document: 'Document',
  font: 'Font',
  code: 'Code',
  generic: 'File',
};
