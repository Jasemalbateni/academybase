-- =============================================================================
-- 05 · Players + Payments tables
-- Run after 04_schema_branches.sql
-- RLS: non-recursive – all policies use profiles.academy_id directly
-- =============================================================================

-- ── Players ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.players (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_id        uuid          NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  branch_id         uuid          REFERENCES public.branches(id) ON DELETE SET NULL,
  name              text          NOT NULL,
  birth             text          NOT NULL DEFAULT '',
  phone             text          NOT NULL DEFAULT '',
  subscription_mode text          NOT NULL DEFAULT 'حصص',  -- 'حصص' | 'شهري'
  sessions          integer       NOT NULL DEFAULT 0,
  price             numeric(10,3) NOT NULL DEFAULT 0,
  start_date        date          NOT NULL,
  end_date          date,
  is_legacy         boolean       NOT NULL DEFAULT false,
  created_at        timestamptz   DEFAULT now(),
  updated_at        timestamptz   DEFAULT now()
);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Shared subquery shortcut (non-recursive: profiles has direct user_id = auth.uid() policy)
CREATE POLICY "players_select" ON public.players
  FOR SELECT USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "players_insert" ON public.players
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "players_update" ON public.players
  FOR UPDATE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "players_delete" ON public.players
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ── Payments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id          uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_id  uuid          NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  branch_id   uuid          REFERENCES public.branches(id) ON DELETE SET NULL,
  player_id   uuid          NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  amount      numeric(10,3) NOT NULL,
  kind        text          NOT NULL DEFAULT 'new',  -- 'new' | 'renew'
  note        text,
  date        date          NOT NULL,
  created_at  timestamptz   DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "payments_delete" ON public.payments
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );
