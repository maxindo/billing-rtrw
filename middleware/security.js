const crypto = require('crypto');
const helmet = require('helmet');
const { logger } = require('../config/logger');

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 15552000, includeSubDomains: true, preload: false }
      : false
  });
}

function getOrCreateCsrfToken(req) {
  if (!req.session) return '';
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (!aa.length || aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function isAuthenticatedBrowserSession(req) {
  const s = req.session || {};
  return Boolean(
    s.isAdmin || s.isCashier || s.isCollector || s.isTechnician ||
    s.isAgent || s.customerId || s.isCustomer
  );
}

function isCsrfExemptPath(pathname) {
  const p = String(pathname || '');
  return (
    p.startsWith('/api/webhook') ||
    p.startsWith('/webhook') ||
    p.startsWith('/acs') ||
    p === '/customer/payment/callback' ||
    p.startsWith('/api/payment/callback') ||
    p.startsWith('/payment/callback')
  );
}

function originMatchesHost(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!host) return false;

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  try {
    if (origin) return new URL(origin).host.toLowerCase() === host;
    if (referer) return new URL(referer).host.toLowerCase() === host;
  } catch {
    return false;
  }

  return false;
}

function csrfProtection(req, res, next) {
  const token = getOrCreateCsrfToken(req);
  res.locals.csrfToken = token;

  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  if (isCsrfExemptPath(req.path)) return next();

  const supplied =
    req.headers['x-csrf-token'] ||
    req.body?._csrf ||
    req.query?._csrf;

  if (supplied && safeEqual(supplied, token)) return next();

  // Backward-compatible protection for existing EJS forms. Authenticated
  // browser sessions must at least prove same-origin if a token is absent.
  if (originMatchesHost(req)) return next();

  if (!isAuthenticatedBrowserSession(req)) {
    // Public non-authenticated endpoints may rely on their own auth/signature.
    // Keep compatibility during Phase 2A; sensitive callbacks are explicitly
    // exempted above and should validate gateway signatures separately.
    return next();
  }

  logger.warn(`[CSRF] blocked ${req.method} ${req.originalUrl || req.url} from ip=${req.ip}`);
  return res.status(403).json({
    error: 'Forbidden - CSRF validation failed'
  });
}

module.exports = {
  securityHeaders,
  csrfProtection,
  getOrCreateCsrfToken,
  safeEqual,
  isCsrfExemptPath
};
