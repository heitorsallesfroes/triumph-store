/*
  # Add card brand tracking to sales

  1. Changes
    - Add `card_brand` column to `sales` table
      - Stores card brand: 'visa_mastercard' or 'elo_amex'
      - Nullable for backward compatibility
    
  2. Notes
    - Existing sales will have NULL card_brand
    - New sales with card payment will require card_brand selection
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'card_brand'
  ) THEN
    ALTER TABLE sales ADD COLUMN card_brand text;
  END IF;
END $$;