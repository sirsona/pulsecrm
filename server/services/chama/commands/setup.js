// server/services/chama/commands/setup.js
const chamaService = require("../chamaService");

module.exports = async function setup(bot, message, args) {
  const chatId = message.chat.id;

  if (message.chat.type === "private") {
    return bot.sendMessage(
      chatId,
      "Setup must be run inside the chama group chat.",
    );
  }

  const existing = await chamaService.findByChatId(chatId);
  if (existing) {
    return bot.sendMessage(
      chatId,
      `This group is already set up as "${existing.name}".`,
    );
  }

  const member = await bot.getChatMember(chatId, message.from.id);
  if (member.status !== "creator" && member.status !== "administrator") {
    return bot.sendMessage(chatId, "Only a group admin can run /setup.");
  }

  if (!args || args.length < 3) {
    return bot.sendMessage(
      chatId,
      "Usage: /setup <name> <monthly_amount_ksh> <cycle_day>\n" +
        "Example: /setup Kilimani Chama 1000 1",
    );
  }

  const name = args.slice(0, args.length - 2).join(" ");
  const monthlyKsh = parseInt(args[args.length - 2], 10);
  const cycleDay = parseInt(args[args.length - 1], 10);

  if (isNaN(monthlyKsh) || monthlyKsh <= 0) {
    return bot.sendMessage(chatId, "Invalid monthly amount.");
  }
  if (isNaN(cycleDay) || cycleDay < 1 || cycleDay > 28) {
    return bot.sendMessage(chatId, "Cycle day must be between 1 and 28.");
  }

  await chamaService.create({
    chatId,
    name,
    monthlyAmountCents: monthlyKsh * 100,
    cycleDay,
    treasurerUserId: message.from.id,
  });

  return bot.sendMessage(
    chatId,
    `"${name}" is now a chama.\n` +
      `Monthly: KSh ${monthlyKsh}\n` +
      `Cycle day: ${cycleDay}\n` +
      `Treasurer: ${message.from.first_name}\n\n` +
      `Members: type /join to register.`,
  );
};
