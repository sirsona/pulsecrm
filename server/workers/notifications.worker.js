// server/workers/notifications.worker.js
//
// General notification worker. Handles simple test job names plus the three
// channel sends. Queue-level retry defaults apply.
const { Worker, UnrecoverableError } = require("bullmq");
const { connection } = require("../queues");
const {
  attachDeadLetter,
  attachShutdown,
  attachEvents,
} = require("./_setup");
const whatsapp = require("../services/whatsapp.service");
const sms = require("../services/sms.service");
const telegram = require("../services/telegramBot.service");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const worker = new Worker(
  "notifications",
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case "ping":
        return "pong";
      case "heartbeat":
        return "beat";
      case "sleep":
        await sleep(job.data.ms || 1000);
        return `slept ${job.data.ms || 1000}ms`;
      case "fail":
        throw new Error(job.data.message || "deliberate failure");
      case "permanent-fail":
        throw new UnrecoverableError(
          job.data.message || "permanent (no retry)",
        );
      case "process-order":
        return `order processed (${job.data.orderId || "unknown"})`;
      case "sendWhatsApp":
        await whatsapp.sendText(job.data.to, job.data.body);
        return;
      case "sendSMS":
        await sms.sendSMS(job.data.to, job.data.message);
        return;
      case "sendTelegram":
        await telegram.sendMessage(job.data.chatId, job.data.text);
        return;
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 20, duration: 1000 },
    stalledInterval: 30000,
    maxStalledCount: 3,
  },
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed (${job.name})`);
});

worker.on("failed", (job, err) => {
  console.error(
    `Job ${job.id} failed (${job.name}) attempt ${job.attemptsMade}: ${err.message}`,
  );
});

attachDeadLetter(worker, "notifications");
attachShutdown(worker, "notifications");
attachEvents("notifications");

console.log("Notifications worker running (concurrency 5)");

module.exports = worker;
