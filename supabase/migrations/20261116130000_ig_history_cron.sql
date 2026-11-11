-- ============================================================================
-- ERP: Instagram — ROTINAS do histórico (pg_cron + pg_net). Aplicar DEPOIS de 20261116120000_ig_history.sql e de
-- publicar a edge function "instagram" atualizada.
-- ============================================================================
--   ig-stories-hourly : a cada 1 h (minuto 07)        → instagram { action: "collect_stories" }
--   ig-daily          : todo dia às 03:40 de Brasília → instagram { action: "collect_daily" }   (06:40 UTC)
-- A chamada leva a chave aleatória x-cron-key (fica só no banco, em ig_collect_keys) e a chave anon do projeto no
-- Authorization (a mesma pública do app; serve só para passar pelo "Verify JWT" do Supabase — quem libera a coleta é
-- a x-cron-key). Sem pg_cron/pg_net: só avisa (dá para coletar à mão no ERP). Pode rodar mais de uma vez (troca os
-- agendamentos pelos mesmos).
-- ============================================================================

do $$
declare
  fn text := 'https://jcnvlqfpmmejtzfhfjix.supabase.co/functions/v1/instagram';
  anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjbnZscWZwbW1lanR6Zmhmaml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMDY1MjcsImV4cCI6MjA5MDU4MjUyN30.REFNo9-HeFnMaNpGla7ke1Ndsl8NeByHrFiFr8E66-I';
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron/pg_net não disponíveis: sem coleta automática (use "Coletar agora" no ERP)';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  if exists (select 1 from cron.job where jobname = 'ig-stories-hourly') then perform cron.unschedule('ig-stories-hourly'); end if;
  if exists (select 1 from cron.job where jobname = 'ig-daily') then perform cron.unschedule('ig-daily'); end if;
  perform cron.schedule('ig-stories-hourly', '7 * * * *', format($cmd$
    select net.http_post(url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || %L, 'x-cron-key', (select v from public.ig_collect_keys where k = 'cron_key')),
      body := '{"action":"collect_stories"}'::jsonb, timeout_milliseconds := 120000);
  $cmd$, fn, anon));
  perform cron.schedule('ig-daily', '40 6 * * *', format($cmd$
    select net.http_post(url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || %L, 'x-cron-key', (select v from public.ig_collect_keys where k = 'cron_key')),
      body := '{"action":"collect_daily"}'::jsonb, timeout_milliseconds := 300000);
  $cmd$, fn, anon));
end $$;
