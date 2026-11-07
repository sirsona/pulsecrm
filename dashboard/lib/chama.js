// Shared chama helpers for the treasurer dashboard.
// Proration mirrors server/services/chama/chamaService.js (note default:
// mid-cycle joins pay a pro-rata first cycle).
export function expectedForMember(chama, cycle, member) {
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

export const ksh = (cents) => `KSh ${(cents / 100).toLocaleString()}`;
