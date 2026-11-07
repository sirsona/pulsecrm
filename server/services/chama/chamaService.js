// server/services/chama/chamaService.js
//
// Business rules for the Chama Savings Platform.
// Rules (note defaults): mid-cycle joins are prorated, no grace period,
// fines are 2% of the shortfall (chama.fine_percent).
const repo = require("./chamaRepo");
const paystack = require("./paystackService");
const { getClient } = require("../../config/redis");

const ONBOARDING_TTL_SECONDS = 600;
const onboardingKey = (userId) => `chama:onboarding:${userId}`;

// Server runs in EAT (Africa/Nairobi): format the local calendar date so
// cycle boundaries do not drift across UTC midnight.
const toDateOnly = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

async function create({
  chatId,
  name,
  monthlyAmountCents,
  cycleDay,
  treasurerUserId,
}) {
  const chama = await repo.createChama({
    chatId,
    name,
    monthlyAmountCents,
    cycleDay,
    treasurerUserId,
  });

  // Open the first cycle immediately.
  await repo.createCycle({
    chamaId: chatId,
    periodStart: toDateOnly(new Date()),
    periodEnd: toDateOnly(new Date(Date.now() + 30 * 86400000)),
    expectedTotalCents: 0,
  });

  return chama;
}

function findByChatId(chatId) {
  return repo.findByChatId(chatId);
}

function findMember(chamaId, userId) {
  return repo.findMember(chamaId, userId);
}

function findMemberships(userId) {
  return repo.findMemberships(userId);
}

function renameChama(chatId, name) {
  return repo.renameChama(chatId, name);
}

// Proration: a member's expected amount for a cycle is the monthly amount
// scaled by the days remaining from the later of (cycle start, join date).
function expectedForMember(chama, cycle, member) {
  const periodStart = new Date(cycle.period_start);
  const periodEnd = new Date(cycle.period_end);
  const totalDays = Math.max(
    1,
    Math.round((periodEnd - periodStart) / 86400000),
  );
  const joinedAt = new Date(member.joined_at);
  const effectiveStart = joinedAt > periodStart ? joinedAt : periodStart;
  const remainingDays = Math.max(
    0,
    Math.round((periodEnd - effectiveStart) / 86400000),
  );
  const ratio = Math.min(1, remainingDays / totalDays);
  return Math.round(chama.monthly_amount_cents * ratio);
}

async function startMemberOnboarding(userId, chamaId) {
  const client = await getClient();
  await client.set(onboardingKey(userId), String(chamaId), {
    EX: ONBOARDING_TTL_SECONDS,
  });
}

async function getMemberOnboarding(userId) {
  const client = await getClient();
  const value = await client.get(onboardingKey(userId));
  return value ? parseInt(value, 10) : null;
}

async function clearMemberOnboarding(userId) {
  const client = await getClient();
  await client.del(onboardingKey(userId));
}

async function completeMemberOnboarding({ userId, chamaId, name, phone }) {
  const chama = await repo.findByChatId(chamaId);
  if (!chama) throw new Error("Chama not found");

  const member = await repo.upsertMember({ chamaId, userId, name, phone });

  const cycle = await repo.findOpenCycle(chamaId);
  if (cycle) {
    const expected = expectedForMember(chama, cycle, member);
    await repo.addToCycleExpected(chamaId, expected);
  }

  await clearMemberOnboarding(userId);

  const memberCount = await repo.countActiveMembers(chamaId);
  return { member, memberCount };
}

async function getMemberBalance(chamaId, userId) {
  const member = await repo.findMember(chamaId, userId);
  if (!member) return null;

  const chama = await repo.findByChatId(chamaId);
  const cycle = await repo.findOpenCycle(chamaId);

  const expectedThisCycle = cycle ? expectedForMember(chama, cycle, member) : 0;
  const contributedThisCycle = cycle
    ? await repo.getMemberCycleConfirmed(cycle.id, userId)
    : 0;
  const totalContributed = await repo.getMemberAllTimeConfirmed(
    chamaId,
    userId,
  );
  const outstandingFines = await repo.getMemberOutstandingFines(
    chamaId,
    userId,
  );

  return {
    name: member.name,
    expectedThisCycle,
    contributedThisCycle,
    totalContributed,
    outstandingFines,
  };
}

async function getGroupStats(chamaId) {
  const chama = await repo.findByChatId(chamaId);
  if (!chama) return null;

  const cycle = await repo.findOpenCycle(chamaId);
  const collectedThisCycle = cycle ? await repo.getCycleCollected(cycle.id) : 0;
  const expectedThisCycle = cycle ? cycle.expected_total_cents : 0;
  const contributors = cycle ? await repo.countCycleContributors(cycle.id) : 0;
  const totalMembers = await repo.countActiveMembers(chamaId);
  const outstandingFines = await repo.getGroupOutstandingFines(chamaId);
  const allTime = await repo.getGroupAllTimeConfirmed(chamaId);

  return {
    name: chama.name,
    collectedThisCycle,
    expectedThisCycle,
    contributors,
    totalMembers,
    outstandingFines,
    allTime,
  };
}

async function getMemberStatusList(chamaId) {
  const chama = await repo.findByChatId(chamaId);
  const cycle = await repo.findOpenCycle(chamaId);
  const members = await repo.listActiveMembers(chamaId);

  const list = [];
  for (const m of members) {
    const contributedThisCycle = cycle
      ? await repo.getMemberCycleConfirmed(cycle.id, m.user_id)
      : 0;
    const expectedThisCycle = cycle
      ? expectedForMember(chama, cycle, m)
      : chama.monthly_amount_cents;
    list.push({
      user_id: m.user_id,
      name: m.name,
      contributedThisCycle,
      expectedThisCycle,
    });
  }
  return list;
}

const placeholderEmail = (userId) => `member_${userId}@example.com`;

// A pending row blocks /contribute by design (duplicate-tap guard). Without
// reconciliation an abandoned Paystack checkout would block it forever, so the
// provider's view of the old transaction decides what happens:
//   success   -> confirm it, queue the group announcement, tell caller it is paid
//   ongoing   -> reuse the row and issue a fresh link
//   else/none -> mark failed, create a fresh pending row
async function resolveExistingPending({ cycleId, userId, amountCents }) {
  const pending = await repo.findPendingContribution(cycleId, userId);
  if (!pending) {
    throw new Error("You already have a pending contribution for this cycle.");
  }

  let transaction = null;
  if (pending.provider_reference) {
    try {
      transaction = await paystack.verifyTransaction(pending.provider_reference);
    } catch (err) {
      console.warn(
        "Paystack verify failed for pending contribution:",
        err.message,
      );
    }
  }

  const status = transaction && transaction.status;
  if (status === "success") {
    await repo.confirmContribution(pending.id);
    await repo.enqueueOutboxSuccess(pending.id, pending.provider_reference);
    return { ...pending, alreadyPaid: true };
  }

  if (status === "ongoing" || status === "pending" || status === "processing") {
    return pending;
  }

  await repo.failContribution(pending.id);
  const fresh = await repo.createContribution({
    cycleId,
    chamaId: pending.chama_id,
    memberUserId: userId,
    amountCents,
  });
  if (!fresh) {
    throw new Error("You already have a pending contribution for this cycle.");
  }
  return fresh;
}

async function initiateContribution({ userId, cycleId, amountCents }) {
  const cycle = await repo.getCycle(cycleId);
  if (!cycle || cycle.status !== "open") throw new Error("Cycle not open");

  const chama = await repo.findByChatId(cycle.chama_id);
  if (!chama) throw new Error("Chama not found");

  const member = await repo.findMember(cycle.chama_id, userId);
  if (!member) throw new Error("Not a member");

  let contribution = await repo.createContribution({
    cycleId,
    chamaId: cycle.chama_id,
    memberUserId: userId,
    amountCents,
  });
  if (!contribution) {
    contribution = await resolveExistingPending({ cycleId, userId, amountCents });
  }

  if (contribution.alreadyPaid) {
    return { contributionId: contribution.id, alreadyPaid: true };
  }

  try {
    const init = await paystack.initialize({
      email: member.email || placeholderEmail(userId),
      amountCents,
      metadata: {
        contributionId: contribution.id,
        chamaId: cycle.chama_id,
        cycleId,
        userId,
      },
    });

    await repo.setContributionReference(contribution.id, init.reference);

    return {
      contributionId: contribution.id,
      authorizationUrl: init.authorizationUrl,
    };
  } catch (err) {
    // Payment link could not be created: release the pending row so the
    // member can retry immediately.
    await repo.failContribution(contribution.id);
    throw err;
  }
}

function getContribution(id) {
  return repo.getContribution(id);
}

function confirmContribution(id) {
  return repo.confirmContribution(id);
}

function failContribution(id) {
  return repo.failContribution(id);
}

function getOpenCycle(chamaId) {
  return repo.findOpenCycle(chamaId);
}

module.exports = {
  create,
  findByChatId,
  findMember,
  findMemberships,
  renameChama,
  expectedForMember,
  startMemberOnboarding,
  getMemberOnboarding,
  clearMemberOnboarding,
  completeMemberOnboarding,
  getMemberBalance,
  getGroupStats,
  getMemberStatusList,
  initiateContribution,
  getContribution,
  confirmContribution,
  failContribution,
  getOpenCycle,
};
