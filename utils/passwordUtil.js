const crypto = require('crypto');

const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;
const PREFIX = 'scrypt';

function normalizePassword(password) {
  return String(password ?? '');
}

function isPasswordHash(value) {
  return String(value || '').startsWith(`${PREFIX}$`);
}

function hashPassword(password) {
  const plain = normalizePassword(password);
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password minimal ${MIN_PASSWORD_LENGTH} karakter`);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, KEY_LENGTH).toString('hex');
  return `${PREFIX}$${salt}$${hash}`;
}

function verifyPassword(password, storedPassword) {
  const plain = normalizePassword(password);
  const stored = String(storedPassword || '');
  if (!isPasswordHash(stored)) return false;

  const parts = stored.split('$');
  if (parts.length !== 3) return false;

  const [, salt, hashHex] = parts;
  if (!salt || !hashHex || !/^[0-9a-f]+$/i.test(hashHex) || hashHex.length % 2 !== 0) {
    return false;
  }

  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(plain, salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Verifies a credential while supporting transparent migration from legacy
 * plaintext storage. When a legacy password matches, onUpgrade receives the
 * new scrypt hash and should persist it immediately.
 */
function verifyAndUpgradePassword(password, storedPassword, onUpgrade) {
  const plain = normalizePassword(password);
  const stored = String(storedPassword || '');

  if (isPasswordHash(stored)) {
    return verifyPassword(plain, stored);
  }

  // Legacy compatibility only. Remove after all accounts have migrated.
  const legacyMatch = stored.length > 0 && stored === plain;
  if (!legacyMatch) return false;

  const upgradedHash = hashPassword(plain);
  if (typeof onUpgrade === 'function') onUpgrade(upgradedHash);
  return true;
}

module.exports = {
  KEY_LENGTH,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
  verifyAndUpgradePassword,
  isPasswordHash
};
