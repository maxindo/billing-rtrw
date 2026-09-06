require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./logger');
const {
  encryptSettings,
  decryptSettings,
  assertMasterKeyConfigured
} = require('./settingsEncryption');

let runtimeSessionSecret = null;
function getSecureSessionSecretFallback() {
  if (!runtimeSessionSecret) {
    runtimeSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return runtimeSessionSecret;
}

let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_DURATION = 2000;
const settingsPath = path.join(__dirname, '../settings.json');
let watcher = null;

function readRawSettings() {
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) || {};
}

function getSettings() {
  try {
    assertMasterKeyConfigured();
    const settings = decryptSettings(readRawSettings());

    // Runtime fallback only; this value is not persisted automatically.
    // Production should explicitly configure session_secret and Phase 2A.3
    // will make that mandatory for production startup.
    const legacySecret = 'rahasia-portal-pelanggan-default-ganti-ini';
    if (!settings.session_secret || settings.session_secret === legacySecret) {
      settings.session_secret = getSecureSessionSecretFallback();
    }

    const fallbackTz = 'Asia/Jakarta';
    const tz = typeof settings.timezone === 'string' ? settings.timezone.trim() : '';
    if (!tz) {
      settings.timezone = fallbackTz;
      return settings;
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
      settings.timezone = tz;
    } catch (_) {
      settings.timezone = fallbackTz;
    }

    return settings;
  } catch (error) {
    logger.error(`[settings] Error reading settings.json: ${error.message}`);
    throw error;
  }
}

function getSettingsWithCache() {
  const now = Date.now();
  if (!settingsCache || (now - settingsCacheTime) > CACHE_DURATION) {
    settingsCache = getSettings();
    settingsCacheTime = now;
  }
  return settingsCache;
}

function getSetting(key, defaultValue = null) {
  const settings = getSettingsWithCache();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

function getSettingsByKeys(keys) {
  const settings = getSettingsWithCache();
  const result = {};
  keys.forEach(key => {
    result[key] = settings[key];
  });
  return result;
}

function startSettingsWatcher() {
  try {
    if (watcher) watcher.close();

    watcher = fs.watch(settingsPath, (eventType, filename) => {
      if (eventType !== 'change') return;
      if (filename != null && filename !== 'settings.json') return;

      settingsCache = null;
      settingsCacheTime = 0;

      try {
        const s = getSettingsWithCache();
        const port = s.server_port ?? 4555;
        const host = s.server_host || 'localhost';
        const gurl = s.genieacs_url || '(tidak diatur)';
        const company = s.company_header || '(default)';
        logger.info(`[settings] settings.json dimuat ulang — port ${port}, host ${host}, company: ${company}, GenieACS: ${gurl}`);
      } catch (error) {
        logger.error(`[settings] Gagal memuat ulang settings.json: ${error.message}`);
      }
    });

    logger.info('[settings] Memantau perubahan settings.json');
  } catch (error) {
    logger.error(`[settings] Error starting settings watcher: ${error.message}`);
  }
}

function saveSettings(newSettings) {
  try {
    assertMasterKeyConfigured();
    const currentSettings = getSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };
    const encryptedSettings = encryptSettings(updatedSettings);

    fs.writeFileSync(
      settingsPath,
      JSON.stringify(encryptedSettings, null, 2),
      { encoding: 'utf-8', mode: 0o600 }
    );

    try { fs.chmodSync(settingsPath, 0o600); } catch (_) {}
    settingsCache = updatedSettings;
    settingsCacheTime = Date.now();
    return true;
  } catch (error) {
    logger.error(`[settings] Error saving settings.json: ${error.message}`);
    return false;
  }
}

function getNowLocal() {
  const tz = getSetting('timezone', 'Asia/Jakarta');
  const now = new Date();
  const options = {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);
  const p = {};
  parts.forEach(part => p[part.type] = part.value);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function getCurrentDateInTimezone() {
  const tz = getSetting('timezone', 'Asia/Jakarta');
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const p = {};
  parts.forEach(part => p[part.type] = part.value);
  return new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`);
}

function getCurrentTimeInfo() {
  const tz = getSetting('timezone', 'Asia/Jakarta');
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const p = {};
  parts.forEach(part => p[part.type] = part.value);
  return {
    year: parseInt(p.year),
    month: parseInt(p.month),
    day: parseInt(p.day),
    hour: parseInt(p.hour),
    minute: parseInt(p.minute),
    second: parseInt(p.second)
  };
}

function getNowLocalISO() {
  const info = getCurrentTimeInfo();
  const pad = (n) => String(n).padStart(2, '0');
  return `${info.year}-${pad(info.month)}-${pad(info.day)}T${pad(info.hour)}:${pad(info.minute)}:${pad(info.second)}`;
}

function parseDateInTimezone(dateStr) {
  if (!dateStr) return null;
  const tz = getSetting('timezone', 'Asia/Jakarta');
  const date = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(date.getTime())) return null;

  const localDateStr = date.toLocaleString('en-US', { timeZone: tz, hour12: false });
  const localDate = new Date(localDateStr);
  const diff = localDate.getTime() - date.getTime();
  return new Date(date.getTime() - diff);
}

function formatDateLocal(date) {
  if (!date) return '-';
  const tz = getSetting('timezone', 'Asia/Jakarta');
  let d;
  if (typeof date === 'string') d = parseDateInTimezone(date);
  else d = typeof date === 'number' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { timeZone: tz });
}

function formatTimeLocal(date) {
  if (!date) return '-';
  const tz = getSetting('timezone', 'Asia/Jakarta');
  let d;
  if (typeof date === 'string') d = parseDateInTimezone(date);
  else d = typeof date === 'number' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}

function ensureDefaultSettings() {
  try {
    const currentSettings = getSettings();
    let needsSave = false;

    const defaultSettings = {
      radius_enabled: '0',
      radius_secret: '',
      radius_auth_port: '1812',
      radius_acct_port: '1813',
      radius_isolir_action: 'pool',
      radius_isolir_pool: 'isolir',
      radius_limit_simultaneous: '1',
      radius_default_rate_limit: '5M/10M',
      radius_isolir_rate_limit: '512k/512k',
      radius_isolir_ip_pool_enabled: '1',
      radius_isolir_ip_pool_start: '10.10.99.2',
      radius_isolir_ip_pool_end: '10.10.99.254',
      radius_ip_pool_enabled: '1',
      radius_ip_pool_start: '10.10.10.2',
      radius_ip_pool_end: '10.10.10.254',
      radius_framed_pool: 'pool-pppoe',
      radius_send_group: '0'
    };

    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
      if (currentSettings[key] === undefined) {
        currentSettings[key] = defaultValue;
        needsSave = true;
        logger.info(`[settings] Added missing setting: ${key}`);
      }
    }

    if (needsSave) {
      if (!saveSettings(currentSettings)) {
        throw new Error('Gagal menyimpan default settings');
      }
      logger.info('[settings] settings.json updated with secure defaults');
    }

    return needsSave;
  } catch (error) {
    logger.error(`[settings] Error ensuring default settings: ${error.message}`);
    throw error;
  }
}

startSettingsWatcher();

module.exports = {
  getSettings,
  getSettingsWithCache,
  getSetting,
  getSettingsByKeys,
  saveSettings,
  getNowLocal,
  formatDateLocal,
  formatTimeLocal,
  getCurrentDateInTimezone,
  getCurrentTimeInfo,
  getNowLocalISO,
  parseDateInTimezone,
  startSettingsWatcher,
  ensureDefaultSettings
};
