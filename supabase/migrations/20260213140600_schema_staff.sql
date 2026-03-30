-- =============================================================================
-- 06 · Staff table
-- Run after 05_schema_players.sql
-- RLS: non-recursive – all policies use profiles.academy_id directly
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.staff (
  id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_id      uuid          NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  name            text          NOT NULL,
  role            text          NOT NULL DEFAULT 'مدرب',  -- 'مدرب' | 'إداري' | 'موظف'
  job_title       text,
  monthly_salary  numeric(10,3) NOT NULL DEFAULT 0,
  branch_ids      uuid[]        NOT NULL DEFAULT '{}',
  assign_mode     text          NOT NULL DEFAULT 'single',  -- 'single' | 'multi' | 'all'
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   DEFAULT now(),
  updated_at      timestamptz   DEFAULT now()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select" ON public.staff
  FOR SELECT USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "staff_insert" ON public.staff
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "staff_update" ON public.staff
  FOR UPDATE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "staff_delete" ON public.staff
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );
