// server/routes/telegramBot.routes.js
//
// Webhook entry point for the improved Telegram bot. Mounted in index.js at
// "/telegram-bot" -> POST /telegram-bot/webhook.
//
// The public TELEGRAM_WEBHOOK_URL configured in .env must point to this
// exact path (registerWebhook() in services/telegramBot.service.js registers
// it with Telegram at boot).
//
// Security: if TELEGRAM_WEBHOOK_SECRET is set, Telegram echoes it back in the
// "X-Telegram-Bot-Api-Secret-Token" header on every update. We reject any
// request that does not carry it, so the endpoint cannot be spoofed.

const express = require("express");
const router = express.Router();
const telegram = require("../services/telegramBot.service");

router.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "telegram-bot-webhook",
    registered: telegram.isConfigured(),
    // Point TELEGRAM_WEBHOOK_URL at: POST /telegram-bot/webhook
  });
});

router.post(
  "/webhook",
  express.json({ limit: "1mb" }),
  async (req, res) => {
    if (!telegram.verifyRequestSecret(req)) {
      console.warn("Rejected telegram webhook request: bad/missing secret token.");
      return res.status(401).json({ error: { message: "Invalid secret token" } });
    }

    // Acknowledge immediately so Telegram doesn't retry while we work.
    res.json({ ok: true });

    try {
      await telegram.processUpdate(req.body);
    } catch (err) {
      // processUpdate already isolates per-update errors; this is a final net.
      console.error("Telegram update processing error:", err);
    }
  },
);

module.exports = router;
