-- ============================================================================
-- Desempenho (Disk IO): SÓ índices. Nada de tabela, coluna, política ou dado.
-- ============================================================================
-- Todos com "create index if not exists". Onde já existe um índice igual (de uma migration
-- antiga), uso o MESMO nome, então a linha não faz nada (não cria índice duplicado).
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

-- ── Vendas ──
create index if not exists idx_sales_date on sales (sale_date);                 -- já existia (migration inicial)
create index if not exists idx_sales_status on sales (status);                  -- já existia (migration inicial)
create index if not exists sales_finalized_at_idx on sales (finalized_at);      -- novo (o antigo idx_sales_finalized_at só cobre finalizadas)
create index if not exists sales_customer_phone_idx on sales (customer_phone);  -- novo (CRM e "última venda da conversa")
create index if not exists idx_sale_items_sale_id on sale_items (sale_id);      -- já existia
create index if not exists idx_sale_items_product_id on sale_items (product_id); -- já existia
create index if not exists idx_sale_accessories_sale_id on sale_accessories (sale_id); -- já existia

-- ── Pequenas vendas e gasto com anúncio ──
create index if not exists small_sales_created_at_idx on small_sales (created_at); -- novo (as telas filtram por created_at)
-- ad_spend(date): já tem índice único (a coluna date é UNIQUE e o ERP faz upsert por ela); nada a criar.

-- ── WhatsApp / CRM ──
-- Só cria se a tabela existir (algumas vêm de migrations da extensão que podem não ter sido aplicadas).
do $$
begin
  if to_regclass('public.wa_contact_labels') is not null then
    create index if not exists wa_contact_labels_label_id_idx on wa_contact_labels (label_id);     -- já existia
    create index if not exists wa_contact_labels_contact_id_idx on wa_contact_labels (contact_id); -- novo (a chave primária começa por contact_id; fica explícito)
  end if;
  if to_regclass('public.wa_contacts') is not null then
    create index if not exists wa_contacts_phone_idx on wa_contacts (phone);                       -- novo
  end if;
  if to_regclass('public.wa_schedules') is not null then
    create index if not exists wa_schedules_due_idx on wa_schedules (status, send_at);             -- já existia
  end if;
  if to_regclass('public.wa_campaign_targets') is not null then
    create index if not exists wa_campaign_targets_campaign_status_idx on wa_campaign_targets (campaign_id, status); -- já existia
  end if;
  if to_regclass('public.wa_automation_runs') is not null then
    create index if not exists wa_automation_runs_automation_idx on wa_automation_runs (automation_id, created_at);  -- já existia
  end if;
  if to_regclass('public.wa_send_log') is not null then
    create index if not exists wa_send_log_created_idx on wa_send_log (created_at);                -- já existia
  end if;
end $$;
