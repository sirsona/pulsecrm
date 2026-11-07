// server/cron/locks.js
const { pool } = require("../config/db");

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

async function runWithLock(jobName, fn) {
  const lockKey = hashCode(jobName);
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [lockKey],
    );

    if (!rows[0].acquired) {
      console.log(`[cron] ${jobName} skipped -- already running`);
      return { skipped: true };
    }

    try {
      await fn();
      return { skipped: false };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [lockKey]);
    }
  } finally {
    client.release();
  }
}

module.exports = { runWithLock, hashCode };
