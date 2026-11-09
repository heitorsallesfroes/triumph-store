-- ============================================================================
-- Extensão 2.13.1: excluir mensagem rápida usada num agendamento antigo
-- ============================================================================
-- wa_schedules.item_id tem ON DELETE SET NULL. A regra antiga (item_id is not null or body is not null) recusava
-- excluir uma mensagem rápida quando um agendamento JÁ ENVIADO (sem texto próprio) apontava para ela:
-- "Supabase 400 … 23514 Failing row contains …". A regra nova só exige mensagem ou texto enquanto o agendamento
-- está PENDENTE (os enviados/cancelados ficam como histórico, sem a mensagem).
-- Esta regra JÁ FOI APLICADA à mão no banco; este arquivo só registra no repositório. Pode rodar mais de uma vez:
-- tira qualquer regra "item_id ou body" que existir (a antiga, sem nome, ou esta) e cria esta de novo.
-- Desfazer: alter table wa_schedules drop constraint if exists wa_schedules_item_or_body_check;
--           alter table wa_schedules add check (item_id is not null or body is not null);  -- (só se não houver linhas sem os dois)
-- ============================================================================

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'wa_schedules'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%item_id is not null%' and pg_get_constraintdef(oid) ilike '%body is not null%'
  loop
    execute format('alter table wa_schedules drop constraint %I', c.conname);
  end loop;
end $$;

alter table wa_schedules add constraint wa_schedules_item_or_body_check
  check (item_id is not null or body is not null or status <> 'pendente');

notify pgrst, 'reload schema';
