alter table operational_costs
  add column if not exists deactivated_at timestamptz;
