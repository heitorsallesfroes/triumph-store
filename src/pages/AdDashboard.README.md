# Gerenciador de Anúncios (novo) — FASE 1, só leitura

Painel de decisão em **Gerenciador de Anúncios**. A página antiga continua em **Versão antiga**, no topo
(`?pagina=anuncios&aba=antiga`).

**Só leitura:** nenhum botão pausa, ativa ou muda orçamento, e nada grava nas tabelas do ERP. Não há migration.
A única gravação é a das suas metas, em `system_config`, chave `ads_goals`.

## De onde vêm os números
- **Meta**: edge function `ad-manager`, action nova `dashboard` (só GET na Meta; o token fica na função).
  - `part: "metrics"`: insights por anúncio da conta inteira, um por dia, mais alcance e frequência do período.
  - `part: "creatives"`: miniatura, vídeo, status e link de prévia.
- **Venda real**: a mesma ligação do Rastreamento (`src/lib/waTracking.ts`): conversa que começou pelo anúncio
  (`wa_leads` / `wa_ad_attribution`, pelo `ad_id`) → venda do ERP ligada à conversa (💰, 📈 ou telefone).
  Não contam vendas orgânicas nem vendas feitas antes do 1º contato.
- **Custo do produto**: `sales.total_cost − delivery_fee − delivery_cost`, igual ao Relatório mensal.
- **Imposto do anúncio**: `ad_tax_rate` (Configurações), aplicado sobre o gasto.

**Lucro real** = faturamento − produtos − (gasto + imposto).
**ROAS real** = faturamento ÷ (gasto + imposto).

## Regras (`src/lib/adInsights.ts`, todas visíveis em "Por quê?")
- **Faixas de ROAS real** (padrão, ajustáveis em Metas): acima de 7 é **ótimo** (verde forte); de 6 a 7, **bom**
  (verde); de 4 a 6, **ok** (amarelo); abaixo de 4, **ruim** (vermelho).
- **Acompanhar** (azul, sem julgamento): gasto abaixo de R$ 30, ou menos de 5 conversas sem venda.
- **Resolver agora** (vermelho): ROAS ruim.
- **Ajustar** (laranja): ROAS ok, ou custo por venda mais de 20% acima da meta, ou lucro por venda abaixo do mínimo,
  ou desgaste (CTR caiu 20% ou mais com a frequência subindo 10% ou mais).
- **Pode render mais** (verde): ROAS bom/ótimo dentro das metas.
- **Recomendação**:
  - perda maior no clique/conversa, ou desgaste → "Preparar criativo novo";
  - perda maior na resposta/venda → "Revisar oferta/atendimento";
  - Pode render mais → "Pode subir orçamento 20%".
- **Metas** (engrenagem): sem metas salvas, o custo por venda e o lucro por venda vêm sugeridos pela média dos
  últimos 30 dias.

**Modos:** **Simples** mostra o topo e os cartões. **Completo** acrescenta Conferir com a Meta, Mapa de horários e
Tempo até a venda.

**Cache:** 5 min por período. **Atualizar** busca de novo.

## Publicar a função (uma vez)
`supabase functions deploy ad-manager`

Sem isso, a página avisa e mostra só os números do ERP.

## Testes
- `node scripts/tests/adInsights.test.ts`: regras, com dados de exemplo.
- `node scripts/tests/adChrome.test.ts`: a página no Chrome real.
- `node scripts/tests/adInsightsReal.test.ts`: confere com os dados reais, só lendo (GET/HEAD).
