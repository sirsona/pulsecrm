const { Pool, types } = require("pg");

const env = require("./env");

// BIGINT (int8, oid 20) is returned as a string by default to avoid precision
// loss. Telegram ids and chat ids are far below Number.MAX_SAFE_INTEGER, and
// strict comparisons like `chama.treasurer_user_id !== message.from.id`
// silently fail on strings, so parse int8 as a number.
types.setTypeParser(20, (value) => parseInt(value, 10));

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  max: 10, // up to 10 concurrent connections
  idleTimeoutMillis: 30000, // close idle connections after 30s
});

pool.on("error", (err) => {
  console.error("Unexpected pg pool error", err);
  process.exit(1);
});

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const ms = Date.now() - start;

  if (process.env.DB_LOG === "true") {
    console.log(`[db] ${ms}ms ${text.split("\n")[0]}`);
  }

  return result;
}

async function getClient() {
  const client = await pool.connect();

  return client;
}

module.exports = { pool, query, getClient };
