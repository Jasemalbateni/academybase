-- ============================================================
-- 03_seed_optional.sql
-- OPTIONAL: inserts demo data for manual testing.
--
-- ⚠️  DO NOT run this in production.
-- ⚠️  Requires a real user to exist in auth.users first.
--     Replace the UUIDs below with values from your own signup.
--
-- How to get your IDs after signing up:
--   Dashboard → Authentication → Users → copy the user UUID
--   Dashboard → Table Editor → academies → copy the academy UUID
--   Dashboard → Table Editor → branches → copy a branch UUID
-- ============================================================

-- Uncomment and fill in the UUIDs to use this seed.

/*

-- Replace with your actual values:
DO $$
DECLARE
  v_user_id    uuid := 'YOUR_AUTH_USER_UUID';   -- from auth.users
  v_academy_id uuid := 'YOUR_ACADEMY_UUID';     -- from academies table (created by signup)
  v_branch_id  uuid;
BEGIN

  -- Demo branch
  INSERT INTO public.branches (academy_id, name, price, days, start_time, end_time, subscription_mode)
  VALUES (v_academy_id, 'الفرع التجريبي', 150, ARRAY['السبت','الاثنين','الأربعاء'], '16:00', '18:00', 'monthly')
  RETURNING id INTO v_branch_id;

  -- Demo player
  INSERT INTO public.players (academy_id, branch_id, name, birth, phone, subscription_mode, sessions, price, start_date, is_legacy)
  VALUES (v_academy_id, v_branch_id, 'لاعب تجريبي', '01/01/2010', '96500000000', 'monthly', 0, 150, CURRENT_DATE, false);

  -- Demo staff member
  INSERT INTO public.staff (academy_id, name, role, job_title, monthly_salary, branch_ids, assign_mode, is_active)
  VALUES (v_academy_id, 'مدرب تجريبي', 'مدرب', 'مدرب كرة قدم', 500, ARRAY[v_branch_id], 'single', true);

  RAISE NOTICE '✅  03_seed_optional: demo data inserted for academy %.', v_academy_id;
END $$;

*/

DO $$ BEGIN
  RAISE NOTICE '03_seed_optional: skipped (all statements are commented out). Uncomment to seed demo data.';
END $$;
