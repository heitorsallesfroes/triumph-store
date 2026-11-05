-- ============================================================================
-- Extensão 2.8.8: automações só valem daqui pra frente (segurança)
-- ============================================================================
-- activated_at     : quando a automação foi ativada (ou reativada / editada com gatilho ou etiqueta nova).
--                    Gatilhos de etiqueta só contam quem ENTROU depois disso; "dia e hora" e "venda
--                    registrada" só valem para eventos depois disso.
-- include_existing : na ativação, o usuário confirmou incluir quem já estava na etiqueta.
-- test_chat_id     : modo teste: roda só para esta conversa (o resto é ignorado).
-- As automações que JÁ estão ativas passam a valer a partir de agora (quem já estava não recebe).
-- Sem estas colunas a extensão não deixa ativar automação ("Atualize o banco"). Pode rodar mais de uma vez.
-- ============================================================================

alter table wa_automations add column if not exists activated_at timestamptz;
alter table wa_automations add column if not exists include_existing boolean not null default false;
alter table wa_automations add column if not exists test_chat_id text
  check (test_chat_id is null or test_chat_id ~ '^[0-9]+@(c\.us|lid)$');

update wa_automations set activated_at = now() where active and activated_at is null;

notify pgrst, 'reload schema';
