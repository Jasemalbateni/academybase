-- ============================================================
-- AcademyBase — 01: profiles table schema + RLS
--
-- profiles is the CANONICAL source for academy_id.
-- branches RLS uses profiles to avoid any recursion.
-- ============================================================

-- Ensure table exists
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  academy_id  uuid        REFERENCES public.academies(id) ON DELETE SET NULL,
  full_name   text        NOT NULL DEFAULT '',
  phone       text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Add columns if they were missing (safe on existing tables)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name  text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone      text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS academy_id uuid REFERENCES public.academies(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ── Policies (direct column checks only — NO subqueries → no recursion) ───────

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid());
