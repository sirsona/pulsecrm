// server/cron/registry.js
const cron = require("node-cron");
const { query: dbQuery } = require("../config/db");
const tasks = require("./tasks");
const outboxTasks = require("./tasks/outbox");
const chamaCycleTasks = require("./tasks/chamaCycles");
const { withRetry } = require("./retry");
const { runWithLock } = require("./locks");

const jobs = [
  {
    name: "reconciliation",
    schedule: "0 2 * * *",
    timezone: "Africa/Nairobi",
    run: tasks.runReconciliation,
  },
  {
    name: "cleanup-sessions",
    schedule: "0 3 * * *",
    timezone: "Africa/Nairobi",
    run: tasks.cleanupSessions,
  },
  {
    name: "daily-report",
    schedule: "0 8 * * *",
    timezone: "Africa/Nairobi",
    run: tasks.sendDailyReport,
  },
  {
    name: "overdue-reminders",
    schedule: "0 18 * * *",
    timezone: "Africa/Nairobi",
    run: tasks.sendOverdueReminders,
  },
  {
    name: "health-ping",
    schedule: "*/5 * * * *",
    timezone: "Africa/Nairobi",
    run: tasks.healthPing,
  },
  {
    name: "check-job-health",
    schedule: "*/15 * * * *",
    timezone: "Africa/Nairobi",
    run: tasks.checkJobHealth,
  },
  {
    name: "outbox-dispatch",
    schedule: "* * * * *",
    timezone: "Africa/Nairobi",
    run: outboxTasks.dispatchOutbox,
  },
  {
    name: "chama-cycles",
    schedule: "30 0 * * *",
    timezone: "Africa/Nairobi",
    run: chamaCycleTasks.processCycles,
  },
  {
    name: "chama-reminders",
    schedule: "0 18 * * *",
    timezone: "Africa/Nairobi",
    run: chamaCycleTasks.sendCycleReminders,
  },
];

const runningTasks = new Set();

async function runJobWithLogging(job) {
  const { rows } = await dbQuery(
    `INSERT INTO cron_runs (job_name, status) VALUES ($1, 'running') RETURNING id`,
    [job.name],
  );
  const runId = rows[0].id;
  const start = Date.now();

  try {
    await job.run();
    await dbQuery(
      `UPDATE cron_runs SET finished_at = NOW(), status = 'success', duration_ms = $1 WHERE id = $2`,
      [Date.now() - start, runId],
    );
  } catch (err) {
    await dbQuery(
      `UPDATE cron_runs SET finished_at = NOW(), status = 'failed', error_message = $1, duration_ms = $2 WHERE id = $3`,
      [err.message, Date.now() - start, runId],
    );
    throw err;
  }
}

function startAll() {
  for (const job of jobs) {
    cron.schedule(
      job.schedule,
      () => {
        console.log(`[cron] ${job.name} starting`);
        const start = Date.now();
        const taskPromise = runWithLock(job.name, () =>
          withRetry(() => runJobWithLogging(job)),
        )
          .then((result) => {
            if (result?.skipped) return;
            console.log(
              `[cron] ${job.name} finished in ${Date.now() - start}ms`,
            );
          })
          .catch((err) => {
            console.error(`[cron] ${job.name} failed:`, err);
          })
          .finally(() => runningTasks.delete(taskPromise));

        runningTasks.add(taskPromise);
      },
      { timezone: job.timezone },
    );
  }
}

async function drain(timeoutMs = 30000) {
  if (runningTasks.size === 0) return;
  await Promise.race([
    Promise.allSettled([...runningTasks]),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

module.exports = { startAll, jobs, runJobWithLogging, runningTasks, drain };
