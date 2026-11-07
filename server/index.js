// // server/index.js

// const authRoutes = require("./routes/auth.routes");
// const requireAuth = require("./middleware/requireAuth");

// const express = require("express");

// const cors = require("cors");

// const env = require("./config/env");

// const leadsRoutes = require("./routes/leads.routes");
// const webhookRoutes = require("./routes/webhook.routes");
// const errorHandler = require("./middleware/errorHandler");
// const session = require("./sessionStore");
// // const states = require("./states");
// const state = require("./services/states");
// const app = express();

// app.use(cors({ origin: process.env.APP_URL || "http://localhost:3000" }));

// app.use(
//   express.json({
//     verify: (req, res, buf) => {
//       req.rawBody = buf;
//     },
//   }),
// );

// // app.use("/ussd", require("./routes/ussd.routes"));
// app.post("/ussd", async (req, res) => {
//   const { sessionId, text } = req.body;

//   const parts = text.split("*");
//   const latestInput = text === "" ? "" : parts[parts.length - 1];

//   const { state, context } = await session.get(sessionId);
//   const handler = states[state] || states.welcome;

//   const { response, nextState, nextContext } = handler(latestInput, context);

//   if (response.startsWith("END")) {
//     await session.destroy(sessionId);
//   } else {
//     await session.set(sessionId, { state: nextState, context: nextContext });
//   }

//   res.set("Content-Type", "text/plain");
//   res.send(response);
// });

// // // app.use("/ussd", require("./routes/"));

// app.get("/health", (req, res) => res.json({ ok: true }));
// app.use(errorHandler);

// app.use("/api/auth", authRoutes);
// app.use("/api/users", requireAuth, require("./routes/users.routes"));
// app.use("/api/leads", requireAuth, leadsRoutes);

// // app.use("/api/leads", leadRoutes);

// app.use("/webhook", webhookRoutes);

// app.listen(env.PORT, () => {
//   console.log(`CRM server running on : ${env.PORT}`);
// });

// server/index.js
const authRoutes = require("./routes/auth.routes");
const requireAuth = require("./middleware/requireAuth");
const express = require("express");
const cors = require("cors");
const env = require("./config/env");
const leadsRoutes = require("./routes/leads.routes");
const webhookRoutes = require("./routes/webhook.routes");
const errorHandler = require("./middleware/errorHandler");
const broadcastRoutes = require("./routes/broadcast.routes");
const requireRole = require("./middleware/requireRole");
const telegramBotRoutes = require("./routes/telegramBot.routes");
const telegramBotService = require("./services/telegramBot.service");
const paystackRoutes = require("./routes/paystack.routes");
const cronRoutes = require("./routes/cron.routes");
const queues = require("./queues");
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const registry = require("./cron/registry");
const { becomeLeaderForever } = require("./cron/leader");
if (env.RUN_CRON_IN_PROCESS) {
  becomeLeaderForever({ onStart: registry.startAll });
}
if (env.RUN_QUEUES_IN_PROCESS) {
  require("./workers").startAll();
}

// --- USSD IMPORTS ---
const session = require("./services/ussd/session"); // FIXED PATH
const states = require("./services/states"); // FIXED PLURAL NAME

const app = express();

app.use(cors({ origin: process.env.APP_URL || "http://localhost:3000" }));

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// --- USSD DISPATCHER ---
app.post("/ussd", express.urlencoded({ extended: false }), async (req, res) => {
  const { sessionId, text, phoneNumber } = req.body;

  const parts = text.split("*");
  const latestInput = text === "" ? "" : parts[parts.length - 1];

  const { state, context } = await session.get(sessionId);
  const handler = states[state] || states.welcome;

  // IMPORTANT: Pass phoneNumber AND context to the handler
  const result = await handler({
    input: latestInput,
    context,
    phoneNumber,
  });

  // Handle END vs CON
  if (result.response.startsWith("END")) {
    await session.destroy(sessionId);
    // Fire background tasks (like SMS) if they exist
    if (result.postSessionTask) {
      result
        .postSessionTask()
        .catch((err) => console.error("Post-task error:", err));
    }
  } else {
    await session.set(sessionId, {
      state: result.nextState,
      context: result.nextContext,
    });
  }

  res.set("Content-Type", "text/plain");
  res.send(result.response);
});
// --- END USSD DISPATCHER ---

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", requireAuth, require("./routes/users.routes"));
app.use("/api/leads", requireAuth, leadsRoutes);
// Meta (WhatsApp) webhook: GET verification handshake + POST message events.
app.use("/webhooks/meta", webhookRoutes);

// Improved Telegram bot: webhook route + boot-time registration.
app.use("/telegram-bot", telegramBotRoutes);

// Paystack webhook (signature-verified, enqueues outbox events).
app.use("/api/paystack", paystackRoutes);

// Internal chama endpoints for the treasurer dashboard (secret-guarded).
app.use("/api/chama", require("./routes/chama.routes"));

app.use(
  "/api/telegram/broadcast",
  requireAuth,
  requireRole("admin"),
  broadcastRoutes,
);

app.use("/api/cron", cronRoutes);

// Bull Board queue dashboard, admin only.
const bullServerAdapter = new ExpressAdapter();
bullServerAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [
    new BullMQAdapter(queues.telegramQueue),
    new BullMQAdapter(queues.smsQueue),
    new BullMQAdapter(queues.whatsappQueue),
    new BullMQAdapter(queues.reportsQueue),
    new BullMQAdapter(queues.notificationsQueue),
    new BullMQAdapter(queues.deadLetterQueue),
  ],
  serverAdapter: bullServerAdapter,
});
app.use(
  "/admin/queues",
  require("./middleware/boardToken"),
  requireAuth,
  requireRole("admin"),
  bullServerAdapter.getRouter(),
);

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`CRM server running on : ${env.PORT}`);
  // Register the Telegram webhook now that the HTTP server is accepting
  // connections (Telegram pushes updates immediately once registered).
  telegramBotService
    .registerWebhook()
    .then((result) => {
      if (!result.ok) {
        console.warn(
          `Telegram webhook NOT registered: ${result.error || "unknown reason"}`,
        );
      }
    })
    .catch((err) => {
      console.error(
        "Unexpected error while registering Telegram webhook:",
        err,
      );
    });
});

async function shutdown(signal) {
  console.log(`${signal} received, finishing cron tasks...`);
  await registry.drain(30000);
  console.log("All cron tasks finished. Exiting.");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
