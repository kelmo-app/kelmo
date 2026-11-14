import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { platform } from '@/services/platform';
import type { VideoStatus } from '@/types/global';
import { Button } from '@/components/ui/Button';
import { SettingRow } from './SettingRow';

/** Settings → Download Engine: the helper (yt-dlp) that lets KDM download from YouTube and other video sites. */
export function VideoDownloaderRow() {
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(() => void platform.videoStatus().then(setStatus).catch(() => setStatus(null)), []);
  useEffect(refresh, [refresh]);

  if (!platform.isElectron) return null;

  const install = async () => {
    setBusy(true);
    setMessage(null);
    const r = await platform.installVideo();
    setBusy(false);
    setMessage(r.ok ? { ok: true, text: `Ready (yt-dlp ${r.version})` } : { ok: false, text: r.error });
    refresh();
  };

  const parts: string[] = [];
  if (status?.installed) parts.push(`yt-dlp ${status.version}${status.managed ? '' : ' (from your system)'}`);
  if (status) {
    parts.push(status.ffmpeg ? 'ffmpeg found: best qualities available' : 'ffmpeg not found: only ready-made qualities (sudo dnf install ffmpeg-free adds the best ones)');
    parts.push(status.runtime ? `JavaScript runtime: ${status.runtime.startsWith('node:') ? 'built into KDM' : status.runtime}` : 'no Deno or Node found: YouTube may offer fewer qualities (sudo dnf install nodejs)');
  }

  return (
    <SettingRow
      title="Video sites (YouTube and others)"
      description={`A small free helper, yt-dlp, lets KDM download videos from YouTube, Vimeo and many other sites. It is fetched from its official GitHub page, checked against the published SHA-256, and kept inside KDM. Sites change often, so press Update if a video stops working. ${parts.join(' · ')}`}
    >
      {message && <span className={message.ok ? 'text-[13px] font-medium text-ok' : 'max-w-[260px] text-[12px] text-bad'}>{message.text}</span>}
      <Button
        icon={busy ? <Loader2 size={15} className="animate-spin" /> : undefined}
        disabled={busy || !status || (status.installed && !status.managed)}
        onClick={() => void install()}
        title={status?.installed && !status.managed ? 'This copy belongs to your system: update it with your package manager.' : undefined}
        data-testid="video-install-settings"
      >
        {busy ? 'Working…' : status?.installed ? 'Update' : 'Install'}
      </Button>
    </SettingRow>
  );
}
