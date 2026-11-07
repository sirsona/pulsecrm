// server/services/chama/commands/members.js
const chamaService = require("../chamaService");

module.exports = async function members(bot, message) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  if (message.chat.type === "private") {
    return bot.sendMessage(chatId, "Run /members inside the chama group.");
  }

  const chama = await chamaService.findByChatId(chatId);
  if (!chama) return;

  if (Number(chama.treasurer_user_id) !== userId) {
    return bot.sendMessage(chatId, "Only the treasurer can run /members.");
  }

  const list = await chamaService.getMemberStatusList(chatId);
  const lines = list.map((m) => {
    const ok = m.contributedThisCycle >= m.expectedThisCycle;
    return `${ok ? "OK" : "MISSING"} ${m.name}: KSh ${(m.contributedThisCycle / 100).toLocaleString()} / ${(m.expectedThisCycle / 100).toLocaleString()}`;
  });

  try {
    await bot.sendMessage(userId, `Members status:\n${lines.join("\n")}`);
  } catch (err) {
    if (err.response?.body?.error_code === 403) {
      return bot.sendMessage(
        chatId,
        "Please start a private chat with me to see the member list.",
      );
    }
    throw err;
  }
};
