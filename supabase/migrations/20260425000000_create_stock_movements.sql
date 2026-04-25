CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('entrada', 'saida', 'venda', 'encomenda_recebida')),
  quantity integer NOT NULL,
  notes text,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  order_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on stock_movements"
  ON stock_movements FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at DESC);
