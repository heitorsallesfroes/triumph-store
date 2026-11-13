-- 🧾 NF-e própria, fase 2: chave "Liberar notas reais (produção)". DESLIGADA por padrão.
-- O servidor (/api/nfe) só emite no ambiente 1 (produção) com producao_liberada = true AQUI no banco.
-- Sem esta migration tudo continua só em teste (homologação); o cancelamento não precisa dela
-- (o XML do cancelamento fica em nfe_notas.dados -> 'cancelamento').
-- NÃO mexe em nada do Tiny.
alter table nfe_config add column if not exists producao_liberada boolean not null default false;
alter table nfe_config add column if not exists producao_liberada_em timestamptz;

-- busca por data de autorização (XMLs do mês para o contador)
create index if not exists nfe_notas_autorizada on nfe_notas (ambiente, autorizada_em) where status in ('autorizada', 'cancelada');

notify pgrst, 'reload schema';
