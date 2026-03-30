-- Migration: Enable Supabase Realtime for the notifications table.
--
-- Required so that INSERT/UPDATE postgres_changes events on the notifications
-- table are broadcast to subscribed clients (NotificationBell, Sidebar badge).
--
-- Run once via Supabase Dashboard → SQL Editor, or via CLI:
--   supabase db push
--
-- The supabase_realtime publication is created automatically when Realtime is
-- enabled on the project. This statement adds the notifications table to it.
-- Running it more than once is safe (Postgres ignores duplicate table entries
-- in a publication).

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
