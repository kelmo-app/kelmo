export const MAX_BATCH = 200;

const RANGE = /\[(\d+)-(\d+)\]|\[([a-zA-Z])-([a-zA-Z])\]/;

/**
 * `game.part[1-10].rar` → part1 … part10. `[01-10]` keeps the zero padding, `[a-e]` walks letters.
 * An invalid range (like `[5-2]`) is left as plain text. Several ranges in one link multiply.
 */
export function expandPattern(link: string, limit = MAX_BATCH): string[] {
  const m = RANGE.exec(link);
  if (!m) return [link];
  const values: string[] = [];
  if (m[1] !== undefined) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a > b || b - a >= limit) return [link];
    const pad = m[1].startsWith('0') ? m[1].length : 0;
    for (let i = a; i <= b; i++) values.push(String(i).padStart(pad, '0'));
  } else {
    const a = m[3].charCodeAt(0);
    const b = m[4].charCodeAt(0);
    if (a > b) return [link];
    for (let i = a; i <= b; i++) values.push(String.fromCharCode(i));
  }
  const out: string[] = [];
  for (const v of values) {
    for (const rest of expandPattern(link.slice(0, m.index) + v + link.slice(m.index + m[0].length), limit - out.length)) {
      out.push(rest);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export interface BatchResult {
  urls: string[];
  /** words that were not http(s) links */
  invalid: number;
  /** more links than MAX_BATCH were given */
  truncated: boolean;
}

/** Many links at once: one per line (or space separated), with optional `[1-10]` patterns. */
export function parseBatch(text: string): BatchResult {
  const urls: string[] = [];
  let invalid = 0;
  let truncated = false;
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (!/^https?:\/\//i.test(word)) { invalid++; continue; }
    for (const u of expandPattern(word)) {
      try { new URL(u); } catch { invalid++; continue; }
      if (urls.includes(u)) continue;
      if (urls.length >= MAX_BATCH) { truncated = true; break; }
      urls.push(u);
    }
  }
  return { urls, invalid, truncated };
}
