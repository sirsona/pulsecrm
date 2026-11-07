export default async function LoginPage({ searchParams }) {
  const params = await searchParams;

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-bold text-white">
          CT
        </div>

        <h1 className="mt-5 text-xl font-bold text-slate-900">
          Treasurer Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Passwordless login — your Telegram account is your identity.
        </p>

        {params?.error === "expired" && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            That login link has expired. Generate a new one with /dashboard.
          </div>
        )}

        <ol className="mt-6 space-y-4">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
              1
            </span>
            <span className="text-sm text-slate-700">
              Open your chama group in Telegram
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
              2
            </span>
            <span className="text-sm text-slate-700">
              Send{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                /dashboard
              </code>{" "}
              (treasurer only)
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
              3
            </span>
            <span className="text-sm text-slate-700">
              Tap the private link the bot sends you — it expires in 1 hour
            </span>
          </li>
        </ol>
      </div>
    </main>
  );
}
