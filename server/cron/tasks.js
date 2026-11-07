// server/cron/tasks.js
const { query: dbQuery } = require("../config/db");
const env = require("../config/env");
const { bot } = require("../services/telegramBot.service");
const { telegramNotify, whatsappNotify } = require("../queues/notify");

async function notifyOwner(text, { jobId } = {}) {
  if (!env.OWNER_TELEGRAM_ID) {
    console.warn("[cron] OWNER_TELEGRAM_ID not set; skipping owner notification");
    return;
  }
  await telegramNotify(env.OWNER_TELEGRAM_ID, text, { priority: 5, jobId });
}

async function runReconciliation() {
  console.log("[cron] reconciliation: no payment provider configured yet");
  return { mismatchCount: 0 };
}

async function cleanupSessions() {
  const runs = await dbQuery(
    `DELETE FROM cron_runs WHERE started_at < NOW() - INTERVAL '30 days'`,
  );
  const deliveries = await dbQuery(
    `DELETE FROM broadcast_deliveries WHERE sent_at < NOW() - INTERVAL '30 days'`,
  );
  console.log(
    `[cron] cleanup: deleted ${runs.rowCount} cron_runs, ${deliveries.rowCount} broadcast_deliveries`,
  );
}

async function sendDailyReport() {
  const { rows } = await dbQuery(
    `SELECT COUNT(*)::int AS contributions,
            COALESCE(SUM(amount), 0)::numeric AS total
     FROM telegram_contributions
     WHERE created_at::date = CURRENT_DATE - INTERVAL '1 day'`,
  );
  const r = rows[0];
  const message = `Yesterday's contributions: ${r.contributions} (KSh ${Number(r.total).toLocaleString()})`;

  // jobId makes the add idempotent: two runs on the same day = one job.
  const date = new Date().toISOString().slice(0, 10);
  await notifyOwner(message, { jobId: `daily-report-${date}` });

  // Optional WhatsApp copy when a recipient is configured.
  if (env.OWNER_WHATSAPP_PHONE) {
    await whatsappNotify(env.OWNER_WHATSAPP_PHONE, message, {
      priority: 5,
      jobId: `daily-report-wa-${date}`,
    });
  }
}

async function sendOverdueReminders() {
  const { rows } = await dbQuery(
    `SELECT gm.chat_id, gm.user_id, gm.first_name, MAX(c.created_at) AS last_contribution
     FROM group_members gm
     LEFT JOIN telegram_contributions c
       ON c.user_id = gm.user_id AND c.chat_id = gm.chat_id
     WHERE gm.left_at IS NULL
     GROUP BY gm.chat_id, gm.user_id, gm.first_name
     HAVING MAX(c.created_at) < NOW() - INTERVAL '7 days'
         OR MAX(c.created_at) IS NULL`,
  );

  const date = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    await telegramNotify(
      row.user_id,
      `Hi ${row.first_name}, friendly reminder that your chama contribution is overdue.`,
      {
        priority: 5,
        jobId: `overdue-${row.chat_id}-${row.user_id}-${date}`,
        // 403 = no private chat with the bot -> fall back to a group mention.
        fallback: {
          chatId: row.chat_id,
          text: `<a href="tg://user?id=${row.user_id}">${row.first_name}</a>, your contribution is overdue.`,
          opts: { parse_mode: "HTML" },
        },
      },
    );
  }
}

async function healthPing() {
  const me = await bot.getMe();
  await dbQuery("SELECT 1");
  console.log(`[cron] health: bot @${me.username} ok, db ok`);
}

async function checkJobHealth() {
  const expectedIntervals = {
    reconciliation: 24 * 3600 * 1000,
    "cleanup-sessions": 24 * 3600 * 1000,
    "daily-report": 24 * 3600 * 1000,
    "overdue-reminders": 24 * 3600 * 1000,
    "health-ping": 5 * 60 * 1000,
  };

  for (const [jobName, expectedInterval] of Object.entries(expectedIntervals)) {
    const { rows } = await dbQuery(
      `SELECT MAX(started_at) AS last_run
       FROM cron_runs
       WHERE job_name = $1 AND status = 'success'`,
      [jobName],
    );
    const lastRun = rows[0].last_run;
    const timeSince = lastRun
      ? Date.now() - new Date(lastRun).getTime()
      : Infinity;
    const gracePeriod = expectedInterval * 1.5;

    if (timeSince > gracePeriod) {
      const detail = lastRun
        ? `${Math.round(timeSince / 60000)} minutes`
        : "ever";
      const date = new Date().toISOString().slice(0, 10);
      await notifyOwner(
        `CRON ALERT: ${jobName} has not run successfully in ${detail}`,
        { jobId: `health-alert-${jobName}-${date}` },
      );
    }
  }
}

module.exports = {
  runReconciliation,
  cleanupSessions,
  sendDailyReport,
  sendOverdueReminders,
  healthPing,
  checkJobHealth,
};
