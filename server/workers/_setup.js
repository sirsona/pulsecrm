// server/workers/_setup.js
//
// Shared worker wiring: dead-letter queue, graceful shutdown and QueueEvents
// logging. Imported by every channel worker.
const { QueueEvents } = require("bullmq");
const { connection, deadLetterQueue } = require("../queues");
const telegram = require("../services/telegramBot.service");
const env = require("../config/env");

// Alert the owner, retrying a couple of times: Telegram connections
// occasionally fail with a transient EFATAL/network error, and a dead-job
// alert must not be lost because of a blip.
async function alertOwner(text, attempts = 3) {
  if (!env.OWNER_TELEGRAM_ID) return false;

  for (let i = 0; i < attempts; i++) {
    try {
      await telegram.sendMessage(env.OWNER_TELEGRAM_ID, text);
      console.log("[dlq] owner alert sent");
      return true;
    } catch (e) {
      console.error(`[dlq] owner alert attempt ${i + 1} failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return false;
}

// Move definitively-failed jobs to the dead-letter queue and alert the owner.
// "Definitive" = retries exhausted, or an UnrecoverableError (no retries by design).
function attachDeadLetter(worker, queueName) {
  worker.on("failed", async (job, err) => {
    if (!job) return;

    const attemptsAllowed = job.opts && job.opts.attempts ? job.opts.attempts : 1;
    const exhausted = job.attemptsMade >= attemptsAllowed;
    const permanent = err && err.name === "UnrecoverableError";
    if (!exhausted && !permanent) return;

    const errorMessage = err && err.message ? err.message : "unknown error";

    try {
      await deadLetterQueue.add(job.name, {
        originalQueue: queueName,
        originalJobId: job.id,
        data: job.data,
        error: errorMessage,
        failedAt: new Date().toISOString(),
      });
      console.log(
        `[dlq] ${queueName} job ${job.id} (${job.name}) -> dead-letter: ${errorMessage}`,
      );
    } catch (e) {
      console.error(`[dlq] could not record ${queueName} job ${job.id}:`, e.message);
    }

    await alertOwner(
      `Dead job: ${job.name} (${queueName})\n` +
        `Error: ${errorMessage}\n` +
        `Job id: ${job.id}`,
    );
  });
}

// Stop accepting jobs, wait for in-flight ones (max 30s), then exit.
function attachShutdown(worker, name) {
  async function shutdown(signal) {
    console.log(
      `${signal} received: closing ${name || "worker"} (waiting for in-flight jobs)...`,
    );
    await Promise.race([
      worker.close(),
      new Promise((r) => setTimeout(r, 30000)),
    ]);
    console.log(`${name || "worker"} closed.`);
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Log queue lifecycle events (waiting/active/completed/failed/stalled).
function attachEvents(queueName) {
  const events = new QueueEvents(queueName, { connection });

  events.on("waiting", ({ jobId }) =>
    console.log(`[events:${queueName}] ${jobId} waiting`),
  );
  events.on("active", ({ jobId }) =>
    console.log(`[events:${queueName}] ${jobId} active`),
  );
  events.on("completed", ({ jobId }) =>
    console.log(`[events:${queueName}] ${jobId} completed`),
  );
  events.on("failed", ({ jobId, failedReason }) =>
    console.error(`[events:${queueName}] ${jobId} failed: ${failedReason}`),
  );
  events.on("stalled", ({ jobId }) =>
    console.warn(`[events:${queueName}] ${jobId} stalled`),
  );

  return events;
}

module.exports = { attachDeadLetter, attachShutdown, attachEvents };
