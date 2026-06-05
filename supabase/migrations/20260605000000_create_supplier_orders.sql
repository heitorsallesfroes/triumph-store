create table if not exists supplier_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  amount numeric(10,2) not null,
  date date not null,
  notes text,
  created_at timestamptz default now()
);

alter table supplier_orders enable row level security;

create policy "public access supplier_orders"
  on supplier_orders
  for all
  using (true)
  with check (true);
