-- ============================================================================
-- Performance indexes: compound query optimization
-- Migration: 30_performance_indexes.sql
-- Run in: Supabase Dashboard > SQL Editor
--
-- All indexes use IF NOT EXISTS — safe to re-run.
-- Rationale is inline for each group.
-- ============================================================================

-- ── finance_tx ──────────────────────────────────────────────────────────────
-- listFinanceTx() filters by academy_id and sorts by date DESC on every
-- dashboard/finance page load.  The existing (academy_id, month) index does
-- not cover the date-sort.  branch_id compound covers branch-filtered views.

CREATE INDEX IF NOT EXISTS idx_finance_tx_academy_date
  ON public.finance_tx (academy_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_finance_tx_academy_branch_date
  ON public.finance_tx (academy_id, branch_id, date DESC);

-- ── sessions ────────────────────────────────────────────────────────────────
-- listSessions() and the rent-aggregate sync both filter by academy_id.
-- The existing idx_sessions_branch_date starts with branch_id (no academy_id
-- prefix) so it cannot be used when academy_id is the leading filter.
-- The status column is needed by syncRentAggregateForBranch (status='cancelled').

CREATE INDEX IF NOT EXISTS idx_sessions_academy_date
  ON public.sessions (academy_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_academy_branch_status_date
  ON public.sessions (academy_id, branch_id, status, date DESC);

-- ── staff_attendance ────────────────────────────────────────────────────────
-- listStaffAttendance() filters academy_id + date range on every page load.
-- syncSalaryFinanceEntry() adds staff_id + branch_id filters for salary calc.
-- Existing indexes start with branch_id or staff_id — missing academy_id prefix.

CREATE INDEX IF NOT EXISTS idx_staff_att_academy_date
  ON public.staff_attendance (academy_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_staff_att_academy_staff_branch_date
  ON public.staff_attendance (academy_id, staff_id, branch_id, date DESC);

-- ── players ─────────────────────────────────────────────────────────────────
-- extendBranchPlayersByOneSession() and the cancel/restore flow both filter
-- on (academy_id, branch_id) together.  The existing separate single-column
-- indexes cannot serve this as a covering compound scan.

CREATE INDEX IF NOT EXISTS idx_players_academy_branch
  ON public.players (academy_id, branch_id);

-- ── payments ────────────────────────────────────────────────────────────────
-- listPayments() and listPaymentPeriods() both filter academy_id and sort by
-- date.  The existing payments_date_idx has no academy_id prefix.

CREATE INDEX IF NOT EXISTS idx_payments_academy_date
  ON public.payments (academy_id, date DESC);

-- ── notifications ───────────────────────────────────────────────────────────
-- listNotifications() filters academy_id and orders by created_at DESC.
-- The existing partial index only covers the unread-count query.

CREATE INDEX IF NOT EXISTS idx_notifications_academy_created_at
  ON public.notifications (academy_id, created_at DESC);

-- ── staff ───────────────────────────────────────────────────────────────────
-- markNoTrainingForBranch() and syncCoachDeductionForSession() filter
-- (academy_id, is_active, branch_ids @> [branchId]).
-- GIN index on branch_ids covers the array-containment operator @>.

CREATE INDEX IF NOT EXISTS idx_staff_academy_is_active
  ON public.staff (academy_id, is_active);

CREATE INDEX IF NOT EXISTS idx_staff_branch_ids_gin
  ON public.staff USING GIN (branch_ids);
