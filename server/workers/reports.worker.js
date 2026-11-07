// server/workers/reports.worker.js
//
// Reports worker. Concurrency 1 (CPU-ish work per process) and progress
// reporting for long jobs.
const { Worker } = require("bullmq");
const { connection } = require("../queues");
const {
  attachDeadLetter,
  attachShutdown,
  attachEvents,
} = require("./_setup");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const worker = new Worker(
  "reports",
  async (job) => {
    if (job.name === "generateReport") {
      const steps = job.data.steps || 10;
      const stepMs = job.data.stepMs || 300;

      for (let i = 0; i <= steps; i++) {
        await job.updateProgress(Math.round((i / steps) * 100));
        await sleep(stepMs);
      }
      return { steps, done: true };
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection,
    concurrency: 1,
    limiter: { max: 1, duration: 1000 },
    stalledInterval: 30000,
    maxStalledCount: 3,
  },
);

worker.on("completed", (job) => {
  console.log(`[reports] Job ${job.id} completed`);
});
worker.on("failed", (job, err) => {
  console.error(
    `[reports] Job ${job.id} failed attempt ${job.attemptsMade}: ${err.message}`,
  );
});

attachDeadLetter(worker, "reports");
attachShutdown(worker, "reports");
attachEvents("reports");

module.exports = worker;
