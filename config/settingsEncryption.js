/**
 * Settings Encryption & Decryption
 * Encrypt/decrypt sensitive fields stored in settings.json using AES-256-GCM.
 */
const crypto = require('crypto');
const { logger } = require('./logger');

const LEGACY_DEFAULT_MASTER_KEY = 'default-master-key-change-this-in-production';
const MASTER_KEY = String(process.env.SETTINGS_MASTER_KEY || '').trim();

function assertMasterKeyConfigured() {
  if (!MASTER_KEY) {
    throw new Error(
      'SETTINGS_MASTER_KEY belum dikonfigurasi. Generate dengan `openssl rand -hex 32` lalu simpan di environment/.env.'
    );
  }
  if (MASTER_KEY === LEGACY_DEFAULT_MASTER_KEY) {
    throw new Error('SETTINGS_MASTER_KEY masih menggunakan default publik dan tidak aman.');
  }
  if (MASTER_KEY.length < 32) {
    throw new Error('SETTINGS_MASTER_KEY terlalu pendek. Gunakan minimal 32 karakter acak.');
  }
}

function getMasterKeyForString(keyStr) {
  return crypto.createHash('sha256').update(String(keyStr || '')).digest();
}

function getMasterKey() {
  assertMasterKeyConfigured();
  return getMasterKeyForString(MASTER_KEY);
}

// Admin password is intentionally excluded: login passwords must be one-way hashed,
// not reversibly encrypted. Network/API credentials remain reversible where needed.
const SENSITIVE_FIELDS = [
  'genieacs_password',
  'admin_api_key',
  'mikrotik_password',
  'tripay_api_key',
  'tripay_private_key',
  'midtrans_server_key',
  'telegram_bot_token',
  'xendit_api_key',
  'duitku_api_key',
  'digiflazz_api_key',
  'radius_secret',
  'session_secret'
];

function isEncryptedValue(value) {
  return typeof value === 'string' && value.startsWith('enc:');
}

function encryptValue(value) {
  if (!value || typeof value !== 'string') return value;
  if (isEncryptedValue(value)) return value;

  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptWithKey(encryptedValue, key) {
  const parts = String(encryptedValue).split(':');
  if (parts.length !== 4 || parts[0] !== 'enc') {
    throw new Error('Invalid encrypted value format');
  }

  const [, ivHex, authTagHex, encryptedHex] = parts;
  if (!/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(authTagHex) || !/^[0-9a-f]+$/i.test(encryptedHex)) {
    throw new Error('Invalid encrypted value encoding');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function decryptValue(encryptedValue) {
  if (!encryptedValue || typeof encryptedValue !== 'string') return encryptedValue;
  if (!isEncryptedValue(encryptedValue)) return encryptedValue;

  const primaryKey = getMasterKey();
  try {
    return decryptWithKey(encryptedValue, primaryKey);
  } catch (primaryError) {
    // Temporary migration compatibility for values previously encrypted with
    // the historical public fallback key. Successful reads are re-encrypted
    // with the configured key on the next saveSettings().
    try {
      const legacyKey = getMasterKeyForString(LEGACY_DEFAULT_MASTER_KEY);
      const decrypted = decryptWithKey(encryptedValue, legacyKey);
      logger.warn('[encryption] Legacy default-key encrypted value detected; re-save settings to rotate it.');
      return decrypted;
    } catch (legacyError) {
      logger.error(`[encryption] Unable to decrypt sensitive setting: ${primaryError.message}`);
      throw new Error('Gagal mendekripsi setting sensitif. Periksa SETTINGS_MASTER_KEY.');
    }
  }
}

function encryptSettings(settings) {
  assertMasterKeyConfigured();
  const encrypted = { ...settings };
  for (const field of SENSITIVE_FIELDS) {
    if (encrypted[field]) encrypted[field] = encryptValue(encrypted[field]);
  }
  return encrypted;
}

function decryptSettings(settings) {
  assertMasterKeyConfigured();
  const decrypted = { ...settings };
  for (const field of SENSITIVE_FIELDS) {
    if (decrypted[field]) decrypted[field] = decryptValue(decrypted[field]);
  }
  return decrypted;
}

function maskValue(value) {
  if (!value || typeof value !== 'string') return value;
  if (isEncryptedValue(value)) return '****';
  if (value.length <= 8) return '****';
  return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`;
}

function getMaskedSettings(settings) {
  const masked = { ...settings };
  for (const field of SENSITIVE_FIELDS) {
    if (masked[field]) masked[field] = maskValue(masked[field]);
  }
  return masked;
}

function isSensitiveField(field) {
  return SENSITIVE_FIELDS.includes(field);
}

module.exports = {
  assertMasterKeyConfigured,
  encryptValue,
  decryptValue,
  encryptSettings,
  decryptSettings,
  maskValue,
  getMaskedSettings,
  isSensitiveField,
  isEncryptedValue,
  SENSITIVE_FIELDS
};
