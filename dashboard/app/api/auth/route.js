import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One-time dashboard login: the bot DMs a link with ?token=... here; we verify
// the session, mark it used, set the HttpOnly cookie and redirect.
//
// Redirects use RELATIVE Location headers on purpose: behind a tunnel the
// request URL resolves to the internal host (localhost:3001), which would send
// the browser to the wrong origin.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token || !UUID_RE.test(token)) {
    return relativeRedirect("/treasurer/login", 303);
  }

  const { rows } = await query(
    `SELECT user_id FROM dashboard_sessions
     WHERE token = $1 AND expires_at > NOW()`,
    [token],
  );

  if (rows.length === 0) {
    return relativeRedirect("/treasurer/login?error=expired", 307);
  }

  await query(
    `UPDATE dashboard_sessions SET used_at = NOW()
     WHERE token = $1 AND used_at IS NULL`,
    [token],
  );

  const response = relativeRedirect("/treasurer", 307);
  response.cookies.set("treasurer_token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 3600,
    path: "/",
  });
  return response;
}

function relativeRedirect(location, status) {
  return new NextResponse(null, { status, headers: { Location: location } });
}
