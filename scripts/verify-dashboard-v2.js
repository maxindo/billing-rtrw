#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failed = 0;

function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

check('dashboard V2 CSS exists', fs.existsSync(path.join(root, 'public/css/customer-dashboard-v2.css')));
check('dashboard V2 JS exists', fs.existsSync(path.join(root, 'public/js/customer-dashboard-v2.js')));
check('dashboard V2 injector exists', fs.existsSync(path.join(root, 'scripts/apply-dashboard-v2.js')));

const dash = read('views/dashboard.ejs');
check('dashboard body V2 class', dash.includes('<body class="customer-dashboard-v2">'));
check('dashboard shell class', dash.includes('container mt-4 dashboard-shell'));
check('dashboard V2 stylesheet mounted', dash.includes('/css/customer-dashboard-v2.css'));
check('dashboard V2 script mounted', dash.includes('/js/customer-dashboard-v2.js'));

check('payment modal hook preserved', dash.includes('openPaymentModal('));
check('SSID hook preserved', dash.includes('editSsid('));
check('password hook preserved', dash.includes('editPassword('));
check('reboot hook preserved', dash.includes('rebootDevice('));
check('ticket modal preserved', dash.includes('id="ticketModal"'));
check('billing section preserved', dash.includes('id="billing-section"'));
check('ticket section preserved', dash.includes('id="ticket-section"'));
check('traffic API preserved', dash.includes('/customer/api/pppoe-traffic'));
check('ONU poll preserved', dash.includes('/customer/poll-onu'));
check('logout route preserved', dash.includes('action="/customer/logout"'));

const nav = read('views/partials/customer_bottom_nav.ejs');
check('bottom nav Emerald palette', nav.includes('#34d399') && nav.includes('rgba(3, 20, 13, 0.96)'));
check('bottom nav billing link preserved', nav.includes('/customer/dashboard#billing-section'));
check('bottom nav ticket action preserved', nav.includes('triggerTicketNav()'));

console.log(`\nDashboard V2 verification: ${failed} failed`);
process.exit(failed ? 1 : 0);
