/*
  # Add selling price and remove unique constraint

  ## Changes Made
  
  1. **New Column**
     - Add `price` (numeric) - Selling price of the product
  
  2. **Schema Modifications**
     - Drop UNIQUE constraint on (model, color) to allow multiple suppliers for same model/color
     - This enables the business to purchase the same model from different suppliers at different costs
  
  ## Important Notes
  - Each product row now represents a unique supplier inventory item
  - Same model + color can exist multiple times with different suppliers
  - Enables better price comparison and supplier management
*/

-- Add selling price column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price'
  ) THEN
    ALTER TABLE products ADD COLUMN price numeric(10,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Drop the unique constraint on (model, color) to allow multiple suppliers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_model_color_key'
  ) THEN
    ALTER TABLE products DROP CONSTRAINT products_model_color_key;
  END IF;
END $$;