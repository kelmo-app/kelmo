import { useEffect, useState } from 'react';
import { Check, Copy, Globe } from 'lucide-react';
import { platform } from '@/services/platform';
import { useUiStore } from '@/store/uiStore';
import { SectionCard } from '@/components/Common';
import { Button } from '@/components/ui/Button';

/** Shows the pairing token the browser extension needs (desktop app only). */
export function BrowserIntegrationCard() {
  const toast = useUiStore((s) => s.toast);
  const [info, setInfo] = useState<{ token: string; port: number | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void platform.browserInfo().then(setInfo);
  }, []);

  const copy = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ tone: 'warning', title: 'Could not copy', description: 'Select the token and copy it manually.' }, 3000);
    }
  };

  return (
    <SectionCard title="Browser integration" icon={Globe} bodyClassName="px-5 pb-5">
      {!platform.isElectron ? (
        <p className="text-[13px] text-fg2">Available in the desktop app. Open KDM from your application menu to pair a browser.</p>
      ) : !info ? (
        <p className="text-[13px] text-fg2">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-fg2">
            Install the KDM extension (the <code className="rounded bg-surface3 px-1">extension</code> folder). It pairs itself with KDM: nothing to copy.
            If a browser was already open when KDM was installed, restart it once. The token below is only a fallback for the extension's options page.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              aria-label="Pairing token"
              value={info.token}
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 w-80 max-w-full rounded-md border border-line bg-surface2 px-3 font-mono text-[13px] text-fg"
            />
            <Button icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy token'}
            </Button>
          </div>
          <p className="text-[12px] text-fg3">
            {info.port ? `Listening on 127.0.0.1:${info.port} (this computer only).` : 'The local bridge could not start — another program may be using ports 47631–47635.'}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
