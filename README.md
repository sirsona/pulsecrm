# PulseCRM

**A multi-channel CRM and messaging platform for WhatsApp and Telegram.**

PulseCRM brings lead capture, customer conversations, WhatsApp Cloud API webhooks,
Telegram workflows, payment reconciliation, and chama savings operations into one
operations dashboard. The platform is built as a Node.js/Express API, a Next.js
dashboard, PostgreSQL, Redis-backed job queues, and Docker Compose services.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)

## Overview

PulseCRM handles the operational side of a small business or community:

- Capture and qualify inbound WhatsApp leads through an automated conversation
  flow.
- Manage leads, assignments, and conversation history from a CRM dashboard.
- Send WhatsApp, Telegram, and SMS notifications through durable BullMQ queues.
- Run Telegram-based chama (savings group) workflows, including contributions,
  fines, cycle closing, and treasurer reporting.
- Reconcile Paystack payments and announce confirmed contributions.
- Give treasurers a passwordless, one-time-link dashboard scoped to their groups.
- Expose a cron control surface and queue telemetry for operators.

## Features

### WhatsApp and CRM

- Signed Meta WhatsApp Cloud API webhook with verification handshake and
  HMAC-SHA256 signature checks.
- Inbound text and interactive replies handled by a stateful lead-qualification
  flow.
- Automatic lead and conversation creation, message logging, and status
  updates.
- CRM dashboard with search, assignment filters, lead detail, and live status
  changes.
- Interactive WhatsApp lists for inquiry selection.

### Telegram and chama operations

- Telegram bot with private and group commands.
- Chama setup, joining, contributions, balances, member lists, and stats.
- Cycle lifecycle: open cycle, contribution tracking, fines, close, and reopen.
- Paystack checkout links and webhook-driven contribution confirmation.
- Outbox dispatcher for reliable, idempotent announcements.
- One-time treasurer login links delivered privately by the bot.
- Treasurer dashboard for group progress, member tables, and cycle history.

### Messaging and operations

- BullMQ queues for WhatsApp, Telegram, SMS, reports, and notifications.
- Exponential retries, permanent-failure detection, dead-letter queue, and
  graceful shutdown.
- Cron registry with Postgres advisory locks and Redis leader election.
- Broadcast controls, cron run history, and health reporting.
- Bull Board queue dashboard protected by admin authentication.

## Architecture

```text
                         ┌──────────────────────────────┐
                         │        Next.js dashboard     │
                         │  /crm      /treasurer        │
                         │  /api/proxy/*                │
                         └──────────────┬───────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
          ┌─────────────────┐   ┌──────────────┐   ┌──────────────┐
          │  Express API    │   │  PostgreSQL  │   │    Redis     │
          │  auth, CRM,     │   │  durable     │   │  queues,     │
          │  chama, cron    │   │  facts       │   │  locks       │
          └────────┬────────┘   └──────────────┘   └──────┬───────┘
                   │                                      │
                   ▼                                      ▼
          ┌─────────────────┐                    ┌──────────────────┐
          │ Webhooks        │                    │ BullMQ workers   │
          │ Meta / Telegram │                    │ WhatsApp / SMS   │
          │ Paystack        │                    │ Telegram / cron  │
          └─────────────────┘                    └──────────────────┘
```

The Express API is the single source of truth for CRM and chama mutations. The
Next.js dashboard calls it through a runtime proxy so the API can stay on the
private Docker network. Treasurer pages read PostgreSQL directly for fast,
server-rendered views.

## Technology

| Layer | Technology |
|---|---|
| API | Node.js 22, Express 5 |
| Dashboard | Next.js 16, React 19, Tailwind CSS 4 |
| Database | PostgreSQL 16 |
| Queues | Redis 7, BullMQ 6 |
| Messaging | Meta WhatsApp Cloud API, Telegram Bot API, Africa's Talking SMS |
| Payments | Paystack checkout and webhooks |
| Auth | JWT for CRM users, bcrypt passwords, one-time HttpOnly sessions for treasurers |
| Infrastructure | Docker Compose, health checks, log rotation, Postgres backups |

## Repository layout

```text
.
├── server/                 Express API, webhooks, workers, cron jobs
│   ├── config/             Environment, database, and Redis clients
│   ├── controllers/        HTTP request handlers
│   ├── cron/               Scheduled jobs and locking
│   ├── db/                 PostgreSQL schema
│   ├── middleware/         Auth, roles, errors, queue dashboard auth
│   ├── queues/             BullMQ producers
│   ├── repositories/       SQL data access
│   ├── routes/             API and webhook routes
│   ├── services/           CRM, WhatsApp, Telegram, chama, payments
│   └── workers/            Queue consumers
├── dashboard/              Next.js CRM and treasurer dashboard
│   ├── app/                App Router routes and API handlers
│   ├── components/         CRM and treasurer UI
│   └── lib/                API client, database, auth, chama helpers
├── scripts/                Backup, tunnel, and webhook smoke-test scripts
├── docker-compose.yml      Production-shaped stack
└── docker-compose.override.yml  Local port mappings
```

## Quick start

### Prerequisites

- Docker Engine with Compose v2
- Node.js 22+ for local development without Docker
- A Meta WhatsApp Cloud API app, Telegram bot token, Paystack test key, and
  Africa's Talking account for full functionality

### Run the stack

```bash
git clone https://github.com/sirsona/pulsecrm.git
cd pulsecrm

cp .env.dev.example .env
cp server/.env.example server/.env
# Edit .env and server/.env with your credentials.

docker compose up --build
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:3001 |
| CRM login | http://localhost:3001/login |
| Treasurer login | http://localhost:3001/treasurer/login |
| API health | http://localhost:5000/health |
| Bull Board (optional dev profile) | http://127.0.0.1:3030 |

Create the first CRM administrator:

```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Admin","email":"admin@example.com","password":"change-me-now"}'
```

Enable the optional queue dashboard:

```bash
docker compose --profile dev up -d
```

### Local development without Docker

```bash
# API
cd server
cp .env.example .env
npm install
npm run dev                  # web process
npm run dev:worker           # workers and cron in a second terminal

# Dashboard
cd dashboard
cp .env.example .env.local
npm install
npm run dev                  # http://localhost:3001
```

Apply the database schema once:

```bash
psql "postgresql://crm_user:<password>@localhost:5432/crm" -f server/db/schema.sql
```

## Environment configuration

The stack uses two environment files:

- **Root `.env`** — Compose ports, Postgres password, internal API secret, and
  treasurer URL.
- **`server/.env`** — API, database, Redis, Meta, Telegram, Paystack, SMS, and
  JWT secrets.

Start from the committed templates:

```bash
cp .env.dev.example .env
cp server/.env.example server/.env
cp dashboard/.env.example dashboard/.env.local
```

Never commit real credentials. The repository ignores `.env*` files, backups,
generated reports, and build output.

### Required server variables

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection |
| `REDIS_URL` | Redis connection used by BullMQ and sessions |
| `JWT_SECRET` | Signs CRM access tokens |
| `META_VERIFY_TOKEN`, `META_APP_SECRET` | Meta webhook verification and signatures |
| `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID` | Outbound WhatsApp Cloud API sends |
| `TELEGRAM_BOT_TOKEN` | Telegram bot authentication |
| `TELEGRAM_WEBHOOK_URL` | Public Telegram webhook URL |
| `PAYSTACK_SECRET_KEY` | Paystack API and webhook verification |
| `AT_USERNAME`, `AT_API_KEY` | Africa's Talking SMS |
| `INTERNAL_API_SECRET` | Secret shared by the dashboard and internal chama endpoints |

## Webhook setup

### Meta WhatsApp

- Callback URL: `https://<api-host>/webhooks/meta`
- Verify token: the value of `META_VERIFY_TOKEN`
- Subscribe to the `messages` field for the WhatsApp business account.
- Outbound messages require `META_ACCESS_TOKEN` and `META_PHONE_NUMBER_ID`.

### Telegram

- Webhook URL: `https://<api-host>/telegram-bot/webhook`
- Set `TELEGRAM_WEBHOOK_URL` to the same URL so the bot registers it on boot.
- Set `TELEGRAM_WEBHOOK_SECRET` to require the
  `X-Telegram-Bot-Api-Secret-Token` header.

### Paystack

- Webhook URL: `https://<api-host>/api/paystack/webhook`
- Enable the charge events used by your checkout flow.
- Paystack webhooks are signature-verified and written to the outbox before
  processing, so provider retries stay idempotent.

For local webhook testing, expose the API with a tunnel and use the URLs above.
`scripts/meta-webhook-test.sh` smoke-tests the Meta verification handshake and
signature rejection.

## API surface

| Route | Purpose |
|---|---|
| `GET /health` | API liveness |
| `POST /api/auth/signup`, `POST /api/auth/login` | CRM authentication |
| `GET /api/leads`, `GET /api/leads/:id` | Lead list and detail |
| `PATCH /api/leads/:id/status` | Change lead status |
| `POST /api/leads/:id/claim` | Assign a lead to the current user |
| `PATCH /api/leads/:id/assign` | Reassign a lead (admin) |
| `GET /api/leads/stats` | CRM metrics |
| `POST /api/telegram/broadcast` | Admin group broadcast |
| `POST /api/cron/trigger/:jobName` | Trigger a scheduled job |
| `GET /api/cron/runs`, `GET /api/cron/jobs` | Cron history and registry |
| `POST /api/chama/:chatId/close-cycle` | Internal cycle close |
| `GET|POST /webhooks/meta` | Meta WhatsApp webhook |
| `POST /telegram-bot/webhook` | Telegram updates |
| `POST /api/paystack/webhook` | Paystack payment events |
| `GET /admin/queues` | Bull Board dashboard |

## Background jobs

- **WhatsApp worker** — sends WhatsApp text and template messages.
- **Telegram worker** — sends bot messages and broadcasts.
- **SMS worker** — sends Africa's Talking SMS with retry handling.
- **Reports worker** — generates PDF reports for treasurers.
- **Notifications worker** — general notification jobs.
- **Cron registry** — reconciliation, reminders, cycle closing, reports, cleanup,
  and health checks.

Failed jobs retry with exponential backoff. Permanent failures move to a
dead-letter queue for review. The worker process handles `SIGTERM`/`SIGINT`
gracefully.

## Testing and checks

```bash
cd server && npm test
cd dashboard && npm run lint && npm run build
```

The current automated suite covers core server utilities and USSD
internationalisation. Queue and webhook integration tests should run against
disposable Postgres and Redis services.

## Deployment

The production-shaped Compose stack runs:

- `postgres` and `redis` on a private network
- `api` on port 5000
- `worker` as a background process
- `dashboard` on port 3001
- optional `bullboard` behind a local-only port

For production:

1. Put the dashboard and API behind TLS (a reverse proxy or managed load
   balancer).
2. Set `EXPRESS_URL` to the internal API address for the dashboard.
3. Set all secrets in the platform secret manager, not in Git.
4. Point Meta, Telegram, and Paystack webhooks at the public API host.
5. Run the schema migration before starting the API.
6. Keep Postgres and Redis off the public network.

## Security notes

- Meta webhooks require a valid `X-Hub-Signature-256` HMAC over the raw body.
- Telegram webhook requests can require a shared secret header.
- Paystack webhooks are HMAC-verified before entering the outbox.
- CRM users authenticate with bcrypt-hashed passwords and signed JWTs.
- Treasurer sessions are one-time, time-limited, and stored in HttpOnly cookies.
- The internal chama API requires `INTERNAL_API_SECRET`.
- Bull Board requires admin authentication.
- Never commit `.env` files, database backups, generated reports, or provider
  credentials.

## License

Released under the [MIT License](LICENSE).
