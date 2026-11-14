// Drives electron/popups.cjs with a fake Electron: windows, IPC relay, validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createPopups } = createRequire(import.meta.url)('../popups.cjs');

function fakeElectron() {
  let nextId = 100;
  const handlers = new Map();
  const listeners = new Map();
  const windows = [];
  class BrowserWindow {
    constructor(opts) {
      this.opts = opts; this.destroyed = false; this.sent = []; this.events = {}; this.loaded = null;
      this.webContents = {
        id: nextId++, send: (ch, msg) => this.sent.push([ch, msg]), on() {}, setWindowOpenHandler() {},
      };
      windows.push(this);
    }
    once(ev, cb) { this.events[ev] = cb; }
    on(ev, cb) { this.events[ev] = cb; }
    setMenuBarVisibility() {}
    loadURL(u) { this.loaded = u; }
    loadFile(f, o) { this.loaded = { f, o }; }
    show() { this.shown = true; this.visible = true; } hide() { this.visible = false; } isVisible() { return !!this.visible; }
    getSize() { return [this.size?.[0] ?? 380, this.size?.[1] ?? 560]; } getPosition() { return this.pos ?? [0, 0]; } setPosition(x, y) { this.pos = [x, y]; }
    focus() {} moveTop() {} setAlwaysOnTop() {} restore() {} isMinimized() { return false; }
    isDestroyed() { return this.destroyed; }
    getContentSize() { return [this.size?.[0] ?? 640, this.size?.[1] ?? 660]; }
    setContentSize(w, h) { this.size = [w, h]; }
    close() { this.destroyed = true; this.events.closed?.(); }
    static fromWebContents() { return null; }
  }
  const ipcMain = {
    handle: (ch, fn) => handlers.set(ch, fn),
    on: (ch, fn) => listeners.set(ch, fn),
  };
  return { BrowserWindow, ipcMain, handlers, listeners, windows };
}

function setup(extra = {}) {
  const el = fakeElectron();
  const main = new el.BrowserWindow({});
  main.webContents.id = 1;
  const toMain = [];
  const mainWc = { id: 1, send: (ch, msg) => toMain.push([ch, msg]) };
  const popups = createPopups({
    BrowserWindow: el.BrowserWindow, ipcMain: el.ipcMain, shell: {}, dialog: {},
    getMain: () => ({ isDestroyed: () => false, webContents: mainWc }),
    ensureMain: (cb) => cb(mainWc), ...extra, preload: 'p', isDev: false, indexHtml: '/x/index.html', icon: undefined,
  });
  const call = (ch, sender, ...a) => el.handlers.get(ch)({ sender: { id: sender } }, ...a);
  const fromMain = (ch, msg) => el.listeners.get(ch)({ sender: { id: 1 } }, msg);
  return { el, popups, toMain, call, fromMain };
}

test('browser link opens a small always-on-top "Download File Info" window, not the main window', () => {
  const t = setup();
  const before = t.el.windows.length;
  t.popups.openAdd({ url: 'https://a.example/f.zip', cookie: 'sid=1' });
  const w = t.el.windows[before];
  assert.equal(w.opts.alwaysOnTop, true);
  assert.deepEqual(w.loaded, { f: '/x/index.html', o: { hash: '/popup/add' } });
  assert.equal(t.toMain.length, 0);
});

test('the same link twice reuses the open window', () => {
  const t = setup();
  const n = t.el.windows.length;
  t.popups.openAdd({ url: 'https://a.example/f.zip' });
  t.popups.openAdd({ url: 'https://a.example/f.zip' });
  assert.equal(t.el.windows.length, n + 1);
});

test('popup:init hands the window its own link; unknown senders are refused', async () => {
  const t = setup();
  const n = t.el.windows.length;
  t.popups.openAdd({ url: 'https://a.example/f.zip' });
  const id = t.el.windows[n].webContents.id;
  const init = await t.call('popup:init', id);
  assert.equal(init.kind, 'add');
  assert.equal(init.payload.url, 'https://a.example/f.zip');
  assert.throws(() => t.call('popup:init', 9999), /Not a KDM popup/);
});

test('Start Download is relayed to the main window (cleaned) and the popup closes', () => {
  const t = setup();
  const n = t.el.windows.length;
  t.popups.openAdd({ url: 'https://a.example/f.zip' });
  const w = t.el.windows[n];
  t.call('popup:confirm', w.webContents.id, { url: 'https://a.example/f.zip', fileName: 'f.zip', dir: '~/Downloads/KDM/Compressed', category: 'Compressed', startNow: true, cookie: 'sid=1', evil: 'x' });
  assert.equal(t.toMain.length, 1);
  assert.equal(t.toMain[0][0], 'kdm:popup-add');
  assert.equal(t.toMain[0][1].evil, undefined);
  assert.equal(t.toMain[0][1].startNow, true);
  assert.equal(w.destroyed, true);
});

test('bad requests are rejected', () => {
  const t = setup();
  const n = t.el.windows.length;
  t.popups.openAdd({ url: 'https://a.example/f.zip' });
  const id = t.el.windows[n].webContents.id;
  assert.throws(() => t.call('popup:confirm', id, { url: 'file:///etc/passwd', dir: '/tmp', category: 'General' }), /Invalid/);
  assert.throws(() => t.call('popup:action', id, { id: 'd1', action: 'rm -rf' }), /Invalid/);
  assert.throws(() => t.call('popup:pref', id, { key: 'userName', value: true }), /Invalid/);
  assert.throws(() => t.call('popup:remember-folder', id, { category: 'Video', folder: 'a\u0000b' }), /Invalid/);
  assert.equal(t.toMain.length, 0);
});

test('progress window opens after the main window reports the new item, receives updates, closes at completion and the done window opens', () => {
  const t = setup();
  const n = t.el.windows.length;
  t.fromMain('kdm:publish', { items: [{ id: 'd1', fileName: 'a.zip', destination: '~/x', status: 'downloading' }], config: { categories: [] } });
  t.fromMain('kdm:popup-added', { id: 'd1', show: true });
  const prog = t.el.windows[n];
  assert.deepEqual(prog.loaded, { f: '/x/index.html', o: { hash: '/popup/progress' } });
  t.fromMain('kdm:publish', { items: [{ id: 'd1', fileName: 'a.zip', destination: '~/x', status: 'downloading', downloadedBytes: 5 }] });
  assert.equal(prog.sent.at(-1)[0], 'kdm:items');
  assert.equal(prog.sent.at(-1)[1][0].downloadedBytes, 5);
  t.fromMain('kdm:item-done', { id: 'd1', showDialog: true });
  assert.equal(prog.destroyed, true);
  const done = t.el.windows[n + 1];
  assert.deepEqual(done.loaded, { f: '/x/index.html', o: { hash: '/popup/done' } });
});

test('item-done without the dialog just closes the progress window', () => {
  const t = setup();
  const n = t.el.windows.length;
  t.fromMain('kdm:popup-added', { id: 'd2', show: true });
  t.fromMain('kdm:item-done', { id: 'd2', showDialog: false });
  assert.equal(t.el.windows.length, n + 1);
  assert.equal(t.el.windows[n].destroyed, true);
});

test('messages from anything but the main window are ignored', () => {
  const t = setup();
  const n = t.el.windows.length;
  t.el.listeners.get('kdm:popup-added')({ sender: { id: 555 } }, { id: 'x', show: true });
  assert.equal(t.el.windows.length, n);
});

test('pause / cancel / limit from a progress window reach the main window', () => {
  const t = setup();
  const n = t.el.windows.length;
  t.fromMain('kdm:popup-added', { id: 'd3', show: true });
  const id = t.el.windows[n].webContents.id;
  t.call('popup:action', id, { id: 'd3', action: 'limit', value: 1048576 });
  assert.deepEqual(t.toMain.at(-1), ['kdm:popup-action', { id: 'd3', action: 'limit', value: 1048576 }]);
});

test('the busy flag from the main window reaches the main process (used to free memory when idle)', () => {
  const seen = [];
  const { fromMain } = setup({ onBusy: (b) => seen.push(b) });
  fromMain('kdm:publish', { items: [], busy: true });
  fromMain('kdm:publish', { items: [], busy: false });
  fromMain('kdm:publish', { items: [] }); // no flag: ignored
  fromMain('kdm:publish', { items: [], busy: 'yes' }); // not a boolean: ignored
  assert.deepEqual(seen, [true, false]);
});

test('connection detail goes only to the matching progress window; resize is limited to progress windows and sane heights', async () => {
  const { el, popups, fromMain, call } = setup();
  fromMain('kdm:popup-added', { id: 'd1', show: true });
  fromMain('kdm:popup-added', { id: 'd2', show: true });
  const [w1, w2] = el.windows.slice(-2);
  popups.sendDetail('d1', { segments: [[0, 5, 9]], workers: [] });
  assert.equal(w1.sent.filter(([c]) => c === 'kdm:detail').length, 1);
  assert.equal(w2.sent.filter(([c]) => c === 'kdm:detail').length, 0);
  popups.sendDetail('nope', {}); // no window: nothing happens
  assert.equal(await call('popup:resize', w1.webContents.id, { height: 330 }), true);
  assert.deepEqual(w1.size, [640, 330]);
  assert.equal(await call('popup:resize', w1.webContents.id, { height: 5 }), false);
  assert.equal(await call('popup:resize', w1.webContents.id, { height: 'tall' }), false);
  popups.openAdd({ url: 'https://x.example/a.zip' });
  const add = el.windows.at(-1);
  assert.equal(await call('popup:resize', add.webContents.id, { height: 540 }), true, 'File Info grows when the mirrors box opens');
  const done = (() => { fromMain('kdm:item-done', { id: 'd1', showDialog: true }); return el.windows.at(-1); })();
  assert.equal(await call('popup:resize', done.webContents.id, { height: 400 }), false, 'the Download complete window never resizes');
});

test('floating drop target: appears with the setting, takes links, and only it may do so', async () => {
  let shown = 0;
  const t = setup({ showMain: () => shown++ });
  const n = t.el.windows.length;
  t.fromMain('kdm:publish', { config: { categories: [], dropTarget: true } });
  assert.equal(t.el.windows.length, n + 1);
  const drop = t.el.windows.at(-1);
  assert.equal(drop.opts.frame, false);
  assert.equal(drop.opts.alwaysOnTop, true);
  assert.equal(drop.opts.skipTaskbar, true);
  assert.deepEqual(drop.loaded, { f: '/x/index.html', o: { hash: '/popup/drop' } });
  t.fromMain('kdm:publish', { config: { categories: [], dropTarget: true } }); // same setting again: no second window
  assert.equal(t.el.windows.length, n + 1);

  // one link → the File Info window
  assert.equal(await t.call('popup:drop-links', drop.webContents.id, ['https://a.example/x.iso', 'javascript:1']), 1);
  const add = t.el.windows.at(-1);
  assert.deepEqual(add.loaded.o, { hash: '/popup/add' });
  // several links → the main window opens in many-links mode
  const sent = t.toMain.length;
  assert.equal(await t.call('popup:drop-links', drop.webContents.id, ['https://a.example/1.zip', 'https://a.example/2.zip']), 2);
  assert.equal(shown, 1);
  assert.deepEqual(t.toMain.slice(sent).map(([c]) => c), ['kdm:popup-batch']);
  // other popups may not use the drop endpoints
  await assert.rejects(async () => t.call('popup:drop-links', add.webContents.id, ['https://a.example/x.zip']));
  // the setting off closes the target
  t.fromMain('kdm:publish', { config: { categories: [], dropTarget: false } });
  assert.equal(drop.destroyed, true);
});

test('a login typed in File Info: the password is sealed in the main process and never relayed in plain text', () => {
  const t = setup({ seal: (pw) => `sealed(${pw.length})` });
  const n = t.el.windows.length;
  t.popups.openAdd({ url: 'https://a.example/private.zip' });
  const w = t.el.windows[n];
  t.call('popup:confirm', w.webContents.id, { url: 'https://a.example/private.zip', fileName: 'p.zip', dir: '/tmp', category: 'Compressed', startNow: true, authUser: ' alice ', authPassword: 'hunter2' });
  const sent = t.toMain[0][1];
  assert.equal(sent.authUser, 'alice');
  assert.equal(sent.authSecret, 'sealed(7)');
  assert.equal(JSON.stringify(sent).includes('hunter2'), false);
  assert.equal(sent.authPassword, undefined);
});

test('without a user name (or without a sealing service) no login is relayed', () => {
  for (const extra of [{ seal: (p) => `s${p}` }, {}]) {
    const t = setup(extra);
    const n = t.el.windows.length;
    t.popups.openAdd({ url: 'https://a.example/f.zip' });
    const w = t.el.windows[n];
    t.call('popup:confirm', w.webContents.id, { url: 'https://a.example/f.zip', fileName: 'f.zip', dir: '/tmp', category: 'General', startNow: true, authUser: extra.seal ? '' : 'bob', authPassword: 'x' });
    assert.equal(t.toMain[0][1].authUser, undefined);
    assert.equal(t.toMain[0][1].authSecret, undefined);
  }
});

const screenAt = (area) => ({ getDisplayNearestPoint: () => ({ workArea: area }), getCursorScreenPoint: () => ({ x: 900, y: 750 }) });

test('Quick Monitor: left click opens a frameless window above a bottom tray icon, a second click hides it', () => {
  const t = setup({ screen: screenAt({ x: 0, y: 0, width: 1366, height: 728 }) });
  const before = t.el.windows.length;
  t.popups.toggleTray({ x: 1200, y: 740, width: 24, height: 28 });
  const w = t.el.windows[before];
  t.el.windows[before].events['ready-to-show']();
  assert.equal(w.opts.frame, false);
  assert.equal(w.opts.skipTaskbar, true);
  assert.deepEqual(w.loaded, { f: '/x/index.html', o: { hash: '/popup/tray' } });
  assert.equal(w.visible, true);
  assert.ok(w.pos[1] + 560 <= 728, 'stays inside the work area, above the panel');
  assert.ok(w.pos[0] + 380 <= 1366 - 8, 'stays inside on the right');
  t.popups.toggleTray(null);
  assert.equal(w.visible, false);
  t.popups.toggleTray(null); // the same window comes back, no second one
  assert.equal(t.el.windows.length, before + 1);
  assert.equal(w.visible, true);
});

test('Quick Monitor: it grows with its content while keeping its bottom edge at the tray', () => {
  const t = setup({ screen: screenAt({ x: 0, y: 0, width: 1366, height: 728 }) });
  const before = t.el.windows.length;
  t.popups.toggleTray({ x: 1200, y: 740, width: 24, height: 28 });
  const w = t.el.windows[before];
  w.events['ready-to-show']();
  const bottom = w.pos[1] + 560;
  w.size = [380, 560];
  t.call('popup:resize', w.webContents.id, { height: 400 });
  assert.equal(w.size[1], 400);
  assert.equal(w.pos[1] + w.getSize()[1], bottom);
});

test('Quick Monitor: only its own menu actions work, and only from that window', async () => {
  const opened = [];
  let shown = 0;
  const t = setup({ screen: screenAt({ x: 0, y: 0, width: 1366, height: 728 }), shell: { openPath: async (p) => { opened.push(p); return ''; } }, showMain: () => { shown++; } });
  const before = t.el.windows.length;
  t.popups.toggleTray(null);
  const w = t.el.windows[before];
  const id = w.webContents.id;
  await t.call('popup:tray-do', id, 'addUrl');
  assert.equal(shown, 1);
  assert.deepEqual(t.toMain.at(-1), ['kdm:popup-nav', { to: 'addUrl' }]);
  await t.call('popup:tray-do', id, 'settings');
  assert.deepEqual(t.toMain.at(-1), ['kdm:popup-nav', { to: 'settings' }]);
  await t.call('popup:tray-do', id, 'folder');
  assert.equal(opened.length, 1);
  await assert.rejects(async () => t.call('popup:tray-do', id, 'rm -rf'), /Unknown/);
  // another kind of window cannot use it
  t.popups.openAdd({ url: 'https://a.example/x.zip' });
  const add = t.el.windows.at(-1);
  await assert.rejects(async () => t.call('popup:tray-do', add.webContents.id, 'openMain'), /Not the Quick Monitor/);
});

test('Quick Monitor: on Linux it opens in the corner next to the panel, wherever the pointer is', () => {
  if (process.platform !== 'linux') return;
  const mk = (workArea, bounds) => ({ getDisplayNearestPoint: () => ({ workArea, bounds }), getCursorScreenPoint: () => ({ x: 875, y: 535 }) });
  // panel at the bottom: bottom-right corner
  let t = setup({ screen: mk({ x: 0, y: 0, width: 1366, height: 728 }, { x: 0, y: 0, width: 1366, height: 768 }) });
  let before = t.el.windows.length;
  t.popups.toggleTray({ x: 10, y: 0, width: 22, height: 22 });
  let w = t.el.windows[before];
  w.events['ready-to-show']();
  assert.equal(w.pos[0], 1366 - 380 - 8);
  assert.equal(w.pos[1], 728 - 560 - 8);
  // panel at the top: top-right corner
  t = setup({ screen: mk({ x: 0, y: 40, width: 1366, height: 728 }, { x: 0, y: 0, width: 1366, height: 768 }) });
  before = t.el.windows.length;
  t.popups.toggleTray(null);
  w = t.el.windows[before];
  w.events['ready-to-show']();
  assert.equal(w.pos[1], 48);
});

test('Quick Monitor: a pasted link opens the Download File Info window; anything else is refused', async () => {
  const t = setup({ screen: screenAt({ x: 0, y: 0, width: 1366, height: 728 }) });
  const before = t.el.windows.length;
  t.popups.toggleTray(null);
  const tray = t.el.windows[before];
  await t.call('popup:tray-add', tray.webContents.id, 'https://a.example/f.zip');
  const add = t.el.windows.at(-1);
  assert.deepEqual(add.loaded, { f: '/x/index.html', o: { hash: '/popup/add' } });
  assert.equal(tray.visible, false);
  await assert.rejects(async () => t.call('popup:tray-add', tray.webContents.id, 'javascript:alert(1)'), /Not a link/);
  await assert.rejects(async () => t.call('popup:tray-add', tray.webContents.id, 'file:///etc/passwd'), /Not a link/);
  await assert.rejects(async () => t.call('popup:tray-add', add.webContents.id, 'https://a.example/x'), /Not the Quick Monitor/);
});
