import Badge from "./Badge";
import { ksh } from "@/lib/chama";

export default function MemberList({ members, hasCycle }) {
  if (members.length === 0) return null;

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">This cycle</th>
              <th className="px-4 py-3">Total ever</th>
              <th className="px-4 py-3">Fines</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr
                key={m.user_id}
                className={m.late && hasCycle ? "bg-red-50/60" : ""}
              >
                <td className="px-4 py-3 font-medium text-slate-800">
                  {m.name}
                </td>
                <td className="px-4 py-3">
                  {hasCycle ? (
                    <Badge tone={m.late ? "missing" : "ok"}>
                      {m.late ? "MISSING" : "OK"}
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {ksh(m.cycleContribution)}{" "}
                  <span className="text-slate-400">
                    / {ksh(m.memberExpected)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {ksh(m.totalEver)}
                </td>
                <td
                  className={`px-4 py-3 ${
                    m.memberFines > 0
                      ? "font-medium text-red-600"
                      : "text-slate-700"
                  }`}
                >
                  {ksh(m.memberFines)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 sm:hidden">
        {members.map((m) => (
          <li
            key={m.user_id}
            className={`rounded-2xl border bg-white p-4 shadow-sm ${
              m.late && hasCycle ? "border-red-200 bg-red-50/60" : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">{m.name}</span>
              {hasCycle && (
                <Badge tone={m.late ? "missing" : "ok"}>
                  {m.late ? "MISSING" : "OK"}
                </Badge>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <dt className="text-slate-400">This cycle</dt>
                <dd>
                  {ksh(m.cycleContribution)} / {ksh(m.memberExpected)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Total ever</dt>
                <dd>{ksh(m.totalEver)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Fines</dt>
                <dd className={m.memberFines > 0 ? "text-red-600" : ""}>
                  {ksh(m.memberFines)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
