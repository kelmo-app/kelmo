/* Saved logins for downloads (username + password).
 *
 * The password is typed once, sealed here in the main process with the operating system's keyring (Electron safeStorage:
 * libsecret / KWallet on Linux, DPAPI on Windows, Keychain on macOS) and only the sealed text is kept with the download.
 * The window that shows the download never sees the password again. Where the system has no real keyring the text is only
 * lightly hidden ("plain:" = base64), and the Settings page says so. Pure: safeStorage is injected. */

const MAX = 512;

function createSecrets(safeStorage) {
  /** true only for a real keyring (on Linux Electron falls back to a built-in password called "basic_text"). */
  const strong = () => {
    try {
      if (!safeStorage || !safeStorage.isEncryptionAvailable()) return false;
      const backend = typeof safeStorage.getSelectedStorageBackend === 'function' ? safeStorage.getSelectedStorageBackend() : '';
      return backend !== 'basic_text';
    } catch { return false; }
  };

  function seal(password) {
    const pw = String(password ?? '').slice(0, MAX);
    if (!pw) return '';
    if (strong()) {
      try { return `enc:${safeStorage.encryptString(pw).toString('base64')}`; } catch { /* fall through to the light form */ }
    }
    return `plain:${Buffer.from(pw, 'utf8').toString('base64')}`;
  }

  /** The password again, or null when it cannot be opened (another user account, wiped keyring…). */
  function open(sealed) {
    if (typeof sealed !== 'string') return null;
    try {
      if (sealed.startsWith('plain:')) return Buffer.from(sealed.slice(6), 'base64').toString('utf8').slice(0, MAX);
      if (sealed.startsWith('enc:') && safeStorage) return safeStorage.decryptString(Buffer.from(sealed.slice(4), 'base64')).slice(0, MAX);
    } catch { /* unreadable */ }
    return null;
  }

  return { seal, open, strong };
}

/** "Basic …" header value for a login. A user name cannot contain ":" (RFC 7617). */
function basicHeader(user, password) {
  return `Basic ${Buffer.from(`${String(user).replace(/:/g, '')}:${password}`, 'utf8').toString('base64')}`;
}

module.exports = { createSecrets, basicHeader };
