-- =============================================================================
-- 07 · Finance transactions table
-- Run after 06_schema_staff.sql
-- RLS: non-recursive – all policies use profiles.academy_id directly
--
-- Notes:
--   branch_id is TEXT (not UUID FK) because it can hold the string 'all'
--     to denote academy-level transactions.
--   auto_key / overridden_auto_key are used to de-duplicate auto-generated
--     entries (field cost, salaries, subscription revenue).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.finance_tx (
  id                   uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_id           uuid          NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  month                text          NOT NULL,              -- YYYY-MM
  date                 date          NOT NULL,
  type                 text          NOT NULL,              -- 'مصروف' | 'إيراد'
  branch_id            text          NOT NULL DEFAULT 'all',-- UUID string or 'all'
  category             text          NOT NULL,
  amount               numeric(10,3) NOT NULL,
  note                 text,
  source               text          NOT NULL DEFAULT 'manual', -- 'auto' | 'manual'
  auto_key             text,          -- stable key for auto entries (e.g. 'salary:2026-01:staffId:branchId')
  overridden_auto_key  text,          -- set when a 'manual' entry overrides an 'auto' one
  created_at           timestamptz   DEFAULT now(),
  updated_at           timestamptz
);

-- Unique constraint on auto_key + academy_id to prevent duplicate auto entries
CREATE UNIQUE INDEX IF NOT EXISTS finance_tx_auto_key_idx
  ON public.finance_tx (academy_id, auto_key)
  WHERE auto_key IS NOT NULL;

ALTER TABLE public.finance_tx ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_tx_select" ON public.finance_tx
  FOR SELECT USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "finance_tx_insert" ON public.finance_tx
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "finance_tx_update" ON public.finance_tx
  FOR UPDATE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "finance_tx_delete" ON public.finance_tx
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );
