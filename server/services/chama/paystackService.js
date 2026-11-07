// server/services/chama/paystackService.js
//
// Paystack integration for chama contributions. The chama module never
// touches card/mobile-money details directly; this is the only file that
// knows about the provider.
const crypto = require("crypto");
const axios = require("axios");
const env = require("../../config/env");

const PAYSTACK_BASE = "https://api.paystack.co";

async function initialize({ email, amountCents, metadata = {}, callbackUrl }) {
  const { data } = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    {
      email,
      amount: amountCents, // Paystack expects the smallest currency unit
      currency: "KES",
      metadata,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    },
    {
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
      timeout: 15000,
    },
  );

  if (!data || !data.status) {
    throw new Error((data && data.message) || "Paystack initialize failed");
  }

  return {
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  };
}

function verifySignature(rawBody, signature) {
  if (!env.PAYSTACK_SECRET_KEY || !signature || !rawBody) return false;

  const expected = crypto
    .createHmac("sha512", env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function verifyTransaction(reference) {
  const { data } = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
      timeout: 15000,
    },
  );
  return data && data.status ? data.data : null;
}

module.exports = { initialize, verifySignature, verifyTransaction };
