-- ============================================================
-- AcademyBase — RLS policies for academy_members, profiles, academies
--
-- ROOT CAUSE: RLS was enabled on these tables but NO SELECT policies
-- existed. Supabase/Postgres returns data: null, error: null when RLS
-- blocks a query — NOT an error object. So resolveAcademyId() saw
-- null data, no error, and threw "لا توجد أكاديمية مرتبطة بهذا الحساب"
-- even though the row was there.
--
-- Additionally: the branches RLS policy runs a subquery on
-- academy_members — if academy_members SELECT is blocked, that
-- subquery also returns nothing, so branches CRUD fails too.
--
-- Run ORDER: this file FIRST, then branches.sql.
-- Safe to re-run (all statements use IF NOT EXISTS / DROP IF EXISTS).
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. academy_members
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.academy_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academy_members_select_own"  ON public.academy_members;
DROP POLICY IF EXISTS "academy_members_insert_own"  ON public.academy_members;

-- Users can read their own membership rows.
-- CRITICAL: without this, resolveAcademyId() and the branches
-- RLS subquery both silently return nothing.
CREATE POLICY "academy_members_select_own"
  ON public.academy_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own membership row (onboarding + settings self-heal).
CREATE POLICY "academy_members_insert_own"
  ON public.academy_members
  FOR INSERT
  WITH CHECK (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════
-- 2. profiles
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;

-- Users can read their own profile row.
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own profile (onboarding upsert step).
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own profile (upsert needs UPDATE too).
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════
-- 3. academies
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.academies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academies_select_member"  ON public.academies;
DROP POLICY IF EXISTS "academies_insert_own"     ON public.academies;
DROP POLICY IF EXISTS "academies_update_own"     ON public.academies;

-- Users can read their academy (via membership OR via owner_id).
CREATE POLICY "academies_select_member"
  ON public.academies
  FOR SELECT
  USING (
    id IN (
      SELECT academy_id
      FROM   public.academy_members
      WHERE  user_id = auth.uid()
    )
    OR owner_id = auth.uid()
  );

-- Users can create their own academy (owner_id must match caller).
CREATE POLICY "academies_insert_own"
  ON public.academies
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Users can update their own academy.
CREATE POLICY "academies_update_own"
  ON public.academies
  FOR UPDATE
  USING (
    id IN (
      SELECT academy_id
      FROM   public.academy_members
      WHERE  user_id = auth.uid()
    )
    OR owner_id = auth.uid()
  );


-- ════════════════════════════════════════════════════════════
-- Verification queries (run separately to confirm):
--
-- Check which policies exist:
-- SELECT tablename, policyname, cmd, qual
-- FROM   pg_policies
-- WHERE  tablename IN ('academy_members', 'profiles', 'academies', 'branches')
-- ORDER  BY tablename, policyname;
--
-- Check RLS status:
-- SELECT relname, relrowsecurity
-- FROM   pg_class
-- WHERE  relname IN ('academy_members', 'profiles', 'academies', 'branches');
-- ════════════════════════════════════════════════════════════
