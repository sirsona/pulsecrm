const express = require("express");
const router = express.Router();
const asyncHandler = require("../middleware/asyncHandler");
const { broadcast } = require("../services/telegramBot.service");

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const text = (req.body && req.body.text) || "";
    if (text.length < 3) {
      return res.status(400).json({ error: { message: "Message too short" } });
    }
    const result = await broadcast(text);
    res.json(result);
  }),
);

module.exports = router;
