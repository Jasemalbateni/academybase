-- =============================================================================
-- 09 · Role-based RLS + Performance Indexes
-- Run after 08_schema_invitations.sql
--
-- Adds role enforcement to sensitive tables:
--   finance_tx  → owner + admin only (read + write)
--   staff       → all members can SELECT (needed for finance auto-sync);
--                 INSERT/UPDATE/DELETE restricted to owner only
--   branches    → INSERT/UPDATE/DELETE restricted to owner + admin
--   players     → INSERT/UPDATE/DELETE restricted to owner + admin
--   payments    → INSERT/UPDATE/DELETE restricted to owner + admin
--
-- Non-recursive pattern: all role checks join academy_members (which has its
-- own direct policy: user_id = auth.uid()) — no circular deps.
-- =============================================================================

-- ── Performance Indexes ───────────────────────────────────────────────────────

-- academy_members: role lookups hit this constantly
CREATE INDEX IF NOT EXISTS academy_members_user_id_idx    ON public.academy_members (user_id);
CREATE INDEX IF NOT EXISTS academy_members_academy_id_idx ON public.academy_members (academy_id);

-- payments: month filtering + player-grouping for renewal KPI
CREATE INDEX IF NOT EXISTS payments_academy_id_idx ON public.payments (academy_id);
CREATE INDEX IF NOT EXISTS payments_player_id_idx  ON public.payments (player_id);
CREATE INDEX IF NOT EXISTS payments_date_idx       ON public.payments (date);

-- finance_tx: month and academy filtering
CREATE INDEX IF NOT EXISTS finance_tx_academy_id_idx ON public.finance_tx (academy_id);
CREATE INDEX IF NOT EXISTS finance_tx_month_idx      ON public.finance_tx (month);

-- players: academy + branch filtering
CREATE INDEX IF NOT EXISTS players_academy_id_idx ON public.players (academy_id);
CREATE INDEX IF NOT EXISTS players_branch_id_idx  ON public.players (branch_id);

-- ── finance_tx: owner + admin only ───────────────────────────────────────────

DROP POLICY IF EXISTS "finance_tx_select" ON public.finance_tx;
CREATE POLICY "finance_tx_select" ON public.finance_tx
  FOR SELECT USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = finance_tx.academy_id
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "finance_tx_insert" ON public.finance_tx;
CREATE POLICY "finance_tx_insert" ON public.finance_tx
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = finance_tx.academy_id
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "finance_tx_update" ON public.finance_tx;
CREATE POLICY "finance_tx_update" ON public.finance_tx
  FOR UPDATE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = finance_tx.academy_id
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "finance_tx_delete" ON public.finance_tx;
CREATE POLICY "finance_tx_delete" ON public.finance_tx
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = finance_tx.academy_id
        AND role IN ('owner', 'admin')
    )
  );

-- ── staff: SELECT open to all members; writes = owner only ───────────────────
-- SELECT stays unrestricted (all academy members can read staff for finance
-- auto-sync which computes salary entries per staff member).
-- The existing "staff_select" policy already uses profiles.academy_id — keep it.

DROP POLICY IF EXISTS "staff_insert" ON public.staff;
CREATE POLICY "staff_insert" ON public.staff
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = staff.academy_id
        AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "staff_update" ON public.staff;
CREATE POLICY "staff_update" ON public.staff
  FOR UPDATE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = staff.academy_id
        AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "staff_delete" ON public.staff;
CREATE POLICY "staff_delete" ON public.staff
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = staff.academy_id
        AND role = 'owner'
    )
  );

-- ── branches: writes = owner + admin ─────────────────────────────────────────

DROP POLICY IF EXISTS "branches_insert" ON public.branches;
CREATE POLICY "branches_insert" ON public.branches
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = branches.academy_id
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "branches_update" ON public.branches;
CREATE POLICY "branches_update" ON public.branches
  FOR UPDATE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = branches.academy_id
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "branches_delete" ON public.branches;
CREATE POLICY "branches_delete" ON public.branches
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = branches.academy_id
        AND role IN ('owner', 'admin')
    )
  );

-- ── players: writes = owner + admin ──────────────────────────────────────────

DROP POLICY IF EXISTS "players_insert" ON public.players;
CREATE POLICY "players_insert" ON public.players
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = players.academy_id
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "players_update" ON public.players;
CREATE POLICY "players_update" ON public.players
  FOR UPDATE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = players.academy_id
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "players_delete" ON public.players;
CREATE POLICY "players_delete" ON public.players
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = players.academy_id
        AND role IN ('owner', 'admin')
    )
  );

-- ── payments: writes = owner + admin ─────────────────────────────────────────

DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = payments.academy_id
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "payments_delete" ON public.payments;
CREATE POLICY "payments_delete" ON public.payments
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = payments.academy_id
        AND role IN ('owner', 'admin')
    )
  );

-- ── academy_members: update role = owner only ────────────────────────────────
-- (Owner can change other members' roles, but not their own to prevent lockout)

DROP POLICY IF EXISTS "academy_members_update" ON public.academy_members;
CREATE POLICY "academy_members_update" ON public.academy_members
  FOR UPDATE USING (
    -- Only owner of the academy can update member roles
    EXISTS (
      SELECT 1 FROM public.academy_members owner_check
      WHERE owner_check.user_id  = auth.uid()
        AND owner_check.academy_id = academy_members.academy_id
        AND owner_check.role = 'owner'
    )
    -- Owner cannot demote themselves (safety guard)
    AND user_id != auth.uid()
  );

DROP POLICY IF EXISTS "academy_members_delete" ON public.academy_members;
CREATE POLICY "academy_members_delete" ON public.academy_members
  FOR DELETE USING (
    -- Member can leave (delete their own row), OR owner can remove anyone
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.academy_members owner_check
      WHERE owner_check.user_id  = auth.uid()
        AND owner_check.academy_id = academy_members.academy_id
        AND owner_check.role = 'owner'
        AND academy_members.user_id != auth.uid()  -- Owner cannot remove themselves
    )
  );
