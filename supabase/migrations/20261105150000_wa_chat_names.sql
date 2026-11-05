-- ============================================================================
-- Extensão 2.8.3: "Nome para mensagens" por conversa (wa_chat_names)
-- ============================================================================
-- O {nome} das mensagens usa só: nome definido à mão → nome aprendido da SUA mensagem ("Olá, Fernanda!!")
-- → vazio. Uma linha por conversa (chat_id do WhatsApp). source: 'manual' (definido por você; nunca é
-- trocado pelo aprendido) ou 'aprendido'. Sem esta tabela a extensão funciona como antes.
--
-- RLS ligado, com a mesma política das wa_* atuais ("public access ..."). Se a Fase 2 de segurança
-- (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, a tabela já nasce só para usuários
-- logados e fica registrada na cópia rls_backup_20261103. Pode rodar mais de uma vez sem erro.
-- Os textos da {saudacao} ficam em system_config (chave wa_greetings), sem mudança de banco.
-- ============================================================================

create table if not exists wa_chat_names (
  chat_id text primary key check (chat_id ~ '^[0-9]+@(c\.us|lid)$'),
  name text not null check (char_length(name) between 1 and 40),
  source text not null check (source in ('manual', 'aprendido')),
  updated_at timestamptz not null default now()
);

alter table wa_chat_names enable row level security;

do $$
declare
  t text := 'wa_chat_names';
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
