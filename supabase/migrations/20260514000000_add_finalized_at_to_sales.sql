-- Adiciona finalized_at à tabela sales
-- Campo imutável: só é preenchido na PRIMEIRA transição para finalizado/concluido.
-- updated_at continua sendo atualizado em qualquer UPDATE, tornando-o inútil
-- como referência de data de entrega. finalized_at resolve esse problema.

ALTER TABLE sales ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

-- Inicializa registros existentes já finalizados.
-- Se updated_at está até 2 dias depois de sale_date, assumimos que é confiável.
-- Se está muito além (ex: foi carimbado por lancarValores semanas depois), usamos sale_date.
UPDATE sales
SET finalized_at = CASE
  WHEN (updated_at - sale_date) <= INTERVAL '2 days' THEN updated_at
  ELSE sale_date
END
WHERE status IN ('finalizado', 'concluido')
  AND finalized_at IS NULL;

-- Trigger: seta finalized_at apenas na primeira transição para finalizado/concluido.
-- Não dispara em updates subsequentes (lancarValores, edições de campo, etc.).
CREATE OR REPLACE FUNCTION set_sales_finalized_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('finalizado', 'concluido')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('finalizado', 'concluido')) THEN
    NEW.finalized_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_finalized_at_trigger ON sales;
CREATE TRIGGER sales_finalized_at_trigger
BEFORE UPDATE ON sales
FOR EACH ROW EXECUTE FUNCTION set_sales_finalized_at();

-- Índice para as queries de ranking e formulário por data de finalização
CREATE INDEX IF NOT EXISTS idx_sales_finalized_at
  ON sales (finalized_at)
  WHERE status IN ('finalizado', 'concluido');
