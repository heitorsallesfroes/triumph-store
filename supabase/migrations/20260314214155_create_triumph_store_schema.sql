/*
  # Triumph Store ERP Schema

  ## Overview
  Complete database schema for Triumph Store smartwatch ERP system including products,
  sales, accessories, motoboys, and logistics tracking.

  ## Tables Created

  ### 1. products
  - `id` (uuid, primary key)
  - `model` (text) - Watch model name (e.g., "Ultra 9")
  - `color` (text) - Color variant (e.g., "Black", "Silver")
  - `supplier` (text) - Supplier name
  - `cost` (numeric) - Purchase cost
  - `current_stock` (integer) - Current stock quantity
  - `minimum_stock` (integer) - Minimum stock threshold
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. accessories
  - `id` (uuid, primary key)
  - `name` (text) - Accessory name
  - `cost` (numeric) - Cost of accessory
  - `created_at` (timestamptz)

  ### 3. motoboys
  - `id` (uuid, primary key)
  - `name` (text) - Motoboy name
  - `created_at` (timestamptz)

  ### 4. sales
  - `id` (uuid, primary key)
  - `customer_name` (text)
  - `city` (text)
  - `neighborhood` (text)
  - `payment_method` (text) - e.g., "credit card", "debit", "cash", "pix"
  - `card_brand` (text, optional)
  - `installments` (integer, optional)
  - `delivery_type` (text) - e.g., "pickup", "delivery"
  - `motoboy_id` (uuid, optional, foreign key)
  - `delivery_fee` (numeric, default 0)
  - `card_fee` (numeric, default 0) - Calculated fee
  - `total_cost` (numeric) - Total cost of products/accessories
  - `total_sale_price` (numeric) - Total sale amount
  - `net_received` (numeric) - Amount after fees
  - `profit` (numeric) - Calculated profit
  - `status` (text) - Logistics status: "to_pack", "out_for_delivery", "completed"
  - `sale_date` (timestamptz)
  - `created_at` (timestamptz)

  ### 5. sale_items
  - `id` (uuid, primary key)
  - `sale_id` (uuid, foreign key)
  - `product_id` (uuid, foreign key)
  - `quantity` (integer)
  - `unit_price` (numeric) - Price per unit
  - `total_price` (numeric) - quantity * unit_price

  ### 6. sale_accessories
  - `id` (uuid, primary key)
  - `sale_id` (uuid, foreign key)
  - `accessory_id` (uuid, foreign key)
  - `quantity` (integer)

  ## Security
  - RLS enabled on all tables
  - Public access policies for demo purposes (should be restricted in production)

  ## Notes
  - Each product variant (model + color) is stored as separate row
  - Stock is managed per product variant
  - Accessories don't have stock control
  - Sales can have multiple products and accessories
  - Profit calculation includes all costs (product, accessories, delivery, card fees)
*/

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL,
  color text NOT NULL,
  supplier text NOT NULL,
  cost numeric(10,2) NOT NULL DEFAULT 0,
  current_stock integer NOT NULL DEFAULT 0,
  minimum_stock integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(model, color)
);

-- Create accessories table
CREATE TABLE IF NOT EXISTS accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  cost numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create motoboys table
CREATE TABLE IF NOT EXISTS motoboys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Create sales table
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  city text NOT NULL,
  neighborhood text NOT NULL,
  payment_method text NOT NULL,
  card_brand text,
  installments integer DEFAULT 1,
  delivery_type text NOT NULL,
  motoboy_id uuid REFERENCES motoboys(id),
  delivery_fee numeric(10,2) DEFAULT 0,
  card_fee numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2) DEFAULT 0,
  total_sale_price numeric(10,2) DEFAULT 0,
  net_received numeric(10,2) DEFAULT 0,
  profit numeric(10,2) DEFAULT 0,
  status text DEFAULT 'to_pack' CHECK (status IN ('to_pack', 'out_for_delivery', 'completed')),
  sale_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create sale_items table
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  total_price numeric(10,2) NOT NULL
);

-- Create sale_accessories table
CREATE TABLE IF NOT EXISTS sale_accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  accessory_id uuid NOT NULL REFERENCES accessories(id),
  quantity integer NOT NULL DEFAULT 1
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_model ON products(model);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(current_stock);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_accessories_sale_id ON sale_accessories(sale_id);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE motoboys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_accessories ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (for demo - should be restricted in production)
CREATE POLICY "Allow public read access to products"
  ON products FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to products"
  ON products FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to products"
  ON products FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to products"
  ON products FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to accessories"
  ON accessories FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to accessories"
  ON accessories FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to accessories"
  ON accessories FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to accessories"
  ON accessories FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to motoboys"
  ON motoboys FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to motoboys"
  ON motoboys FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to motoboys"
  ON motoboys FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to motoboys"
  ON motoboys FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to sales"
  ON sales FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to sales"
  ON sales FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to sales"
  ON sales FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to sales"
  ON sales FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to sale_items"
  ON sale_items FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to sale_items"
  ON sale_items FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to sale_items"
  ON sale_items FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to sale_items"
  ON sale_items FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to sale_accessories"
  ON sale_accessories FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to sale_accessories"
  ON sale_accessories FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to sale_accessories"
  ON sale_accessories FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to sale_accessories"
  ON sale_accessories FOR DELETE
  TO public
  USING (true);