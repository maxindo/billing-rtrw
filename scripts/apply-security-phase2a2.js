#!/usr/bin/env node
'use strict';

/**
 * Phase 2A.2 security patcher.
 *
 * Why this exists:
 * routes/adminPortal.js, routes/customerAPI.js and services/agentService.js are
 * very large. This script applies narrow, validated edits locally instead of
 * replacing whole files through tooling. It is intentionally fail-fast and
 * makes .phase2a2.bak backups before modifying files.
 *
 * Run from repository root:
 *   node scripts/apply-security-phase2a2.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function write(rel, content) {
  const file = path.join(ROOT, rel);
  const backup = `${file}.phase2a2.bak`;
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  fs.writeFileSync(file, content, 'utf8');
  console.log(`patched: ${rel}`);
}

function replaceRequired(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (typeof search === 'string') {
    if (!content.includes(search)) throw new Error(`Pattern not found: ${label}`);
    return content.replace(search, replacement);
  }
  if (!search.test(content)) throw new Error(`Pattern not found: ${label}`);
  return content.replace(search, replacement);
}

function patchAgentService() {
  const rel = 'services/agentService.js';
  let s = read(rel);

  s = replaceRequired(
    s,
    "const { parseMikhmonOnLogin } = require('../utils/mikhmonParser');",
    "const { parseMikhmonOnLogin } = require('../utils/mikhmonParser');\nconst { hashPassword, verifyAndUpgradePassword, isPasswordHash } = require('../utils/passwordUtil');",
    'agent password util import'
  );

  s = replaceRequired(
    s,
    /function authenticate\(username, password\) \{\s*return db\s*\.prepare\('SELECT \* FROM agents WHERE username = \? AND password = \? AND is_active = 1'\)\s*\.get\(username, password\);\s*\}/,
    `function authenticate(username, password) {
  const safeUsername = String(username || '').trim();
  const agent = db
    .prepare('SELECT * FROM agents WHERE username = ? AND is_active = 1 LIMIT 1')
    .get(safeUsername);
  if (!agent) return null;

  const ok = verifyAndUpgradePassword(password, agent.password, (upgradedHash) => {
    db.prepare('UPDATE agents SET password = ? WHERE id = ?').run(upgradedHash, agent.id);
  });
  if (!ok) return null;

  const { password: _password, ...safeAgent } = agent;
  return safeAgent;
}`,
    'agent authenticate'
  );

  s = replaceRequired(
    s,
    "function getAllAgents() {\n  return db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all();\n}",
    "function getAllAgents() {\n  return db.prepare('SELECT id, username, name, phone, balance, billing_fee, is_active, created_at FROM agents ORDER BY created_at DESC').all();\n}",
    'agent safe list'
  );

  s = replaceRequired(
    s,
    "function getAgentById(id) {\n  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id);\n}",
    "function getAgentById(id) {\n  return db.prepare('SELECT id, username, name, phone, balance, billing_fee, is_active, created_at FROM agents WHERE id = ?').get(id);\n}\n\nfunction getAgentAuthRecordById(id) {\n  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id);\n}",
    'agent safe get-by-id'
  );

  s = replaceRequired(
    s,
    "      String(data.password || ''),",
    "      hashPassword(String(data.password || '')),",
    'agent create hash'
  );

  s = replaceRequired(
    s,
    "  const existing = getAgentById(id);\n  if (!existing) throw new Error('Agent tidak ditemukan');",
    "  const existing = getAgentAuthRecordById(id);\n  if (!existing) throw new Error('Agent tidak ditemukan');",
    'agent update auth record'
  );

  s = replaceRequired(
    s,
    "    password: String(data.password ?? existing.password),",
    "    password: (() => {\n      const incoming = String(data.password ?? '').trim();\n      if (!incoming) return existing.password;\n      return isPasswordHash(incoming) ? incoming : hashPassword(incoming);\n    })(),",
    'agent update hash'
  );

  write(rel, s);
}

function patchAdminPortal() {
  const rel = 'routes/adminPortal.js';
  let s = read(rel);

  s = replaceRequired(
    s,
    "const crypto = require('crypto');",
    "const crypto = require('crypto');\nconst { verifyAndUpgradePassword } = require('../utils/passwordUtil');",
    'admin password util import'
  );

  const oldRequireAdmin = `function requireAdmin(req, res, next) {
  if (req.session?.isAdmin || req.session?.isCashier) return next();
  const adminKey = getSetting('admin_api_key', '');
  const providedKey = req.headers['x-admin-key'] || req.query.key;
  if (adminKey && providedKey === adminKey) return next();
  return res.status(401).json({ error: 'Unauthorized - Admin/Staff access required' });
}`;

  const newRequireAdmin = `function safeSecretEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  return aa.length > 0 && aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin || req.session?.isCashier) return next();
  const adminKey = String(getSetting('admin_api_key', '') || '');
  const providedKey = String(req.headers['x-admin-key'] || '');
  if (adminKey && safeSecretEqual(providedKey, adminKey)) return next();
  return res.status(401).json({ error: 'Unauthorized - Admin/Staff access required' });
}`;

  s = replaceRequired(s, oldRequireAdmin, newRequireAdmin, 'admin API key header-only validation');

  const oldLogin = `  const { username, password } = req.body;
  if (username === getSetting('admin_username', 'admin') && password === getSetting('admin_password', 'admin123')) {
    req.session.isAdmin = true;
    req.session.adminUser = username;
    return res.redirect('/admin');
  }`;

  const newLogin = `  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const adminUsername = String(getSetting('admin_username', '') || '').trim();
  const storedAdminPassword = String(getSetting('admin_password', '') || '');

  let adminPasswordOk = false;
  if (adminUsername && storedAdminPassword && username === adminUsername) {
    adminPasswordOk = verifyAndUpgradePassword(password, storedAdminPassword, (upgradedHash) => {
      if (!saveSettings({ admin_password: upgradedHash })) {
        throw new Error('Gagal memigrasikan password administrator');
      }
    });
  }

  if (adminPasswordOk) {
    return req.session.regenerate((err) => {
      if (err) {
        logger.error('[auth] Admin session regeneration failed: ' + err.message);
        return res.status(500).send('Login gagal');
      }
      req.session.isAdmin = true;
      req.session.adminUser = username;
      return res.redirect('/admin');
    });
  }`;

  s = replaceRequired(s, oldLogin, newLogin, 'admin login hash migration');
  write(rel, s);
}

function patchCustomerApi() {
  const rel = 'routes/customerAPI.js';
  let s = read(rel);

  s = replaceRequired(
    s,
    "const { getSetting, getSettingsWithCache } = require('../config/settingsManager');",
    "const { getSetting, getSettingsWithCache, saveSettings } = require('../config/settingsManager');\nconst { verifyAndUpgradePassword } = require('../utils/passwordUtil');",
    'customer API secure auth imports'
  );

  s = replaceRequired(
    s,
    `function getApiSecret() {
  const settings = getSettingsWithCache();
  return settings.session_secret || 'rahasia-api-pelanggan-alijaya-default';
}`,
    `function getApiSecret() {
  const settings = getSettingsWithCache();
  const secret = String(settings.session_secret || '').trim();
  if (!secret) throw new Error('session_secret belum dikonfigurasi');
  return secret;
}`,
    'API secret fail-closed'
  );

  s = replaceRequired(
    s,
    `    username: customer.pppoe_username || customer.id,
    exp:`,
    `    username: customer.pppoe_username || customer.username || customer.id,
    role: customer.role || 'customer',
    exp:`,
    'token role claim'
  );

  const customerAuthRegex = /function requireCustomerApiAuth\(req, res, next\) \{[\s\S]*?\n\}\n\n\/\/ ─── 0\. PING/;
  if (!customerAuthRegex.test(s) && !s.includes('Authenticated customer token required')) {
    throw new Error('Pattern not found: customer auth middleware');
  }
  if (!s.includes('Authenticated customer token required')) {
    s = s.replace(customerAuthRegex, `function requireCustomerApiAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-access-token'];
  const payload = verifyCustomerToken(authHeader);

  if (!payload || payload.role !== 'customer' || !payload.customerId) {
    return res.status(401).json({
      success: false,
      message: 'Authenticated customer token required.'
    });
  }

  const customer = customerSvc.getCustomerById(payload.customerId);
  if (!customer) {
    return res.status(401).json({ success: false, message: 'Akun pelanggan tidak ditemukan.' });
  }

  req.customer = customer;
  req.tokenPayload = payload;
  return next();
}

function requireAdminApiAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-access-token'];
  const payload = verifyCustomerToken(authHeader);
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ success: false, message: 'Administrator token required.' });
  }
  req.auth = payload;
  return next();
}

// ─── 0. PING`);
  }

  const oldAdminLogin = `  const adminUser = getSetting('admin_username', 'admin');
  const adminPass = getSetting('admin_password', 'admin123');
  if (inputUser === adminUser && inputPass === adminPass) {`;
  const newAdminLogin = `  const adminUser = String(getSetting('admin_username', '') || '').trim();
  const adminPass = String(getSetting('admin_password', '') || '');
  let adminPassOk = false;
  if (adminUser && adminPass && inputUser === adminUser) {
    adminPassOk = verifyAndUpgradePassword(inputPass, adminPass, (upgradedHash) => {
      if (!saveSettings({ admin_password: upgradedHash })) {
        throw new Error('Gagal memigrasikan password administrator');
      }
    });
  }
  if (adminPassOk) {`;
  s = replaceRequired(s, oldAdminLogin, newAdminLogin, 'mobile admin hash migration');

  s = replaceRequired(
    s,
    "generateCustomerToken({ id: 1, name: 'Administrator', phone: '08123456789', pppoe_username: adminUser })",
    "generateCustomerToken({ id: 1, name: 'Administrator', phone: '', pppoe_username: adminUser, role: 'admin' })",
    'admin token role'
  );

  // Protect every /app/admin/* route. Avoid duplicating middleware if rerun.
  s = s.replace(
    /router\.(get|post|put|patch|delete)\((['"]\/app\/admin\/[^'"]+['"]),\s*(?!requireAdminApiAuth,)/g,
    'router.$1($2, requireAdminApiAuth, '
  );

  write(rel, s);
}

function main() {
  patchAgentService();
  patchAdminPortal();
  patchCustomerApi();
  console.log('\nPhase 2A.2 large-file patches completed.');
  console.log('Next: inspect git diff, run node --check on patched files, then smoke-test logins.');
}

try {
  main();
} catch (error) {
  console.error(`\nPhase 2A.2 FAILED: ${error.message}`);
  process.exitCode = 1;
}
