// server/config/env.js
require("dotenv").config();

const required = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "META_VERIFY_TOKEN",
  "JWT_SECRET",
  "REDIS_URL",
  "AT_USERNAME",
  "AT_API_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  PORT: parseInt(process.env.PORT || "5000", 10),
  DB_HOST: process.env.DB_HOST,
  DB_PORT: parseInt(process.env.DB_PORT, 10),
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
  META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN,
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
  META_PHONE_NUMBER_ID: process.env.META_PHONE_NUMBER_ID,
  META_APP_SECRET: process.env.META_APP_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1h",
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || "12", 10),
  REDIS_URL: process.env.REDIS_URL,
  AT_USERNAME: process.env.AT_USERNAME,
  AT_API_KEY: process.env.AT_API_KEY,
  AT_SMS_FROM: process.env.AT_SMS_FROM || "",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  // Public HTTPS URL Telegram POSTs updates to (e.g. https://host/telegram-bot/webhook).
  TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL || "",
  // Optional shared secret echoed back in X-Telegram-Bot-Api-Secret-Token.
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  // Telegram chat id that receives cron reports and alerts.
  OWNER_TELEGRAM_ID: process.env.OWNER_TELEGRAM_ID || "",
  // Optional WhatsApp recipient for a daily-report copy.
  OWNER_WHATSAPP_PHONE: process.env.OWNER_WHATSAPP_PHONE || "",
  // Shared secret for external schedulers (OS cron, GitHub Actions, ...).
  CRON_SECRET: process.env.CRON_SECRET || "",
  // Whether this process runs the cron registry (web defaults to true for dev;
  // set to "false" on the web service when a dedicated worker runs cron).
  RUN_CRON_IN_PROCESS: (process.env.RUN_CRON_IN_PROCESS || "true") !== "false",
  // Whether this process starts the BullMQ workers.
  RUN_QUEUES_IN_PROCESS: (process.env.RUN_QUEUES_IN_PROCESS || "true") !== "false",
  // Paystack secret key (test key locally; live key in production).
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || "",
  // Public URL of the Next.js treasurer dashboard (for /dashboard links).
  TREASURER_URL: process.env.TREASURER_URL || "",
  // Shared secret for dashboard -> Express internal calls.
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET || "",
};
