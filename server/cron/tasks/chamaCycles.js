// server/cron/tasks/chamaCycles.js
const cycleService = require("../../services/chama/cycleService");

module.exports = {
  processCycles: () => cycleService.processCycles(),
  sendCycleReminders: () => cycleService.sendCycleReminders(),
};
