#!/usr/bin/env node
// Packs the browser extension for the stores:  node scripts/pack-extension.mjs
//   release/kdm-firefox-<version>.zip   → addons.mozilla.org (Firefox; unlisted = signed .xpi for yourself, listed = public)
//   release/kdm-chromium-<version>.zip  → Chrome Web Store / Edge Add-ons (Brave, Vivaldi, Opera install from the Chrome store)
// No dependencies: it writes the zip itself.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const extDir = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));

/** Manifest for one store. Each browser ignores what is not its own, but the stores warn about unknown keys. */
export function manifestFor(kind, m = manifest) {
  const out = JSON.parse(JSON.stringify(m));
  delete out.key; // the development key only pins the ID of the unpacked extension; the stores assign their own
  if (kind === 'firefox') {
    out.background = { scripts: m.background.scripts }; // Firefox runs event pages, not service workers
  } else {
    out.background = { service_worker: 'background.js' };
    // media.js is pulled in with importScripts by background.js (see below)
    delete out.browser_specific_settings;
  }
  return out;
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Minimal zip writer (deflate). files: [{ name, data: Buffer }] */
export function zip(files) {
  const chunks = []; const central = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name); const comp = zlib.deflateRawSync(f.data, { level: 9 }); const crc = crc32(f.data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12); // fixed date: 1980-01-01, so the zip is reproducible
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(f.data.length, 22); head.writeUInt16LE(name.length, 26);
    chunks.push(head, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(f.data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += head.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, end]);
}

function listFiles(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`])).sort();
}

export function build(kind) {
  const files = listFiles(extDir).map((name) => ({
    name,
    data: name === 'manifest.json' ? Buffer.from(JSON.stringify(manifestFor(kind), null, 2) + '\n') : fs.readFileSync(path.join(extDir, name)),
  }));
  fs.mkdirSync(path.join(root, 'release'), { recursive: true });
  const out = path.join(root, 'release', `kdm-${kind}-${manifest.version}.zip`);
  fs.writeFileSync(out, zip(files));
  return { out, count: files.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const kind of ['firefox', 'chromium']) {
    const r = build(kind);
    console.log(`✔ ${path.relative(root, r.out)}  (${r.count} files)`);
  }
}
