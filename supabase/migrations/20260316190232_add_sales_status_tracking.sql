/*
  # Add Sales Status Tracking

  ## Changes
  - Update sales table status enum to include new status values
  - Add status values: 'em_separacao', 'embalado', 'em_rota', 'finalizado', 'pago', 'embalar_amanha'
  - Remove old status values: 'to_pack', 'out_for_delivery', 'completed'

  ## Status Values
  1. em_separacao - Em separação (being separated/picked)
  2. embalado - Embalado (packed)
  3. em_rota - Em rota de entrega (out for delivery)
  4. finalizado - Finalizado (completed)
  5. pago - Pago (paid)
  6. embalar_amanha - Embalar amanhã (pack tomorrow)

  ## Notes
  - Default status will be 'em_separacao'
  - Existing sales will be updated to match new status values
*/

-- First, update existing sales to map old statuses to new ones
UPDATE sales 
SET status = CASE 
  WHEN status = 'to_pack' THEN 'em_separacao'
  WHEN status = 'out_for_delivery' THEN 'em_rota'
  WHEN status = 'completed' THEN 'finalizado'
  ELSE status
END
WHERE status IN ('to_pack', 'out_for_delivery', 'completed');

-- Drop the old constraint
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;

-- Add new constraint with updated status values
ALTER TABLE sales ADD CONSTRAINT sales_status_check 
CHECK (status IN ('em_separacao', 'embalado', 'em_rota', 'finalizado', 'pago', 'embalar_amanha'));

-- Update default value for new sales
ALTER TABLE sales ALTER COLUMN status SET DEFAULT 'em_separacao';