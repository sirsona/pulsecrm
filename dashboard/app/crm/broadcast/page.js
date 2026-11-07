"use client";

import { sendBroadcast } from "@/lib/crmApi";
import { useState } from "react";

export default function BroadcastPage() {
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (confirm !== "SEND") {
      setError("Type SEND to confirm.");
      return;
    }
    setSending(true);
    try {
      const data = await sendBroadcast(text);
      setResult(`Sent: ${data.sent}, failed: ${data.failed}`);
      setText("");
      setConfirm("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Telegram Broadcast
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Send one message to every group the bot belongs to.
      </p>

      <form onSubmit={handleSend} className="mt-6 space-y-4">
        <textarea
          rows={6}
          className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Message to every group the bot is in..."
          aria-label="Broadcast message"
        />
        <input
          className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder='Type "SEND" to confirm'
          aria-label="Type SEND to confirm"
        />
        <button
          type="submit"
          disabled={sending || text.length < 3}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {sending ? "Sending..." : "Broadcast"}
        </button>
        {result && <p className="text-sm text-emerald-700">{result}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
