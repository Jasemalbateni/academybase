-- Migration: Enforce sessions >= 0 at the database level
-- This is the final backstop that guarantees player session counts can
-- never go negative regardless of application-level bugs.
-- Safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS for idempotency).

-- ── 1. Fix any existing rows with negative session counts ─────────────────────
-- These would have been caused by the bug in reduceBranchPlayersByOneSession
-- before the Math.max(0, ...) guard was in place.
UPDATE public.players
  SET sessions = 0
  WHERE sessions < 0;

-- ── 2. Add CHECK constraint ───────────────────────────────────────────────────
-- Drop first so this migration is safe to re-run.
ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS chk_sessions_non_negative;

ALTER TABLE public.players
  ADD CONSTRAINT chk_sessions_non_negative
  CHECK (sessions >= 0);
