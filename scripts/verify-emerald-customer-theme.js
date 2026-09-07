#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  ['Login', 'views/login.ejs'],
  ['OTP Login', 'views/login_otp.ejs'],
  ['OTP', 'views/otp.ejs'],
  ['Register', 'views/register.ejs'],
  ['Dashboard + Ticket + Profil', 'views/dashboard.ejs'],
  ['Cek Tagihan', 'views/public_check_billing.ejs'],
  ['Invoice / QRIS', 'views/qris_static.ejs'],
  ['Isolir', 'views/isolated.ejs'],
  ['Voucher', 'views/public_voucher.ejs'],
  ['PPOB', 'views/customer/ppob.ejs'],
  ['Topup', 'views/customer/topup.ejs']
];

let failed = 0;
function pass(msg) { console.log(`PASS  ${msg}`); }
function fail(msg) { failed++; console.error(`FAIL  ${msg}`); }

for (const css of ['public/css/customer-emerald.css', 'public/css/customer-emerald-legacy.css']) {
  const f = path.join(ROOT, css);
  if (fs.existsSync(f) && fs.statSync(f).size > 500) pass(`${css} tersedia`);
  else fail(`${css} tidak tersedia / kosong`);
}

for (const [label, rel] of TARGETS) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) {
    fail(`${label}: file hilang (${rel})`);
    continue;
  }
  const src = fs.readFileSync(f, 'utf8');
  if (src.includes('/css/customer-emerald.css') && src.includes('/css/customer-emerald-legacy.css')) {
    pass(`${label}: Emerald styles terpasang`);
  } else {
    fail(`${label}: Emerald styles belum diinject`);
  }
}

// Guard: theme must not be injected into admin shell/styles by this migration.
const adminCss = path.join(ROOT, 'public/css/admin.css');
if (fs.existsSync(adminCss) && !fs.readFileSync(adminCss, 'utf8').includes('customer-emerald')) {
  pass('Admin CSS tidak disentuh');
} else if (fs.existsSync(adminCss)) {
  fail('Admin CSS terkontaminasi customer theme');
}

console.log(`\nEmerald theme verification: ${failed} failed`);
process.exitCode = failed ? 1 : 0;
