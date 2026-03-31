/*
  # Create suppliers table and link to sales

  1. New Tables
    - `suppliers`
      - `id` (uuid, primary key)
      - `name` (text, unique, not null) - Supplier name
      - `created_at` (timestamptz) - Creation timestamp

  2. Changes to Existing Tables
    - Add `supplier_id` (uuid, nullable) to `sales` table
      - References `suppliers.id`
      - Nullable for backward compatibility with existing sales

  3. Security
    - Enable RLS on `suppliers` table
    - Add policy for authenticated users to read suppliers
    - Add policy for authenticated users to create suppliers

  4. Initial Data
    - Insert default suppliers: Alex, Zoemex, RM, Direton
*/

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read suppliers
CREATE POLICY "Authenticated users can read suppliers"
  ON suppliers
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to create suppliers
CREATE POLICY "Authenticated users can create suppliers"
  ON suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add supplier_id to sales table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
  END IF;
END $$;

-- Insert default suppliers
INSERT INTO suppliers (name) VALUES
  ('Alex'),
  ('Zoemex'),
  ('RM'),
  ('Direton')
ON CONFLICT (name) DO NOTHING;