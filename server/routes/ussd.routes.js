// server/routes/ussd.routes.js
const express = require("express");
const ussdController = require("../controllers/ussd.controller");

const router = express.Router();
router.post(
  "/",
  express.urlencoded({ extended: false }),
  ussdController.handle,
);

module.exports = router;
