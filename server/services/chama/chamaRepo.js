// server/services/chama/chamaRepo.js
//
// SQL layer for the Chama Savings Platform.
// All money is stored as integer cents.
const { query: db } = require("../../config/db");

async function createChama({
  chatId,
  name,
  monthlyAmountCents,
  cycleDay,
  treasurerUserId,
}) {
  const { rows } = await db(
    `INSERT INTO chamas (chat_id, name, monthly_amount_cents, cycle_day, treasurer_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [chatId, name, monthlyAmountCents, cycleDay, treasurerUserId],
  );
  return rows[0];
}

async function findByChatId(chatId) {
  const { rows } = await db(`SELECT * FROM chamas WHERE chat_id = $1`, [chatId]);
  return rows[0] || null;
}

async function listChamasByCycleDay(day) {
  const { rows } = await db(`SELECT * FROM chamas WHERE cycle_day = $1`, [day]);
  return rows;
}

async function renameChama(chatId, name) {
  const { rows } = await db(
    `UPDATE chamas SET name = $2 WHERE chat_id = $1 RETURNING *`,
    [chatId, name],
  );
  return rows[0] || null;
}

async function createCycle({
  chamaId,
  periodStart,
  periodEnd,
  expectedTotalCents,
}) {
  const { rows } = await db(
    `INSERT INTO cycles (chama_id, period_start, period_end, expected_total_cents)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [chamaId, periodStart, periodEnd, expectedTotalCents],
  );
  return rows[0];
}

async function getCycle(cycleId) {
  const { rows } = await db(`SELECT * FROM cycles WHERE id = $1`, [cycleId]);
  return rows[0] || null;
}

async function findOpenCycle(chamaId) {
  const { rows } = await db(
    `SELECT * FROM cycles WHERE chama_id = $1 AND status = 'open'`,
    [chamaId],
  );
  return rows[0] || null;
}

async function addToCycleExpected(chamaId, cents) {
  await db(
    `UPDATE cycles SET expected_total_cents = expected_total_cents + $2
     WHERE chama_id = $1 AND status = 'open'`,
    [chamaId, cents],
  );
}

async function upsertMember({ chamaId, userId, name, phone, email }) {
  const { rows } = await db(
    `INSERT INTO chama_members (chama_id, user_id, name, phone, email)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (chama_id, user_id)
     DO UPDATE SET name = $3, phone = $4,
                   email = COALESCE($5, chama_members.email),
                   left_at = NULL
     RETURNING *`,
    [chamaId, userId, name, phone, email || null],
  );
  return rows[0];
}

async function findMember(chamaId, userId) {
  const { rows } = await db(
    `SELECT * FROM chama_members
     WHERE chama_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [chamaId, userId],
  );
  return rows[0] || null;
}

async function listActiveMembers(chamaId) {
  const { rows } = await db(
    `SELECT * FROM chama_members
     WHERE chama_id = $1 AND left_at IS NULL
     ORDER BY joined_at`,
    [chamaId],
  );
  return rows;
}

async function countActiveMembers(chamaId) {
  const { rows } = await db(
    `SELECT COUNT(*)::int AS count FROM chama_members
     WHERE chama_id = $1 AND left_at IS NULL`,
    [chamaId],
  );
  return rows[0].count;
}

async function findMemberships(userId) {
  const { rows } = await db(
    `SELECT c.chat_id, c.name
     FROM chama_members m
     JOIN chamas c ON c.chat_id = m.chama_id
     WHERE m.user_id = $1 AND m.left_at IS NULL
     ORDER BY c.name`,
    [userId],
  );
  return rows;
}

async function getMemberCycleConfirmed(cycleId, userId) {
  const { rows } = await db(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS total
     FROM contributions
     WHERE cycle_id = $1 AND member_user_id = $2 AND status = 'confirmed'`,
    [cycleId, userId],
  );
  return rows[0].total;
}

async function getMemberAllTimeConfirmed(chamaId, userId) {
  const { rows } = await db(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS total
     FROM contributions
     WHERE chama_id = $1 AND member_user_id = $2 AND status = 'confirmed'`,
    [chamaId, userId],
  );
  return rows[0].total;
}

async function getMemberOutstandingFines(chamaId, userId) {
  const { rows } = await db(
    `SELECT COALESCE(SUM(f.amount_cents), 0)::int AS total
     FROM fines f
     JOIN cycles cy ON cy.id = f.cycle_id
     WHERE cy.chama_id = $1 AND f.member_user_id = $2 AND f.paid = FALSE`,
    [chamaId, userId],
  );
  return rows[0].total;
}

async function getCycleCollected(cycleId) {
  const { rows } = await db(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS total
     FROM contributions WHERE cycle_id = $1 AND status = 'confirmed'`,
    [cycleId],
  );
  return rows[0].total;
}

async function countCycleContributors(cycleId) {
  const { rows } = await db(
    `SELECT COUNT(DISTINCT member_user_id)::int AS count
     FROM contributions WHERE cycle_id = $1 AND status = 'confirmed'`,
    [cycleId],
  );
  return rows[0].count;
}

async function getGroupAllTimeConfirmed(chamaId) {
  const { rows } = await db(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS total
     FROM contributions WHERE chama_id = $1 AND status = 'confirmed'`,
    [chamaId],
  );
  return rows[0].total;
}

async function getGroupOutstandingFines(chamaId) {
  const { rows } = await db(
    `SELECT COALESCE(SUM(f.amount_cents), 0)::int AS total
     FROM fines f
     JOIN cycles cy ON cy.id = f.cycle_id
     WHERE cy.chama_id = $1 AND f.paid = FALSE`,
    [chamaId],
  );
  return rows[0].total;
}

async function createContribution({
  cycleId,
  chamaId,
  memberUserId,
  amountCents,
  paymentMethod = "paystack",
}) {
  const { rows } = await db(
    `INSERT INTO contributions (cycle_id, chama_id, member_user_id, amount_cents, payment_method)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cycle_id, member_user_id) WHERE status = 'pending' DO NOTHING
     RETURNING *`,
    [cycleId, chamaId, memberUserId, amountCents, paymentMethod],
  );
  return rows[0] || null;
}

async function getContribution(id) {
  const { rows } = await db(`SELECT * FROM contributions WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function setContributionReference(id, reference) {
  await db(`UPDATE contributions SET provider_reference = $2 WHERE id = $1`, [
    id,
    reference,
  ]);
}

async function confirmContribution(id) {
  const { rowCount } = await db(
    `UPDATE contributions SET status = 'confirmed', confirmed_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return rowCount > 0;
}

async function failContribution(id) {
  const { rowCount } = await db(
    `UPDATE contributions SET status = 'failed'
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return rowCount > 0;
}

async function findPendingContribution(cycleId, memberUserId) {
  const { rows } = await db(
    `SELECT * FROM contributions
     WHERE cycle_id = $1 AND member_user_id = $2 AND status = 'pending'
     LIMIT 1`,
    [cycleId, memberUserId],
  );
  return rows[0] || null;
}

// Queue a charge.success event for a contribution whose Paystack transaction
// succeeded but whose webhook never arrived. Mirrors the webhook route's
// idempotency check: at most one outbox row per provider reference.
async function enqueueOutboxSuccess(contributionId, reference) {
  const existing = await db(
    `SELECT 1 FROM outbox
     WHERE event_type = 'charge.success' AND payload->>'reference' = $1
     LIMIT 1`,
    [reference],
  );
  if (existing.rows.length > 0) return false;

  await db(
    `INSERT INTO outbox (event_type, payload) VALUES ('charge.success', $1)`,
    [JSON.stringify({ contributionId, reference })],
  );
  return true;
}

module.exports = {
  createChama,
  findByChatId,
  listChamasByCycleDay,
  renameChama,
  createCycle,
  getCycle,
  findOpenCycle,
  addToCycleExpected,
  upsertMember,
  findMember,
  listActiveMembers,
  countActiveMembers,
  findMemberships,
  getMemberCycleConfirmed,
  getMemberAllTimeConfirmed,
  getMemberOutstandingFines,
  getCycleCollected,
  countCycleContributors,
  getGroupAllTimeConfirmed,
  getGroupOutstandingFines,
  createContribution,
  getContribution,
  findPendingContribution,
  setContributionReference,
  confirmContribution,
  failContribution,
  enqueueOutboxSuccess,
};
