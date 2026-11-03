-- ============================================================================
-- Extensão 2.2.0: disparos mais completos
-- ============================================================================
-- wa_campaigns:
--   parts         : mensagem exclusiva do disparo (mesmo formato das partes de wa_item_parts:
--                   type, body, file_url, file_name, file_size, wait_seconds, typing_seconds).
--                   Até 10 partes. item_id ou parts precisa existir para iniciar (o código valida).
--   after_actions : depois de enviar com sucesso, por contato: adicionar/remover/mover etiqueta CRM.
--   filters       : público além da etiqueta principal (tem / não tem a etiqueta X,
--                   excluir quem respondeu nos últimos X dias).
--
-- Só colunas novas (nenhuma tabela nova): as políticas de wa_campaigns continuam as mesmas,
-- inclusive se a Fase 2 de segurança (20261103120000) já tiver sido aplicada.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

alter table wa_campaigns add column if not exists parts jsonb;
alter table wa_campaigns add column if not exists after_actions jsonb not null default '[]';
alter table wa_campaigns add column if not exists filters jsonb not null default '[]';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wa_campaigns_parts_check') then
    alter table wa_campaigns add constraint wa_campaigns_parts_check
      check (parts is null or (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) <= 10));
  end if;
  -- Fase 2 já aplicada ou não: nada muda nas políticas (sem tabela nova); só garante o RLS ligado
  alter table wa_campaigns enable row level security;
end $$;

notify pgrst, 'reload schema';
