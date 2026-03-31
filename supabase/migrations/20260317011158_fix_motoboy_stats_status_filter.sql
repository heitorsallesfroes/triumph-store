/*
  # Fix Motoboy Statistics Status Filter

  ## Overview
  Corrects the status filter in motoboy_stats view to use 'finalizado' instead of 'completed'.

  ## Changes Made

  1. **Status Filter Correction**
     - Changed all `status = 'completed'` filters to `status = 'finalizado'`
     - This aligns with the Portuguese status values used in the frontend
     
  2. **No Other Changes**
     - All other logic remains the same
     - Still filters by `delivery_type = 'delivery'`
     - All time period calculations remain unchanged

  ## Status Values Reference
  - 'em_separacao' - Em separação
  - 'embalado' - Embalado
  - 'em_rota' - Em rota de entrega
  - 'finalizado' - Finalizado (completed deliveries)
  - 'pago' - Pago
  - 'embalar_amanha' - Embalar amanhã

  ## Security
  - View remains accessible to authenticated and anonymous users (read-only)
*/

-- Drop existing view
DROP VIEW IF EXISTS motoboy_stats;

-- Create enhanced view with correct status filter
CREATE VIEW motoboy_stats AS
SELECT 
  m.id,
  m.name,
  -- Today metrics
  COALESCE(COUNT(s.id) FILTER (
    WHERE DATE(s.sale_date) = CURRENT_DATE
    AND s.status = 'finalizado'
  ), 0)::integer as deliveries_today,
  COALESCE(SUM(s.delivery_fee) FILTER (
    WHERE DATE(s.sale_date) = CURRENT_DATE
    AND s.status = 'finalizado'
  ), 0)::numeric as earnings_today,
  
  -- This week metrics (Monday to Sunday)
  COALESCE(COUNT(s.id) FILTER (
    WHERE DATE_TRUNC('week', s.sale_date) = DATE_TRUNC('week', CURRENT_DATE)
    AND s.status = 'finalizado'
  ), 0)::integer as deliveries_this_week,
  COALESCE(SUM(s.delivery_fee) FILTER (
    WHERE DATE_TRUNC('week', s.sale_date) = DATE_TRUNC('week', CURRENT_DATE)
    AND s.status = 'finalizado'
  ), 0)::numeric as earnings_this_week,
  
  -- This month metrics
  COALESCE(COUNT(s.id) FILTER (
    WHERE DATE_TRUNC('month', s.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
    AND s.status = 'finalizado'
  ), 0)::integer as deliveries_this_month,
  COALESCE(SUM(s.delivery_fee) FILTER (
    WHERE DATE_TRUNC('month', s.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
    AND s.status = 'finalizado'
  ), 0)::numeric as earnings_this_month,
  
  -- Total historical metrics
  COALESCE(COUNT(s.id) FILTER (
    WHERE s.status = 'finalizado'
  ), 0)::integer as total_deliveries,
  COALESCE(SUM(s.delivery_fee) FILTER (
    WHERE s.status = 'finalizado'
  ), 0)::numeric as total_earnings,
  
  -- Average delivery value (ticket médio)
  CASE 
    WHEN COUNT(s.id) FILTER (WHERE s.status = 'finalizado') > 0 
    THEN (COALESCE(SUM(s.delivery_fee) FILTER (WHERE s.status = 'finalizado'), 0) / 
          COUNT(s.id) FILTER (WHERE s.status = 'finalizado'))::numeric
    ELSE 0::numeric
  END as avg_delivery_value
  
FROM motoboys m
LEFT JOIN sales s ON s.motoboy_id = m.id AND s.delivery_type = 'delivery'
GROUP BY m.id, m.name;

-- Grant access to the view
GRANT SELECT ON motoboy_stats TO authenticated;
GRANT SELECT ON motoboy_stats TO anon;
