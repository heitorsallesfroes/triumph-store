-- ============================================================================
-- Extensão 2.10.5: ligar a Compra do 📈 (wa_conversion_events) à venda do ERP (sales)
-- ============================================================================
-- wa_conversion_events:
--   sale_id             : a venda do ERP ligada a esta compra (ou nulo). Venda apagada → volta a nulo.
--   sale_link_set_chat  : a ligação preencheu sales.wa_chat_id (estava vazio) → "Desligar" limpa de novo.
--   sale_link_set_phone : telefone que a ligação preencheu em sales.customer_phone (estava vazio) →
--                         "Desligar" limpa de novo (só se ainda for esse telefone).
-- sales NÃO ganha coluna: a ligação só preenche wa_chat_id (2.3.0) e o telefone vazio. Valores, itens e
-- estoque nunca mudam. O painel do ERP já conta como venda do WhatsApp toda venda com wa_chat_id.
-- Sem tabela nova: as políticas continuam as mesmas (inclusive com a Fase 2 de segurança).
-- Sem esta migration, o 📈 funciona como antes (a ligação não aparece).
-- Pode rodar mais de uma vez sem erro. Depende de 20261103190000 (wa_conversion_events) e 20261103170000 (sales.wa_chat_id).
-- ============================================================================

alter table wa_conversion_events add column if not exists sale_id uuid references sales (id) on delete set null;
alter table wa_conversion_events add column if not exists sale_link_set_chat boolean not null default false;
alter table wa_conversion_events add column if not exists sale_link_set_phone text
  check (sale_link_set_phone is null or char_length(sale_link_set_phone) <= 20);
create index if not exists wa_conversion_events_sale_idx on wa_conversion_events (sale_id) where sale_id is not null;

notify pgrst, 'reload schema';
