-- ============================================================================
-- ERP: Instagram — HISTÓRICO PRÓPRIO de stories e de métricas (a Meta continua SÓ LEITURA)
-- ============================================================================
-- Os insights de STORY somem 24 h depois e a Meta só devolve totais da conta em blocos de 30 dias. A edge function
-- "instagram" (ações collect_stories e collect_daily, chamadas pela rotina do banco — migration
-- 20261116130000_ig_history_cron.sql) guarda aqui o que lê:
--   ig_stories        : um story por linha (id da Meta): tipo, miniatura, link, hora, e a ÚLTIMA leitura dos insights
--                       antes de expirar (views, reach, replies, shares, total_interactions, follows, profile_visits,
--                       navigation e o detalhe: avanços, voltas, saídas, deslizes).
--   ig_daily_account  : um dia por linha (horário de São Paulo): seguidores (foto do fim do dia, quando lida), alcance,
--                       views, contas engajadas, interações, visitas ao perfil, toques no link da bio, ganhos/perdidos.
--   ig_daily_media    : posts/reels dos últimos 30 dias, uma foto por post por dia (views, reach, likes, comments,
--                       saved, shares, total_interactions).
--   ig_collect_log    : cada coleta (ok/erro e os avisos de métricas recusadas).
--   ig_collect_keys   : SÓ DO SERVIDOR (RLS sem política): a chave aleatória que a rotina do banco manda no
--                       cabeçalho x-cron-key.
-- RLS igual às wa_* (se a Fase 2 de segurança 20261103120000 já foi aplicada: só usuários logados). Não apaga nem altera
-- nada que já existe. Pode rodar mais de uma vez sem erro.
-- ============================================================================

create table if not exists ig_stories (
  id text primary key check (id ~ '^[0-9]{5,30}$'),
  media_type text check (media_type is null or char_length(media_type) <= 20),
  thumb text check (thumb is null or char_length(thumb) <= 2000),
  permalink text check (permalink is null or char_length(permalink) <= 500),
  posted_at timestamptz not null,
  expires_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  views int, reach int, replies int, shares int, total_interactions int, follows int, profile_visits int,
  navigation int, taps_forward int, taps_back int, exits int, swipe_forward int
);
create index if not exists ig_stories_posted_idx on ig_stories (posted_at);

create table if not exists ig_daily_account (
  day date primary key,
  followers int,
  reach int, views int, accounts_engaged int, total_interactions int, profile_views int, profile_links_taps int,
  gained int, lost int,
  collected_at timestamptz not null default now()
);

create table if not exists ig_daily_media (
  day date not null,
  media_id text not null check (media_id ~ '^[0-9]{5,30}$'),
  kind text check (kind is null or char_length(kind) <= 20),
  posted_at timestamptz,
  caption text check (caption is null or char_length(caption) <= 300),
  thumb text check (thumb is null or char_length(thumb) <= 2000),
  permalink text check (permalink is null or char_length(permalink) <= 500),
  views int, reach int, likes int, comments int, saved int, shares int, total_interactions int,
  collected_at timestamptz not null default now(),
  primary key (day, media_id)
);
create index if not exists ig_daily_media_media_idx on ig_daily_media (media_id, day);

create table if not exists ig_collect_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('stories', 'diario')),
  ok boolean not null,
  message text check (message is null or char_length(message) <= 500),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array')
);
create index if not exists ig_collect_log_at_idx on ig_collect_log (created_at);

create table if not exists ig_collect_keys (
  k text primary key check (char_length(k) <= 40),
  v text not null check (char_length(v) between 32 and 200)
);
insert into ig_collect_keys (k, v) values ('cron_key', md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text))
  on conflict (k) do nothing;

-- ── RLS ──
alter table ig_collect_keys enable row level security;
drop policy if exists "public access ig_collect_keys" on public.ig_collect_keys;
drop policy if exists "authenticated full access" on public.ig_collect_keys;
revoke all on public.ig_collect_keys from anon, authenticated;

alter table ig_stories enable row level security;
alter table ig_daily_account enable row level security;
alter table ig_daily_media enable row level security;
alter table ig_collect_log enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['ig_stories', 'ig_daily_account', 'ig_daily_media', 'ig_collect_log'] loop
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
