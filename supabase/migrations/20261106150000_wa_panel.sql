-- ============================================================================
-- Extensão 2.10.0 + ERP: PAINEL DE RESULTADOS do WhatsApp
-- ============================================================================
-- wa_leads   : uma linha por conversa (chat_id único) que chegou SEM nenhuma mensagem anterior
--              (lead novo). origin 'anuncio' (mensagem com ctwaContext) ou 'organico'. A aba da
--              extensão que tem a trava grava; ao abrir o WhatsApp, recupera os das últimas 24 h.
--              Gravar de novo a mesma conversa não muda nada.
-- wa_replies : a PRIMEIRA mensagem do cliente depois de cada envio nosso (send_log_id único),
--              com os minutos até responder.
-- wa_send_log:
--   origin      : 'manual' (você digitou no WhatsApp), 'rapida' (mensagem rápida pelo painel),
--                 'agendada', 'automacao' (automações e réguas de follow) ou 'disparo'.
--                 Linhas antigas ficam sem origin (o ERP deduz pela coluna source).
--   follow_step : etapa do follow-up da mensagem rápida enviada (cópia do momento do envio).
--   source passa a aceitar 'manual' e 'rapida'. O limite por hora/dia, o intervalo entre envios
--   e o "pular quem recebeu" da extensão continuam contando só follow/disparo/agendado.
-- wa_items.follow_step : "Esta mensagem é um follow-up" + etapa (1, 2, 3…). Vazio = não é follow-up.
--
-- RLS ligado, com a mesma política das wa_* atuais ("public access ..."). Se a Fase 2 de
-- segurança (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, as tabelas já
-- nascem só para usuários logados e ficam registradas na cópia rls_backup_20261103 (o rollback
-- da Fase 2 também as abre). Sem esta migration a extensão e o ERP funcionam como antes.
-- Pode rodar mais de uma vez sem erro. Depende de 20261103130000 (wa_send_log).
-- ============================================================================

create table if not exists wa_leads (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null unique check (char_length(chat_id) <= 60),
  phone text check (phone is null or char_length(phone) <= 20),
  first_message_at timestamptz not null,
  origin text not null default 'organico' check (origin in ('anuncio', 'organico')),
  ad_id text check (ad_id is null or char_length(ad_id) <= 100),
  ad_title text check (ad_title is null or char_length(ad_title) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists wa_leads_first_message_idx on wa_leads (first_message_at);
create index if not exists wa_leads_phone_idx on wa_leads (phone) where phone is not null;

create table if not exists wa_replies (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null check (char_length(chat_id) <= 60),
  replied_at timestamptz not null,
  send_log_id uuid not null unique references wa_send_log (id) on delete cascade,
  minutes int not null check (minutes >= 0),
  created_at timestamptz not null default now()
);
create index if not exists wa_replies_replied_idx on wa_replies (replied_at);
create index if not exists wa_replies_chat_idx on wa_replies (chat_id, replied_at);

alter table wa_send_log add column if not exists origin text
  check (origin is null or origin in ('manual', 'rapida', 'agendada', 'automacao', 'disparo'));
alter table wa_send_log add column if not exists follow_step int
  check (follow_step is null or follow_step between 1 and 20);
create index if not exists wa_send_log_chat_created_idx on wa_send_log (chat_id, created_at);

alter table wa_items add column if not exists follow_step int
  check (follow_step is null or follow_step between 1 and 20);

do $$
declare
  c record;
begin
  -- source: aceita também 'manual' e 'rapida' (troca a regra criada na 20261103130000)
  for c in
    select conname from pg_constraint
    where conrelid = 'wa_send_log'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source%' and pg_get_constraintdef(oid) ilike '%agendado%'
  loop
    execute format('alter table wa_send_log drop constraint %I', c.conname);
  end loop;
  alter table wa_send_log add constraint wa_send_log_source_check
    check (source in ('follow', 'disparo', 'agendado', 'manual', 'rapida'));
end $$;

alter table wa_leads enable row level security;
alter table wa_replies enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['wa_leads', 'wa_replies'] loop
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
