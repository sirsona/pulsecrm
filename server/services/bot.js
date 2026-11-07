// server/services/bot.js
const { v4: uuidv4 } = require("uuid");
const { query } = require("../config/db");
const { sendText, sendInquiryList } = require("./whatsapp.service");

async function findOrCreateLead(waPhone, profileName) {
  // Check if lead exists
  const existing = await query("SELECT * FROM leads WHERE wa_phone = $1", [
    waPhone,
  ]);
  let lead = existing.rows[0];

  if (lead) {
    // Check if conversation exists
    const convoCheck = await query(
      "SELECT * FROM conversations WHERE lead_id = $1",
      [lead.id],
    );
    if (!convoCheck.rows[0]) {
      // Create conversation if it doesn't exist
      await query(
        `INSERT INTO conversations (id, lead_id, state, created_at, updated_at)
         VALUES ($1, $2, 'awaiting_name', NOW(), NOW())`,
        [uuidv4(), lead.id],
      );
    }
    return lead;
  }

  // Create new lead
  const id = uuidv4();
  await query(
    `INSERT INTO leads (id, wa_phone, name, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'new', NOW(), NOW())`,
    [id, waPhone, profileName || null],
  );

  // Create conversation for new lead
  await query(
    `INSERT INTO conversations (id, lead_id, state, created_at, updated_at)
     VALUES ($1, $2, 'awaiting_name', NOW(), NOW())`,
    [uuidv4(), id],
  );

  // Return the created lead
  const result = await query("SELECT * FROM leads WHERE id = $1", [id]);
  return result.rows[0];
}

async function getConversation(leadId) {
  const result = await query("SELECT * FROM conversations WHERE lead_id = $1", [
    leadId,
  ]);
  return result.rows[0] || null;
}

async function setState(leadId, state) {
  await query(
    `UPDATE conversations 
     SET state = $1, updated_at = NOW() 
     WHERE lead_id = $2`,
    [state, leadId],
  );
}

async function updateLead(leadId, patch) {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;

  const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  const values = fields.map((f) => patch[f]);
  values.push(leadId);

  await query(
    `UPDATE leads SET ${sets}, updated_at = NOW() WHERE id = $${values.length}`,
    values,
  );
}

async function logMessage(leadId, direction, body, rawPayload) {
  await query(
    `INSERT INTO messages (lead_id, direction, body, raw_payload, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [leadId, direction, body, JSON.stringify(rawPayload || null)],
  );
}

function looksLikeName(str) {
  return str && str.trim().length >= 2 && /^[a-zA-Z\s]+$/.test(str.trim());
}

function looksLikeEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

// --- Conversation handler

async function handleIncoming(message, contact) {
  console.log("=== HANDLE INCOMING CALLED ===");
  console.log("Message:", message);
  console.log("Contact:", contact);

  const waPhone = message.from;
  const profileName = contact?.profile?.name;

  const lead = await findOrCreateLead(waPhone, profileName);

  // Pull user-visible text out of whatever message type Meta sent
  let userText = null;
  let listChoiceId = null;

  if (message.type === "text") {
    userText = message.text?.body?.trim();
  } else if (message.type === "interactive") {
    const i = message.interactive;
    if (i?.type === "list_reply") {
      listChoiceId = i.list_reply.id;
      userText = i.list_reply.title;
    } else if (i?.type === "button_reply") {
      userText = i.button_reply.title;
    }
  } else {
    // voice note, image, sticker, location...
    await sendText(
      waPhone,
      "I can only read text messages right now. Could you type your answer?",
    );
    await logMessage(lead.id, "inbound", `[${message.type}]`, message);
    return;
  }

  await logMessage(lead.id, "inbound", userText, message);

  // Escape hatch: restart
  if (userText && /^(restart|start over|reset)$/i.test(userText)) {
    await setState(lead.id, "awaiting_name");
    await updateLead(lead.id, { name: null, email: null, inquiry_type: null });
    const reply = "No problem, let's start over. What's your full name?";
    await sendText(waPhone, reply);
    await logMessage(lead.id, "outbound", reply);
    return;
  }

  // Get conversation and handle if missing
  let convo = await getConversation(lead.id);

  if (!convo) {
    console.log("Creating missing conversation for lead:", lead.id);
    await query(
      `INSERT INTO conversations (id, lead_id, state, created_at, updated_at)
       VALUES ($1, $2, 'awaiting_name', NOW(), NOW())`,
      [uuidv4(), lead.id],
    );
    convo = await getConversation(lead.id);
    if (!convo) {
      console.error("Failed to create conversation for lead:", lead.id);
      await sendText(
        waPhone,
        "Sorry, there was an error. Please try again later.",
      );
      await logMessage(
        lead.id,
        "outbound",
        "Error: Failed to create conversation",
      );
      return;
    }
  }

  switch (convo.state) {
    case "awaiting_name": {
      if (!userText || !looksLikeName(userText)) {
        const reply =
          "Hi! Welcome to Mctaba CRM. What's your full name? (at least 2 characters)";
        await sendText(waPhone, reply);
        await logMessage(lead.id, "outbound", reply);
        return;
      }
      await updateLead(lead.id, { name: userText });
      await setState(lead.id, "awaiting_email");
      const reply = `Thanks ${userText.split(" ")[0]}! What's your email address?`;
      await sendText(waPhone, reply);
      await logMessage(lead.id, "outbound", reply);
      return;
    }

    case "awaiting_email": {
      if (!looksLikeEmail(userText)) {
        const reply =
          "Hmm, that doesn't look like an email. Could you send it again? Example: yourname@gmail.com";
        await sendText(waPhone, reply);
        await logMessage(lead.id, "outbound", reply);
        return;
      }
      await updateLead(lead.id, { email: userText });
      await setState(lead.id, "awaiting_inquiry_type");
      await sendInquiryList(waPhone);
      await logMessage(lead.id, "outbound", "[interactive list: inquiry type]");
      return;
    }

    case "awaiting_inquiry_type": {
      if (!listChoiceId && !userText) {
        await sendInquiryList(waPhone);
        return;
      }
      const inquiry = listChoiceId || userText;
      await updateLead(lead.id, { inquiry_type: inquiry });
      await setState(lead.id, "confirming");

      const fresh = await query(
        "SELECT name, email, inquiry_type FROM leads WHERE id = $1",
        [lead.id],
      );
      const leadData = fresh.rows[0];

      const reply =
        `Please confirm your details:\n\n` +
        `Name: ${leadData.name}\n` +
        `Email: ${leadData.email}\n` +
        `Inquiry: ${leadData.inquiry_type}\n\n` +
        `Reply "yes" to confirm or "restart" to start over.`;
      await sendText(waPhone, reply);
      await logMessage(lead.id, "outbound", reply);
      return;
    }

    case "confirming": {
      if (/^y(es)?$/i.test(userText || "")) {
        await setState(lead.id, "complete");
        const reply =
          "Thanks! Your details are saved. Someone from our team will be in touch shortly. To start a new inquiry, type 'restart'.";
        await sendText(waPhone, reply);
        await logMessage(lead.id, "outbound", reply);
        return;
      }
      const reply =
        "Reply 'yes' to confirm the details above, or 'restart' to start over.";
      await sendText(waPhone, reply);
      await logMessage(lead.id, "outbound", reply);
      return;
    }

    case "complete":
    default: {
      const reply =
        "Thanks! We already have your details. A team member will be in touch. To start a new inquiry, type 'restart'.";
      await sendText(waPhone, reply);
      await logMessage(lead.id, "outbound", reply);
      return;
    }
  }
}

module.exports = {
  findOrCreateLead,
  getConversation,
  setState,
  updateLead,
  logMessage,
  handleIncoming,
};
