-- ============================================================================
-- ERP + extensão 2.18.0: Instagram FASE 2 — LINKS RASTREÁVEIS (https://triumph-store.vercel.app/l/<apelido>)
-- ============================================================================
-- ig_links       : os links (apelido, canal, post ligado, mensagem pré-preenchida e código [IG-...]).
-- ig_link_clicks : um clique por linha (link, hora, aparelho e navegador resumidos). O IP NÃO é guardado: só um
--                  hash (HMAC) feito na edge function ig-link, que não dá para reverter.
-- ig_link_leads  : a conversa do WhatsApp que começou com um código [IG-...] (gravada pela extensão 2.18.0 na 1ª
--                  mensagem do lead; só o código, nunca o texto). Fica separada de wa_leads para não mexer na
--                  regra de origem que já existe ('anuncio' / 'organico').
--
-- RLS ligado, com a mesma política das wa_* atuais (se a Fase 2 de segurança 20261103120000 já foi aplicada:
-- só usuários logados, registrado em rls_backup_20261103; senão "public access ..."). O clique público entra pela
-- edge function ig-link (service role), não pela chave anon.
-- Cria os 3 links prontos (bio, manychat-comentarios, stories) só se ainda não existirem.
-- Não apaga nem altera nada que já existe. Pode rodar mais de uma vez sem erro.
-- ============================================================================

create table if not exists ig_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  channel text not null default 'outro' check (channel in ('bio', 'comentarios', 'stories', 'post', 'destaques', 'outro')),
  code text not null unique check (code ~ '^IG-[A-Z0-9][A-Z0-9-]{0,18}[A-Z0-9]$'),
  message text not null default 'Olá! Vim pelo Instagram 😊' check (char_length(message) between 1 and 500),
  media_id text check (media_id is null or media_id ~ '^[0-9]{5,25}$'),
  media_permalink text check (media_permalink is null or char_length(media_permalink) <= 300),
  media_caption text check (media_caption is null or char_length(media_caption) <= 200),
  note text check (note is null or char_length(note) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ig_link_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references ig_links (id) on delete cascade,
  created_at timestamptz not null default now(),
  device text check (device is null or char_length(device) <= 40),
  browser text check (browser is null or char_length(browser) <= 40),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{16,64}$')
);
create index if not exists ig_link_clicks_link_created_idx on ig_link_clicks (link_id, created_at);
create index if not exists ig_link_clicks_created_idx on ig_link_clicks (created_at);

create table if not exists ig_link_leads (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null unique check (char_length(chat_id) <= 60),
  phone text check (phone is null or char_length(phone) <= 20),
  first_message_at timestamptz not null,
  code text not null check (code ~ '^IG-[A-Z0-9][A-Z0-9-]{0,18}[A-Z0-9]$'),
  link_id uuid references ig_links (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ig_link_leads_first_message_idx on ig_link_leads (first_message_at);
create index if not exists ig_link_leads_link_idx on ig_link_leads (link_id);

alter table ig_links enable row level security;
alter table ig_link_clicks enable row level security;
alter table ig_link_leads enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['ig_links', 'ig_link_clicks', 'ig_link_leads'] loop
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

-- os 3 links prontos (não muda nada se já existirem com o mesmo apelido ou código)
insert into ig_links (slug, channel, code, message, note) values
  ('bio', 'bio', 'IG-BIO', 'Olá! Vim pelo Instagram 😊', 'Link da bio do @store_triumph'),
  ('manychat-comentarios', 'comentarios', 'IG-COMENT', 'Olá! Vim pelo Instagram 😊', 'Resposta automática do ManyChat nos comentários'),
  ('stories', 'stories', 'IG-STORIES', 'Olá! Vim pelo Instagram 😊', 'Figurinha de link nos Stories')
on conflict do nothing;

notify pgrst, 'reload schema';
