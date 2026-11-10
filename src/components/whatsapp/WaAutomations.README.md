# ⚡ Automações do WhatsApp (ERP → WhatsApp → ⚡ Automações)

Tela **só de consulta**: cada automação da extensão, cada etapa e quem está em cada etapa agora. Para editar, use a
extensão no WhatsApp Web.

## O que mostra
- **Lista**: um card por automação com o selo LIGADA / DESLIGADA / RASCUNHO, como começa, "Vale desde", o horário
  resumido ("Seg–Sex 9h–18h · Sáb 9h–14h"), 4 números (Em andamento agora · Responderam ✅ · Chegaram ao fim sem
  responder · Saíram por outro motivo) e a barrinha de quantos estão em cada etapa. Filtros Todas / Ligadas /
  Desligadas e busca pelo nome.
- **Detalhe** (clicar no card):
  - **Etapas**: linha do tempo do caminho "se não responder", com os ícones e as cores do construtor da extensão
    (❓ roxo, ✉ azul com a prévia da mensagem, 🏷 laranja, ⏳ cinza, ⏹ preto), o ✅ "Se responder: …" ao lado de cada ❓
    e "👥 N pessoas aqui agora" (clicar abre a lista).
  - **Pessoas**: todos em andamento: nome, telefone mascarado (21 9****-1234), etapa, entrou em / há quanto tempo e o
    próximo passo com data e hora prevista ("hoje" em destaque, atrasado em vermelho). Ordenar, filtrar por etapa e buscar.
    Quem teve o **"Pular espera"** clicado no painel da conversa da extensão (`skip_wait` no percurso) leva o selo
    **"⏩ pulou a espera"** (também na lista do 👥 da etapa e no "Agora:" da linha do tempo).
  - **Histórico**: últimos 200 encerrados (7, 30 ou 90 dias) com o motivo traduzido e "responderam depois de cada mensagem".
  - **Envios**: o registro de envios da automação (enviado / pulado / erro com o motivo).
- **Linha do tempo da pessoa** (painel lateral): o que já aconteceu (✓ com a hora real, do registro de envios e do
  percurso) e o que está previsto (cinza, supondo que a pessoa não responde), com "Abrir no WhatsApp".
- **Buscar pessoa** (topo): em quais automações a pessoa está ou esteve, a etapa atual e o próximo envio.
- Atualiza sozinha a cada 60 s (só com a aba visível, sem piscar) e no botão "Atualizar".

## Como funciona
- `src/lib/waAutomations.ts`: textos e contas, **portados** do `extension/engine.js` (seqIndex, seqNodeLabel,
  sinceEntryText, seqSimulate, seqSendSteps, seqDescribe, horário da automação e da etapa). Horas sempre no horário de
  São Paulo. As previsões usam o horário da automação; quem segue o "horário geral" usa o padrão da extensão
  (seg–sáb 9h–19h), porque o horário geral fica fora das tabelas que esta tela lê.
- `src/lib/waAutomationsDb.ts`: **só SELECT** em wa_automations, wa_sequence_runs, wa_contacts, wa_labels, wa_items,
  wa_send_log e wa_leads (telefone de conversas @lid), em páginas de no máximo 500 linhas e sempre com filtro. Se uma
  leitura falha, só aquela parte mostra o aviso.
- As etiquetas do WhatsApp aparecem pelo número ("etiqueta do WhatsApp nº 1"): o nome delas fica só no WhatsApp.

## Testes
- `node scripts/tests/waAutomations.test.ts`: a lógica portada com a régua real (3 h, dia 1, 3, 7, 15, 25, 30).
- `node scripts/tests/waAutomationsChrome.test.ts`: a tela no Chrome real com dados de teste (inclusive celular).
- `REAL=1 node scripts/tests/waAutomationsChrome.test.ts` e `node scripts/tests/waAutomationsReal.test.ts`: com os
  dados reais, somente leitura (só GET/HEAD; o teste falha se houver qualquer escrita).
