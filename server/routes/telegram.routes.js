// server/routes/telegram.routes.js
const express = require("express");
const router = express.Router();
const telegram = require("../services/telegram.service");

router.post("/webhook", express.json(), async (req, res) => {
  res.json({ ok: true });
  await telegram.processUpdate(req.body);
});

module.exports = router;
