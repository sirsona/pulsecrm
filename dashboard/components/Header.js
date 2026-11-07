import Link from "next/link";
import { getSessionUserId } from "@/lib/auth";

export default async function Header() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-8">
        <Link href="/treasurer" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white">
            CT
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight text-slate-900">
              Chama Treasurer
            </span>
            <span className="block text-xs text-slate-500">
              Savings dashboard
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/crm"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            CRM
          </Link>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
