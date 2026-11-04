-- ============================================================================
-- Extensão 2.7.0: Biblioteca de mídias (wa_media_folders + wa_media)
-- ============================================================================
-- Todas as mídias da loja (fotos, vídeos, áudios, PDFs) num lugar só, em pastas. Os arquivos
-- ficam no mesmo bucket wa-media (mesmo upload das mensagens rápidas). sha256 único: o mesmo
-- arquivo não entra duas vezes (as mídias importadas das mensagens rápidas podem ficar sem
-- sha256; nulos não conflitam). Apagar uma pasta deixa as mídias dela "sem pasta".
--
-- RLS ligado, com a mesma política das wa_* atuais ("public access ..."). Se a Fase 2 de
-- segurança (20261103120000_lock_rls_authenticated.sql) JÁ tiver sido aplicada, as tabelas
-- novas já nascem só para usuários logados e ficam registradas na cópia rls_backup_20261103.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

create table if not exists wa_media_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists wa_media (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references wa_media_folders on delete set null,
  type text not null check (type in ('imagem', 'video', 'audio', 'documento')),
  title text not null check (char_length(title) between 1 and 120),
  caption text check (caption is null or char_length(caption) <= 4096),
  file_url text not null check (char_length(file_url) <= 1000),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_size bigint check (file_size is null or file_size >= 0),
  mime text check (mime is null or char_length(mime) <= 100),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  usage_count int not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists wa_media_sha256_uidx on wa_media (sha256);
create index if not exists wa_media_folder_idx on wa_media (folder_id);
create index if not exists wa_media_file_url_idx on wa_media (file_url);

alter table wa_media_folders enable row level security;
alter table wa_media enable row level security;

do $$
declare
  t text;
  locked boolean := to_regnamespace('rls_backup_20261103') is not null;
begin
  foreach t in array array['wa_media_folders', 'wa_media'] loop
    execute format('drop policy if exists %I on public.%I', 'public access ' || t, t);
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    if locked then
      -- Fase 2 já aplicada: só usuários logados
      execute format('create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
      delete from rls_backup_20261103.policies where schemaname = 'public' and tablename = t;
      delete from rls_backup_20261103.created_policies where schemaname = 'public' and tablename = t;
      insert into rls_backup_20261103.policies (schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check)
        values ('public', t, 'public access ' || t, 'PERMISSIVE', array['public'], 'ALL', 'true', 'true');
      insert into rls_backup_20261103.created_policies values ('public', t, 'authenticated full access');
      insert into rls_backup_20261103.rls_state (tablename, rls_enabled) values (t, true) on conflict (tablename) do nothing;
    else
      execute format('create policy %I on public.%I for all using (true) with check (true)', 'public access ' || t, t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
