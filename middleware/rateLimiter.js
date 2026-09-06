let loginRateLimiter;

try {
  const rateLimit = require('express-rate-limit');

  loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    handler: (req, res) => {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(429).json({
          ok: false,
          error: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.'
        });
      }

      return res.status(429).send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Akses Dibatasi | Keamanan Portal</title>
          <style>
            body { display:flex; align-items:center; justify-content:center; min-height:100vh; background:#0f172a; color:#f8fafc; font-family:system-ui, -apple-system, sans-serif; margin:0; }
            .card-limit { background:#1e293b; padding:32px; border-radius:12px; border:1px solid #334155; text-align:center; max-width:420px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.5); }
            .card-limit h3 { color:#ef4444; margin-top:0; margin-bottom:12px; font-size:20px; }
            .card-limit p { color:#94a3b8; font-size:14px; line-height:1.5; margin-bottom:24px; }
            .btn-back { display:inline-block; padding:10px 20px; background:#3b82f6; color:#fff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:600; }
          </style>
        </head>
        <body>
          <div class="card-limit">
            <h3>🚫 Terlalu Banyak Percobaan Login</h3>
            <p>Sistem keamanan mendeteksi terlalu banyak percobaan login dari alamat IP Anda. Login dibatasi sementara selama 15 menit.</p>
            <a href="javascript:history.back()" class="btn-back">Kembali</a>
          </div>
        </body>
        </html>
      `);
    }
  });
} catch (error) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`express-rate-limit gagal dimuat di production: ${error.message}`);
  }

  console.warn(`[security] express-rate-limit tidak tersedia; limiter dinonaktifkan hanya untuk development: ${error.message}`);
  loginRateLimiter = (req, res, next) => next();
}

module.exports = {
  loginRateLimiter
};
