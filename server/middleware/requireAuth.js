// server/middleware/requireAuth.js
const authService = require("../services/auth.service");

const userRepo = require("../repositories/users.repo");

const AppError = require("../utils/AppError");

module.exports = async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new AppError("Missing authentication token", 401);
    }

    const payload = authService.verifyToken(token);
    const user = await userRepo.findById(payload.sub);

    if (!user) {
      throw new AppError("User no longer exists", 401);
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
