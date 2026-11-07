// server/controllers/auth.controller.js

const authService = require("../services/auth.service");

async function signup(req, res) {
  const { user, token } = await authService.signup(req.body);

  res.status(201).json({ user, token });
}

async function login(req, res) {
  const { user, token } = await authService.login(req.body);
  res.json({ user, token });
}

async function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { signup, login, me };
