/*
  # Add customer phone to sales table

  1. Changes
    - Add `customer_phone` column to `sales` table to store customer contact information
    - This field is optional and will be used in receipts

  2. Notes
    - Existing sales will have NULL phone numbers
    - No default value to avoid masking missing data
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'customer_phone'
  ) THEN
    ALTER TABLE sales ADD COLUMN customer_phone text;
  END IF;
END $$;
