// server/routes/users.routes.js
const express = require("express");
const { query } = require("../config/db");
const requireRole = require("../middleware/requireRole");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      "SELECT id, name, email, role FROM users ORDER BY name",
    );
    res.json({ users: rows });
  }),
);

module.exports = router;
