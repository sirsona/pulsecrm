const STYLES = {
  open: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-amber-50 text-amber-700 ring-amber-200",
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  missing: "bg-red-50 text-red-600 ring-red-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  unpaid: "bg-red-50 text-red-600 ring-red-200",
};

export default function Badge({ tone = "closed", children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[tone] || STYLES.closed}`}
    >
      {children}
    </span>
  );
}
