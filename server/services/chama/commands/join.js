// server/services/chama/commands/join.js
const chamaService = require("../chamaService");

module.exports = async function join(bot, message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const name = message.from.first_name || "Member";

  if (message.chat.type === "private") {
    return bot.sendMessage(
      chatId,
      "Run /join inside the chama group, then reply here with your M-Pesa phone number.",
    );
  }

  const chama = await chamaService.findByChatId(chatId);
  if (!chama) {
    return bot.sendMessage(
      chatId,
      "This group is not set up as a chama. Ask an admin to run /setup.",
    );
  }

  const existing = await chamaService.findMember(chatId, userId);
  if (existing) {
    return bot.sendMessage(chatId, `${name}, you are already a member.`);
  }

  // The phone number is collected privately so it is never posted in the group.
  try {
    await bot.sendMessage(
      userId,
      `Welcome to ${chama.name}. Please reply with your M-Pesa phone number in the format +254712345678.`,
    );
  } catch (err) {
    if (err.response?.body?.error_code === 403) {
      return bot.sendMessage(
        chatId,
        `${name}, please start a private chat with me first, then run /join again.`,
      );
    }
    throw err;
  }

  await chamaService.startMemberOnboarding(userId, chatId);
};
