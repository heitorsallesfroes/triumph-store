-- ============================================================================
-- Extensão 2.7.1: mensagem rápida que põe/tira etiqueta do WhatsApp Business ao enviar
-- ============================================================================
-- Igual às etiquetas CRM "ao enviar" (on_send_add_label_id / on_send_remove_label_id), mas com as
-- etiquetas do próprio WhatsApp. Guarda o id da etiqueta do WhatsApp como texto (não há tabela delas
-- no banco: elas vivem no WhatsApp). Só muda as etiquetas quando a mensagem inteira sai com sucesso;
-- etiqueta apagada depois no WhatsApp é ignorada pela extensão.
-- Sem esta migration a extensão funciona como antes. Pode rodar mais de uma vez sem erro.
-- ============================================================================

alter table wa_items add column if not exists on_send_add_wa_label_id text
  check (on_send_add_wa_label_id is null or char_length(on_send_add_wa_label_id) between 1 and 40);
alter table wa_items add column if not exists on_send_remove_wa_label_id text
  check (on_send_remove_wa_label_id is null or char_length(on_send_remove_wa_label_id) between 1 and 40);

notify pgrst, 'reload schema';
