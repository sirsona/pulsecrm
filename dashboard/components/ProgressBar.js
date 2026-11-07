export default function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const tone =
    pct >= 100
      ? "bg-emerald-500"
      : pct >= 50
        ? "bg-emerald-400"
        : "bg-amber-400";

  return (
    <div className="mt-3">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full transition-all ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-slate-500">{pct}% of expected</div>
    </div>
  );
}
