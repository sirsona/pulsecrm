// server/routes/paystack.routes.js
//
// Paystack webhook. Paystack signs the raw body with your secret key
// (x-paystack-signature, HMAC-SHA512). We verify against req.rawBody (captured
// by the global express.json verify hook), ack with 200 immediately, and hand
// the event to the outbox so payment processing never blocks the webhook.
const express = require("express");
const router = express.Router();
const { query: db } = require("../config/db");
const paystack = require("../services/chama/paystackService");

const HANDLED_EVENTS = new Set(["charge.success", "charge.failed"]);

router.post("/webhook", async (req, res) => {
  const signature = req.headers["x-paystack-signature"];

  if (!paystack.verifySignature(req.rawBody, signature)) {
    return res.sendStatus(401);
  }

  res.sendStatus(200); // acknowledge before any processing

  try {
    const event = req.body || {};
    const type = event.event;
    const data = event.data || {};
    const reference = data.reference;
    const contributionId = data.metadata && data.metadata.contributionId;

    if (!HANDLED_EVENTS.has(type) || !reference) return;

    // Idempotency: never queue the same provider reference twice.
    const existing = await db(
      `SELECT 1 FROM outbox WHERE event_type = $1 AND payload->>'reference' = $2 LIMIT 1`,
      [type, reference],
    );
    if (existing.rows.length > 0) return;

    await db(`INSERT INTO outbox (event_type, payload) VALUES ($1, $2)`, [
      type,
      JSON.stringify({ contributionId, reference, eventId: event.id }),
    ]);
  } catch (err) {
    console.error("Paystack webhook enqueue failed:", err.message);
  }
});

module.exports = router;
