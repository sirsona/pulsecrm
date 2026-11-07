const { query } = require("../config/db");

// find by id
async function findById(id) {
  const { rows } = await query("SELECT * FROM leads WHERE id = $1", [id]);
  return rows[0] || null;
}

// find by phone
async function findByPhone(waPhone) {
  const { rows } = await query("SELECT * FROM leads WHERE wa_phone = $1", [
    waPhone,
  ]);
  return rows[0] || null;
}

// list function
async function list({ status, search, assignedTo, limit = 50, offset = 0 }) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`l.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(l.name ILIKE $${params.length} OR l.wa_phone ILIKE $${params.length})`,
    );
  }
  if (assignedTo === "unassigned") {
    conditions.push("l.assigned_to IS NULL");
  } else if (assignedTo === "me") {
    // caller passes a uuid instead
  } else if (assignedTo) {
    params.push(assignedTo);
    conditions.push(`l.assigned_to = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(limit);
  params.push(offset);

  const { rows } = await query(
    `SELECT l.*, u.name AS assigned_to_name
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_to
     ${where}
     ORDER BY l.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

// assign function
async function assign(leadId, userId) {
  // ✅ Ensure userId is null or a valid UUID
  const safeUserId = userId === "" || userId === "null" ? null : userId;

  const { rows } = await query(
    `UPDATE leads SET assigned_to = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [safeUserId, leadId],
  );
  return rows[0] || null;
}

// insert function
async function insert({ wa_phone, name, email, inquiryType }) {
  const { rows } = await query(
    `INSERT INTO leads (wa_phone, name, email, inquiry_type) 
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [wa_phone, name, email, inquiryType],
  );
  return rows[0];
}

// update status
async function updateStatus(id, status) {
  const { rows } = await query(
    `UPDATE leads SET status = $1, updated_at = NOW() 
     WHERE id = $2
     RETURNING *`,
    [status, id],
  );
  return rows[0] || null;
}

async function statsByStatus() {
  const { rows } = await query(
    `SELECT status, COUNT(*)::int AS total 
     FROM leads 
     GROUP BY status`,
  );
  return rows;
}

// server/repositories/leads.repo.js
async function findByIdWithAssignedName(id) {
  const { rows } = await query(
    `SELECT l.*, u.name AS assigned_to_name
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_to
     WHERE l.id = $1`,
    [id],
  );
  return rows[0] || null;
}

async function getTotalCount() {
  const { rows } = await query("SELECT COUNT(*)::int AS total FROM leads");
  return rows[0]?.total || 0;
}

// ✅ NEW: Get today's new lead count
async function getTodayCount() {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total 
     FROM leads 
     WHERE DATE(created_at) = CURRENT_DATE`,
  );
  return rows[0]?.total || 0;
}

// ✅ NEW: Get status breakdown with counts
async function getStatsByStatus() {
  const { rows } = await query(
    `SELECT status, COUNT(*)::int AS total 
     FROM leads 
     GROUP BY status`,
  );
  return rows;
}

module.exports = {
  findById,
  findByPhone,
  list,
  assign, // ← ADDED
  insert,
  updateStatus,
  statsByStatus,
  findByIdWithAssignedName,
  getTotalCount, // ← NEW
  getTodayCount, // ← NEW
  getStatsByStatus,
};
