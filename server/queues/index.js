// server/queues/index.js
//
// BullMQ queues. BullMQ uses ioredis-style connection options, so we
// parse the configured Redis URL.
const { Queue } = require("bullmq");
const env = require("../config/env");

function redisConnection() {
  if (!env.REDIS_URL) {
    return { host: "localhost", port: 6379 };
  }

  const url = new URL(env.REDIS_URL);
  const connection = {
    host: url.hostname || "localhost",
    port: parseInt(url.port || "6379", 10),
  };
  if (url.username) connection.username = decodeURIComponent(url.username);
  if (url.password) connection.password = decodeURIComponent(url.password);
  const db = url.pathname ? parseInt(url.pathname.replace("/", ""), 10) : NaN;
  if (!Number.isNaN(db)) connection.db = db;
  return connection;
}

const connection = redisConnection();

// Recurring jobs use BullMQ Job Schedulers (the legacy repeatable API was
// removed in BullMQ v6):
//   await notificationsQueue.upsertJobScheduler(
//     "daily-heartbeat",
//     { pattern: "*/5 * * * * *", tz: "Africa/Nairobi" },
//     { name: "heartbeat", data: {} },
//   );
//   await notificationsQueue.removeJobScheduler("daily-heartbeat");
// Legacy `repeat` jobs still fire, but their Redis keys
// (bull:<queue>:repeat:*) must be deleted manually to stop them.

// Retry policy per channel. SMS costs money, so it retries less.
const standardDefaults = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const smsDefaults = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const reportsDefaults = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

// One queue per channel: their retry semantics and rate limits differ.
const telegramQueue = new Queue("telegram", {
  connection,
  defaultJobOptions: standardDefaults,
});
const smsQueue = new Queue("sms", {
  connection,
  defaultJobOptions: smsDefaults,
});
const whatsappQueue = new Queue("whatsapp", {
  connection,
  defaultJobOptions: standardDefaults,
});
const reportsQueue = new Queue("reports", {
  connection,
  defaultJobOptions: reportsDefaults,
});

// General-purpose notification queue.
const notificationsQueue = new Queue("notifications", {
  connection,
  defaultJobOptions: standardDefaults,
});

// Dead-letter queue: jobs that exhausted retries or failed permanently are
// moved here for human review — never auto-fixed.
const deadLetterQueue = new Queue("dead-letter", { connection });

module.exports = {
  connection,
  telegramQueue,
  smsQueue,
  whatsappQueue,
  reportsQueue,
  notificationsQueue,
  deadLetterQueue,
};
