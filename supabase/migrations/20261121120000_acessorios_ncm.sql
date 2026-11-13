-- 🧾 NF-e própria: NCM dos acessórios/brindes. Sem isso o brinde entra na nota sem NCM e a emissão trava.
-- Preenche pelo nome: pulseira → 9113.90.00 e fone → 8518.30.00. Os outros ficam vazios (cadastre em Acessórios).
-- Só preenche quem ainda está vazio, então rodar de novo não apaga NCM digitado à mão.
alter table accessories add column if not exists ncm text;

update accessories set ncm = '91139000' where coalesce(ncm, '') = '' and name ilike '%pulseira%';
update accessories set ncm = '85183000' where coalesce(ncm, '') = '' and name ilike '%fone%';
