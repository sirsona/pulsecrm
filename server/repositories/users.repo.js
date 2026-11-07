// server/repositories/users.repo.js

const { query } = require("../config/db");

async function findByEmail(email) {
  const { rows } = await query("SELECT * from users WHERE email = $1", [
    email.toLowerCase(),
  ]);

  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    "SELECT id, email, name, role, created_at FROM users WHERE id = $1",
    [id],
  );
  return rows[0] || null;
}

async function insert({ email, passwordHash, name, role = "agent" }) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name,role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, name, role, created_at`,
    [email.toLowerCase(), passwordHash, name, role],
  );
  return rows[0];
}

module.exports = { findByEmail, findById, insert };
