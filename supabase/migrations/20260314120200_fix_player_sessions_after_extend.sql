-- Migration 26 (revised): Fix حصص player end_dates that were wrongly extended
--
-- Root cause: extendBranchPlayersByOneSession() had an Arabic/English comparison bug:
--   it checked `subscription_mode = "sessions"` (English) instead of `"حصص"` (Arabic).
-- Result: حصص players received DATE extension instead of sessions++.
-- Later: calendar restores did not reverse these extensions (deduct_sessions was not stored).
-- Net effect: players have end_date pushed forward, sessions unchanged → remainingSessions = 0
--             but dashboard still counts them as active because end_date > monthStart.
--
-- Fix strategy — two phases:
--
-- PHASE 1: REVERT wrongly extended end_dates
--   Target: حصص players with NO extension events in subscription_events
--           whose actual end_date > correct_end_date (sessions-th training day from start)
--   Action: set end_date = the date of the sessions-th training day from start_date
--
-- PHASE 2: BUMP sessions for legitimately extended players
--   Target: حصص players WITH extension events whose sessions < countDays(start, end, days)
--   Action: sessions = countDays(start, end, branch.days)  [only increases, never decreases]
--
-- Arabic weekday → PostgreSQL extract(dow) mapping:
--   الأحد = 0, الاثنين = 1, الثلاثاء = 2, الأربعاء = 3,
--   الخميس = 4, الجمعة = 5, السبت = 6
--
-- ⚠️  RUN ONCE ONLY — safe to re-inspect with SELECT before running UPDATE.
--     subscription_events table must exist (migration 19+). If it doesn't exist,
--     Phase 1 will skip all players (NOT EXISTS subquery will error — wrap in DO block).

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper macro: is_training_day(d, b.days)
-- Inlined below as a CASE-style WHERE clause for portability.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── DIAGNOSTIC (run first to see affected players) ──────────────────────────
--
-- SELECT p.id, p.name, p.start_date, p.end_date, p.sessions,
--        sub.correct_end_date,
--        (p.end_date::date - sub.correct_end_date) AS days_over,
--        has_ext.flag AS has_extension_event
-- FROM players p
-- JOIN branches b ON p.branch_id = b.id
-- CROSS JOIN LATERAL (
--   SELECT (
--     SELECT gs::date
--     FROM generate_series(p.start_date::date,
--                          p.start_date::date + (p.sessions * 30),
--                          '1 day') AS gs
--     WHERE (b.days @> ARRAY['الأحد']::text[]    AND extract(dow FROM gs) = 0)
--        OR (b.days @> ARRAY['الاثنين']::text[]  AND extract(dow FROM gs) = 1)
--        OR (b.days @> ARRAY['الثلاثاء']::text[] AND extract(dow FROM gs) = 2)
--        OR (b.days @> ARRAY['الأربعاء']::text[] AND extract(dow FROM gs) = 3)
--        OR (b.days @> ARRAY['الخميس']::text[]   AND extract(dow FROM gs) = 4)
--        OR (b.days @> ARRAY['الجمعة']::text[]   AND extract(dow FROM gs) = 5)
--        OR (b.days @> ARRAY['السبت']::text[]    AND extract(dow FROM gs) = 6)
--     ORDER BY gs
--     LIMIT 1 OFFSET GREATEST(0, p.sessions - 1)
--   ) AS correct_end_date
-- ) sub
-- CROSS JOIN LATERAL (
--   SELECT EXISTS (
--     SELECT 1 FROM subscription_events se
--     WHERE se.player_id = p.id
--       AND se.event_type = 'extension'
--       AND se.extend_days > 0
--   ) AS flag
-- ) has_ext
-- WHERE p.subscription_mode = 'حصص'
--   AND p.end_date IS NOT NULL
--   AND p.start_date IS NOT NULL
--   AND p.sessions > 0
--   AND sub.correct_end_date IS NOT NULL
--   AND p.end_date::date <> sub.correct_end_date
-- ORDER BY days_over DESC;

-- ─── PHASE 1: Revert wrongly extended end_dates ───────────────────────────────
-- Only targets حصص players with NO positive extension events.
-- Reverts end_date to the date of their sessions-th training day from start_date.

UPDATE players p
SET
  end_date   = sub.correct_end_date,
  updated_at = NOW()
FROM (
  SELECT
    p2.id,
    (
      SELECT gs::date
      FROM generate_series(
        p2.start_date::date,
        p2.start_date::date + (p2.sessions * 30),   -- upper bound: 30 days per session
        '1 day'
      ) AS gs
      WHERE
        (b.days @> ARRAY['الأحد']::text[]    AND extract(dow FROM gs) = 0) OR
        (b.days @> ARRAY['الاثنين']::text[]  AND extract(dow FROM gs) = 1) OR
        (b.days @> ARRAY['الثلاثاء']::text[] AND extract(dow FROM gs) = 2) OR
        (b.days @> ARRAY['الأربعاء']::text[] AND extract(dow FROM gs) = 3) OR
        (b.days @> ARRAY['الخميس']::text[]   AND extract(dow FROM gs) = 4) OR
        (b.days @> ARRAY['الجمعة']::text[]   AND extract(dow FROM gs) = 5) OR
        (b.days @> ARRAY['السبت']::text[]    AND extract(dow FROM gs) = 6)
      ORDER BY gs
      LIMIT 1 OFFSET GREATEST(0, p2.sessions - 1)   -- 0-indexed: sessions-th day
    ) AS correct_end_date
  FROM players p2
  JOIN branches b ON p2.branch_id = b.id
  WHERE
    p2.subscription_mode = 'حصص'
    AND p2.end_date   IS NOT NULL
    AND p2.start_date IS NOT NULL
    AND p2.sessions   > 0
    AND array_length(b.days, 1) > 0
    -- Only players without any legitimate positive extension event
    AND NOT EXISTS (
      SELECT 1
      FROM subscription_events se
      WHERE se.player_id  = p2.id
        AND se.event_type = 'extension'
        AND se.extend_days > 0
    )
) AS sub
WHERE
  p.id = sub.id
  AND sub.correct_end_date IS NOT NULL
  AND p.end_date::date > sub.correct_end_date;  -- only revert if end_date was extended beyond correct


-- ─── PHASE 2: Bump sessions for legitimately extended players ─────────────────
-- Targets حصص players WITH positive extension events where sessions count is
-- less than the number of training days from start_date to end_date.
-- Only increases sessions — never decreases.

UPDATE players p
SET
  sessions   = sub.computed_sessions,
  updated_at = NOW()
FROM (
  SELECT
    p2.id,
    (
      SELECT COUNT(*)::int
      FROM generate_series(
        p2.start_date::date,
        p2.end_date::date,
        '1 day'::interval
      ) AS d
      WHERE
        (b.days @> ARRAY['الأحد']::text[]    AND extract(dow FROM d) = 0) OR
        (b.days @> ARRAY['الاثنين']::text[]  AND extract(dow FROM d) = 1) OR
        (b.days @> ARRAY['الثلاثاء']::text[] AND extract(dow FROM d) = 2) OR
        (b.days @> ARRAY['الأربعاء']::text[] AND extract(dow FROM d) = 3) OR
        (b.days @> ARRAY['الخميس']::text[]   AND extract(dow FROM d) = 4) OR
        (b.days @> ARRAY['الجمعة']::text[]   AND extract(dow FROM d) = 5) OR
        (b.days @> ARRAY['السبت']::text[]    AND extract(dow FROM d) = 6)
    ) AS computed_sessions
  FROM players p2
  JOIN branches b ON p2.branch_id = b.id
  WHERE
    p2.subscription_mode = 'حصص'
    AND p2.end_date   IS NOT NULL
    AND p2.start_date IS NOT NULL
    AND p2.sessions   > 0
    AND array_length(b.days, 1) > 0
    -- Only players WITH a legitimate positive extension event
    AND EXISTS (
      SELECT 1
      FROM subscription_events se
      WHERE se.player_id  = p2.id
        AND se.event_type = 'extension'
        AND se.extend_days > 0
    )
) AS sub
WHERE
  p.id = sub.id
  AND sub.computed_sessions > p.sessions;  -- NEVER decrease, only correct upward
