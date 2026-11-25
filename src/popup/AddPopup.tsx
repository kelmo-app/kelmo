import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileSearch, FolderOpen, Loader2, Lock } from 'lucide-react';
import type { Category } from '@/types';
import type { LinkInfo, PopupConfig } from '@/types/global';
import { CATEGORIES, fileNameFromUrl, isMagnetUrl, isTorrentFileUrl } from '@/lib/url';
import { formatBytes } from '@/lib/format';
import { headersFor } from '@/services/RealDownloadEngine';
import { Button } from '@/components/ui/Button';
import { Checkbox, Select } from '@/components/ui/Fields';
import { parseMirrors } from '@/lib/mirrors';
import { FileArt } from './FileArt';
import { ART_LABEL, artKind } from './fileArt';
import { categoryOfName, findUnfinishedMatch, folderFor } from './popupLogic';
import { LoginFields } from '@/components/LoginFields';
import { VideoPanel } from '@/components/VideoPanel';
import { useVideoLink } from '@/hooks/useVideoLink';
import { isVideoSite, videoChoices, videoFileName } from '@/lib/videoSites';

/** Window height: the basic form, plus room for the mirrors box and the login fields when they are open. */
const heightFor = (mirrors: boolean, login: boolean) => 480 + (mirrors ? 130 : 0) + (login ? 118 : 0);

export interface IncomingLink {
  url: string;
  fileName?: string;
  referrer?: string;
  cookie?: string;
  userAgent?: string;
}

const inputCls =
  'h-9 w-full rounded-md border border-line bg-surface2 px-3 text-sm text-fg placeholder:text-fg3 hover:border-fg3/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';

/** IDM's "Download File Info": opens over everything, KDM's main window stays where it was. */
export function AddPopup({ link, config }: { link: IncomingLink; config: PopupConfig | null }) {
  const api = window.kelmo!.popup;
  const folders = config?.categories ?? [];
  const [url, setUrl] = useState(link.url);
  const [fileName, setFileName] = useState(link.fileName || fileNameFromUrl(link.url));
  const [mirrorsOpen, setMirrorsOpen] = useState(false);
  const [mirrorText, setMirrorText] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  // for a video page the name from the extension is only a stand-in (the page title); yt-dlp's real title replaces it
  const [nameTouched, setNameTouched] = useState(!!link.fileName && !isVideoSite(link.url));
  const [category, setCategory] = useState<Category>(isVideoSite(link.url) ? 'Video' : categoryOfName(link.fileName || fileNameFromUrl(link.url)));
  const [catTouched, setCatTouched] = useState(false);
  const [folder, setFolder] = useState(folderFor(category, folders));
  const [remember, setRemember] = useState(true);
  const [info, setInfo] = useState<{ state: 'checking' | 'done' | 'failed'; data?: LinkInfo }>({ state: 'checking' });
  const [busy, setBusy] = useState(false);
  const urlOk = /^https?:\/\/\S+$/i.test(url.trim()) || isMagnetUrl(url) || isTorrentFileUrl(url);
  const isTorrent = isMagnetUrl(url) || isTorrentFileUrl(url) || /^https?:\/\/[^\s?#]+\.torrent(\?\S*)?$/i.test(url.trim());
  const sameLink = url.trim() === link.url;

  // a YouTube-like page: yt-dlp reads it and offers qualities instead of the usual file check
  const video = useVideoLink(url, true, sameLink ? (link.cookie ?? '') : '');
  const isVideo = isVideoSite(url) || video.state.kind !== 'none';
  const [choice, setChoice] = useState('best');
  const ready = video.state.kind === 'ready' ? video.state.info : null;
  const ffmpeg = !!video.status?.ffmpeg;
  const choiceList = ready ? videoChoices(ready, ffmpeg).choices : [];
  const activeChoice = choiceList.some((c) => c.value === choice) ? choice : (choiceList[0]?.value ?? 'best');
  const chosenSize = choiceList.find((c) => c.value === activeChoice)?.size ?? 0;

  // free space of the chosen drive, so a 26 GB video is not started on an 11 GB disk without a word
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      void (async () => { try { const r = await api.diskInfo?.(folder.trim() || '~'); if (alive) setFreeBytes(r ? r.free : null); } catch { if (alive) setFreeBytes(null); } })();
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [folder]);

  useEffect(() => {
    document.title = 'Download File Info';
  }, []);

  // look at the link right away: size, real file name, resume support
  useEffect(() => {
    if (!urlOk || isVideoSite(url) || isTorrent) return setInfo({ state: 'failed' });
    let stale = false;
    setInfo({ state: 'checking' });
    const t = window.setTimeout(async () => {
      const headers = sameLink ? headersFor({ referrer: link.referrer, cookie: link.cookie, userAgent: link.userAgent }) : undefined;
      const user = authUser.trim();
      const data = await window.kelmo!.engine.probe({ url: url.trim(), headers, auth: user ? { user, password: authPassword } : undefined, wantStatus: true }).catch(() => null);
      if (stale) return;
      if (data && 'ok' in data) {
        // "401": the site wants a login -> show the fields
        if (data.status === 401) {
          setNeedsLogin(true);
          setLoginOpen(true);
          void api.resize({ height: heightFor(mirrorsOpen, true) });
        }
        return setInfo({ state: 'failed' });
      }
      setNeedsLogin(false);
      if (!data) return setInfo({ state: 'failed' });
      setInfo({ state: 'done', data });
      if (!nameTouched && data.fileName) setFileName(data.fileName);
    }, 350);
    return () => {
      stale = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, authUser, authPassword]);

  // the video's own title becomes the file name (and follows the chosen quality) until the user types one
  useEffect(() => {
    if (ready && !nameTouched) setFileName(videoFileName(ready.title, activeChoice, ffmpeg));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeChoice, ffmpeg]);

  // the window is a little taller for the video panel; mirrors and login are not used for these links
  useEffect(() => {
    void api.resize({ height: isVideo ? 540 : heightFor(mirrorsOpen, loginOpen) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo]);

  // category follows the file name until the user picks one
  useEffect(() => {
    if (catTouched) return;
    const c: Category = isVideoSite(url) ? 'Video' : categoryOfName(fileName);
    setCategory(c);
    setFolder(folderFor(c, folders));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName, catTouched]);

  const pickCategory = (c: Category) => {
    setCatTouched(true);
    setCategory(c);
    setFolder(folderFor(c, folders));
  };

  const browse = async () => {
    const p = await api.pickFolder();
    if (p) setFolder(p);
  };

  const browseTorrent = async () => {
    const f = await api.pickTorrent();
    if (f) setUrl(f);
  };

  const submit = async (startNow: boolean) => {
    if (!urlOk || busy || (isVideo && !ready)) return;
    setBusy(true);
    const dir = folder.trim() || folderFor(category, folders);
    if (remember && dir !== folderFor(category, folders)) await api.rememberFolder({ category, folder: dir });
    await api.confirm({
      url: url.trim(),
      fileName: fileName.trim(),
      dir,
      category,
      startNow,
      ...(ready ? { video: { choice: activeChoice, size: chosenSize || undefined, useLogin: video.loginOn || undefined }, ...(video.loginOn && sameLink ? { cookie: link.cookie } : {}) } : { mirrors: parseMirrors(mirrorText, url) }),
      ...(!isVideo && authUser.trim() ? { authUser: authUser.trim(), authPassword } : {}),
      ...(sameLink && !isVideo ? { referrer: link.referrer, cookie: link.cookie, userAgent: link.userAgent } : {}),
    });
  };

  // The same file again under a new address (an expired link opened again from its page): offer to continue the old download.
  const resumeMatch = !isVideo && !isTorrent && info.state !== 'checking' && urlOk
    ? findUnfinishedMatch(config?.unfinished, { fileName: fileName.trim(), size: info.data?.size ?? 0 }, config?.waitingId)
    : null;
  const continueOld = async () => {
    if (!resumeMatch || busy) return;
    setBusy(true);
    await api.confirm({
      url: url.trim(), fileName: resumeMatch.item.fileName, dir: folder.trim() || folderFor(category, folders), category, startNow: true,
      replaceId: resumeMatch.item.id,
      ...(sameLink ? { referrer: link.referrer, cookie: link.cookie, userAgent: link.userAgent } : {}),
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void api.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api]);

  const d = info.data;
  const needBytes = isTorrent ? 0 : isVideo ? chosenSize : (d?.size ?? 0);
  const looksHtml = d?.contentType === 'text/html';
  const urlRef = useRef<HTMLInputElement>(null);

  return (
    <form
      className="flex h-full flex-col gap-3 overflow-y-auto p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(true);
      }}
    >
      {resumeMatch && (
        <div role="status" className="flex items-center gap-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2.5">
          <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg">
            <p className="font-semibold">{resumeMatch.waiting ? 'This is the new address you were waiting for.' : 'You already have a half-finished download of this file.'}</p>
            <p className="truncate text-fg2" title={resumeMatch.item.fileName}>
              {resumeMatch.item.fileName} · {formatBytes(resumeMatch.item.downloadedBytes)}{resumeMatch.item.totalBytes ? ` of ${formatBytes(resumeMatch.item.totalBytes)}` : ''} done. Continue it from where it stopped?
            </p>
          </div>
          <Button variant="primary" type="button" disabled={busy} onClick={() => void continueOld()}>Continue it</Button>
        </div>
      )}
      <div className="flex gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            URL
            <input ref={urlRef} className={inputCls + ' font-mono text-[13px]'} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} aria-label="URL" />
            {!isVideo && <button type="button" className="self-start text-xs font-normal text-accent hover:underline" onClick={() => void browseTorrent()}>Choose a .torrent file…</button>}
          </label>

          <Select<Category>
            label="Category"
            value={category}
            onValueChange={pickCategory}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />

          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium">Save as</span>
            <div className="flex gap-2">
              <input className={inputCls + ' font-mono text-[13px]'} value={folder} onChange={(e) => setFolder(e.target.value)} spellCheck={false} aria-label="Folder" />
              <Button onClick={() => void browse()} aria-label="Choose folder" icon={<FolderOpen size={15} />} />
            </div>
            <input className={inputCls} value={fileName} onChange={(e) => { setNameTouched(true); setFileName(e.target.value); }} spellCheck={false} aria-label="File name" />
          </div>

          {!isVideo && !isTorrent && (<div>
            <button
              type="button"
              className="text-[12.5px] font-medium text-accent hover:underline"
              aria-expanded={mirrorsOpen}
              onClick={() => {
                const next = !mirrorsOpen;
                setMirrorsOpen(next);
                void api.resize({ height: heightFor(next, loginOpen) });
              }}
            >
              {mirrorsOpen ? '− Hide mirrors' : '+ Add mirrors (optional)'}
              {!mirrorsOpen && parseMirrors(mirrorText, url).length > 0 ? ` · ${parseMirrors(mirrorText, url).length} added` : ''}
            </button>
            {mirrorsOpen && (
              <>
                <textarea
                  value={mirrorText}
                  onChange={(e) => setMirrorText(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder={'Other links to the same file, one per line.\nKDM uses all of them at once; the fastest does the most.'}
                  aria-label="Mirror links"
                  className="mt-1.5 w-full resize-none rounded-md border border-line bg-surface2 px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg3"
                />
                <p className="mt-1 text-[11.5px] text-fg3">Links that are not the same file are skipped automatically. Your browser login is only sent to the main link.</p>
              </>
            )}
          </div>)}

          {!isVideo && !isTorrent && <LoginFields
            open={loginOpen}
            onToggle={(o) => {
              setLoginOpen(o);
              void api.resize({ height: heightFor(mirrorsOpen, o) });
            }}
            user={authUser}
            password={authPassword}
            onUser={setAuthUser}
            onPassword={setAuthPassword}
            needed={needsLogin}
          />}

          <Checkbox
            checked={remember}
            onCheckedChange={setRemember}
            label={<>Remember this path for the “{category}” category</>}
          />
        </div>

        <div className="flex w-24 shrink-0 flex-col items-center gap-2 pt-6 text-center">
          <FileArt kind={artKind(fileName)} size={84} />
          <span className="text-[11px] uppercase tracking-wide text-fg3">{ART_LABEL[artKind(fileName)]}</span>
          <span className="tnum text-sm font-semibold text-fg" data-testid="popup-size">
            {isTorrent ? 'Torrent' : isVideo ? (chosenSize ? formatBytes(chosenSize) : video.state.kind === 'loading' || video.state.kind === 'none' ? 'Checking size…' : '') : info.state === 'checking' ? '…' : d?.size ? formatBytes(d.size) : '?'}
          </span>
        </div>
      </div>

      {freeBytes !== null && needBytes > 0 && needBytes > freeBytes && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-xs text-bad">
          <span>Not enough free space on this drive: about {formatBytes(needBytes)} is needed but only {formatBytes(freeBytes)} is free.{isVideo ? ' Pick a lower quality or another folder.' : ' Choose another folder.'}</span>
        </div>
      )}
      {isVideo && <VideoPanel url={url} state={video.state} status={video.status} choice={activeChoice} onChoice={setChoice} onInstall={() => void video.install()} onRetry={video.retry} canUseLogin={video.canUseLogin} loginOn={video.loginOn} onUseLogin={video.useLogin} />}
      {isTorrent && <div className="flex min-h-[34px] items-center gap-2 rounded-lg border border-line bg-surface2/50 px-3 py-2 text-xs text-fg3"><FileSearch className="h-3.5 w-3.5" aria-hidden /> BitTorrent: the name and size appear once peers are found. KDM stops when the download finishes (no seeding).</div>}
      {!isVideo && !isTorrent && <div className="flex min-h-[34px] items-center gap-2 rounded-lg border border-line bg-surface2/50 px-3 py-2 text-xs text-fg3" aria-live="polite">
        {info.state === 'checking' && (<><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Checking the link…</>)}
        {info.state === 'failed' && needsLogin && (<><Lock className="h-3.5 w-3.5 text-warn" aria-hidden /> <span className="text-warn">This link needs a user name and password.</span> Fill in the login above.</>)}
        {info.state === 'failed' && !needsLogin && (<><FileSearch className="h-3.5 w-3.5" aria-hidden /> Couldn’t read the size (the server may hide it). You can still download.</>)}
        {info.state === 'done' && d && (
          <>
            {looksHtml ? <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden /> : <FileSearch className="h-3.5 w-3.5" aria-hidden />}
            <span>{d.rangeOk ? 'Resume supported · multi-connection' : 'Single connection · no resume'}</span>
            {looksHtml && <span className="text-warn">· looks like a web page, not a file</span>}
          </>
        )}
      </div>}
      {link.cookie && sameLink && !isVideo && (
        <p className="-mt-1 flex items-center gap-1.5 text-xs text-fg3">
          <Lock className="h-3 w-3" aria-hidden /> Your browser login is attached.
        </p>
      )}

      {/* stays visible at the bottom even on a short screen, where the form above scrolls */}
      <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto flex justify-end gap-2 border-t border-line bg-surface px-4 py-3">
        <Button onClick={() => void submit(false)} disabled={!urlOk || busy || (isVideo && !ready)}>Download Later</Button>
        <Button type="submit" variant="primary" disabled={!urlOk || busy || (isVideo && !ready)} data-testid="popup-start">Start Download</Button>
        <Button onClick={() => void api.close()}>Cancel</Button>
      </div>
    </form>
  );
}
