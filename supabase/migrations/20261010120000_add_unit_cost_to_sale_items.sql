-- Custo unitário do produto no momento da venda (preserva o histórico)
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_cost numeric(10,2) DEFAULT 0;
