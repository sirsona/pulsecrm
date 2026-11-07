import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { ksh } from "@/lib/chama";
import ProgressBar from "@/components/ProgressBar";
import EmptyState from "@/components/EmptyState";

export default async function TreasurerPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/treasurer/login");

  const { rows: chamas } = await query(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM chama_members m
             WHERE m.chama_id = c.chat_id AND m.left_at IS NULL) AS members,
            (SELECT COALESCE(SUM(x.amount_cents), 0)::int
             FROM contributions x
             JOIN cycles cy ON cy.id = x.cycle_id
             WHERE cy.chama_id = c.chat_id AND cy.status = 'open'
               AND x.status = 'confirmed') AS collected,
            (SELECT cy2.expected_total_cents FROM cycles cy2
             WHERE cy2.chama_id = c.chat_id AND cy2.status = 'open'
             LIMIT 1) AS expected
     FROM chamas c
     WHERE c.treasurer_user_id = $1
     ORDER BY c.name`,
    [userId],
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold text-slate-900">Your chamas</h1>
      <p className="mt-1 text-sm text-slate-500">
        Track contributions, fines and cycles at a glance.
      </p>

      {chamas.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No chamas found for your account"
            hint="Run /setup inside your chama group to get started."
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {chamas.map((c) => (
          <Link
            key={c.chat_id}
            href={`/treasurer/${c.chat_id}`}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-sm font-bold text-emerald-700">
                  {c.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div>
                  <div className="font-semibold text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {ksh(c.monthly_amount_cents)} per cycle · day {c.cycle_day}
                  </div>
                </div>
              </div>
              <span className="text-slate-300 transition group-hover:text-emerald-500">
                →
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span>
                {c.members} {c.members === 1 ? "member" : "members"}
              </span>
              <span>
                {ksh(c.collected || 0)} / {ksh(c.expected || 0)}
              </span>
            </div>
            <ProgressBar value={c.collected || 0} max={c.expected || 0} />
          </Link>
        ))}
      </div>
    </main>
  );
}
