/*
  # Add volumes field to sales table

  1. Changes
    - Add `volumes` column to `sales` table
      - Type: integer
      - Default: 1
      - Not null
      - Represents the number of packages/volumes for delivery

  2. Notes
    - Volume is calculated based on number of main products (smartwatches)
    - Can be manually adjusted by user
    - Used to print multiple delivery labels
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'volumes'
  ) THEN
    ALTER TABLE sales ADD COLUMN volumes integer NOT NULL DEFAULT 1;
  END IF;
END $$;