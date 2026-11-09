-- ============================================================================
-- Extensão 2.12.8 + ERP: atividade de TODAS as conversas individuais do WhatsApp (como o Tintim)
-- ============================================================================
-- wa_chat_activity : uma linha por conversa (chat_id único), gravada pela aba da extensão que tem a
--   trava (no máximo 1 gravação por conversa a cada 30 s) e pela varredura ao abrir o WhatsApp Web
--   (conversas com mensagem nas últimas 72 h, inclusive as que chegaram com o PC desligado).
--     phone, name        : telefone (55…) e nome do contato no WhatsApp, se a extensão souber
--     first_seen_at      : quando a extensão viu a conversa pela 1ª vez
--     first_message_at   : 1ª mensagem da conversa, se a extensão souber (histórico completo carregado)
--     last_message_at    : última mensagem (nossa ou do cliente); last_from: 'cliente' | 'loja'
--     last_customer_at   : última mensagem do cliente
--     is_new_lead        : true = a conversa começou com o cliente falando com a loja pela 1ª vez
--                          (first_message_at = esse 1º contato); false = começou pela loja; null = não sabe
-- wa_chat_activity_days : por conversa e dia (horário de São Paulo), se o cliente e/ou a loja mandaram
--   mensagem. É daqui que o ERP conta as "Conversas ativas" de qualquer período (inclusive o anterior).
-- Nunca guarda o texto das mensagens.
--
-- As gravações são "upsert" (on_conflict) e os gatilhos abaixo fazem a linha só avançar: a última
-- mensagem nunca volta para trás, a 1ª nunca fica mais nova, o que já se sabe não vira null, e
-- from_customer/from_store do dia nunca voltam para false.
--
-- RLS ligado, com a mesma política das wa_* ("public access ..."). Se a Fase 2 de segurança
-- (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, as tabelas nascem só para usuários
-- logados e ficam registradas na cópia rls_backup_20261103 (o rollback da Fase 2 também as abre).
-- Sem esta migration a extensão e o ERP funcionam como antes (só os leads novos de wa_leads).
-- Pode rodar mais de uma vez sem erro.
--
-- Desfazer (rollback desta migration):
--   drop table if exists wa_chat_activity_days; drop table if exists wa_chat_activity;
--   drop function if exists public.wa_chat_activity_merge(); drop function if exists public.wa_chat_activity_days_merge();
--   delete from rls_backup_20261103.policies where tablename in ('wa_chat_activity', 'wa_chat_activity_days');   -- (só se a Fase 2 existir)
--   delete from rls_backup_20261103.created_policies where tablename in ('wa_chat_activity', 'wa_chat_activity_days');
--   delete from rls_backup_20261103.rls_state where tablename in ('wa_chat_activity', 'wa_chat_activity_days');
-- ============================================================================

create table if not exists wa_chat_activity (
  chat_id text primary key check (char_length(chat_id) <= 60),
  phone text check (phone is null or char_length(phone) <= 20),
  name text check (name is null or char_length(name) <= 100),
  first_seen_at timestamptz not null default now(),
  first_message_at timestamptz,
  last_message_at timestamptz,
  last_from text check (last_from is null or last_from in ('cliente', 'loja')),
  last_customer_at timestamptz,
  is_new_lead boolean,
  updated_at timestamptz not null default now()
);
create index if not exists wa_chat_activity_last_idx on wa_chat_activity (last_message_at desc);
create index if not exists wa_chat_activity_lead_idx on wa_chat_activity (first_message_at) where is_new_lead;
create index if not exists wa_chat_activity_phone_idx on wa_chat_activity (phone) where phone is not null;

create table if not exists wa_chat_activity_days (
  chat_id text not null check (char_length(chat_id) <= 60),
  day date not null,
  from_customer boolean not null default false,
  from_store boolean not null default false,
  primary key (chat_id, day)
);
create index if not exists wa_chat_activity_days_day_idx on wa_chat_activity_days (day) where from_customer;

-- só avança (upsert de dados mais antigos ou incompletos não apaga o que já se sabe)
create or replace function public.wa_chat_activity_merge()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.phone := coalesce(new.phone, old.phone);
  new.name := coalesce(new.name, old.name);
  new.first_seen_at := least(old.first_seen_at, new.first_seen_at);
  new.first_message_at := least(old.first_message_at, new.first_message_at);
  new.is_new_lead := coalesce(old.is_new_lead, new.is_new_lead);
  if new.last_message_at is null or (old.last_message_at is not null and new.last_message_at < old.last_message_at) then
    new.last_message_at := old.last_message_at;
    new.last_from := old.last_from;
  elsif new.last_from is null then
    new.last_from := old.last_from;
  end if;
  new.last_customer_at := greatest(old.last_customer_at, new.last_customer_at);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.wa_chat_activity_days_merge()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.from_customer := old.from_customer or new.from_customer;
  new.from_store := old.from_store or new.from_store;
  return new;
end;
$$;

drop trigger if exists wa_chat_activity_merge on wa_chat_activity;
create trigger wa_chat_activity_merge before update on wa_chat_activity
  for each row execute function public.wa_chat_activity_merge();
drop trigger if exists wa_chat_activity_days_merge on wa_chat_activity_days;
create trigger wa_chat_activity_days_merge before update on wa_chat_activity_days
  for each row execute function public.wa_chat_activity_days_merge();

alter table wa_chat_activity enable row level security;
alter table wa_chat_activity_days enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['wa_chat_activity', 'wa_chat_activity_days'] loop
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
  end loop;
end $$;

notify pgrst, 'reload schema';
