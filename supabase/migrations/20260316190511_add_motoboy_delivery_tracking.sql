/*
  # Add Motoboy Delivery Tracking

  ## Changes
  - Add computed columns and views for motoboy statistics
  - Track total deliveries, total earnings, and monthly deliveries per motoboy

  ## New Functionality
  1. Total Deliveries Count
    - Count all completed deliveries per motoboy
  
  2. Total Earnings
    - Sum of all delivery fees earned by each motoboy
  
  3. Monthly Deliveries
    - Count deliveries in current month per motoboy
  
  4. Monthly Earnings
    - Sum of delivery fees in current month per motoboy

  ## Notes
  - Statistics are calculated dynamically from sales table
  - Only counts sales with delivery_type = 'delivery'
  - Uses view for motoboy rankings
*/

-- Drop view if it exists
DROP VIEW IF EXISTS motoboy_stats;

-- Create a view for motoboy statistics
CREATE VIEW motoboy_stats AS
SELECT 
  m.id,
  m.name,
  COALESCE(COUNT(s.id), 0)::integer as total_deliveries,
  COALESCE(SUM(s.delivery_fee), 0)::numeric as total_earnings,
  COALESCE(COUNT(s.id) FILTER (
    WHERE DATE_TRUNC('month', s.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
  ), 0)::integer as deliveries_this_month,
  COALESCE(SUM(s.delivery_fee) FILTER (
    WHERE DATE_TRUNC('month', s.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
  ), 0)::numeric as earnings_this_month
FROM motoboys m
LEFT JOIN sales s ON s.motoboy_id = m.id AND s.delivery_type = 'delivery'
GROUP BY m.id, m.name;

-- Grant access to the view
GRANT SELECT ON motoboy_stats TO authenticated;
GRANT SELECT ON motoboy_stats TO anon;