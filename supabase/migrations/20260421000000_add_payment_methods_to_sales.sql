-- Add payment_methods column to sales table for multiple payment methods per sale
-- Each entry: { method, card_brand, installments, amount }
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_methods jsonb DEFAULT NULL;
