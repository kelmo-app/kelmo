import { AlertTriangle, Download, Film, Loader2 } from 'lucide-react';
import type { VideoState } from '@/hooks/useVideoLink';
import type { VideoStatus } from '@/types/global';
import { formatBytes } from '@/lib/format';
import { formatDuration, videoChoices, videoHints } from '@/lib/videoSites';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Fields';

interface Props {
  url: string;
  state: VideoState;
  status: VideoStatus | null;
  choice: string;
  onChoice: (c: string) => void;
  onInstall: () => void;
  onRetry: () => void;
  /** the browser's login can be used for this site (the link came from the extension) */
  canUseLogin?: boolean;
  loginOn?: boolean;
  onUseLogin?: () => void;
}

/** What a video-site link looks like in the add windows: the helper to install, or the title and a quality list. */
export function VideoPanel({ url, state, status, choice, onChoice, onInstall, onRetry, canUseLogin, loginOn, onUseLogin }: Props) {
  if (state.kind === 'none') return null;
  const box = 'flex flex-col gap-2 rounded-lg border border-line bg-surface2/50 px-3 py-2.5 text-xs text-fg3';

  if (state.kind === 'loading') {
    return (
      <div className={box + ' min-h-[34px] flex-row items-center'} aria-live="polite" data-testid="video-panel">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Reading the video…
      </div>
    );
  }
  if (state.kind === 'install') {
    return (
      <div className={box} data-testid="video-panel">
        <p className="text-[12.5px] text-fg">
          <Film className="mr-1.5 inline h-3.5 w-3.5 text-accent" aria-hidden />
          To download from YouTube and other video sites KDM needs a small free helper, <b>yt-dlp</b> (about 35 MB).
        </p>
        <p>It is downloaded once from its official GitHub page, checked against the published checksum, and kept inside KDM’s own folder.</p>
        {state.error && <p className="text-bad">{state.error}</p>}
        <div>
          <Button variant="primary" icon={state.installing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} disabled={state.installing} onClick={onInstall} data-testid="video-install">
            {state.installing ? 'Installing…' : 'Install video downloader'}
          </Button>
        </div>
      </div>
    );
  }
  if (state.kind === 'error') {
    // YouTube's "confirm you're not a robot": the usual cure is to let yt-dlp present the browser's own login
    if (/not a bot|sign in to confirm/i.test(state.message)) {
      return (
        <div className={box} data-testid="video-panel" aria-live="polite">
          <p className="flex items-start gap-2 text-fg">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
            YouTube wants to be sure you are not a robot{loginOn ? ' and still refused, even with your browser login. Try again later, or open the video in the browser and send it again.' : '.'}
          </p>
          {canUseLogin && !loginOn && onUseLogin && (
            <div className="flex flex-col gap-1.5">
              <div><Button variant="primary" onClick={onUseLogin} data-testid="video-use-login">Use my browser login</Button></div>
              <p>KDM then shows YouTube the same login your browser has, for this video only. YouTube may limit accounts that download a lot.</p>
            </div>
          )}
          {!canUseLogin && <p>Open the video in your browser and press the KDM button (or right-click → Download this video with KDM): that sends your browser login along.</p>}
          <button type="button" className="w-fit font-medium text-accent hover:underline" onClick={onRetry}>Try again</button>
        </div>
      );
    }
    return (
      <div className={box + ' flex-row items-start'} data-testid="video-panel" aria-live="polite">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="break-words text-fg">{state.message}</p>
          <button type="button" className="mt-1 font-medium text-accent hover:underline" onClick={onRetry}>Try again</button>
        </div>
      </div>
    );
  }

  const { info } = state;
  const { choices, limited } = videoChoices(info, !!status?.ffmpeg);
  const hints = videoHints(url, status);
  const meta = [info.uploader, formatDuration(info.duration), loginOn ? 'using your browser login' : ''].filter(Boolean).join(' · ');
  return (
    <div className={box} data-testid="video-panel">
      <div className="min-w-0">
        <p className="line-clamp-2 text-[13px] font-medium text-fg" title={info.title}>{info.title}</p>
        {meta && <p>{meta}</p>}
      </div>
      <Select<string>
        label="Quality"
        value={choices.some((c) => c.value === choice) ? choice : (choices[0]?.value ?? 'best')}
        onValueChange={onChoice}
        options={choices.map((c) => ({ value: c.value, label: c.size ? `${c.label} · ${formatBytes(c.size)}` : c.label }))}
      />
      {limited && <p>Higher qualities need <b>ffmpeg</b> to join picture and sound (for example: sudo dnf install ffmpeg-free).</p>}
      {hints.map((h) => <p key={h} className="text-warn">{h}</p>)}
    </div>
  );
}
