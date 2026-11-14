import type { LinkHealthRaw } from '@/types/global';
import { formatBytes } from '@/lib/format';

export type HealthState = 'alive' | 'changed' | 'noresume' | 'page' | 'expired' | 'dead' | 'busy' | 'server' | 'offline';
export interface HealthReport {
  state: HealthState;
  tone: 'ok' | 'warn' | 'bad';
  title: string;
  detail: string;
}

export interface HealthContext {
  fileName: string;
  /** Size KDM knows from the first request (0 = unknown). */
  totalBytes: number;
  /** Bytes already on disk. */
  downloadedBytes: number;
}

const WEB_EXT = /\.(html?|php|aspx?|jsp)$/i;

/** Turns the engine's raw answer into a short, plain explanation of what is wrong (or fine) with a link. */
export function describeHealth(raw: LinkHealthRaw, ctx: HealthContext): HealthReport {
  if (!raw.ok) {
    const s = raw.status;
    if (s === 401) return { state: 'expired', tone: 'bad', title: 'Login needed (401)', detail: 'This site asks for a user name and password. Remove the download and add it again with the login filled in.' };
    if (s === 403) return { state: 'expired', tone: 'bad', title: `Access denied (${s})`, detail: 'The link has probably expired or needs you to be signed in. Open the page again in your browser and send the fresh link to KDM.' };
    if (s === 404 || s === 410) return { state: 'dead', tone: 'bad', title: `File not found (${s})`, detail: 'The server no longer has this file. Look for a new link or another mirror.' };
    if (s === 429) return { state: 'busy', tone: 'warn', title: 'Too many requests (429)', detail: 'The server asks you to slow down. Try again in a few minutes, or use fewer connections.' };
    if (s >= 500) return { state: 'server', tone: 'warn', title: `Server problem (${s})`, detail: 'The website is having trouble. It usually works again later.' };
    if (s > 0) return { state: 'dead', tone: 'bad', title: `Refused (${s})`, detail: 'The server did not accept the request.' };
    return raw.error === 'timeout'
      ? { state: 'offline', tone: 'warn', title: 'No answer (timeout)', detail: 'The server took too long to reply. Check your connection or try again.' }
      : { state: 'offline', tone: 'warn', title: 'Can’t reach the server', detail: 'Check your internet connection (or VPN / proxy) and try again.' };
  }
  if (raw.contentType === 'text/html' && !WEB_EXT.test(ctx.fileName)) {
    return { state: 'page', tone: 'bad', title: 'The link opens a web page', detail: 'Instead of the file the server sends a web page, usually a login, captcha or “link expired” page.' };
  }
  if (ctx.totalBytes > 0 && raw.size > 0 && raw.size !== ctx.totalBytes) {
    return { state: 'changed', tone: 'warn', title: 'The file changed on the server', detail: `It was ${formatBytes(ctx.totalBytes)}, now it is ${formatBytes(raw.size)}. Resuming could give a broken file: restart this download.` };
  }
  if (!raw.rangeOk && ctx.downloadedBytes > 0) {
    return { state: 'noresume', tone: 'warn', title: 'Link works, but cannot resume', detail: 'This server does not support resuming, so a restart begins from zero.' };
  }
  const bits = [raw.size ? formatBytes(raw.size) : 'size unknown', raw.rangeOk ? 'resume supported' : 'no resume', `${raw.ms} ms`];
  return { state: 'alive', tone: 'ok', title: 'Link is alive', detail: bits.join(' · ') };
}
