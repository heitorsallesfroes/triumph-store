/*
  # Add shipping label and tracking fields

  1. Changes
    - Add `tracking_code` column to store Super Frete tracking number
    - Add `shipping_label_url` column to store PDF label URL
    - Add `shipping_status` column to track label generation status
  
  2. Notes
    - These fields are nullable as they only apply to Correios deliveries
    - shipping_status can be: null, "Etiqueta gerada", "Em trânsito", "Entregue"
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'tracking_code'
  ) THEN
    ALTER TABLE sales ADD COLUMN tracking_code text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'shipping_label_url'
  ) THEN
    ALTER TABLE sales ADD COLUMN shipping_label_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'shipping_status'
  ) THEN
    ALTER TABLE sales ADD COLUMN shipping_status text;
  END IF;
END $$;