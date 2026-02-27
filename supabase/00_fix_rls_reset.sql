-- ============================================================
-- AcademyBase — 00: Drop ALL existing RLS policies (clean slate)
--
-- The stack-depth error [54001] is caused by circular RLS:
--   academies policy → queries academy_members
--   academy_members policy → queries academies (or branches → academies → ...)
--
-- This script drops every known policy to break the cycle.
-- Run FIRST, before any other migration script.
-- ============================================================

-- academies
DROP POLICY IF EXISTS "academies_select_member"   ON public.academies;
DROP POLICY IF EXISTS "academies_insert_own"      ON public.academies;
DROP POLICY IF EXISTS "academies_update_own"      ON public.academies;

-- academy_members
DROP POLICY IF EXISTS "academy_members_select_own"  ON public.academy_members;
DROP POLICY IF EXISTS "academy_members_insert_own"  ON public.academy_members;

-- profiles
DROP POLICY IF EXISTS "profiles_select_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;

-- branches
DROP POLICY IF EXISTS "branches_select"   ON public.branches;
DROP POLICY IF EXISTS "branches_insert"   ON public.branches;
DROP POLICY IF EXISTS "branches_update"   ON public.branches;
DROP POLICY IF EXISTS "branches_delete"   ON public.branches;

-- legacy (from previous patch sessions — drop anything with these names too)
DROP POLICY IF EXISTS "Enable read access for all users"   ON public.academies;
DROP POLICY IF EXISTS "Enable insert for authenticated"    ON public.academies;
DROP POLICY IF EXISTS "Enable read access for all users"   ON public.academy_members;
DROP POLICY IF EXISTS "Enable insert for authenticated"    ON public.academy_members;
DROP POLICY IF EXISTS "Enable read access for all users"   ON public.profiles;

-- Verify: run this after to confirm zero policies remain on these tables:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('academies','academy_members','profiles','branches');
