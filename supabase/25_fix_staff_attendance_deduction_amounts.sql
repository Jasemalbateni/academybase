-- Migration 25: Correct inflated deduction_amount values in staff_attendance
--
-- Root cause: computeSessionDeduction() was missing a division by branchCount.
-- For staff assigned to N branches, deduction_amount was computed as:
--   salary / sessions_in_month                   (incorrect — full salary)
-- It should be:
--   (salary / branch_count) / sessions_in_month  (correct — per-branch share)
--
-- Fix: for multi-branch staff records, scale down by 1/branch_count.
-- Since:  old = salary / sessions
--         new = (salary / branch_count) / sessions = old / branch_count
--
-- ⚠️  RUN ONCE ONLY — this migration is NOT idempotent.
--     Running twice would divide by branch_count a second time, over-correcting.
--     Guard: only update records last modified before this migration was deployed.
--     The code fix was deployed on 2026-03-14. Records created or updated
--     AFTER that date already use the correct formula.
--
-- Only corrects:
--   - multi-branch staff (array_length(branch_ids, 1) > 1)
--   - records where deduct_from_salary = true (absent/late/no_training deductions)
--   - records updated before 2026-03-14 (before the code fix was deployed)

UPDATE staff_attendance sa
SET
  deduction_amount = ROUND(
    (sa.deduction_amount / GREATEST(1, array_length(s.branch_ids, 1))) * 100.0
  ) / 100.0,
  updated_at = NOW()
FROM staff s
WHERE
  sa.staff_id               = s.id
  AND sa.academy_id         = s.academy_id
  AND sa.deduct_from_salary = true
  AND sa.deduction_amount   > 0
  AND array_length(s.branch_ids, 1) > 1
  AND sa.updated_at         < '2026-03-14 00:00:00+00';
