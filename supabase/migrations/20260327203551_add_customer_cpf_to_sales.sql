/*
  # Add customer CPF to sales table

  1. Changes
    - Add `customer_cpf` column to `sales` table
      - Type: text
      - Optional (nullable) - only required for correios shipping
      - Stores CPF without formatting (numbers only)
  
  2. Notes
    - CPF is required only for correios deliveries
    - Frontend will handle validation and formatting
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'customer_cpf'
  ) THEN
    ALTER TABLE sales ADD COLUMN customer_cpf text;
  END IF;
END $$;
