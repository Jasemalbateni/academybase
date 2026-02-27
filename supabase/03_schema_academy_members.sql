-- ============================================================
-- AcademyBase — 03: academy_members table schema + RLS
--
-- Used for roles/authorization only.
-- Canonical academy_id source is profiles (not this table).
-- Policy uses user_id = auth.uid() ONLY — no subqueries.
-- ============================================================

-- Ensure table exists
CREATE TABLE IF NOT EXISTS public.academy_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid        NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'owner',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academy_id, user_id)
);

-- Add unique constraint if it was missing on an existing table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'academy_members_academy_id_user_id_key'
      AND conrelid = 'public.academy_members'::regclass
  ) THEN
    ALTER TABLE public.academy_members
      ADD CONSTRAINT academy_members_academy_id_user_id_key
      UNIQUE (academy_id, user_id);
  END IF;
END$$;

-- Enable RLS
ALTER TABLE public.academy_members ENABLE ROW LEVEL SECURITY;

-- ── Policies (direct column checks only — no subqueries) ─────────────────────

CREATE POLICY "academy_members_select_own"
  ON public.academy_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "academy_members_insert_own"
  ON public.academy_members FOR INSERT
  WITH CHECK (user_id = auth.uid());
