-- ============================================================
-- 01_create_schema.sql
-- Creates all tables with constraints and indexes.
-- Column names match the Next.js codebase exactly (snake_case).
-- Run AFTER 00_drop_everything.sql (or on a clean DB).
-- ============================================================

-- ── 1. academies ─────────────────────────────────────────────
-- Queried by: settings/page.tsx, register/actions.ts
CREATE TABLE IF NOT EXISTS public.academies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_id    uuid NOT NULL,               -- auth.users.id of the owner
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. profiles ──────────────────────────────────────────────
-- CANONICAL source for academy_id (used by ALL RLS policies)
-- Queried by: academyId.ts, settings/page.tsx
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id     uuid PRIMARY KEY,            -- auth.users.id
  academy_id  uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  full_name   text,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 3. academy_members ───────────────────────────────────────
-- Queried by: register/actions.ts
CREATE TABLE IF NOT EXISTS public.academy_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,               -- auth.users.id
  role        text NOT NULL DEFAULT 'owner',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academy_id, user_id)
);

-- ── 4. branches ──────────────────────────────────────────────
-- Queried by: branches.ts, players/page, staff/page, finance/page
CREATE TABLE IF NOT EXISTS public.branches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id         uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  name               text NOT NULL,
  price              numeric NOT NULL DEFAULT 0,
  days               text[] NOT NULL DEFAULT '{}',
  start_time         text NOT NULL DEFAULT '',
  end_time           text NOT NULL DEFAULT '',
  subscription_mode  text NOT NULL DEFAULT 'monthly',
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ── 5. players ───────────────────────────────────────────────
-- Queried by: players.ts, players/page.tsx
CREATE TABLE IF NOT EXISTS public.players (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id         uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  branch_id          uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name               text NOT NULL,
  birth              text NOT NULL DEFAULT '',     -- DD/MM/YYYY stored as text
  phone              text NOT NULL DEFAULT '',
  subscription_mode  text NOT NULL DEFAULT 'monthly',
  sessions           integer NOT NULL DEFAULT 0,
  price              numeric NOT NULL DEFAULT 0,
  start_date         date NOT NULL,
  end_date           date,
  is_legacy          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ── 6. payments ──────────────────────────────────────────────
-- Queried by: payments.ts, players/page.tsx, finance/page.tsx
CREATE TABLE IF NOT EXISTS public.payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  player_id   uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  amount      numeric NOT NULL DEFAULT 0,
  kind        text NOT NULL DEFAULT 'new',   -- 'new' | 'renew'
  note        text,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 7. staff ─────────────────────────────────────────────────
-- Queried by: staff.ts, staff/page.tsx, finance/page.tsx
CREATE TABLE IF NOT EXISTS public.staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id      uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  role            text NOT NULL DEFAULT 'مدرب',
  job_title       text,
  monthly_salary  numeric NOT NULL DEFAULT 0,
  branch_ids      uuid[] NOT NULL DEFAULT '{}',
  assign_mode     text NOT NULL DEFAULT 'single',  -- 'single' | 'all'
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 8. finance_tx ────────────────────────────────────────────
-- Queried by: finance.ts, finance/page.tsx, finance/reports/page.tsx
-- branch_id is TEXT (not UUID FK) because it can hold the literal value 'all'
--   for academy-wide entries (salary, academy-level costs).
-- auto_key: unique per (academy_id, auto_key) — enables upsert for auto-generated rows.
--   NULL auto_key = manual entry; multiple NULLs allowed (NULL ≠ NULL in UNIQUE).
CREATE TABLE IF NOT EXISTS public.finance_tx (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id            uuid NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  month                 text NOT NULL,    -- 'YYYY-MM'
  date                  date NOT NULL,
  type                  text NOT NULL,    -- 'مصروف' | 'إيراد'
  branch_id             text NOT NULL DEFAULT 'all',
  category              text NOT NULL,
  amount                numeric NOT NULL DEFAULT 0,
  note                  text,
  source                text NOT NULL DEFAULT 'manual',  -- 'manual' | 'auto'
  auto_key              text,
  overridden_auto_key   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz,
  -- Full UNIQUE constraint (NOT partial index) so Supabase upsert onConflict works.
  -- PostgreSQL allows multiple NULLs in UNIQUE constraints (NULL ≠ NULL).
  UNIQUE (academy_id, auto_key)
);

-- ── Indexes ──────────────────────────────────────────────────
-- Speed up common queries without redundancy
CREATE INDEX IF NOT EXISTS idx_branches_academy      ON public.branches      (academy_id);
CREATE INDEX IF NOT EXISTS idx_players_academy       ON public.players       (academy_id);
CREATE INDEX IF NOT EXISTS idx_players_branch        ON public.players       (branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_academy      ON public.payments      (academy_id);
CREATE INDEX IF NOT EXISTS idx_payments_player       ON public.payments      (player_id);
CREATE INDEX IF NOT EXISTS idx_staff_academy         ON public.staff         (academy_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_academy    ON public.finance_tx    (academy_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_month      ON public.finance_tx    (academy_id, month);

DO $$ BEGIN
  RAISE NOTICE '✅  01_create_schema: all tables and indexes created.';
END $$;
