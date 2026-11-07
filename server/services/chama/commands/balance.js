// server/services/chama/commands/balance.js
const chamaService = require("../chamaService");

module.exports = async function balance(bot, message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const isGroup = message.chat.type !== "private";

  let chamaId;
  if (isGroup) {
    chamaId = chatId;
  } else {
    const memberships = await chamaService.findMemberships(userId);
    if (memberships.length === 0) {
      return bot.sendMessage(chatId, "You are not a member of any chama.");
    }
    if (memberships.length > 1) {
      return bot.sendMessage(
        chatId,
        "You are in multiple chamas. Run /balance from inside the specific group chat.",
      );
    }
    chamaId = memberships[0].chat_id;
  }

  const data = await chamaService.getMemberBalance(chamaId, userId);
  if (!data) {
    return bot.sendMessage(chatId, "You are not a member of this chama.");
  }

  const text =
    `${data.name}, your summary:\n` +
    `Cycle this month: KSh ${(data.contributedThisCycle / 100).toLocaleString()} / ${(data.expectedThisCycle / 100).toLocaleString()}\n` +
    `Total contributed (all time): KSh ${(data.totalContributed / 100).toLocaleString()}\n` +
    `Outstanding fines: KSh ${(data.outstandingFines / 100).toLocaleString()}`;

  // Money info goes to the private chat, never the group.
  try {
    await bot.sendMessage(userId, text);
    if (isGroup) {
      await bot.sendMessage(
        chatId,
        `${data.name}, I sent your balance in a private message.`,
        { reply_to_message_id: message.message_id },
      );
    }
  } catch (err) {
    if (err.response?.body?.error_code === 403) {
      return bot.sendMessage(
        chatId,
        `${data.name}, please start a private chat with me to see your balance.`,
      );
    }
    throw err;
  }
};
