-- ============================================================================
-- Extensão 2.12.2 + ERP: aba WhatsApp → RASTREAMENTO
-- ============================================================================
-- wa_leads.last_message_at : hora da última mensagem (nossa ou do cliente) que a extensão viu na
--                            conversa. Só avança (a extensão grava só quando é mais nova).
-- wa_leads.buy_signal_at   : última vez que uma mensagem da conversa (nossa ou do cliente) tinha um
--                            sinal de compra ("pix", "comprovante", "paguei", "endereço de entrega",
--                            "pagamento"). A extensão confere o texto na hora, no navegador, e grava SÓ
--                            a hora. O texto nunca é guardado.
-- Sem esta migration a extensão e o ERP funcionam como antes (sem a última mensagem nem as
-- "Possíveis vendas não marcadas"). Pode rodar mais de uma vez sem erro. Depende de 20261106150000.
-- ============================================================================

alter table wa_leads add column if not exists last_message_at timestamptz;
alter table wa_leads add column if not exists buy_signal_at timestamptz;
create index if not exists wa_leads_buy_signal_idx on wa_leads (buy_signal_at) where buy_signal_at is not null;

notify pgrst, 'reload schema';
