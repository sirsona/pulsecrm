const ACCENTS = {
  emerald: "text-emerald-700",
  slate: "text-slate-900",
  red: "text-red-600",
};

export default function StatCard({ label, value, sub, accent = "slate" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-xl font-semibold ${ACCENTS[accent] || ACCENTS.slate}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
