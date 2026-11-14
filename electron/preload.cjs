/* KELMO — preload. Exposes a minimal, typed bridge to the renderer. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kelmo', {
  isElectron: true,
  openPath: (p) => ipcRenderer.invoke('kelmo:open-path', p),
  showInFolder: (p) => ipcRenderer.invoke('kelmo:show-in-folder', p),
  pickFolder: () => ipcRenderer.invoke('kelmo:pick-folder'),
  pickTorrent: () => ipcRenderer.invoke('kelmo:pick-torrent'),
  clipboardLink: () => ipcRenderer.invoke('kelmo:clipboard-link'),
  setAutostart: (enabled) => ipcRenderer.invoke('kelmo:set-autostart', enabled),
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('kelmo:set-tray', enabled),
  browserInfo: () => ipcRenderer.invoke('kdm:browser-info'),
  onExternalAdd: (cb) => {
    const h = (_e, req) => cb(req);
    ipcRenderer.on('kdm:external-add', h);
    return () => ipcRenderer.removeListener('kdm:external-add', h);
  },
  diskInfo: (p) => ipcRenderer.invoke('kelmo:disk-info', p),
  /** Saved logins: the password is sealed by the main process; only the sealed text comes back. */
  secret: {
    seal: (password) => ipcRenderer.invoke('kdm:seal', password),
    info: () => ipcRenderer.invoke('kdm:secret-info'),
  },
  video: {
    status: () => ipcRenderer.invoke('kdm:video-status'),
    install: () => ipcRenderer.invoke('kdm:video-install'),
    probe: (url, opts) => ipcRenderer.invoke('kdm:video-probe', url, opts),
  },
  engine: {
    start: (spec) => ipcRenderer.invoke('kdm:start', spec),
    probe: (spec) => ipcRenderer.invoke('kdm:probe', spec),
    health: (spec) => ipcRenderer.invoke('kdm:health', spec),
    configure: (cfg) => ipcRenderer.invoke('kdm:configure', cfg),
    verify: (spec) => ipcRenderer.invoke('kdm:verify', spec),
    pause: (id) => ipcRenderer.invoke('kdm:pause', id),
    cancel: (id, loc) => ipcRenderer.invoke('kdm:cancel', id, loc),
    setSpeedLimit: (id, bps) => ipcRenderer.invoke('kdm:set-speed-limit', id, bps),
    setGlobalLimit: (bps) => ipcRenderer.invoke('kdm:set-global-limit', bps),
    setQueueLimit: (id, bps) => ipcRenderer.invoke('kdm:set-queue-limit', id, bps),
    onEvent: (cb) => {
      const h = (_e, ev) => cb(ev);
      ipcRenderer.on('kdm:event', h);
      return () => ipcRenderer.removeListener('kdm:event', h);
    },
  },
  // --- the small IDM-style windows (Download File Info / progress / complete) ---
  popup: {
    init: () => ipcRenderer.invoke('popup:init'),
    snapshot: () => ipcRenderer.invoke('popup:snapshot'),
    close: () => ipcRenderer.invoke('popup:close'),
    confirm: (spec) => ipcRenderer.invoke('popup:confirm', spec),
    action: (msg) => ipcRenderer.invoke('popup:action', msg),
    pref: (msg) => ipcRenderer.invoke('popup:pref', msg),
    rememberFolder: (msg) => ipcRenderer.invoke('popup:remember-folder', msg),
    open: (msg) => ipcRenderer.invoke('popup:open', msg),
    pickFolder: () => ipcRenderer.invoke('popup:pick-folder'),
    pickTorrent: () => ipcRenderer.invoke('popup:pick-torrent'),
    resize: (msg) => ipcRenderer.invoke('popup:resize', msg),
    dropLinks: (links) => ipcRenderer.invoke('popup:drop-links', links),
    openMain: () => ipcRenderer.invoke('popup:open-main'),
    trayDo: (what) => ipcRenderer.invoke('popup:tray-do', what),
    trayAdd: (url) => ipcRenderer.invoke('popup:tray-add', url),
    onDetail: (cb) => {
      const h = (_e, msg) => cb(msg);
      ipcRenderer.on('kdm:detail', h);
      return () => ipcRenderer.removeListener('kdm:detail', h);
    },
    onItems: (cb) => {
      const h = (_e, list) => cb(list);
      ipcRenderer.on('kdm:items', h);
      return () => ipcRenderer.removeListener('kdm:items', h);
    },
  },
  // --- used only by the main window: it owns the download manager and serves the popups ---
  host: {
    publish: (msg) => ipcRenderer.send('kdm:publish', msg),
    ready: () => ipcRenderer.send('kdm:host-ready'),
    popupAdded: (msg) => ipcRenderer.send('kdm:popup-added', msg),
    itemDone: (msg) => ipcRenderer.send('kdm:item-done', msg),
    afterAll: (mode) => ipcRenderer.invoke('kdm:after-all', mode),
    on: (channel, cb) => {
      if (!['kdm:popup-add', 'kdm:popup-action', 'kdm:popup-pref', 'kdm:popup-folder', 'kdm:popup-batch'].includes(channel)) return () => {};
      const h = (_e, msg) => cb(msg);
      ipcRenderer.on(channel, h);
      return () => ipcRenderer.removeListener(channel, h);
    },
  },
  platformInfo: () => ipcRenderer.invoke('kelmo:platform'),
});
