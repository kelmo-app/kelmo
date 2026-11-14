#!/usr/bin/env node
// A stand-in for yt-dlp used by the tests: same command line, same kind of output, no network.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (process.env.KDM_FAKE_LOG) fs.appendFileSync(process.env.KDM_FAKE_LOG, JSON.stringify(args) + '\n');
const ci = args.indexOf('--cookies');
if (ci >= 0 && process.env.KDM_FAKE_LOG) fs.appendFileSync(process.env.KDM_FAKE_LOG, 'COOKIES ' + JSON.stringify(fs.readFileSync(args[ci + 1], 'utf8')) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (args.includes('--version')) { console.log('2099.01.01'); process.exit(0); }

if (args.includes('-J')) {
  if (process.env.KDM_FAKE_FAIL) { console.error('ERROR: [youtube] abc: Video unavailable'); process.exit(1); }
  console.log(JSON.stringify({
    id: 'abc', title: 'My: Great/Video?', uploader: 'Someone', duration: 125, thumbnail: 'https://img.example/t.jpg',
    formats: [
      { format_id: '18', vcodec: 'avc1', acodec: 'mp4a', height: 360, filesize: 10_000_000, tbr: 500 },
      { format_id: '136', vcodec: 'avc1', acodec: 'none', height: 720, filesize: 40_000_000, tbr: 1500 },
      { format_id: '137', vcodec: 'avc1', acodec: 'none', height: 1080, filesize_approx: 90_000_000, tbr: 3000 },
      { format_id: '140', vcodec: 'none', acodec: 'mp4a', abr: 128, filesize: 5_000_000 },
      { format_id: '139', vcodec: 'none', acodec: 'mp4a', abr: 48, filesize: 2_000_000 },
    ],
  }));
  process.exit(0);
}

// download mode
const out = args[args.indexOf('-o') + 1];
const target = out.replace('%(ext)s', 'mp4');
if (process.env.KDM_FAKE_FAIL) { console.error('ERROR: [youtube] abc: Sign in to confirm you are not a bot'); process.exit(1); }
const slow = !!process.env.KDM_FAKE_SLOW;
const line = (done, total, speed, eta, file) => console.log(`KDMP|${done}|${total}|NA|${speed}|${eta}|${file}`);
process.on('SIGTERM', () => process.exit(143));
fs.writeFileSync(target + '.part', 'partial');
for (const [file, total] of [[target.replace('.mp4', '.f137.mp4'), 1000], [target.replace('.mp4', '.f140.m4a'), 200]]) {
  for (let i = 1; i <= 4; i++) {
    line(Math.round((total * i) / 4), total, 5000 * i, 4 - i, file);
    await sleep(slow ? 400 : 20);
  }
}
fs.rmSync(target + '.part', { force: true });
fs.writeFileSync(target, 'v'.repeat(1200));
console.log('[Merger] Merging formats into "' + path.basename(target) + '"');
process.exit(0);
