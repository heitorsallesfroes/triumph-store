create table if not exists operational_costs_avulsos (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(10,2) not null,
  date date not null,
  created_at timestamptz default now()
);

alter table operational_costs_avulsos enable row level security;

create policy "public access avulsos"
  on operational_costs_avulsos
  for all
  using (true)
  with check (true);
