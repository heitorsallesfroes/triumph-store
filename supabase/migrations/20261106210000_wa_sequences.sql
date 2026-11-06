-- ============================================================================
-- Extensão 2.12.0: automação em SEQUÊNCIA com caminhos "Respondeu / Não respondeu"
-- ============================================================================
-- wa_automations:
--   kind     : 'regra' (as automações de sempre) ou 'sequencia'.
--   sequence : a sequência (jsonb): { start, business, steps: [...] } — começo (lead novo, etiqueta, venda
--              registrada ou adicionado à mão), "contar só no horário comercial" e os passos (enviar
--              mensagem, colocar/tirar etiqueta, esperar resposta com os caminhos ✅/❌, fim, continuar para).
--   trigger_type passa a aceitar 'sequencia' (as regras continuam iguais).
-- wa_sequence_runs: em que passo cada conversa está (um percurso por entrada; entrar de novo = outro).
--   node / wait_started_at / due_at / last_sent_at : passo atual, começo e fim previsto da espera, último envio.
--   status 'ativo' | 'fim' | 'saiu'; outcome: como terminou (respondeu, nao_respondeu, fim, manual, nao_enviar…).
--   branches : caminhos já tomados [{ node, result: 'sim'|'nao', at }]. version: trava contra envio duplicado.
--   skip_wait: "Pular espera" do painel (vai pelo ❌ na hora).
-- Mesmas políticas das wa_* (com ou sem a Fase 2 de segurança; registrada na cópia e no rollback).
-- Sem esta migration as sequências não aparecem e o resto funciona como antes. Pode rodar mais de uma vez.
-- ============================================================================

alter table wa_automations add column if not exists kind text not null default 'regra' check (kind in ('regra', 'sequencia'));
alter table wa_automations add column if not exists sequence jsonb check (sequence is null or jsonb_typeof(sequence) = 'object');

do $$
begin
  alter table wa_automations drop constraint if exists wa_automations_trigger_type_check;
  alter table wa_automations add constraint wa_automations_trigger_type_check
    check (trigger_type in ('sem_resposta', 'entrou_etiqueta', 'respondeu', 'dia_hora', 'venda_registrada', 'sequencia'));
end $$;

create table if not exists wa_sequence_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references wa_automations (id) on delete cascade,
  chat_id text not null check (chat_id ~ '^[0-9]+@(c\.us|lid)$'),
  contact_id uuid references wa_contacts (id) on delete set null,
  entry_key text not null check (char_length(entry_key) <= 120),
  node text check (node is null or char_length(node) <= 40),
  status text not null default 'ativo' check (status in ('ativo', 'fim', 'saiu')),
  outcome text check (outcome is null or char_length(outcome) <= 30),
  wait_started_at timestamptz,
  due_at timestamptz,
  last_sent_at timestamptz,
  skip_wait boolean not null default false,
  branches jsonb not null default '[]' check (jsonb_typeof(branches) = 'array'),
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (automation_id, chat_id, entry_key)
);
create index if not exists wa_sequence_runs_automation_idx on wa_sequence_runs (automation_id, status);
create index if not exists wa_sequence_runs_chat_idx on wa_sequence_runs (chat_id, status);

alter table wa_sequence_runs enable row level security;

do $$
declare
  t text := 'wa_sequence_runs';
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
