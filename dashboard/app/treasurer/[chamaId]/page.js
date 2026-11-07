import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { expectedForMember, ksh } from "@/lib/chama";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import ProgressBar from "@/components/ProgressBar";
import MemberList from "@/components/MemberList";
import CloseCycleButton from "./CloseCycleButton";

export default async function ChamaPage({ params }) {
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

  const { rows: cycleRows } = await query(
    `SELECT * FROM cycles WHERE chama_id = $1 AND status = 'open' LIMIT 1`,
    [chatId],
  );
  const cycle = cycleRows[0];

  let collected = 0;
  let contributors = 0;
  const expected = cycle ? cycle.expected_total_cents : 0;

  if (cycle) {
    const { rows } = await query(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS total,
              COUNT(DISTINCT member_user_id)::int AS contributors
       FROM contributions WHERE cycle_id = $1 AND status = 'confirmed'`,
      [cycle.id],
    );
    collected = rows[0].total;
    contributors = rows[0].contributors;
  }

  const { rows: finesRows } = await query(
    `SELECT COALESCE(SUM(f.amount_cents), 0)::int AS total
     FROM fines f JOIN cycles c ON c.id = f.cycle_id
     WHERE c.chama_id = $1 AND f.paid = FALSE`,
    [chatId],
  );
  const outstandingFines = finesRows[0].total;

  const { rows: members } = await query(
    `SELECT * FROM chama_members
     WHERE chama_id = $1 AND left_at IS NULL
     ORDER BY joined_at`,
    [chatId],
  );

  const memberRows = [];
  for (const m of members) {
    const cycleContribution = cycle
      ? (
          await query(
            `SELECT COALESCE(SUM(amount_cents), 0)::int AS total
             FROM contributions
             WHERE cycle_id = $1 AND member_user_id = $2 AND status = 'confirmed'`,
            [cycle.id, m.user_id],
          )
        ).rows[0].total
      : 0;

    const totalEver = (
      await query(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS total
         FROM contributions
         WHERE chama_id = $1 AND member_user_id = $2 AND status = 'confirmed'`,
        [chatId, m.user_id],
      )
    ).rows[0].total;

    const memberFines = (
      await query(
        `SELECT COALESCE(SUM(f.amount_cents), 0)::int AS total
         FROM fines f JOIN cycles c ON c.id = f.cycle_id
         WHERE c.chama_id = $1 AND f.member_user_id = $2 AND f.paid = FALSE`,
        [chatId, m.user_id],
      )
    ).rows[0].total;

    const memberExpected = cycle
      ? expectedForMember(chama, cycle, m)
      : chama.monthly_amount_cents;

    memberRows.push({
      ...m,
      cycleContribution,
      totalEver,
      memberFines,
      memberExpected,
      late: cycleContribution < memberExpected,
    });
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <Link
        href="/treasurer"
        className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        ← All chamas
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{chama.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ksh(chama.monthly_amount_cents)} per cycle · day {chama.cycle_day} ·
            fines {Number(chama.fine_percent)}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cycle ? (
            <>
              <Badge tone="open">open</Badge>
              <span className="text-xs text-slate-500">
                {new Date(cycle.period_start).toLocaleDateString("en-KE")} →{" "}
                {new Date(cycle.period_end).toLocaleDateString("en-KE")}
              </span>
            </>
          ) : (
            <Badge tone="closed">no open cycle</Badge>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            This cycle
          </div>
          <div className="mt-2 text-xl font-semibold text-emerald-700">
            {ksh(collected)}{" "}
            <span className="text-sm font-normal text-slate-400">
              / {ksh(expected)}
            </span>
          </div>
          <ProgressBar value={collected} max={expected} />
        </div>
        <StatCard
          label="Members paid"
          value={`${contributors} / ${members.length}`}
          sub={members.length > 0 ? `${members.length - contributors} outstanding` : undefined}
        />
        <StatCard
          label="Outstanding fines"
          value={ksh(outstandingFines)}
          accent={outstandingFines > 0 ? "red" : "slate"}
        />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Members</h2>
        <Link
          href={`/treasurer/${chama.chat_id}/history`}
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          View cycle history →
        </Link>
      </div>

      <div className="mt-3">
        <MemberList members={memberRows} hasCycle={Boolean(cycle)} />
      </div>

      {cycle && <CloseCycleButton chamaId={chama.chat_id} />}
    </main>
  );
}
