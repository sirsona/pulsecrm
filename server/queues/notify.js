// server/queues/notify.js
//
// Central "add to queue" helpers. Callers enqueue instead of sending inline;
// the channel workers own retries, rate limits and DLQ.
const { telegramQueue, whatsappQueue, smsQueue } = require("./index");

async function telegramNotify(
  chatId,
  text,
  { priority, jobId, opts, fallback } = {},
) {
  return telegramQueue.add(
    "sendMessage",
    { chatId, text, opts, fallback },
    { priority, jobId },
  );
}

async function telegramSendDocument(
  chatId,
  filePath,
  { filename, priority, jobId } = {},
) {
  return telegramQueue.add(
    "sendDocument",
    { chatId, path: filePath, filename },
    { priority, jobId },
  );
}

async function whatsappNotify(to, body, { priority, jobId } = {}) {
  return whatsappQueue.add("sendText", { to, body }, { priority, jobId });
}

async function smsNotify(to, message, { priority, jobId } = {}) {
  return smsQueue.add("sendSMS", { to, message }, { priority, jobId });
}

module.exports = {
  telegramNotify,
  telegramSendDocument,
  whatsappNotify,
  smsNotify,
};
