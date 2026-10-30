-- Biblioteca de mensagens/mídias do WhatsApp (página WhatsApp). Isolado: só objetos novos.

create table if not exists wa_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists wa_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references wa_categories(id) on delete cascade,
  type text not null check (type in ('texto', 'audio', 'imagem', 'video', 'documento')),
  title text not null,
  body text,
  file_url text,
  file_name text,
  file_size bigint,
  usage_count integer not null default 0,
  position integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists wa_items_category_id_idx on wa_items(category_id);

alter table wa_categories enable row level security;
alter table wa_items enable row level security;

create policy "public access wa_categories"
  on wa_categories
  for all
  using (true)
  with check (true);

create policy "public access wa_items"
  on wa_items
  for all
  using (true)
  with check (true);

-- Storage
insert into storage.buckets (id, name, public)
values ('wa-media', 'wa-media', true)
on conflict (id) do nothing;

create policy "public read wa-media"
  on storage.objects for select
  using (bucket_id = 'wa-media');

create policy "public insert wa-media"
  on storage.objects for insert
  with check (bucket_id = 'wa-media');

create policy "public update wa-media"
  on storage.objects for update
  using (bucket_id = 'wa-media')
  with check (bucket_id = 'wa-media');

create policy "public delete wa-media"
  on storage.objects for delete
  using (bucket_id = 'wa-media');
