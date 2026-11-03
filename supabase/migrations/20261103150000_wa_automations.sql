-- ============================================================================
-- Extensão 2.1.0: automações "Quando → Se → Então" + mensagem rápida que etiqueta
-- ============================================================================
-- wa_automations     : QUANDO (gatilho), SE (condições, jsonb) e ENTÃO (ações em ordem, jsonb).
--                      Gatilhos: sem_resposta, entrou_etiqueta, respondeu, dia_hora
--                      ('venda_registrada' fica para a Etapa E).
-- wa_automation_runs : uma linha por automação + contato + "gatilho" (run_key); o unique
--                      impede a mesma automação rodar duas vezes para o mesmo contato no mesmo
--                      gatilho (run_key = etiqueta + data em que o contato entrou nela, ou a
--                      data do dia para dia_hora). É a reserva feita antes de executar.
-- wa_items           : + on_send_add_label_id / on_send_remove_label_id (ao enviar a mensagem
--                      inteira com sucesso, põe/tira o contato dessas etiquetas CRM).
-- wa_flows           : + migrated_to. Cada régua da 2.0.0 vira uma automação equivalente
--                      (e mais uma "respondeu" se ela tinha "Se responder vai para"); a régua
--                      antiga fica marcada e as tabelas antigas continuam no banco.
--
-- Depende das migrations 20261103130000 (motor) e 20261103140000 (disparos).
-- RLS ligado, com a mesma política das wa_* atuais ("public access ..."). Se a Fase 2 de
-- segurança (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, as tabelas
-- novas já nascem só para usuários logados e ficam registradas na cópia rls_backup_20261103.
-- Pode rodar mais de uma vez sem erro (a migração das réguas só pega as não migradas).
-- ============================================================================

create table if not exists wa_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 60),
  active bool not null default false,
  position int not null default 0,
  trigger_type text not null check (trigger_type in ('sem_resposta', 'entrou_etiqueta', 'respondeu', 'dia_hora')),
  trigger_label_id uuid references wa_labels on delete cascade,
  wait_minutes int check (wait_minutes is null or wait_minutes between 1 and 525600),
  schedule_days int[],
  schedule_time time,
  conditions jsonb not null default '[]',
  actions jsonb not null default '[]',
  ignore_older_days int not null default 15 check (ignore_older_days between 1 and 365),
  created_at timestamptz not null default now()
);

create table if not exists wa_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references wa_automations on delete cascade,
  contact_id uuid references wa_contacts on delete set null,
  run_key text not null,
  created_at timestamptz not null default now(),
  unique (automation_id, contact_id, run_key)
);
create index if not exists wa_automation_runs_automation_idx on wa_automation_runs (automation_id, created_at);

alter table wa_items add column if not exists on_send_add_label_id uuid references wa_labels on delete set null;
alter table wa_items add column if not exists on_send_remove_label_id uuid references wa_labels on delete set null;

alter table wa_flows add column if not exists migrated_to uuid;

-- Réguas da 2.0.0 → automações equivalentes
do $$
declare
  f record;
  new_id uuid;
  send_action jsonb;
  after_action jsonb;
begin
  for f in select * from wa_flows where migrated_to is null order by position, created_at loop
    send_action := jsonb_build_object(
      'type', 'enviar',
      'item_id', f.item_id,
      'variants', coalesce((
        select jsonb_agg(
          case when v.condition = 'etiqueta'
            then jsonb_build_object('when', 'etiqueta', 'label_id', v.label_id, 'item_id', v.item_id)
            else jsonb_build_object('when', 'anuncio', 'keyword', v.ad_keyword, 'item_id', v.item_id)
          end order by v.position)
        from wa_flow_variants v where v.flow_id = f.id), '[]'::jsonb));
    if f.next_label_id is not null then
      after_action := jsonb_build_object('type', 'mover', 'label_id', f.next_label_id);
    else
      after_action := jsonb_build_object('type', 'remover_etiqueta', 'label_id', f.label_id);
    end if;
    insert into wa_automations (name, active, position, trigger_type, trigger_label_id, wait_minutes, conditions, actions, ignore_older_days)
    values (f.name, f.active, f.position * 2, 'sem_resposta', f.label_id, f.wait_minutes, '[]'::jsonb,
            jsonb_build_array(send_action, after_action), f.ignore_older_days)
    returning id into new_id;
    if f.reply_label_id is not null then
      insert into wa_automations (name, active, position, trigger_type, trigger_label_id, conditions, actions, ignore_older_days)
      values (left(f.name || ' (respondeu)', 60), f.active, f.position * 2 + 1, 'respondeu', f.label_id, '[]'::jsonb,
              jsonb_build_array(jsonb_build_object('type', 'mover', 'label_id', f.reply_label_id)), f.ignore_older_days);
    end if;
    update wa_flows set migrated_to = new_id where id = f.id;
  end loop;
end $$;

alter table wa_automations enable row level security;
alter table wa_automation_runs enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['wa_automations', 'wa_automation_runs'] loop
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
