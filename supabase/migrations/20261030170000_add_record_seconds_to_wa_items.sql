alter table wa_items add column if not exists record_seconds integer check (record_seconds is null or (record_seconds >= 0 and record_seconds <= 60));
notify pgrst, 'reload schema';
