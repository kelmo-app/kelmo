/* KELMO — Electron main process (CommonJS so it runs without a build step). */
const { app, BrowserWindow, Menu, Tray, ipcMain, shell, nativeImage, dialog, clipboard, screen, session, safeStorage } = require('electron');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createBridgeServer, listenOnFirstFree } = require('./bridge-server.cjs');
const nativeSetup = require('./native-setup.cjs');
const { createPopups } = require('./popups.cjs');
const { createClipboardWatcher } = require('./clipboard-watch.cjs');
const { installContextMenu } = require('./context-menu.cjs');
const { createDiagLogger, redactUrl } = require('./diag-log.cjs');
const { createPower } = require('./power.cjs');
const { createSecrets, basicHeader } = require('./secrets.cjs');
const secrets = createSecrets(safeStorage);
const { execFile } = require('node:child_process');
const fs = require('node:fs');

const isDev = !!process.env.KELMO_DEV;
let mainWindow = null;
let tray = null;
let minimizeToTray = true; // like IDM: closing the window keeps KDM running in the tray
let popups = null;
// The main window's page signals "kdm:host-ready" once its listeners exist; until then messages wait.
let mainReady = false;
let readyQueue = [];
// Memory: when KDM sits in the tray with nothing to do, the main window (a whole Chromium renderer) is closed for real.
const IDLE_CLOSE_MS = 45_000;
let lastBusy = true;
let idleTimer = null;
const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
const trayIconPath = path.join(__dirname, '..', 'build', 'tray.png'); // the gold cube without a background: readable on any panel
const trayStateIcon = (state) => path.join(__dirname, '..', 'build', `tray-${state}.png`); // idle (grey) | busy (arrow) | paused | notify

/** Run `cb` with the main window's webContents once its page is ready (re-creating the window, hidden, if needed). */
function ensureMain(cb) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow(false);
  if (mainReady) cb(mainWindow.webContents);
  else readyQueue.push(cb);
}

ipcMain.on('kdm:host-ready', (e) => {
  if (!mainWindow || mainWindow.isDestroyed() || e.sender.id !== mainWindow.webContents.id) return;
  mainReady = true;
  const q = readyQueue;
  readyQueue = [];
  for (const cb of q) cb(mainWindow.webContents);
});

/** Called with the renderer's "busy" flag (a transfer is running/queued, or a schedule rule is waiting). */
function armIdleClose() {
  clearTimeout(idleTimer);
  idleTimer = null;
  if (lastBusy || !tray || !minimizeToTray) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible() || lastBusy) return;
    mainWindow.destroy(); // downloads are saved; popups and the tray keep working, the window is rebuilt on demand
    mainReady = false;
  }, IDLE_CLOSE_MS);
}
function setTrayState(state) {
  if (!tray) return;
  try {
    const img = nativeImage.createFromPath(trayStateIcon(state));
    if (!img.isEmpty()) tray.setImage(img.resize({ width: 22, height: 22 }));
  } catch { /* keep the current icon */ }
}

function setBusy(busy) {
  lastBusy = !!busy;
  setTrayState(lastBusy ? 'busy' : 'idle');
  armIdleClose();
}

function createWindow(show = true) {
  mainReady = false;
  readyQueue = [];
  mainWindow = new BrowserWindow({
    show,
    icon: iconPath,
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0a0807',
    title: 'KELMO — The Open Download Workspace',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // the download manager runs in this page: keep its timers ticking while hidden in the tray
      backgroundThrottling: false,
    },
  });
  mainWindow.on('hide', armIdleClose);
  mainWindow.on('show', () => { clearTimeout(idleTimer); idleTimer = null; });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (minimizeToTray && tray && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return createWindow(true);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  try {
    let icon = nativeImage.createFromPath(trayIconPath);
    if (icon.isEmpty()) icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 22, height: 22 }));
    tray.setToolTip('KDM — Kelmo Download Manager');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open KDM', click: () => showMain() },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on('click', (_e, bounds) => (popups ? popups.toggleTray(bounds) : showMain()));
    setTrayState(lastBusy ? 'busy' : 'idle');
  } catch {
    tray = null;
  }
}

// ---- IPC: the renderer talks to the OS only through this narrow surface. ----
const expandTilde = (p) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p);
ipcMain.handle('kelmo:open-path', async (_e, raw) => {
  if (typeof raw !== 'string' || !raw) return { ok: false, error: 'Invalid path' };
  const target = expandTilde(raw);
  const err = await shell.openPath(target);
  return err ? { ok: false, error: err } : { ok: true };
});

ipcMain.handle('kelmo:show-in-folder', async (_e, raw) => {
  if (typeof raw !== 'string' || !raw) return { ok: false };
  const target = expandTilde(raw);
  if (fs.existsSync(target)) shell.showItemInFolder(target);
  else await shell.openPath(path.dirname(target));
  return { ok: true };
});

// Add URL grabs a link you just copied (like IDM): http(s) or magnet, nothing else is ever handed to the page.
ipcMain.handle('kelmo:clipboard-link', () => {
  try {
    const t = String(clipboard.readText() || '').trim();
    if (t.length > 4096 || /\s/.test(t)) return '';
    return /^https?:\/\/\S+$/i.test(t) || /^magnet:\?xt=urn:bt/i.test(t) ? t : '';
  } catch { return ''; }
});

ipcMain.handle('kelmo:pick-torrent', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Torrent files', extensions: ['torrent'] }] });
  return res.canceled ? null : require('node:url').pathToFileURL(res.filePaths[0]).href;
});

ipcMain.handle('kelmo:pick-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

// Start with the computer (quietly, into the tray) like IDM.
ipcMain.handle('kelmo:set-autostart', (_e, enabled) => {
  try {
    if (process.platform === 'linux') {
      const dir = path.join(os.homedir(), '.config', 'autostart');
      const file = path.join(dir, 'kdm.desktop');
      if (!enabled) { fs.rmSync(file, { force: true }); return true; }
      const launcher = path.join(os.homedir(), '.local', 'bin', 'kdm');
      const exec = process.env.APPIMAGE || (app.isPackaged ? process.execPath : fs.existsSync(launcher) ? launcher : null);
      if (!exec) return false;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=KDM\nComment=Kelmo Download Manager (tray)\nExec="${exec}" --hidden\nIcon=kdm\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
      return true;
    }
    app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--hidden'] });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('kelmo:set-tray', (_e, enabled) => {
  minimizeToTray = !!enabled;
  if (minimizeToTray) createTray();
  return true;
});

// ---- Browser bridge: lets the KDM browser extension hand links to this app. ----
let bridgeToken = '';
let bridgePort = null;
function loadBridgeToken() {
  const file = path.join(app.getPath('userData'), 'browser-token');
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    if (/^[a-f0-9]{32}$/.test(t)) return t;
  } catch {}
  const t = crypto.randomBytes(16).toString('hex');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, t, { mode: 0o600 });
  } catch {}
  return t;
}
function startBridge() {
  bridgeToken = loadBridgeToken();
  const server = createBridgeServer({
    token: bridgeToken,
    version: app.getVersion(),
    // IDM style: a small "Download File Info" window appears; the main window stays hidden.
    onAdd: (req) => popups.openAdd(req),
  });
  listenOnFirstFree(server, 47631, 5).then((p) => (bridgePort = p)).catch(() => (bridgePort = null));
  registerNativeHost();
}

/** Lets the browser extension pair itself (no token to copy): see electron/native-host.cjs. Never blocks start-up. */
function registerNativeHost() {
  try {
    const dataDir = path.join(app.getPath('userData'), 'native');
    nativeSetup.install({
      platform: process.platform,
      home: app.getPath('home'),
      execPath: process.execPath,
      hostScript: path.join(__dirname, 'native-host.cjs'),
      tokenFile: path.join(app.getPath('userData'), 'browser-token'),
      token: bridgeToken,
      extensionSource: app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.join(__dirname, '..', 'extension'),
      dataDir,
      runReg: (args) => require('node:child_process').execFileSync('reg', args, { stdio: 'ignore', windowsHide: true }),
    });
  } catch (e) {
    console.warn('native host registration failed:', e && e.message);
  }
}
ipcMain.handle('kdm:browser-info', () => ({ token: bridgeToken, port: bridgePort }));

// ---- Real download engine (engine/host.mjs). Loaded lazily; ESM via dynamic import. ----
let enginePromise = null;
function getEngine() {
  if (!enginePromise) {
    enginePromise = import('../engine/host.mjs').then(({ createHost }) =>
      createHost((ev) => {
        // per-connection detail is only for the progress window; the main window never needs it
        const { detail, ...rest } = ev;
        if (ev.type === 'state') diag(`state ${ev.id} ${ev.status}${ev.error ? `: ${ev.error}` : ''}${ev.fileName ? ` (${ev.fileName})` : ''}`);
        if (detail && popups) popups.sendDetail(ev.id, detail);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('kdm:event', rest);
      }, { ytdlpDir: path.join(app.getPath('userData'), 'bin'), jsFallback: process.versions.electron ? process.execPath : undefined }),
    );
  }
  return enginePromise;
}
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length < 100;

// ---- Engine settings pushed by the main window (proxy, timeout, user-agent, retries, file allocation, log) ----
let engineCfg = { proxyMode: 'system', proxyHost: '', proxyPort: 8080, timeoutSec: 30, userAgent: '', retries: 3, allocation: 'sparse', diagnostic: false, logFolder: '' };
const diag = createDiagLogger({ fs, getCfg: () => engineCfg });
ipcMain.handle('kdm:configure', (_e, cfg) => {
  if (!cfg || typeof cfg !== 'object') return false;
  const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.trunc(+v))) : d);
  engineCfg = {
    proxyMode: ['none', 'system', 'manual'].includes(cfg.proxyMode) ? cfg.proxyMode : 'system',
    proxyHost: typeof cfg.proxyHost === 'string' ? cfg.proxyHost.trim().slice(0, 253) : '',
    proxyPort: num(cfg.proxyPort, 1, 65535, 8080),
    timeoutSec: num(cfg.timeoutSec, 5, 300, 30),
    userAgent: typeof cfg.userAgent === 'string' ? cfg.userAgent.slice(0, 512) : '',
    retries: num(cfg.retryAttempts, 0, 10, 3),
    allocation: ['none', 'sparse', 'prealloc'].includes(cfg.fileAllocation) ? cfg.fileAllocation : 'sparse',
    diagnostic: !!cfg.diagnostic,
    logFolder: typeof cfg.logFolder === 'string' ? cfg.logFolder.slice(0, 1024) : '',
  };
  return true;
});

/** The proxy for this link: manual host:port, the system's choice (Chromium resolves it), or none. SOCKS is not supported. */
async function proxyFor(url) {
  if (engineCfg.proxyMode === 'none') return null;
  if (engineCfg.proxyMode === 'manual') return engineCfg.proxyHost ? { host: engineCfg.proxyHost, port: engineCfg.proxyPort } : null;
  try {
    const { parseProxyString } = await import('../engine/http.mjs');
    return parseProxyString(await session.defaultSession.resolveProxy(url));
  } catch {
    return null;
  }
}
/**
 * The Authorization header for a request: from a login just typed (`auth`, used for the quick look at a link), or from
 * the saved one (`authUser` + sealed `authSecret`). The password never goes further than this function.
 */
function basicFor(spec) {
  let user = '';
  let pass = null;
  if (spec.auth && typeof spec.auth.user === 'string') { user = spec.auth.user; pass = typeof spec.auth.password === 'string' ? spec.auth.password : ''; }
  else if (typeof spec.authUser === 'string' && spec.authUser) { user = spec.authUser; pass = secrets.open(spec.authSecret); }
  if (!user || pass === null) return undefined;
  return basicHeader(user.slice(0, 256), pass);
}
ipcMain.handle('kdm:seal', (_e, password) => (typeof password === 'string' ? secrets.seal(password) : ''));
ipcMain.handle('kdm:secret-info', () => ({ strong: secrets.strong() }));

/** Add the saved engine settings to a request from the window. */
async function withCfg(raw) {
  const { auth: _a, authUser: _u, authSecret: _s, ...spec } = raw;
  return { ...spec, basicAuth: basicFor(raw), retries: spec.retries ?? engineCfg.retries, timeoutSec: engineCfg.timeoutSec, userAgent: engineCfg.userAgent, allocation: engineCfg.allocation, proxy: await proxyFor(spec.url) };
}

ipcMain.handle('kdm:start', async (_e, spec) => {
  if (!spec || !isId(spec.id) || typeof spec.url !== 'string' || typeof spec.dir !== 'string') throw new Error('Invalid download request');
  const full = await withCfg(spec);
  diag(`start ${spec.id} ${redactUrl(spec.url)} connections=${spec.connections ?? '-'} proxy=${full.proxy ? `${full.proxy.host}:${full.proxy.port}` : 'none'} mirrors=${Array.isArray(spec.mirrors) ? spec.mirrors.length : 0}`);
  await (await getEngine()).start(full);
  return true;
});
ipcMain.handle('kdm:probe', async (_e, spec) => {
  if (!spec || typeof spec.url !== 'string') return null;
  try { return await (await getEngine()).probe(await withCfg(spec)); } catch (e) {
    diag(`probe failed ${redactUrl(spec.url)}: ${e && e.message}`);
    // the File Info window asks for the reason so it can offer the login fields on "401"
    const m = spec.wantStatus && /^HTTP (\d+)/.exec((e && e.message) || '');
    return m ? { ok: false, status: +m[1] } : null;
  }
});
ipcMain.handle('kdm:health', async (_e, spec) => {
  if (!spec || typeof spec.url !== 'string') return { ok: false, status: 0, error: 'invalid' };
  try {
    const r = await (await getEngine()).health(await withCfg(spec));
    diag(`health ${redactUrl(spec.url)} -> ${r.ok ? `ok ${r.ms}ms` : `${r.status} ${r.error}`}`);
    return r;
  } catch { return { ok: false, status: 0, error: 'unreachable' }; }
});
// ---- Video sites (YouTube…): yt-dlp, downloaded once into KDM's own folder after the user agrees ----
ipcMain.handle('kdm:video-status', async () => {
  try { return await (await getEngine()).videoStatus(); } catch { return { installed: false, version: '', managed: false, ffmpeg: false, runtime: null }; }
});
ipcMain.handle('kdm:video-install', async () => {
  try {
    const r = await (await getEngine()).videoInstall({ proxy: await proxyFor('https://github.com/') });
    diag(`video downloader installed ${r.version}`);
    return r;
  } catch (e) { diag(`video downloader install failed: ${e && e.message}`); return { ok: false, error: String((e && e.message) || e).slice(0, 300) }; }
});
ipcMain.handle('kdm:video-probe', async (_e, url, opts) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false, error: 'Invalid link' };
  try { return await (await getEngine()).videoProbe({ url, proxy: await proxyFor(url), cookie: opts && typeof opts.cookie === 'string' ? opts.cookie : undefined }); } catch (e) {
    diag(`video probe failed ${redactUrl(url)}: ${e && e.message}`);
    return { ok: false, error: String((e && e.message) || e).slice(0, 300) };
  }
});
ipcMain.handle('kdm:verify', async (_e, spec) => {
  if (!spec || typeof spec.dir !== 'string' || typeof spec.fileName !== 'string') return null;
  try {
    const r = await (await getEngine()).verify(spec);
    diag(`verify ${path.basename(spec.fileName)} -> ${r.algo} ${r.match === null ? 'hashed' : r.match ? 'match' : 'MISMATCH'}`);
    return r;
  } catch (e) { diag(`verify failed ${path.basename(String(spec.fileName))}: ${e && e.message}`); return null; }
});

// "When all downloads finish": quit / sleep / shut down, with a 60 s Cancel countdown for sleep and shut down.
const power = createPower({
  platform: process.platform,
  execFile: (f, a, cb) => execFile(f, a, { timeout: 15000 }, cb),
  quit: () => { app.isQuitting = true; app.quit(); },
  confirm: async ({ message, detail, signal }) => {
    const r = await dialog.showMessageBox({ type: 'warning', title: 'KDM', message, detail, buttons: ['Cancel', 'Do it now'], defaultId: 0, cancelId: 0, noLink: true, signal });
    return r.response === 1;
  },
  log: (m) => diag(m),
});
ipcMain.handle('kdm:after-all', async (_e, mode) => power.trigger(typeof mode === 'string' ? mode : 'none'));
ipcMain.handle('kdm:pause', async (_e, id) => { if (isId(id)) (await getEngine()).pause(id); return true; });
ipcMain.handle('kdm:cancel', async (_e, id, loc) => { if (isId(id)) await (await getEngine()).cancel(id, loc); return true; });
ipcMain.handle('kdm:set-speed-limit', async (_e, id, bps) => { if (isId(id)) (await getEngine()).setSpeedLimit(id, bps); return true; });
ipcMain.handle('kdm:set-queue-limit', async (_e, id, bps) => { (await getEngine()).setQueueLimit(id, bps); return true; });
ipcMain.handle('kdm:set-global-limit', async (_e, bps) => { (await getEngine()).setGlobalLimit(bps); return true; });

// Free/total space of the disk that holds `target` (walks up to the nearest existing folder).
ipcMain.handle('kelmo:disk-info', async (_e, target) => {
  try {
    let dir = typeof target === 'string' && target ? target : os.homedir();
    dir = dir === '~' || dir.startsWith('~/') ? path.join(os.homedir(), dir.slice(1)) : dir;
    while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    const st = await fs.promises.statfs(dir);
    return { total: st.blocks * st.bsize, free: st.bavail * st.bsize };
  } catch {
    return null;
  }
});

ipcMain.handle('kelmo:platform', () => ({
  platform: process.platform,
  version: app.getVersion(),
}));

// "Open with KDM" on a .torrent file, or a magnet: link handed over by the system / a browser.
function linkFromArg(arg) {
  if (typeof arg !== 'string') return null;
  if (/^magnet:\?xt=urn:bt/i.test(arg)) return arg;
  if (/\.torrent$/i.test(arg) && !arg.startsWith('-')) {
    try {
      const file = arg.startsWith('file://') ? require('node:url').fileURLToPath(arg) : path.resolve(arg);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return require('node:url').pathToFileURL(file).href;
    } catch { /* not a usable path */ }
  }
  return null;
}
function openFromArgs(argv) {
  const links = (argv || []).map(linkFromArg).filter(Boolean);
  if (!links.length || !popups) return links.length > 0;
  for (const url of links.slice(0, 5)) popups.openAdd({ url });
  return true;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => { if (!openFromArgs(argv)) showMain(); });
  app.on('open-url', (ev, url) => { ev.preventDefault(); openFromArgs([url]); });

  installContextMenu(app, Menu); // must be registered before any window exists
  // A dropped file or link must never turn a KDM window into a web page.
  app.on('web-contents-created', (_e, contents) => contents.on('will-navigate', (ev) => ev.preventDefault()));

  app.whenReady().then(() => {
    popups = createPopups({
      seal: (pw) => secrets.seal(pw),
      BrowserWindow, ipcMain, shell, dialog,
      getMain: () => mainWindow, ensureMain, showMain, screen, onBusy: setBusy, preload: path.join(__dirname, 'preload.cjs'), isDev,
      indexHtml: path.join(__dirname, '..', 'dist', 'index.html'), icon: iconPath,
    });
    createTray();
    createWindow(!process.argv.includes('--hidden'));
    startBridge();
    openFromArgs(process.argv.slice(1));
    // Copying a link to a file opens the File Info window (off unless the person turns it on).
    createClipboardWatcher({
      read: () => clipboard.readText(),
      enabled: () => !!popups.getConfig()?.watchClipboard,
      onLink: (url) => { if (!popups.hasUrl(url)) popups.openAdd({ url }); },
    }).start();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.on('window-all-closed', () => {
    // with the tray icon KDM keeps running (and downloading) after every window is closed
    if (process.platform !== 'darwin' && (!tray || !minimizeToTray)) app.quit();
  });
}
