// const { getClient } = require("./redis");
// //  require("./config/redis");

// const SESSION_TTL = 300; // 5 minutes -- a bit more than the USSD max.

// function key(sessionId) {
//   return `ussd:session:${sessionId}`;
// }

// async function get(sessionId) {
//   const client = await getClient();
//   const raw = await client.get(key(sessionId));
//   if (!raw) {
//     return { state: "welcome", context: {} };
//   }
//   return JSON.parse(raw);
// }

// async function set(sessionId, data) {
//   const client = await getClient();
//   await client.set(key(sessionId), JSON.stringify(data), { EX: SESSION_TTL });
// }

// async function destroy(sessionId) {
//   const client = await getClient();
//   await client.del(key(sessionId));
// }

// module.exports = { get, set, destroy };
// config/redis.js
const { createClient } = require("redis");

const client = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

client.on("error", (err) => {
  console.error("Redis error:", err);
});

let connected = false;

async function getClient() {
  if (!connected) {
    await client.connect();
    connected = true;
  }
  return client;
}

module.exports = { getClient };
