import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createSecrets, basicHeader } = createRequire(import.meta.url)('../secrets.cjs');

/** A pretend keyring: "encrypts" by reversing the bytes, so a sealed value is not the password. */
const keyring = (backend = 'gnome_libsecret', available = true) => ({
  isEncryptionAvailable: () => available,
  getSelectedStorageBackend: () => backend,
  encryptString: (s) => Buffer.from(s).reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString(),
});

test('with a real keyring the password is sealed ("enc:") and opens again', () => {
  const s = createSecrets(keyring());
  const sealed = s.seal('p@ss wörd');
  assert.match(sealed, /^enc:/);
  assert.equal(sealed.includes('p@ss'), false);
  assert.equal(s.open(sealed), 'p@ss wörd');
  assert.equal(s.strong(), true);
});
test('Linux "basic_text" fallback and "no keyring" count as weak: lightly hidden, still usable', () => {
  for (const ss of [keyring('basic_text'), keyring('x', false), null]) {
    const s = createSecrets(ss);
    const sealed = s.seal('secret1');
    assert.match(sealed, /^plain:/);
    assert.equal(s.open(sealed), 'secret1');
    assert.equal(s.strong(), false);
  }
});
test('empty password gives empty text; unreadable or foreign text gives null; length is capped', () => {
  const s = createSecrets(keyring());
  assert.equal(s.seal(''), '');
  assert.equal(s.open('garbage'), null);
  assert.equal(s.open(undefined), null);
  assert.equal(s.open(s.seal('x'.repeat(2000))).length, 512);
  const broken = { ...keyring(), decryptString: () => { throw new Error('keyring wiped'); } };
  assert.equal(createSecrets(broken).open(createSecrets(keyring()).seal('abc')), null);
});
test('Basic header: RFC 7617, UTF-8, no ":" in the user name', () => {
  assert.equal(basicHeader('Aladdin', 'open sesame'), 'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==');
  assert.equal(basicHeader('a:b', 'c'), basicHeader('ab', 'c'));
  assert.equal(basicHeader('u', 'päss'), `Basic ${Buffer.from('u:päss').toString('base64')}`);
});
