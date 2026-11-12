-- ============================================================================
-- ERP + edge function ig-link + extensão 2.18.3: links rastreáveis do Instagram SEM o código visível [IG-...]
-- ============================================================================
-- Cada link passa a ter uma FRASE natural própria (a mensagem pré-preenchida, sem código e sem emoji). A extensão
-- reconhece a 1ª mensagem do cliente pela frase (mesmo com pequenas edições) ou, na falta dela, pelo horário do
-- clique (até 10 min depois, só se houve exatamente 1 clique sem conversa). O código antigo continua aceito.
--
-- 1. ig_link_leads.match: como a conversa foi ligada — 'frase', 'horario' ou 'codigo'. As linhas que já existem
--    ganham 'codigo' (as das automações da FASE 3, reconhecidas pela frase, ganham 'frase'). Nada é apagado.
-- 2. As frases novas dos 3 links prontos. Só troca a mensagem que ainda é a antiga padrão
--    ('Olá! Vim pelo Instagram 😊'); se você já escreveu outra, ela fica como está.
-- 3. O padrão da coluna ig_links.message passa a ser uma frase sem emoji.
-- RLS: as tabelas já têm a mesma política das wa_* (migration 20261113120000); aqui nada muda nisso.
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

alter table ig_link_leads add column if not exists match text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ig_link_leads_match_check') then
    alter table ig_link_leads add constraint ig_link_leads_match_check check (match is null or match in ('frase', 'horario', 'codigo'));
  end if;
end $$;

update ig_link_leads set match = case when code = 'IG-DIRECT' or code like 'IG-A-%' then 'frase' else 'codigo' end
  where match is null;

alter table ig_links alter column message set default 'Olá! Vi o Instagram de vocês e quero saber mais';

update ig_links set message = 'Olá! Vi o perfil de vocês no Instagram e quero saber mais', updated_at = now()
  where slug = 'bio' and message = 'Olá! Vim pelo Instagram 😊';
update ig_links set message = 'Oi! Vi o story de vocês e fiquei interessado(a)', updated_at = now()
  where slug = 'stories' and message = 'Olá! Vim pelo Instagram 😊';
update ig_links set message = 'Olá! Comentei no post de vocês e quero saber mais', updated_at = now()
  where slug = 'manychat-comentarios' and message = 'Olá! Vim pelo Instagram 😊';

create index if not exists ig_link_leads_match_idx on ig_link_leads (match);

notify pgrst, 'reload schema';
