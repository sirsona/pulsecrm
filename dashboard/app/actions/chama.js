"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

// Closes the chama's open cycle by calling the Express internal endpoint
// (single source of truth for cycle-close logic).
export async function closeCurrentCycle(chamaId) {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  const { rows } = await query(
    `SELECT 1 FROM chamas WHERE chat_id = $1 AND treasurer_user_id = $2`,
    [chamaId, userId],
  );
  if (rows.length === 0) {
    throw new Error("Only the treasurer can close this cycle");
  }

  const res = await fetch(
    `${process.env.EXPRESS_URL}/api/chama/${chamaId}/close-cycle`,
    {
      method: "POST",
      headers: { "X-Internal-Secret": process.env.INTERNAL_API_SECRET },
    },
  );

  if (!res.ok) {
    throw new Error(`Close failed (HTTP ${res.status})`);
  }

  revalidatePath(`/treasurer/${chamaId}`);
}
