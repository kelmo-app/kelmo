'use strict';
// Diagnostic mode: a plain text log for bug reports, kept on this computer. Off unless the person turns it on.
// It records what happened (state changes, errors), never cookies and never the part of a link after "?".
const path = require('node:path');
const os = require('node:os');

/** host + path only: no query string, no user:password, no fragment. */
function redactUrl(u) {
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.host}${p.pathname}`;
  } catch {
    return '(invalid link)';
  }
}

function expandHome(p) {
  if (!p) return path.join(os.homedir(), '.local', 'share', 'kelmo', 'logs');
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').slice(0, 500);

/** @param {{ fs: typeof import('node:fs'), now?: () => Date, getCfg: () => { diagnostic?: boolean, logFolder?: string } }} o */
function createDiagLogger({ fs, now = () => new Date(), getCfg }) {
  let madeDir = null;
  return function log(line) {
    const cfg = getCfg();
    if (!cfg || !cfg.diagnostic) return false;
    try {
      const d = now();
      const dir = expandHome(cfg.logFolder);
      if (madeDir !== dir) { fs.mkdirSync(dir, { recursive: true }); madeDir = dir; }
      const day = d.toISOString().slice(0, 10);
      fs.appendFileSync(path.join(dir, `kdm-${day}.log`), `${d.toISOString()} ${clean(line)}\n`);
      return true;
    } catch {
      return false; // logging must never break a download
    }
  };
}

module.exports = { createDiagLogger, redactUrl, expandHome };
