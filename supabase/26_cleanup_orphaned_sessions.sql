-- Migration 26: Clean up orphaned session records
--
-- Sessions that are marked cancelled but have no corresponding calendar_events
-- row with event_type='canceled' are "orphaned" — their cancellation was undone
-- from the Calendar page but the session record was never cleaned up (e.g. because
-- the RLS DELETE policy only allows owner/partner, not branch_manager).
--
-- This migration marks those records as 'scheduled' so Finance no longer counts
-- them as cancelled when computing the per-session rent aggregate.
--
-- Safe: idempotent, only touches truly orphaned rows.

UPDATE public.sessions s
SET    status     = 'scheduled',
       updated_at = now()
WHERE  s.status = 'cancelled'
  AND  NOT EXISTS (
         SELECT 1
         FROM   public.calendar_events ce
         WHERE  ce.branch_id  = s.branch_id
           AND  ce.date       = s.date
           AND  ce.event_type = 'canceled'
           AND  ce.academy_id = s.academy_id
       );
