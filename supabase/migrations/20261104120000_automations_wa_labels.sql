-- ============================================================================
-- Extensão 2.5.0: automação com etiqueta do WhatsApp ou do CRM + "Adicionar à automação"
-- ============================================================================
-- wa_automations            : + trigger_label_source ('crm' | 'whatsapp', padrão 'crm') e
--                             trigger_wa_label_id (id da etiqueta nativa do WhatsApp Business).
--                             As automações que já existem continuam com 'crm' (nada muda nelas).
-- wa_native_label_seen      : "primeira vez que a extensão viu" cada conversa em cada etiqueta nativa
--                             usada por automações ativas (o WhatsApp não guarda quando a etiqueta foi
--                             colocada). Saiu da etiqueta: removed_at. Colocada de novo depois: a mesma
--                             linha recomeça (first_seen_at novo) e conta como nova entrada.
-- wa_automation_enrollments : "Adicionar à automação" (botão 🔁): o contato entra a partir de enrolled_at.
--                             "Tirar desta automação": removed_at. Só uma inscrição ativa por automação +
--                             contato (índice único parcial). Apagar a automação ou o contato apaga junto.
--
-- Depende da migration 20261103150000 (wa_automations / wa_automation_runs).
-- RLS ligado, com a mesma política das wa_* atuais ("public access ..."). Se a Fase 2 de
-- segurança (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, as tabelas
-- novas já nascem só para usuários logados e ficam registradas na cópia rls_backup_20261103.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

alter table wa_automations add column if not exists trigger_label_source text not null default 'crm'
  check (trigger_label_source in ('crm', 'whatsapp'));
alter table wa_automations add column if not exists trigger_wa_label_id text
  check (trigger_wa_label_id is null or char_length(trigger_wa_label_id) between 1 and 40);

create table if not exists wa_native_label_seen (
  chat_id text not null check (char_length(chat_id) <= 60),
  wa_label_id text not null check (char_length(wa_label_id) between 1 and 40),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  removed_at timestamptz,
  primary key (chat_id, wa_label_id)
);
create index if not exists wa_native_label_seen_label_idx on wa_native_label_seen (wa_label_id);

create table if not exists wa_automation_enrollments (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references wa_automations on delete cascade,
  contact_id uuid not null references wa_contacts on delete cascade,
  chat_id text check (chat_id is null or char_length(chat_id) <= 60),
  enrolled_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists wa_automation_enrollments_automation_contact_idx on wa_automation_enrollments (automation_id, contact_id);
-- Uma inscrição ATIVA por automação + contato (as encerradas ficam como histórico)
create unique index if not exists wa_automation_enrollments_active_uidx on wa_automation_enrollments (automation_id, contact_id) where removed_at is null;

alter table wa_native_label_seen enable row level security;
alter table wa_automation_enrollments enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['wa_native_label_seen', 'wa_automation_enrollments'] loop
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
