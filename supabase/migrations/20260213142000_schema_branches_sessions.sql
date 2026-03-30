-- =============================================================================
-- 20 · Branch rent settings + Sessions table
-- Run after 19_schema_staff_attendance.sql
--
-- Changes:
--   1. branches: add rent_type enum + monthly_rent (safe, default values)
--   2. Create: sessions table for per-session financial tracking
-- RLS: non-recursive, uses my_academy_id() + SECURITY DEFINER helpers.
-- =============================================================================

-- ── 1. Extend branches table (safe migration) ─────────────────────────────────

-- rent_type: how the field rent is billed
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS rent_type text NOT NULL DEFAULT 'fixed_monthly'
    CHECK (rent_type IN ('fixed_monthly', 'per_session'));

-- monthly_rent: total monthly field cost (used for per_session calculation)
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS monthly_rent numeric NOT NULL DEFAULT 0
    CHECK (monthly_rent >= 0);

-- ── 2. Sessions Table ─────────────────────────────────────────────────────────
-- Tracks individual training sessions with financial data.
-- One row per (branch_id, date) — status overrides the generated schedule.

CREATE TABLE IF NOT EXISTS public.sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid        NOT NULL REFERENCES public.academies(id)  ON DELETE CASCADE,
  branch_id   uuid        NOT NULL REFERENCES public.branches(id)   ON DELETE CASCADE,
  date        date        NOT NULL,
  status      text        NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  field_cost  numeric     NOT NULL DEFAULT 0 CHECK (field_cost >= 0),
  coach_cost  numeric     NOT NULL DEFAULT 0 CHECK (coach_cost >= 0),
  revenue     numeric     NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (branch_id, date)
);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sessions_academy     ON public.sessions (academy_id);
CREATE INDEX IF NOT EXISTS idx_sessions_branch_date ON public.sessions (branch_id, date);
CREATE INDEX IF NOT EXISTS idx_sessions_date        ON public.sessions (date);

-- ── 4. Enable RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- ── 5. Policies ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
DROP POLICY IF EXISTS "sessions_update" ON public.sessions;
DROP POLICY IF EXISTS "sessions_delete" ON public.sessions;

-- SELECT: all academy members
CREATE POLICY "sessions_select" ON public.sessions
  FOR SELECT USING (
    academy_id = public.my_academy_id()
  );

-- INSERT: owner/partner OR branch_manager
CREATE POLICY "sessions_insert" ON public.sessions
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR public.is_branch_manager(academy_id)
    )
  );

-- UPDATE: owner/partner OR branch_manager
CREATE POLICY "sessions_update" ON public.sessions
  FOR UPDATE
  USING (
    academy_id = public.my_academy_id()
  )
  WITH CHECK (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR public.is_branch_manager(academy_id)
    )
  );

-- DELETE: owner/partner only
CREATE POLICY "sessions_delete" ON public.sessions
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );
