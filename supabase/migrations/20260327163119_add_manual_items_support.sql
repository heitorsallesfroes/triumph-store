/*
  # Add manual items support to sales

  1. Changes
    - Add `manual_items` column to `sales` table
      - Type: jsonb
      - Nullable (null means no manual items)
      - Stores array of manual items with structure:
        [{name: string, price: number, quantity: number}]
    
  2. Purpose
    - Allow users to add custom items to sales without creating products in database
    - Manual items do not affect stock
    - Manual items appear in receipts and totals
    - Manual items can be searched in sales history
  
  3. Notes
    - Manual items are stored as JSON to avoid creating additional tables
    - Each manual item has: name, price, quantity
    - Total price calculation must include manual items
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'manual_items'
  ) THEN
    ALTER TABLE sales ADD COLUMN manual_items jsonb DEFAULT NULL;
  END IF;
END $$;