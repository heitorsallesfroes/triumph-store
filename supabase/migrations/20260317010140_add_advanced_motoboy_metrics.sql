/*
  # Add Advanced Motoboy Performance Metrics

  ## Overview
  This migration enhances the motoboy statistics system to provide detailed performance
  and financial metrics across multiple time periods (today, week, month, and total).

  ## Changes Made

  1. **Enhanced Statistics View**
     - Replaces the existing `motoboy_stats` view with a comprehensive version
     - Tracks deliveries and earnings across four time periods:
       - Today (Hoje)
       - This Week (Semana)
       - This Month (Mês)
       - Total Historical (Total)
     
  2. **New Metrics**
     - `deliveries_today`: Number of deliveries completed today
     - `earnings_today`: Total delivery fees earned today
     - `deliveries_this_week`: Number of deliveries completed this week
     - `earnings_this_week`: Total delivery fees earned this week
     - `deliveries_this_month`: Number of deliveries completed this month
     - `earnings_this_month`: Total delivery fees earned this month
     - `total_deliveries`: All-time delivery count
     - `total_earnings`: All-time earnings
     - `avg_delivery_value`: Average fee per delivery (ticket médio)

  3. **Filtering Criteria**
     - Only counts sales with `delivery_type = 'delivery'`
     - Only includes completed deliveries (`status = 'completed'`)
     - Date calculations use proper timezone-aware comparisons

  ## Security
  - View is accessible to authenticated and anonymous users (read-only)
  - No RLS required as view aggregates public statistics

  ## Usage
  The frontend can query this view to display motoboy rankings and performance
  metrics filtered by time period, with sorting by total earnings or delivery count.
*/

-- Drop existing view
DROP VIEW IF EXISTS motoboy_stats;

-- Create enhanced view with comprehensive time-based metrics
CREATE VIEW motoboy_stats AS
SELECT 
  m.id,
  m.name,
  -- Today metrics
  COALESCE(COUNT(s.id) FILTER (
    WHERE DATE(s.sale_date) = CURRENT_DATE
    AND s.status = 'completed'
  ), 0)::integer as deliveries_today,
  COALESCE(SUM(s.delivery_fee) FILTER (
    WHERE DATE(s.sale_date) = CURRENT_DATE
    AND s.status = 'completed'
  ), 0)::numeric as earnings_today,
  
  -- This week metrics (Monday to Sunday)
  COALESCE(COUNT(s.id) FILTER (
    WHERE DATE_TRUNC('week', s.sale_date) = DATE_TRUNC('week', CURRENT_DATE)
    AND s.status = 'completed'
  ), 0)::integer as deliveries_this_week,
  COALESCE(SUM(s.delivery_fee) FILTER (
    WHERE DATE_TRUNC('week', s.sale_date) = DATE_TRUNC('week', CURRENT_DATE)
    AND s.status = 'completed'
  ), 0)::numeric as earnings_this_week,
  
  -- This month metrics
  COALESCE(COUNT(s.id) FILTER (
    WHERE DATE_TRUNC('month', s.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
    AND s.status = 'completed'
  ), 0)::integer as deliveries_this_month,
  COALESCE(SUM(s.delivery_fee) FILTER (
    WHERE DATE_TRUNC('month', s.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
    AND s.status = 'completed'
  ), 0)::numeric as earnings_this_month,
  
  -- Total historical metrics
  COALESCE(COUNT(s.id) FILTER (
    WHERE s.status = 'completed'
  ), 0)::integer as total_deliveries,
  COALESCE(SUM(s.delivery_fee) FILTER (
    WHERE s.status = 'completed'
  ), 0)::numeric as total_earnings,
  
  -- Average delivery value (ticket médio)
  CASE 
    WHEN COUNT(s.id) FILTER (WHERE s.status = 'completed') > 0 
    THEN (COALESCE(SUM(s.delivery_fee) FILTER (WHERE s.status = 'completed'), 0) / 
          COUNT(s.id) FILTER (WHERE s.status = 'completed'))::numeric
    ELSE 0::numeric
  END as avg_delivery_value
  
FROM motoboys m
LEFT JOIN sales s ON s.motoboy_id = m.id AND s.delivery_type = 'delivery'
GROUP BY m.id, m.name;

-- Grant access to the view
GRANT SELECT ON motoboy_stats TO authenticated;
GRANT SELECT ON motoboy_stats TO anon;