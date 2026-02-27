-- =============================================================================
-- 19 · Staff Attendance + Salary Deduction integration
-- Run after 14_fix_rls_complete.sql (requires SECURITY DEFINER helpers)
--
-- Creates: staff_attendance
-- RLS: non-recursive, uses my_academy_id() + is_owner_or_partner() +
--      is_branch_manager() from migration 14.
-- Finance link: idempotent via auto_key = 'sa:{attendance_id}' in finance_tx.
-- =============================================================================

-- ── 1. Staff Attendance Table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id         uuid        NOT NULL REFERENCES public.academies(id)  ON DELETE CASCADE,
  staff_id           uuid        NOT NULL REFERENCES public.staff(id)      ON DELETE CASCADE,
  branch_id          uuid        NOT NULL REFERENCES public.branches(id)   ON DELETE CASCADE,
  date               date        NOT NULL,
  status             text        NOT NULL DEFAULT 'present'
                                 CHECK (status IN ('present','late','absent','vacation','excused')),
  deduct_from_salary boolean     NOT NULL DEFAULT false,
  deduction_amount   numeric     NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (staff_id, branch_id, date)
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_staff_att_academy    ON public.staff_attendance (academy_id);
CREATE INDEX IF NOT EXISTS idx_staff_att_branch_date ON public.staff_attendance (branch_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_att_staff_date  ON public.staff_attendance (staff_id, date);

-- ── 3. Enable RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

-- ── 4. Policies (non-recursive via SECURITY DEFINER helpers) ─────────────────

DROP POLICY IF EXISTS "staff_att_select"  ON public.staff_attendance;
DROP POLICY IF EXISTS "staff_att_insert"  ON public.staff_attendance;
DROP POLICY IF EXISTS "staff_att_update"  ON public.staff_attendance;
DROP POLICY IF EXISTS "staff_att_delete"  ON public.staff_attendance;

-- SELECT: all academy members can view staff attendance
CREATE POLICY "staff_att_select" ON public.staff_attendance
  FOR SELECT USING (
    academy_id = public.my_academy_id()
  );

-- INSERT: owner/partner OR branch_manager
CREATE POLICY "staff_att_insert" ON public.staff_attendance
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR public.is_branch_manager(academy_id)
    )
  );

-- UPDATE: owner/partner OR branch_manager (with same academy check)
CREATE POLICY "staff_att_update" ON public.staff_attendance
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
CREATE POLICY "staff_att_delete" ON public.staff_attendance
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );
