// server/services/sms.service.js
const env = require("../config/env");

const AT_URL = "https://api.sandbox.africastalking.com/version1/messaging";

async function sendSMS(to, message) {
  const body = new URLSearchParams({
    username: env.AT_USERNAME,
    to,
    message,
    from: env.AT_SMS_FROM || "",
  }).toString();

  const res = await fetch(AT_URL, {
    method: "POST",
    headers: {
      apiKey: env.AT_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("SMS send failed", data);
    throw new Error("SMS failed");
  }
  return data;
}

module.exports = { sendSMS };
