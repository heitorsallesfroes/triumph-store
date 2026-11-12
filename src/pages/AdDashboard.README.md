# Gerenciador de Anúncios (novo) — FASE 2: sem lucro, com ações na Meta

Painel de decisão em **Gerenciador de Anúncios**. A página antiga continua em **Versão antiga**, no topo
(`?pagina=anuncios&aba=antiga`).

Nada grava nas tabelas do ERP e não há migration. As únicas gravações são em `system_config`: as metas
(`ads_goals`) e o histórico de ações (`ads_actions_log`, chave nova). Na Meta, só pelas actions **já publicadas**
`toggle` e `update_budget` da edge function (a função não muda), e só depois do **Confirmar**.

## De onde vêm os números
- **Meta**: edge function `ad-manager`, action nova `dashboard` (só GET na Meta; o token fica na função).
  - `part: "metrics"`: insights por anúncio da conta inteira, um por dia, mais alcance e frequência do período.
  - `part: "creatives"`: miniatura, vídeo, status e link de prévia.
- **Venda real**: a mesma ligação do Rastreamento (`src/lib/waTracking.ts`): conversa que começou pelo anúncio
  (`wa_leads` / `wa_ad_attribution`, pelo `ad_id`) → venda do ERP ligada à conversa (💰, 📈 ou telefone).
  Não contam vendas orgânicas nem vendas feitas antes do 1º contato.
- **Imposto do anúncio**: `ad_tax_rate` (Configurações), aplicado sobre o gasto.

**Sem lucro (FASE 2):** o painel mostra Gasto, Faturamento, ROAS (geral / identificado / estimado), Custo por venda e
Custo por conversa. Categorias e cores usam só o ROAS e o custo por venda.
**ROAS real** = faturamento ÷ (gasto + imposto).

## Início do rastreio e vendas sem origem (10/11)
- **Início do rastreio** (12/11): a data do 1º lead de ANÚNCIO de verdade — `wa_leads` com `origin = anuncio` **e**
  `ad_id`. Não usa mais `wa_ad_attribution`: a varredura acha conversas antigas com anúncio (82 registros antes de
  06/11, o mais antigo de 19/08) e dava um início falso.
  Antes disso nenhuma venda tem anúncio. Se o período começa antes, o topo avisa ("O rastreio de anúncios começou
  em DD/MM…") com o botão **Usar desde DD/MM**. A página abre em **7 dias**, nunca antes do início do rastreio.
- **Três números no topo**:
  - **ROAS geral da loja** = faturamento de TODAS as vendas do ERP no período ÷ (gasto + imposto);
  - **ROAS identificado** = só as vendas ligadas com certeza a um anúncio ÷ (gasto + imposto);
  - **Vendas sem origem** = vendas de conversas de anúncio feitas antes do 1º contato (o que ainda é repartido);
  - linha **"Fora da repartição"** (12/11): **Orgânico / sem conversa** (venda ligada só a conversas do WhatsApp sem
    anúncio e sem Instagram, ou sem conversa nenhuma), **Instagram (orgânico)** e **Anúncio não identificado**
    (conversas de anúncio sem `ad_id`: o cartão continua, com as vendas ligadas a ele, mas não recebe parte da
    repartição, as conversas dele não contam no total e as vendas dele ficam fora do ROAS identificado).
- **Estimado** (padrão) × **Só identificado** (botão no topo):
  - no Estimado, as vendas sem origem (a partir do início do rastreio) são repartidas entre os anúncios na
    proporção das conversas que cada anúncio gerou no período (cartão: "3 vendas identificadas + 1,8 estimada");
  - anúncio sem conversa no período não recebe nada; vendas antes do início do rastreio não são repartidas;
  - **12/11: fora da repartição** — Instagram orgânico (`igOrganicSaleIds`), Orgânico / sem conversa
    (`organicSaleIds`) e Anúncio não identificado (`NO_AD_ID`); ligada a anúncio vale primeiro;
  - **datas** (12/11): toda conta usa o dia de `sale_date` (`saleTime`: a hora do `created_at` quando é do mesmo dia,
    senão meio-dia); "depois do 1º contato" = no mesmo dia ou depois (`afterContact`), para a venda lançada no dia
    seguinte com `sale_date` do dia da conversa não cair antes do contato;
  - ROAS, custo por venda, categorias e cores dos cartões seguem o modo escolhido;
  - no topo, o Estimado usa o faturamento de TODAS as vendas do período;
  - "Por quê?" mostra as vendas identificadas e a conta da estimada (conversas do anúncio ÷ total × vendas sem origem).
- **Conferir com a Meta**: compras que a Meta atribuiu (actions purchase do insight) × vendas identificadas ×
  vendas estimadas × compras enviadas pela CAPI.

## Regras (`src/lib/adInsights.ts`, todas visíveis em "Por quê?")
- **Faixas de ROAS real** (padrão, ajustáveis em Metas): acima de 7 é **ótimo** (verde forte); de 6 a 7, **bom**
  (verde); de 4 a 6, **ok** (amarelo); abaixo de 4, **ruim** (vermelho).
- **Acompanhar** (azul, sem julgamento): gasto abaixo de R$ 30, ou menos de 5 conversas sem venda.
- **Resolver agora** (vermelho): ROAS ruim.
- **Ajustar** (laranja): ROAS ok, ou custo por venda mais de 20% acima da meta, ou desgaste (CTR caiu 20% ou mais com a frequência subindo 10% ou mais).
- **Pode render mais** (verde): ROAS bom/ótimo dentro das metas.
- **Recomendação**:
  - perda maior no clique/conversa, ou desgaste → "Preparar criativo novo";
  - perda maior na resposta/venda → "Revisar oferta/atendimento";
  - Pode render mais → "Pode subir orçamento 20%".
- **Metas** (engrenagem): sem metas salvas, o custo por venda vem sugerido pela média dos últimos 30 dias.
  O "lucro mínimo" saiu (metas antigas com ele são lidas sem ele).

**Modos:** **Simples** mostra o topo e os cartões. **Completo** acrescenta Conferir com a Meta, Mapa de horários e
Tempo até a venda.

**Cache:** 5 min por período. **Atualizar** busca de novo.

## Ações na Meta (`src/lib/adActions.ts`)
- **No cartão**: Pausar/Ativar anúncio (`toggle`). Abaixo, "Orçamento da campanha: R$ X/dia (CBO)" ou "do
  conjunto" (`update_budget`), com −20%, −10%, +10%, +20% e **Definir valor**. Orçamento vitalício: só na Meta.
  O orçamento vem da leitura antiga da função (level `campaign`; sem orçamento na campanha, level `adset`).
- **Em massa**: caixinha em cada cartão e "Selecionar todos desta categoria". A barra no rodapé tem Pausar
  selecionados, Ativar selecionados e Orçamento −X% / +X% (de 1 a 50), aplicado nas campanhas/conjuntos donos dos
  anúncios, sem repetir a mesma campanha.
- **Confirmação sempre**: a janela mostra a lista exata ("Pausar 3 anúncios: A, B, C", "Campanha CBO VENDAS WPP:
  R$ 200/dia → R$ 240/dia"), o que fica de fora e por quê, e avisa quando o aumento passa de 20% de uma vez ("pode
  reiniciar o aprendizado da Meta"). Nada é enviado sem o clique em **Confirmar**.
- **Depois de enviar**: resultado item por item (✅ feito / ❌ erro com a mensagem da Meta), status e orçamento
  recarregados e histórico (quem, quando, o quê, antes → depois, resultado) em `ads_actions_log` (últimas 300). Aba
  **Histórico de ações**.
- **Proteções**: orçamento mínimo R$ 10/dia; no máximo +50% ou −50% por ação; nenhuma ação numa campanha que
  recebeu outra há menos de 1 minuto (dá certo ou não); botões desabilitados enquanto envia; um item por vez.

## Cartões: início do anúncio e dias rodando (12/11)
Cada cartão mostra **"Início DD/MM/AAAA · N dias rodando"**: o início é o mais tarde entre a criação do anúncio
(`created_time`) e o início do conjunto (`adset.start_time`), no dia de São Paulo; os dias contam desde o início,
inclusive o dia do início e os dias pausados. Sem essas datas (função `ad-manager` ainda não publicada de novo): "Entrega
desde DD/MM/AAAA · pelo menos N dias" (o 1º dia com gasto/impressão nos dados carregados). Regra: `adStartOf`.

## Publicar a função (uma vez)
`supabase functions deploy ad-manager` (12/11: de novo, para a data de início nos cartões — só leitura, campos novos
no pedido dos criativos)

Sem isso, a página avisa e mostra só os números do ERP.

## Testes
- `node scripts/tests/adInsights.test.ts`: regras, com dados de exemplo (inclui a repartição do modo Estimado).
- `node scripts/tests/adActions.test.ts`: novo orçamento, agrupamento por campanha, limites, 1 minuto, histórico.
- `node scripts/tests/adChrome.test.ts`: a página no Chrome real, com a Meta SIMULADA (nunca chama a Meta).
- `node scripts/tests/adInsightsReal.test.ts`: confere com os dados reais, só lendo (GET/HEAD).
- `node scripts/tests/adAttributionReal.test.ts` (12/11): revisão do modo Estimado e dos números do topo com os dados
  reais, só lendo — nenhuma venda contada duas vezes, identificadas + Instagram + sem origem = todas, a repartição
  soma o que foi repartido, ROAS, e avisos (início do rastreio, conversas sem ad_id, vendas de conversas orgânicas,
  fuso, anúncio diferente na mesma conversa).
