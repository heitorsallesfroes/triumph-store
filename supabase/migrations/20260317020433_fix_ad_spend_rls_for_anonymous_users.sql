/*
  # Fix ad_spend RLS policies for anonymous users

  1. Changes
    - Drop existing restrictive policies that only allow authenticated users
    - Create new policies that allow anonymous users (anon role) to perform all operations
    - This is appropriate for a single-user application without authentication

  2. Security
    - Policies allow full CRUD access to anonymous users
    - Suitable for internal business management tools
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view ad spend data" ON ad_spend;
DROP POLICY IF EXISTS "Authenticated users can insert ad spend data" ON ad_spend;
DROP POLICY IF EXISTS "Authenticated users can update ad spend data" ON ad_spend;
DROP POLICY IF EXISTS "Authenticated users can delete ad spend data" ON ad_spend;

-- Create new policies for anonymous users
CREATE POLICY "Anyone can view ad spend data"
  ON ad_spend
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can insert ad spend data"
  ON ad_spend
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anyone can update ad spend data"
  ON ad_spend
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete ad spend data"
  ON ad_spend
  FOR DELETE
  TO anon
  USING (true);