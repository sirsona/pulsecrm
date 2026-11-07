const TelegramBot = require("node-telegram-bot-api");
const env = require("../config/env");
const { query: dbQuery } = require("../config/db");

const { getClient } = require("../config/redis");
const SESSION_TTL = 600; // 10 minutes

const sessionKey = (chatId, userId) => `telegram:session:${chatId}:${userId}`;

async function getSession(chatId, userId) {
  const client = await getClient();
  const raw = await client.get(sessionKey(chatId, userId));
  return raw ? JSON.parse(raw) : { state: "idle", context: {} };
}

async function setSession(chatId, userId, data) {
  const client = await getClient();
  await client.set(sessionKey(chatId, userId), JSON.stringify(data), {
    EX: SESSION_TTL,
  });
}

const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { webHook: false });

async function sendMessage(chatId, text, extra = {}) {
  return bot.sendMessage(chatId, text, extra);
}

async function processUpdate(update) {
  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.chat_member) {
      await handleChatMemberUpdate(update.chat_member);
    } else if (update.my_chat_member) {
      await handleBotMembershipUpdate(update.my_chat_member);
    }
  } catch (err) {
    console.error("Telegram update error:", err);
  }
}

async function handleMessage(message) {
  //   console.log(message);
  const chatId = message.chat.id;
  const text = message.text || "";
  const userId = message.from.id;
  const session = await getSession(chatId, userId);

  const settings = chatId < 0 ? await getGroupSettings(chatId) : null;
  const count = chatId < 0 ? await incrementMessageCount(chatId, userId) : 0;
  if (settings && count > settings.max_messages_per_minute) {
    await bot.sendMessage(
      chatId,
      `${message.from.first_name} is posting too fast. Muted for 5 minutes.`,
    );
    await bot.restrictChatMember(chatId, userId, {
      permissions: { can_send_messages: false },
      until_date: Math.floor(Date.now() / 1000) + 300,
    });
    return;
  }

  if (session.state === "awaiting_custom_amount") {
    const amount = parseInt(text, 10);
    if (isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, "Please type a number greater than 0.");
      return;
    }
    await confirmContribution(chatId, userId, amount);
    return;
  }
  await dbQuery(
    `INSERT INTO telegram_chats (id, type, title, username)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET last_active_at = NOW()`,
    [chatId, message.chat.type, message.chat.title, message.chat.username],
  );

  if (text === "/start") {
    await bot.sendMessage(
      chatId,
      "Welcome to Chama Bot! What would you like to do?",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Contribute", callback_data: "contribute" }],
            [{ text: "My balance", callback_data: "balance" }],
            [{ text: "Group stats", callback_data: "stats" }],
          ],
        },
      },
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      "Available commands:\n" +
        "/start - start the bot\n" +
        "/help - show this message\n" +
        "/echo <text> - echo back\n",
    );
    return;
  }
  if (text === "/contribute") {
    await promptContribution(chatId, userId);
    return;
  }
  if (text === "/broadcast" || text.startsWith("/broadcast ")) {
    const body = text.slice("/broadcast".length).trim();
    if (!(chatId < 0 && (await isGroupAdmin(chatId, userId)))) {
      return bot.sendMessage(chatId, "Only group admins can broadcast.");
    }
    if (body.length < 3) return bot.sendMessage(chatId, "Message too short.");
    const { sent, failed } = await broadcast(body);
    return bot.sendMessage(
      chatId,
      `Broadcast done: ${sent} sent, ${failed} failed.`,
    );
  }

  if (text.startsWith("/echo ")) {
    await sendMessage(chatId, text.slice(6));
    return;
  }
  if (text === "/kick" && message.reply_to_message) {
    if (!(await isGroupAdmin(chatId, userId))) {
      return bot.sendMessage(chatId, "Only admins can kick members.");
    }
    const targetId = message.reply_to_message.from.id;
    await bot.banChatMember(chatId, targetId);
    await bot.unbanChatMember(chatId, targetId); // "kick" = ban + unban immediately
    await bot.sendMessage(chatId, "Kicked.");
    return;
  }

  if (text && chatId > 0) {
    await sendMessage(chatId, `You said: ${text}`);
  }
}

async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const data = query.data;

  const userId = query.from.id;
  //   console.log(data);

  // Always acknowledge so the spinning icon goes away
  await bot.answerCallbackQuery(query.id);

  if (data.startsWith("acc:")) {
    const allowedUserId = parseInt(data.slice(4), 10);
    if (query.from.id !== allowedUserId) {
      return bot.answerCallbackQuery(query.id, {
        text: "This button is not for you.",
        show_alert: true,
      });
    }
    await bot.restrictChatMember(query.message.chat.id, allowedUserId, {
      permissions: { can_send_messages: true, can_send_media_messages: true },
    });
    await bot.editMessageText(
      `Thanks ${query.from.first_name}! You can now participate.`,
      { chat_id: query.message.chat.id, message_id: query.message.message_id },
    );
  }

  if (data === "contribute") {
    await promptContribution(chatId, userId);
  } else if (data === "balance") {
    await showBalance(chatId, userId);
  } else if (data === "stats") {
    await showStats(chatId);
  } else if (data === "amt:custom") {
    await setSession(chatId, userId, {
      state: "awaiting_custom_amount",
      context: {},
    });
    await bot.sendMessage(chatId, "Type the amount in KSh:");
  } else if (data.startsWith("amt:")) {
    const amount = parseInt(data.slice(4), 10);
    await confirmContribution(chatId, userId, amount);
    //   } else if (data === "cnf:yes") {
    //     const session = await getSession(chatId, userId);
    //     const amount = session.context && session.context.amount;
    //     if (!amount) {
    //       await bot.sendMessage(
    //         chatId,
    //         "Session expired. Start again with /start.",
    //       );
    //       return;
    //     }
    //     await dbQuery(
    //       `INSERT INTO telegram_contributions (chat_id, user_id, amount) VALUES ($1, $2, $3)`,
    //       [chatId, userId, amount],
    //     );
    //     await setSession(chatId, userId, { state: "idle", context: {} });
    //     await bot.sendMessage(
    //       chatId,
    //       `Contribution of KSh ${amount} received. Asante!`,
    //     );
    //   } else if (data === "cnf:no") {
    //     await setSession(chatId, userId, { state: "idle", context: {} });
    //     await bot.sendMessage(chatId, "Contribution cancelled.");
    //   }
  } else if (data === "cnf:yes") {
    const session = await getSession(chatId, userId);
    if (session.state !== "confirming") return; // stale tap: already decided
    const amount = session.context && session.context.amount;
    await dbQuery(
      `INSERT INTO telegram_contributions (chat_id, user_id, amount) VALUES ($1, $2, $3)`,
      [chatId, userId, amount],
    );
    await setSession(chatId, userId, { state: "idle", context: {} });
    await bot.editMessageText(
      `✓ Contribution of KSh ${amount} received. Asante!`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      },
    );
  } else if (data === "cnf:no") {
    const session = await getSession(chatId, userId);
    if (session.state !== "confirming") return; // stale tap: already decided
    await setSession(chatId, userId, { state: "idle", context: {} });
    await bot.editMessageText("Contribution cancelled.", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
    });
  }
}

async function promptContribution(chatId, userId) {
  await setSession(chatId, userId, { state: "awaiting_amount", context: {} });
  await bot.sendMessage(chatId, "How much are you contributing?", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "KSh 500", callback_data: "amt:500" },
          { text: "KSh 1000", callback_data: "amt:1000" },
          { text: "KSh 2000", callback_data: "amt:2000" },
        ],
        [{ text: "Custom amount", callback_data: "amt:custom" }],
      ],
    },
  });
}

async function showBalance(chatId, userId) {
  await bot.sendMessage(
    chatId,
    "Your balance: KSh 0.00 (balances come with the DB work).",
  );
}

async function showStats(chatId) {
  await bot.sendMessage(chatId, "Group stats are coming later this week.");
}

async function confirmContribution(chatId, userId, amount) {
  await setSession(chatId, userId, {
    state: "confirming",
    context: { amount },
  });
  await bot.sendMessage(chatId, `Confirm contribution of KSh ${amount}?`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Yes, contribute", callback_data: "cnf:yes" },
          { text: "Cancel", callback_data: "cnf:no" },
        ],
      ],
    },
  });
}

// async function handleChatMemberUpdate(event) {
//   const oldStatus = event.old_chat_member.status;
//   const newStatus = event.new_chat_member.status;
//   const user = event.new_chat_member.user;

//   // A user joined
//   if (
//     (oldStatus === "left" || oldStatus === "kicked") &&
//     newStatus === "member"
//   ) {
//     await bot.restrictChatMember(event.chat.id, user.id, {
//       permissions: { can_send_messages: false },
//     });

//     await bot.sendMessage(
//       event.chat.id,
//       `Welcome ${user.first_name}! Please read and accept the rules:\n\n1. Be kind.\n2. No spam.\n3. English or Kiswahili only.`,
//       {
//         reply_markup: {
//           inline_keyboard: [
//             [{ text: "Accept rules", callback_data: `acc:${user.id}` }],
//           ],
//         },
//       },
//     );

//     await dbQuery(
//       `INSERT INTO group_members (chat_id, user_id, first_name, joined_at)
//        VALUES ($1, $2, $3, NOW())
//        ON CONFLICT (chat_id, user_id) DO UPDATE SET first_name = $3`,
//       [event.chat.id, user.id, user.first_name],
//     );
//   }

//   // A user left
//   if (
//     (oldStatus === "member" || oldStatus === "administrator") &&
//     newStatus === "left"
//   ) {
//     await dbQuery(
//       `UPDATE group_members SET left_at = NOW() WHERE chat_id = $1 AND user_id = $2`,
//       [event.chat.id, user.id],
//     );
//   }
// }

async function handleChatMemberUpdate(event) {
  const oldStatus = event.old_chat_member.status;
  const newStatus = event.new_chat_member.status;
  const user = event.new_chat_member.user;

  // CASE 1: A user joined the group
  if (
    (oldStatus === "left" || oldStatus === "kicked") &&
    newStatus === "member"
  ) {
    // Instantly mute the user upon entry to block automated spambots
    await bot.restrictChatMember(event.chat.id, user.id, {
      permissions: { can_send_messages: false },
    });

    // Send greeting with verification instructions and captcha button
    await bot.sendMessage(
      event.chat.id,
      `Welcome ${user.first_name}! Please read and accept the rules:\n\n1. Be kind.\n2. No spam.\n3. English or Kiswahili only.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Accept rules", callback_data: `acc:${user.id}` }],
          ],
        },
      },
    );

    // Record or update the member's profile and join timestamp
    await dbQuery(
      `INSERT INTO group_members (chat_id, user_id, first_name, joined_at, left_at)
       VALUES ($1, $2, $3, NOW(), NULL)
       ON CONFLICT (chat_id, user_id) DO UPDATE SET first_name = $3, left_at = NULL`,
      [event.chat.id, user.id, user.first_name],
    );
    return;
  }

  // CASE 2: A user left or was kicked/banned from the group
  if (
    (oldStatus === "member" || oldStatus === "administrator") &&
    (newStatus === "left" || newStatus === "kicked")
  ) {
    // Stamp the exit time to keep historical record accurate
    await dbQuery(
      `UPDATE group_members 
       SET left_at = NOW() 
       WHERE chat_id = $1 AND user_id = $2`,
      [event.chat.id, user.id],
    );
  }
}

// async function handleBotMembershipUpdate(event) {
//   const chatId = event.chat.id;
//   const oldStatus = event.old_chat_member.status;
//   const newStatus = event.new_chat_member.status;

//   // Bot was added (or promoted) in a group
//   if (
//     (oldStatus === "left" || oldStatus === "kicked") &&
//     (newStatus === "member" || newStatus === "administrator")
//   ) {
//     await dbQuery(
//       `INSERT INTO telegram_chats (id, type, title, username)
//        VALUES ($1, $2, $3, $4)
//        ON CONFLICT (id) DO UPDATE SET last_active_at = NOW()`,
//       [chatId, event.chat.type, event.chat.title, event.chat.username || null],
//     );
//     // Default per-group settings row
//     await dbQuery(
//       `INSERT INTO group_settings (chat_id) VALUES ($1)
//        ON CONFLICT (chat_id) DO NOTHING`,
//       [chatId],
//     );
//     console.log(
//       `Bot added to chat ${chatId} (${event.chat.title}) as ${newStatus}`,
//     );
//   }
// }
async function handleBotMembershipUpdate(event) {
  const chatId = event.chat.id;
  const oldStatus = event.old_chat_member.status;
  const newStatus = event.new_chat_member.status;

  // CASE 1: Bot was added (or promoted) in a group
  if (
    (oldStatus === "left" || oldStatus === "kicked") &&
    (newStatus === "member" || newStatus === "administrator")
  ) {
    // Register or reactivate the chat room
    await dbQuery(
      `INSERT INTO telegram_chats (id, type, title, username)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET last_active_at = NOW()`,
      [chatId, event.chat.type, event.chat.title, event.chat.username || null],
    );

    // Initialize default per-group settings row so system features have data to read
    await dbQuery(
      `INSERT INTO group_settings (chat_id) VALUES ($1)
       ON CONFLICT (chat_id) DO NOTHING`,
      [chatId],
    );

    console.log(
      `Bot added to chat ${chatId} (${event.chat.title}) as ${newStatus}`,
    );
    return;
  }

  // CASE 2: Proactive Self-Cleaning (Bot was kicked, banned, or left the group)
  if (newStatus === "left" || newStatus === "kicked") {
    // Delete group configuration settings first to preserve foreign key integrity
    await dbQuery(`DELETE FROM group_settings WHERE chat_id = $1`, [chatId]);

    // Delete the primary chat room registration entry
    await dbQuery(`DELETE FROM telegram_chats WHERE id = $1`, [chatId]);

    console.log(
      `Bot removed from chat ${chatId} (${event.chat.title}). Database records cleaned.`,
    );
  }
}

async function isGroupAdmin(chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

async function incrementMessageCount(chatId, userId) {
  const client = await getClient();
  const key = `spam:${chatId}:${userId}`;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 60); // reset every minute
  return count;
}

async function getGroupSettings(chatId) {
  const client = await getClient();
  const cacheKey = `tg:settings:${chatId}`;
  const cached = await client.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const defaults = { max_messages_per_minute: 10, language: "en" };
  const res = await dbQuery(
    `SELECT max_messages_per_minute, language FROM group_settings WHERE chat_id = $1`,
    [chatId],
  );
  const settings = res.rows[0] || defaults;
  await client.set(cacheKey, JSON.stringify(settings), { EX: 300 });
  return settings;
}

// async function broadcast(text, { rateMs = 50 } = {}) {
//   const { rows } = await dbQuery(
//     "SELECT id FROM telegram_chats WHERE type IN ('group', 'supergroup')",
//   );
//   let sent = 0;
//   let failed = 0;

//   for (const chat of rows) {
//     try {
//       await bot.sendMessage(chat.id, text, { parse_mode: "HTML" });
//       sent++;
//     } catch (err) {
//       if (err.response?.body?.error_code === 403) {
//         // Bot was removed from the chat; delete the record
//         await dbQuery("DELETE FROM telegram_chats WHERE id = $1", [chat.id]);
//       } else if (err.response?.body?.error_code === 429) {
//         // Rate limited; sleep a second and retry
//         const retryAfter =
//           (err.response.body.parameters?.retry_after || 1) * 1000;
//         await new Promise((r) => setTimeout(r, retryAfter));
//         try {
//           await bot.sendMessage(chat.id, text);
//           sent++;
//         } catch {
//           failed++;
//         }
//       } else {
//         failed++;
//       }
//     }
//     await new Promise((r) => setTimeout(r, rateMs));
//   }

//   return { sent, failed };
// }
async function broadcast(text, { rateMs = 50 } = {}) {
  const created = await dbQuery(
    `INSERT INTO broadcasts (text) VALUES ($1) RETURNING id`,
    [text],
  );
  const broadcastId = created.rows[0].id;

  const { rows } = await dbQuery(
    "SELECT id FROM telegram_chats WHERE type IN ('group', 'supergroup')",
  );
  let sent = 0;
  let failed = 0;

  const record = async (chatId, status) =>
    dbQuery(
      `INSERT INTO broadcast_deliveries (broadcast_id, chat_id, sent_at, status)
       VALUES ($1, $2, NOW(), $3)`,
      [broadcastId, chatId, status],
    );

  for (const chat of rows) {
    const already = await dbQuery(
      `SELECT 1 FROM broadcast_deliveries WHERE broadcast_id = $1 AND chat_id = $2`,
      [broadcastId, chat.id],
    );
    if (already.rows.length > 0) continue;

    try {
      await bot.sendMessage(chat.id, text, { parse_mode: "HTML" });
      sent++;
      await record(chat.id, "sent");
    } catch (err) {
      const code = err.response?.body?.error_code;
      if (code === 403) {
        // Bot was removed from the chat; delete the record
        await dbQuery("DELETE FROM telegram_chats WHERE id = $1", [chat.id]);
        failed++;
        await record(chat.id, "failed");
      } else if (code === 429) {
        // Rate limited; sleep a second and retry
        const retryAfter =
          (err.response.body.parameters?.retry_after || 1) * 1000;
        await new Promise((r) => setTimeout(r, retryAfter));
        try {
          await bot.sendMessage(chat.id, text, { parse_mode: "HTML" });
          sent++;
          await record(chat.id, "sent");
        } catch {
          failed++;
          await record(chat.id, "failed");
        }
      } else {
        failed++;
        await record(chat.id, "failed");
      }
    }
    await new Promise((r) => setTimeout(r, rateMs));
  }

  await dbQuery(`UPDATE broadcasts SET completed_at = NOW() WHERE id = $1`, [
    broadcastId,
  ]);
  return { sent, failed };
}
module.exports = { bot, sendMessage, processUpdate, broadcast };
