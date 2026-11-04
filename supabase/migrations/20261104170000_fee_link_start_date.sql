-- ============================================================================
-- Data a partir da qual valem as taxas próprias do link de pagamento (fee_link_*)
-- ============================================================================
-- Vendas por link ANTES de fee_link_start_date usam a taxa do crédito (fee_vm/ea_credit_N).
-- Padrão '2099-01-01': enquanto não for configurada (Configurações → Link de pagamento), nada muda.
-- Só insere esta chave (on conflict do nothing): NÃO mexe nas fee_link_* nem em outra taxa.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

insert into system_config (key, value) values
  ('fee_link_start_date', '2099-01-01')
on conflict (key) do nothing;
