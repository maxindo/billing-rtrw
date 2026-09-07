#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const THEME_LINKS = [
  '  <link rel="stylesheet" href="/css/customer-emerald.css?v=1.0.0">',
  '  <link rel="stylesheet" href="/css/customer-emerald-legacy.css?v=1.0.0">'
].join('\n');

const TARGETS = [
  'views/login.ejs',
  'views/login_otp.ejs',
  'views/otp.ejs',
  'views/register.ejs',
  'views/dashboard.ejs',
  'views/public_check_billing.ejs',
  'views/qris_static.ejs',
  'views/isolated.ejs',
  'views/public_voucher.ejs',
  'views/customer/ppob.ejs',
  'views/customer/topup.ejs'
];

function patchView(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`skip missing: ${rel}`);
    return { rel, status: 'missing' };
  }

  let src = fs.readFileSync(file, 'utf8');
  const hasCore = src.includes('/css/customer-emerald.css');
  const hasLegacy = src.includes('/css/customer-emerald-legacy.css');

  if (hasCore && hasLegacy) {
    console.log(`already themed: ${rel}`);
    return { rel, status: 'already' };
  }

  if (!src.includes('</head>')) {
    throw new Error(`Tidak menemukan </head>: ${rel}`);
  }

  // Insert theme as the final stylesheets in <head>. This lets the Emerald layer
  // override old indigo/blue per-page styles while preserving HTML, JS and EJS logic.
  const missingLinks = [];
  if (!hasCore) missingLinks.push('  <link rel="stylesheet" href="/css/customer-emerald.css?v=1.0.0">');
  if (!hasLegacy) missingLinks.push('  <link rel="stylesheet" href="/css/customer-emerald-legacy.css?v=1.0.0">');
  src = src.replace('</head>', `${missingLinks.join('\n')}\n</head>`);

  // Browser/PWA chrome follows the Emerald palette when a theme-color exists.
  src = src.replace(
    /<meta\s+name=["']theme-color["']\s+content=["'][^"']*["']\s*\/?\s*>/i,
    '<meta name="theme-color" content="#052e16">'
  );

  fs.writeFileSync(file, src, 'utf8');
  console.log(`themed: ${rel}`);
  return { rel, status: 'themed' };
}

const results = TARGETS.map(patchView);
const themed = results.filter(x => x.status === 'themed').length;
const already = results.filter(x => x.status === 'already').length;
const missing = results.filter(x => x.status === 'missing').length;

console.log(`\nEmerald Green ISP theme injection complete.`);
console.log(`themed=${themed} already=${already} missing=${missing}`);
console.log('No route, form action, field name, EJS variable, or JavaScript logic was modified.');
