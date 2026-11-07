"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function navClass(active) {
  return active
    ? "rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
    : "rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";
}

export default function CrmLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  function signOut() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.replace("/login");
  }

  if (!ready) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16 text-sm text-slate-500">
        Loading…
      </main>
    );
  }

  const links = [
    { href: "/crm", label: "Leads", exact: true },
    ...(user?.role === "admin"
      ? [
          { href: "/crm/broadcast", label: "Broadcast" },
          { href: "/crm/cron", label: "Cron" },
        ]
      : []),
    { href: "/treasurer", label: "Treasurer" },
  ];

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/crm" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">
              PC
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              PulseCRM
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1">
            {links.map((link) => {
              const active = link.exact
                ? pathname === link.href
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={navClass(active)}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {user?.name && (
              <span className="text-xs text-slate-500">{user.name}</span>
            )}
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
