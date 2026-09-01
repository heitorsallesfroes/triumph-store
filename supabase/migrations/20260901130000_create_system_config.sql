create table if not exists system_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table system_config enable row level security;

create policy "public access system_config"
  on system_config
  for all
  using (true)
  with check (true);

insert into system_config (key, value) values
  ('store_name', 'Triumph Store Smartwatches'),
  ('store_cnpj', '49.923.481/0001-04'),
  ('store_address', 'Rua Quinze de Novembro n°106, Sala 908, Centro - Niterói - RJ, CEP: 24020-125'),
  ('store_whatsapp', '(21) 98708-7535'),
  ('store_instagram', '@store_triumph'),

  ('fee_vm_debit', '0.0099'),
  ('fee_vm_credit_1', '0.0320'),
  ('fee_vm_credit_2', '0.0406'),
  ('fee_vm_credit_3', '0.0466'),
  ('fee_vm_credit_4', '0.0526'),
  ('fee_vm_credit_5', '0.0586'),
  ('fee_vm_credit_6', '0.0646'),
  ('fee_vm_credit_7', '0.0753'),
  ('fee_vm_credit_8', '0.0813'),
  ('fee_vm_credit_9', '0.0873'),
  ('fee_vm_credit_10', '0.0933'),
  ('fee_vm_credit_11', '0.0993'),
  ('fee_vm_credit_12', '0.1053'),

  ('fee_ea_debit', '0.0179'),
  ('fee_ea_credit_1', '0.0400'),
  ('fee_ea_credit_2', '0.0486'),
  ('fee_ea_credit_3', '0.0546'),
  ('fee_ea_credit_4', '0.0606'),
  ('fee_ea_credit_5', '0.0666'),
  ('fee_ea_credit_6', '0.0726'),
  ('fee_ea_credit_7', '0.0833'),
  ('fee_ea_credit_8', '0.0893'),
  ('fee_ea_credit_9', '0.0953'),
  ('fee_ea_credit_10', '0.1013'),
  ('fee_ea_credit_11', '0.1073'),
  ('fee_ea_credit_12', '0.1133'),

  ('packaging_cost', '2.00'),
  ('ad_tax_rate', '0.1383')
on conflict (key) do nothing;
