-- ============================================================================
-- ROLLBACK da migration 20261103120000_lock_rls_authenticated.sql
-- ============================================================================
-- Fica FORA da pasta migrations de propósito (não roda sozinho). Use só se a
-- Fase 2 quebrar algo: cole no SQL Editor do Supabase e rode.
--
-- O que faz (exatamente o contrário da migration):
--   1. Apaga as políticas novas que a migration criou ("authenticated full
--      access" nas tabelas e as de authenticated do bucket wa-media).
--   2. Recria todas as políticas antigas como eram (nome, tipo, papéis,
--      comando, USING e WITH CHECK), a partir da cópia em rls_backup_20261103.
--   3. Volta o RLS ao estado anterior (desliga onde estava desligado).
--   4. Devolve ao papel anon os privilégios que ele tinha na view motoboy_stats.
--   5. Apaga o schema de cópia rls_backup_20261103 (permite aplicar de novo).
-- Resultado: o banco volta a ficar aberto para a chave anon, como na Fase 1.
--
-- Tabelas da extensão 2.0.0 (wa_settings, wa_flows, wa_flow_variants, wa_send_log,
-- wa_campaigns, wa_campaign_targets) e da 2.1.0 (wa_automations, wa_automation_runs) entram
-- aqui também: estão na cópia, seja porque a migration da Fase 2 as fechou, seja porque as
-- migrations 20261103130000/20261103140000/20261103150000
-- foram aplicadas depois da Fase 2 e se registraram nela. Voltam a "public access <tabela>".
-- ERP → CRM (20261103180000): sem tabela nova e a função do gatilho é SECURITY DEFINER;
-- nada a desfazer aqui.
-- ============================================================================

begin;

do $$
declare
  p record;
  roles_sql text;
  stmt text;
begin
  if to_regnamespace('rls_backup_20261103') is null then
    raise exception 'Nada para desfazer: o schema rls_backup_20261103 não existe (a migration não foi aplicada)';
  end if;

  -- 1. Políticas novas
  for p in select * from rls_backup_20261103.created_policies loop
    if to_regclass(format('%I.%I', p.schemaname, p.tablename)) is not null then
      execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    end if;
  end loop;

  -- 2. Políticas antigas, como eram
  for p in select * from rls_backup_20261103.policies loop
    select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ')
      into roles_sql
      from unnest(p.roles) as r;
    stmt := format('create policy %I on %I.%I as %s for %s to %s',
      p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, coalesce(roles_sql, 'public'));
    if p.qual is not null then stmt := stmt || format(' using (%s)', p.qual); end if;
    if p.with_check is not null then stmt := stmt || format(' with check (%s)', p.with_check); end if;
    execute stmt;
  end loop;

  -- 3. Estado do RLS
  for p in select * from rls_backup_20261103.rls_state loop
    if not p.rls_enabled then
      execute format('alter table public.%I disable row level security', p.tablename);
    end if;
  end loop;

  -- 4. View motoboy_stats
  for p in select * from rls_backup_20261103.view_grants loop
    execute format('grant %s on public.%I to anon', p.privilege_type, p.viewname);
  end loop;
end $$;

-- 5. Cópia não é mais necessária
drop schema rls_backup_20261103 cascade;

commit;
