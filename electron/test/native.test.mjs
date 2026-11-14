import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const host = require('../native-host.cjs');
const setup = require('../native-setup.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-native-'));
const TOKEN = 'a'.repeat(16) + '0123456789abcdef';

test('framing: encode then decode returns the message; partial frames wait; huge frames are refused', () => {
  const buf = host.encode({ op: 'pair' });
  assert.equal(buf.readUInt32LE(0), buf.length - 4);
  const got = host.decode(buf);
  assert.deepEqual(got.msg, { op: 'pair' });
  assert.equal(got.rest.length, 0);
  assert.equal(host.decode(buf.subarray(0, buf.length - 1)), null);
  assert.equal(host.decode(Buffer.from([1, 0])), null);
  const huge = Buffer.alloc(4); huge.writeUInt32LE(10 * 1024 * 1024, 0);
  assert.throws(() => host.decode(huge));
});

test('handle: pair returns the token; unknown requests, a missing file or a bad token do not', () => {
  const d = tmp();
  const f = path.join(d, 'browser-token');
  assert.deepEqual(host.handle({ op: 'pair' }, f), { ok: false, error: 'no-token' });
  fs.writeFileSync(f, 'not a token');
  assert.equal(host.handle({ op: 'pair' }, f).ok, false);
  fs.writeFileSync(f, TOKEN + '\n');
  assert.deepEqual(host.handle({ op: 'pair' }, f), { ok: true, token: TOKEN });
  assert.equal(host.handle({ op: 'give-me-files' }, f).ok, false);
  assert.equal(host.handle(null, f).ok, false);
});

test('the real host program answers over stdin/stdout and exits', () => {
  const d = tmp();
  const f = path.join(d, 'browser-token');
  fs.writeFileSync(f, TOKEN);
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'native-host.cjs'), f, 'chrome-extension://x/'], { input: host.encode({ op: 'pair' }), timeout: 5000 });
  assert.equal(r.status, 0);
  assert.deepEqual(host.decode(r.stdout).msg, { ok: true, token: TOKEN });
});

test('the extension ID in the native manifest is the one the extension\'s "key" produces', () => {
  const m = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'extension', 'manifest.json'), 'utf8'));
  const der = Buffer.from(m.key, 'base64');
  const id = [...crypto.createHash('sha256').update(der).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  assert.ok(setup.EXTENSION_IDS.includes(id));
  assert.ok(m.permissions.includes('nativeMessaging'));
  assert.equal(m.browser_specific_settings.gecko.id, setup.GECKO_ID);
});

test('Linux install: manifests only for browsers that exist, with the right allow-list, and a working launcher', () => {
  const home = tmp(), data = tmp();
  fs.mkdirSync(path.join(home, '.config/BraveSoftware/Brave-Browser'), { recursive: true });
  fs.mkdirSync(path.join(home, '.mozilla'), { recursive: true });
  const tokenFile = path.join(data, "it's a token");
  fs.writeFileSync(tokenFile, TOKEN);
  const res = setup.install({
    platform: 'linux', home, execPath: process.execPath, hostScript: path.join(import.meta.dirname, '..', 'native-host.cjs'), tokenFile, dataDir: path.join(data, 'native'),
  });
  assert.equal(res.written.length, 2);
  assert.ok(!fs.existsSync(path.join(home, '.config/google-chrome')));
  const brave = JSON.parse(fs.readFileSync(path.join(home, '.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/org.kelmo.kdm.json'), 'utf8'));
  assert.equal(brave.name, 'org.kelmo.kdm');
  assert.equal(brave.type, 'stdio');
  assert.equal(brave.path, res.wrapper);
  assert.deepEqual(brave.allowed_origins, setup.EXTENSION_IDS.map((i) => `chrome-extension://${i}/`));
  const ff = JSON.parse(fs.readFileSync(path.join(home, '.mozilla/native-messaging-hosts/org.kelmo.kdm.json'), 'utf8'));
  assert.deepEqual(ff.allowed_extensions, ['kdm@kelmo.dev']);
  assert.equal(ff.allowed_origins, undefined);
  // the launcher itself works (quotes in the path included), and passes the browser's extra argument through
  assert.ok(fs.statSync(res.wrapper).mode & 0o100);
  const r = spawnSync(res.wrapper, ['chrome-extension://abc/'], { input: host.encode({ op: 'pair' }), timeout: 5000 });
  assert.equal(r.status, 0);
  assert.deepEqual(host.decode(r.stdout).msg, { ok: true, token: TOKEN });
  // running it again is harmless
  assert.equal(setup.install({ platform: 'linux', home, execPath: process.execPath, hostScript: 'x', tokenFile, dataDir: path.join(data, 'native') }).written.length, 2);
});

test('Windows install: a .cmd launcher and one registry entry per browser', () => {
  const data = tmp();
  const calls = [];
  const res = setup.install({
    platform: 'win32', home: 'C:\\Users\\x', execPath: 'C:\\Program Files\\KELMO\\KELMO.exe', hostScript: 'C:\\Program Files\\KELMO\\resources\\app.asar\\electron\\native-host.cjs',
    tokenFile: 'C:\\Users\\x\\AppData\\Roaming\\KELMO\\browser-token', dataDir: data, runReg: (a) => calls.push(a),
  });
  assert.ok(res.wrapper.endsWith('.cmd'));
  const cmd = fs.readFileSync(res.wrapper, 'utf8');
  assert.match(cmd, /ELECTRON_RUN_AS_NODE=1/);
  assert.match(cmd, /"C:\\Program Files\\KELMO\\KELMO\.exe"/);
  assert.equal(calls.length, setup.WINDOWS_KEYS.length);
  assert.ok(calls.every((a) => a[0] === 'add' && a[1].endsWith('\\org.kelmo.kdm')));
  assert.ok(calls.some((a) => a[1].includes('Mozilla')));
});

test('Flatpak browsers get a self-contained shell host inside their own folder (the sandbox cannot run anything outside)', () => {
  const home = tmp(), data = tmp();
  fs.mkdirSync(path.join(home, '.var/app/com.brave.Browser'), { recursive: true });
  fs.mkdirSync(path.join(home, '.var/app/org.mozilla.firefox'), { recursive: true });
  const res = setup.install({ platform: 'linux', home, execPath: process.execPath, hostScript: 'x', tokenFile: 'x', token: TOKEN, dataDir: path.join(data, 'native') });
  assert.equal(res.written.length, 2);
  const dir = path.join(home, '.var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser/NativeMessagingHosts');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'org.kelmo.kdm.json'), 'utf8'));
  assert.equal(m.path, path.join(dir, 'kdm-native-host.sh'));
  assert.ok(m.allowed_origins[0].startsWith('chrome-extension://'));
  assert.ok(fs.existsSync(path.join(home, '.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts/org.kelmo.kdm.json')));
  // the script answers the extension's real request, using only sh/head/printf
  const request = host.encode({ op: 'pair' });
  assert.equal(request.length, 17);
  const r = spawnSync('/bin/sh', [m.path, 'chrome-extension://abc/'], { input: request, timeout: 5000 });
  assert.equal(r.status, 0);
  assert.deepEqual(host.decode(r.stdout).msg, { ok: true, token: TOKEN });
  // without a valid token nothing is written for Flatpak
  const home2 = tmp();
  fs.mkdirSync(path.join(home2, '.var/app/com.brave.Browser'), { recursive: true });
  assert.equal(setup.install({ platform: 'linux', home: home2, execPath: 'x', hostScript: 'x', tokenFile: 'x', dataDir: path.join(data, 'n2') }).written.length, 0);
});

test('Flatpak Chromium browsers get a copy of the extension in their own folder (an unpacked extension elsewhere vanishes at restart)', () => {
  const home = tmp(), data = tmp(), src = tmp();
  fs.mkdirSync(path.join(src, 'icons'));
  fs.writeFileSync(path.join(src, 'manifest.json'), '{"name":"x"}');
  fs.writeFileSync(path.join(src, 'icons', '16.png'), 'png');
  fs.mkdirSync(path.join(home, '.var/app/com.brave.Browser'), { recursive: true });
  fs.mkdirSync(path.join(home, '.var/app/org.mozilla.firefox'), { recursive: true });
  const args = { platform: 'linux', home, execPath: 'x', hostScript: 'x', tokenFile: 'x', token: TOKEN, dataDir: data, extensionSource: src };
  const res = setup.install(args);
  const dest = path.join(home, '.var/app/com.brave.Browser/data/KDM-extension');
  assert.deepEqual(res.extensionCopies, [dest]);
  assert.equal(fs.readFileSync(path.join(dest, 'icons', '16.png'), 'utf8'), 'png');
  assert.ok(!fs.existsSync(path.join(home, '.var/app/org.mozilla.firefox/data/KDM-extension')));
  // an update replaces the copy (a removed file does not linger)
  fs.writeFileSync(path.join(dest, 'old.js'), 'x');
  setup.install(args);
  assert.ok(!fs.existsSync(path.join(dest, 'old.js')));
  // no source (or no manifest there) -> nothing is copied
  assert.deepEqual(setup.install({ ...args, extensionSource: path.join(src, 'nope') }).extensionCopies, []);
  // no Flatpak browser -> nothing
  assert.deepEqual(setup.install({ ...args, home: tmp() }).extensionCopies, []);
});

test('Flatpak extension copy: an unchanged file is not rewritten, a changed one is, leftovers go, and the folder never disappears', () => {
  const home = tmp(), src = tmp();
  fs.writeFileSync(path.join(src, 'manifest.json'), '{"v":1}');
  fs.writeFileSync(path.join(src, 'a.js'), 'A');
  fs.mkdirSync(path.join(home, '.var/app/com.brave.Browser'), { recursive: true });
  const args = { platform: 'linux', home, execPath: 'x', hostScript: 'x', tokenFile: 'x', token: TOKEN, dataDir: tmp(), extensionSource: src };
  setup.install(args);
  const dest = path.join(home, '.var/app/com.brave.Browser/data/KDM-extension');
  const before = fs.statSync(path.join(dest, 'a.js')).mtimeMs;
  const ino = fs.statSync(dest).ino;
  fs.utimesSync(path.join(dest, 'a.js'), new Date(1000), new Date(1000));
  fs.writeFileSync(path.join(dest, 'old.js'), 'x');
  fs.writeFileSync(path.join(src, 'manifest.json'), '{"v":2}');
  setup.install(args);
  assert.equal(fs.statSync(path.join(dest, 'a.js')).mtimeMs, 1000); // untouched
  assert.equal(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'), '{"v":2}');
  assert.equal(fs.existsSync(path.join(dest, 'old.js')), false);
  assert.equal(fs.statSync(dest).ino, ino); // same folder, never recreated
  void before;
});
