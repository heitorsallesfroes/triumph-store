/*
  # Add Address Fields to Sales Table

  1. Changes
    - Add `address_street` column (text, nullable) for street name
    - Add `address_number` column (text, nullable) for street number
    - Add `address_complement` column (text, nullable) for additional address info
    - Add `state` column (text, nullable) for state/UF
    - Add `zip_code` column (text, nullable) for CEP
    
  2. Notes
    - All fields are nullable to support existing sales and different delivery types
    - Motoboy deliveries require minimal address info (neighborhood, city)
    - Correios deliveries require complete address including street, number, state, CEP
    - Existing sales with only city and neighborhood will continue to work
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'address_street'
  ) THEN
    ALTER TABLE sales ADD COLUMN address_street text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'address_number'
  ) THEN
    ALTER TABLE sales ADD COLUMN address_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'address_complement'
  ) THEN
    ALTER TABLE sales ADD COLUMN address_complement text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'state'
  ) THEN
    ALTER TABLE sales ADD COLUMN state text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'zip_code'
  ) THEN
    ALTER TABLE sales ADD COLUMN zip_code text;
  END IF;
END $$;