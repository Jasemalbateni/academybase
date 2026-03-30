-- Migration 25: Add 'no_training' status to staff_attendance
-- This status is used when a training session is cancelled from the Calendar
-- and the user chooses to remove the salary deduction for coaches on that day.
-- 'no_training' means: the session didn't happen — coach is not penalised.
-- deduct_from_salary = false ensures the Finance auto-sync skips deduction.

ALTER TABLE public.staff_attendance
  DROP CONSTRAINT IF EXISTS staff_attendance_status_check;

ALTER TABLE public.staff_attendance
  ADD CONSTRAINT staff_attendance_status_check
  CHECK (status IN ('present','late','absent','vacation','excused','no_training'));
