// server/services/chama/commands/contribute.js
//
// Chama-aware /contribute: sends the payment keyboard privately, then hands
// the chosen amount to chamaService.initiateContribution (Paystack).
const chamaService = require("../chamaService");

async function promptForChama(bot, chatId, userId, chamaId) {
  const chama = await chamaService.findByChatId(chamaId);
  if (!chama) return bot.sendMessage(chatId, "This group is not a chama.");

  const member = await chamaService.findMember(chamaId, userId);
  if (!member) return bot.sendMessage(chatId, "Run /join first.");

  const cycle = await chamaService.getOpenCycle(chamaId);
  if (!cycle) {
    return bot.sendMessage(
      chatId,
      "No open cycle. Ask the treasurer to open one.",
    );
  }

  const expected = chamaService.expectedForMember(chama, cycle, member);
  const periodLabel = new Date(cycle.period_start).toLocaleDateString("en-KE", {
    month: "long",
  });

  // Payment flows stay in the private chat, never the group.
  try {
    await bot.sendMessage(userId, `Contribute for ${chama.name}:`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `Contribute KSh ${expected / 100} for ${periodLabel}`,
              callback_data: `cntb:${cycle.id}:${expected}`,
            },
          ],
          [{ text: "Custom amount", callback_data: `cntb:${cycle.id}:custom` }],
          [{ text: "Cancel", callback_data: "cntb:cancel" }],
        ],
      },
    });
    if (chatId !== userId) {
      await bot.sendMessage(
        chatId,
        "I sent you a private message to complete your contribution.",
      );
    }
  } catch (err) {
    if (err.response?.body?.error_code === 403) {
      return bot.sendMessage(
        chatId,
        "Please start a private chat with me first, then run /contribute again.",
      );
    }
    throw err;
  }
}

async function contribute(bot, message) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  if (message.chat.type === "private") {
    const memberships = await chamaService.findMemberships(userId);
    if (memberships.length === 0) {
      return bot.sendMessage(chatId, "You are not a member of any chama.");
    }
    if (memberships.length > 1) {
      return bot.sendMessage(
        chatId,
        "You are in multiple chamas. Run /contribute from inside the specific group.",
      );
    }
    return promptForChama(bot, chatId, userId, memberships[0].chat_id);
  }

  return promptForChama(bot, chatId, userId, chatId);
}

// Called from the cntb: callback branch and the custom-amount session step.
async function initiate(bot, chatId, userId, cycleId, amountCents, messageId) {
  const editOrSend = async (text) => {
    if (messageId) {
      try {
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        });
        return;
      } catch (err) {
        if (!/not modified/i.test(err.message || "")) {
          console.error("editMessageText failed:", err.message);
        }
      }
    }
    await bot.sendMessage(chatId, text);
  };

  try {
    await editOrSend("Creating your Paystack payment link...");
    const result = await chamaService.initiateContribution({
      userId,
      cycleId,
      amountCents,
    });
    if (result.alreadyPaid) {
      await editOrSend(
        `Good news: your KSh ${(amountCents / 100).toLocaleString()} ` +
          `contribution was already paid. The group has been notified.`,
      );
      return;
    }
    await editOrSend(
      `Pay KSh ${(amountCents / 100).toLocaleString()} with Paystack:\n` +
        `${result.authorizationUrl}\n\n` +
        `Reference: ${result.contributionId.slice(0, 8)}\n` +
        `The group will be notified once payment is confirmed.`,
    );
  } catch (err) {
    console.error("Chama contribute failed:", err.message);
    const friendly = /pending contribution/.test(err.message)
      ? err.message
      : "Could not start the payment. Please try again.";
    await editOrSend(friendly);
  }
}

module.exports = contribute;
module.exports.initiate = initiate;
