-- ============================================================
-- AcademyBase — Branches table + RLS
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Table
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

-- 2. Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies before recreating (safe to re-run)
DROP POLICY IF EXISTS "branches_select" ON public.branches;
DROP POLICY IF EXISTS "branches_insert" ON public.branches;
DROP POLICY IF EXISTS "branches_update" ON public.branches;
DROP POLICY IF EXISTS "branches_delete" ON public.branches;

-- 4. Dual-path policies:
--    PRIMARY path:  academy_members (canonical — populated by onboarding + settings)
--    FALLBACK path: academies.owner_id (catches edge-cases before repair_memberships.sql runs)

CREATE POLICY "branches_select"
  ON public.branches
  FOR SELECT
  USING (
    academy_id IN (
      SELECT academy_id FROM public.academy_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.academies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "branches_insert"
  ON public.branches
  FOR INSERT
  WITH CHECK (
    academy_id IN (
      SELECT academy_id FROM public.academy_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.academies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "branches_update"
  ON public.branches
  FOR UPDATE
  USING (
    academy_id IN (
      SELECT academy_id FROM public.academy_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.academies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "branches_delete"
  ON public.branches
  FOR DELETE
  USING (
    academy_id IN (
      SELECT academy_id FROM public.academy_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.academies WHERE owner_id = auth.uid()
    )
  );
