# Instagram — FASE 1: métricas profissionais, SÓ LEITURA

Aba **Instagram** (menu Canais de vendas, abaixo de WhatsApp; `?pagina=instagram`). Conta @store_triumph
(`17841442995645189`). Nada é publicado, respondido ou alterado no Instagram/Facebook e nada grava no ERP (sem migration).

## De onde vêm os números
Edge function **`instagram`** (`supabase/functions/instagram/`; lógica em `ig.ts`). Só GET na Graph API **v25.0**
(a mesma do `ad-manager`), com o login do ERP obrigatório (JWT da sessão; a chave anon sozinha é recusada).
O token fica no secret `IG_ACCESS_TOKEN` e nunca volta para o navegador. `IG_USER_ID` é opcional.

| action | o que devolve |
|---|---|
| `account` part `top` | perfil + reach, views, accounts_engaged, total_interactions, profile_views, website_clicks/profile_links_taps e follows_and_unfollows (período e anterior) |
| `account` part `daily` | por dia (até 30 dias) ou por semana (90 dias): ganhos, perdidos, alcance, visualizações |
| `account` part `audience` | follower_demographics por cidade, idade e gênero |
| `media` | posts/reels/carrosséis do período com os insights de cada um |
| `media_detail` | um conteúdo da conta, com todas as métricas |

- Métrica que a Meta recusar (ex.: `impressions`, trocada por `views` em 2025) é **pulada** e aparece em
  "Avisos da Meta". A função não pede `impressions`.
- A Meta não aceita intervalos de mais de 30 dias: 90 dias = soma de 3 janelas (alcance e contas com engajamento
  podem contar a mesma pessoa mais de uma vez; a página avisa).
- Cache de 10 min por período; **Atualizar** busca de novo. O topo carrega primeiro.

## Regras de "O que funciona" (`src/lib/igInsights.ts`, com "Por quê" em cada cartão)
- **Taxa de engajamento** = (curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance.
- **Melhor formato**: maior alcance médio por post (Reel, Carrossel, Foto); só formatos com 2+ posts disputam.
- **Melhores dias/horários**: alcance médio dos posts publicados em cada dia da semana e faixa (madrugada, manhã,
  tarde, noite — horário de São Paulo); só faixas com 2+ posts.
- **Top 3**: mais seguidores gerados e mais salvamentos.
- **Frequência × alcance**: com 3+ semanas, semanas acima da mediana de posts × as demais; com menos, dias com post ×
  dias sem post (alcance diário da conta).

**Simples**: topo, gráfico, ranking (12) e "O que funciona". **Completo**: + tabelas, ranking inteiro e Público.

## Publicar a função (uma vez)
`supabase functions deploy instagram` (ou pelo painel). Sem ela a página avisa "precisa ser publicada".

## Testes (nunca chamam a Meta de verdade)
- `node scripts/tests/igInsights.test.ts`: regras + a função com a Graph API simulada.
- `node scripts/tests/igChrome.test.ts`: a página no Chrome real, com a função de verdade e a Graph SIMULADA.
