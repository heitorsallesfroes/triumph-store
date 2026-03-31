import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Product {
  id: string;
  model: string;
  color: string;
  supplier: string;
  cost: number;
  price: number;
  current_stock: number;
  minimum_stock: number;
  created_at: string;
  updated_at: string;
}

export interface Accessory {
  id: string;
  name: string;
  cost: number;
  created_at: string;
}

export interface Motoboy {
  id: string;
  name: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  created_at: string;
}

export interface MotoboyStats {
  id: string;
  name: string;
  deliveries_today: number;
  earnings_today: number;
  deliveries_this_week: number;
  earnings_this_week: number;
  deliveries_this_month: number;
  earnings_this_month: number;
  total_deliveries: number;
  total_earnings: number;
  avg_delivery_value: number;
}

export interface Sale {
  id: string;
  customer_name: string;
  city: string;
  neighborhood: string;
  payment_method: string;
  card_brand?: string;
  installments?: number;
  delivery_type: string;
  motoboy_id?: string;
  supplier_id?: string;
  delivery_fee: number;
  card_fee: number;
  total_cost: number;
  total_sale_price: number;
  net_received: number;
  profit: number;
  status: 'to_pack' | 'out_for_delivery' | 'completed';
  sale_date: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface SaleAccessory {
  id: string;
  sale_id: string;
  accessory_id: string;
  quantity: number;
}
