-- ============================================================================
-- Extensão 2.3.0: venda registrada pela conversa do WhatsApp
-- ============================================================================
-- sales: colunas NOVAS e OPCIONAIS (todas nullable, sem default que mude algo). O ERP não lê
-- nenhuma delas; nenhum número (DRE, estoque, comissões, motoboy) muda por causa delas.
--   wa_chat_id         : id da conversa do WhatsApp (só vendas registradas pela extensão)
--   origin             : 'anuncio' ou 'organico'
--   ad_source          : de onde veio o anúncio (ex.: Instagram, Facebook)
--   ad_title / ad_url  : título e link do anúncio (do ctwaContext da conversa)
--   wa_warranty_months : garantia informada no formulário da extensão (o ERP não tem campo de garantia)
-- wa_automations: libera o gatilho 'venda_registrada' ("QUANDO uma venda for registrada pela
-- conversa"); trigger_label_id já aceitava nulo.
--
-- Sem tabela nova: as políticas continuam as mesmas (inclusive com a Fase 2 de segurança).
-- Pode rodar mais de uma vez sem erro. Depende de 20261103150000 (automações).
-- ============================================================================

alter table sales add column if not exists wa_chat_id text;
alter table sales add column if not exists origin text;
alter table sales add column if not exists ad_source text;
alter table sales add column if not exists ad_title text;
alter table sales add column if not exists ad_url text;
alter table sales add column if not exists wa_warranty_months int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_origin_check') then
    alter table sales add constraint sales_origin_check check (origin is null or origin in ('anuncio', 'organico'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_wa_warranty_months_check') then
    alter table sales add constraint sales_wa_warranty_months_check check (wa_warranty_months is null or wa_warranty_months between 0 and 120);
  end if;
  -- Gatilho novo das automações
  alter table wa_automations drop constraint if exists wa_automations_trigger_type_check;
  alter table wa_automations add constraint wa_automations_trigger_type_check
    check (trigger_type in ('sem_resposta', 'entrou_etiqueta', 'respondeu', 'dia_hora', 'venda_registrada'));
end $$;

create index if not exists sales_wa_chat_id_idx on sales (wa_chat_id) where wa_chat_id is not null;

notify pgrst, 'reload schema';
