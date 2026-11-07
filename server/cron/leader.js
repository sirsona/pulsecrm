// server/cron/leader.js
const crypto = require("crypto");
const { getClient } = require("../config/redis");

const LEADER_KEY = "leader:cron";
const LEADER_TTL_MS = 30000;
const RENEW_MS = 10000;

function becomeLeaderForever({ onStart } = {}) {
  const token = crypto.randomUUID();
  let isLeader = false;
  let started = false;

  async function renew() {
    const client = await getClient();
    const current = await client.get(LEADER_KEY);
    if (current === token) {
      await client.pExpire(LEADER_KEY, LEADER_TTL_MS);
      return true;
    }
    const result = await client.set(LEADER_KEY, token, {
      NX: true,
      PX: LEADER_TTL_MS,
    });
    return result === "OK";
  }

  async function tick() {
    try {
      const stillLeader = await renew();
      if (stillLeader && !isLeader) {
        console.log("[leader] became leader");
        if (!started && onStart) {
          started = true;
          onStart();
        }
      } else if (!stillLeader && isLeader) {
        console.log("[leader] lost leadership");
      }
      isLeader = stillLeader;
    } catch (err) {
      console.error("[leader] renew failed:", err.message);
    }
  }

  tick();
  const interval = setInterval(tick, RENEW_MS);
  if (interval.unref) interval.unref();

  return {
    isLeader: () => isLeader,
    stop: () => clearInterval(interval),
  };
}

module.exports = { becomeLeaderForever, LEADER_KEY };
