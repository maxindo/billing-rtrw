#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content, 'utf8');
  console.log(`patched: ${rel}`);
}

function mustReplace(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) {
    throw new Error(`Target patch tidak ditemukan: ${label}`);
  }
  return content.replace(search, replacement);
}

function patchApp() {
  const rel = 'app-customer.js';
  let s = read(rel);

  s = mustReplace(
    s,
    "const session = require('express-session');",
    "const session = require('express-session');\nconst { securityHeaders, csrfProtection } = require('./middleware/security');",
    'security middleware import'
  );

  const oldCrash = `// Handle unhandled promise rejections to prevent silent crashes\nprocess.on('unhandledRejection', (reason, promise) => {\n  const errorMsg = reason instanceof Error ? reason.stack : JSON.stringify(reason);\n  logger.error(\`Unhandled Rejection: \${errorMsg}\`);\n});\n\n// Handle uncaught exceptions to prevent server crashes from external service failures\n// (e.g. ros-client throws uncaught errors when MikroTik router is unreachable)\nprocess.on('uncaughtException', (err) => {\n  const errorMsg = err instanceof Error ? err.stack : String(err);\n  logger.error(\`uncaughtException: \${errorMsg}\`);\n  // Don't exit process — keep server running despite transient connection errors\n});`;

  const newCrash = `let fatalExitScheduled = false;\nfunction scheduleFatalExit(kind, error) {\n  const errorMsg = error instanceof Error ? error.stack : String(error);\n  logger.error(\`\${kind}: \${errorMsg}\`);\n  if (fatalExitScheduled) return;\n  fatalExitScheduled = true;\n  setTimeout(() => process.exit(1), 750).unref();\n}\n\nprocess.on('unhandledRejection', (reason) => {\n  scheduleFatalExit('Unhandled Rejection', reason);\n});\n\nprocess.on('uncaughtException', (err) => {\n  scheduleFatalExit('uncaughtException', err);\n});`;

  if (!s.includes('scheduleFatalExit')) {
    if (!s.includes(oldCrash)) throw new Error('Target patch tidak ditemukan: fatal handlers');
    s = s.replace(oldCrash, newCrash);
  }

  const oldProxy = `const trustProxySetting = getSetting('trust_proxy', true);\napp.set('trust proxy', trustProxySetting ? 1 : true);`;
  const newProxy = `const trustProxySetting = getSetting('trust_proxy', isProduction);\nconst trustProxyEnabled = trustProxySetting === true || trustProxySetting === 1 || String(trustProxySetting).toLowerCase() === 'true' || String(trustProxySetting) === '1';\napp.set('trust proxy', trustProxyEnabled ? 1 : false);`;
  s = mustReplace(s, oldProxy, newProxy, 'trust proxy');

  const oldSession = `app.use(session({\n  secret: getSetting('session_secret', 'rahasia-portal-pelanggan-default-ganti-ini'),\n  resave: false,\n  saveUninitialized: false,\n  cookie: {\n    secure: Boolean(cookieSecure),\n    httpOnly: true,\n    sameSite: 'lax',\n    maxAge: 24 * 60 * 60 * 1000,\n    path: '/'\n  },\n  name: 'customer.sid'\n}));`;

  const newSession = `const configuredSessionSecret = String(process.env.SESSION_SECRET || getSetting('session_secret', '') || '');\nif (isProduction && configuredSessionSecret.length < 32) {\n  throw new Error('SESSION_SECRET wajib diisi minimal 32 karakter pada production');\n}\nconst sessionSecret = configuredSessionSecret || crypto.randomBytes(32).toString('hex');\nif (!isProduction && !configuredSessionSecret) {\n  logger.warn('[security] SESSION_SECRET belum diatur; menggunakan secret ephemeral untuk development');\n}\n\napp.use(session({\n  secret: sessionSecret,\n  resave: false,\n  saveUninitialized: false,\n  rolling: true,\n  cookie: {\n    secure: Boolean(cookieSecure),\n    httpOnly: true,\n    sameSite: 'lax',\n    maxAge: 12 * 60 * 60 * 1000,\n    path: '/'\n  },\n  name: 'billing.sid'\n}));`;
  s = mustReplace(s, oldSession, newSession, 'session config');

  const csrfStart = '// Middleware Proteksi CSRF berbasis Referer/Origin (Aman untuk production tanpa merubah EJS)';
  const csrfEnd = '// i18n middleware (aman: hanya teks UI, tidak mengubah logic fitur)';
  if (!s.includes('app.use(securityHeaders());')) {
    const start = s.indexOf(csrfStart);
    const end = s.indexOf(csrfEnd);
    if (start === -1 || end === -1 || end <= start) throw new Error('Target patch tidak ditemukan: CSRF block');
    s = s.slice(0, start) + `app.use(securityHeaders());\napp.use(csrfProtection);\n\n` + s.slice(end);
  }

  write(rel, s);
}

function patchPortal(rel, role, fields, redirectPath) {
  let s = read(rel);

  if (!s.includes("require('../utils/sessionAuth')")) {
    const marker = "const router = express.Router();";
    s = mustReplace(
      s,
      marker,
      `${marker}\nconst { establishSession } = require('../utils/sessionAuth');`,
      `${rel} session helper import`
    );
  }

  const postMarker = "router.post('/login', loginRateLimiter, express.urlencoded({ extended: true }), (req, res) => {";
  if (s.includes(postMarker)) {
    s = s.replace(postMarker, "router.post('/login', loginRateLimiter, express.urlencoded({ extended: true }), async (req, res) => {");
  }

  const roleStart = fields.start;
  const roleEnd = fields.end;
  if (!s.includes('await establishSession(req')) {
    if (!s.includes(roleStart) || !s.includes(roleEnd)) {
      throw new Error(`Target session assignment tidak ditemukan: ${rel}`);
    }
    const start = s.indexOf(roleStart);
    const end = s.indexOf(roleEnd, start) + roleEnd.length;
    const replacement = fields.replacement;
    s = s.slice(0, start) + replacement + s.slice(end);
  }

  write(rel, s);
}

function patchTech() {
  patchPortal('routes/techPortal.js', 'tech', {
    start: "    req.session.isTechnician = true;",
    end: "    return res.redirect('/tech');",
    replacement: `    await establishSession(req, {\n      isTechnician: true,\n      techId: tech.id,\n      techName: tech.name\n    });\n    return res.redirect('/tech');`
  });
}

function patchAgent() {
  patchPortal('routes/agentPortal.js', 'agent', {
    start: "    req.session.isAgent = true;",
    end: "    return res.redirect('/agent');",
    replacement: `    await establishSession(req, {\n      isAgent: true,\n      agentId: agent.id,\n      agentName: agent.name\n    });\n    return res.redirect('/agent');`
  });
}

function patchCollector() {
  patchPortal('routes/collectorPortal.js', 'collector', {
    start: "    req.session.isCollector = true;",
    end: "    return res.redirect('/collector');",
    replacement: `    await establishSession(req, {\n      isCollector: true,\n      collectorId: collector.id,\n      collectorName: collector.name,\n      collectorUsername: collector.username,\n      collectorArea: collector.area || ''\n    });\n    return res.redirect('/collector');`
  });
}

function patchAdmin() {
  const rel = 'routes/adminPortal.js';
  let s = read(rel);

  if (!s.includes("require('../utils/sessionAuth')")) {
    const marker = "const router = express.Router();";
    s = mustReplace(
      s,
      marker,
      `${marker}\nconst { establishSession } = require('../utils/sessionAuth');`,
      'admin session helper import'
    );
  }

  s = s.replace(
    "router.post('/login', loginRateLimiter, express.urlencoded({ extended: true }), (req, res) => {",
    "router.post('/login', loginRateLimiter, express.urlencoded({ extended: true }), async (req, res) => {"
  );

  if (!s.includes("await establishSession(req, { isAdmin: true")) {
    s = s.replace(
      /req\.session\.isAdmin = true;\s*req\.session\.adminUser = username;\s*return res\.redirect\('\/admin'\);/,
      "await establishSession(req, { isAdmin: true, adminUser: username });\n    return res.redirect('/admin');"
    );
  }

  if (!s.includes("await establishSession(req, {\n      isCashier: true")) {
    s = s.replace(
      /req\.session\.isCashier = true;\s*req\.session\.cashierId = cashier\.id;\s*req\.session\.cashierName = cashier\.name;\s*req\.session\.cashierUsername = cashier\.username;\s*return res\.redirect\('\/admin'\);/,
      "await establishSession(req, {\n      isCashier: true,\n      cashierId: cashier.id,\n      cashierName: cashier.name,\n      cashierUsername: cashier.username\n    });\n    return res.redirect('/admin');"
    );
  }

  write(rel, s);
}

patchApp();
patchTech();
patchAgent();
patchCollector();
patchAdmin();
console.log('\nPhase 2A.3 patches completed.');
