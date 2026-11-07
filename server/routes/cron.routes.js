// server/routes/cron.routes.js
const express = require("express");
const router = express.Router();
const asyncHandler = require("../middleware/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const requireAuthOrCronSecret = require("../middleware/requireCronSecret");
const { query: dbQuery } = require("../config/db");
const { jobs, runJobWithLogging } = require("../cron/registry");

router.post(
  "/trigger/:jobName",
  requireAuthOrCronSecret,
  asyncHandler(async (req, res) => {
    const job = jobs.find((j) => j.name === req.params.jobName);
    if (!job) {
      return res.status(404).json({ error: { message: "Unknown job" } });
    }
    await runJobWithLogging(job);
    res.json({ ok: true, job: job.name });
  }),
);

router.get(
  "/jobs",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json({
      jobs: jobs.map((j) => ({
        name: j.name,
        schedule: j.schedule,
        timezone: j.timezone,
      })),
    });
  }),
);

router.get(
  "/runs",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const runs = await dbQuery(
      `SELECT id, job_name, status, started_at, finished_at, duration_ms, error_message
       FROM cron_runs
       ORDER BY started_at DESC
       LIMIT 50`,
    );
    const summaries = await dbQuery(
      `SELECT job_name,
              COUNT(*)::int AS runs,
              COUNT(*) FILTER (WHERE status = 'success')::int AS successes,
              MAX(started_at) AS last_run
       FROM cron_runs
       WHERE started_at > NOW() - INTERVAL '24 hours'
       GROUP BY job_name
       ORDER BY job_name`,
    );
    res.json({ runs: runs.rows, summaries: summaries.rows });
  }),
);

module.exports = router;
