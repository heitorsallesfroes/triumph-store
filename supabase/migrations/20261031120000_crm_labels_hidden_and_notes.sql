alter table wa_labels add column if not exists hidden boolean not null default false;
alter table wa_contacts add column if not exists notes text check (notes is null or char_length(notes) <= 2000);
notify pgrst, 'reload schema';
