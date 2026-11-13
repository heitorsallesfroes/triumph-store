-- Produtos: products.category é só 'smartwatch' ou 'acessorio'.
-- A tela de Produtos (commit 4f93f30) chegou a gravar 'pulseira' e 'fone'; o Controle de Estoque, a Nova Venda e a
-- extensão só conhecem 'smartwatch'/'acessorio'. Pulseiras e Fones são deduzidos pelo nome na tela.
-- Idempotente: pode rodar mais de uma vez.
update public.products
   set category = 'acessorio', updated_at = now()
 where lower(category) in ('pulseira', 'fone');
