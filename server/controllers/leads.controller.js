const leadsService = require("../services/leads.service"); // ← IMPORT ADDED HERE

async function list(req, res) {
  const leads = await leadsService.listForUser(req.user, {
    status: req.query.status,
    search: req.query.search,
    assignedTo: req.query.assignedTo,
    limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset, 10) : undefined,
  });
  res.json({ leads });
}

async function getOne(req, res) {
  const lead = await leadsService.getLeadForUser(req.user, req.params.id);
  res.json({ lead });
}

async function patchStatus(req, res) {
  const lead = await leadsService.changeStatus(
    req.user,
    req.params.id,
    req.body.status,
  );
  res.json({ lead });
}

async function claim(req, res) {
  const lead = await leadsService.claimLead(req.user, req.params.id);
  res.json({ lead });
}

async function reassign(req, res) {
  const lead = await leadsService.reassignLead(
    req.user,
    req.params.id,
    req.body.assignedTo,
  );
  res.json({ lead });
}

async function stats(req, res) {
  const data = await leadsService.getStats(req.user);
  res.json(data);
}

module.exports = { list, getOne, patchStatus, claim, reassign, stats };
