// server/worker.js
//
// Dedicated cron worker: runs the scheduled task registry and nothing else.
// No HTTP server, no port binding. Deploy alongside the web process:
//   web service:    RUN_CRON_IN_PROCESS=false  npm run start:web
//   worker service:                            npm run start:worker
// Leader election (Redis) keeps exactly one process running the jobs even if
// both services start the registry.
require("./config/env");
const registry = require("./cron/registry");
const { becomeLeaderForever } = require("./cron/leader");

console.log("Worker process starting (cron + queue workers, no HTTP port)");
becomeLeaderForever({ onStart: registry.startAll });
require("./workers").startAll();

async function shutdown(signal) {
  console.log(`${signal} received, finishing cron tasks...`);
  await registry.drain(30000);
  console.log("All cron tasks finished. Exiting.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
