-- =============================================================================
-- 12 · Role-aware RLS for all data tables
-- Run after 11_schema_new_roles.sql
--
-- Role access matrix:
--   owner        → full access to everything
--   partner      → identical to owner
--   branch_manager → branch-scoped (players, staff, payments)
--                    + optional finance_tx read (has_finance_access = true)
--   admin_staff  → branch-scoped players only (no staff, no finance)
--
-- Recursion safety: all role checks join academy_members (which has its own
-- direct user_id = auth.uid() policy) and member_branch_access. No circular
-- dependencies.
-- =============================================================================

-- ── academy_members: allow owner/partner to see all members ──────────────────
-- The old policy only allowed seeing your own row. The team management page
-- needs the owner/partner to list all academy members.

DROP POLICY IF EXISTS "academy_members_select_own" ON public.academy_members;
DROP POLICY IF EXISTS "academy_members_select"     ON public.academy_members;
CREATE POLICY "academy_members_select" ON public.academy_members
  FOR SELECT USING (
    -- Users always see their own row
    user_id = auth.uid()
    -- Owner/partner see all members of their academy
    OR (
      academy_id = (
        SELECT academy_id FROM public.profiles
        WHERE user_id = auth.uid()
        LIMIT 1
      )
      AND EXISTS (
        SELECT 1 FROM public.academy_members am_check
        WHERE am_check.user_id   = auth.uid()
          AND am_check.academy_id = academy_members.academy_id
          AND am_check.role       IN ('owner', 'partner')
      )
    )
  );

-- UPDATE: owner/partner can change roles (cannot change the owner's role)
DROP POLICY IF EXISTS "academy_members_update" ON public.academy_members;
CREATE POLICY "academy_members_update" ON public.academy_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.academy_members am_check
      WHERE am_check.user_id   = auth.uid()
        AND am_check.academy_id = academy_members.academy_id
        AND am_check.role       IN ('owner', 'partner')
    )
    AND user_id != auth.uid()   -- Cannot change your own role
    AND role    != 'owner'       -- Cannot change the owner's role
  );

-- DELETE: members can leave; owner/partner can remove non-owner members
DROP POLICY IF EXISTS "academy_members_delete" ON public.academy_members;
CREATE POLICY "academy_members_delete" ON public.academy_members
  FOR DELETE USING (
    -- Self-removal (leave), but not the owner
    (user_id = auth.uid() AND role != 'owner')
    -- Owner/partner removes another member (not the owner row)
    OR EXISTS (
      SELECT 1 FROM public.academy_members am_check
      WHERE am_check.user_id   = auth.uid()
        AND am_check.academy_id = academy_members.academy_id
        AND am_check.role       IN ('owner', 'partner')
        AND academy_members.user_id != auth.uid()
        AND academy_members.role    != 'owner'
    )
  );

-- ── branches: full access for owner/partner; read-only assigned for others ───
DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND (
      -- Owner/partner see all branches
      EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = branches.academy_id
          AND role       IN ('owner', 'partner')
      )
      -- Branch-scoped roles see only their assigned branches
      OR EXISTS (
        SELECT 1 FROM public.member_branch_access
        WHERE user_id   = auth.uid()
          AND academy_id = branches.academy_id
          AND branch_id  = branches.id
      )
    )
  );

-- Branches CREATE/EDIT/DELETE: owner/partner only
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
      WHERE user_id   = auth.uid()
        AND academy_id = branches.academy_id
        AND role       IN ('owner', 'partner')
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
      WHERE user_id   = auth.uid()
        AND academy_id = branches.academy_id
        AND role       IN ('owner', 'partner')
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
      WHERE user_id   = auth.uid()
        AND academy_id = branches.academy_id
        AND role       IN ('owner', 'partner')
    )
  );

-- ── players: branch-scoped read/write ────────────────────────────────────────
DROP POLICY IF EXISTS "players_select" ON public.players;
CREATE POLICY "players_select" ON public.players
  FOR SELECT USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND (
      -- owner/partner see all players
      EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = players.academy_id
          AND role       IN ('owner', 'partner')
      )
      -- branch_manager/admin_staff see players in their branches
      OR (
        players.branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = players.academy_id
            AND branch_id  = players.branch_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "players_insert" ON public.players;
CREATE POLICY "players_insert" ON public.players
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = players.academy_id
          AND role       IN ('owner', 'partner')
      )
      OR (
        players.branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.academy_members
          WHERE user_id   = auth.uid()
            AND academy_id = players.academy_id
            AND role       IN ('branch_manager', 'admin_staff')
        )
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = players.academy_id
            AND branch_id  = players.branch_id
        )
      )
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
    AND (
      EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = players.academy_id
          AND role       IN ('owner', 'partner')
      )
      OR (
        players.branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.academy_members
          WHERE user_id   = auth.uid()
            AND academy_id = players.academy_id
            AND role       IN ('branch_manager', 'admin_staff')
        )
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = players.academy_id
            AND branch_id  = players.branch_id
        )
      )
    )
  );

-- Players DELETE: owner/partner only
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
      WHERE user_id   = auth.uid()
        AND academy_id = players.academy_id
        AND role       IN ('owner', 'partner')
    )
  );

-- ── staff: SELECT open to all members; writes branch-scoped ──────────────────
-- SELECT remains open to all academy members so the finance auto-sync
-- can read staff salaries. Writes are role-restricted.
-- (The existing staff_select from 06_schema_staff.sql is already correct.)

DROP POLICY IF EXISTS "staff_insert" ON public.staff;
CREATE POLICY "staff_insert" ON public.staff
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = staff.academy_id
          AND role       IN ('owner', 'partner')
      )
      -- branch_manager can add staff to their branches
      OR (
        EXISTS (
          SELECT 1 FROM public.academy_members
          WHERE user_id   = auth.uid()
            AND academy_id = staff.academy_id
            AND role       = 'branch_manager'
        )
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = staff.academy_id
            AND branch_id  = ANY(staff.branch_ids)
        )
      )
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
    AND (
      EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = staff.academy_id
          AND role       IN ('owner', 'partner')
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.academy_members
          WHERE user_id   = auth.uid()
            AND academy_id = staff.academy_id
            AND role       = 'branch_manager'
        )
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = staff.academy_id
            AND branch_id  = ANY(staff.branch_ids)
        )
      )
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
      WHERE user_id   = auth.uid()
        AND academy_id = staff.academy_id
        AND role       IN ('owner', 'partner')
    )
  );

-- ── payments: branch-scoped (mirrors players) ────────────────────────────────
DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = payments.academy_id
          AND role       IN ('owner', 'partner')
      )
      OR (
        payments.branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = payments.academy_id
            AND branch_id  = payments.branch_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = payments.academy_id
          AND role       IN ('owner', 'partner')
      )
      OR (
        payments.branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.academy_members
          WHERE user_id   = auth.uid()
            AND academy_id = payments.academy_id
            AND role       IN ('branch_manager', 'admin_staff')
        )
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = payments.academy_id
            AND branch_id  = payments.branch_id
        )
      )
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
      WHERE user_id   = auth.uid()
        AND academy_id = payments.academy_id
        AND role       IN ('owner', 'partner')
    )
  );

-- ── finance_tx: owner/partner full; branch_manager with finance flag ──────────
DROP POLICY IF EXISTS "finance_tx_select" ON public.finance_tx;
CREATE POLICY "finance_tx_select" ON public.finance_tx
  FOR SELECT USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND (
      -- Owner/partner: full access
      EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = finance_tx.academy_id
          AND role       IN ('owner', 'partner')
      )
      -- Branch manager with finance access: their specific branches only
      -- (Excludes branch_id = 'all' which are academy-wide entries)
      OR (
        EXISTS (
          SELECT 1 FROM public.academy_members
          WHERE user_id          = auth.uid()
            AND academy_id        = finance_tx.academy_id
            AND role              = 'branch_manager'
            AND has_finance_access = true
        )
        AND finance_tx.branch_id != 'all'
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = finance_tx.academy_id
            AND branch_id::text = finance_tx.branch_id
        )
      )
    )
  );

-- finance_tx writes: owner/partner only (finance entries are high-trust)
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
      WHERE user_id   = auth.uid()
        AND academy_id = finance_tx.academy_id
        AND role       IN ('owner', 'partner')
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
      WHERE user_id   = auth.uid()
        AND academy_id = finance_tx.academy_id
        AND role       IN ('owner', 'partner')
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
      WHERE user_id   = auth.uid()
        AND academy_id = finance_tx.academy_id
        AND role       IN ('owner', 'partner')
    )
  );

-- ── invitations: update for partner role ─────────────────────────────────────
-- Migration 10 fixed SELECT/UPDATE to use auth.jwt()->>'email'.
-- This migration updates them to include 'partner' in role checks.

DROP POLICY IF EXISTS "invitations_select" ON public.invitations;
CREATE POLICY "invitations_select" ON public.invitations
  FOR SELECT USING (
    -- Owner/partner see all academy invitations
    (
      academy_id = (
        SELECT academy_id FROM public.profiles
        WHERE user_id = auth.uid()
        LIMIT 1
      )
      AND EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = invitations.academy_id
          AND role       IN ('owner', 'partner')
      )
    )
    -- Invitee sees their own (for acceptance)
    OR email = (auth.jwt()->>'email')
  );

DROP POLICY IF EXISTS "invitations_insert" ON public.invitations;
CREATE POLICY "invitations_insert" ON public.invitations
  FOR INSERT WITH CHECK (
    invited_by  = auth.uid()
    AND academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id   = auth.uid()
        AND academy_id = invitations.academy_id
        AND role       IN ('owner', 'partner')
    )
  );

DROP POLICY IF EXISTS "invitations_delete" ON public.invitations;
CREATE POLICY "invitations_delete" ON public.invitations
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id   = auth.uid()
        AND academy_id = invitations.academy_id
        AND role       IN ('owner', 'partner')
    )
  );
