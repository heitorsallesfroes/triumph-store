ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS hide_from_tracking boolean DEFAULT false;
