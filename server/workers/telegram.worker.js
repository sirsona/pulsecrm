// server/workers/telegram.worker.js
//
// Telegram channel worker. Concurrency 5, global limiter (20/s) and a
// per-group Redis rate limit (Telegram allows 20 messages/minute per group).
//
// Job types:
//   sendMessage  { chatId, text, opts, dryRun?, fallback?, ignore403?, transientFail? }
//   sendDocument { chatId, path, filename }
//
// `fallback` = { chatId, text, opts } sent instead of failing when the primary
// send returns 403 (used for overdue reminders: DM first, mention on failure).
const { Worker, UnrecoverableError } = require("bullmq");
const { connection } = require("../queues");
const {
  attachDeadLetter,
  attachShutdown,
  attachEvents,
} = require("./_setup");
const telegram = require("../services/telegramBot.service");
const { getClient } = require("../config/redis");

const GROUP_LIMIT = 20; // messages
const GROUP_WINDOW_SECONDS = 60;

// Redis counter per group: reschedules via the queue's retry/backoff when the
// window is full (the notes' per-group limiter pattern).
async function checkGroupLimit(chatId) {
  const client = await getClient();
  const key = `rl:telegram:${chatId}`;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, GROUP_WINDOW_SECONDS);
  return count <= GROUP_LIMIT;
}

function errorCode(err) {
  const body = err.response && err.response.body;
  return body && body.error_code;
}

const worker = new Worker(
  "telegram",
  async (job) => {
    const { chatId } = job.data;
    if (!chatId) {
      throw new UnrecoverableError("Missing chatId");
    }

    // Test hook: force a retryable failure (checkpoint 3).
    if (job.data.transientFail) {
      throw new Error("simulated transient Telegram failure");
    }

    if (!(await checkGroupLimit(chatId))) {
      // Retryable: BullMQ backoff brings us back after the window resets.
      throw new Error("Telegram group rate limit");
    }

    if (job.data.dryRun) {
      console.log(`[telegram] dryRun ${job.name} -> chat ${chatId}`);
      return;
    }

    try {
      if (job.name === "sendDocument") {
        await telegram.bot.sendDocument(chatId, job.data.path, {}, {
          filename: job.data.filename,
        });
      } else {
        if (!job.data.text) {
          throw new UnrecoverableError("Missing text");
        }
        await telegram.sendMessage(chatId, job.data.text, job.data.opts);
      }
    } catch (err) {
      const code = errorCode(err);

      if (code === 403 && job.data.ignore403) {
        console.log(`[telegram] job ${job.id}: 403 ignored (${chatId})`);
        return;
      }

      if (code === 403 && job.data.fallback) {
        const fb = job.data.fallback;
        try {
          await telegram.sendMessage(fb.chatId, fb.text, fb.opts);
          return;
        } catch (fbErr) {
          throw new UnrecoverableError(
            `primary 403 and fallback failed: ${fbErr.message}`,
          );
        }
      }

      if (code === 400 || code === 403) {
        // Bad chat id or the bot is blocked: retrying cannot help.
        throw new UnrecoverableError(err.message);
      }
      throw err;
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
  console.log(`[telegram] Job ${job.id} completed`);
});
worker.on("failed", (job, err) => {
  console.error(
    `[telegram] Job ${job.id} failed attempt ${job.attemptsMade}: ${err.message}`,
  );
});

attachDeadLetter(worker, "telegram");
attachShutdown(worker, "telegram");
attachEvents("telegram");

module.exports = worker;
