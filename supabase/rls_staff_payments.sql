-- ============================================================
-- AcademyBase — Enable RLS on legacy tables: staff + payments
--
-- These tables are NOT used via Supabase in the current app;
-- all data for staff and payments lives in localStorage.
-- Enabling RLS with NO policies = deny all direct DB access.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- staff table
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
-- No policies added → row-level security blocks ALL access by default.
-- To verify: SELECT policyname FROM pg_policies WHERE tablename = 'staff';

-- payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
-- No policies added → row-level security blocks ALL access by default.
-- To verify: SELECT policyname FROM pg_policies WHERE tablename = 'payments';

-- ============================================================
-- If you later migrate staff/payments to Supabase, add policies
-- scoped by academy_id using the academy_members canonical source:
--
-- CREATE POLICY "staff_owner_access" ON public.staff
--   USING (
--     academy_id IN (
--       SELECT academy_id FROM public.academy_members WHERE user_id = auth.uid()
--     )
--   );
-- ============================================================
