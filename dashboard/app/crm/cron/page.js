"use client";

import { getCronJobs, getCronRuns, triggerCronJob } from "@/lib/crmApi";
import { useEffect, useState } from "react";

export default function CronPage() {
  const [data, setData] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);

  async function load() {
    const [runsData, jobsData] = await Promise.all([
      getCronRuns(),
      getCronJobs(),
    ]);
    setData(runsData);
    setJobs(jobsData.jobs);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function handleRun(name) {
    setRunning(name);
    setResult(null);
    try {
      await triggerCronJob(name);
      setResult(`Triggered ${name}`);
      await load();
    } catch (err) {
      setResult(`Failed: ${err.message}`);
    } finally {
      setRunning(null);
    }
  }

  if (error) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-red-600">{error}</p>;
  }
  if (!data) {
    return (
      <p className="mx-auto max-w-4xl px-4 py-8 text-sm text-slate-500">
        Loading...
      </p>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Cron Jobs
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Scheduled retention, reporting, and health checks.
      </p>

      <section className="mt-8">
        <h2 className="font-semibold text-slate-900">Jobs</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Timezone</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.name}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {job.name}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                      {job.schedule}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{job.timezone}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleRun(job.name)}
                      disabled={running !== null}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {running === job.name ? "Running..." : "Run now"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result && <p className="mt-3 text-sm text-slate-700">{result}</p>}
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-slate-900">Last 24h summary</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Runs</th>
                <th className="px-4 py-3">Success</th>
                <th className="px-4 py-3">Last run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.summaries.map((summary) => (
                <tr key={summary.job_name}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {summary.job_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{summary.runs}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {summary.successes}/{summary.runs}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {summary.last_run
                      ? new Date(summary.last_run).toLocaleString("en-KE")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-slate-900">Recent runs</h2>
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white text-xs">
          {data.runs.map((run) => (
            <li
              key={run.id}
              className={`px-4 py-2 ${
                run.status === "failed" ? "text-red-600" : "text-slate-600"
              }`}
            >
              {new Date(run.started_at).toLocaleString("en-KE")} — {run.job_name}{" "}
              — {run.status} — {run.duration_ms}ms
              {run.error_message && ` — ${run.error_message}`}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
