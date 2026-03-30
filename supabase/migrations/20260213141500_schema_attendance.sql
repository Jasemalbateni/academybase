-- =============================================================================
-- 15 · Attendance table
-- Run after 14_fix_rls_complete.sql
--
-- Stores per-player, per-date attendance records.
-- Session dates are derived client-side from branch training days;
-- this table only stores actual records (present/absent).
--
-- Access matrix:
--   All academy members can SELECT and upsert attendance.
--   Only owner/partner can DELETE records.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attendance (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid        NOT NULL REFERENCES public.academies(id)  ON DELETE CASCADE,
  player_id   uuid        NOT NULL REFERENCES public.players(id)    ON DELETE CASCADE,
  branch_id   uuid        REFERENCES public.branches(id)            ON DELETE SET NULL,
  date        date        NOT NULL,          -- YYYY-MM-DD session date
  present     boolean     NOT NULL DEFAULT false,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- One attendance record per player per day (upsert conflict key)
  UNIQUE (academy_id, player_id, date)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Grants (same pattern as other tables)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.attendance
  TO authenticated, service_role;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Queried by academy_id + date range (month view)
CREATE INDEX IF NOT EXISTS attendance_academy_id_idx  ON public.attendance (academy_id);
CREATE INDEX IF NOT EXISTS attendance_player_id_idx   ON public.attendance (player_id);
CREATE INDEX IF NOT EXISTS attendance_date_idx        ON public.attendance (date);
CREATE INDEX IF NOT EXISTS attendance_academy_date_idx ON public.attendance (academy_id, date);

-- ── RLS policies ──────────────────────────────────────────────────────────────
-- Uses SECURITY DEFINER helpers from migration 14 (no recursion).

-- SELECT: all academy members can view attendance
DROP POLICY IF EXISTS "attendance_select" ON public.attendance;
CREATE POLICY "attendance_select" ON public.attendance
  FOR SELECT USING (
    academy_id = public.my_academy_id()
    AND public.is_academy_member(academy_id)
  );

-- INSERT: all academy members can mark attendance
-- branch_manager / admin_staff are implicitly scoped by what the UI shows them,
-- but we keep the policy permissive because marking attendance is low-risk.
DROP POLICY IF EXISTS "attendance_insert" ON public.attendance;
CREATE POLICY "attendance_insert" ON public.attendance
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND public.is_academy_member(academy_id)
  );

-- UPDATE: same — any academy member can update attendance
DROP POLICY IF EXISTS "attendance_update" ON public.attendance;
CREATE POLICY "attendance_update" ON public.attendance
  FOR UPDATE USING (
    academy_id = public.my_academy_id()
    AND public.is_academy_member(academy_id)
  );

-- DELETE: owner/partner only (guards against data loss)
DROP POLICY IF EXISTS "attendance_delete" ON public.attendance;
CREATE POLICY "attendance_delete" ON public.attendance
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );
