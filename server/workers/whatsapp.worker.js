// server/workers/whatsapp.worker.js
//
// WhatsApp channel worker. Concurrency 10; permanent failures (bad number,
// closed 24h window) skip retries.
const { Worker, UnrecoverableError } = require("bullmq");
const { connection } = require("../queues");
const {
  attachDeadLetter,
  attachShutdown,
  attachEvents,
} = require("./_setup");
const whatsapp = require("../services/whatsapp.service");

const worker = new Worker(
  "whatsapp",
  async (job) => {
    const { to, body } = job.data;
    if (!to || !body) {
      throw new UnrecoverableError("Missing to or body");
    }

    try {
      await whatsapp.sendText(to, body);
    } catch (err) {
      const code = err.response && err.response.status;
      if (code === 400 || code === 403) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  },
  {
    connection,
    concurrency: 10,
    limiter: { max: 20, duration: 1000 },
    stalledInterval: 30000,
    maxStalledCount: 3,
  },
);

worker.on("completed", (job) => {
  console.log(`[whatsapp] Job ${job.id} completed`);
});
worker.on("failed", (job, err) => {
  console.error(
    `[whatsapp] Job ${job.id} failed attempt ${job.attemptsMade}: ${err.message}`,
  );
});

attachDeadLetter(worker, "whatsapp");
attachShutdown(worker, "whatsapp");
attachEvents("whatsapp");

module.exports = worker;
