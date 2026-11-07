// server/routes/chama.routes.js
//
// Internal chama endpoints called by the treasurer dashboard's server side
// (never by browsers). Guarded by the shared INTERNAL_API_SECRET header.
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const env = require("../config/env");
const asyncHandler = require("../middleware/asyncHandler");
const cycleService = require("../services/chama/cycleService");

function secretMatches(req) {
  const provided = req.headers["x-internal-secret"] || "";
  const expected = env.INTERNAL_API_SECRET || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post(
  "/:chatId/close-cycle",
  asyncHandler(async (req, res) => {
    if (!secretMatches(req)) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const chatId = parseInt(req.params.chatId, 10);
    if (isNaN(chatId)) {
      return res.status(400).json({ error: { message: "Invalid chat id" } });
    }

    await cycleService.closeChamaCycle(chatId);
    res.json({ ok: true, chamaId: chatId });
  }),
);

module.exports = router;
