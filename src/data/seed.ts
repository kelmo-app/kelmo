/**
 * Demo data. This file is the ONLY place that knows about fake downloads.
 * Replace `createSeed()` with a real persistence/engine bootstrap later.
 */
import type {
  ActivityEntry,
  Category,
  ChecksumStatus,
  DownloadItem,
  Priority,
  Queue,
  ScheduleRule,
  SpeedSample,
} from '../types/index.ts';
import { classifyFile, domainOf } from '../lib/url.ts';
import { GB, KB, MB } from '../lib/format.ts';
import { DEFAULT_FOLDER } from './defaults.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export interface SeedData {
  items: DownloadItem[];
  queues: Queue[];
  rules: ScheduleRule[];
  activity: ActivityEntry[];
  history: SpeedSample[];
}

/** Tiny deterministic PRNG so the demo looks the same on every first launch. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  id: string;
  fileName: string;
  url: string;
  totalBytes: number;
  queueId: string;
  status?: DownloadItem['status'];
  progress?: number; // 0..100
  priority?: Priority;
  connections?: number;
  peakSpeed?: number;
  category?: Category;
  checksum?: ChecksumStatus;
  error?: string;
  retries?: number;
  folder?: string;
}

function build(spec: Spec, now: number, createdAgo: number): DownloadItem {
  const { fileType, category: auto } = classifyFile(spec.fileName);
  const category = spec.category ?? auto;
  const status = spec.status ?? 'queued';
  const progress = status === 'completed' ? 100 : spec.progress ?? 0;
  const downloadedBytes = Math.round((spec.totalBytes * progress) / 100);
  const peak = spec.peakSpeed ?? 10 * MB;
  const running = status === 'downloading';
  const speed = running ? Math.round(peak * 0.82) : 0;
  const remaining = spec.totalBytes - downloadedBytes;
  return {
    id: spec.id,
    fileName: spec.fileName,
    url: spec.url,
    sourceDomain: domainOf(spec.url),
    category,
    fileType,
    totalBytes: spec.totalBytes,
    downloadedBytes,
    progress,
    speed,
    eta: running && speed > 0 ? remaining / speed : null,
    status,
    priority: spec.priority ?? 'normal',
    connections: spec.connections ?? 8,
    destination: `${DEFAULT_FOLDER}/${spec.folder ?? category}`,
    createdAt: now - createdAgo,
    startedAt: status === 'queued' ? null : now - createdAgo + 30_000,
    completedAt: null,
    checksumStatus: spec.checksum ?? (status === 'completed' ? 'verified' : 'pending'),
    checksumAlgo: 'SHA256',
    queueId: spec.queueId,
    peakSpeed: peak,
    speedLimit: 0,
    retries: spec.retries ?? 0,
    error: spec.error ?? null,
    durationSec: Math.round((spec.totalBytes * (progress / 100)) / (peak * 0.8)),
  };
}

interface DoneSpec extends Omit<Spec, 'status' | 'progress'> {
  ago: number; // ms ago completed
  durationSec: number;
}

function done(spec: DoneSpec, now: number): DownloadItem {
  const it = build({ ...spec, status: 'completed' }, now, spec.ago + spec.durationSec * 1000 + 20_000);
  it.completedAt = now - spec.ago;
  it.durationSec = spec.durationSec;
  it.startedAt = it.completedAt - spec.durationSec * 1000;
  it.speed = 0;
  it.eta = null;
  return it;
}

export function createSeed(now = Date.now()): SeedData {
  const rand = mulberry32(2026);

  const queues: Queue[] = [
    {
      id: 'q-main',
      name: 'Main Downloads',
      description: 'Everyday downloads — your default destination.',
      status: 'running',
      itemIds: [],
      maxConcurrentDownloads: 3,
      maxConnectionsPerDownload: 8,
      bandwidthLimit: 0,
      retryFailed: true,
      autoStartNext: true,
      scheduled: false,
      pauseOnBattery: false,
      pauseOnVpnDisconnected: false,
      createdAt: now - 90 * DAY,
      tone: 'cyan',
    },
    {
      id: 'q-night',
      name: 'Night Bandwidth',
      description: 'Large transfers that wait for off-peak hours.',
      status: 'running',
      itemIds: [],
      maxConcurrentDownloads: 3,
      maxConnectionsPerDownload: 16,
      bandwidthLimit: 0,
      retryFailed: true,
      autoStartNext: true,
      scheduled: true,
      pauseOnBattery: true,
      pauseOnVpnDisconnected: false,
      createdAt: now - 80 * DAY,
      tone: 'violet',
    },
    {
      id: 'q-work',
      name: 'Work Projects',
      description: 'Project assets, backups and reference documents.',
      status: 'paused',
      itemIds: [],
      maxConcurrentDownloads: 2,
      maxConnectionsPerDownload: 6,
      bandwidthLimit: 15 * MB,
      retryFailed: true,
      autoStartNext: true,
      scheduled: false,
      pauseOnBattery: false,
      pauseOnVpnDisconnected: true,
      createdAt: now - 60 * DAY,
      tone: 'amber',
    },
    {
      id: 'q-linux',
      name: 'Linux Images',
      description: 'Distribution ISOs and verified mirrors.',
      status: 'running',
      itemIds: [],
      maxConcurrentDownloads: 2,
      maxConnectionsPerDownload: 8,
      bandwidthLimit: 0,
      retryFailed: true,
      autoStartNext: true,
      scheduled: false,
      pauseOnBattery: false,
      pauseOnVpnDisconnected: false,
      createdAt: now - 70 * DAY,
      tone: 'green',
    },
    {
      id: 'q-archive',
      name: 'Archive Queue',
      description: 'Slow, low-priority archive pulls — Saturday mornings.',
      status: 'running',
      itemIds: [],
      maxConcurrentDownloads: 1,
      maxConnectionsPerDownload: 4,
      bandwidthLimit: 8 * MB,
      retryFailed: true,
      autoStartNext: true,
      scheduled: true,
      pauseOnBattery: true,
      pauseOnVpnDisconnected: false,
      createdAt: now - 40 * DAY,
      tone: 'slate',
    },
  ];

  const live: DownloadItem[] = [
    build(
      {
        id: 'd-ubuntu',
        fileName: 'ubuntu-26.04-desktop-amd64.iso',
        url: 'https://releases.ubuntu.com/26.04/ubuntu-26.04-desktop-amd64.iso',
        totalBytes: 4.8 * GB,
        progress: 25,
        status: 'downloading',
        priority: 'high',
        connections: 8,
        peakSpeed: 26 * MB,
        queueId: 'q-linux',
      },
      now,
      18 * MIN,
    ),
    build(
      {
        id: 'd-docs',
        fileName: 'kelmo-documentation-archive.zip',
        url: 'https://docs.kelmo.dev/releases/kelmo-documentation-archive.zip',
        totalBytes: 860 * MB,
        progress: 63,
        status: 'downloading',
        priority: 'normal',
        connections: 3,
        peakSpeed: 9.4 * MB,
        queueId: 'q-main',
        category: 'Documents',
      },
      now,
      9 * MIN,
    ),
    build(
      {
        id: 'd-blender',
        fileName: 'blender-4.2.0-linux-x64.tar.xz',
        url: 'https://download.blender.org/release/Blender4.2/blender-4.2.0-linux-x64.tar.xz',
        totalBytes: 1.4 * GB,
        progress: 52,
        status: 'downloading',
        priority: 'normal',
        connections: 6,
        peakSpeed: 12.5 * MB,
        queueId: 'q-main',
        category: 'Programs',
      },
      now,
      14 * MIN,
    ),
    build(
      {
        id: 'd-video',
        fileName: 'open-source-video-assets-4k.zip',
        url: 'https://archive.org/download/open-video-assets/open-source-video-assets-4k.zip',
        totalBytes: 3.2 * GB,
        progress: 24,
        status: 'downloading',
        priority: 'low',
        connections: 4,
        peakSpeed: 9.6 * MB,
        queueId: 'q-main',
        category: 'Video',
      },
      now,
      6 * MIN,
    ),
    // ---- Up next (Main) ----
    build(
      {
        id: 'd-godot',
        fileName: 'godot-4.3-stable-linux.x86_64.zip',
        url: 'https://downloads.tuxfamily.org/godotengine/4.3/Godot_v4.3-stable_linux.x86_64.zip',
        totalBytes: 892 * MB,
        priority: 'high',
        peakSpeed: 11 * MB,
        queueId: 'q-main',
        category: 'Programs',
      },
      now,
      4 * MIN,
    ),
    build(
      {
        id: 'd-kdenlive',
        fileName: 'kdenlive-24.08.1-x86_64.AppImage',
        url: 'https://files.kde.org/kdenlive/release/kdenlive-24.08.1-x86_64.AppImage',
        totalBytes: 315 * MB,
        priority: 'normal',
        peakSpeed: 8 * MB,
        queueId: 'q-main',
      },
      now,
      4 * MIN,
    ),
    build(
      {
        id: 'd-cc-assets',
        fileName: 'assets-pack-creative-commons.zip',
        url: 'https://mirror.archive.org/assets/assets-pack-creative-commons.zip',
        totalBytes: 1.1 * GB,
        priority: 'low',
        peakSpeed: 7 * MB,
        queueId: 'q-main',
      },
      now,
      3 * MIN,
    ),
    // ---- Paused / failed (Main) ----
    build(
      {
        id: 'd-forest',
        fileName: 'forest-ambience-1h.flac',
        url: 'https://archive.org/download/ambience/forest-ambience-1h.flac',
        totalBytes: 1.1 * GB,
        progress: 24,
        status: 'paused',
        priority: 'low',
        peakSpeed: 6 * MB,
        queueId: 'q-main',
        category: 'Music',
      },
      now,
      3 * HOUR,
    ),
    build(
      {
        id: 'd-libreoffice',
        fileName: 'libreoffice-25.8.0-linux-x86-64.deb',
        url: 'https://download.documentfoundation.org/libreoffice/stable/25.8.0/deb/libreoffice-25.8.0-linux-x86-64.deb',
        totalBytes: 214 * MB,
        progress: 71,
        status: 'failed',
        priority: 'normal',
        peakSpeed: 9 * MB,
        queueId: 'q-main',
        error: 'Connection reset by peer (ECONNRESET) after 3 retries',
        retries: 3,
        category: 'Programs',
      },
      now,
      95 * MIN,
    ),
    // ---- Linux Images ----
    build(
      {
        id: 'd-fedora',
        fileName: 'fedora-workstation-43-x86_64.iso',
        url: 'https://download.fedoraproject.org/pub/fedora/linux/releases/43/Workstation/x86_64/iso/fedora-workstation-43-x86_64.iso',
        totalBytes: 2.3 * GB,
        priority: 'high',
        peakSpeed: 14 * MB,
        queueId: 'q-linux',
      },
      now,
      12 * MIN,
    ),
    build(
      {
        id: 'd-debian',
        fileName: 'debian-13.1.0-amd64-netinst.iso',
        url: 'https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.1.0-amd64-netinst.iso',
        totalBytes: 754 * MB,
        priority: 'normal',
        peakSpeed: 12 * MB,
        queueId: 'q-linux',
      },
      now,
      12 * MIN,
    ),
    // ---- Night Bandwidth ----
    build(
      {
        id: 'd-cache',
        fileName: 'cache-datasets-2026-10.tar.zst',
        url: 'https://data.commoncrawl.org/cache-datasets-2026-10.tar.zst',
        totalBytes: 6.4 * GB,
        priority: 'normal',
        peakSpeed: 22 * MB,
        queueId: 'q-night',
      },
      now,
      5 * HOUR,
    ),
    build(
      {
        id: 'd-imagenet',
        fileName: 'dataset-imagenet-subset.zip',
        url: 'https://www.kaggle.com/datasets/imagenet-subset/dataset-imagenet-subset.zip',
        totalBytes: 2.1 * GB,
        priority: 'low',
        peakSpeed: 18 * MB,
        queueId: 'q-night',
        category: 'Compressed',
      },
      now,
      5 * HOUR,
    ),
    build(
      {
        id: 'd-osm',
        fileName: 'planet-latest.osm.pbf',
        url: 'https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf',
        totalBytes: 74 * GB,
        priority: 'low',
        peakSpeed: 25 * MB,
        queueId: 'q-night',
        category: 'Compressed',
      },
      now,
      4 * HOUR,
    ),
    // ---- Work Projects (queue paused) ----
    build(
      {
        id: 'd-backup',
        fileName: 'project-backup-2026-q3.tar.gz',
        url: 'https://backup.internal.example.org/archives/project-backup-2026-q3.tar.gz',
        totalBytes: 3.8 * GB,
        progress: 38,
        status: 'paused',
        priority: 'high',
        peakSpeed: 14 * MB,
        queueId: 'q-work',
        category: 'Compressed',
      },
      now,
      2 * HOUR,
    ),
    build(
      {
        id: 'd-design',
        fileName: 'design-system-assets-v3.zip',
        url: 'https://assets.figma-community.example.org/design-system-assets-v3.zip',
        totalBytes: 1.2 * GB,
        priority: 'normal',
        peakSpeed: 10 * MB,
        queueId: 'q-work',
      },
      now,
      2 * HOUR,
    ),
    build(
      {
        id: 'd-brief',
        fileName: 'project-brief-q4.pdf',
        url: 'https://drive.example.org/files/project-brief-q4.pdf',
        totalBytes: 14.6 * MB,
        priority: 'normal',
        peakSpeed: 5 * MB,
        queueId: 'q-work',
      },
      now,
      2 * HOUR,
    ),
    // ---- Archive Queue ----
    build(
      {
        id: 'd-wiki',
        fileName: 'enwiki-latest-pages-articles.xml.bz2',
        url: 'https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-pages-articles.xml.bz2',
        totalBytes: 22 * GB,
        priority: 'low',
        peakSpeed: 8 * MB,
        queueId: 'q-archive',
      },
      now,
      DAY,
    ),
    build(
      {
        id: 'd-gutenberg',
        fileName: 'gutenberg-top-1000.tar',
        url: 'https://mirror.gutenberg.org/gutenberg-top-1000.tar',
        totalBytes: 5.2 * GB,
        priority: 'low',
        peakSpeed: 8 * MB,
        queueId: 'q-archive',
      },
      now,
      DAY,
    ),
  ];

  const completed: DownloadItem[] = [
    done({ id: 'c-kelmo-wp', fileName: 'KELMO_Whitepaper_v1.0.pdf', url: 'https://kelmo.dev/papers/KELMO_Whitepaper_v1.0.pdf', totalBytes: 4.2 * MB, queueId: 'q-work', ago: 2 * MIN, durationSec: 3 }, now),
    done({ id: 'c-k8s', fileName: 'kubernetes-1.34.0-linux-amd64.tar.gz', url: 'https://dl.k8s.io/v1.34.0/kubernetes-1.34.0-linux-amd64.tar.gz', totalBytes: 276 * MB, queueId: 'q-main', ago: 95 * MIN, durationSec: 34, category: 'Programs' }, now),
    done({ id: 'c-arch', fileName: 'archlinux-2026.10.01-x86_64.iso', url: 'https://geo.mirror.pkgbuild.com/iso/2026.10.01/archlinux-2026.10.01-x86_64.iso', totalBytes: 1.4 * GB, queueId: 'q-linux', ago: 7 * HOUR, durationSec: 142 }, now),
    done({ id: 'c-wallpaper', fileName: 'nature-4k-wallpaper.jpg', url: 'https://unsplash.com/photos/alpine-lake/nature-4k-wallpaper.jpg', totalBytes: 8.6 * MB, queueId: 'q-main', ago: 9 * HOUR, durationSec: 2 }, now),
    done({ id: 'c-mint', fileName: 'linuxmint-22-cinnamon-64bit.iso', url: 'https://mirrors.kernel.org/linuxmint/stable/22/linuxmint-22-cinnamon-64bit.iso', totalBytes: 2.9 * GB, queueId: 'q-linux', ago: 1 * DAY + 3 * HOUR, durationSec: 410 }, now),
    done({ id: 'c-python', fileName: 'python-3.13.2-amd64.exe', url: 'https://www.python.org/ftp/python/3.13.2/python-3.13.2-amd64.exe', totalBytes: 27 * MB, queueId: 'q-main', ago: 2 * DAY + 5 * HOUR, durationSec: 6, category: 'Programs' }, now),
    done({ id: 'c-bbb', fileName: 'big-buck-bunny-4k.mkv', url: 'https://archive.org/download/BigBuckBunny/big-buck-bunny-4k.mkv', totalBytes: 8.4 * GB, queueId: 'q-main', ago: 3 * DAY, durationSec: 980 }, now),
    done({ id: 'c-blender41', fileName: 'blender-4.1.0-windows-x64.zip', url: 'https://download.blender.org/release/Blender4.1/blender-4.1.0-windows-x64.zip', totalBytes: 412 * MB, queueId: 'q-main', ago: 3 * DAY + 4 * HOUR, durationSec: 58, category: 'Programs' }, now),
    done({ id: 'c-arch-ref', fileName: 'reference-architecture.pdf', url: 'https://docs.aws.amazon.com/whitepapers/reference-architecture.pdf', totalBytes: 14.2 * MB, queueId: 'q-work', ago: 4 * DAY, durationSec: 4 }, now),
    done({ id: 'c-vscode', fileName: 'vscode-linux-x64.tar.gz', url: 'https://update.code.visualstudio.com/latest/linux-x64/stable/vscode-linux-x64.tar.gz', totalBytes: 186 * MB, queueId: 'q-main', ago: 5 * DAY, durationSec: 31, category: 'Programs' }, now),
    done({ id: 'c-lofi', fileName: 'lofi-focus-ambient.mp3', url: 'https://archive.org/download/lofi/lofi-focus-ambient.mp3', totalBytes: 9.4 * MB, queueId: 'q-main', ago: 6 * DAY, durationSec: 5 }, now),
    done({ id: 'c-q3', fileName: 'Q3_Research_Data.xlsx', url: 'https://figshare.com/ndownloader/files/Q3_Research_Data.xlsx', totalBytes: 2.1 * MB, queueId: 'q-work', ago: 6 * DAY + 2 * HOUR, durationSec: 2 }, now),
    done({ id: 'c-license', fileName: 'open-source-license.pdf', url: 'https://www.gnu.org/licenses/open-source-license.pdf', totalBytes: 220 * KB, queueId: 'q-work', ago: 8 * DAY, durationSec: 1, checksum: 'none' }, now),
    done({ id: 'c-imagenet-old', fileName: 'dataset-imagenet-2024.zip', url: 'https://www.kaggle.com/datasets/imagenet/dataset-imagenet-2024.zip', totalBytes: 2.1 * GB, queueId: 'q-night', ago: 9 * DAY, durationSec: 318, category: 'Compressed' }, now),
    done({ id: 'c-community', fileName: 'community-update.pptx', url: 'https://drive.google.com/files/community-update.pptx', totalBytes: 6.7 * MB, queueId: 'q-work', ago: 11 * DAY, durationSec: 3 }, now),
    done({ id: 'c-demo', fileName: 'product-demo.mov', url: 'https://vimeo.com/download/product-demo.mov', totalBytes: 102 * MB, queueId: 'q-main', ago: 13 * DAY, durationSec: 19 }, now),
    done({ id: 'c-debian12', fileName: 'debian-12.7.0-amd64-DVD-1.iso', url: 'https://cdimage.debian.org/cdimage/archive/12.7.0/amd64/iso-dvd/debian-12.7.0-amd64-DVD-1.iso', totalBytes: 3.7 * GB, queueId: 'q-linux', ago: 21 * DAY, durationSec: 560 }, now),
    done({ id: 'c-fedora41', fileName: 'fedora-workstation-41-x86_64.iso', url: 'https://download.fedoraproject.org/pub/fedora/linux/releases/41/Workstation/x86_64/iso/fedora-workstation-41-x86_64.iso', totalBytes: 2.2 * GB, queueId: 'q-linux', ago: 34 * DAY, durationSec: 366 }, now),
  ];

  // KELMO's own file is the freshest completion; give one a mismatch so the UI shows an error state.
  const mismatch = completed.find((c) => c.id === 'c-demo');
  if (mismatch) mismatch.checksumStatus = 'mismatch';

  const items = [...live, ...completed];
  for (const q of queues) {
    q.itemIds = items.filter((i) => i.queueId === q.id).map((i) => i.id);
  }

  const rules: ScheduleRule[] = [
    {
      id: 'r-night',
      name: 'Night bandwidth',
      queueId: 'q-night',
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: '23:00',
      endTime: '06:00',
      bandwidthLimit: 0,
      maxSimultaneous: 3,
      afterCompletion: 'notify',
      enabled: true,
    },
    {
      id: 'r-archive',
      name: 'Weekly archive',
      queueId: 'q-archive',
      days: [5],
      startTime: '02:00',
      endTime: '05:00',
      bandwidthLimit: 8 * MB,
      maxSimultaneous: 1,
      afterCompletion: 'none',
      enabled: true,
    },
    {
      id: 'r-linux',
      name: 'Linux mirrors',
      queueId: 'q-linux',
      days: [0, 1, 2, 3, 4],
      startTime: '00:00',
      endTime: '06:00',
      bandwidthLimit: 40 * MB,
      maxSimultaneous: 2,
      afterCompletion: 'none',
      enabled: true,
    },
    {
      id: 'r-project',
      name: 'Project sync',
      queueId: 'q-work',
      days: [6],
      startTime: '08:00',
      endTime: '10:00',
      bandwidthLimit: 15 * MB,
      maxSimultaneous: 2,
      afterCompletion: 'sleep',
      enabled: false,
    },
  ];

  const activity: ActivityEntry[] = completed
    .filter((c) => c.completedAt != null)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 6)
    .map((c, i) => ({
      id: `a-seed-${i}`,
      at: c.completedAt ?? now,
      kind: 'completed' as const,
      message: `${c.fileName} downloaded`,
      itemId: c.id,
    }));

  const history: SpeedSample[] = Array.from({ length: 90 }, (_, i) => {
    const wave = Math.sin(i / 7) * 5 + Math.sin(i / 3.1) * 2.5;
    return {
      t: now - (90 - i) * 1000,
      down: Math.max(8, 34 + wave + rand() * 7) * MB,
      up: (1.6 + rand() * 1.4) * MB,
    };
  });

  return { items, queues, rules, activity, history };
}
