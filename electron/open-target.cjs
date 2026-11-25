'use strict';
// "Open" on a torrent (a folder) should play the movie, not open the folder. Single files are untouched.
const fs = require('node:fs');
const path = require('node:path');

const MEDIA = /\.(mkv|mp4|m4v|avi|mov|webm|wmv|flv|ts|m2ts|mpg|mpeg|mp3|flac|m4a|ogg|opus|wav|aac)$/i;

/** The biggest media file inside `dir` (looks up to `depth` folders down), or null. */
function biggestMedia(dir, depth = 4) {
  let best = null;
  const walk = (d, left) => {
    let list;
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (left > 0) walk(p, left - 1); continue; }
      if (!e.isFile() || !MEDIA.test(e.name)) continue;
      let size = 0;
      try { size = fs.statSync(p).size; } catch { continue; }
      if (!best || size > best.size) best = { p, size };
    }
  };
  walk(dir, depth);
  return best ? best.p : null;
}

const RISKY = /\.(exe|msi|bat|cmd|com|scr|sh|run|appimage|desktop|jar|js|py|pl|ps1|vbs|bin|rpm|deb)$/i;

/** The biggest file of any harmless kind (archive, ISO, document…), or null. */
function biggestFile(dir, depth = 4) {
  let best = null;
  const walk = (d, left) => {
    let list;
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (left > 0) walk(p, left - 1); continue; }
      if (!e.isFile() || RISKY.test(e.name)) continue;
      let size = 0;
      try { size = fs.statSync(p).size; } catch { continue; }
      if (!best || size > best.size) best = { p, size };
    }
  };
  walk(dir, depth);
  return best ? best.p : null;
}

/** What to hand to the OS for "Open": a file stays a file; a folder becomes its main media file when it has one. */
function resolveOpenTarget(target) {
  try {
    if (fs.statSync(target).isDirectory()) return biggestMedia(target) || biggestFile(target) || target;
  } catch { /* missing: let the OS report it */ }
  return target;
}

module.exports = { resolveOpenTarget, biggestMedia, biggestFile };
