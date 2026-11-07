// server/services/whatsapp.js
const axios = require("axios");

const GRAPH = "https://graph.facebook.com/v26.0";

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function sendText(to, body) {
  const url = `${GRAPH}/${process.env.META_PHONE_NUMBER_ID}/messages`;
  console.log(`📤 SENDING: "${body}" to ${to}`);
  console.log(`🔗 URL: ${url}`);
  try {
    const res = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      },
      { headers: authHeaders() },
    );
    console.log("✅ SENT:", JSON.stringify(res.data));
  } catch (err) {
    console.error("sendText failed:", err.response?.data || err.message);
    throw err;
  }
}

async function sendInquiryList(to) {
  const url = `${GRAPH}/${process.env.META_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: "What are you interested in?" },
          action: {
            button: "Choose one",
            sections: [
              {
                title: "Inquiry type",
                rows: [
                  { id: "viewing", title: "Property viewing" },
                  { id: "test_drive", title: "Car test drive" },
                  { id: "quote", title: "Request a quote" },
                  { id: "billing", title: "M-Pesa / billing" },
                  { id: "other", title: "Something else" },
                ],
              },
            ],
          },
        },
      },
      { headers: authHeaders() },
    );
    console.log("✅ SENT LIST:", JSON.stringify(res.data));
  } catch (err) {
    console.error("sendInquiryList failed:", err.response?.data || err.message);
    throw err;
  }
}

module.exports = { sendText, sendInquiryList };
