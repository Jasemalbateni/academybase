-- ============================================================
-- 02_create_rls.sql
-- Enables RLS and creates all access policies.
-- Run AFTER 01_create_schema.sql.
--
-- NO-RECURSION GUARANTEE
-- ──────────────────────
-- profiles policy:       user_id = auth.uid()
--   → Direct column comparison. No subquery. Depth = 1. Dead end.
--
-- academies policy:      owner_id = auth.uid()
--   → Direct column comparison. No subquery. Depth = 1. Dead end.
--
-- academy_members policy: user_id = auth.uid()
--   → Direct column comparison. No subquery. Depth = 1. Dead end.
--
-- branches + domain tables:
--   academy_id = (SELECT academy_id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
--   → Sub-select hits `profiles`. profiles policy is user_id = auth.uid() (see above).
--   → Depth 2, dead end. No further joins. Zero recursion.
-- ============================================================

-- ── Enable RLS on all tables ─────────────────────────────────
ALTER TABLE public.academies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tx       ENABLE ROW LEVEL SECURITY;

-- ── Drop existing policies (idempotent re-run) ────────────────
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 1. profiles
--    Direct: user_id = auth.uid()  (no subquery → no recursion)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "profiles: owner access"
  ON public.profiles
  FOR ALL
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 2. academies
--    Direct: owner_id = auth.uid()
-- ────────────────────────────────────────────────────────────
CREATE POLICY "academies: owner access"
  ON public.academies
  FOR ALL
  USING      (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 3. academy_members
--    Direct: user_id = auth.uid()
-- ────────────────────────────────────────────────────────────
CREATE POLICY "academy_members: member access"
  ON public.academy_members
  FOR ALL
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- Helper expression reused in all domain table policies:
--   (SELECT academy_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
-- Postgres evaluates this once per statement and caches the result.
-- ────────────────────────────────────────────────────────────

-- ── 4. branches ──────────────────────────────────────────────
CREATE POLICY "branches: academy member access"
  ON public.branches
  FOR ALL
  USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ── 5. players ───────────────────────────────────────────────
CREATE POLICY "players: academy member access"
  ON public.players
  FOR ALL
  USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ── 6. payments ──────────────────────────────────────────────
CREATE POLICY "payments: academy member access"
  ON public.payments
  FOR ALL
  USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ── 7. staff ─────────────────────────────────────────────────
CREATE POLICY "staff: academy member access"
  ON public.staff
  FOR ALL
  USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ── 8. finance_tx ────────────────────────────────────────────
CREATE POLICY "finance_tx: academy member access"
  ON public.finance_tx
  FOR ALL
  USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

DO $$ BEGIN
  RAISE NOTICE '✅  02_create_rls: RLS enabled and all policies created.';
  RAISE NOTICE '    Recursion depth: profiles=1, domain tables=2 (dead end at profiles). Zero recursion.';
END $$;
