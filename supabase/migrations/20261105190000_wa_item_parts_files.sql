-- ============================================================================
-- Extensão 2.8.7: várias imagens numa parte só (álbum)
-- ============================================================================
-- Uma parte do tipo 'imagem' pode guardar até 10 arquivos (fotos e vídeos MP4) em files, na ordem de envio:
--   [{ "file_url": "...", "file_name": "...", "file_size": 123, "kind": "imagem" | "video" }, ...]
-- file_url/file_name/file_size da parte continuam com o PRIMEIRO arquivo (o ERP e versões antigas veem a
-- primeira foto). Sem esta coluna o tipo "Várias imagens" não aparece e tudo funciona como antes.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

alter table wa_item_parts add column if not exists files jsonb
  check (files is null or (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 1 and 10));

notify pgrst, 'reload schema';
