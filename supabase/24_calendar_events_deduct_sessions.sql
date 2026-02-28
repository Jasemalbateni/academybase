-- Migration 24: track session-deduction intent on calendar training events
-- Needed so that when a manual training event is deleted, we know whether
-- player sessions were consumed and need to be restored.
--
-- DEFAULT false: all existing events are treated as "no deduction applied"
-- which is the safe direction (avoids spurious session restoration).

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS deduct_sessions boolean NOT NULL DEFAULT false;
