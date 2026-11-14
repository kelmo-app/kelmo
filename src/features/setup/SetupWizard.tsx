import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, FolderOpen, Gauge, GitBranch, Monitor, Scale } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SPEED_PROFILES } from '@/data/defaults';
import { platform } from '@/services/platform';
import { useSettingsStore } from '@/store/settingsStore';
import { Button } from '@/components/ui/Button';
import { Segmented, TextField, Toggle } from '@/components/ui/Fields';
import type { Settings } from '@/types';

const STEPS = [
  { title: 'Welcome', sub: 'Get started with KELMO' },
  { title: 'Download folder', sub: 'Choose where to save' },
  { title: 'Browser Bridge', sub: 'Connect your browser' },
  { title: 'Speed profile', sub: 'Set your preferences' },
  { title: 'Appearance', sub: 'Make it yours' },
  { title: 'Ready', sub: 'All set to download' },
] as const;

function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 4l24 14v28L32 60 8 46V18z" fill="none" stroke="rgb(var(--accent))" strokeWidth="4" strokeLinejoin="round" />
      <path d="M24 20v24M26 32l14-12M26 32l14 12" fill="none" stroke="rgb(var(--accent2))" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PROFILE_ICON = { max: Gauge, balanced: Scale, background: Monitor } as const;

function Heading({ children, sub }: { children: ReactNode; sub: ReactNode }) {
  return (
    <>
      <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-accent">{children}</h2>
      <p className="mt-2 max-w-2xl text-[15px] text-fg2">{sub}</p>
    </>
  );
}

/** First-run setup. Every choice is a real setting and is saved as you go; "Skip setup" keeps the defaults. */
export function SetupWizard() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const updateNested = useSettingsStore((s) => s.updateNested);
  const [step, setStep] = useState(0);
  const [bridge, setBridge] = useState<{ token: string; port: number | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void platform.browserInfo().then(setBridge);
  }, []);

  const finish = () => update({ setupDone: true });
  const last = step === STEPS.length - 1;
  const profileId = SPEED_PROFILES.find((p) => p.connections === settings.maxConnections && p.limit === settings.bandwidthLimit)?.id ?? null;

  const pickFolder = async () => {
    const dir = await platform.pickFolder();
    if (dir) update({ defaultFolder: dir });
  };
  const copyToken = async () => {
    if (!bridge) return;
    try {
      await navigator.clipboard.writeText(bridge.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* user can select the text instead */ }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="KELMO setup" className="fixed inset-0 z-[70] flex flex-col bg-bg text-fg">
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Setup steps" className="hidden w-[250px] shrink-0 flex-col border-r border-line bg-surface/60 p-6 md:flex">
          <ol className="flex flex-col gap-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-center gap-3" aria-current={i === step ? 'step' : undefined}>
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-semibold',
                    i === step ? 'border-accent text-accent shadow-glow' : i < step ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line text-fg3',
                  )}
                >
                  {i < step ? <Check size={16} aria-hidden /> : String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-[14px] font-medium', i === step ? 'text-fg' : 'text-fg2')}>{s.title}</span>
                  <span className="block truncate text-[12px] text-fg3">{s.sub}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-auto">
            <p className="text-[18px] font-semibold tracking-[0.2em] text-fg">KELMO</p>
            <p className="text-[12px] text-fg3">Open Source. For a Freer Web.</p>
          </div>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-8 lg:p-10">
          <p className="mb-4 text-[12px] font-medium uppercase tracking-[0.2em] text-fg3">
            {step === 0 ? 'Welcome to KELMO' : `Step ${step + 1} of ${STEPS.length}`}
          </p>

          {step === 0 && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <Logo size={72} />
                <span className="text-[56px] font-bold leading-none tracking-wide text-fg">KELMO</span>
              </div>
              <Heading sub="KELMO is an open-source, ad-free download manager built for everyone. Faster downloads, more freedom, and a better internet.">
                Downloads, beautifully under control.
              </Heading>
              <label className="flex max-w-sm flex-col gap-1.5 text-[13px] font-medium text-fg2">
                What should we call you?
                <TextField label="Your name" srOnlyLabel value={settings.userName} onChange={(e) => update({ userName: e.target.value })} />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-6">
              <Heading sub="Files are sorted into category folders (Compressed, Documents, Music, Programs, Video…) inside this folder. You can change each one later in Settings → Categories.">
                Where should downloads go?
              </Heading>
              <div className="flex max-w-2xl items-center gap-2">
                <TextField label="Download folder" srOnlyLabel value={settings.defaultFolder} onChange={(e) => update({ defaultFolder: e.target.value })} className="flex-1" />
                <Button icon={<FolderOpen size={15} />} onClick={() => void pickFolder()}>Browse</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex max-w-2xl flex-col gap-5">
              <Heading sub="Install the KELMO extension in your browser so links you click open here, with your login and a file-size check, like IDM.">
                Connect your browser
              </Heading>
              {!platform.isElectron ? (
                <p className="text-[13px] text-fg2">Available in the desktop app.</p>
              ) : !bridge ? (
                <p className="text-[13px] text-fg2">Loading…</p>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                  <ol className="list-decimal space-y-1 pl-5 text-[13px] text-fg2">
                    <li>Load the <code className="rounded bg-surface3 px-1">extension</code> folder in your browser (extensions page → developer mode → load unpacked).</li>
                    <li>Open the extension’s options and paste this pairing token.</li>
                  </ol>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface2 px-3 py-2 font-mono text-[12px]">{bridge.token}</code>
                    <Button icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={() => void copyToken()}>{copied ? 'Copied' : 'Copy'}</Button>
                  </div>
                  <p className="text-[12px] text-fg3">{bridge.port ? `Listening on 127.0.0.1:${bridge.port} (this computer only).` : 'The bridge is not running yet.'} You can also do this later in Settings → Browser Bridge.</p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <Heading sub="This sets how many connections each download uses and an optional speed limit. You can change it any time in Settings.">
                Choose a default speed profile
              </Heading>
              <div className="grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-3" role="radiogroup" aria-label="Speed profile">
                {SPEED_PROFILES.map((p) => {
                  const Icon = PROFILE_ICON[p.id];
                  const on = profileId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => update({ maxConnections: p.connections, bandwidthLimit: p.limit })}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-xl border p-5 text-center transition',
                        on ? 'border-accent bg-accent/10 shadow-glow' : 'border-line bg-surface hover:border-accent/50',
                      )}
                    >
                      <Icon size={30} className="text-accent" aria-hidden />
                      <span className="text-[16px] font-semibold text-fg">{p.title}</span>
                      <span className="text-[13px] text-fg2">{p.tagline}</span>
                      <span className="mt-1 text-[13px] text-fg3">{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex max-w-2xl flex-col gap-5">
              <Heading sub="Pick how KELMO looks and starts. All of this can be changed later.">Make it yours</Heading>
              <div className="divide-y divide-line rounded-xl border border-line bg-surface">
                <Row title="Theme" sub="Dark, light, or follow your system.">
                  <Segmented<Settings['theme']> label="Theme" value={settings.theme} onChange={(v) => update({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
                </Row>
                <Row title="Interface" sub="Simple is a list of your downloads, like IDM. Advanced adds Overview, Queues and Scheduler.">
                  <Segmented<Settings['uiMode']> label="Interface" value={settings.uiMode} onChange={(v) => update({ uiMode: v })} options={[{ value: 'simple', label: 'Simple' }, { value: 'advanced', label: 'Advanced' }]} />
                </Row>
                <Row title="Floating drop target" sub="A small box in the corner: drag a link from the browser onto it to download. Off by default.">
                  <Toggle label="Floating drop target" checked={settings.dropTarget} onChange={(v) => update({ dropTarget: v })} />
                </Row>
                <Row title="Start with your computer" sub="Runs quietly in the tray so browser links are caught.">
                  <Toggle label="Start on system startup" checked={settings.startupBehavior.launchOnStartup} onChange={(v) => updateNested('startupBehavior', { launchOnStartup: v })} />
                </Row>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex max-w-2xl flex-col gap-5">
              <Heading sub="Here is what you chose. Everything is in Settings if you change your mind.">You’re all set</Heading>
              <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4 text-[13px]">
                <dt className="text-fg3">Download folder</dt><dd className="truncate text-fg">{settings.defaultFolder}</dd>
                <dt className="text-fg3">Speed profile</dt><dd className="text-fg">{SPEED_PROFILES.find((p) => p.id === profileId)?.title ?? `Custom (${settings.maxConnections} connections)`}</dd>
                <dt className="text-fg3">Interface</dt><dd className="text-fg">{settings.uiMode === 'simple' ? 'Simple' : 'Advanced'} · {settings.theme}</dd>
                <dt className="text-fg3">Browser</dt><dd className="text-fg">{bridge?.port ? 'Bridge ready — pair the extension any time' : 'Not connected yet'}</dd>
              </dl>
            </div>
          )}
        </main>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/60 px-6 py-3">
        <p className="flex items-center gap-4 text-[12px] text-fg3">
          <span>GPLv3 licensed</span>
          <span className="flex items-center gap-1"><GitBranch size={13} aria-hidden /> Source available</span>
          <span className="hidden sm:inline">Windows + Linux</span>
        </p>
        <div className="flex items-center gap-2">
          <Button icon={<ArrowLeft size={15} />} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
          {!last && <Button onClick={finish}>Skip setup</Button>}
          <Button variant="primary" iconRight={<ArrowRight size={15} />} onClick={() => (last ? finish() : setStep((s) => s + 1))}>
            {last ? 'Start using KELMO' : 'Continue'}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-[200px] flex-1">
        <p className="text-[14px] font-medium text-fg">{title}</p>
        <p className="text-[12.5px] text-fg3">{sub}</p>
      </div>
      {children}
    </div>
  );
}
