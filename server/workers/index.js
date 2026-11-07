// server/workers/index.js
//
// Starts every BullMQ worker in the current process.
// Each worker module attaches its own dead-letter, shutdown and event hooks.
const WORKER_FILES = [
  "./notifications.worker",
  "./telegram.worker",
  "./whatsapp.worker",
  "./sms.worker",
  "./reports.worker",
];

function startAll() {
  const workers = WORKER_FILES.map((file) => require(file));
  console.log(`BullMQ workers started (${workers.length})`);
  return workers;
}

module.exports = { startAll };
