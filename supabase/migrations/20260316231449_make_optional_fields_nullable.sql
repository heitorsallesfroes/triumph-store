/*
  # Make supplier field optional in products table
  
  1. Changes
    - Make `supplier` column in `products` table nullable to allow products without supplier
    
  2. Notes
    - This allows creating products without specifying a supplier
    - Existing products with suppliers will remain unchanged
*/

DO $$
BEGIN
  -- Make supplier nullable in products table
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' 
    AND column_name = 'supplier'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE products ALTER COLUMN supplier DROP NOT NULL;
  END IF;
END $$;
