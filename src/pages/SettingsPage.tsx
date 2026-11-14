import { useEffect, useRef, useState } from 'react';
import { Bell, Download, FolderOpen, Globe, Info, Palette, Search, Settings2, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { APP_VERSION, BANDWIDTH_PRESETS, LANGUAGES } from '@/data/defaults';
import { resetDemoData } from '@/store/instances';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { platform } from '@/services/platform';
import { SectionCard } from '@/components/Common';
import { BandwidthChart } from '@/components/charts/BandwidthChart';
import { useDownloadStore } from '@/store/instances';
import { BandwidthPlanner } from '@/features/settings/BandwidthPlanner';
import { SystemHealth } from '@/features/settings/SystemHealth';
import { VideoDownloaderRow } from '@/features/settings/VideoDownloaderRow';
import { Button } from '@/components/ui/Button';
import { NumberField, Segmented, Select, TextField, Toggle } from '@/components/ui/Fields';
import { GPL_STATEMENT } from '@/components/layout/HelpDialogs';
import { BrowserIntegrationCard } from '@/features/settings/BrowserIntegrationCard';
import { SettingRow, SettingsQueryContext } from '@/features/settings/SettingRow';
import { CATEGORIES, categoryFolder } from '@/lib/url';
import type { Settings } from '@/types';

type SectionId = 'general' | 'engine' | 'bridge' | 'categories' | 'network' | 'appearance' | 'notifications' | 'privacy' | 'advanced' | 'about';

const SECTIONS: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'engine', label: 'Download Engine', icon: Download },
  { id: 'bridge', label: 'Browser Bridge', icon: Globe },
  { id: 'categories', label: 'Categories', icon: FolderOpen },
  { id: 'network', label: 'Network', icon: Globe },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'advanced', label: 'Advanced', icon: Wrench },
  { id: 'about', label: 'Open Source / GPLv3', icon: Info },
];

const ACCENTS: Array<{ key: Settings['accentColor']; label: string; color: string }> = [
  { key: 'default', label: 'Copper', color: 'rgb(214 120 24)' },
  { key: 'cyan', label: 'Ocean', color: 'rgb(20 160 196)' },
  { key: 'violet', label: 'Violet', color: 'rgb(130 90 235)' },
  { key: 'emerald', label: 'Emerald', color: 'rgb(24 160 100)' },
  { key: 'amber', label: 'Amber', color: 'rgb(230 170 20)' },
  { key: 'rose', label: 'Rose', color: 'rgb(226 70 120)' },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  // whether the system has a real keyring for saved download logins (desktop app only)
  const [keyringStrong, setKeyringStrong] = useState<boolean | null>(null);
  useEffect(() => {
    void window.kelmo?.secret?.info().then((r) => setKeyringStrong(r.strong)).catch(() => setKeyringStrong(null));
  }, []);
  const update = useSettingsStore((s) => s.update);
  const updateNested = useSettingsStore((s) => s.updateNested);
  const reset = useSettingsStore((s) => s.reset);
  const exportJson = useSettingsStore((s) => s.exportJson);
  const importJson = useSettingsStore((s) => s.importJson);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const toast = useUiStore((s) => s.toast);
  const [section, setSection] = useState<SectionId>('engine');
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const history = useDownloadStore((s) => s.history);
  const show = (id: SectionId) => !!q || section === id;
  const hideEmpty = q ? '[&:not(:has([data-row]))]:hidden' : '';
  const fileRef = useRef<HTMLInputElement>(null);
  const { startupBehavior: sb, notifications: nt, network: net } = settings;

  const pickFolder = async (key: 'defaultFolder' | 'logFolder') => {
    const dir = await platform.pickFolder();
    if (dir) update({ [key]: dir } as Partial<Settings>);
    else if (!platform.isElectron) toast({ tone: 'info', title: 'Folder picker', description: 'Available in the desktop app. Type a path instead.' }, 3000);
  };

  const onExport = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kdm-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ tone: 'success', title: 'Settings exported', description: 'kdm-settings.json' }, 2600);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const res = importJson(await file.text());
    toast(res.ok ? { tone: 'success', title: 'Settings imported' } : { tone: 'error', title: 'Import failed', description: res.error }, 3200);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onReset = () =>
    askConfirm({
      title: 'Reset all settings?',
      description: 'Every preference returns to its default. Your downloads and queues are not touched.',
      confirmLabel: 'Reset settings',
      tone: 'danger',
      onConfirm: () => {
        reset();
        toast({ tone: 'info', title: 'Settings reset' }, 2600);
      },
    });

  const onResetData = () =>
    askConfirm({
      title: 'Restore demo data?',
      description: 'Downloads, queues and schedule rules are replaced with the demo workspace.',
      confirmLabel: 'Restore demo data',
      tone: 'danger',
      onConfirm: () => {
        resetDemoData();
        toast({ tone: 'info', title: 'Demo data restored' }, 2600);
      },
    });

  const bandwidthOptions = BANDWIDTH_PRESETS.some((p) => p.value === settings.bandwidthLimit)
    ? BANDWIDTH_PRESETS
    : [...BANDWIDTH_PRESETS, { label: `${(settings.bandwidthLimit / 1048576).toFixed(1)} MB/s (custom)`, value: settings.bandwidthLimit }];

  return (
    <SettingsQueryContext.Provider value={q}>
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-fg 2xl:text-[34px]">
            Settings <span className="text-accent">Control Center</span>
          </h1>
          <p className="mt-1 text-[15px] text-fg2">Customize KDM to match your workflow. Powerful. Flexible. Open.</p>
        </div>
        <label className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-fg3 focus-within:border-accent/60 sm:w-72">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg3"
          />
        </label>
      </div>

      <SystemHealth />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
              className={cn(
                'flex h-10 shrink-0 items-center gap-3 rounded-lg px-3.5 text-[14px] font-medium transition',
                section === id ? 'bg-accent/12 text-accent' : 'text-fg2 hover:bg-surface2 hover:text-fg',
              )}
            >
              <Icon size={18} aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          {show('general') && (
            <SectionCard className={hideEmpty} title="General" icon={Settings2}>
              <SettingRow title="Your name" description="Shown in the greeting on Overview.">
                <TextField label="Your name" srOnlyLabel value={settings.userName} onChange={(e) => update({ userName: e.target.value })} className="w-56" />
              </SettingRow>
              <SettingRow title="Start KDM on system startup" description="Launch quietly when you sign in.">
                <Toggle label="Start on system startup" checked={sb.launchOnStartup} onChange={(v) => updateNested('startupBehavior', { launchOnStartup: v })} />
              </SettingRow>
              <SettingRow title="Minimize to tray" description="Closing the window keeps downloads running in the tray.">
                <Toggle label="Minimize to tray" checked={sb.minimizeToTray} onChange={(v) => updateNested('startupBehavior', { minimizeToTray: v })} />
              </SettingRow>
              <SettingRow title="Confirm before deleting" description="Ask before removing downloads from the list.">
                <Toggle label="Confirm before deleting" checked={sb.confirmBeforeDelete} onChange={(v) => updateNested('startupBehavior', { confirmBeforeDelete: v })} />
              </SettingRow>
              <SettingRow title="Default download folder" description="New downloads are saved here unless you choose otherwise.">
                <TextField label="Default download folder" srOnlyLabel value={settings.defaultFolder} onChange={(e) => update({ defaultFolder: e.target.value })} className="w-72" />
                <Button icon={<FolderOpen size={15} />} onClick={() => void pickFolder('defaultFolder')}>Browse</Button>
              </SettingRow>
              <SettingRow title="Language">
                <Select label="Language" srOnlyLabel value={settings.language} options={LANGUAGES} onValueChange={(v) => update({ language: v })} fieldClassName="w-48" />
              </SettingRow>
            </SectionCard>
          )}

          {show('appearance') && (
            <SectionCard className={hideEmpty} title="Appearance" icon={Palette}>
              <SettingRow title="Interface" description="Simple opens on your downloads list, like IDM. Advanced adds Overview, Queues, Scheduler and Library to the sidebar.">
                <Segmented<Settings['uiMode']>
                  label="Interface"
                  value={settings.uiMode}
                  onChange={(v) => update({ uiMode: v })}
                  options={[
                    { value: 'simple', label: 'Simple' },
                    { value: 'advanced', label: 'Advanced' },
                  ]}
                />
              </SettingRow>
              <SettingRow title="Theme" description="Dark, light, or follow your system.">
                <Segmented<Settings['theme']>
                  label="Theme"
                  value={settings.theme}
                  onChange={(v) => update({ theme: v })}
                  options={[
                    { value: 'dark', label: 'Dark' },
                    { value: 'light', label: 'Light' },
                    { value: 'system', label: 'System' },
                  ]}
                />
              </SettingRow>
              <SettingRow title="Accent colour" description="The brand colour used for buttons, progress and highlights.">
                <div className="flex items-center gap-2" role="radiogroup" aria-label="Accent colour">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      role="radio"
                      aria-checked={settings.accentColor === a.key}
                      aria-label={a.label}
                      title={a.label}
                      onClick={() => update({ accentColor: a.key })}
                      className={`h-6 w-6 rounded-full border-2 transition ${settings.accentColor === a.key ? 'border-fg scale-110' : 'border-transparent hover:scale-105'}`}
                      style={{ background: a.color }}
                    />
                  ))}
                </div>
              </SettingRow>
              <SettingRow title="Golden light theme" description="Warm cream and honey-gold look, with gold progress bars and gradient buttons. Has no effect in dark.">
                <Toggle label="Golden light theme" checked={settings.vibrant} onChange={(v) => update({ vibrant: v })} />
              </SettingRow>
              <SettingRow title="Density" description="Compact fits more rows on small screens.">
                <Segmented<Settings['density']>
                  label="Density"
                  value={settings.density}
                  onChange={(v) => update({ density: v })}
                  options={[
                    { value: 'comfortable', label: 'Comfortable' },
                    { value: 'compact', label: 'Compact' },
                  ]}
                />
              </SettingRow>
              <SettingRow title="Reduce motion" description="Turn off animations and transitions. Also helps older graphics hardware.">
                <Toggle label="Reduce motion" checked={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
              </SettingRow>
            </SectionCard>
          )}

          {show('engine') && (
            <SectionCard className={hideEmpty} title="Download Engine" icon={Download}>
              <VideoDownloaderRow />
              <SettingRow title="Default maximum connections" description="Segments per download (1–32). More is not always faster.">
                <NumberField label="Default maximum connections" srOnlyLabel min={1} max={32} value={settings.maxConnections} onValueChange={(n) => Number.isFinite(n) && update({ maxConnections: clamp(n, 1, 32) })} fieldClassName="w-28" />
              </SettingRow>
              <SettingRow title="Default bandwidth limit">
                <Select<number> label="Default bandwidth limit" srOnlyLabel value={settings.bandwidthLimit} options={bandwidthOptions.map((p) => ({ value: p.value, label: p.label }))} onValueChange={(v) => update({ bandwidthLimit: v })} fieldClassName="w-52" />
              </SettingRow>
              <SettingRow title="Retry attempts" description="How often a failed segment is retried with backoff.">
                <NumberField label="Retry attempts" srOnlyLabel min={0} max={10} value={settings.retryAttempts} onValueChange={(n) => Number.isFinite(n) && update({ retryAttempts: clamp(n, 0, 10) })} fieldClassName="w-28" />
              </SettingRow>
              <SettingRow title="Temporary files" description="What happens to .part files when a download stops.">
                <Select<Settings['tempFileBehavior']>
                  label="Temporary files"
                  srOnlyLabel
                  value={settings.tempFileBehavior}
                  onValueChange={(v) => update({ tempFileBehavior: v })}
                  options={[
                    { value: 'keep', label: 'Keep so I can resume' },
                    { value: 'delete-on-cancel', label: 'Delete on cancel' },
                    { value: 'delete-on-failure', label: 'Delete on failure' },
                  ]}
                  fieldClassName="w-56"
                />
              </SettingRow>
              <SettingRow title="File allocation" description="Sparse is fastest on ext4/btrfs/xfs; preallocate avoids fragmentation.">
                <Select<Settings['fileAllocation']>
                  label="File allocation"
                  srOnlyLabel
                  value={settings.fileAllocation}
                  onValueChange={(v) => update({ fileAllocation: v })}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'sparse', label: 'Sparse' },
                    { value: 'prealloc', label: 'Preallocate' },
                  ]}
                  fieldClassName="w-44"
                />
              </SettingRow>
              <SettingRow title="Checksum verification" description="After a download finishes, KDM reads the file and shows its fingerprint. If you pasted the checksum from the website in Add URL, it also says whether they match. Large files take a few seconds.">
                <Select<Settings['checksumMode']>
                  label="Checksum verification"
                  srOnlyLabel
                  value={settings.checksumMode}
                  onValueChange={(v) => update({ checksumMode: v })}
                  options={[
                    { value: 'off', label: 'Only when I paste one' },
                    { value: 'SHA256', label: 'SHA-256 (all downloads)' },
                    { value: 'SHA512', label: 'SHA-512 (all downloads)' },
                    { value: 'MD5', label: 'MD5 (all downloads)' },
                  ]}
                  fieldClassName="w-60"
                />
              </SettingRow>
              <SettingRow title="Automatically categorize downloads" description="Sort files into categories by type.">
                <Toggle label="Automatically categorize downloads" checked={settings.autoCategorize} onChange={(v) => update({ autoCategorize: v })} />
              </SettingRow>
            </SectionCard>
          )}

          {!q && section === 'engine' && (
            <SectionCard title="Live throughput" icon={Download} bodyClassName="px-5 pb-4">
              <BandwidthChart samples={history} window={60} height={120} showUpload />
            </SectionCard>
          )}

          {show('categories') && (
            <SectionCard className={hideEmpty} title="Categories and folders" icon={FolderOpen}>
              {CATEGORIES.map((c) => (
                <SettingRow key={c} title={c} description={`Files of type ${c.toLowerCase()} are saved here.`}>
                  <TextField
                    label={`${c} folder`}
                    srOnlyLabel
                    value={categoryFolder(c, settings.defaultFolder, settings.categoryFolders)}
                    onChange={(e) => update({ categoryFolders: { ...settings.categoryFolders, [c]: e.target.value } })}
                    className="w-72"
                  />
                  <Button
                    icon={<FolderOpen size={15} />}
                    onClick={async () => {
                      const dir = await platform.pickFolder();
                      if (dir) update({ categoryFolders: { ...settings.categoryFolders, [c]: dir } });
                    }}
                  >
                    Browse
                  </Button>
                </SettingRow>
              ))}
              <SettingRow title="Reset folders" description="Go back to one folder per category inside the default download folder.">
                <Button onClick={() => update({ categoryFolders: {} })}>Reset</Button>
              </SettingRow>
              <SettingRow title="Watch the clipboard" description="Copy a link to a file (ISO, ZIP, PDF, video…) and KDM offers to download it. Off by default; nothing is read while it is off.">
                <Toggle label="Watch the clipboard" checked={settings.watchClipboard} onChange={(v) => update({ watchClipboard: v })} />
              </SettingRow>
              <SettingRow title="Floating drop target" description="A small always-on-top box: drag a link from the browser onto it and KDM opens the File Info window. (Tray and taskbar icons can't accept drops.)">
                <Toggle label="Floating drop target" checked={settings.dropTarget} onChange={(v) => update({ dropTarget: v })} />
              </SettingRow>
              <SettingRow title="Show progress window" description="For downloads started from the browser, like IDM’s download window.">
                <Toggle label="Show progress window" checked={settings.showProgressWindow} onChange={(v) => update({ showProgressWindow: v })} />
              </SettingRow>
              <SettingRow title="Show “Download complete” window" description="Small window with Open / Open folder after a browser download.">
                <Toggle label="Show Download complete window" checked={settings.showCompleteDialog} onChange={(v) => update({ showCompleteDialog: v })} />
              </SettingRow>
            </SectionCard>
          )}

          {!q && section === 'network' && <BandwidthPlanner />}

          {show('network') && (
            <SectionCard className={hideEmpty} title="Network" icon={Globe}>
              <SettingRow title="Proxy" description="Use your system proxy (as set in your desktop), none, or a manual HTTP proxy. SOCKS proxies are not supported yet.">
                <Select<Settings['network']['proxyMode']>
                  label="Proxy mode"
                  srOnlyLabel
                  value={net.proxyMode}
                  onValueChange={(v) => updateNested('network', { proxyMode: v })}
                  options={[
                    { value: 'none', label: 'No proxy' },
                    { value: 'system', label: 'System proxy' },
                    { value: 'manual', label: 'Manual' },
                  ]}
                  fieldClassName="w-44"
                />
              </SettingRow>
              {net.proxyMode === 'manual' && (
                <SettingRow title="Proxy address">
                  <TextField label="Proxy host" srOnlyLabel placeholder="proxy.example.com" value={net.proxyHost} onChange={(e) => updateNested('network', { proxyHost: e.target.value })} className="w-56" />
                  <NumberField label="Proxy port" srOnlyLabel min={1} max={65535} value={net.proxyPort} onValueChange={(n) => Number.isFinite(n) && updateNested('network', { proxyPort: clamp(n, 1, 65535) })} fieldClassName="w-28" />
                </SettingRow>
              )}
              <SettingRow title="VPN awareness" description="Queues can pause when your VPN disconnects.">
                <Toggle label="VPN awareness" checked={net.vpnAwareness} onChange={(v) => updateNested('network', { vpnAwareness: v })} />
              </SettingRow>
              <SettingRow title="Connection timeout" description="Seconds to wait before a connection is considered dead.">
                <NumberField label="Connection timeout" srOnlyLabel suffix="s" min={5} max={300} value={net.timeoutSec} onValueChange={(n) => Number.isFinite(n) && updateNested('network', { timeoutSec: clamp(n, 5, 300) })} fieldClassName="w-32" />
              </SettingRow>
              <SettingRow title="DNS servers" description="Not available yet: downloads use your system's DNS. Custom DNS needs an extra component that is planned.">
                <TextField label="DNS servers" srOnlyLabel disabled placeholder="Coming later" value="" onChange={() => {}} className="w-64" />
              </SettingRow>
              <SettingRow title="User-agent" description="Leave empty to use KDM’s default.">
                <TextField label="User-agent" srOnlyLabel placeholder={`KDM/${APP_VERSION}`} value={net.userAgent} onChange={(e) => updateNested('network', { userAgent: e.target.value })} className="w-64" />
              </SettingRow>
            </SectionCard>
          )}

          {show('notifications') && (
            <SectionCard className={hideEmpty} title="Notifications" icon={Bell}>
              <SettingRow title="Download completed">
                <Toggle label="Notify when a download completes" checked={nt.downloadCompleted} onChange={(v) => updateNested('notifications', { downloadCompleted: v })} />
              </SettingRow>
              <SettingRow title="Download failed">
                <Toggle label="Notify when a download fails" checked={nt.downloadFailed} onChange={(v) => updateNested('notifications', { downloadFailed: v })} />
              </SettingRow>
              <SettingRow title="Queue finished">
                <Toggle label="Notify when a queue finishes" checked={nt.queueFinished} onChange={(v) => updateNested('notifications', { queueFinished: v })} />
              </SettingRow>
              <SettingRow title="Scheduler started">
                <Toggle label="Notify when the scheduler starts" checked={nt.schedulerStarted} onChange={(v) => updateNested('notifications', { schedulerStarted: v })} />
              </SettingRow>
              <SettingRow title="Desktop notifications" description="Also show system notifications outside the app.">
                <Toggle label="Desktop notifications" checked={nt.desktop} onChange={(v) => updateNested('notifications', { desktop: v })} />
              </SettingRow>
            </SectionCard>
          )}

          {!q && section === 'bridge' && <BrowserIntegrationCard />}

          {show('privacy') && (
            <SectionCard className={hideEmpty} title="Privacy" icon={ShieldCheck}>
              <SettingRow title="No telemetry" description="KDM never sends usage data, crash reports or file names anywhere.">
                <span className="text-[13px] font-medium text-ok">Always off</span>
              </SettingRow>
              <SettingRow title="No automatic updates check" description="KDM does not contact any server on its own. Only the links you download are requested.">
                <span className="text-[13px] font-medium text-ok">Always off</span>
              </SettingRow>
              <SettingRow title="Everything stays on this computer" description="Settings, history and queues are stored locally. No account, no cloud.">
                <span className="text-[13px] font-medium text-ok">Local only</span>
              </SettingRow>
              <SettingRow title="Saved logins" description={keyringStrong === false ? 'Your system has no keyring service, so logins you save for downloads are only lightly hidden on this computer. Install and unlock one (GNOME Keyring or KWallet) for real protection.' : 'Passwords you save for a download are sealed by your system keyring. Mirrors and other sites never receive them.'}>
                <span className={keyringStrong === false ? 'text-[13px] font-medium text-warn' : 'text-[13px] font-medium text-ok'}>{keyringStrong === false ? 'Lightly hidden' : keyringStrong ? 'Keyring' : '…'}</span>
              </SettingRow>
              <SettingRow title="Diagnostic mode" description="Write detailed logs for bug reports (kept on this computer).">
                <Toggle label="Diagnostic mode privacy" checked={settings.diagnosticMode} onChange={(v) => update({ diagnosticMode: v })} />
              </SettingRow>
            </SectionCard>
          )}

          {show('advanced') && (
            <>
              <SectionCard className={hideEmpty} title="Advanced" icon={Wrench}>
                <SettingRow title="Import settings" description="Load a KDM settings file.">
                  <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Settings file" onChange={(e) => void onImport(e.target.files?.[0])} />
                  <Button onClick={() => fileRef.current?.click()}>Import…</Button>
                </SettingRow>
                <SettingRow title="Export settings" description="Save your preferences to kdm-settings.json.">
                  <Button onClick={onExport}>Export</Button>
                </SettingRow>
                <SettingRow title="Log folder">
                  <TextField label="Log folder" srOnlyLabel value={settings.logFolder} onChange={(e) => update({ logFolder: e.target.value })} className="w-72" />
                  <Button icon={<FolderOpen size={15} />} onClick={() => void pickFolder('logFolder')}>Browse</Button>
                </SettingRow>
                <SettingRow title="Setup wizard" description="Run the first-run setup again (folder, browser, speed profile).">
                  <Button onClick={() => update({ setupDone: false })}>Run setup again</Button>
                </SettingRow>
                <SettingRow title="Reset settings" description="Return every preference to its default.">
                  <Button variant="danger" onClick={onReset}>Reset settings</Button>
                </SettingRow>
                <SettingRow title="Restore demo data" description="Replace downloads, queues and rules with the demo workspace.">
                  <Button variant="outline" onClick={onResetData}>Restore demo data</Button>
                </SettingRow>
              </SectionCard>
            </>
          )}

          {!q && section === 'about' && (
            <>
              <SectionCard title="Open Source / GPLv3" icon={Info} bodyClassName="px-5 pb-5">
                <p className="text-[13px] text-fg2">
                  KDM (Kelmo Download Manager) v{APP_VERSION} — The Open Download Workspace.
                </p>
                <p className="mt-1 text-[13px] font-medium text-fg">{GPL_STATEMENT}</p>
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
    </SettingsQueryContext.Provider>
  );
}
