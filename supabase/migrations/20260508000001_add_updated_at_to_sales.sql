-- Adiciona updated_at à tabela sales para rastrear quando o status foi alterado
ALTER TABLE sales ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Inicializa com sale_date para registros existentes
UPDATE sales SET updated_at = sale_date WHERE updated_at IS NULL;

ALTER TABLE sales ALTER COLUMN updated_at SET DEFAULT now();

-- Trigger: atualiza updated_at automaticamente em qualquer UPDATE
CREATE OR REPLACE FUNCTION update_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_updated_at_trigger ON sales;
CREATE TRIGGER sales_updated_at_trigger
BEFORE UPDATE ON sales
FOR EACH ROW EXECUTE FUNCTION update_sales_updated_at();
