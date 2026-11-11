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

---

# FASE 2 — abas e RASTREIO de links até a venda

A página Instagram tem abas, como a página WhatsApp (`?pagina=instagram&aba=rastreio`; o F5 volta para a aba):
**Visão geral** (a FASE 1), **Rastreio** (nova) e **Direct** / **Automações** como "em breve" (desabilitadas).

## Gráfico diário: os dias "quase zerados"
Não é a junção dos blocos de 30 dias (ela só vale para os cartões do topo; o gráfico pede um total por dia). Erro
numa chamada viraria buraco no gráfico, não um valor baixo. Para conferir com a própria Meta:
- o **alcance** de cada dia agora vem da **série diária da Meta** (`metric_type=time_series`, já nos dias da Meta);
  se a Meta não aceitar, volta ao total de cada dia;
- abaixo do gráfico aparece **"Conferência com a Meta: soma dos dias × total do período"** (visualizações, que
  somam). ✓ = bate: os dias baixos são dado real. ⚠ = não bate: está faltando dia na Meta.

## Links rastreáveis — `https://triumph-store.vercel.app/l/<apelido>`
1. O cliente toca no link (bio, stories, resposta do ManyChat…). A página `/l/` (`public/l/index.html`, pequena,
   sem login e sem o app do ERP; `vercel.json` manda `/l/<apelido>` para ela) chama a edge function **`ig-link`**.
2. `ig-link` (pública, chave anon) acha o link **ativo**, registra o clique em `ig_link_clicks` (hora, aparelho e
   navegador resumidos; o IP **não** é guardado, só um HMAC; o mesmo IP no mesmo link em 30 s conta 1 vez) e
   devolve o WhatsApp da loja `wa.me/5521980921808` com **"Olá! Vim pelo Instagram 😊 [IG-BIO]"**.
   Link desligado/inexistente ou função fora do ar (3 s): abre o WhatsApp sem o código.
3. Na extensão **2.18.0**, a 1ª mensagem de um lead novo com `[IG-...]` grava a conversa em `ig_link_leads`
   (só o código; o texto nunca é guardado e a mensagem não é alterada).
4. No ERP, a conversa vira **"Instagram (orgânico) · <canal> · <apelido>"** em WhatsApp → Rastreamento (cartão,
   gráfico, filtro, selo e CSV), separada de **Meta Ads** e **Não rastreada**. Anúncio vale primeiro.

## Aba Rastreio
- Período 7 / 14 / 30 / 90 dias: **Cliques → Conversas iniciadas → Vendas → Faturamento**, Clique→conversa,
  Conversa→venda, **Melhores links** (mais faturamento; empate: mais conversas, mais cliques), **Por canal** e
  **Últimos cliques**. Vendas = as do ERP ligadas à conversa (💰, 📈 ou telefone), depois do 1º contato.
- **Novo link / Editar**: apelido (vira o link), canal (Bio, Comentários/ManyChat, Stories, Reel/post específico,
  Destaques, Outro), post ligado (da lista de posts da Visão geral; obrigatório em "Reel/post"), mensagem e código
  (sugerido pelo apelido). Prévia do que o cliente manda. **Copiar link** e **QR code** (PNG/SVG, gerado no
  navegador, `src/lib/qr.ts`). Não apaga: "Desligar" (ativo).
- Grava SÓ em `ig_links`. Regras em `src/lib/igLinks.ts`.

## Publicar / aplicar (uma vez)
- Migration **`supabase/migrations/20261113120000_ig_links.sql`**: `ig_links`, `ig_link_clicks`,
  `ig_link_leads` (RLS igual às wa_*), com os links prontos **bio** (IG-BIO), **manychat-comentarios** (IG-COMENT)
  e **stories** (IG-STORIES). Idempotente, não mexe em nada que existe.
- Edge functions: **`ig-link`** (nova; precisa aceitar a chave anon, como as outras) e **`instagram`** (atualizada:
  série diária + conferência).
- Extensão 2.18.0 (recarregar em `chrome://extensions`).

## Testes (nada chama a Meta nem o WhatsApp de verdade)
- `node scripts/tests/igLinks.test.ts`: regras, função ig-link, origem no Rastreamento, QR (norma + leitura de volta).
- `node scripts/tests/igInsights.test.ts`: inclui a série diária e a conferência.
- `node scripts/tests/igTrackingChrome.test.ts`: Chrome real — abas, Rastreio, criar/editar/copiar/QR, `/l/bio`
  no celular dentro do Instagram até o WhatsApp simulado, e WhatsApp → Rastreamento.
- `node extension/tests/igcode.test.cjs`: código na 1ª mensagem (ponte, motor e gravação).
