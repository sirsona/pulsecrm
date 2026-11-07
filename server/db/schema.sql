
-- Users table (already exists)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent'
    CHECK (role IN ('admin', 'agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone VARCHAR(20) NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  inquiry_type TEXT,
  status TEXT NOT NULL DEFAULT 'new' 
    CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  assigned_to UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_chats (
  id BIGINT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  username TEXT,
  first_joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_contributions (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES telegram_chats(id),
  user_id BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'awaiting_name',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  chat_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  first_name TEXT,
  joined_at TIMESTAMPTZ NOT NULL,
  left_at TIMESTAMPTZ,
  role TEXT DEFAULT 'member',
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_settings (
  chat_id BIGINT PRIMARY KEY REFERENCES telegram_chats(id),
  rules_text TEXT,
  welcome_message TEXT,
  max_messages_per_minute INTEGER DEFAULT 10,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  language TEXT DEFAULT 'en'
);

CREATE TABLE  IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS  broadcast_deliveries (
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id),
  chat_id BIGINT NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT,
  PRIMARY KEY (broadcast_id, chat_id)
);

CREATE TABLE IF NOT EXISTS  cron_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'success', 'failed')),
  error_message TEXT,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS  idx_cron_runs_job_started ON cron_runs(job_name, started_at DESC);
-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_wa_phone ON leads(wa_phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_state ON conversations(state);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- Chama Savings Platform
-- ============================================================

CREATE TABLE IF NOT EXISTS chamas (
  chat_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_amount_cents INTEGER NOT NULL CHECK (monthly_amount_cents > 0),
  fine_percent NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  cycle_day INTEGER NOT NULL DEFAULT 1 CHECK (cycle_day BETWEEN 1 AND 28),
  treasurer_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chama_members (
  chama_id BIGINT NOT NULL REFERENCES chamas(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (chama_id, user_id)
);

CREATE TABLE IF NOT EXISTS cycles (
  id BIGSERIAL PRIMARY KEY,
  chama_id BIGINT NOT NULL REFERENCES chamas(chat_id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'cancelled')),
  expected_total_cents INTEGER NOT NULL,
  UNIQUE (chama_id, period_start)
);

CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id BIGINT NOT NULL REFERENCES cycles(id),
  chama_id BIGINT NOT NULL,
  member_user_id BIGINT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  provider_reference TEXT,
  payment_method TEXT NOT NULL DEFAULT 'paystack',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fines (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES cycles(id),
  member_user_id BIGINT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payouts (
  id BIGSERIAL PRIMARY KEY,
  chama_id BIGINT NOT NULL REFERENCES chamas(chat_id),
  recipient_user_id BIGINT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL,
  paid_at TIMESTAMPTZ,
  created_by BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  token UUID PRIMARY KEY,
  user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

-- At most one open cycle per chama (invariant #1)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cycles_one_open
  ON cycles(chama_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_chama_members_chama ON chama_members(chama_id);
CREATE INDEX IF NOT EXISTS idx_contrib_cycle ON contributions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_contrib_member ON contributions(chama_id, member_user_id);
CREATE INDEX IF NOT EXISTS idx_fines_cycle ON fines(cycle_id);
CREATE INDEX IF NOT EXISTS idx_fines_member ON fines(member_user_id);
CREATE INDEX IF NOT EXISTS idx_payouts_chama ON payouts(chama_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expires ON dashboard_sessions(expires_at);

-- One pending contribution per member per cycle (duplicate-tap guard)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrib_one_pending
  ON contributions(cycle_id, member_user_id) WHERE status = 'pending';