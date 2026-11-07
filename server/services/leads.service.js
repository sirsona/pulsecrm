// server/services/leads.service.js

const leadsRepo = require("../repositories/leads.repo");
const AppError = require("../utils/AppError");
const messagesRepo = require("../repositories/messages.repo"); // ✅ Added

const { query } = require("../config/db");

const VALID_STATUSES = ["new", "contacted", "qualified", "converted", "lost"];

const VALID_TRANSITIONS = {
  new: ["contacted", "lost"],
  contacted: ["qualified", "lost"],
  qualified: ["converted", "lost"],
  converted: [],
  lost: [],
};

async function listForUser(user, filters) {
  if (user.role === "admin") {
    return leadsRepo.list(filters);
  }
  // Agents see their own + (if explicitly asked) unassigned
  if (filters.assignedTo === "unassigned") {
    return leadsRepo.list({ ...filters, assignedTo: "unassigned" });
  }
  return leadsRepo.list({ ...filters, assignedTo: user.id });
}
// get lead for user
async function getLeadForUser(user, id) {
  // Get the lead with the assigned user's name via a JOIN
  const lead = await leadsRepo.findByIdWithAssignedName(id);
  if (!lead) throw new AppError("Lead not found", 404);

  if (
    user.role !== "admin" &&
    lead.assigned_to &&
    lead.assigned_to !== user.id
  ) {
    throw new AppError("Lead not found", 404);
  }

  // Fetch messages for this lead
  const messages = await messagesRepo.findByLeadId(id);

  return { ...lead, messages };
}

async function claimLead(user, id) {
  const lead = await leadsRepo.findById(id);
  if (!lead) throw new AppError("Lead not found", 404);
  if (lead.assigned_to) {
    throw new AppError("Lead is already assigned", 409);
  }
  return leadsRepo.assign(id, user.id);
}

// assign lead
async function reassignLead(user, id, newOwnerId) {
  if (user.role !== "admin") {
    throw new AppError("Only admins can reassign leads", 403);
  }
  const lead = await leadsRepo.findById(id);
  if (!lead) throw new AppError("Lead not found", 404);
  return leadsRepo.assign(id, newOwnerId); // null means unassign
}

// change status

async function changeStatus(user, id, nextStatus) {
  const lead = await getLeadForUser(user, id); // enforces visibility
  if (!VALID_STATUSES.includes(nextStatus)) {
    throw new AppError(`Invalid status: ${nextStatus}`, 400);
  }
  const allowed = VALID_TRANSITIONS[lead.status];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(`Cannot move from ${lead.status} to ${nextStatus}`, 409);
  }
  return leadsRepo.updateStatus(id, nextStatus);
}

// get stats -> only admin
async function getStats(user) {
  if (user.role !== "admin") {
    throw new AppError("Admins only", 403);
  }

  // ✅ Call repository functions (no SQL here!)
  const total = await leadsRepo.getTotalCount();
  const today = await leadsRepo.getTodayCount();
  const statusRows = await leadsRepo.getStatsByStatus();

  // Build the byStatus object
  const byStatus = {};
  statusRows.forEach((r) => {
    byStatus[r.status] = r.total;
  });

  return { total, today, byStatus };
}
module.exports = {
  listForUser,
  getLeadForUser,
  claimLead,
  reassignLead,
  changeStatus,
  getStats,
};
