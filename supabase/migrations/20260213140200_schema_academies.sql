-- ============================================================
-- AcademyBase — 02: academies table schema + RLS
--
-- Policy uses owner_id = auth.uid() ONLY.
-- No subqueries on any other table → zero recursion risk.
-- ============================================================

-- Ensure table exists
CREATE TABLE IF NOT EXISTS public.academies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  owner_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Add owner_id if missing (safe on existing tables)
ALTER TABLE public.academies ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.academies ENABLE ROW LEVEL SECURITY;

-- ── Policies (owner_id = auth.uid() only — no subqueries) ────────────────────

CREATE POLICY "academies_select_own"
  ON public.academies FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "academies_insert_own"
  ON public.academies FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "academies_update_own"
  ON public.academies FOR UPDATE
  USING (owner_id = auth.uid());
