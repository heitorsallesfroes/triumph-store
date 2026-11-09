-- ============================================================================
-- Extensão 2.15.2 / ERP: criativo do anúncio no 👁 da aba Rastreamento
-- ============================================================================
-- wa_ad_attribution ganha a miniatura do criativo (thumbnailUrl do ctwaContext) e o tipo de mídia
-- (mediaType: IMAGE / VIDEO). O link do post/reel já era guardado em source_url (2.6.2).
-- A extensão completa essas colunas nas linhas que já existem, só quando estão vazias.
-- Sem esta migration, a extensão e o ERP continuam funcionando (só sem a miniatura).
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

alter table wa_ad_attribution add column if not exists thumbnail_url text;
alter table wa_ad_attribution add column if not exists media_type text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wa_ad_attribution_thumbnail_url_check') then
    alter table wa_ad_attribution add constraint wa_ad_attribution_thumbnail_url_check
      check (thumbnail_url is null or char_length(thumbnail_url) <= 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wa_ad_attribution_media_type_check') then
    alter table wa_ad_attribution add constraint wa_ad_attribution_media_type_check
      check (media_type is null or char_length(media_type) <= 40);
  end if;
end $$;

notify pgrst, 'reload schema';
