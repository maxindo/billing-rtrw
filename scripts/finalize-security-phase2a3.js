#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'routes/techPortal.js',
  'routes/agentPortal.js',
  'routes/collectorPortal.js'
];

const legacy = `let loginRateLimiter = (req, res, next) => next();\ntry {\n  const rlMod = require('../middleware/rateLimiter');\n  if (rlMod && typeof rlMod.loginRateLimiter === 'function') {\n    loginRateLimiter = rlMod.loginRateLimiter;\n  }\n} catch (e) {}`;

const hardened = `const { loginRateLimiter } = require('../middleware/rateLimiter');`;

for (const rel of files) {
  const abs = path.join(root, rel);
  let src = fs.readFileSync(abs, 'utf8');
  if (src.includes(hardened)) {
    console.log(`ok: ${rel}`);
    continue;
  }
  if (!src.includes(legacy)) {
    throw new Error(`Blok rate limiter legacy tidak ditemukan di ${rel}`);
  }
  src = src.replace(legacy, hardened);
  fs.writeFileSync(abs, src, 'utf8');
  console.log(`patched: ${rel}`);
}

console.log('\nRate limiter imports hardened.');
