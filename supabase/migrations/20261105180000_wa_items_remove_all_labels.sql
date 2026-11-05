-- ============================================================================
-- Extensão 2.8.6: "e tirar da etiqueta" → "Todas (menos a que vai colocar)"
-- ============================================================================
-- Mensagem rápida que, ao sair com sucesso, tira o contato de TODAS as etiquetas daquele tipo (CRM ou
-- WhatsApp), menos a escolhida em "colocar". A etiqueta "Não enviar" (bloqueio do motor) nunca é retirada.
-- Os campos de etiqueta CRM são uuid, então "Todas" fica em colunas próprias.
-- Sem esta migration a opção não aparece e tudo funciona como antes. Pode rodar mais de uma vez sem erro.
-- ============================================================================

alter table wa_items add column if not exists on_send_remove_all_crm boolean not null default false;
alter table wa_items add column if not exists on_send_remove_all_wa boolean not null default false;

notify pgrst, 'reload schema';
