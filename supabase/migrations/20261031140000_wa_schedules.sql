-- Agendamentos de mensagens (extensão 1.9.0). Enviados pelo WhatsApp Web aberto, na hora marcada.
create table if not exists wa_schedules (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null check (chat_id ~ '^[0-9]+@(c\.us|lid)$'),
  chat_name text check (chat_name is null or char_length(chat_name) <= 100),
  item_id uuid references wa_items(id) on delete set null,
  body text check (body is null or char_length(body) <= 4096),
  send_at timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviada', 'falhou', 'cancelada', 'expirada')),
  error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (item_id is not null or body is not null)
);

create index if not exists wa_schedules_due_idx on wa_schedules(status, send_at);

alter table wa_schedules enable row level security;

create policy "public access wa_schedules"
  on wa_schedules
  for all
  using (true)
  with check (true);

notify pgrst, 'reload schema';
