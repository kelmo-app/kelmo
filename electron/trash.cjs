'use strict';
// "Delete from disk" (like IDM's second option). Files go to the Trash, so a mis-click can be undone.
// Only things KELMO itself downloaded are touched: <download folder>/<name>, plus its .part/.kdm leftovers.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const expand = (p, home) => (p === '~' || p.startsWith('~/') ? path.join(home, p.slice(1)) : p);

/** Turns {dir,name} requests into safe absolute targets; refuses anything odd. */
function planTrash(entries, home = os.homedir()) {
  const targets = [];
  const refused = [];
  for (const e of Array.isArray(entries) ? entries.slice(0, 500) : []) {
    const dirRaw = e && typeof e.dir === 'string' ? e.dir : '';
    const name = e && typeof e.name === 'string' ? e.name : '';
    const expanded = dirRaw ? expand(dirRaw, home) : '';
    const dir = expanded && path.isAbsolute(expanded) ? path.resolve(expanded) : '';
    const bad =
      !dir ||
      dir === path.parse(dir).root || dir === path.resolve(home) ||
      dir.split(path.sep).filter(Boolean).length < 2 ||
      !name || name === '.' || name === '..' || /[\\/\0]/.test(name) || name !== path.basename(name);
    if (bad) { refused.push(name || dirRaw || '?'); continue; }
    targets.push(path.join(dir, name));
  }
  return { targets, refused };
}

/** Moves each target to the Trash; deletes only KELMO's own .part/.kdm temp files outright. */
async function trashFiles(entries, { trashItem, home = os.homedir() } = {}) {
  const { targets, refused } = planTrash(entries, home);
  const out = { trashed: 0, missing: 0, failed: [...refused] };
  for (const t of targets) {
    for (const ext of ['.part', '.kdm']) await fs.promises.rm(t + ext, { force: true }).catch(() => {});
    if (!fs.existsSync(t)) { out.missing++; continue; }
    try { await trashItem(t); out.trashed++; } catch { out.failed.push(path.basename(t)); }
  }
  return out;
}

module.exports = { planTrash, trashFiles };
