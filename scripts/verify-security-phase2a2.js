#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(label, condition) {
  if (condition) passes.push(label);
  else failures.push(label);
}

function syntaxCheck(rel) {
  const r = spawnSync(process.execPath, ['--check', path.join(root, rel)], { encoding: 'utf8' });
  assert(`syntax ${rel}`, r.status === 0);
  if (r.status !== 0) console.error(r.stderr || r.stdout);
}

const adminPortal = read('routes/adminPortal.js');
const customerApi = read('routes/customerAPI.js');
const agentService = read('services/agentService.js');
const settingsManager = read('config/settingsManager.js');
const settingsEncryption = read('config/settingsEncryption.js');

syntaxCheck('utils/passwordUtil.js');
syntaxCheck('services/adminService.js');
syntaxCheck('services/techService.js');
syntaxCheck('services/agentService.js');
syntaxCheck('config/settingsEncryption.js');
syntaxCheck('config/settingsManager.js');
syntaxCheck('routes/adminPortal.js');
syntaxCheck('routes/customerAPI.js');

assert('admin123 fallback removed from admin portal', !adminPortal.includes("getSetting('admin_password', 'admin123')"));
assert('admin API key query-string access removed', !adminPortal.includes("req.query.key"));
assert('admin password uses secure verifier', adminPortal.includes('verifyAndUpgradePassword'));
assert('agent plaintext SQL authentication removed', !agentService.includes('username = ? AND password = ? AND is_active = 1'));
assert('agent password uses secure verifier', agentService.includes('verifyAndUpgradePassword'));
assert('customer API default API secret removed', !customerApi.includes('rahasia-api-pelanggan-alijaya-default'));
assert('customer API first-customer auth bypass removed', !customerApi.includes("Fallback ke pelanggan aktif pertama di database jika testing"));
assert('customer API direct customer-id auth bypass removed', !customerApi.includes("const custIdHeader = req.headers['x-customer-id'] || req.query.customer_id"));
assert('mobile admin123 fallback removed', !customerApi.includes("getSetting('admin_password', 'admin123')"));
assert('admin mobile routes protected', customerApi.includes("'/app/admin/") && customerApi.includes('requireAdminApiAuth'));
assert('RADIUS default secret removed', !settingsManager.includes("radius_secret: 'secret123'"));
assert('settings are encrypted before write', settingsManager.includes('encryptSettings(updatedSettings)'));
assert('settings are decrypted after read', settingsManager.includes('decryptSettings(readRawSettings())'));
assert('public master-key fallback removed', !settingsEncryption.includes("process.env.SETTINGS_MASTER_KEY || 'default-master-key-change-this-in-production'"));
assert('master key validation enabled', settingsEncryption.includes('assertMasterKeyConfigured'));

for (const label of passes) console.log(`PASS  ${label}`);
for (const label of failures) console.error(`FAIL  ${label}`);

console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
