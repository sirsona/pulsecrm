import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { ksh } from "@/lib/chama";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";

export default async function HistoryPage({ params }) {
  const { chamaId } = await params;
  const chatId = parseInt(chamaId, 10);

  const userId = await getSessionUserId();
  if (!userId) redirect("/treasurer/login");

  const { rows: chamaRows } = await query(
    `SELECT * FROM chamas WHERE chat_id = $1 AND treasurer_user_id = $2`,
    [chatId, userId],
  );
  const chama = chamaRows[0];
  if (!chama) redirect("/treasurer");

  const { rows: cycles } = await query(
    `SELECT * FROM cycles
     WHERE chama_id = $1 AND status <> 'open'
     ORDER BY period_start DESC`,
    [chatId],
  );

  const rows = [];
  for (const c of cycles) {
    const collected = (
      await query(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS total
         FROM contributions WHERE cycle_id = $1 AND status = 'confirmed'`,
        [c.id],
      )
    ).rows[0].total;

    const fines = (
      await query(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS total,
                COUNT(*)::int AS count
         FROM fines WHERE cycle_id = $1`,
        [c.id],
      )
    ).rows[0];

    rows.push({
      ...c,
      collected,
      finesTotal: fines.total,
      finesCount: fines.count,
    });
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <Link
        href={`/treasurer/${chatId}`}
        className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        ← {chama.name}
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-slate-900">Cycle history</h1>
      <p className="mt-1 text-sm text-slate-500">
        Closed cycles for {chama.name}.
      </p>

      {rows.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No closed cycles yet"
            hint="Cycles appear here after they are closed."
          />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expected</th>
                <th className="px-4 py-3">Collected</th>
                <th className="px-4 py-3">Fines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-slate-700">
                    {new Date(c.period_start).toLocaleDateString("en-KE")} →{" "}
                    {new Date(c.period_end).toLocaleDateString("en-KE")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={c.status === "cancelled" ? "cancelled" : "closed"}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {ksh(c.expected_total_cents)}
                  </td>
                  <td className="px-4 py-3 font-medium text-emerald-700">
                    {ksh(c.collected)}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      c.finesTotal > 0 ? "text-red-600" : "text-slate-700"
                    }`}
                  >
                    {c.finesCount} ({ksh(c.finesTotal)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
