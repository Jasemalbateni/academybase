-- ============================================================
-- AcademyBase — Repair missing academy memberships
-- Run ONCE in Supabase SQL Editor (safe to re-run).
--
-- Problem: users who created their academy via /settings had
-- academies.owner_id set but never got an academy_members row.
-- Result: branches RLS (which checks academy_members) blocked them.
--
-- Fix:
--   1. Ensure academies.owner_id column exists
--   2. Backfill academy_members from academies.owner_id
--   3. Backfill profiles from academy_members
-- ============================================================

-- 1. Ensure owner_id column exists on academies
ALTER TABLE public.academies
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- 2. Backfill academy_members for owner_id users with no membership row
INSERT INTO public.academy_members (academy_id, user_id, role)
SELECT
  a.id        AS academy_id,
  a.owner_id  AS user_id,
  'owner'     AS role
FROM public.academies a
WHERE a.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM   public.academy_members m
    WHERE  m.academy_id = a.id
      AND  m.user_id    = a.owner_id
  );

-- 3. Backfill profiles for any user in academy_members without a profile row
INSERT INTO public.profiles (user_id, academy_id)
SELECT m.user_id, m.academy_id
FROM   public.academy_members m
WHERE  NOT EXISTS (
  SELECT 1
  FROM   public.profiles p
  WHERE  p.user_id = m.user_id
)
ON CONFLICT (user_id) DO UPDATE
  SET academy_id = EXCLUDED.academy_id;

-- ============================================================
-- Verification queries (run separately to confirm result):
--
-- SELECT a.id, a.name, a.owner_id,
--        m.user_id  AS member_user_id,
--        p.user_id  AS profile_user_id
-- FROM   public.academies a
-- LEFT JOIN public.academy_members m ON m.academy_id = a.id AND m.user_id = a.owner_id
-- LEFT JOIN public.profiles p        ON p.academy_id = a.id
-- WHERE a.owner_id IS NOT NULL;
-- ============================================================
