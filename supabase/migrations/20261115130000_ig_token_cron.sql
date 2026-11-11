-- ============================================================================
-- ERP: Instagram FASE 3 — RENOVAÇÃO DIÁRIA do token do Instagram (pg_cron + pg_net). Aplicar DEPOIS de
-- 20261115120000_ig_automations.sql e de publicar a edge function "ig-manage".
-- ============================================================================
-- Todo dia às 06:17 (horário de Brasília = 09:17 UTC) o banco chama a edge function ig-manage com
-- { action: "cron_refresh" }. A função renova o token (refresh_access_token) só quando faltam menos de 20 dias.
-- A chamada leva uma chave aleatória (x-cron-key) que fica só no banco (ig_server_kv, sem acesso pelo navegador).
-- Sem pg_cron/pg_net disponíveis: só avisa (a renovação também acontece sozinha quando a tela do Instagram ou o
-- webhook usam a conta). Pode rodar mais de uma vez sem erro (troca o agendamento pelo mesmo).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron/pg_net não disponíveis: sem rotina diária (o token ainda é renovado quando a conta é usada)';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  insert into public.ig_server_kv (k, v) values ('cron_key', md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text))
    on conflict (k) do nothing;
  if exists (select 1 from cron.job where jobname = 'ig-token-refresh') then
    perform cron.unschedule('ig-token-refresh');
  end if;
  perform cron.schedule('ig-token-refresh', '17 9 * * *', $cmd$
    select net.http_post(
      url := 'https://jcnvlqfpmmejtzfhfjix.supabase.co/functions/v1/ig-manage',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select v from public.ig_server_kv where k = 'cron_key')),
      body := '{"action":"cron_refresh"}'::jsonb
    );
  $cmd$);
end $$;
