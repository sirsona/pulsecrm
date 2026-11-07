// server/middleware/boardToken.js
//
// Bull Board sits behind requireAuth (Bearer JWT). A browser cannot send that
// header on navigation, so /admin/queues also accepts the JWT via ?token=:
//
//   1. First visit with ?token=<jwt> -> set a short-lived HttpOnly cookie and
//      redirect to the clean URL.
//   2. Later requests (including the board SPA's XHR calls) -> read the cookie
//      and translate it into the Authorization header requireAuth expects.
//
// The real guard (requireAuth + requireRole("admin")) still runs after this.
const COOKIE_NAME = "board_token";
const COOKIE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

module.exports = function boardToken(req, res, next) {
  const queryToken =
    typeof req.query.token === "string" ? req.query.token : null;

  if (queryToken) {
    res.cookie(COOKIE_NAME, queryToken, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/admin/queues",
    });

    const clean = new URL(req.originalUrl, "http://localhost");
    clean.searchParams.delete("token");
    return res.redirect(clean.pathname + clean.search);
  }

  if (!req.headers.authorization) {
    const cookieToken = readCookie(req.headers.cookie, COOKIE_NAME);
    if (cookieToken) {
      req.headers.authorization = `Bearer ${cookieToken}`;
    }
  }

  return next();
};
