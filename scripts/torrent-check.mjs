// Torrent self-test without the app:  node scripts/torrent-check.mjs "magnet:?xt=urn:btih:…" [seconds]
// Runs KDM's torrent engine in plain Node for a short time and prints what happens ([torrent] lines + progress).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { TorrentDownload } from '../engine/torrent.mjs';

const url = process.argv[2];
const secs = Number(process.argv[3]) || 40;
if (!url) { console.log('Usage: node scripts/torrent-check.mjs "<magnet link or .torrent file URL>" [seconds]'); process.exit(1); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdm-torrent-check-'));
console.log('Node', process.version, '| saving to', dir, '| running', secs, 's');
const d = new TorrentDownload({ url, dir, metadataTimeoutMs: (secs - 5) * 1000 });
d.on('state', (s) => console.log('[state]', s, d.fileName || '', d.total || '', d.error || ''));
let n = 0;
d.on('progress', (p) => { if (++n % 4 === 0) console.log('[progress]', `${p.downloaded}/${p.total} bytes, ${Math.round(p.speed)} B/s, peers ${p.connections}`); });
await d.start();
setTimeout(async () => {
  console.log(d.downloaded > 0 ? `RESULT: OK, ${d.downloaded} bytes downloaded` : `RESULT: nothing downloaded (status ${d.status}${d.error ? ': ' + d.error : ''})`);
  await d.cancel();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
}, secs * 1000);
