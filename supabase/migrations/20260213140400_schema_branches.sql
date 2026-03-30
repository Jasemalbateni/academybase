-- ============================================================
-- AcademyBase — 04: branches table schema + RLS
--
-- CRITICAL DESIGN: branches RLS uses profiles.academy_id
-- (not academy_members) to avoid ANY recursion.
--
-- Recursion chain that was breaking things:
--   branches → academy_members → academies → academy_members (loop)
--
-- New chain (no loop possible):
--   branches → profiles   (profiles policy: user_id = auth.uid(), no further joins)
-- ============================================================

-- Ensure table exists
CREATE TABLE IF NOT EXISTS public.branches (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id        uuid        NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  price             numeric     NOT NULL DEFAULT 0,
  days              text[]      NOT NULL DEFAULT '{}',
  start_time        text        NULL,
  end_time          text        NULL,
  subscription_mode text        NOT NULL DEFAULT 'شهري',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Drop any leftover policies
DROP POLICY IF EXISTS "branches_select" ON public.branches;
DROP POLICY IF EXISTS "branches_insert" ON public.branches;
DROP POLICY IF EXISTS "branches_update" ON public.branches;
DROP POLICY IF EXISTS "branches_delete" ON public.branches;

-- ── Policies: academy_id must match the user's profile.academy_id ─────────────
-- The subquery goes: branches → profiles → (no further joins, policy is direct)
-- Zero recursion.

CREATE POLICY "branches_select"
  ON public.branches FOR SELECT
  USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "branches_insert"
  ON public.branches FOR INSERT
  WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "branches_update"
  ON public.branches FOR UPDATE
  USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "branches_delete"
  ON public.branches FOR DELETE
  USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );
