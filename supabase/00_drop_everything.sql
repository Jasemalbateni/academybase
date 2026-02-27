-- ============================================================
-- 00_drop_everything.sql
-- DESTRUCTIVE RESET — drops all public schema tables + policies
-- Run this FIRST, then 01 → 02 → 03
--
-- ⚠️  AUTH USERS: Cannot be deleted via SQL on Supabase free tier.
--     Delete manually:  Dashboard → Authentication → Users → select all → Delete
-- ============================================================

-- Drop tables in reverse FK dependency order so CASCADE handles cleanly.
-- finance_tx → payments → players → staff → branches → academy_members → profiles → academies

DROP TABLE IF EXISTS public.finance_tx       CASCADE;
DROP TABLE IF EXISTS public.payments         CASCADE;
DROP TABLE IF EXISTS public.players          CASCADE;
DROP TABLE IF EXISTS public.staff            CASCADE;
DROP TABLE IF EXISTS public.branches         CASCADE;
DROP TABLE IF EXISTS public.academy_members  CASCADE;
DROP TABLE IF EXISTS public.profiles         CASCADE;
DROP TABLE IF EXISTS public.academies        CASCADE;

-- Drop any stray functions (safe to run even if they don't exist)
DROP FUNCTION IF EXISTS public.get_academy_id() CASCADE;
DROP FUNCTION IF EXISTS public.resolve_academy_id() CASCADE;

-- Confirm
DO $$ BEGIN
  RAISE NOTICE '✅  00_drop_everything: all public tables dropped.';
  RAISE NOTICE '⚠️   Remember to delete Auth users via Supabase Dashboard → Authentication → Users.';
END $$;
