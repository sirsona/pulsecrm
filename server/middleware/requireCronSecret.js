// server/middleware/requireCronSecret.js
//
// Guards the external cron trigger endpoint. Accepts either the shared
// X-Cron-Secret header (for external schedulers: OS cron, GitHub Actions,
// systemd timers, ...) or a normal admin JWT.
const crypto = require("crypto");
const env = require("../config/env");
const requireAuth = require("./requireAuth");
const requireRole = require("./requireRole");

function secretMatches(req) {
  const provided = req.headers["x-cron-secret"] || "";
  const expected = env.CRON_SECRET || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = function requireAuthOrCronSecret(req, res, next) {
  if (secretMatches(req)) return next();

  requireAuth(req, res, (err) => {
    if (err) return next(err);
    requireRole("admin")(req, res, next);
  });
};
