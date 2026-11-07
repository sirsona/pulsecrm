import { Pool, types } from "pg";

// See server/config/db.js: parse BIGINT as a number (Telegram ids are well
// below Number.MAX_SAFE_INTEGER).
types.setTypeParser(20, (value) => parseInt(value, 10));

const globalForDb = globalThis;

function createPool() {
  return new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: 5,
  });
}

export const pool = globalForDb.__treasurerPool || createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__treasurerPool = pool;
}

export function query(text, params) {
  return pool.query(text, params);
}
