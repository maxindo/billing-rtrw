function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session || typeof req.session.regenerate !== 'function') {
      return reject(new Error('Session middleware tidak tersedia'));
    }
    req.session.regenerate((err) => {
      if (err) return reject(err);
      resolve(req.session);
    });
  });
}

async function establishSession(req, values = {}) {
  const session = await regenerateSession(req);
  for (const [key, value] of Object.entries(values)) {
    session[key] = value;
  }
  return session;
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session || typeof req.session.destroy !== 'function') return resolve();
    req.session.destroy(() => resolve());
  });
}

module.exports = {
  regenerateSession,
  establishSession,
  destroySession
};
