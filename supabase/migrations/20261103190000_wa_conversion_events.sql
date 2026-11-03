-- ============================================================================
-- Extensão 2.4.0: eventos de compra enviados ao Facebook (API de Conversões)
-- ============================================================================
-- wa_conversion_events: um registro por evento "Purchase" enviado pela Edge Function
-- meta-purchase-event (que grava com a service role). event_id é único: o mesmo evento nunca
-- é mandado duas vezes. Não guarda telefone nem token; o telefone vai ao Facebook só em hash.
--
-- RLS ligado, com a mesma política das wa_* atuais ("public access ..."). Se a Fase 2 de
-- segurança (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, a tabela já
-- nasce só para usuários logados e fica registrada na cópia rls_backup_20261103.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

create table if not exists wa_conversion_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  chat_id text,
  contact_name text check (contact_name is null or char_length(contact_name) <= 100),
  value numeric(12,2),
  currency text not null default 'BRL',
  ad_id text,
  ad_title text check (ad_title is null or char_length(ad_title) <= 200),
  method text check (method in ('business_messaging', 'chat')),
  test bool not null default false,
  status text not null check (status in ('enviado', 'falhou')),
  events_received int,
  error text check (error is null or char_length(error) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists wa_conversion_events_chat_idx on wa_conversion_events (chat_id, created_at);

alter table wa_conversion_events enable row level security;

do $$
declare
  t text := 'wa_conversion_events';
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  execute format('drop policy if exists %I on public.%I', 'public access ' || t, t);
  execute format('drop policy if exists "authenticated full access" on public.%I', t);
  if locked then
    -- Fase 2 já aplicada: só usuários logados
    execute format('create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
    delete from rls_backup_20261103.policies where schemaname = 'public' and tablename = t;
    delete from rls_backup_20261103.created_policies where schemaname = 'public' and tablename = t;
    insert into rls_backup_20261103.policies (schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check)
      values ('public', t, 'public access ' || t, 'PERMISSIVE', array['public'], 'ALL', 'true', 'true');
    insert into rls_backup_20261103.created_policies values ('public', t, 'authenticated full access');
    insert into rls_backup_20261103.rls_state (tablename, rls_enabled) values (t, true) on conflict (tablename) do nothing;
  else
    execute format('create policy %I on public.%I for all using (true) with check (true)', 'public access ' || t, t);
  end if;
end $$;

notify pgrst, 'reload schema';
