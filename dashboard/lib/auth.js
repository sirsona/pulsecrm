import { cookies } from "next/headers";
import { query } from "./db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolves the treasurer user id from the HttpOnly session cookie.
// Returns null when there is no valid, unexpired session.
export async function getSessionUserId() {
  const store = await cookies();
  const token = store.get("treasurer_token")?.value;
  if (!token || !UUID_RE.test(token)) return null;

  const { rows } = await query(
    `SELECT user_id FROM dashboard_sessions
     WHERE token = $1 AND expires_at > NOW()`,
    [token],
  );
  return rows.length > 0 ? rows[0].user_id : null;
}
