"use strict";
// server/services/telegramBot.service.js
//
// Improved Telegram Chama bot (replaces telegram.service.js).
// Own service module. Updates are delivered by routes/telegramBot.routes.js
// (Express POST /telegram-bot/webhook) and the webhook is registered with
// Telegram at server boot via registerWebhook().
//
// Environment variables used (see ../config/env.js):
//   TELEGRAM_BOT_TOKEN      – bot token (required for the bot to do anything)
//   TELEGRAM_WEBHOOK_URL    – public HTTPS URL Telegram POSTs updates to,
//                             e.g. https://your-host.example.com/telegram-bot/webhook
//   TELEGRAM_WEBHOOK_SECRET – optional shared secret. Telegram echoes it back in
//                             the "X-Telegram-Bot-Api-Secret-Token" header on every
//                             update; the route verifies it so the endpoint cannot
//                             be spoofed.

const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");
const env = require("../config/env");
const { query: db } = require("../config/db");
const { getClient } = require("../config/redis");
const { runWithRedisLock } = require("../cron/redisLock");
const chamaService = require("./chama/chamaService");
const chamaSetup = require("./chama/commands/setup");
const chamaJoin = require("./chama/commands/join");
const chamaBalance = require("./chama/commands/balance");
const chamaStats = require("./chama/commands/stats");
const chamaMembers = require("./chama/commands/members");
const chamaContribute = require("./chama/commands/contribute");
const chamaDashboard = require("./chama/commands/dashboard");
const chamaRename = require("./chama/commands/rename");

const SESSION_TTL_SECONDS = 600; // 10 minutes per conversation step
const SPAM_WINDOW_SECONDS = 60; // rate window for anti-spam
const SPAM_MUTE_SECONDS = 300; // 5 minute mute for posting too fast
const SETTINGS_CACHE_SECONDS = 300; // how long group settings are cached

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isGroupId = (chatId) => typeof chatId === "number" && chatId < 0;

/* ------------------------------------------------------------------ *
 * Bot instance
 * ------------------------------------------------------------------ */

// We never let the library run its own polling/webhook servers; updates
// arrive through our Express route (POST /telegram-bot/webhook) instead.
const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN || "", {
  polling: false,
  webHook: false,
});

const isConfigured = () => Boolean(env.TELEGRAM_BOT_TOKEN);

/**
 * Register (or refresh) the Telegram webhook pointing at our Express route.
 * Called from index.js after the HTTP server starts listening.
 * Returns { ok, url? , error? } and never throws.
 */
async function registerWebhook() {
  if (!isConfigured()) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  }
  if (!env.TELEGRAM_WEBHOOK_URL) {
    return {
      ok: false,
      error:
        "TELEGRAM_WEBHOOK_URL is not set - add your public HTTPS URL (ending in /telegram-bot/webhook) to .env so Telegram can deliver updates",
    };
  }
  if (!/^https:\/\//i.test(env.TELEGRAM_WEBHOOK_URL)) {
    return {
      ok: false,
      error: "TELEGRAM_WEBHOOK_URL must be a public HTTPS URL",
    };
  }
  try {
    // Drop queued updates only when the webhook URL changes; on a plain
    // restart, keep them so commands sent during the gap are still handled.
    let previousUrl = "";
    try {
      const before = await bot.getWebHookInfo();
      previousUrl = (before && before.url) || "";
    } catch (err) {
      console.warn("getWebHookInfo before setWebHook failed:", err.message);
    }
    const options = {
      allowed_updates: JSON.stringify([
        "message",
        "callback_query",
        "chat_member",
        "my_chat_member",
      ]),
      drop_pending_updates: previousUrl !== env.TELEGRAM_WEBHOOK_URL,
    };
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      options.secret_token = env.TELEGRAM_WEBHOOK_SECRET;
    }
    const result = await bot.setWebHook(env.TELEGRAM_WEBHOOK_URL, options);
    const info = await bot.getWebHookInfo();
    const registered = Boolean(result && info && info.url === env.TELEGRAM_WEBHOOK_URL);
    if (registered) {
      console.log(
        `Telegram webhook registered -> ${env.TELEGRAM_WEBHOOK_URL}` +
          (env.TELEGRAM_WEBHOOK_SECRET ? " (with secret token)" : " (NO secret token!)"),
      );
    } else {
      console.warn("Telegram webhook may not be active:", JSON.stringify(info));
    }
    return { ok: registered, url: env.TELEGRAM_WEBHOOK_URL };
  } catch (err) {
    console.error("Telegram webhook registration failed:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Check the secret Telegram sends back on every update.
 * If no secret is configured we accept the update (development mode) but
 * registerWebhook() already warned about it.
 */
function verifyRequestSecret(req) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  const header = req.get("x-telegram-bot-api-secret-token") || "";
  if (!header || header.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(secret));
}

/* ------------------------------------------------------------------ *
 * Redis-backed session helpers (one dialogue per chat + user)
 * ------------------------------------------------------------------ */

const sessionKey = (chatId, userId) => `tgBot:session:${chatId}:${userId}`;

async function getSession(chatId, userId) {
  const client = await getClient();
  const raw = await client.get(sessionKey(chatId, userId));
  return raw ? JSON.parse(raw) : { state: "idle", context: {} };
}

async function setSession(chatId, userId, data) {
  const client = await getClient();
  await client.set(sessionKey(chatId, userId), JSON.stringify(data), {
    EX: SESSION_TTL_SECONDS,
  });
}

async function clearSession(chatId, userId) {
  const client = await getClient();
  await client.del(sessionKey(chatId, userId));
}

/* ------------------------------------------------------------------ *
 * Update entry point (called by the webhook route)
 * ------------------------------------------------------------------ */

async function processUpdate(update) {
  if (!update || typeof update !== "object") return;
  if (update.message && update.message.from) {
    return safe(() => handleMessage(update.message), "message");
  }
  if (update.callback_query) {
    return safe(() => handleCallbackQuery(update.callback_query), "callback_query");
  }
  if (update.chat_member) {
    return safe(() => handleChatMember(update.chat_member), "chat_member");
  }
  if (update.my_chat_member) {
    return safe(() => handleBotMembership(update.my_chat_member), "my_chat_member");
  }
  // channel_post / edited_message / message_reaction etc. are not handled.
}

async function safe(fn, label) {
  try {
    await fn();
  } catch (err) {
    console.error(`Telegram update (${label}) failed:`, err && err.message ? err.message : err);
  }
}

/* ------------------------------------------------------------------ *
 * Chat registration / DB helpers
 * ------------------------------------------------------------------ */

async function upsertChat(chat) {
  await db(
    `INSERT INTO telegram_chats (id, type, title, username)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET type = EXCLUDED.type,
           title = EXCLUDED.title,
           username = EXCLUDED.username,
           last_active_at = NOW()`,
    [chat.id, chat.type, chat.title || null, chat.username || null],
  );
}

async function recordContribution(chatId, userId, amount) {
  await db(
    `INSERT INTO telegram_contributions (chat_id, user_id, amount)
     VALUES ($1, $2, $3)`,
    [chatId, userId, amount],
  );
}

async function userBalance(userId) {
  const { rows } = await db(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total,
            COUNT(*)::int AS count
     FROM telegram_contributions
     WHERE user_id = $1`,
    [userId],
  );
  return rows[0];
}

async function groupStats(chatId) {
  const { rows } = await db(
    `SELECT COUNT(*)::int AS total_contributions,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today_contributions,
            COALESCE(SUM(amount), 0)::numeric AS total_ksh,
            COUNT(DISTINCT user_id)::int AS contributors
     FROM telegram_contributions
     WHERE chat_id = $1`,
    [chatId],
  );
  const { rows: memberRows } = await db(
    `SELECT COUNT(*)::int AS members
     FROM group_members
     WHERE chat_id = $1 AND left_at IS NULL`,
    [chatId],
  );
  return { ...rows[0], members: memberRows[0] ? memberRows[0].members : 0 };
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

async function handleMessage(message) {
  const chatId = message.chat.id;
  const from = message.from;
  if (!from || from.is_bot) return; // never react to other bots
  const userId = from.id;
  const text = (message.text || "").trim();
  const isGroup = isGroupId(chatId);

  // Keep the chat registry fresh on any activity.
  await upsertChat(message.chat);

  // Anti-spam gate for groups (before command handling).
  if (isGroup) {
    const settings = await getGroupSettings(chatId);
    const count = await incrementSpamCount(chatId, userId);
    if (count > settings.max_messages_per_minute) {
      await muteForSeconds(chatId, from, SPAM_MUTE_SECONDS);
      return;
    }
  }

  const session = await getSession(chatId, userId);

  // Resume the chama "type a custom amount" step.
  if (session.state === "awaiting_chama_amount") {
    const amountKsh = parseInt(text, 10);
    if (!text || isNaN(amountKsh) || amountKsh <= 0) {
      await bot.sendMessage(chatId, "Please type a number greater than 0.");
      return;
    }
    const cycleId = session.context && session.context.cycleId;
    await clearSession(chatId, userId);
    return chamaContribute.initiate(
      bot,
      chatId,
      userId,
      cycleId,
      amountKsh * 100,
    );
  }

  // Resume the "type a custom amount" step.
  if (session.state === "awaiting_custom_amount") {
    const amount = parseInt(text, 10);
    if (!text || isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, "Please type a number greater than 0.");
      return;
    }
    await confirmContribution(chatId, userId, amount);
    return;
  }

  if (!text) return; // photos/stickers/etc: nothing to do

  // Chama onboarding: a private-chat reply with a phone number completes /join.
  if (!isGroup) {
    const onboardingChamaId = await chamaService.getMemberOnboarding(userId);
    if (onboardingChamaId && /^\+?\d{9,14}$/.test(text)) {
      const result = await chamaService.completeMemberOnboarding({
        userId,
        chamaId: onboardingChamaId,
        name: from.first_name || "Member",
        phone: text,
      });
      await bot.sendMessage(
        userId,
        "You are now a member. Contribute anytime with /contribute.",
      );
      await bot.sendMessage(
        onboardingChamaId,
        `Welcome ${from.first_name || "Member"}! Total members: ${result.memberCount}`,
      );
      return;
    }
  }

  const cmd = (text.split(/\s+/)[0] || "").split("@")[0]; // strip /cmd@BotName

  switch (cmd) {
    case "/start":
      return sendStart(chatId, isGroup);
    case "/help":
      return sendHelp(chatId);
    case "/setup":
      return chamaSetup(
        bot,
        message,
        text.slice(cmd.length).trim().split(/\s+/).filter(Boolean),
      );
    case "/join":
      return chamaJoin(bot, message);
    case "/members":
      return chamaMembers(bot, message);
    case "/dashboard":
      return chamaDashboard(bot, message);
    case "/rename":
      return chamaRename(
        bot,
        message,
        text.slice(cmd.length).trim().split(/\s+/).filter(Boolean),
      );
    case "/contribute": {
      const chamaHere = isGroup
        ? Boolean(await chamaService.findByChatId(chatId))
        : (await chamaService.findMemberships(userId)).length > 0;
      if (chamaHere) return chamaContribute(bot, message);
      return promptContribution(chatId, userId);
    }
    case "/balance": {
      const inChama = isGroup
        ? Boolean(await chamaService.findByChatId(chatId))
        : (await chamaService.findMemberships(userId)).length > 0;
      if (inChama) return chamaBalance(bot, message);
      return showBalance(chatId, userId);
    }
    case "/stats": {
      const chama = isGroup ? await chamaService.findByChatId(chatId) : null;
      if (chama) return chamaStats(bot, message);
      return showStats(chatId, userId, isGroup);
    }
    case "/broadcast": {
      if (!isGroup || !(await isGroupAdmin(chatId, userId))) {
        return bot.sendMessage(chatId, "Only group admins can broadcast.");
      }
      const body = text.slice(cmd.length).trim();
      if (body.length < 3) return bot.sendMessage(chatId, "Message too short.");
      const { sent, failed } = await broadcast(body);
      return bot.sendMessage(
        chatId,
        `Broadcast done: ${sent} sent, ${failed} failed.`,
      );
    }
    case "/kick": {
      if (!isGroup) {
        return bot.sendMessage(
          chatId,
          "Kick only works inside a group, and only group admins can use it.",
        );
      }
      if (!(await isGroupAdmin(chatId, userId))) {
        return bot.sendMessage(chatId, "Only group admins can kick members.", {
          reply_to_message_id: message.message_id,
        });
      }
      const reply = message.reply_to_message;
      if (!reply || !reply.from || reply.from.is_bot) {
        return bot.sendMessage(
          chatId,
          "Reply to a member's message with /kick to remove them.",
          { reply_to_message_id: message.message_id },
        );
      }
      const targetId = reply.from.id;
      const targetName = reply.from.first_name || "that member";

      // Telegram forbids kicking the chat owner or admins; check first so we
      // can give a clear answer instead of failing silently.
      let targetStatus = null;
      try {
        targetStatus = (await bot.getChatMember(chatId, targetId)).status;
      } catch {
        targetStatus = null;
      }
      if (targetStatus === "creator" || targetStatus === "administrator") {
        return bot.sendMessage(
          chatId,
          `${targetName} is an admin/owner - I can't kick them.`,
        );
      }

      try {
        await bot.banChatMember(chatId, targetId);
        await bot.unbanChatMember(chatId, targetId); // "kick" = ban + instant unban
      } catch (err) {
        console.error(`Kick failed chat=${chatId} target=${targetId}:`, err.message);
        const reason =
          (err.response && err.response.body && err.response.body.description) ||
          err.message ||
          "unknown error";
        return bot.sendMessage(chatId, `Couldn't kick ${targetName}: ${reason}`);
      }
      return bot.sendMessage(chatId, `Kicked ${targetName}.`);
    }
    case "/echo": {
      if (isGroup) return; // don't echo in groups
      return bot.sendMessage(chatId, text.slice(cmd.length).trim() || "Say something after /echo.");
    }
    default:
      // Private chats: politely answer free text; groups stay quiet.
      if (!isGroup && text && !text.startsWith("/")) {
        return bot.sendMessage(chatId, `You said: ${text}`);
      }
      return undefined;
  }
}

function sendStart(chatId, isGroup) {
  if (isGroup) {
    return bot.sendMessage(
      chatId,
      "Hi! I keep this group tidy and track chama contributions.\n" +
        "Commands: /join /contribute /balance /stats /members\n" +
        "(admins: /setup, /broadcast, /kick)",
    );
  }
  return bot.sendMessage(
    chatId,
    "Welcome to Chama Bot! What would you like to do?",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Contribute", callback_data: "contribute" }],
          [{ text: "My balance", callback_data: "balance" }],
          [{ text: "Stats", callback_data: "stats" }],
        ],
      },
    },
  );
}

function sendHelp(chatId) {
  return bot.sendMessage(
    chatId,
    "Available commands:\n" +
      "/setup <name> <amount> <cycle_day> - turn this group into a chama (admin)\n" +
      "/join - register as a chama member\n" +
      "/contribute - log a contribution\n" +
      "/balance - your chama summary (private)\n" +
      "/stats - group progress (groups only)\n" +
      "/members - member status list (treasurer, private)\n" +
      "/dashboard - treasurer dashboard login link (treasurer)\n" +
      "/rename <new name> - rename the chama (treasurer)\n" +
      "/start - open the main menu\n" +
      "/help - show this message\n" +
      "/echo <text> - echo back (private chats)",
  );
}

/* ------------------------------------------------------------------ *
 * Inline callbacks
 * ------------------------------------------------------------------ */

async function handleCallbackQuery(query) {
  const chat = query.message && query.message.chat;
  if (!chat) return; // inline results have no chat yet - ignore
  const chatId = chat.id;
  const messageId = query.message.message_id;
  const fromId = query.from.id;
  const data = query.data || "";

  // --- "Accept rules" gate: only the person who joined may tap it -----
  if (data.startsWith("acc:")) {
    const targetId = parseInt(data.slice(4), 10);
    if (fromId !== targetId) {
      return answer(query.id, "This button is not for you.", true);
    }

    // Lift the restriction FIRST (so a failure is visible), retry once, and
    // only then confirm visually. Never swallow the result silently.
    let unmuted = await unmuteMember(chatId, targetId, "accept-rules");
    if (!unmuted) {
      unmuted = await unmuteMember(chatId, targetId, "accept-rules (retry)");
    }
    await upsertMember(chat, targetId, query.from.first_name);

    if (unmuted) {
      console.log(`Accept rules: user ${targetId} un-muted in ${chatId}`);
      await answer(query.id, "Welcome aboard!");
      await safeEdit(
        chatId,
        messageId,
        `Thanks ${query.from.first_name}! You can now participate.`,
      );
    } else {
      console.error(`Accept rules: FAILED to un-mute ${targetId} in ${chatId}`);
      await answer(
        query.id,
        "I couldn't lift the restriction. Please ask a group admin to check my permissions.",
        true,
      );
    }
    return;
  }

  const session = await getSession(chatId, fromId);
  const owner = session.context && session.context.owner;

  // Contribution buttons are personal: stop other people from hijacking them.
  if (
    (data.startsWith("amt:") || data.startsWith("cnf:")) &&
    owner &&
    owner !== fromId
  ) {
    return answer(query.id, "This button is not for you.", true);
  }

  // Always acknowledge first so the loading spinner disappears.
  await answer(query.id);

  // Chama contribution buttons (sent privately by /contribute).
  if (data.startsWith("cntb:")) {
    const parts = data.split(":");
    const cycleId = parseInt(parts[1], 10);
    const amountPart = parts[2];

    if (amountPart === "cancel") {
      return safeEdit(chatId, messageId, "Cancelled.");
    }
    if (amountPart === "custom") {
      await setSession(chatId, fromId, {
        state: "awaiting_chama_amount",
        context: { cycleId },
      });
      return bot.sendMessage(chatId, "Type the amount in KSh:");
    }

    const amountCents = parseInt(amountPart, 10);
    if (!isNaN(amountCents) && amountCents > 0) {
      return chamaContribute.initiate(
        bot,
        chatId,
        fromId,
        cycleId,
        amountCents,
        messageId,
      );
    }
    return;
  }

  if (data === "contribute") {
    await promptContribution(chatId, fromId);
  } else if (data === "balance") {
    await showBalance(chatId, fromId);
  } else if (data === "stats") {
    await showStats(chatId, fromId, isGroupId(chatId));
  } else if (data === "amt:custom") {
    await setSession(chatId, fromId, {
      state: "awaiting_custom_amount",
      context: { owner: fromId },
    });
    await bot.sendMessage(chatId, "Type the amount in KSh:");
  } else if (data.startsWith("amt:")) {
    const amount = parseInt(data.slice(4), 10);
    if (!isNaN(amount) && amount > 0) {
      await confirmContribution(chatId, fromId, amount);
    }
  } else if (data === "cnf:yes") {
    if (session.state !== "confirming") return; // stale tap
    const amount = session.context && session.context.amount;
    if (!amount || amount <= 0) {
      await safeEdit(chatId, messageId, "Session expired. Start again with /contribute.");
      await clearSession(chatId, fromId);
      return;
    }
    await upsertChat(chat); // ensure FK target exists
    await recordContribution(chatId, fromId, amount);
    await clearSession(chatId, fromId);
    await safeEdit(
      chatId,
      messageId,
      `\u2713 Contribution of KSh ${amount} received. Asante!`,
    );
  } else if (data === "cnf:no") {
    if (session.state !== "confirming") return; // stale tap
    await clearSession(chatId, fromId);
    await safeEdit(chatId, messageId, "Contribution cancelled.");
  }
}

function answer(queryId, text, showAlert = false) {
  return bot.answerCallbackQuery(queryId, {
    text,
    show_alert: Boolean(showAlert),
  });
}

/** Edit a bot message, clearing its inline keyboard; ignore idempotent errors. */
async function safeEdit(chatId, messageId, text) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  } catch (err) {
    // "message is not modified" happens when the user double-taps.
    if (err && /not modified/i.test(err.message || "")) return;
    console.error("editMessageText failed:", err.message);
  }
}

/* ------------------------------------------------------------------ *
 * Contribution / info flows
 * ------------------------------------------------------------------ */

async function promptContribution(chatId, userId) {
  await setSession(chatId, userId, {
    state: "awaiting_amount",
    context: { owner: userId },
  });
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

async function confirmContribution(chatId, userId, amount) {
  await setSession(chatId, userId, {
    state: "confirming",
    context: { owner: userId, amount },
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

async function showBalance(chatId, userId) {
  const balance = await userBalance(userId);
  const ksh = Number(balance.total || 0).toFixed(2);
  await bot.sendMessage(
    chatId,
    `Your total contributions: KSh ${ksh} (${balance.count || 0} entries).`,
  );
}

async function showStats(chatId, userId, isGroup) {
  if (!isGroup) {
    const balance = await userBalance(userId);
    const ksh = Number(balance.total || 0).toFixed(2);
    return bot.sendMessage(
      chatId,
      `You have contributed KSh ${ksh} across ${balance.count || 0} entries.`,
    );
  }
  const s = await groupStats(chatId);
  const today = s.today_contributions || 0;
  const total = s.total_contributions || 0;
  const ksh = Number(s.total_ksh || 0).toFixed(2);
  await bot.sendMessage(
    chatId,
    `Group stats:\n` +
      `\u2022 Members: ${s.members || 0}\n` +
      `\u2022 Contributions today: ${today}\n` +
      `\u2022 Total contributions: ${total} (KSh ${ksh})\n` +
      `\u2022 Contributors: ${s.contributors || 0}`,
  );
}

/* ------------------------------------------------------------------ *
 * Group membership: rules gate, kicks, spam
 * ------------------------------------------------------------------ */

// Granular chat permissions. We always pass the FULL set so restricting a
// member never silently revokes unrelated rights.
const PERMISSION_KEYS = [
  "can_send_messages",
  "can_send_audios",
  "can_send_documents",
  "can_send_photos",
  "can_send_videos",
  "can_send_video_notes",
  "can_send_voice_notes",
  "can_send_polls",
  "can_send_other_messages",
  "can_add_web_page_previews",
  "can_change_info",
  "can_invite_users",
  "can_pin_messages",
  "can_manage_topics",
];

const allPermissions = (value) => {
  const perms = {};
  for (const key of PERMISSION_KEYS) perms[key] = value;
  return perms;
};

async function setMemberPermissions(chatId, userId, permissions, untilDateSeconds) {
  // NOTE: the API expects `permissions` as a JSON string when the request is
  // urlencoded, which is how node-telegram-bot-api sends it.
  const form = {
    permissions: JSON.stringify(permissions),
    use_independent_chat_permissions: true,
  };
  if (untilDateSeconds) form.until_date = untilDateSeconds;
  return bot.restrictChatMember(chatId, userId, form);
}

/** Lift a member's restriction. Returns true on success so callers can react. */
async function unmuteMember(chatId, userId, label = "") {
  try {
    await setMemberPermissions(chatId, userId, allPermissions(true));
    return true;
  } catch (err) {
    // e.g. basic group (not supergroup) or the bot lacks admin rights.
    console.error(`Could not unmute ${userId} in ${chatId}${label ? ` (${label})` : ""}:`, err.message);
    return false;
  }
}

/** Restrict a member. Returns true on success so callers can react. */
async function muteMember(chatId, userId, untilDateSeconds, label = "") {
  try {
    await setMemberPermissions(chatId, userId, allPermissions(false), untilDateSeconds);
    return true;
  } catch (err) {
    console.error(`Could not mute ${userId} in ${chatId}${label ? ` (${label})` : ""}:`, err.message);
    return false;
  }
}

async function muteForSeconds(chatId, from, seconds) {
  const until = Math.floor(Date.now() / 1000) + seconds;
  try {
    await bot.sendMessage(
      chatId,
      `${from.first_name} is posting too fast. Muted for ${Math.round(seconds / 60)} minutes.`,
    );
  } catch (err) {
    console.error("Spam warning send failed:", err.message);
  }
  await muteMember(chatId, from.id, until);
}

/** A user joined -> mute until they tap "Accept rules", then record them. */
async function handleUserJoin(event) {
  const chat = event.chat;
  const user = event.new_chat_member.user;
  const chatId = chat.id;

  const muted = await muteMember(chatId, user.id, null, "join-gate");
  if (!muted) {
    console.warn(
      `Join gate: could NOT mute ${user.id} in ${chatId} - the bot may not be an ` +
        "admin with 'restrict members' rights, or the chat is a basic group.",
    );
  }
  try {
    await bot.sendMessage(
      chatId,
      `Welcome ${user.first_name}! Please read and accept the rules:\n\n1. Be kind.\n2. No spam.\n3. English or Kiswahili only.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "Accept rules", callback_data: `acc:${user.id}` }]],
        },
      },
    );
  } catch (err) {
    console.error(`Welcome message failed in ${chatId}:`, err.message);
  }
  await upsertMember(chat, user.id, user.first_name);
}

async function upsertMember(chat, userId, firstName) {
  try {
    await db(
      `INSERT INTO group_members (chat_id, user_id, first_name, joined_at, left_at)
       VALUES ($1, $2, $3, NOW(), NULL)
       ON CONFLICT (chat_id, user_id) DO UPDATE
         SET first_name = $3, left_at = NULL`,
      [chat.id, userId, firstName || null],
    );
  } catch (err) {
    console.error("group_members upsert failed:", err.message);
  }
}

async function markMemberLeft(chatId, userId) {
  try {
    await db(
      `UPDATE group_members SET left_at = NOW()
       WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId],
    );
  } catch (err) {
    console.error("group_members update failed:", err.message);
  }
}

async function handleChatMember(event) {
  const chat = event.chat;
  const chatId = chat.id;
  const oldStatus = event.old_chat_member.status;
  const newStatus = event.new_chat_member.status;
  const user = event.new_chat_member.user;

  // Joined (including re-join after leaving/kick).
  if (newStatus === "member" && (oldStatus === "left" || oldStatus === "kicked")) {
    return handleUserJoin(event);
  }

  // Left, kicked or banned (also catches users who leave while muted/restricted).
  if (newStatus === "left" || newStatus === "kicked") {
    return markMemberLeft(chatId, user.id);
  }
}

/** Bot added to / removed from a group: register or clean up DB rows. */
async function handleBotMembership(event) {
  const chatId = event.chat.id;
  const chat = event.chat;
  const oldStatus = event.old_chat_member.status;
  const newStatus = event.new_chat_member.status;

  // Bot added (or promoted) in a group.
  if (
    (oldStatus === "left" || oldStatus === "kicked") &&
    (newStatus === "member" || newStatus === "administrator")
  ) {
    await upsertChat(chat);
    try {
      // Default per-group settings row.
      await db(
        `INSERT INTO group_settings (chat_id) VALUES ($1)
         ON CONFLICT (chat_id) DO NOTHING`,
        [chatId],
      );
    } catch (err) {
      console.error("group_settings init failed:", err.message);
    }
    console.log(`Bot added to chat ${chatId} (${chat.title}) as ${newStatus}`);
    return;
  }

  // Bot was kicked, banned or left the group -> self-clean the DB.
  if (newStatus === "left" || newStatus === "kicked") {
    try {
      await db(`DELETE FROM group_settings WHERE chat_id = $1`, [chatId]);
      await db(`DELETE FROM telegram_chats WHERE id = $1`, [chatId]);
      console.log(
        `Bot removed from chat ${chatId} (${chat.title}). Database records cleaned.`,
      );
    } catch (err) {
      console.error("Bot-removal cleanup failed:", err.message);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Group settings + anti-spam
 * ------------------------------------------------------------------ */

async function getGroupSettings(chatId) {
  const client = await getClient();
  const cacheKey = `tgBot:settings:${chatId}`;
  const cached = await client.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const defaults = { max_messages_per_minute: 10, language: "en" };
  let settings = defaults;
  try {
    const { rows } = await db(
      `SELECT max_messages_per_minute, language
       FROM group_settings WHERE chat_id = $1`,
      [chatId],
    );
    if (rows[0]) settings = rows[0];
  } catch (err) {
    console.error("getGroupSettings failed:", err.message);
  }
  await client.set(cacheKey, JSON.stringify(settings), {
    EX: SETTINGS_CACHE_SECONDS,
  });
  return settings;
}

async function incrementSpamCount(chatId, userId) {
  const client = await getClient();
  const key = `tgBot:spam:${chatId}:${userId}`;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, SPAM_WINDOW_SECONDS);
  return count;
}

async function isGroupAdmin(chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Broadcast (used by the admin HTTP endpoint and the /broadcast command)
 * ------------------------------------------------------------------ */

/**
 * Send a message to every group the bot is in, recording deliveries.
 * HTML is attempted first; if the text can't be parsed as HTML it is
 * resent as plain text so messages like "5 < 10" never fail hard.
 */
async function broadcast(text, { rateMs = 40, chunkSize = 50, broadcastId = null } = {}) {
  const run = await runWithRedisLock("broadcast", async () => {
    let id = broadcastId;
    if (!id) {
      const { rows } = await db(
        `INSERT INTO broadcasts (text) VALUES ($1) RETURNING id`,
        [text],
      );
      id = rows[0].id;
    }

    // Seed the work ledger with every group we know about.
    await db(
      `INSERT INTO broadcast_deliveries (broadcast_id, chat_id, status)
       SELECT $1, id, 'pending' FROM telegram_chats
       WHERE type IN ('group', 'supergroup')
       ON CONFLICT (broadcast_id, chat_id) DO NOTHING`,
      [id],
    );

    // Recover rows left mid-send by a crashed run.
    await db(
      `UPDATE broadcast_deliveries SET status = 'pending'
       WHERE broadcast_id = $1 AND status = 'sending'`,
      [id],
    );

    let sent = 0;
    let failed = 0;

    while (true) {
      const { rows: claimed } = await db(
        `UPDATE broadcast_deliveries SET status = 'sending'
         WHERE (broadcast_id, chat_id) IN (
           SELECT broadcast_id, chat_id FROM broadcast_deliveries
           WHERE broadcast_id = $1 AND status = 'pending'
           ORDER BY chat_id LIMIT $2 FOR UPDATE SKIP LOCKED
         )
         RETURNING chat_id`,
        [id, chunkSize],
      );
      if (claimed.length === 0) break;

      for (const row of claimed) {
        const chatId = row.chat_id;
        let outcome = "failed";

        try {
          await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
          outcome = "sent";
        } catch (err) {
          const body = err.response && err.response.body;
          const code = body && body.error_code;
          const desc = (body && body.description) || "";
          if (code === 403) {
            // Bot was removed from this chat -> drop the stale record.
            try {
              await db(`DELETE FROM telegram_chats WHERE id = $1`, [chatId]);
            } catch {
              /* ignore */
            }
          } else if (code === 429) {
            // Rate limited: back off and retry once.
            const retryAfter =
              (body.parameters && body.parameters.retry_after) || 1;
            await sleep(retryAfter * 1000);
            try {
              await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
              outcome = "sent";
            } catch {
              /* stays failed */
            }
          } else if (code === 400 && /parse/i.test(desc)) {
            // Bad HTML markup -> resend as plain text.
            try {
              await bot.sendMessage(chatId, text);
              outcome = "sent";
            } catch {
              /* stays failed */
            }
          }
        }

        if (outcome === "sent") sent++;
        else failed++;

        await db(
          `UPDATE broadcast_deliveries SET status = $1, sent_at = NOW()
           WHERE broadcast_id = $2 AND chat_id = $3`,
          [outcome, id, chatId],
        );
        await sleep(rateMs);
      }
    }

    await db(`UPDATE broadcasts SET completed_at = NOW() WHERE id = $1`, [id]);
    return { sent, failed, broadcastId: id };
  });

  if (run.skipped) return { sent: 0, failed: 0, skipped: true };
  return run.result;
}

async function resumeBroadcast(broadcastId, opts = {}) {
  const { rows } = await db(
    `SELECT text FROM broadcasts WHERE id = $1`,
    [broadcastId],
  );
  if (!rows[0]) throw new Error("Broadcast not found");
  return broadcast(rows[0].text, { ...opts, broadcastId });
}

/* ------------------------------------------------------------------ */

const sendMessage = (chatId, text, extra) => bot.sendMessage(chatId, text, extra);

module.exports = {
  bot,
  sendMessage,
  processUpdate,
  broadcast,
  resumeBroadcast,
  registerWebhook,
  verifyRequestSecret,
  isConfigured,
};
