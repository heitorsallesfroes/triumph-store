-- ============================================================================
-- Extensão 2.9.2: tipos novos de parte nas mensagens rápidas
-- ============================================================================
-- wa_item_parts.type ganha: 'localizacao', 'produto', 'catalogo', 'contato', 'pix'.
-- Os dados de cada tipo ficam em data (jsonb), validados pela extensão antes de gravar:
--   localizacao : { "name": "...", "address": "...", "lat": -23.5, "lng": -46.6 }
--   produto     : { "product_id": "123", "name": "...", "price": "R$ 99,90", "image_url": "https://..." | null }
--   catalogo    : {}
--   contato     : { "name": "...", "phone": "5511999999999" }
--   pix         : { "key_type": "CPF" | "CNPJ" | "PHONE" | "EMAIL" | "EVP", "key": "...", "name": "..." }
-- Produto e catálogo usam body como texto opcional junto do cartão.
-- wa_items NÃO muda: quando a 1ª parte é de um tipo novo, wa_items guarda type 'texto' com um resumo
-- (o ERP continua mostrando algo). Os disparos (wa_campaigns.parts, jsonb) não precisam de mudança.
-- Sem esta migration os tipos novos não aparecem na extensão e tudo funciona como antes.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

alter table wa_item_parts add column if not exists data jsonb
  check (data is null or jsonb_typeof(data) = 'object');

do $$
declare
  c record;
begin
  -- troca a regra do tipo (o nome automático costuma ser wa_item_parts_type_check)
  for c in
    select conname from pg_constraint
    where conrelid = 'wa_item_parts'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%' and pg_get_constraintdef(oid) ilike '%documento%'
  loop
    execute format('alter table wa_item_parts drop constraint %I', c.conname);
  end loop;
  alter table wa_item_parts add constraint wa_item_parts_type_check
    check (type in ('texto', 'audio', 'imagem', 'video', 'documento', 'localizacao', 'produto', 'catalogo', 'contato', 'pix'));
end $$;

notify pgrst, 'reload schema';
