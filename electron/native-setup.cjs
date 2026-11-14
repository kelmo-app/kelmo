'use strict';
// Registers KDM's Native Messaging host with every browser found on this computer, so the browser extension
// can pair itself (see native-host.cjs). Runs on each start: cheap, and it keeps the paths current after an update.
const fs = require('node:fs');
const path = require('node:path');

const HOST_NAME = 'org.kelmo.kdm';
/** Chrome-family extension IDs allowed to talk to KDM. The first one comes from the "key" in extension/manifest.json. Add the Web Store ID here once published. */
const EXTENSION_IDS = ['mebnldgdeopldepjibeadalpkehbpnll'];
const GECKO_ID = 'kdm@kelmo.dev';

/** Folders where each browser looks for host manifests on Linux (relative to the home folder). Only browsers already installed get a manifest. */
const LINUX_TARGETS = [
  { browser: 'chrome', dir: '.config/google-chrome/NativeMessagingHosts', root: '.config/google-chrome', kind: 'chromium' },
  { browser: 'chromium', dir: '.config/chromium/NativeMessagingHosts', root: '.config/chromium', kind: 'chromium' },
  { browser: 'brave', dir: '.config/BraveSoftware/Brave-Browser/NativeMessagingHosts', root: '.config/BraveSoftware/Brave-Browser', kind: 'chromium' },
  { browser: 'vivaldi', dir: '.config/vivaldi/NativeMessagingHosts', root: '.config/vivaldi', kind: 'chromium' },
  { browser: 'edge', dir: '.config/microsoft-edge/NativeMessagingHosts', root: '.config/microsoft-edge', kind: 'chromium' },
  { browser: 'opera', dir: '.config/opera/NativeMessagingHosts', root: '.config/opera', kind: 'chromium' },
  { browser: 'firefox', dir: '.mozilla/native-messaging-hosts', root: '.mozilla', kind: 'firefox' },
];

/** Registry keys (HKCU) per browser on Windows. */
const WINDOWS_KEYS = [
  { browser: 'chrome', key: 'Software\\Google\\Chrome\\NativeMessagingHosts', kind: 'chromium' },
  { browser: 'edge', key: 'Software\\Microsoft\\Edge\\NativeMessagingHosts', kind: 'chromium' },
  { browser: 'brave', key: 'Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts', kind: 'chromium' },
  { browser: 'chromium', key: 'Software\\Chromium\\NativeMessagingHosts', kind: 'chromium' },
  { browser: 'firefox', key: 'Software\\Mozilla\\NativeMessagingHosts', kind: 'firefox' },
];

/** Flatpak browsers run in a sandbox that cannot start programs outside it, so for them the "host" is a tiny shell script placed inside the app's own folder. */
const FLATPAK_TARGETS = [
  { id: 'com.brave.Browser', dir: 'config/BraveSoftware/Brave-Browser/NativeMessagingHosts', kind: 'chromium' },
  { id: 'com.google.Chrome', dir: 'config/google-chrome/NativeMessagingHosts', kind: 'chromium' },
  { id: 'org.chromium.Chromium', dir: 'config/chromium/NativeMessagingHosts', kind: 'chromium' },
  { id: 'com.microsoft.Edge', dir: 'config/microsoft-edge/NativeMessagingHosts', kind: 'chromium' },
  { id: 'com.vivaldi.Vivaldi', dir: 'config/vivaldi/NativeMessagingHosts', kind: 'chromium' },
  { id: 'org.mozilla.firefox', dir: '.mozilla/native-messaging-hosts', kind: 'firefox' },
  { id: 'io.gitlab.librewolf-community', dir: '.librewolf/native-messaging-hosts', kind: 'firefox' },
];

/** A POSIX script that answers the extension's one request ({"op":"pair"}) with the token. Needs only sh, head and printf. */
function sandboxHostScript(token) {
  const body = Buffer.from(JSON.stringify({ ok: true, token }), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  const octal = [...head].map((b) => '\\' + b.toString(8).padStart(3, '0')).join('');
  return `#!/bin/sh\n# KDM pairing helper for a sandboxed browser. Written by KDM; safe to delete.\nhead -c 17 >/dev/null 2>&1\nprintf '${octal}{"ok":true,"token":"%s"}' '${token}'\n`;
}

/** Makes `dst` match `src` touching only what differs: a browser that is running (and watching the folder) never sees it vanish or reload for nothing. */
function syncDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const want = new Set();
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    want.add(e.name);
    const from = path.join(src, e.name);
    const to = path.join(dst, e.name);
    if (e.isDirectory()) { syncDir(from, to); continue; }
    const data = fs.readFileSync(from);
    let same = false;
    try { same = fs.statSync(to).isFile() && data.equals(fs.readFileSync(to)); } catch { /* new file */ }
    if (!same) fs.writeFileSync(to, data);
  }
  for (const e of fs.readdirSync(dst)) if (!want.has(e)) fs.rmSync(path.join(dst, e), { recursive: true, force: true });
}

/**
 * A Flatpak browser can read an unpacked extension from, say, ~/Desktop only for the session in which it was picked: after a restart
 * the extension silently disappears. A copy inside the browser's own data folder is always readable, so keep one there.
 */
function copyExtension(source, home) {
  const out = [];
  if (!source || !fs.existsSync(path.join(source, 'manifest.json'))) return out;
  for (const t of FLATPAK_TARGETS) {
    if (t.kind !== 'chromium') continue;
    const appDir = path.join(home, '.var', 'app', t.id);
    if (!fs.existsSync(appDir)) continue;
    const dest = path.join(appDir, 'data', 'KDM-extension');
    syncDir(source, dest);
    out.push(dest);
  }
  return out;
}

const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

function manifestFor(kind, wrapperPath) {
  const base = { name: HOST_NAME, description: 'KDM — Kelmo Download Manager', path: wrapperPath, type: 'stdio' };
  return kind === 'firefox'
    ? { ...base, allowed_extensions: [GECKO_ID] }
    : { ...base, allowed_origins: EXTENSION_IDS.map((id) => `chrome-extension://${id}/`) };
}

/**
 * @param {{ platform: string, home: string, execPath: string, hostScript: string, tokenFile: string, token?: string, extensionSource?: string, dataDir: string,
 *           runReg?: (args: string[]) => void }} o
 * @returns {{ wrapper: string, written: string[] }}
 */
function install(o) {
  const written = [];
  fs.mkdirSync(o.dataDir, { recursive: true });

  // The browser runs one program per message: a tiny launcher that starts the host with KDM's own Node (Electron).
  const win = o.platform === 'win32';
  const wrapper = path.join(o.dataDir, win ? 'kdm-native-host.cmd' : 'kdm-native-host');
  fs.writeFileSync(
    wrapper,
    win
      ? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${o.execPath}" "${o.hostScript}" "${o.tokenFile}" %*\r\n`
      : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${shq(o.execPath)} ${shq(o.hostScript)} ${shq(o.tokenFile)} "$@"\n`,
    { mode: 0o755 },
  );
  if (!win) fs.chmodSync(wrapper, 0o755);

  if (o.platform === 'linux') {
    for (const t of LINUX_TARGETS) {
      if (!fs.existsSync(path.join(o.home, t.root))) continue; // that browser is not installed
      const dir = path.join(o.home, t.dir);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, HOST_NAME + '.json');
      fs.writeFileSync(file, JSON.stringify(manifestFor(t.kind, wrapper), null, 2));
      written.push(file);
    }
    if (/^[a-f0-9]{32}$/.test(o.token || '')) {
      for (const t of FLATPAK_TARGETS) {
        const appDir = path.join(o.home, '.var', 'app', t.id);
        if (!fs.existsSync(appDir)) continue;
        const dir = path.join(appDir, t.dir);
        fs.mkdirSync(dir, { recursive: true });
        const script = path.join(dir, 'kdm-native-host.sh');
        fs.writeFileSync(script, sandboxHostScript(o.token), { mode: 0o700 });
        fs.chmodSync(script, 0o700);
        const file = path.join(dir, HOST_NAME + '.json');
        fs.writeFileSync(file, JSON.stringify(manifestFor(t.kind, script), null, 2));
        written.push(file);
      }
    }
  } else if (win) {
    for (const t of WINDOWS_KEYS) {
      const file = path.join(o.dataDir, `${HOST_NAME}.${t.kind}.json`);
      fs.writeFileSync(file, JSON.stringify(manifestFor(t.kind, wrapper), null, 2));
      try {
        o.runReg?.(['add', `HKCU\\${t.key}\\${HOST_NAME}`, '/ve', '/t', 'REG_SZ', '/d', file, '/f']);
        written.push(file);
      } catch { /* that browser may not be installed */ }
    }
  }
  let extensionCopies = [];
  if (o.platform === 'linux') { try { extensionCopies = copyExtension(o.extensionSource, o.home); } catch { /* the native host still works */ } }
  return { wrapper, written, extensionCopies };
}

module.exports = { install, copyExtension, sandboxHostScript, FLATPAK_TARGETS, manifestFor, HOST_NAME, EXTENSION_IDS, GECKO_ID, LINUX_TARGETS, WINDOWS_KEYS };
