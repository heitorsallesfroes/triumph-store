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
**Visão geral** (a FASE 1), **Rastreio** (nova) e **Direct** / **Automações** (liberadas na FASE 3, abaixo).

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

---

# FASE 3 — AUTOMAÇÕES (substituto do ManyChat) e DIRECT simples · TUDO NASCE DESLIGADO

O Instagram é a porta de entrada: responder sozinho e levar o lead para o WhatsApp (onde a venda fecha). Não é um CRM
do Instagram (sem etiquetas, quadro ou régua).

## Segurança (como fica ligado)
- **Chave geral** `system_config.ig_automations_enabled` (nasce `false`): desligada, o webhook **recebe e grava** tudo
  e **não envia nada** (nem resposta pública). Ligar pede confirmação.
- **Modo teste** `ig_test_mode` (nasce `true`): só as contas da lista `ig_test_accounts` (@ ou IGSID) recebem; as
  outras ficam no histórico como "pulado: modo teste". Desligar o modo teste também pede confirmação.
- **Antispam** `ig_dm_cooldown_hours` (24): no máximo 1 DM automática por pessoa a cada X horas, **somando todas as
  automações**, com trava atômica no Postgres (`ig_claim_dm`: dois eventos no mesmo segundo → só 1 passa). Se a Meta
  recusar o envio, a vez volta (`ig_release_dm`).
- O mesmo comentário/mensagem **nunca dispara 2 vezes** (`ig_automation_runs.source_id` único) e o que a Meta reenviar
  com o mesmo `mid`/`comment_id` é ignorado. **Eco** (`is_echo`, inclusive do ManyChat e de outros apps) e o que a
  própria conta escreve ficam gravados como "de mim" e **nunca** disparam.
- Janelas da Meta: DM privada a comentário até **7 dias** (1 por comentário); DM normal até **24 h** da última mensagem
  da pessoa. Fora da janela: não manda (o motivo fica no disparo).
- **Nenhum token no navegador**: o token de longa duração fica em `ig_account` (RLS sem política: só a service role das
  edge functions lê). Mensagens de erro saem sem o token.

## Conectar Instagram (Instagram API com Login do Instagram — graph.instagram.com)
Aba **Automações → Conectar Instagram** → Login oficial do Instagram (escopos `instagram_business_basic`,
`instagram_business_manage_messages`, `instagram_business_manage_comments`) → volta em
`…/functions/v1/ig-manage/oauth`, que troca o code pelo token de **longa duração (60 dias)**, guarda no servidor, assina
os campos do webhook e volta para o ERP (`?pagina=instagram&aba=automacoes&ig=conectado`).
- Tela: **"Conectado como @store_triumph · token válido até DD/MM"**, alerta vermelho se faltar < 7 dias ou se a
  renovação falhar, botão **Renovar agora**. Sem os segredos: a tela diz quais faltam e mostra o passo a passo.
- **Renovação**: `refresh_access_token` quando faltar < 20 dias — rotina diária do banco (migration
  `20261115130000_ig_token_cron.sql`, pg_cron + pg_net, chave interna `x-cron-key`) e também sozinha quando a tela ou o
  webhook usam a conta (no máximo 1 tentativa a cada 12 h).

## Webhook — edge function `ig-webhook` (pública)
- GET: verificação (`hub.mode`, `hub.verify_token` = `IG_WEBHOOK_VERIFY_TOKEN`, devolve `hub.challenge`).
- POST: confere `x-hub-signature-256` (HMAC-SHA256 do **corpo bruto** com `IG_APP_SECRET`). Inválida → **401**.
  Válida → **200 na hora** e o trabalho segue em segundo plano (erro interno vai para `ig_webhook_log`, que aparece em
  "Avisos do webhook" na aba Automações).
- Campos: `messages` (DMs, respostas e menções a story), `messaging_postbacks`, `comments`, `live_comments`.
- Grava `ig_messages` (mid único), `ig_comments` (id único) e `ig_conversations` (uma por IGSID; nome/@/foto por
  chamada separada, no máximo 1 vez por semana).

## Automações (aba **Automações**)
Cartões como no ManyChat: **Quando…** · **E o comentário possui…** · **Responder no comentário** · **Eles receberão
(DM)**, com ligar/desligar de cada uma (o selo mostra a chave geral e o modo teste) e as métricas do período (7/30/90
dias): disparos, DMs enviadas, cliques (com link /l/), conversas no WhatsApp, vendas, R$ e CTR (cliques ÷ DMs; com a
frase: conversas ÷ DMs).
- Gatilhos: comentário em qualquer post/reel ou em **posts escolhidos** (grade de miniaturas), com "qualquer palavra"
  ou palavras-chave (palavra inteira, sem diferença de acento/maiúscula); DM nova (1ª mensagem da pessoa);
  resposta/menção em story; palavra-chave em DM. Vale a 1ª automação ligada que bater (pela ordem).
- Ações: resposta pública no comentário (variações sorteadas, opcional) e DM (Private Reply ao comentário / DM na janela
  de 24 h) com texto (variações, `{nome}`) e **botão com link** (template de botão `web_url`; se a Meta recusar, vai o
  texto com o link).
- O link padrão é o **WhatsApp da loja com a FRASE da automação** (ex.: "Olá! Vi o comentário no Instagram e quero saber
  da promoção 🔥"). A extensão **2.18.2** reconhece a frase na 1ª mensagem do WhatsApp (só um resumo/hash sai da página,
  nunca o texto) e grava a conversa em `ig_link_leads` com o **código da automação** (ex.: IG-A-COMENT): assim o rastreio
  conversa → venda funciona. Ou escolha um **link rastreável /l/…** (conta cliques).
- Já vem **DESLIGADA** a automação **"Comentários → WhatsApp (cópia do ManyChat)"**: qualquer post/reel, qualquer palavra,
  as 3 respostas públicas do ManyChat e a DM com o botão "WhatsApp Loja". **Desligue a do ManyChat** antes de ligar esta,
  para não responder em dobro.
- Automação nova nasce desligada; ligar só com tudo preenchido.

## Direct (aba **Direct**)
Lista (mais recentes primeiro) com foto, @/nome, última mensagem, origem (comentário/story/DM) e **"✅ foi para o
WhatsApp"** (uma conversa do WhatsApp começou com a frase/código do link que mandamos para a pessoa, até 3 h depois) ou
**"⏳ ainda não foi"**. Filtro "Ainda não foi para o WhatsApp" com o contador. Abrir: histórico (DMs e comentários),
resposta de texto (só na janela de 24 h; fora dela avisa e desliga) e **"Mandar o WhatsApp"** (DM padrão `ig_direct_dm`
com o botão para a frase `ig_direct_phrase`, código IG-DIRECT).

## Visão geral
Cartão **"Funil Instagram → WhatsApp → venda"** do período: comentários e DMs recebidos → DMs automáticas → cliques →
conversas no WhatsApp → vendas → R$.

## Aplicar / publicar / cadastrar
1. Migrations: **`20261115120000_ig_automations.sql`** (tabelas, funções do antispam, chaves desligadas e a cópia do
   ManyChat) e depois **`20261115130000_ig_token_cron.sql`** (renovação diária; precisa da `ig-manage` publicada).
2. Edge functions, as duas com **Verify JWT desligado** (a pasta `_shared` vai junto):
   `supabase functions deploy ig-manage --no-verify-jwt` e `supabase functions deploy ig-webhook --no-verify-jwt`.
3. Segredos: **`IG_APP_ID`**, **`IG_APP_SECRET`** (do **produto Instagram** do app — não são os do app do Facebook) e
   **`IG_WEBHOOK_VERIFY_TOKEN`** (uma senha que você inventa). Opcional: `IG_ERP_URL`.
4. Extensão 2.18.2 (recarregar em `chrome://extensions`).

## Passo a passo no painel da Meta (developers.facebook.com)
1. **Meus apps** → abra o app (ou crie um do tipo Empresa) → **Adicionar produto: Instagram** → **API com Login do
   Instagram**.
2. **Instagram → Configuração da API com Login do Instagram**: copie o **ID do app do Instagram** (`IG_APP_ID`) e a
   **Chave secreta do app do Instagram** (`IG_APP_SECRET`) e cadastre no Supabase junto com o `IG_WEBHOOK_VERIFY_TOKEN`.
3. **Configurar o login da empresa do Instagram → URL de redirecionamento OAuth**:
   `https://jcnvlqfpmmejtzfhfjix.supabase.co/functions/v1/ig-manage/oauth`
4. **Configurar webhooks**: URL de retorno `https://jcnvlqfpmmejtzfhfjix.supabase.co/functions/v1/ig-webhook`, Token de
   verificação = `IG_WEBHOOK_VERIFY_TOKEN` → **Verificar e salvar** → assinar `messages`, `messaging_postbacks`,
   `comments` e `live_comments`.
5. No app do Instagram (celular): **Configurações → Mensagens e respostas aos stories → Ferramentas conectadas →
   Permitir acesso às mensagens**.
6. No ERP: **Instagram → Automações → Conectar Instagram** (entrar como @store_triumph).
7. Com o app em **modo de desenvolvimento**, só contas com função no app (testadores) recebem; para todos, peça na
   **Análise do app** o acesso avançado a `instagram_business_manage_messages` e `instagram_business_manage_comments` e
   publique o app.
8. Teste com a chave geral ligada **em modo teste** e a sua conta pessoal na lista; só depois desligue o modo teste.

## Testes (nunca chamam a Meta de verdade)
- `node scripts/tests/igAuto.test.ts`: servidor com a Meta SIMULADA e o banco em memória — assinatura válida/inválida,
  200 sempre, eco, duplicados (mid e comment_id), antispam concorrente, janelas de 24 h e 7 dias, chave geral desligada,
  modo teste, fallback do botão, erro da Meta, renovação do token, Conectar (OAuth), cron e Direct.
- `node scripts/tests/igAutoErp.test.ts`: contas da tela ("foi para o WhatsApp", métricas, funil, textos).
- `node scripts/tests/igAutoChrome.test.ts`: Chrome real — Automações, Direct, funil, celular, só grava o permitido.
- `node extension/tests/igphrase.test.cjs`: a frase na 1ª mensagem do WhatsApp (extensão 2.18.2).

---

# HISTÓRICO PRÓPRIO — stories e métricas (a Meta continua SÓ LEITURA)

Os insights de **story** somem 24 h depois e a Meta só devolve totais da conta em blocos de 30 dias. A edge function
**`instagram`** (a mesma, token `IG_ACCESS_TOKEN`, graph.facebook.com, **só GET**) ganhou duas ações que guardam o que
leem no banco — nada é publicado nem enviado:

| ação | quando | o que guarda |
|---|---|---|
| `collect_stories` | a cada 1 h | stories ativos (id, tipo, miniatura, link, hora) + insights: views, reach, replies, shares, total_interactions, follows, profile_visits e navigation (avanços, voltas, saídas, deslizes) → `ig_stories`. Cada hora atualiza a linha; fica a **última leitura antes de expirar**. |
| `collect_daily` | 1x por dia, de madrugada | o dia de **ontem** da conta (seguidores, alcance, views, contas engajadas, interações, visitas ao perfil, toques no link da bio, ganhos/perdidos) → `ig_daily_account`, completando os dias que faltarem dos últimos 30; posts/reels dos últimos 30 dias (views, reach, likes, comments, saved, shares, total_interactions) → `ig_daily_media` (uma foto por post por dia). |

- Métrica que a Meta recusar: **pulada** (a leitura anterior não é apagada) e registrada como aviso em `ig_collect_log`.
- Quem pode chamar: a rotina do banco (cabeçalho `x-cron-key` = chave aleatória guardada em `ig_collect_keys`, tabela
  só do servidor) ou um usuário logado no ERP (botão **Coletar agora** na aba Stories). **Nenhum segredo novo.**
- Lógica em `supabase/functions/instagram/collect.ts`; `index.ts` manda as ações `collect_*` para lá.

## Subaba **Stories**
Período 7/14/30/90 dias: números do período, **O que funciona** (melhor horário — média de views por hora, só horas
com 2+ stories; média de views por story; quantos stories por dia rendem mais — dias agrupados em 1 · 2–3 · 4–6 · 7+,
vence o grupo com 2+ dias e mais views por dia), **Melhores stories**, a **grade por dia** (miniatura, views, alcance,
respostas, compartilhamentos, avanços/voltas/saídas e a taxa de saída quando a Meta devolve, visitas ao perfil; selo
**parcial** quando a última leitura foi antes das 23 h do story no ar) e, se houver link rastreável do canal
**stories** (`ig_links`), **cliques → conversas → vendas por dia de story**. Regras em `src/lib/igInsights.ts`
(`storiesByDay`, `bestStories`, `storyWhatWorks`, `storyLinkByDay`).

## Visão geral
- Novos períodos **6 meses** e **12 meses**: cartões, gráfico (por semana) e conteúdos montados com o **histórico
  guardado** (até ontem). A função nunca é chamada com 180/365 dias (só o perfil, de 30 dias). Aviso: "… montado com o
  histórico guardado (dados guardados desde DD/MM/AAAA)"; alcance e contas engajadas = soma dos dias.
- Cartão **Seguidores ao longo do tempo** (todos os períodos) com **"Dados guardados desde DD/MM/AAAA"**: a foto de
  cada dia vem da coleta diária; os dias sem foto (completados depois) são refeitos pelos ganhos e perdas do dia seguinte.
- 7/14/30/90 dias continuam vindo da Meta, como antes.

## Aplicar / publicar / agendar
1. Migration **`supabase/migrations/20261116120000_ig_history.sql`** (ig_stories, ig_daily_account, ig_daily_media,
   ig_collect_log com RLS igual às wa_*; ig_collect_keys só do servidor, já com a chave aleatória).
2. Publicar a edge function **`instagram`** atualizada (`supabase functions deploy instagram`; as configurações dela
   não mudam).
3. Agendar: migration **`supabase/migrations/20261116130000_ig_history_cron.sql`** (pg_cron + pg_net). Passo a passo:
   - no Supabase → **Database → Extensions**, confira que **pg_cron** e **pg_net** estão disponíveis (a migration liga as
     duas; sem elas só avisa e nada quebra);
   - rode a migration no **SQL Editor** (pode rodar de novo: troca os agendamentos pelos mesmos);
   - confira em **Integrations → Cron** (ou `select jobname, schedule from cron.job;`): `ig-stories-hourly` (`7 * * * *`,
     a cada hora) e `ig-daily` (`40 6 * * *` = 03:40 de Brasília);
   - para ver as chamadas: `select status_code, content from net._http_response order by created desc limit 5;` e, no
     ERP, a linha **Última coleta** da aba Stories (ou a tabela `ig_collect_log`).
   - A chamada leva a chave anon do projeto (a pública do app, só para passar pelo "Verify JWT" do Supabase) e a
     `x-cron-key` (é ela que libera a coleta).
4. Logo depois de aplicar, clique em **Coletar agora** na aba Stories para não esperar a 1ª hora; a 1ª coleta diária
   já completa os últimos 30 dias da conta.

## Testes (nunca chamam a Meta de verdade)
- `node scripts/tests/igHistory.test.ts`: a coleta com a Graph SIMULADA — acesso (x-cron-key/login), stories com a
  navegação, última leitura que fica, métrica recusada que não apaga e vira aviso, foto do dia + dias que faltavam,
  erro grave sem o token.
- `node scripts/tests/igStories.test.ts`: as regras (stories por dia, ranking, o que funciona, link dos stories,
  totais/semanas do histórico, seguidores ao longo do tempo).
- `node scripts/tests/igHistoryChrome.test.ts`: Chrome real — aba Stories (inclusive "Coletar agora"), 6/12 meses,
  seguidores ao longo do tempo, sem a migration, celular, só GET na Meta, ERP sem gravar.
