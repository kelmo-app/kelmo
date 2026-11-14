import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FileSearch, FolderOpen, Magnet, Loader2, Lock, AlertTriangle } from 'lucide-react';
import type { Category } from '@/types';
import { BANDWIDTH_PRESETS } from '@/data/defaults';
import { CATEGORIES, classifyFile, fileNameFromUrl, isMagnetUrl, isTorrentFileUrl, isValidUrl } from '@/lib/url';
import { platform } from '@/services/platform';
import { formatBytes } from '@/lib/format';
import { headersFor } from '@/services/RealDownloadEngine';
import type { LinkInfo } from '@/types/global';
import { useDownloadStore } from '@/store/instances';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { Button } from '@/components/ui/Button';
import { parseBatch } from '@/lib/batch';
import { parseMirrors } from '@/lib/mirrors';
import { checksumError, normalizeChecksum } from '@/lib/checksum';
import { Checkbox, Field, NumberField, Select, TextField } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { LoginFields } from '@/components/LoginFields';
import { VideoPanel } from '@/components/VideoPanel';
import { useVideoLink } from '@/hooks/useVideoLink';
import { isVideoSite, videoChoices, videoFileName } from '@/lib/videoSites';
import { validateAddForm, type AddFormErrors } from './addDownloadForm';

type CategoryChoice = Category | 'auto';

export function AddDownloadDialog() {
  const { open, prefillUrl, queueId: presetQueue, session, batchLinks } = useUiStore((s) => s.addDialog);
  const close = useUiStore((s) => s.closeAddDialog);
  const toast = useUiStore((s) => s.toast);
  const queues = useDownloadStore((s) => s.queues);
  const addDownload = useDownloadStore((s) => s.addDownload);
  const settings = useSettingsStore((s) => s.settings);

  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [destination, setDestination] = useState('');
  const [category, setCategory] = useState<CategoryChoice>('auto');
  const [startNow, setStartNow] = useState(true);
  const [queueId, setQueueId] = useState('');
  const [connections, setConnections] = useState(8);
  const [bandwidth, setBandwidth] = useState(0);
  const [mirrorText, setMirrorText] = useState('');
  const [checksumText, setChecksumText] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [batch, setBatch] = useState(false);
  const [batchText, setBatchText] = useState('');
  const parsed = useMemo(() => parseBatch(batchText), [batchText]);
  const [errors, setErrors] = useState<AddFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const [probe, setProbe] = useState<{ state: 'idle' | 'checking' | 'done' | 'failed'; info?: LinkInfo }>({ state: 'idle' });
  const nameTouchedRef = useRef(false);
  nameTouchedRef.current = nameTouched;

  // a YouTube-like page: yt-dlp reads it and offers qualities instead of the usual file check
  const video = useVideoLink(url, open && !batch);
  const isVideo = video.state.kind !== 'none';
  const isTorrent = isMagnetUrl(url) || isTorrentFileUrl(url) || /^https?:\/\/[^\s?#]+\.torrent(\?\S*)?$/i.test(url.trim());
  const [choice, setChoice] = useState('best');
  const ready = video.state.kind === 'ready' ? video.state.info : null;
  const ffmpeg = !!video.status?.ffmpeg;
  const choiceList = ready ? videoChoices(ready, ffmpeg).choices : [];
  const activeChoice = choiceList.some((c) => c.value === choice) ? choice : (choiceList[0]?.value ?? 'best');
  const chosenSize = choiceList.find((c) => c.value === activeChoice)?.size ?? 0;
  useEffect(() => {
    if (ready && !nameTouchedRef.current) setFileName(videoFileName(ready.title, activeChoice, ffmpeg));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeChoice, ffmpeg]);

  // Like IDM's "file info": look at the link as soon as it is entered and show size / real name.
  useEffect(() => {
    if (!open || !platform.isElectron || !isValidUrl(url) || !/^https?:\/\//i.test(url.trim()) || isVideoSite(url)) {
      setProbe({ state: 'idle' });
      return;
    }
    let stale = false;
    setProbe({ state: 'checking' });
    const timer = window.setTimeout(async () => {
      const link = url.trim();
      const user = authUser.trim();
      const { info, status } = await platform
        .probeLink(link, session && link === prefillUrl ? headersFor(session) : undefined, user ? { user, password: authPassword } : undefined)
        .catch(() => ({ info: null, status: undefined }));
      if (stale) return;
      setNeedsLogin(status === 401);
      if (status === 401) setLoginOpen(true);
      if (!info) return setProbe({ state: 'failed' });
      setProbe({ state: 'done', info });
      if (!nameTouchedRef.current && info.fileName) setFileName(info.fileName);
    }, 450);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url, authUser, authPassword]);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const u = prefillUrl ?? '';
    setUrl(u);
    setFileName(u && isValidUrl(u) ? fileNameFromUrl(u) : '');
    setNameTouched(false);
    setDestination(settings.defaultFolder);
    setCategory('auto');
    setStartNow(true);
    const qs = useDownloadStore.getState().queues;
    setQueueId(qs.find((q) => q.id === presetQueue)?.id ?? qs[0]?.id ?? '');
    setConnections(settings.maxConnections);
    setBandwidth(settings.bandwidthLimit);
    setMirrorText('');
    setAuthUser('');
    setAuthPassword('');
    setLoginOpen(false);
    setNeedsLogin(false);
    setChecksumText('');
    setChoice('best');
    setBatch(!!batchLinks);
    setBatchText(batchLinks ?? '');
    setErrors({});
    setSubmitted(false);
    // Nothing given: take the link you just copied, so there is nothing to paste (like IDM).
    let alive = true;
    if (!u && !batchLinks && platform.isElectron) {
      void platform.clipboardLink().then((link) => {
        if (!alive || !link) return;
        setUrl((cur) => {
          if (cur) return cur; // the person already typed something
          setFileName(fileNameFromUrl(link));
          return link;
        });
      });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillUrl, presetQueue, batchLinks]);

  const detected = useMemo(() => classifyFile(fileName || fileNameFromUrl(url)).category, [fileName, url]);
  const effectiveCategory: Category = category === 'auto' ? (settings.autoCategorize ? detected : 'General') : category;
  const selectedQueue = queues.find((q) => q.id === queueId);

  const values = { url, fileName, destination, queueId, connections };
  const revalidate = (next: Partial<typeof values>) => {
    if (submitted) setErrors(validateAddForm({ ...values, ...next }));
  };

  const onUrl = (v: string) => {
    setUrl(v);
    if (!nameTouched) setFileName(isValidUrl(v) ? fileNameFromUrl(v) : '');
    revalidate({ url: v });
  };

  const browse = async () => {
    const picked = await platform.pickFolder();
    if (picked) {
      setDestination(picked);
      revalidate({ destination: picked });
    } else if (!platform.isElectron) {
      toast({ tone: 'info', title: 'Folder picker', description: 'The native folder dialog is available in the desktop app. Type a path instead.' }, 3200);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    // the password is sealed by the system keyring; only the sealed text is kept with the download
    const login = authUser.trim() && authPassword ? { authUser: authUser.trim(), authSecret: (await platform.sealPassword(authPassword)) || undefined } : {};
    if (batch) {
      const errs = validateAddForm({ ...values, url: parsed.urls[0] ?? '', fileName: '' });
      if (!parsed.urls.length) errs.url = 'Paste at least one link (one per line).';
      setErrors(errs);
      if (Object.keys(errs).length > 0) return;
      let added = 0;
      for (const u of parsed.urls) {
        try {
          addDownload({ url: u, destination: destination.trim() === settings.defaultFolder ? undefined : destination.trim(), category: category === 'auto' ? undefined : category, startNow, queueId, connections, speedLimit: bandwidth, ...login });
          added++;
        } catch { /* skip a link the manager refuses; the count below tells the truth */ }
      }
      toast({ tone: added ? 'success' : 'error', title: added ? `${added} downloads added` : 'Nothing was added', description: added ? `→ ${selectedQueue?.name ?? 'queue'}${startNow ? '' : ' (paused)'}` : 'None of the links could be added.' }, 3200);
      if (added) close();
      return;
    }
    const errs: AddFormErrors = validateAddForm(values);
    if (isVideo && !ready) errs.url = video.state.kind === 'install' ? 'Install the video downloader first (the button below).' : 'Wait until the video has been read, or fix the link.';
    const ckErr = isVideo ? null : checksumError(checksumText);
    if (ckErr) errs.checksum = ckErr;
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      urlRef.current?.focus();
      return;
    }
    try {
      const item = addDownload({
        url: url.trim(),
        fileName: fileName.trim() || undefined,
        // keeping the default folder lets KELMO sort into category sub-folders
        destination: destination.trim() === settings.defaultFolder ? undefined : destination.trim(),
        category: category === 'auto' ? undefined : category,
        startNow,
        queueId,
        connections,
        speedLimit: bandwidth,
        mirrors: isVideo ? undefined : parseMirrors(mirrorText, url),
        expectedChecksum: isVideo ? undefined : normalizeChecksum(checksumText) || undefined,
        ...(ready ? { video: { choice: activeChoice, size: chosenSize || undefined } } : login),
        // only attached while the link in the box is still the one the browser sent
        ...(session && url.trim() === prefillUrl ? { referrer: session.referrer, cookie: session.cookie, userAgent: session.userAgent } : {}),
      });
      toast(
        {
          tone: 'success',
          title: startNow ? 'Download added' : 'Added and paused',
          description: `${item.fileName} → ${selectedQueue?.name ?? 'queue'}`,
        },
        3000,
      );
      close();
    } catch (err) {
      setErrors({ url: err instanceof Error ? err.message : 'Could not add this download.' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add download"
      description="Paste a link and choose where it should go."
      size="md"
      testId="add-download-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="add-download-form" data-testid="add-download-submit">
            Add download
          </Button>
        </>
      }
    >
      <form id="add-download-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <button type="button" className="self-start text-[12.5px] font-medium text-accent hover:underline" onClick={() => setBatch((b) => !b)} data-testid="batch-toggle">
          {batch ? '← Back to a single link' : 'Add many links at once…'}
        </button>
        {batch && (
          <>
            <Field label="Links" htmlFor="batch-links" error={errors.url} hint="One link per line. For numbered files write a range: game.part[1-10].rar (or [01-10], [a-e]).">
              <textarea
                id="batch-links"
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                rows={6}
                spellCheck={false}
                data-autofocus
                placeholder={'https://example.org/game.part[1-5].rar\nhttps://example.org/readme.pdf'}
                className="w-full resize-none rounded-md border border-line bg-surface2 px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg3"
              />
            </Field>
            <p className="-mt-2 text-xs text-fg3" aria-live="polite" data-testid="batch-count">
              {parsed.urls.length === 0 ? 'No links yet.' : `${parsed.urls.length} ${parsed.urls.length === 1 ? 'download' : 'downloads'} will be added`}
              {parsed.invalid > 0 ? ` · ${parsed.invalid} ${parsed.invalid === 1 ? 'word is' : 'words are'} not a web link and ${parsed.invalid === 1 ? 'is' : 'are'} skipped` : ''}
              {parsed.truncated ? ' · only the first 200 are used' : ''}
            </p>
            <Select<CategoryChoice>
              label="Category"
              value={category}
              onValueChange={setCategory}
              options={[{ value: 'auto', label: 'Auto-detect for each file' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
            />
          </>
        )}
        {!batch && (<>
        <TextField
          ref={urlRef}
          label="Download URL"
          placeholder="https://releases.ubuntu.com/…/ubuntu-26.04-desktop-amd64.iso"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          error={errors.url}
          autoComplete="off"
          spellCheck={false}
          data-autofocus
        />
        {platform.isElectron && (
          <Button type="button" size="sm" variant="secondary" className="-mt-1 self-start" icon={<Magnet size={14} />} onClick={async () => { const f = await platform.pickTorrent(); if (f) onUrl(f); }}>
            Add torrent file…
          </Button>
        )}
        {isTorrent && <p className="rounded-md border border-line bg-surface2/60 px-3 py-2 text-xs text-fg3">BitTorrent: the real name and size appear once peers are found. KDM stops when the download finishes (no seeding).</p>}
        {isVideo && <VideoPanel url={url} state={video.state} status={video.status} choice={activeChoice} onChoice={setChoice} onInstall={() => void video.install()} onRetry={video.retry} />}
        {!isVideo && probe.state !== 'idle' && (
          <div
            className="-mt-2 flex items-center gap-2 rounded-lg border border-line bg-surface2/50 px-3 py-2 text-xs text-fg3"
            data-testid="link-info"
            aria-live="polite"
          >
            {probe.state === 'checking' && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Checking the link…
              </>
            )}
            {probe.state === 'failed' && (
              <>
                <FileSearch className="h-3.5 w-3.5" aria-hidden /> Couldn’t read the file size (the server may hide it). You can still download.
              </>
            )}
            {probe.state === 'done' && probe.info && (
              <>
                {probe.info.contentType === 'text/html' ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden />
                ) : (
                  <FileSearch className="h-3.5 w-3.5" aria-hidden />
                )}
                <span className="font-medium text-fg">{probe.info.size ? formatBytes(probe.info.size) : 'Size unknown'}</span>
                <span>· {probe.info.rangeOk ? 'multi-connection + resume supported' : 'single connection (no resume)'}</span>
                {probe.info.contentType === 'text/html' && <span className="text-warn">· looks like a web page, not a file</span>}
              </>
            )}
          </div>
        )}
        {!isVideo && session?.cookie && url.trim() === prefillUrl && (
          <p className="-mt-2 flex items-center gap-1.5 text-xs text-fg3" data-testid="session-attached">
            <Lock className="h-3 w-3" aria-hidden /> Your browser login is attached, so protected links keep working.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="File name"
            placeholder="Detected from the link"
            value={fileName}
            onChange={(e) => {
              setNameTouched(true);
              setFileName(e.target.value);
              revalidate({ fileName: e.target.value });
            }}
            error={errors.fileName}
            autoComplete="off"
          />
          <Select<CategoryChoice>
            label="Category"
            value={category}
            onValueChange={setCategory}
            options={[{ value: 'auto', label: `Auto-detect (${effectiveCategory})` }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
        </div>

        {platform.isElectron && !isVideo && !isTorrent && (
          <LoginFields open={loginOpen} onToggle={setLoginOpen} user={authUser} password={authPassword} onUser={setAuthUser} onPassword={setAuthPassword} needed={needsLogin} />
        )}

        {!isVideo && !isTorrent && (<><Field label="Mirrors (optional)" htmlFor="mirror-links" hint="Other links to the same file, one per line. KDM downloads from all of them at once; the fastest does the most. Links that are not the same file are skipped. Your browser login is only sent to the main link.">
          <textarea
            id="mirror-links"
            value={mirrorText}
            onChange={(e) => setMirrorText(e.target.value)}
            rows={2}
            spellCheck={false}
            className="w-full resize-none rounded-md border border-line bg-surface2 px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg3"
            placeholder="https://mirror.example.org/file.iso"
          />
        </Field>

        <Field label="Checksum (optional)" htmlFor="expected-checksum" error={errors.checksum} hint="If the website shows an MD5, SHA-1, SHA-256 or SHA-512 value for this file, paste it. KDM checks the finished file against it and warns you if it differs.">
          <input
            id="expected-checksum"
            value={checksumText}
            onChange={(e) => setChecksumText(e.target.value)}
            spellCheck={false}
            className="h-9 w-full rounded-md border border-line bg-surface2 px-3 font-mono text-[12px] text-fg placeholder:text-fg3"
            placeholder="e.g. SHA256: 3a7bd3e2…"
          />
        </Field></>)}

        </>)}

        <Field label="Destination folder" htmlFor="dest-folder" error={errors.destination} hint="Keep the default to sort files into category folders.">
          <div className="flex gap-2">
            <input
              id="dest-folder"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                revalidate({ destination: e.target.value });
              }}
              aria-invalid={errors.destination ? true : undefined}
              className="h-9 w-full rounded-md border border-line bg-surface2 px-3 font-mono text-[13px] text-fg transition hover:border-fg3/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-bad"
            />
            <Button variant="secondary" icon={<FolderOpen size={15} />} onClick={() => void browse()}>
              Browse
            </Button>
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="Queue"
            value={queueId}
            onValueChange={(v) => {
              setQueueId(v);
              revalidate({ queueId: v });
            }}
            options={queues.map((q) => ({ value: q.id, label: q.status === 'paused' ? `${q.name} (paused)` : q.name }))}
            error={errors.queueId}
          />
          <NumberField
            label="Max connections"
            min={1}
            max={16}
            value={connections}
            onValueChange={(n) => {
              setConnections(n);
              revalidate({ connections: n });
            }}
            error={errors.connections}
          />
          <Select label="Bandwidth limit" value={bandwidth} onValueChange={setBandwidth} options={BANDWIDTH_PRESETS.map((p) => ({ value: p.value, label: p.label }))} />
        </div>

        {selectedQueue?.status === 'paused' && startNow && (
          <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg">
            “{selectedQueue.name}” is paused, so this download will wait in the queue until you start it.
          </p>
        )}

        <details className="rounded-lg border border-line bg-surface2/50 px-4 py-3 text-sm">
          <summary className="flex cursor-pointer select-none items-center gap-2 font-medium text-fg">
            <Lock size={14} className="text-fg3" aria-hidden /> Authentication
            <span className="text-xs font-normal text-fg3">(optional)</span>
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="Username" disabled placeholder="Not available yet" />
            <TextField label="Password" type="password" disabled placeholder="Not available yet" />
          </div>
          <p className="mt-2 text-xs text-fg3">Sign-in support is a placeholder in this build and arrives with the real download engine.</p>
        </details>

        <Checkbox label="Start immediately" description="Uncheck to add it paused." checked={startNow} onCheckedChange={setStartNow} />
      </form>
    </Modal>
  );
}
