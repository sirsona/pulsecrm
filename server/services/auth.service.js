// server/services/auth.service.js

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const userRepo = require("../repositories/users.repo");
const AppError = require("../utils/AppError");

async function signup({ email, password, name }) {
  if (!email || !password || !name) {
    throw new AppError("email, password, and name are required", 400);
  }

  if (password.length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }

  const existing = await userRepo.findByEmail(email);
  if (existing) {
    throw new AppError("An account with that email already exists", 409);
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const user = await userRepo.insert({ email, passwordHash, name });
  const token = signToken(user);

  return { user, token };
}

async function login({ email, password }) {
  if (!email || !password) {
    throw new AppError("email and password are required", 400);
  }

  const user = await userRepo.findByEmail(email);
  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new AppError("Invalid credentials", 401);
  }

  // Strip the has before returning
  const { password_hash, ...safeUser } = user;
  const token = signToken(safeUser);

  return { user: safeUser, token };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    throw new AppError("Invalid or expired token", 401);
  }
}
module.exports = {
  signup,
  login,
  signToken,
  verifyToken,
};
