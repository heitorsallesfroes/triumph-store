-- ============================================================================
-- Extensão 2.0.0-D1: motor de envios automáticos + follows (réguas)
-- ============================================================================
-- wa_settings      : linha única (id = 1) com "Pausar tudo", limites globais por hora/dia,
--                    intervalo aleatório entre contatos, horário comercial e a "trava"
--                    (runner_id + lease_until) que garante uma aba/computador executando por vez.
-- wa_contacts      : + chat_id (id da conversa no WhatsApp, gravado quando a extensão sabe).
-- wa_flows         : réguas (quem entra = etiqueta CRM, espera, mensagem, para onde vai depois).
-- wa_flow_variants : mensagens alternativas por etiqueta CRM ou palavra do anúncio.
-- wa_send_log      : todo envio automático (follow, disparo, agendado): conta os limites e
--                    mostra o histórico. Nunca guarda texto de mensagem.
--
-- RLS ligado, com a mesma política das wa_* atuais ("public access ..."). Se a Fase 2 de
-- segurança (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, as tabelas
-- novas já nascem só para usuários logados ("authenticated full access") e ficam registradas
-- na cópia rls_backup_20261103, para o rollback da Fase 2 também abri-las.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

create table if not exists wa_settings (
  id int primary key default 1 check (id = 1),
  paused_all bool not null default false,
  max_per_hour int not null default 30 check (max_per_hour between 1 and 200),
  max_per_day int not null default 150 check (max_per_day between 1 and 2000),
  min_interval_s int not null default 45 check (min_interval_s between 10 and 3600),
  max_interval_s int not null default 120 check (max_interval_s between 10 and 3600),
  business_start time not null default '09:00',
  business_end time not null default '19:00',
  business_days int[] not null default '{1,2,3,4,5,6}',
  runner_id text,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into wa_settings (id) values (1) on conflict (id) do nothing;

alter table wa_contacts add column if not exists chat_id text;
create index if not exists wa_contacts_chat_id_idx on wa_contacts (chat_id);

create table if not exists wa_flows (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 60),
  active bool not null default false,
  label_id uuid not null references wa_labels on delete cascade,
  wait_minutes int not null check (wait_minutes between 1 and 43200),
  item_id uuid references wa_items on delete set null,
  next_label_id uuid references wa_labels on delete set null,
  reply_label_id uuid references wa_labels on delete set null,
  ignore_older_days int not null default 15 check (ignore_older_days between 1 and 365),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists wa_flow_variants (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references wa_flows on delete cascade,
  position int not null default 0,
  condition text not null check (condition in ('etiqueta', 'anuncio')),
  label_id uuid references wa_labels on delete cascade,
  ad_keyword text check (ad_keyword is null or char_length(ad_keyword) <= 60),
  item_id uuid not null references wa_items on delete cascade
);
create index if not exists wa_flow_variants_flow_idx on wa_flow_variants (flow_id, position);

create table if not exists wa_send_log (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('follow', 'disparo', 'agendado')),
  source_id uuid,
  contact_id uuid,
  chat_id text,
  item_id uuid,
  status text not null check (status in ('enviando', 'enviado', 'falhou', 'pulado')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists wa_send_log_created_idx on wa_send_log (created_at);

alter table wa_settings enable row level security;
alter table wa_flows enable row level security;
alter table wa_flow_variants enable row level security;
alter table wa_send_log enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['wa_settings', 'wa_flows', 'wa_flow_variants', 'wa_send_log'] loop
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
