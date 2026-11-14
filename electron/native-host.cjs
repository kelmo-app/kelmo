'use strict';
// Native Messaging host for the KDM browser extension.
// The browser starts this program only for extensions listed in the host manifest (see native-setup.cjs),
// which is why the pairing token can be handed over without the user copying anything.
// Protocol: each message is a 4-byte length (little-endian on x86/ARM) followed by JSON, on stdin / stdout.
const fs = require('node:fs');

const MAX_MESSAGE = 64 * 1024;

function encode(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

/** Reads one message from a buffer. Returns { msg, rest } or null while it is incomplete. Throws on a bad frame. */
function decode(buf) {
  if (buf.length < 4) return null;
  const len = buf.readUInt32LE(0);
  if (len > MAX_MESSAGE) throw new Error('message too large');
  if (buf.length < 4 + len) return null;
  return { msg: JSON.parse(buf.subarray(4, 4 + len).toString('utf8')), rest: buf.subarray(4 + len) };
}

/** Answers one request. Only "pair" is understood; the token never leaves this machine's browser <-> KDM link. */
function handle(msg, tokenFile) {
  if (!msg || msg.op !== 'pair') return { ok: false, error: 'unknown request' };
  try {
    const token = fs.readFileSync(tokenFile, 'utf8').trim();
    if (!/^[a-f0-9]{32}$/.test(token)) return { ok: false, error: 'no-token' };
    return { ok: true, token };
  } catch {
    return { ok: false, error: 'no-token' }; // KDM has never run on this computer yet
  }
}

function main(tokenFile) {
  let pending = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    let got;
    try { got = decode(pending); } catch { process.exit(1); }
    if (!got) return;
    process.stdout.write(encode(handle(got.msg, tokenFile)), () => process.exit(0));
  });
  process.stdin.on('end', () => process.exit(0));
}

if (require.main === module) main(process.argv[2]);

module.exports = { encode, decode, handle };
