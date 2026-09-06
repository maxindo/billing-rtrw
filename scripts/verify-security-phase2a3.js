#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function check(label, ok) {
  if (ok) console.log(`PASS  ${label}`);
  else {
    failed += 1;
    console.error(`FAIL  ${label}`);
  }
}

const syntaxFiles = [
  'middleware/security.js',
  'middleware/rateLimiter.js',
  'utils/sessionAuth.js',
  'app-customer.js',
  'routes/adminPortal.js',
  'routes/techPortal.js',
  'routes/agentPortal.js',
  'routes/collectorPortal.js'
];

for (const rel of syntaxFiles) {
  const r = spawnSync(process.execPath, ['--check', path.join(root, rel)], { encoding: 'utf8' });
  check(`syntax ${rel}`, r.status === 0);
  if (r.status !== 0 && r.stderr) console.error(r.stderr.trim());
}

const pkg = JSON.parse(read('package.json'));
check('helmet dependency', Boolean(pkg.dependencies?.helmet));

const app = read('app-customer.js');
check('Helmet mounted', app.includes('app.use(securityHeaders());'));
check('CSRF middleware mounted', app.includes('app.use(csrfProtection);'));
check('no public session fallback', !app.includes('rahasia-portal-pelanggan-default-ganti-ini'));
check('production SESSION_SECRET validation', app.includes('SESSION_SECRET wajib diisi minimal 32 karakter'));
check('rolling session', app.includes('rolling: true'));
check('secure cookie name', app.includes("name: 'billing.sid'"));
check('trust proxy can be disabled', app.includes("app.set('trust proxy', trustProxyEnabled ? 1 : false)"));
check('fatal exceptions exit for process manager restart', app.includes("process.exit(1)"));
check('legacy CSRF block removed', !app.includes('Middleware Proteksi CSRF berbasis Referer/Origin'));

const limiter = read('middleware/rateLimiter.js');
check('rate limiter production fail-closed', limiter.includes("process.env.NODE_ENV === 'production'") && limiter.includes('throw new Error'));

for (const rel of ['routes/techPortal.js', 'routes/agentPortal.js', 'routes/collectorPortal.js']) {
  const src = read(rel);
  check(`${rel} direct limiter import`, src.includes("const { loginRateLimiter } = require('../middleware/rateLimiter');"));
  check(`${rel} session regeneration`, src.includes('await establishSession(req'));
  check(`${rel} no swallowed limiter import error`, !src.includes('let loginRateLimiter = (req, res, next) => next();'));
}

const admin = read('routes/adminPortal.js');
check('admin session regeneration', admin.includes('await establishSession(req'));

const security = read('middleware/security.js');
check('CSRF token generated with cryptographic RNG', security.includes('crypto.randomBytes(32)'));
check('CSRF constant-time comparison', security.includes('crypto.timingSafeEqual'));
check('payment/webhook exemptions explicit', security.includes("p.startsWith('/api/webhook')") && security.includes("p.startsWith('/acs')"));

console.log(`\n${failed} failed`);
process.exit(failed ? 1 : 0);
