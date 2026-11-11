-- ============================================================================
-- ERP: Instagram FASE 3 — AUTOMAÇÕES (substituto do ManyChat) e DIRECT simples. TUDO NASCE DESLIGADO.
-- ============================================================================
-- Só do servidor (RLS ligado SEM política: o navegador não lê nem grava; só as edge functions com a service role):
--   ig_account       : a conta conectada (Instagram API com Login do Instagram) e o TOKEN de longa duração.
--   ig_oauth_states  : o "state" do botão Conectar (vale 15 min, usado uma vez).
--   ig_server_kv     : chaves internas (ex.: a chave da rotina diária de renovação do token).
--   ig_dm_quota      : antispam — a última DM automática de cada pessoa (somando TODAS as automações).
-- Do ERP (RLS igual às wa_*):
--   ig_conversations    : uma por pessoa (IGSID): @/nome/foto, origem (comentário/story/DM), última mensagem,
--                         janela de 24 h (last_customer_at) e o último link do WhatsApp mandado (wa_sent_at/wa_code).
--   ig_messages         : mensagens do Direct, id único (mid) = nunca duplica. from_me = enviadas por nós (eco).
--   ig_comments         : comentários (posts, reels e lives), id único.
--   ig_automations      : as automações ("Quando…", palavras, respostas públicas, DM com botão para o WhatsApp).
--   ig_automation_runs  : cada disparo (1 por comentário/mensagem: source_id único).
--   ig_webhook_log      : erros e avisos do webhook (para conferir na tela).
-- Funções (só a service role executa): ig_claim_dm (trava ATÔMICA do antispam) e ig_release_dm.
-- system_config: ig_automations_enabled=false (chave geral), ig_test_mode=true, ig_test_accounts=[],
--   ig_dm_cooldown_hours=24, ig_direct_dm / ig_direct_phrase (botão "Mandar o WhatsApp" do Direct).
-- Cria DESLIGADA a automação "Comentários → WhatsApp (cópia do ManyChat)".
-- Não apaga nem altera nada que já existe. Pode rodar mais de uma vez sem erro.
-- ============================================================================

-- ── só do servidor ──
create table if not exists ig_account (
  id smallint primary key default 1 check (id = 1),
  ig_user_id text not null check (ig_user_id ~ '^[0-9]{5,30}$'),
  username text check (username is null or char_length(username) <= 60),
  name text check (name is null or char_length(name) <= 120),
  picture_url text check (picture_url is null or char_length(picture_url) <= 1000),
  access_token text not null check (char_length(access_token) between 10 and 1000),
  token_expires_at timestamptz,
  refreshed_at timestamptz,
  refresh_tried_at timestamptz,
  refresh_error text check (refresh_error is null or char_length(refresh_error) <= 500),
  scopes text check (scopes is null or char_length(scopes) <= 500),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ig_oauth_states (
  state text primary key check (state ~ '^[0-9a-f]{32,64}$'),
  created_at timestamptz not null default now()
);
create table if not exists ig_server_kv (
  k text primary key check (char_length(k) <= 60),
  v text not null check (char_length(v) <= 500),
  updated_at timestamptz not null default now()
);
create table if not exists ig_dm_quota (
  igsid text primary key check (igsid ~ '^[0-9]{5,30}$'),
  last_auto_dm_at timestamptz not null
);

-- ── do ERP ──
create table if not exists ig_conversations (
  igsid text primary key check (igsid ~ '^[0-9]{5,30}$'),
  username text check (username is null or char_length(username) <= 60),
  name text check (name is null or char_length(name) <= 120),
  profile_pic text check (profile_pic is null or char_length(profile_pic) <= 1000),
  profile_at timestamptz,
  origin text not null default 'dm' check (origin in ('comentario', 'story', 'dm')),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  last_text text check (last_text is null or char_length(last_text) <= 300),
  last_from text check (last_from is null or last_from in ('cliente', 'loja')),
  last_customer_at timestamptz,
  wa_sent_at timestamptz,
  wa_code text check (wa_code is null or wa_code ~ '^IG-[A-Z0-9][A-Z0-9-]{0,18}[A-Z0-9]$'),
  created_at timestamptz not null default now()
);
create index if not exists ig_conversations_last_idx on ig_conversations (last_at desc);
create index if not exists ig_conversations_wa_idx on ig_conversations (wa_code, wa_sent_at);

create table if not exists ig_messages (
  mid text primary key check (char_length(mid) between 1 and 300),
  igsid text not null check (igsid ~ '^[0-9]{5,30}$'),
  from_me boolean not null default false,
  kind text not null default 'dm' check (kind in ('dm', 'story_reply', 'story_mention', 'postback')),
  text text check (text is null or char_length(text) <= 2000),
  attachment_type text check (attachment_type is null or char_length(attachment_type) <= 40),
  app_id text check (app_id is null or char_length(app_id) <= 40),
  automation_id uuid,
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists ig_messages_igsid_idx on ig_messages (igsid, sent_at);
create index if not exists ig_messages_sent_idx on ig_messages (sent_at);

create table if not exists ig_comments (
  comment_id text primary key check (char_length(comment_id) between 1 and 60),
  media_id text check (media_id is null or char_length(media_id) <= 60),
  igsid text check (igsid is null or igsid ~ '^[0-9]{5,30}$'),
  username text check (username is null or char_length(username) <= 60),
  text text check (text is null or char_length(text) <= 2200),
  parent_id text check (parent_id is null or char_length(parent_id) <= 60),
  is_live boolean not null default false,
  from_me boolean not null default false,
  commented_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists ig_comments_at_idx on ig_comments (commented_at);

create table if not exists ig_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  active boolean not null default false,
  trigger text not null default 'comentario' check (trigger in ('comentario', 'dm_nova', 'story', 'dm_palavra')),
  media_scope text not null default 'todos' check (media_scope in ('todos', 'escolhidos')),
  media_ids text[] not null default '{}' check (cardinality(media_ids) <= 100),
  keyword_mode text not null default 'qualquer' check (keyword_mode in ('qualquer', 'palavras')),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 50),
  public_replies text[] not null default '{}' check (cardinality(public_replies) <= 20),
  dm_texts text[] not null default '{}' check (cardinality(dm_texts) <= 10),
  button_title text not null default 'WhatsApp Loja' check (char_length(button_title) between 1 and 20),
  link_mode text not null default 'frase' check (link_mode in ('frase', 'link')),
  wa_phrase text check (wa_phrase is null or char_length(wa_phrase) <= 300),
  link_id uuid references ig_links (id) on delete set null,
  code text not null unique check (code ~ '^IG-[A-Z0-9][A-Z0-9-]{0,18}[A-Z0-9]$'),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ig_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references ig_automations (id) on delete cascade,
  source_id text not null unique check (char_length(source_id) between 1 and 300),
  source_kind text not null check (source_kind in ('comentario', 'dm', 'story')),
  igsid text check (igsid is null or igsid ~ '^[0-9]{5,30}$'),
  status text not null default 'processando' check (status in ('processando', 'enviado', 'parcial', 'pulado', 'falhou')),
  reason text check (reason is null or char_length(reason) <= 300),
  public_reply boolean not null default false,
  dm_sent boolean not null default false,
  dm_fallback boolean not null default false,
  test boolean not null default false,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ig_automation_runs_auto_idx on ig_automation_runs (automation_id, created_at);

create table if not exists ig_webhook_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level text not null default 'erro' check (level in ('erro', 'aviso', 'info')),
  message text not null check (char_length(message) <= 1000)
);
create index if not exists ig_webhook_log_at_idx on ig_webhook_log (created_at);

-- ── RLS ──
alter table ig_account enable row level security;
alter table ig_oauth_states enable row level security;
alter table ig_server_kv enable row level security;
alter table ig_dm_quota enable row level security;
-- só do servidor: nenhuma política (o navegador, com anon ou logado, não lê nem grava)
do $$
declare t text;
begin
  foreach t in array array['ig_account', 'ig_oauth_states', 'ig_server_kv', 'ig_dm_quota'] loop
    execute format('drop policy if exists %I on public.%I', 'public access ' || t, t);
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

alter table ig_conversations enable row level security;
alter table ig_messages enable row level security;
alter table ig_comments enable row level security;
alter table ig_automations enable row level security;
alter table ig_automation_runs enable row level security;
alter table ig_webhook_log enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['ig_conversations', 'ig_messages', 'ig_comments', 'ig_automations', 'ig_automation_runs', 'ig_webhook_log'] loop
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

-- ── antispam ATÔMICO: no máximo 1 DM automática por pessoa a cada p_hours (todas as automações somadas) ──
-- Devolve a hora da trava (quem passou) ou null (já recebeu dentro do prazo). Dois eventos ao mesmo tempo: o
-- "insert ... on conflict do update ... where" trava a linha; o segundo vê a linha nova e não passa.
create or replace function ig_claim_dm(p_igsid text, p_hours int)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  insert into ig_dm_quota (igsid, last_auto_dm_at) values (p_igsid, now())
  on conflict (igsid) do update set last_auto_dm_at = excluded.last_auto_dm_at
    where ig_dm_quota.last_auto_dm_at <= now() - make_interval(hours => greatest(p_hours, 1))
  returning last_auto_dm_at;
$$;
-- o envio falhou: devolve a vez (só se a trava ainda é a mesma)
create or replace function ig_release_dm(p_igsid text, p_at timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  delete from ig_dm_quota where igsid = p_igsid and last_auto_dm_at = p_at;
$$;
revoke all on function ig_claim_dm(text, int) from public, anon, authenticated;
revoke all on function ig_release_dm(text, timestamptz) from public, anon, authenticated;
grant execute on function ig_claim_dm(text, int) to service_role;
grant execute on function ig_release_dm(text, timestamptz) to service_role;

-- ── chave geral e configurações (TUDO DESLIGADO; não troca o que já existe) ──
insert into system_config (key, value) values
  ('ig_automations_enabled', 'false'),
  ('ig_test_mode', 'true'),
  ('ig_test_accounts', '[]'),
  ('ig_dm_cooldown_hours', '24'),
  ('ig_direct_dm', 'Olá, {nome}! Vou te deixar aqui abaixo o nosso WhatsApp: por lá o atendimento é totalmente humanizado e personalizado, e vamos te ajudar a escolher o seu novo smartwatch!'),
  ('ig_direct_phrase', 'Olá! Vim pelo Direct do Instagram e quero atendimento 😊')
on conflict (key) do nothing;

-- ── a automação pronta, DESLIGADA: cópia do ManyChat ──
insert into ig_automations (name, active, trigger, media_scope, keyword_mode, public_replies, dm_texts, button_title, link_mode, wa_phrase, code, position)
values (
  'Comentários → WhatsApp (cópia do ManyChat)', false, 'comentario', 'todos', 'qualquer',
  array['Te enviei todos os detalhes no direct 🔥', 'Dá uma olhada no seu direct 👀', 'Oiii, iniciamos seu atendimento pelo direct'],
  array['Olá, é um prazer ter você aqui no nosso perfil! Vi que comentou na nossa publicação e a boa notícia é que estamos com uma promoção top rolando nesse momento 🔥 Vou te deixar aqui abaixo o nosso WhatsApp, por lá temos o atendimento totalmente humanizado e personalizado, onde vamos te ajudar a escolher o seu novo smartwatch!'],
  'WhatsApp Loja', 'frase', 'Olá! Vi o comentário no Instagram e quero saber da promoção 🔥', 'IG-A-COMENT', 0
)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
