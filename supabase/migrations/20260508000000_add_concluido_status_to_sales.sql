-- Adiciona 'concluido' à constraint de status da tabela sales
-- 'concluido' = entregue e visível no kanban (coluna Concluído)
-- 'finalizado' = removido do kanban pelo botão X

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;

ALTER TABLE sales ADD CONSTRAINT sales_status_check
CHECK (status IN ('em_separacao', 'embalado', 'em_rota', 'finalizado', 'pago', 'embalar_amanha', 'concluido'));
