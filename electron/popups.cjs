/* KDM — IDM-style small windows: "Download File Info", progress, "Download complete".
 *
 * The download manager itself lives in the main window's renderer (hidden while KDM sits in the
 * tray). These windows are thin views: the main renderer publishes a compact snapshot of the
 * relevant downloads, and every user action is relayed back to it. Nothing here touches files except
 * creating category folders and opening a finished file / its folder.
 */
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { resolveOpenTarget } = require('./open-target.cjs');

const ACTIONS = new Set(['pause', 'resume', 'cancel', 'limit', 'after', 'afterAll']);
const PREFS = new Set(['showCompleteDialog', 'showProgressWindow', 'dropTarget']);
const isStr = (v, max = 4096) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isId = (v) => isStr(v, 100);

function expandHome(p) {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

/** Folder names may only be plain paths: no control characters. */
function safeFolder(p) {
  return isStr(p, 1024) && !/[\x00-\x1f]/.test(p);
}

function createPopups({ seal, BrowserWindow, ipcMain, shell, dialog, getMain, ensureMain, showMain, screen, onBusy, preload, isDev, indexHtml, icon }) {
  /** webContents.id -> { kind, win, payload, key } */
  const wins = new Map();
  /** itemId -> compact item, as last published by the main renderer */
  let items = new Map();
  let config = null;

  const sizes = {
    add: { width: 600, height: 480, onTop: true, title: 'KDM — Download File Info' },
    progress: { width: 700, height: 244, onTop: false, title: 'KDM — Downloading' },
    done: { width: 700, height: 214, onTop: true, title: 'KDM — Download complete' },
    drop: { width: 96, height: 96, onTop: true, title: 'KDM drop target' },
    tray: { width: 380, height: 560, onTop: true, title: 'KELMO Quick Monitor' },
  };

  function load(win, kind) {
    const hash = `/popup/${kind}`;
    if (isDev) win.loadURL(`http://127.0.0.1:5173/#${hash}`);
    else win.loadFile(indexHtml, { hash });
  }

  function findByKey(kind, key) {
    for (const w of wins.values()) if (w.kind === kind && w.key === key && !w.win.isDestroyed()) return w;
    return null;
  }

  function open(kind, key, payload) {
    const existing = findByKey(kind, key);
    if (existing) {
      if (existing.win.isMinimized()) existing.win.restore();
      existing.win.show();
      existing.win.moveTop();
      existing.win.focus();
      return existing.win;
    }
    const s = sizes[kind];
    const win = new BrowserWindow({
      width: s.width,
      height: s.height,
      useContentSize: true,
      resizable: false,
      maximizable: false,
      minimizable: true,
      alwaysOnTop: s.onTop,
      autoHideMenuBar: true,
      show: false,
      backgroundColor: '#0a0807',
      title: s.title,
      icon,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const id = win.webContents.id;
    wins.set(id, { kind, key, win, payload });
    win.setMenuBarVisibility(false);
    // Some Linux window managers (Cinnamon, GNOME) keep a new window behind the browser you are using.
    // Raise it explicitly, and show it anyway if the page is slow to report ready.
    let shown = false;
    const raise = () => {
      if (shown || win.isDestroyed()) return;
      shown = true;
      win.show();
      if (s.onTop) win.setAlwaysOnTop(true, 'screen-saver');
      win.moveTop();
      win.focus();
    };
    win.once('ready-to-show', raise);
    setTimeout(raise, 1500);
    win.on('closed', () => wins.delete(id));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    load(win, kind);
    return win;
  }

  /** IDM-style floating target: drag links from the browser onto it. Tray and taskbar icons cannot receive drops. */
  function openDrop() {
    const existing = findByKey('drop', 'drop');
    if (existing) return existing.win;
    const s = sizes.drop;
    const win = new BrowserWindow({
      width: s.width, height: s.height, useContentSize: true,
      frame: false, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: true,
      autoHideMenuBar: true, show: false, backgroundColor: '#0a0807', title: s.title, icon,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const id = win.webContents.id;
    wins.set(id, { kind: 'drop', key: 'drop', win, payload: null });
    try {
      const area = screen?.getPrimaryDisplay?.().workArea;
      if (area) win.setPosition(area.x + area.width - s.width - 24, area.y + area.height - s.height - 24);
    } catch { /* the system picks a position */ }
    win.once('ready-to-show', () => (win.showInactive ? win.showInactive() : win.show()));
    win.on('closed', () => wins.delete(id));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    load(win, 'drop');
    return win;
  }

  /** Quick Monitor: a small frameless window next to the tray icon (left click). Hides when it loses focus. */
  function toggleTray(bounds) {
    const existing = findByKey('tray', 'tray');
    if (existing && existing.win.isVisible()) {
      existing.win.hide();
      return;
    }
    let anchor = null;
    try {
      // Linux tray hosts (Cinnamon, KDE, GNOME) report bogus icon bounds: the click happened at the icon, so use the pointer
      if (process.platform !== 'linux' && bounds && bounds.width > 0 && bounds.height > 0) anchor = { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) };
      if (!anchor && screen?.getCursorScreenPoint) anchor = screen.getCursorScreenPoint();
    } catch { /* placed by the system */ }
    const place = (win, info) => {
      try {
        const disp = screen.getDisplayNearestPoint(anchor);
        const wa = disp.workArea;
        const full = disp.bounds || wa;
        const [w, h] = win.getSize();
        let x;
        let y;
        let above;
        if (process.platform === 'linux') {
          // The tray host does not tell us where its icon is, and the pointer is not reliable either. Trays sit at the
          // end of the panel, so open in the corner of the work area next to the panel (the usual bottom-right).
          const panelTop = wa.y > full.y + 2;
          const panelLeft = wa.x > full.x + 2;
          const panelRight = wa.x + wa.width < full.x + full.width - 2;
          above = !panelTop;
          y = panelTop ? wa.y + 8 : wa.y + wa.height - h - 8;
          x = panelLeft ? wa.x + 8 : wa.x + wa.width - w - 8;
          if (panelRight) x = wa.x + wa.width - w - 8;
        } else {
          above = anchor.y > wa.y + wa.height / 2; // panel at the bottom → open upwards
          x = Math.round(anchor.x - w / 2);
          y = above ? anchor.y - h - 12 : anchor.y + 16;
        }
        x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - w - 8));
        y = Math.max(wa.y + 8, Math.min(y, wa.y + wa.height - h - 8));
        info.above = above;
        info.bottom = y + h;
        win.setPosition(x, y);
      } catch { /* placed by the system */ }
    };
    const showIt = (win, info) => {
      if (anchor) place(win, info);
      info.shownAt = Date.now();
      win.show();
      win.setAlwaysOnTop(true, 'screen-saver');
      win.focus();
    };
    if (existing) return showIt(existing.win, existing);
    const s = sizes.tray;
    const win = new BrowserWindow({
      width: s.width, height: s.height, useContentSize: true,
      frame: false, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: true,
      autoHideMenuBar: true, show: false, backgroundColor: '#14110e', title: s.title, icon,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const id = win.webContents.id;
    const info = { kind: 'tray', key: 'tray', win, payload: null, above: false, bottom: 0, shownAt: 0 };
    wins.set(id, info);
    win.once('ready-to-show', () => showIt(win, info));
    win.on('blur', () => { if (Date.now() - info.shownAt > 400 && !win.isDestroyed()) win.hide(); });
    win.on('closed', () => wins.delete(id));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    load(win, 'tray');
  }

  /** The floating target follows the setting. */
  function syncDrop() {
    const existing = findByKey('drop', 'drop');
    if (config?.dropTarget && !existing) openDrop();
    else if (!config?.dropTarget && existing) existing.win.close();
  }

  const popupInfo = (e) => {
    const info = wins.get(e.sender.id);
    if (!info) throw new Error('Not a KDM popup window');
    return info;
  };

  /** Send to the main renderer, creating (hidden) the main window first if it was closed. */
  function toMain(channel, msg) {
    ensureMain((wc) => wc.send(channel, msg));
  }

  function broadcastItems() {
    const list = Array.from(items.values());
    for (const w of wins.values()) if (w.kind !== 'add' && w.kind !== 'drop' && !w.win.isDestroyed()) w.win.webContents.send('kdm:items', list);
  }

  // Category folders are created as soon as the settings are known, like IDM does after install.
  function ensureFolders(cfg) {
    if (!cfg || !Array.isArray(cfg.categories)) return;
    for (const c of cfg.categories) {
      if (c && safeFolder(c.folder)) fs.promises.mkdir(expandHome(c.folder), { recursive: true }).catch(() => {});
    }
  }

  // ---------------------------------------------------------------- popup → main
  ipcMain.handle('popup:init', (e) => {
    const info = popupInfo(e);
    return { kind: info.kind, payload: info.payload ?? null, config };
  });
  ipcMain.handle('popup:snapshot', () => Array.from(items.values()));
  // IDM's "Hide details": the progress window shrinks to the summary and grows back
  ipcMain.handle('popup:resize', (e, msg) => {
    const info = popupInfo(e);
    const h = msg && Number(msg.height);
    if ((info.kind !== 'progress' && info.kind !== 'add' && info.kind !== 'tray') || !Number.isFinite(h) || h < 200 || h > 1000) return false;
    const [w] = info.win.getContentSize();
    info.win.setContentSize(w, Math.round(h));
    if (info.kind === 'tray' && info.above && info.bottom) {
      const [x] = info.win.getPosition();
      info.win.setPosition(x, info.bottom - info.win.getSize()[1]); // keep the bottom edge next to the tray icon
    }
    return true;
  });
  ipcMain.handle('popup:drop-links', (e, links) => {
    if (popupInfo(e).kind !== 'drop') throw new Error('Not the drop target');
    const urls = (Array.isArray(links) ? links : []).filter((u) => typeof u === 'string' && u.length < 4096 && (/^https?:\/\//i.test(u) || /^magnet:\?xt=urn:bt/i.test(u))).slice(0, 200);
    if (urls.length === 1) open('add', urls[0], { url: urls[0] });
    else if (urls.length > 1) {
      showMain?.();
      toMain('kdm:popup-batch', urls);
    }
    return urls.length;
  });
  ipcMain.handle('popup:open-main', (e) => {
    if (popupInfo(e).kind !== 'drop') throw new Error('Not the drop target');
    showMain?.();
    return true;
  });
  // Quick Monitor menu: only these few things, nothing else is reachable from there
  ipcMain.handle('popup:tray-do', async (e, what) => {
    const info = popupInfo(e);
    if (info.kind !== 'tray') throw new Error('Not the Quick Monitor');
    if (what === 'openMain') showMain?.();
    else if (what === 'addUrl') { showMain?.(); toMain('kdm:popup-nav', { to: 'addUrl' }); }
    else if (what === 'queue') { showMain?.(); toMain('kdm:popup-nav', { to: 'queue' }); }
    else if (what === 'settings') { showMain?.(); toMain('kdm:popup-nav', { to: 'settings' }); }
    else if (what === 'folder') {
      const cat = config?.categories?.[0]?.folder;
      const dir = cat ? path.dirname(expandHome(cat)) : path.join(os.homedir(), 'Downloads');
      await shell.openPath(dir);
    } else throw new Error('Unknown action');
    info.win.hide();
    return true;
  });
  // a link pasted into the Quick Monitor → the small "Download File Info" window (the main window stays closed)
  ipcMain.handle('popup:tray-add', (e, url) => {
    const info = popupInfo(e);
    if (info.kind !== 'tray') throw new Error('Not the Quick Monitor');
    const u = typeof url === 'string' ? url.trim() : '';
    if (u.length > 4096 || !(/^https?:\/\/\S+$/i.test(u) || /^magnet:\?xt=urn:bt/i.test(u))) throw new Error('Not a link');
    open('add', u, { url: u });
    info.win.hide();
    return true;
  });
  ipcMain.handle('popup:close', (e) => {
    popupInfo(e).win.close();
    return true;
  });
  ipcMain.handle('popup:confirm', (e, spec) => {
    const info = popupInfo(e);
    if (info.kind !== 'add' || !spec || !(/^https?:\/\//i.test(spec.url || '') || /^magnet:\?/i.test(spec.url || '') || /^file:\/\/\/[^?#]+\.torrent$/i.test(spec.url || '')) || !isStr(spec.dir, 1024) || !isStr(spec.category, 40)) {
      throw new Error('Invalid download request');
    }
    const clean = {
      url: spec.url.slice(0, 4096),
      fileName: typeof spec.fileName === 'string' ? spec.fileName.slice(0, 200) : '',
      dir: spec.dir,
      category: spec.category,
      startNow: !!spec.startNow,
      replaceId: isId(spec.replaceId) ? spec.replaceId : undefined,
      referrer: typeof spec.referrer === 'string' ? spec.referrer.slice(0, 2048) : undefined,
      cookie: typeof spec.cookie === 'string' ? spec.cookie.slice(0, 16384) : undefined,
      userAgent: typeof spec.userAgent === 'string' ? spec.userAgent.slice(0, 512) : undefined,
      mirrors: Array.isArray(spec.mirrors) ? spec.mirrors.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 4096).slice(0, 8) : undefined,
    };
    if (spec.video && typeof spec.video === 'object' && /^(best|audio|\d{3,4})$/.test(String(spec.video.choice))) {
      clean.video = { choice: String(spec.video.choice), size: Number.isFinite(+spec.video.size) && +spec.video.size > 0 ? Math.round(+spec.video.size) : undefined, useLogin: spec.video.useLogin === true ? true : undefined };
    }
    // a login typed in this window: the password is sealed here and never travels on in plain text
    if (typeof spec.authUser === 'string' && spec.authUser.trim() && typeof spec.authPassword === 'string' && typeof seal === 'function') {
      clean.authUser = spec.authUser.trim().slice(0, 256);
      clean.authSecret = seal(spec.authPassword.slice(0, 512));
    }
    toMain('kdm:popup-add', clean);
    info.win.close();
    return true;
  });
  ipcMain.handle('popup:action', (e, msg) => {
    popupInfo(e);
    if (!msg || !isId(msg.id) || !ACTIONS.has(msg.action)) throw new Error('Invalid action');
    toMain('kdm:popup-action', { id: msg.id, action: msg.action, value: msg.value });
    return true;
  });
  ipcMain.handle('popup:pref', (e, msg) => {
    popupInfo(e);
    if (!msg || !PREFS.has(msg.key)) throw new Error('Invalid setting');
    toMain('kdm:popup-pref', { key: msg.key, value: !!msg.value });
    return true;
  });
  ipcMain.handle('popup:remember-folder', (e, msg) => {
    popupInfo(e);
    if (!msg || !isStr(msg.category, 40) || !safeFolder(msg.folder)) throw new Error('Invalid folder');
    toMain('kdm:popup-folder', { category: msg.category, folder: msg.folder });
    return true;
  });
  ipcMain.handle('popup:open', async (e, msg) => {
    popupInfo(e);
    const it = msg && items.get(msg.id);
    if (!it || !['file', 'folder'].includes(msg.what)) return { ok: false };
    const file = path.join(expandHome(it.destination), it.fileName);
    if (msg.what === 'folder') {
      if (fs.existsSync(file)) shell.showItemInFolder(file);
      else await shell.openPath(expandHome(it.destination));
      return { ok: true };
    }
    const err = await shell.openPath(resolveOpenTarget(file));
    return err ? { ok: false, error: err } : { ok: true };
  });
  ipcMain.handle('popup:pick-folder', async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(parent, { properties: ['openDirectory', 'createDirectory'] });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('popup:pick-torrent', async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(parent, { properties: ['openFile'], filters: [{ name: 'Torrent files', extensions: ['torrent'] }] });
    return res.canceled ? null : require('node:url').pathToFileURL(res.filePaths[0]).href;
  });

  // ---------------------------------------------------------------- main renderer → here
  const fromMain = (e) => {
    const m = getMain();
    return !!m && !m.isDestroyed() && e.sender.id === m.webContents.id;
  };
  ipcMain.on('kdm:publish', (e, msg) => {
    if (!fromMain(e) || !msg || typeof msg !== 'object') return;
    if (Array.isArray(msg.items)) {
      items = new Map(msg.items.filter((i) => i && isId(i.id)).map((i) => [i.id, i]));
      broadcastItems();
    }
    if (typeof msg.busy === 'boolean') onBusy?.(msg.busy);
    if (msg.config && typeof msg.config === 'object') {
      const changed = JSON.stringify(msg.config) !== JSON.stringify(config);
      config = msg.config;
      if (changed) ensureFolders(config);
      syncDrop();
    }
  });
  ipcMain.on('kdm:popup-added', (e, msg) => {
    if (!fromMain(e) || !msg || !isId(msg.id) || !msg.show) return;
    open('progress', msg.id, { id: msg.id });
  });
  ipcMain.on('kdm:item-done', (e, msg) => {
    if (!fromMain(e) || !msg || !isId(msg.id)) return;
    const p = findByKey('progress', msg.id);
    if (p) p.win.close();
    if (msg.showDialog) open('done', msg.id, { id: msg.id });
  });

  return {
    /** Per-connection detail of a running download → its progress window (if one is open). */
    sendDetail(id, detail) {
      const w = findByKey('progress', id);
      if (w) w.win.webContents.send('kdm:detail', { id, detail });
    },
    /** A link arrived from the browser: show the "Download File Info" window (the main window stays put). */
    toggleTray,
    openAdd(req) {
      open('add', req.url, req);
    },
    /** Last settings the app published (null until the main window has run once). */
    getConfig: () => config,
    /** Is this exact link already in the download list? */
    hasUrl: (url) => [...items.values()].some((i) => i.url === url),
    closeAll() {
      for (const w of wins.values()) if (!w.win.isDestroyed()) w.win.close();
    },
    // exposed for tests
    _internals: { expandHome, safeFolder },
  };
}

module.exports = { createPopups, expandHome, safeFolder };
