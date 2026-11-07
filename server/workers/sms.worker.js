// server/workers/sms.worker.js
//
// SMS channel worker. Concurrency 3; the queue retries less than other
// channels because every send costs money.
const { Worker, UnrecoverableError } = require("bullmq");
const { connection } = require("../queues");
const {
  attachDeadLetter,
  attachShutdown,
  attachEvents,
} = require("./_setup");
const sms = require("../services/sms.service");

const worker = new Worker(
  "sms",
  async (job) => {
    const { to, message } = job.data;
    if (!to || !message) {
      throw new UnrecoverableError("Missing to or message");
    }
    await sms.sendSMS(to, message);
  },
  {
    connection,
    concurrency: 3,
    limiter: { max: 5, duration: 1000 },
    stalledInterval: 30000,
    maxStalledCount: 3,
  },
);

worker.on("completed", (job) => {
  console.log(`[sms] Job ${job.id} completed`);
});
worker.on("failed", (job, err) => {
  console.error(
    `[sms] Job ${job.id} failed attempt ${job.attemptsMade}: ${err.message}`,
  );
});

attachDeadLetter(worker, "sms");
attachShutdown(worker, "sms");
attachEvents("sms");

module.exports = worker;
