// server/services/chama/commands/dashboard.js
//
// /dashboard (treasurer only): issues a one-time link that logs the treasurer
// into the Next.js dashboard without a password.
const crypto = require("crypto");
const { query: db } = require("../../../config/db");
const env = require("../../../config/env");
const chamaService = require("../chamaService");

module.exports = async function dashboard(bot, message) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  if (message.chat.type === "private") {
    return bot.sendMessage(chatId, "Run /dashboard inside your chama group.");
  }

  const chama = await chamaService.findByChatId(chatId);
  if (!chama) {
    return bot.sendMessage(chatId, "This group is not set up as a chama.");
  }
  if (Number(chama.treasurer_user_id) !== userId) {
    return bot.sendMessage(chatId, "Only the treasurer can open the dashboard.");
  }
  if (!env.TREASURER_URL) {
    return bot.sendMessage(chatId, "The dashboard URL is not configured.");
  }

  const token = crypto.randomUUID();
  await db(
    `INSERT INTO dashboard_sessions (token, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [token, userId],
  );

  const url = `${env.TREASURER_URL}/api/auth?token=${token}`;

  try {
    await bot.sendMessage(
      userId,
      `Open your dashboard (link expires in 1 hour):\n${url}`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "Open dashboard", url }]],
        },
      },
    );
    return bot.sendMessage(chatId, "I sent you a private link to your dashboard.");
  } catch (err) {
    if (err.response?.body?.error_code === 403) {
      return bot.sendMessage(
        chatId,
        "Please start a private chat with me first, then run /dashboard again.",
      );
    }
    throw err;
  }
};
