-- ============================================================================
-- 2.20.0 — percursos ativos (wa_sequence_runs) com o chat de OUTRA pessoa
-- ============================================================================
-- NÃO É APLICADA SOZINHA: rode no SQL Editor do Supabase quando quiser (os envios automáticos podem continuar pausados).
--
-- Causa (corrigida na extensão 2.20.0): a etiqueta "Ao enviar" da mensagem rápida usava o telefone da conversa que
-- estava ABERTA quando o envio terminava. Quem já tinha ido para a próxima conversa ganhou contato com o telefone de
-- uma pessoa e o chat_id de outra; a régua criou o percurso no chat que recebeu a mensagem, mas com o contato errado.
--
-- Fonte da verdade aqui: o telefone que o PRÓPRIO WhatsApp deu para o chat (wa_contact_names.phone, gravado pela
-- ponte; senão wa_chat_activity.phone). Só mexe quando esse telefone é conhecido E é diferente do telefone do contato
-- do percurso:
--   1. existe exatamente UM contato com o telefone do chat, e ele ainda não tem percurso ativo nesta régua
--      → o percurso passa para esse contato (contact_id), é a pessoa que recebeu a mensagem;
--   2. senão → o percurso é PAUSADO (outcome 'pausado_chat'; o motor não envia nada para ele) e fica registrado em
--      wa_send_log ('pulado', com o motivo), que aparece no painel e na Saúde das automações.
-- Percurso sem contato, ou chat sem telefone conhecido, não é tocado (a extensão confere com o WhatsApp antes de enviar
-- e pausa se não der para confirmar). Nenhum contato é alterado nem apagado; nenhuma mensagem é enviada.
--
-- Tudo o que muda fica em wa_runs_chat_fix_20261126 (valores antigos). Para desfazer:
--   update wa_sequence_runs r set contact_id = b.old_contact_id, outcome = b.old_outcome, version = r.version + 1, updated_at = now()
--     from wa_runs_chat_fix_20261126 b where b.run_id = r.id;
-- ============================================================================

create table if not exists wa_runs_chat_fix_20261126 (
  run_id uuid primary key,
  automation_id uuid,
  chat_id text,
  old_contact_id uuid,
  old_outcome text,
  chat_phone text,
  contact_phone text,
  action text not null check (action in ('relink', 'pause')),
  new_contact_id uuid,
  fixed_at timestamptz not null default now()
);
alter table wa_runs_chat_fix_20261126 enable row level security;
drop policy if exists "authenticated full access" on wa_runs_chat_fix_20261126;
create policy "authenticated full access" on wa_runs_chat_fix_20261126 for all to authenticated using (true) with check (true);

-- mesmo telefone brasileiro com ou sem o 9: DDD + 8 últimos dígitos
create or replace function pg_temp.tel_key(p text) returns text language sql immutable as $$
  select case when d ~ '^55[0-9]{10,11}$' then substr(d, 3, 2) || right(d, 8) when d ~ '^[0-9]{8,15}$' then d else null end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

with chat_phone as (
  select r.id as run_id, r.automation_id, r.chat_id, r.contact_id, r.outcome, c.phone as contact_phone,
         coalesce(
           (select n.phone from wa_contact_names n where n.chat_id = r.chat_id and n.phone is not null limit 1),
           (select a.phone from wa_chat_activity a where a.chat_id = r.chat_id and a.phone is not null limit 1),
           case when r.chat_id ~ '^[0-9]{8,15}@c\.us$' then split_part(r.chat_id, '@', 1) end
         ) as chat_phone
  from wa_sequence_runs r
  join wa_contacts c on c.id = r.contact_id
  where r.status = 'ativo' and coalesce(r.outcome, '') <> 'pausado_chat'
),
wrong as (
  select * from chat_phone
  where pg_temp.tel_key(chat_phone) is not null
    and pg_temp.tel_key(contact_phone) is distinct from pg_temp.tel_key(chat_phone)
),
owner as (
  select w.run_id,
         (array_agg(c.id order by c.created_at))[1] as owner_id,
         count(*) as n
  from wrong w
  join wa_contacts c on pg_temp.tel_key(c.phone) = pg_temp.tel_key(w.chat_phone)
  group by w.run_id
),
plan as (
  select w.*, o.owner_id,
         case when o.n = 1
                and not exists (select 1 from wa_sequence_runs x where x.status = 'ativo' and x.automation_id = w.automation_id
                                and x.contact_id = o.owner_id and x.id <> w.run_id)
              then 'relink' else 'pause' end as action
  from wrong w left join owner o on o.run_id = w.run_id
)
insert into wa_runs_chat_fix_20261126 (run_id, automation_id, chat_id, old_contact_id, old_outcome, chat_phone, contact_phone, action, new_contact_id)
select run_id, automation_id, chat_id, contact_id, outcome, chat_phone, contact_phone, action, case when action = 'relink' then owner_id end
from plan
on conflict (run_id) do nothing;

update wa_sequence_runs r
set contact_id = b.new_contact_id, version = r.version + 1, updated_at = now()
from wa_runs_chat_fix_20261126 b
where b.run_id = r.id and b.action = 'relink' and r.status = 'ativo' and r.contact_id = b.old_contact_id;

update wa_sequence_runs r
set outcome = 'pausado_chat', version = r.version + 1, updated_at = now()
from wa_runs_chat_fix_20261126 b
where b.run_id = r.id and b.action = 'pause' and r.status = 'ativo' and coalesce(r.outcome, '') <> 'pausado_chat';

insert into wa_send_log (source, origin, source_id, contact_id, chat_id, status, reason)
select 'follow', 'automacao', b.automation_id, b.old_contact_id, b.chat_id, 'pulado', 'pausado: a conversa não é do telefone do contato'
from wa_runs_chat_fix_20261126 b
where b.action = 'pause' and b.fixed_at > now() - interval '1 minute';

-- conferência: o que foi feito
select action, count(*) from wa_runs_chat_fix_20261126 group by action;
