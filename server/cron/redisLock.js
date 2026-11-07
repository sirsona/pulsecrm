// server/cron/redisLock.js
const crypto = require("crypto");
const { getClient } = require("../config/redis");

async function acquireLock(name, ttlMs = 60000) {
  const client = await getClient();
  const token = crypto.randomUUID();
  const result = await client.set(`lock:${name}`, token, {
    NX: true,
    PX: ttlMs,
  });
  if (result === "OK") return token;
  return null;
}

async function releaseLock(name, token) {
  const client = await getClient();
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  return client.eval(script, {
    keys: [`lock:${name}`],
    arguments: [token],
  });
}

async function runWithRedisLock(name, fn, ttlMs = 60000) {
  const token = await acquireLock(name, ttlMs);
  if (!token) {
    console.log(`[lock] ${name} skipped -- lock held`);
    return { skipped: true };
  }
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    await releaseLock(name, token);
  }
}

module.exports = { acquireLock, releaseLock, runWithRedisLock };
