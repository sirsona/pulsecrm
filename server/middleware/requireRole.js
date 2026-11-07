// server/middleware/requireRole.js
const AppError = require("../utils/AppError");

module.exports = function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Not authenticated", 401));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError("Forbidden", 403));
    }
    next();
  };
};
