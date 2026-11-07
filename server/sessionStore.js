// const { getClient } = require("./config/redis");

// const SESSION_TTL = 300;

// function key(sessionID) {
//   return `ussd:session:${sessionID}`;
// }

// async function get(sessionID) {
//   const client = await getClient();

//   const raw = client.get(key(sessionID));

//   if (!raw) {
//     return { state: "Welcome", context: {} };
//   }

//   return JSON.parse(raw);
// }

// async function set(sessionId, data) {
//   const client = await getClient();
//   await client.set(key(sessionId), JSON.stringify(data), { EX: SESSION_TTL });
// }

// async function destroy(sessionID) {
//   const client = await getClient();

//   await client.del(key(sessionID));
// }

// module.exports = { get, set, destroy };
// sessionStore.js
const { getClient } = require("./config/redis");

const SESSION_TTL = 300; // 5 minutes -- a bit more than the USSD max.

function key(sessionId) {
  return `ussd:session:${sessionId}`;
}

async function get(sessionId) {
  const client = await getClient();
  const raw = await client.get(key(sessionId));
  if (!raw) {
    return { state: "welcome", context: {} };
  }
  return JSON.parse(raw);
}

async function set(sessionId, data) {
  const client = await getClient();
  await client.set(key(sessionId), JSON.stringify(data), { EX: SESSION_TTL });
}

async function destroy(sessionId) {
  const client = await getClient();
  await client.del(key(sessionId));
}

module.exports = { get, set, destroy };
