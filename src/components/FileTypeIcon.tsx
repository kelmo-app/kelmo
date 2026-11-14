import { Database, Disc3, File, FileArchive, FileText, Film, Image as ImageIcon, Music, Package, AppWindow, type LucideIcon } from 'lucide-react';
import type { Category, FileType } from '@/types';
import { cn } from '@/lib/cn';
import { CATEGORY_TONE } from './Badges';

const ICONS: Record<FileType, LucideIcon> = {
  iso: Disc3,
  archive: FileArchive,
  executable: AppWindow,
  package: Package,
  video: Film,
  audio: Music,
  image: ImageIcon,
  document: FileText,
  dataset: Database,
  generic: File,
};

export function FileTypeIcon({ type, category, size = 'md', className }: { type: FileType; category: Category; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = ICONS[type];
  const box = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  const px = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-lg', box, CATEGORY_TONE[category], className)}>
      <Icon size={px} strokeWidth={1.8} />
    </span>
  );
}
