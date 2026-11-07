// server/services/chama/commands/rename.js
//
// /rename <new name> — treasurer only: rename the chama.
const chamaService = require("../chamaService");

module.exports = async function rename(bot, message, args) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  if (message.chat.type === "private") {
    return bot.sendMessage(chatId, "Run /rename inside the chama group.");
  }

  const chama = await chamaService.findByChatId(chatId);
  if (!chama) {
    return bot.sendMessage(chatId, "This group is not set up as a chama.");
  }
  if (Number(chama.treasurer_user_id) !== userId) {
    return bot.sendMessage(chatId, "Only the treasurer can rename the chama.");
  }

  const newName = (args || []).join(" ").trim();
  if (newName.length < 2 || newName.length > 60) {
    return bot.sendMessage(
      chatId,
      "Usage: /rename <new name> (2-60 characters)",
    );
  }

  await chamaService.renameChama(chatId, newName);
  return bot.sendMessage(chatId, `This chama is now called "${newName}".`);
};
