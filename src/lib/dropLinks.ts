/** Web links inside what the browser hands over on a drag-and-drop (uri-list first, then plain text). */
export function linksFromDrop(data: { uriList?: string; text?: string }): string[] {
  const fromList = (data.uriList ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const words = fromList.length ? fromList : (data.text ?? '').split(/\s+/);
  const out: string[] = [];
  for (const w of words) {
    if (!/^https?:\/\//i.test(w) || out.includes(w)) continue;
    try { new URL(w); out.push(w); } catch { /* not a link */ }
    if (out.length >= 200) break;
  }
  return out;
}
