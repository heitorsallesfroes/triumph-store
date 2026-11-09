-- ============================================================================
-- Extensão 2.14.0: disparos mais completos e mais seguros
-- ============================================================================
-- wa_campaigns:
--   audience  jsonb  público: null = etiqueta CRM (label_id, como antes) ou {"source":"whatsapp","wa_label_id":"…"}
--   speed     jsonb  velocidade e segurança: {"preset":"seguro|normal|personalizado", min_s, max_s, per_hour,
--                    per_day, pause_every, pause_min, schedule}. null = "Normal". O limite duro (20 s, 60/hora,
--                    400/dia) é conferido pela extensão; nenhum disparo passa dele.
--   variants  jsonb  variações do texto: {"mode":"alternada|aleatoria|porcentagem","list":[{"text":"…"}],"weights":[…]}
--   skip_recent_days passa a começar desligado (0) nos disparos novos ("Opções avançadas").
-- wa_send_log.variant: qual variação saiu em cada envio de disparo (0 = a mensagem; 1.. = as variações), para o
--   resultado por variação (extensão e aba Resultados do ERP).
-- Filtros e "depois de enviar" continuam nas colunas jsonb que já existem (agora aceitam etiqueta do WhatsApp).
-- Só acrescenta (add column if not exists). Pode rodar mais de uma vez sem erro. Sem esta migration a extensão
-- funciona como antes (público CRM, velocidade geral, sem variações).
-- ============================================================================

alter table wa_campaigns add column if not exists audience jsonb;
alter table wa_campaigns add column if not exists speed jsonb;
alter table wa_campaigns add column if not exists variants jsonb;
alter table wa_campaigns alter column skip_recent_days set default 0;
alter table wa_send_log add column if not exists variant smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wa_campaigns_audience_check') then
    alter table wa_campaigns add constraint wa_campaigns_audience_check
      check (audience is null or jsonb_typeof(audience) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wa_campaigns_variants_check') then
    alter table wa_campaigns add constraint wa_campaigns_variants_check
      check (variants is null or (jsonb_typeof(variants) = 'object' and jsonb_array_length(coalesce(variants -> 'list', '[]'::jsonb)) <= 5));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wa_send_log_variant_check') then
    alter table wa_send_log add constraint wa_send_log_variant_check check (variant is null or variant between 0 and 5);
  end if;
end $$;

notify pgrst, 'reload schema';
