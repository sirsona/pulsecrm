// server/cron/tasks/outbox.js
//
// Outbox dispatcher: payment events are queued by the Paystack webhook and
// processed here (confirmed contributions announced in the group, failures
// notified privately). Claims rows with FOR UPDATE SKIP LOCKED so overlapping
// runs are safe; retries transient failures up to 3 attempts, then dead-letters.
const { query: db } = require("../../config/db");
const { telegramNotify } = require("../../queues/notify");
const chamaService = require("../../services/chama/chamaService");

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 3;

async function dispatchOutbox() {
  const { rows } = await db(
    `UPDATE outbox SET status = 'processing', attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM outbox
       WHERE status = 'pending'
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, event_type, payload, attempts`,
    [BATCH_SIZE],
  );

  for (const row of rows) {
    try {
      await handleEvent(row);
      await db(
        `UPDATE outbox SET status = 'processed', processed_at = NOW() WHERE id = $1`,
        [row.id],
      );
    } catch (err) {
      const exhausted = row.attempts >= MAX_ATTEMPTS;
      await db(
        `UPDATE outbox SET status = $1, last_error = $2 WHERE id = $3`,
        [exhausted ? "failed" : "pending", err.message, row.id],
      );
      console.error(
        `[outbox] event ${row.id} (${row.event_type}) attempt ${row.attempts} failed:`,
        err.message,
      );
    }
  }
}

async function markPayloadFlag(outboxId, key) {
  await db(
    `UPDATE outbox SET payload = payload || jsonb_build_object($2::text, true) WHERE id = $1`,
    [outboxId, key],
  );
}

async function handleEvent(row) {
  const payload = row.payload || {};
  const contributionId = payload.contributionId;
  if (!contributionId) return; // nothing actionable

  if (row.event_type === "charge.success") {
    // Idempotent: only the first call flips pending -> confirmed.
    await chamaService.confirmContribution(contributionId);
    const contribution = await chamaService.getContribution(contributionId);
    if (!contribution || contribution.status !== "confirmed") return;

    // Announce once; the flag lets a retry finish a half-enqueued announcement.
    if (!payload.announced) {
      const member = await chamaService.findMember(
        contribution.chama_id,
        contribution.member_user_id,
      );
      const stats = await chamaService.getGroupStats(contribution.chama_id);

      await telegramNotify(
        contribution.chama_id,
        `${member ? member.name : "A member"} just contributed KSh ${(contribution.amount_cents / 100).toLocaleString()}!`,
        { priority: 3, jobId: `contrib-${contribution.id}-announce` },
      );
      await telegramNotify(
        contribution.chama_id,
        `Cycle progress: KSh ${(stats.collectedThisCycle / 100).toLocaleString()} / ${(stats.expectedThisCycle / 100).toLocaleString()}`,
        { priority: 3, jobId: `contrib-${contribution.id}-progress` },
      );
      await markPayloadFlag(row.id, "announced");
    }
    return;
  }

  if (row.event_type === "charge.failed") {
    // Idempotent: only the first call flips pending -> failed.
    await chamaService.failContribution(contributionId);
    const contribution = await chamaService.getContribution(contributionId);
    if (!contribution || contribution.status !== "failed") return;

    if (!payload.notified) {
      await telegramNotify(
        contribution.member_user_id,
        "Your contribution did not go through. Try again with /contribute.",
        {
          priority: 3,
          jobId: `contrib-${contribution.id}-fail`,
          // A member who never started the bot gets 403: benign, not a dead job.
          ignore403: true,
        },
      );
      await markPayloadFlag(row.id, "notified");
    }
  }
}

module.exports = { dispatchOutbox };
