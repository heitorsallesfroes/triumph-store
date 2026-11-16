-- Gestão › Anotações › PENSAMENTOS: mapas mentais (ideia central → ramos → sub-ramos).
-- Cada mapa guarda a árvore inteira em "dados" (jsonb): { v: 1, root, nodes: { id: { text, parent, children, ... } } }.
-- Acesso só para usuário logado, como erp_notas ("authenticated full access").
-- Sem esta migration a aba Pensamentos mostra o aviso "Falta aplicar a migration" e não grava nada.

CREATE TABLE IF NOT EXISTS erp_mapas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      text NOT NULL DEFAULT '',
  dados       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_mapas_updated_idx ON erp_mapas (updated_at DESC);

-- updated_at automático
CREATE OR REPLACE FUNCTION erp_mapas_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS erp_mapas_updated_at ON erp_mapas;
CREATE TRIGGER erp_mapas_updated_at BEFORE UPDATE ON erp_mapas
  FOR EACH ROW EXECUTE FUNCTION erp_mapas_set_updated_at();

-- RLS: só usuário logado
ALTER TABLE erp_mapas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access" ON erp_mapas;
CREATE POLICY "authenticated full access" ON erp_mapas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
