export const MAX_MIRRORS = 8;

/** Turns the text of a "mirrors" box (one link per line) into a clean list: valid http(s) only, no duplicates, never the main link. */
export function parseMirrors(text: string, mainUrl = ''): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const u = raw.trim();
    if (!u || u === mainUrl.trim() || out.includes(u)) continue;
    try {
      const p = new URL(u);
      if (p.protocol === 'http:' || p.protocol === 'https:') out.push(u);
    } catch { /* not a link */ }
    if (out.length >= MAX_MIRRORS) break;
  }
  return out;
}
