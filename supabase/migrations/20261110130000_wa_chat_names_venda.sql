-- ============================================================================
-- Extensão 2.13.3: nome da conversa a partir da venda (wa_chat_names.source = 'venda')
-- ============================================================================
-- Ao registrar a venda pelo 💰, ou ao ligar uma venda do ERP à conversa (📈 ou sozinha pelo telefone), a
-- extensão grava o PRIMEIRO nome do cliente da venda com a origem 'venda'. Ordem do {nome}:
-- definido à mão → da venda → aprendido da sua mensagem → vazio. O definido à mão nunca é trocado.
-- Só amplia a lista de origens permitidas. Sem esta migration a venda funciona igual (o nome só não é gravado).
-- Pode rodar mais de uma vez sem erro.
-- ============================================================================

alter table wa_chat_names drop constraint if exists wa_chat_names_source_check;
alter table wa_chat_names add constraint wa_chat_names_source_check check (source in ('manual', 'aprendido', 'venda'));
