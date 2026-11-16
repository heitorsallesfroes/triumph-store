-- Gestão › Anotações: TAREFAS (checklist com data, prioridade e repetição) e NOTAS (bloco de notas em cartões).
-- Acesso só para usuário logado, como as outras tabelas do ERP ("authenticated full access").
-- Sem esta migration a página mostra o aviso "Falta aplicar a migration" e não grava nada.

CREATE TABLE IF NOT EXISTS erp_tarefas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto       text NOT NULL CHECK (length(btrim(texto)) > 0),
  due_date    date,                                   -- null = "Algum dia"
  done        boolean NOT NULL DEFAULT false,
  done_at     timestamptz,
  importante  boolean NOT NULL DEFAULT false,
  repeticao   text CHECK (repeticao IN ('diario', 'uteis', 'semanal')),
  position    double precision NOT NULL DEFAULT 0,    -- ordem dentro do grupo (arrastar)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_notas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      text NOT NULL DEFAULT '',
  texto       text NOT NULL DEFAULT '',
  cor         text NOT NULL DEFAULT 'amarelo' CHECK (cor IN ('amarelo', 'verde', 'azul', 'rosa', 'roxo', 'cinza')),
  fixada      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_tarefas_pendentes_idx ON erp_tarefas (done, due_date);
CREATE INDEX IF NOT EXISTS erp_tarefas_done_at_idx ON erp_tarefas (done_at DESC) WHERE done;
CREATE INDEX IF NOT EXISTS erp_notas_ordem_idx ON erp_notas (fixada DESC, updated_at DESC);

-- updated_at automático
CREATE OR REPLACE FUNCTION erp_anotacoes_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS erp_tarefas_updated_at ON erp_tarefas;
CREATE TRIGGER erp_tarefas_updated_at BEFORE UPDATE ON erp_tarefas
  FOR EACH ROW EXECUTE FUNCTION erp_anotacoes_set_updated_at();

DROP TRIGGER IF EXISTS erp_notas_updated_at ON erp_notas;
CREATE TRIGGER erp_notas_updated_at BEFORE UPDATE ON erp_notas
  FOR EACH ROW EXECUTE FUNCTION erp_anotacoes_set_updated_at();

-- RLS: só usuário logado
ALTER TABLE erp_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access" ON erp_tarefas;
CREATE POLICY "authenticated full access" ON erp_tarefas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated full access" ON erp_notas;
CREATE POLICY "authenticated full access" ON erp_notas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
