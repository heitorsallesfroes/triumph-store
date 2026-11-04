-- ============================================================================
-- Taxas próprias do LINK DE PAGAMENTO (payment_link)
-- ============================================================================
-- Na Rede, o link custa 1 ponto percentual a mais que o crédito da maquininha em cada
-- parcela. Antes o link usava fee_vm_credit_N / fee_ea_credit_N; agora usa as chaves abaixo.
-- Só insere (on conflict do nothing): não muda nenhuma taxa existente nem venda já gravada.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

insert into system_config (key, value) values
  ('fee_link_vm_credit_1', '0.0420'),
  ('fee_link_vm_credit_2', '0.0506'),
  ('fee_link_vm_credit_3', '0.0566'),
  ('fee_link_vm_credit_4', '0.0626'),
  ('fee_link_vm_credit_5', '0.0686'),
  ('fee_link_vm_credit_6', '0.0746'),
  ('fee_link_vm_credit_7', '0.0853'),
  ('fee_link_vm_credit_8', '0.0913'),
  ('fee_link_vm_credit_9', '0.0973'),
  ('fee_link_vm_credit_10', '0.1033'),
  ('fee_link_vm_credit_11', '0.1093'),
  ('fee_link_vm_credit_12', '0.1153'),
  ('fee_link_ea_credit_1', '0.0500'),
  ('fee_link_ea_credit_2', '0.0586'),
  ('fee_link_ea_credit_3', '0.0646'),
  ('fee_link_ea_credit_4', '0.0706'),
  ('fee_link_ea_credit_5', '0.0766'),
  ('fee_link_ea_credit_6', '0.0826'),
  ('fee_link_ea_credit_7', '0.0933'),
  ('fee_link_ea_credit_8', '0.0993'),
  ('fee_link_ea_credit_9', '0.1053'),
  ('fee_link_ea_credit_10', '0.1113'),
  ('fee_link_ea_credit_11', '0.1173'),
  ('fee_link_ea_credit_12', '0.1233')
on conflict (key) do nothing;
