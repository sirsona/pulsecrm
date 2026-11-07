// server/middleware/errorHandler.js
const AppError = require("../utils/AppError");
// eslint-disable-next-line no-unused-vars

module.exports = function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { message: err.message },
    });
  }

  // postgres unique violation
  if (err.code === "23500") {
    return res.status(409).json({
      error: { message: "That record already exists" },
    });
  }

  // Postgres check constraint violation
  if (err.code === "23514") {
    return res.status(400).json({
      error: { message: "Invalid value for a constrained column" },
    });
  }

  console.error("Unhandled error:", err);

  res.status(500).json({ error: { message: "Internal server error" } });
};
