/*
  # Add Delivery Type and Correios Support

  1. Changes
    - Add `delivery_type` field to sales table with three options:
      - 'loja_fisica' (Loja Física)
      - 'motoboy' (Motoboy)
      - 'correios' (Correios SEDEX)
    - Add `delivery_cost` field for Correios shipping costs
    - Set default delivery_type to 'motoboy' for backward compatibility
    - Update existing records to have appropriate delivery type

  2. Notes
    - Loja Física: Customer picks up at store, no logistics tracking
    - Motoboy: Uses existing motoboy delivery system
    - Correios: External shipping, tracked separately, not in motoboy logistics
*/

-- Add delivery_type column to sales table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'delivery_type'
  ) THEN
    ALTER TABLE sales ADD COLUMN delivery_type text;
  END IF;
END $$;

-- Add delivery_cost column to sales table (for Correios shipping)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'delivery_cost'
  ) THEN
    ALTER TABLE sales ADD COLUMN delivery_cost decimal(10,2) DEFAULT 0;
  END IF;
END $$;

-- Update existing records to have motoboy as delivery type if they have a motoboy assigned
UPDATE sales 
SET delivery_type = 'motoboy' 
WHERE motoboy_id IS NOT NULL;

-- Update remaining records to loja_fisica if no motoboy
UPDATE sales 
SET delivery_type = 'loja_fisica' 
WHERE motoboy_id IS NULL;

-- Set default value for delivery_type
ALTER TABLE sales ALTER COLUMN delivery_type SET DEFAULT 'motoboy';

-- Now add check constraint after all records are updated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'sales_delivery_type_check'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_delivery_type_check 
    CHECK (delivery_type IN ('loja_fisica', 'motoboy', 'correios'));
  END IF;
END $$;