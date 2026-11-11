-- ============================================================================
-- Extensão 2.18.1: NOME DA AGENDA do WhatsApp por conversa (wa_contact_names)
-- ============================================================================
-- A extensão grava o nome salvo na agenda (e o do perfil) de cada conversa que conhece, SÓ com o que o WhatsApp
-- Web já tem na memória (sem consultar o servidor do WhatsApp): ao abrir a conversa, quando a lista carrega e
-- numa varredura leve a cada 30 min (só o que mudou). Uma linha por conversa (chat_id do WhatsApp).
--   phone        : telefone da pessoa (só dígitos), quando conhecido (do @c.us ou do @lid pelo cache do WhatsApp)
--   agenda_name  : nome salvo na agenda do celular
--   profile_name : nome do perfil do WhatsApp (o "~Nome")
-- O ERP (Automações, Rastreamento e demais telas do WhatsApp) mostra: agenda → CRM → perfil (~) → número.
-- Sem esta tabela a extensão e o ERP funcionam como antes.
--
-- RLS ligado, com a mesma política das wa_* (com ou sem a Fase 2 de segurança; registrada na cópia
-- rls_backup_20261103 quando ela existe). Pode rodar mais de uma vez sem erro.
-- ============================================================================

create table if not exists wa_contact_names (
  chat_id text primary key check (chat_id ~ '^[0-9]+@(c\.us|lid)$'),
  phone text check (phone is null or phone ~ '^[0-9]{8,15}$'),
  agenda_name text check (agenda_name is null or char_length(agenda_name) between 1 and 100),
  profile_name text check (profile_name is null or char_length(profile_name) between 1 and 100),
  updated_at timestamptz not null default now()
);
create index if not exists wa_contact_names_phone_idx on wa_contact_names (phone);

alter table wa_contact_names enable row level security;

do $$
declare
  t text := 'wa_contact_names';
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
