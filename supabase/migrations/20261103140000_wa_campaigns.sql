-- ============================================================================
-- Extensão 2.0.0-D2: disparos em massa (campanhas)
-- ============================================================================
-- wa_campaigns        : o disparo (etiqueta CRM, mensagem salva, início, regras de pulo).
--                       Só sai algo depois que o usuário confirma "Iniciar disparo".
-- wa_campaign_targets : a "foto" da etiqueta no momento do início (um alvo por contato),
--                       com o status de cada envio. Guarda só nome e id da conversa.
--
-- Depende da migration 20261103130000_wa_flows.sql (motor, wa_send_log, chat_id).
-- RLS ligado, com a mesma política das wa_* atuais ("public access ..."). Se a Fase 2 de
-- segurança (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, as tabelas
-- já nascem só para usuários logados e ficam registradas na cópia rls_backup_20261103
-- (o rollback da Fase 2 também as abre). Pode rodar mais de uma vez sem erro.
-- ============================================================================

create table if not exists wa_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 60),
  label_id uuid references wa_labels on delete set null,
  item_id uuid references wa_items on delete set null,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'agendada', 'rodando', 'pausada', 'concluida', 'cancelada')),
  start_at timestamptz,
  allow_new_chats bool not null default false,
  skip_recent_days int not null default 7 check (skip_recent_days between 0 and 90),
  created_at timestamptz not null default now()
);

create table if not exists wa_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references wa_campaigns on delete cascade,
  contact_id uuid references wa_contacts on delete set null,
  chat_id text,
  name text check (name is null or char_length(name) <= 100),
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'pulado')),
  reason text,
  sent_at timestamptz
);
create index if not exists wa_campaign_targets_campaign_status_idx on wa_campaign_targets (campaign_id, status);

alter table wa_campaigns enable row level security;
alter table wa_campaign_targets enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['wa_campaigns', 'wa_campaign_targets'] loop
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
