-- Produtos como cadastro principal do ERP (tela Cadastros › Produtos) e dados fiscais da NF-e própria.
--   ativo   : produto desativado some da Nova Venda e da lista de Produtos, mas continua no histórico das vendas
--   origem  : origem da mercadoria na NF-e (orig do ICMS, 0 a 8; 0 = nacional)
--   unidade : unidade comercial da NF-e (uCom/uTrib), padrão "Pc"
--   gtin    : código de barras GTIN/EAN (cEAN/cEANTrib), padrão "SEM GTIN"
-- O app funciona sem esta migration (trata a falta das colunas como ativo, 0, "Pc" e "SEM GTIN").
ALTER TABLE products ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS origem smallint NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT 'Pc';
ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin text NOT NULL DEFAULT 'SEM GTIN';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_origem_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_origem_check CHECK (origem BETWEEN 0 AND 8);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_ativo_idx ON products (ativo);
