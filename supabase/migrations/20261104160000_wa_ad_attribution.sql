-- ============================================================================
-- Extensão 2.6.2: anúncio de onde cada lead veio (wa_ad_attribution)
-- ============================================================================
-- Uma linha por conversa (chat_id único). A aba que executa os envios grava quando chega
-- mensagem de cliente com ctwaContext (lead de anúncio) e, ao abrir o WhatsApp, varre as
-- conversas já carregadas. O 📈 procura aqui primeiro (a mensagem do anúncio pode não estar
-- mais carregada numa conversa longa). Gravar de novo a mesma conversa não sobrescreve nada
-- (só completa o ctwa_clid se ele estava vazio).
--
-- RLS ligado, com a mesma política das wa_* atuais ("public access ..."). Se a Fase 2 de
-- segurança (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, a tabela já
-- nasce só para usuários logados e fica registrada na cópia rls_backup_20261103.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

create table if not exists wa_ad_attribution (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null unique check (char_length(chat_id) <= 60),
  phone text check (phone is null or char_length(phone) <= 20),
  contact_name text check (contact_name is null or char_length(contact_name) <= 100),
  ad_id text check (ad_id is null or char_length(ad_id) <= 100),
  ad_title text check (ad_title is null or char_length(ad_title) <= 200),
  source_app text check (source_app is null or char_length(source_app) <= 40),
  source_url text check (source_url is null or char_length(source_url) <= 500),
  conversion_source text check (conversion_source is null or char_length(conversion_source) <= 40),
  ctwa_clid text check (ctwa_clid is null or char_length(ctwa_clid) <= 500),
  first_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table wa_ad_attribution enable row level security;

do $$
declare
  t text := 'wa_ad_attribution';
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
