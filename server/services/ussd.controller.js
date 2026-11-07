// server/controllers/ussd.controller.js
const dispatcher = require("../services/ussd/dispatcher");

async function handle(req, res) {
  const { sessionId, phoneNumber, text } = req.body;

  const response = await dispatcher.run({
    sessionId,
    phoneNumber,
    rawText: text || "",
  });

  res.set("Content-Type", "text/plain");
  res.send(response);
}

module.exports = { handle };
