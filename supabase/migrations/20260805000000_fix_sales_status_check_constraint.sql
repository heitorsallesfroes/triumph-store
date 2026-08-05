-- Corrige a constraint sales_status_check em produção, que estava sem
-- 'pago' e 'embalar_amanha' (por isso o UPDATE de status falhava com
-- erro 23514 ao selecionar "Embalar amanhã" no Histórico de Vendas).
-- Mantém também 'concluido' e 'reembolsado', já aceitos em produção.

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;

ALTER TABLE sales ADD CONSTRAINT sales_status_check
CHECK (status IN (
  'em_separacao',
  'embalado',
  'em_rota',
  'finalizado',
  'pago',
  'embalar_amanha',
  'concluido',
  'reembolsado'
));
