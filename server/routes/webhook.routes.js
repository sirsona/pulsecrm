// server/routes/webhook.routes.js  (mounted at /webhooks/meta in index.js)
const express = require("express");
const crypto = require("crypto");
const { handleIncoming } = require("../services/bot");

const router = express.Router();

// --- GET: verification handshake ------------------------------------------
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(
    `=== WEBHOOK VERIFY (GET) mode=${mode} token=${token ? "provided" : "missing"} ===`,
  );

  if (mode !== "subscribe" || token !== process.env.META_VERIFY_TOKEN) {
    console.warn("Webhook verification failed");
    return res.sendStatus(403);
  }

  console.log("Webhook verified");
  return res.status(200).send(challenge);
});

// --- POST: real incoming events -------------------------------------------
router.post("/", async (req, res) => {
  if (!verifySignature(req)) {
    console.warn("Invalid webhook signature -- rejecting");
    return res.sendStatus(401);
  }

  // Acknowledge IMMEDIATELY. Meta retries if we take too long.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    const contacts = value?.contacts;
    const statuses = value?.statuses;

    // Delivery/read/failed reports from Meta. CRITICAL for debugging
    // messages that were accepted but never delivered.
    if (statuses && statuses.length > 0) {
      console.log("=== DELIVERY STATUS ===");
      console.log(JSON.stringify(statuses, null, 2));
    }

    // Status updates (delivered/read) arrive without `messages`. Ignore.
    if (!messages || messages.length === 0) return;

    for (const message of messages) {
      const contact = contacts?.[0];
      await handleIncoming(message, contact);
    }
  } catch (err) {
    // We've already sent 200 -- log and move on.
    console.error("Error handling webhook:", err);
  }
});

// --- HMAC signature check -------------------------------------------------
function verifySignature(req) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature || !req.rawBody) return false;

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.META_APP_SECRET)
      .update(req.rawBody)
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

module.exports = router;
