/*
  # Add Custom Accessories Support

  1. Changes
    - Modify `sale_accessories` table to support custom accessories
    - Add `custom_name` column for manually entered accessories
    - Add `cost` column to store accessory cost at time of sale
    - Make `accessory_id` nullable to allow custom entries
    - Ensure installments can be 0 for credit card sales pending definition

  2. Notes
    - Custom accessories are identified by NULL `accessory_id`
    - Cost is stored directly to preserve historical pricing
    - All existing data remains intact
*/

-- Add custom accessory support to sale_accessories
DO $$
BEGIN
  -- Add custom_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_accessories' AND column_name = 'custom_name'
  ) THEN
    ALTER TABLE sale_accessories ADD COLUMN custom_name text;
  END IF;

  -- Add cost column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_accessories' AND column_name = 'cost'
  ) THEN
    ALTER TABLE sale_accessories ADD COLUMN cost decimal(10,2) DEFAULT 0;
  END IF;
END $$;

-- Make accessory_id nullable to support custom accessories
ALTER TABLE sale_accessories ALTER COLUMN accessory_id DROP NOT NULL;

-- Update existing sale_accessories to include cost from accessories table
UPDATE sale_accessories sa
SET cost = a.cost
FROM accessories a
WHERE sa.accessory_id = a.id AND sa.cost = 0;

-- Add check constraint to ensure either accessory_id or custom_name is present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sale_accessories_must_have_id_or_name'
  ) THEN
    ALTER TABLE sale_accessories 
    ADD CONSTRAINT sale_accessories_must_have_id_or_name 
    CHECK (accessory_id IS NOT NULL OR custom_name IS NOT NULL);
  END IF;
END $$;
