/*
  # Marketing / Tráfego Pago - Ad Spend Tracking

  1. New Tables
    - `ad_spend`
      - `id` (uuid, primary key)
      - `date` (date, unique) - Date of the ad spend
      - `amount` (decimal) - Amount spent on ads for that day
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `ad_spend` table
    - Add policy for authenticated users to read all ad spend data
    - Add policy for authenticated users to insert new ad spend records
    - Add policy for authenticated users to update ad spend records
    - Add policy for authenticated users to delete ad spend records

  3. Notes
    - Date field has unique constraint to prevent duplicate entries for the same day
    - Amount must be >= 0
    - Updated_at automatically updates on record changes
*/

CREATE TABLE IF NOT EXISTS ad_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date UNIQUE NOT NULL,
  amount decimal(10, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ad spend data"
  ON ad_spend
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert ad spend data"
  ON ad_spend
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update ad spend data"
  ON ad_spend
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete ad spend data"
  ON ad_spend
  FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_ad_spend_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ad_spend_updated_at
  BEFORE UPDATE ON ad_spend
  FOR EACH ROW
  EXECUTE FUNCTION update_ad_spend_updated_at();
