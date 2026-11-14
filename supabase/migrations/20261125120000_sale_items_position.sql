-- Itens da venda: posição em que o item foi adicionado (0 = primeiro).
-- O ERP e a extensão gravam position na ordem de adição; as telas mostram o smartwatch primeiro,
-- brindes de R$ 0,00 por último e, dentro de cada grupo, a ordem de position.
-- Vendas antigas ficam com position nula (ordem de exibição só pela categoria/preço).
-- Idempotente: pode rodar mais de uma vez.
alter table public.sale_items add column if not exists position integer;
alter table public.sale_items add column if not exists created_at timestamptz default now();

-- recarrega o cache de esquema do PostgREST para a coluna aparecer na API
notify pgrst, 'reload schema';
