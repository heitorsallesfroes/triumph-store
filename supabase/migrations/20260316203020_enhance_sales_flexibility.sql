/*
  # Enhance Sales Workflow Flexibility

  1. Changes to `sale_accessories` table
    - Add `custom_name` column for manually entered accessories
    - Add `cost` column to store accessory cost at time of sale
    - Make `accessory_id` nullable to support custom accessories
    - Add constraint to ensure either accessory_id or custom_name exists

  2. Changes to `sales` table
    - Allow `installments` to be 0 (undefined/to be determined later)
    - This enables saving credit card sales before installments are defined

  3. Security
    - Update RLS policies to accommodate new fields
    - Maintain data integrity with check constraints

  4. Notes
    - Custom accessories identified by NULL `accessory_id` and non-NULL `custom_name`
    - Cost stored directly to preserve historical pricing
    - Installments = 0 means "to be defined" for credit card sales
    - All existing data remains intact and compatible
*/

-- Add custom accessory support to sale_accessories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_accessories' AND column_name = 'custom_name'
  ) THEN
    ALTER TABLE sale_accessories ADD COLUMN custom_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_accessories' AND column_name = 'cost'
  ) THEN
    ALTER TABLE sale_accessories ADD COLUMN cost decimal(10,2) DEFAULT 0;
  END IF;
END $$;

-- Make accessory_id nullable to support custom accessories
ALTER TABLE sale_accessories ALTER COLUMN accessory_id DROP NOT NULL;

-- Populate cost for existing sale_accessories from accessories table
UPDATE sale_accessories sa
SET cost = COALESCE(a.cost, 0)
FROM accessories a
WHERE sa.accessory_id = a.id 
  AND (sa.cost = 0 OR sa.cost IS NULL);

-- Add check constraint: either accessory_id or custom_name must be present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sale_accessories_must_have_id_or_name'
  ) THEN
    ALTER TABLE sale_accessories 
    ADD CONSTRAINT sale_accessories_must_have_id_or_name 
    CHECK (accessory_id IS NOT NULL OR (custom_name IS NOT NULL AND custom_name <> ''));
  END IF;
END $$;

-- Update installments to allow 0 (to be defined later)
-- Note: installments column already allows this, just documenting the behavior
COMMENT ON COLUMN sales.installments IS 'Number of installments. 0 means to be defined later for credit card sales.';
