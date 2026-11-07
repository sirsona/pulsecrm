# Chama Savings Platform — Architecture

This documents the as-built system in `server/services/chama/`.

## What a chama is

A chama is a Kenyan savings group. Members pool money on a schedule (usually
monthly). The pot either rotates to one member per cycle (ROSCA), accumulates
for joint investments (ASCA), or a hybrid. Each chama has a treasurer who tracks
money in and out; this platform automates the ledger, reminders, fines and
reporting.

## User stories (minimum product)

1. As a member, I can contribute via the bot without attending a physical meeting.
2. As a member, I can see my balance and the chama's progress at any time.
3. As the treasurer, I can see who contributed this cycle, who has not, and nudge them.
4. As the treasurer, I can close a cycle and track its outcome.
5. As a group, we get automatic fines for late contributions without manual math.

## Architecture

```
  +----------------+     +-----------------+     +----------------+
  | Telegram bot   |     | Express server  |     | Next.js admin  |
  | (group chat)   |<--->|  - cron         |<--->|  (treasurer    |
  |                |     |  - payments     |     |   dashboard)   |
  +----------------+     |  - telegram     |     +----------------+
                         |  - outbox       |
                         +--------+--------+
                                  |
                         +--------+--------+
                         |  Postgres + Redis |
                         +------------------+
```

- **Telegram bot** (`telegramBot.service.js` + `services/chama/commands/`) —
  all member-facing commands.
- **Express server** — webhooks (Telegram, Paystack), cron registry, outbox
  dispatcher, internal API for the dashboard.
- **Next.js dashboard** (`dashboard/`) — reads Postgres directly;
  mutations go through the internal API.
- **Postgres** — durable facts. **Redis** — sessions, locks, onboarding state.

## Tables (8)

| Table | Purpose |
|---|---|
| `chamas` | One row per chama, keyed by the Telegram chat id (no FK by design, so stale-chat cleanup can never wipe chama history) |
| `chama_members` | Membership ledger: name, phone, optional email, joined/left |
| `cycles` | Contribution periods (usually monthly). One open cycle per chama enforced by a partial unique index |
| `contributions` | A member's payment toward a cycle: `pending -> confirmed | failed`, provider reference |
| `fines` | Penalties for shortfalls (`shortfall x fine_percent`), paid flag |
| `payouts` | Money leaving the chama (table exists; no commands yet) |
| `outbox` | Durable event queue between the Paystack webhook and the dispatcher |
| `dashboard_sessions` | One-time treasurer login tokens (1 hour) |

All money is stored as **integer cents**.

## The six invariants

1. **One open cycle per chama at a time** (partial unique index `idx_cycles_one_open`).
2. **A contribution amount is explicit** — the preset is the member's prorated
   expected amount; custom amounts are allowed as top-ups.
3. **Balance is derived** — sum of confirmed contributions minus payouts; never stored.
4. **A member can contribute to the open cycle their membership covers**;
   mid-cycle joins are prorated (`expectedForMember`).
5. **Fines are separate rows** and are marked `paid` when settled.
6. **Cycle close happens in one transaction** — close, fines, next cycle open,
   or nothing.

## Contribution happy path

```
1. Member sends /contribute in the chama group.
2. Bot DMs a private keyboard: preset (prorated expected) / Custom / Cancel.
3. Member taps the preset (callback data `cntb:<cycleId>:<amountCents>`).
4. Service inserts a `contributions` row with status = 'pending'
   (partial unique index blocks a second pending row for the same cycle).
5. Service calls Paystack Initialize (KES, cents, metadata = contribution id)
   and stores the provider reference.
6. Bot edits its message to the Paystack payment link.
7. Member pays on the Paystack page (card / mobile money).
8. Paystack calls POST /api/paystack/webhook (HMAC-SHA512 verified).
9. Webhook enqueues a `charge.success` event in the outbox (deduped by reference).
10. The outbox dispatcher (every minute) atomically flips the contribution to
    'confirmed' and announces it in the group with cycle progress.
```

Failures (`charge.failed`) mark the row `failed` and DM the member privately —
failures are never announced in the group.

## End-of-cycle flow

Cron `chama-cycles` (00:30 EAT daily) finds chamas whose `cycle_day` is today:

1. Lock the open cycle (`FOR UPDATE`).
2. Sum confirmed contributions per active member.
3. Insert fines for shortfalls (`round(shortfall x fine_percent / 100)`).
4. Close the cycle.
5. Open the next cycle (same-day close guard: next one starts tomorrow), with
   `expected_total_cents` = sum of members' expected amounts.
6. After COMMIT: post the cycle summary in the group and DM a PDF report to the
   treasurer.

`chama-reminders` (18:00 EAT daily) nudges the day before cycle day: a public
group list plus private DMs to members who have not contributed.

## Scope notes

- **Payment rail:** Paystack checkout links drive the contribution lifecycle.
  Webhook handling, the outbox, idempotency and announcement patterns are
  shared across payment channels.
- **No payouts yet:** payouts need a B2C float; the table is ready but no
  command writes to it.
- **Outbox:** a minimal in-repo outbox plus a cron dispatcher.
