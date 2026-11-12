-- Extensão 2.18.8 + ERP WhatsApp → Resultados: follow manual por categoria e por mensagem.
--   wa_categories.is_followup : "Mensagens desta categoria são follow-up" (toda mensagem rápida da categoria conta
--                               como follow manual nos Resultados do ERP).
--   wa_items.is_followup      : "Contar como follow-up nos Resultados do ERP (mesmo fora de uma categoria de follow)",
--                               sem etapa (o ERP numera: 1º, 2º, 3º follow manual desde a última resposta ou compra).
-- Opcional: sem esta migration a extensão e o ERP usam system_config "wa_followup_marks" (a extensão grava sempre lá).
-- Só colunas novas; pode rodar mais de uma vez.

alter table wa_categories add column if not exists is_followup boolean not null default false;
alter table wa_items add column if not exists is_followup boolean not null default false;
