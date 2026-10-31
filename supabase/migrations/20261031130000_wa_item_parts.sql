-- Itens com várias partes (extensão 1.9.0). Item sem partes = item antigo de 1 parte (campos do próprio wa_items).
create table if not exists wa_item_parts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references wa_items(id) on delete cascade,
  position integer not null default 0,
  type text not null check (type in ('texto', 'audio', 'imagem', 'video', 'documento')),
  body text check (body is null or char_length(body) <= 4096),
  file_url text,
  file_name text,
  file_size bigint,
  wait_seconds integer not null default 0 check (wait_seconds between 0 and 600),
  typing_seconds integer not null default 0 check (typing_seconds between 0 and 60),
  created_at timestamptz not null default now()
);

create index if not exists wa_item_parts_item_idx on wa_item_parts(item_id, position);

alter table wa_item_parts enable row level security;

create policy "public access wa_item_parts"
  on wa_item_parts
  for all
  using (true)
  with check (true);

notify pgrst, 'reload schema';
