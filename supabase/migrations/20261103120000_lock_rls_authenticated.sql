-- ============================================================================
-- SEGURANÇA — FASE 2: banco só para usuários logados (authenticated)
-- ============================================================================
-- NÃO RODE ANTES DA FASE 1 ESTAR NO AR (login no ERP e extensão v1.9.1 com a
-- conta conectada em todos os PCs). Depois disto, quem usa só a chave anon
-- (sem login) deixa de ler e gravar nessas tabelas.
--
-- O que faz:
--   1. Guarda uma cópia das políticas atuais (e do estado do RLS) no schema
--      rls_backup_20261103, que a API do Supabase não expõe. O arquivo
--      supabase/rollback_20261103120000.sql usa essa cópia para desfazer tudo.
--   2. Em cada tabela usada pelo ERP e pela extensão: liga o RLS, apaga TODAS
--      as políticas que existirem (as "public access", "Allow public ...",
--      "Anyone can ..." etc.) e cria uma só: "authenticated full access"
--      (FOR ALL TO authenticated USING (true) WITH CHECK (true)).
--      Tabelas criadas pelo painel (sem migration aqui: cities, neighborhoods,
--      motoboy_payments, operational_costs, operational_cost_payments,
--      small_sales, stock_orders) entram do mesmo jeito; a cópia guarda as
--      políticas que elas tiverem hoje, sejam quais forem.
--   3. View motoboy_stats: views leem as tabelas com o dono da view (passando
--      por cima do RLS), então tira o acesso do papel anon a ela.
--   4. Bucket wa-media (storage.objects): a leitura continua pública (o bucket
--      é público); inserir/alterar/apagar arquivos só para authenticated.
--
-- Telas públicas: o inventário da Fase 1 não achou nenhuma (o ERP não tem
-- rota/página sem login, não há link para motoboy nem webhook que leia o banco
-- com a chave anon). Por isso nenhuma tabela da lista ficou de fora.
-- Edge Functions que acessam o banco usam a service_role (passa por cima do
-- RLS) e não são afetadas.
-- Atenção: scripts/migrate-product.mjs e scripts/update-stock.mjs usam a chave
-- anon e deixam de funcionar depois desta migration (precisam de login ou da
-- service_role rodando só no seu PC).
-- Tabela que não existir no banco é pulada (aviso NOTICE), sem erro.
-- Extensão 2.0.0: wa_settings, wa_flows, wa_flow_variants, wa_send_log, wa_campaigns e
-- wa_campaign_targets (e, na 2.1.0, wa_automations e wa_automation_runs) também entram. Se as
-- migrations 20261103130000/20261103140000/20261103150000 forem
-- aplicadas DEPOIS desta, elas mesmas criam essas tabelas só para authenticated e se registram
-- na cópia rls_backup_20261103 (o rollback abre todas do mesmo jeito).
-- ============================================================================

begin;

-- Falha se a migration já tiver sido aplicada (o schema de cópia já existe)
create schema rls_backup_20261103;
revoke all on schema rls_backup_20261103 from public;

create table rls_backup_20261103.policies (
  schemaname text not null,
  tablename  text not null,
  policyname text not null,
  permissive text not null,
  roles      text[] not null,
  cmd        text not null,
  qual       text,
  with_check text
);

create table rls_backup_20261103.rls_state (
  tablename      text primary key,
  rls_enabled    boolean not null
);

create table rls_backup_20261103.view_grants (
  viewname       text not null,
  privilege_type text not null
);

create table rls_backup_20261103.created_policies (
  schemaname text not null,
  tablename  text not null,
  policyname text not null
);

do $$
declare
  t text;
  p record;
  tables text[] := array[
    -- ERP (src/)
    'accessories', 'ad_spend', 'cities', 'motoboy_payments', 'motoboys',
    'neighborhoods', 'operational_cost_payments', 'operational_costs',
    'operational_costs_avulsos', 'products', 'sale_accessories', 'sale_items',
    'sales', 'small_sales', 'stock_movements', 'stock_orders',
    'supplier_orders', 'suppliers', 'system_config',
    -- ERP (aba WhatsApp) e extensão
    'wa_categories', 'wa_items', 'wa_labels',
    -- só a extensão
    'wa_item_parts', 'wa_contacts', 'wa_contact_labels', 'wa_schedules',
    -- extensão 2.0.0 (motor, follows e disparos: migrations 20261103130000 e 20261103140000)
    'wa_settings', 'wa_flows', 'wa_flow_variants', 'wa_send_log',
    'wa_campaigns', 'wa_campaign_targets',
    -- extensão 2.1.0 (automações: migration 20261103150000)
    'wa_automations', 'wa_automation_runs'
  ];
begin
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'Tabela public.% não existe: pulada', t;
      continue;
    end if;

    insert into rls_backup_20261103.rls_state (tablename, rls_enabled)
    select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t;

    for p in
      select * from pg_policies where schemaname = 'public' and tablename = t
    loop
      insert into rls_backup_20261103.policies
      values (p.schemaname, p.tablename, p.policyname, p.permissive, p.roles::text[], p.cmd, p.qual, p.with_check);
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
    insert into rls_backup_20261103.created_policies values ('public', t, 'authenticated full access');
  end loop;

  -- View motoboy_stats: guarda e tira os privilégios do anon
  if to_regclass('public.motoboy_stats') is not null then
    insert into rls_backup_20261103.view_grants (viewname, privilege_type)
    select table_name, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'motoboy_stats' and grantee = 'anon';
    revoke all on public.motoboy_stats from anon;
  else
    raise notice 'View public.motoboy_stats não existe: pulada';
  end if;

  -- Storage: políticas do bucket wa-media que não são só leitura
  for p in
    select * from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd <> 'SELECT'
      and (coalesce(qual, '') like '%wa-media%' or coalesce(with_check, '') like '%wa-media%')
  loop
    insert into rls_backup_20261103.policies
    values (p.schemaname, p.tablename, p.policyname, p.permissive, p.roles::text[], p.cmd, p.qual, p.with_check);
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;

  -- Leitura pública continua (só se o bucket for público e ainda não houver uma)
  if exists (select 1 from storage.buckets where id = 'wa-media' and public)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
         and coalesce(qual, '') like '%wa-media%') then
    create policy "public read wa-media" on storage.objects for select using (bucket_id = 'wa-media');
    insert into rls_backup_20261103.created_policies values ('storage', 'objects', 'public read wa-media');
  end if;

  create policy "authenticated insert wa-media" on storage.objects
    for insert to authenticated with check (bucket_id = 'wa-media');
  create policy "authenticated update wa-media" on storage.objects
    for update to authenticated using (bucket_id = 'wa-media') with check (bucket_id = 'wa-media');
  create policy "authenticated delete wa-media" on storage.objects
    for delete to authenticated using (bucket_id = 'wa-media');
  insert into rls_backup_20261103.created_policies values
    ('storage', 'objects', 'authenticated insert wa-media'),
    ('storage', 'objects', 'authenticated update wa-media'),
    ('storage', 'objects', 'authenticated delete wa-media');
end $$;

commit;
