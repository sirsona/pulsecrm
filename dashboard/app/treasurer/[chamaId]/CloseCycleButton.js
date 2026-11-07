"use client";

import { useState } from "react";
import { closeCurrentCycle } from "@/app/actions/chama";

export default function CloseCycleButton({ chamaId }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    if (!confirm("Close the current cycle now? Fines will be applied.")) return;

    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await closeCurrentCycle(chamaId);
      setMessage("Cycle closed. The group has been notified.");
    } catch (err) {
      setFailed(true);
      setMessage(`Failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-slate-900">Close this cycle</div>
          <p className="text-xs text-slate-500">
            Computes fines, opens the next cycle and posts the summary.
          </p>
        </div>
        <button
          onClick={handleClick}
          disabled={busy}
          className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Closing..." : "Close cycle manually"}
        </button>
      </div>
      {message && (
        <p
          className={`mt-3 text-sm ${failed ? "text-red-600" : "text-emerald-700"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
