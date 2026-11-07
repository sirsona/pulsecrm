const express = require("express");
const controller = require("../controllers/auth.controller");
const asyncHandler = require("../middleware/asyncHandler");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.post("/signup", asyncHandler(controller.signup));
router.post("/login", asyncHandler(controller.login));
router.get("/me", requireAuth, asyncHandler(controller.me));

module.exports = router;
