/*
  # Fix RLS policies for suppliers, cities, and neighborhoods tables
  
  1. Changes
    - Drop existing authenticated-only policies on suppliers, cities, neighborhoods
    - Add public access policies for SELECT and INSERT operations
    - This aligns with the existing public policies on products and sales tables
    
  2. Security
    - Allows anonymous users to read and create suppliers, cities, and neighborhoods
    - This is necessary for the application to function without authentication
    - Maintains RLS enabled for all tables
    
  3. Notes
    - The application uses anon key without authentication
    - These reference tables need the same access level as products and sales
*/

-- Drop existing authenticated-only policies for suppliers
DROP POLICY IF EXISTS "Authenticated users can read suppliers" ON suppliers;
DROP POLICY IF EXISTS "Authenticated users can create suppliers" ON suppliers;

-- Create public access policies for suppliers
CREATE POLICY "Allow public read access to suppliers"
  ON suppliers
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to suppliers"
  ON suppliers
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Drop existing authenticated-only policies for cities
DROP POLICY IF EXISTS "Authenticated users can view all cities" ON cities;
DROP POLICY IF EXISTS "Authenticated users can insert cities" ON cities;

-- Create public access policies for cities
CREATE POLICY "Allow public read access to cities"
  ON cities
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to cities"
  ON cities
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Drop existing authenticated-only policies for neighborhoods
DROP POLICY IF EXISTS "Authenticated users can view all neighborhoods" ON neighborhoods;
DROP POLICY IF EXISTS "Authenticated users can insert neighborhoods" ON neighborhoods;

-- Create public access policies for neighborhoods
CREATE POLICY "Allow public read access to neighborhoods"
  ON neighborhoods
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to neighborhoods"
  ON neighborhoods
  FOR INSERT
  TO public
  WITH CHECK (true);
