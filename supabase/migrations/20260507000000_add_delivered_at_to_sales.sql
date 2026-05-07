DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE sales ADD COLUMN delivered_at timestamptz;
  END IF;
END $$;
