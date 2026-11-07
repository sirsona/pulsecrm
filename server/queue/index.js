// server/queues/index.js

const { Queue } = require("bullmq");

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_HOST || "6379", 10),
};

const notificationQueue = new Queue("notifications", { connection });
const paymentQueue = new Queue("payments", { connection });
const reportQueue = new Queue("reports", { connection });

module.exports = {
  notificationsQueue,
  paymentsQueue,
  reportsQueue,
};
