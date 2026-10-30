# Extensão "Mensagens" (Triumph Store)

Esta extensão do Google Chrome mostra, **dentro do WhatsApp Web**, um painel com
as mensagens, áudios, imagens, vídeos e documentos cadastrados na aba
**WhatsApp** do ERP.

Ela **nunca envia nada sozinha**: só coloca o texto na caixa de mensagem ou
abre a prévia do anexo. Quem confere e aperta Enter (ou o botão de enviar) é
sempre você.

Também permite marcar **etiquetas** (criadas no ERP) na conversa aberta.

Versão atual: **1.6.0** (precisa do **Google Chrome 111 ou mais novo**)

---

## Como instalar (só uma vez)

1. Abra o Google Chrome.
2. Na barra de endereço, digite `chrome://extensions` e aperte Enter.
3. No canto superior direito, ligue a chave **Modo do desenvolvedor**.
4. Clique no botão **Carregar sem compactação** (aparece no canto superior esquerdo).
5. Escolha a pasta **`extension`**, que fica dentro da pasta do projeto
   (`triumph-store\extension`), e clique em **Selecionar pasta**.
6. Pronto: a extensão "Triumph Store - Biblioteca WhatsApp" aparece na lista.
7. Abra (ou recarregue com **F5**) o site `https://web.whatsapp.com`.

> Dica: não apague nem mova a pasta `extension` depois de instalar. O Chrome lê
> os arquivos direto dela.

---

## Como atualizar depois de um `git pull`

1. Baixe as novidades do projeto (`git pull`), como de costume.
2. Abra `chrome://extensions`.
3. No cartão da extensão "Triumph Store - Biblioteca WhatsApp", clique no
   ícone de **recarregar** (seta circular).
4. Volte para a aba do WhatsApp Web e aperte **F5** para recarregar a página.
5. Para conferir a versão: abra o painel e veja o número no canto direito do
   rodapé (por exemplo, `v1.4.0`).

Se o painel mostrar "A extensão foi atualizada. Recarregue o WhatsApp (F5).",
é só fazer o passo 4.

---

## Como usar

- No WhatsApp Web, aparece um **botãozinho laranja com um raio** no meio do
  topo da tela. Clique nele para abrir ou fechar o painel. A tecla **Esc**
  também fecha (quando o cursor está no painel).
- O painel abre na direita e o WhatsApp encolhe para a esquerda, sem cobrir a
  conversa.
- **Botões do cabeçalho**, da esquerda para a direita:
  - **Atualizar** (setas circulares): busca as mensagens de novo no ERP.
  - **Tema** (monitor, sol ou lua): troca entre automático (igual ao
    WhatsApp), claro e escuro. A escolha fica salva.
  - **Diagnóstico** (linha de batimento): mostra o que está funcionando.
  - **Fechar** (X).
- **Linha de status:** em verde, "Conversa: nome do contato" quando há uma
  conversa aberta; em amarelo, "Abra uma conversa para enviar".
- **Busca:** digite parte do título em "Pesquisar resposta rápida".
- **Filtros:** Tudo, Mais usadas, Texto, Áudio, Imagem, Vídeo e Documento.
- **Categorias:** cada uma tem uma cor. Clique no nome para recolher ou abrir.
  O número ao lado é a quantidade de itens.
- **Olho:** mostra a prévia. Para texto, mostra como a mensagem vai ficar, já
  com `{nome}` trocado pelo nome do contato aberto. Variáveis que não são
  trocadas sozinhas (como `{produto}` e `{rastreio}`) aparecem em laranja.
- **Seta:** coloca o item na conversa que está aberta:
  - **Texto:** vai para a caixa de mensagem. `{nome}` vira o primeiro nome do
    contato (se o contato estiver salvo só como número, `{nome}` fica como
    está). `{produto}` e `{rastreio}` ficam como estão, então troque à mão
    antes de enviar.
  - **Imagem, vídeo e documento:** o arquivo é anexado e a legenda já vem
    preenchida. Confira e envie.
  - **Áudio:** vai como **mensagem de voz gravada na hora** (veja abaixo).
    O botão **Como arquivo**, no cartão do áudio, anexa como arquivo de
    áudio, do jeito antigo.
  - Se nenhuma conversa estiver aberta, aparece o aviso **"Abra uma conversa"**.
- Cada uso soma 1 no contador "Mais usadas" do ERP.
- No rodapé aparecem o último item usado e a versão da extensão.

### Áudio como mensagem de voz

Ao clicar na **seta** de um áudio, ele chega para o cliente como uma
**mensagem de voz** (com microfone e ondas), e o cliente vê "gravando
áudio…" antes. A extensão tenta três caminhos, nesta ordem:

**1. Rápido (biblioteca WA-JS).** Vale quando o áudio está em **Ogg/Opus**
(o formato dos áudios do próprio WhatsApp) e a conversa aberta é
**individual**.
1. O cliente vê "gravando áudio…" por alguns segundos (o tempo do áudio, entre
   2 e 8 s). O painel mostra "Gravando áudio… 00:03 / 00:08" e um botão
   **Cancelar**.
2. Em seguida o áudio é **enviado** como mensagem de voz, e aparece "Áudio
   enviado como mensagem de voz (rápido)." Neste caminho o envio é feito pela
   extensão, porque você clicou na seta; nada é enviado sem esse clique.
3. **Cancelar** (ou trocar de conversa) só funciona enquanto aparece "gravando
   áudio…". Depois que o envio começou, não dá mais para cancelar.
4. Em grupo, ou sem conversa aberta, aparece "Abra uma conversa individual" e
   nada é enviado.
5. Se aparecer "Não consegui confirmar o envio. Confira a conversa antes de
   tentar de novo.", **olhe a conversa antes de clicar de novo**: o áudio pode
   ter ido. Por isso a extensão não tenta outro caminho nesse caso.

**2. Plano B: gravação simulada (mais lenta).** Usado quando o áudio não é
Ogg/Opus, ou quando a biblioteca não está pronta.
1. A caixa de mensagem precisa estar **vazia** (o botão de gravar do WhatsApp
   só aparece assim). Se tiver texto, o painel avisa "Apague o texto da caixa
   para enviar o áudio" e não apaga nada.
2. A extensão aperta o botão de gravar do WhatsApp e, no lugar do seu
   microfone, entrega o áudio da biblioteca. **Nada toca no seu computador** e
   o seu microfone de verdade não é usado.
3. O painel mostra "Gravando áudio… 00:12 / 00:35" e um botão **Cancelar**
   (que para e descarta a gravação). Se você trocar de conversa no meio, a
   gravação é cancelada.
4. Quando o áudio acaba, a extensão **pausa** a gravação e mostra "Pronto!
   Confira e aperte enviar no WhatsApp (gravação simulada, mais lenta)."
5. **Você** aperta o botão de enviar do WhatsApp.

**3. Plano C: como arquivo.** Se nenhum dos dois funcionar, o áudio é anexado
como arquivo (com o aviso "Enviei como arquivo de áudio (gravação não
disponível)"), para você conferir e enviar. O botão **Como arquivo** no
cartão faz isso direto.

Dica: para usar sempre o caminho rápido, cadastre os áudios em **Ogg/Opus**
(arquivo `.ogg` ou `.opus`).

**Tempo de "gravando áudio…" por áudio:** no ERP, no cadastro do áudio, o
campo "Tempo de 'gravando áudio…' (segundos)" define quanto tempo o cliente vê
"gravando áudio…" no caminho rápido: **vazio** = automático (tamanho do áudio,
entre 2 e 8 s); **0** = envia na hora, sem "gravando…" (e sem Cancelar);
**1 a 60** = esse número de segundos. A gravação simulada (plano B) não usa
esse campo. Passe o mouse na seta do áudio para ver o tempo configurado.

Se não gravar:
- O painel avisa "Enviei como arquivo de áudio (gravação não disponível)" e
  anexa o áudio como arquivo, para você conferir e enviar.
- Se aparecer "Terminou. Aperte enviar agora", a extensão não achou o botão
  de pausar: é só apertar enviar.
- Rode o **Diagnóstico**:
  - caminho rápido: "Biblioteca WA-JS carregada", "WhatsApp pronto para a
    biblioteca" e "Conversa aberta" precisam estar ✓ (e a conversa,
    "individual");
  - plano B: "Ponte do microfone carregada" e "Botão de gravar encontrado";
  - se algo aparecer como "não", confira se o Chrome é 111 ou mais novo e
    recarregue o WhatsApp com **F5**.
- Se continuar falhando, clique em **Copiar diagnóstico** e mande o texto
  (ele não tem nomes, telefones nem mensagens), dizendo também o formato do
  áudio (`.ogg`, `.mp3`…) e se a conversa era individual ou grupo.
- Se o WhatsApp pedir permissão de microfone, permita (a extensão não usa o
  microfone de verdade, mas o WhatsApp só grava com a permissão dada).
- Você sempre pode usar **Como arquivo**.

### Etiquetas

1. No ERP, abra **WhatsApp → Etiquetas** e crie as etiquetas (nome e cor).
   Se ainda não houver nenhuma, o botão **Criar etiquetas sugeridas** cria
   Novo lead, Orçamento enviado, Negociando, Aguardando pagamento, Venda
   fechada e Cliente antigo.
2. No WhatsApp Web, abra a conversa do cliente e o painel.
3. Abaixo de "Conversa: …" fica a linha **Etiquetas**. Clique no **+** e
   marque ou desmarque as etiquetas (o ✓ mostra as aplicadas). Salva na hora.
4. No ERP, em **WhatsApp → Etiquetas → Clientes etiquetados**, aparecem os
   clientes marcados, com busca por nome ou telefone e filtro por etiqueta.

#### Aba "Etiquetas" do painel

No topo do painel há duas abas: **Mensagens** (as respostas rápidas, como
antes) e **Etiquetas**. O painel lembra qual aba estava aberta.

Na aba **Etiquetas**:
- **Esta conversa:** o nome da conversa aberta e todas as etiquetas. Clique
  numa etiqueta para marcar ou desmarcar: a marcada fica com a cor cheia e
  um ✓; a não marcada fica só com o contorno. Sem conversa aberta, ou num
  grupo, as etiquetas ficam desativadas.
- **Todas as etiquetas:** na mesma ordem do ERP, cada uma com o número de
  clientes. Clique numa etiqueta para ver os clientes dela (os mais recentes
  primeiro; "Ver mais" mostra mais 50). Use "Buscar cliente" para achar por
  nome ou telefone dentro da etiqueta aberta.
- **Clique num cliente** para colocar o telefone (ou o nome, se não houver
  telefone) na busca de conversas do WhatsApp. A extensão **não abre** a
  conversa: clique você no resultado que aparecer na lista da esquerda. Se a
  busca do WhatsApp não for encontrada, o painel mostra o nome e o telefone
  para você procurar à mão.
- Os números se atualizam ao abrir a aba, depois de marcar ou desmarcar e a
  cada minuto enquanto a aba estiver aberta.

Como a extensão reconhece o cliente:
- Pelo **telefone** da conversa, sempre que o WhatsApp Web mostra o número.
- Se o número não aparece, pelo **nome** do contato. Nesse caso o painel
  avisa "identificado só pelo nome" e, no ERP, o cliente aparece com esse
  aviso. Quando o telefone aparecer depois, a extensão passa a usar o
  telefone e mantém as etiquetas.
- **Grupos** não recebem etiquetas.
- Só abrir uma conversa não grava nada: o cliente só é salvo (nome e
  telefone, nunca mensagens) quando você marca a primeira etiqueta.
- Se a etiqueta não salvar (sem internet, por exemplo), ela some do painel e
  aparece o aviso "Não consegui salvar". É só tentar de novo.

### Barra de etiquetas e Quadro (WhatsApp Business)

Se a sua conta é **WhatsApp Business** e tem etiquetas (por exemplo
"Cliente", "Motoboy"), aparece uma **barra fina no topo** do WhatsApp Web:

- À esquerda, "ETIQUETAS" e um botão para cada etiqueta, com a cor e o número
  de conversas. Etiqueta com 0 fica mais apagada. Se tiver muitas, role para o
  lado.
- Clique numa etiqueta (ou em **Quadro**, à direita) para abrir o **Quadro**:
  colunas por etiqueta, com um cartão por conversa (nome, última mensagem,
  data e não lidas). **Clique num cartão** (ou aperte Enter) para abrir a
  conversa no WhatsApp. **Colunas** escolhe até 6 etiquetas; **Esc** ou
  **Fechar** fecha o Quadro.
- **Só leitura:** a barra e o Quadro **não mudam etiquetas, não enviam nada e
  não gravam nada** no ERP. Nomes, números e prévias ficam só na memória
  enquanto o Quadro está aberto.
- **O número da etiqueta** é o do WhatsApp e pode incluir conversas que o
  WhatsApp Web ainda não carregou. Por isso o Quadro pode mostrar menos
  cartões que o número; nesse caso aparece "Mostrando N conversas carregadas
  no WhatsApp Web agora." Conversas arquivadas não entram.
- **Ocultar a barra:** clique no **×** da barra ou no botão de etiqueta (🏷) no
  cabeçalho do painel. O mesmo botão mostra de novo. A escolha fica salva.
- Se a conta não tem etiquetas, ou a biblioteca WA-JS não estiver pronta, a
  barra simplesmente não aparece (e não ocupa espaço).

### Privacidade da biblioteca WA-JS

A biblioteca WA-JS (código aberto, licença Apache-2.0) vem, por padrão,
com estatísticas para o Google Analytics e com servidores de terceiros para
prévia de links. Na extensão **as duas coisas ficam desligadas** antes de ela
carregar. O Diagnóstico mostra "Telemetria e servidores de terceiros da
biblioteca desligados: sim". A biblioteca só recebe o áudio como arquivo
(nunca um link) e a extensão não registra telefones, conversas nem mensagens.

### Sem internet ou com o ERP fora do ar

A extensão guarda a última lista de mensagens no próprio Chrome. Ao abrir o
painel, ela aparece na hora e é atualizada em segundo plano (e de novo a cada
5 minutos com o painel aberto). Se a atualização falhar, aparece a faixa
**"Sem conexão: mostrando a última versão"** e você continua usando a lista
guardada.

### Algo não funciona? Use o Diagnóstico

1. Abra uma conversa qualquer (de preferência a sua, não a de um cliente).
2. Abra o painel e clique no botão **Diagnóstico**.
3. Cada linha mostra um ✓ verde (funcionando), ⚠ amarelo (atenção) ou ✗
   vermelho (com problema).
4. Clique em **Copiar diagnóstico** e cole o texto para quem cuida do sistema.
   O texto copiado **não leva** nomes de contatos nem mensagens.

---

## O que mudou

### 1.6.0
- **Barra de etiquetas** no topo do WhatsApp Web, com as etiquetas nativas do
  WhatsApp Business e o número de conversas de cada uma.
- **Quadro** com colunas por etiqueta e cartões que abrem a conversa.
- Botão no cabeçalho do painel para mostrar/ocultar a barra.
- Tudo **só leitura**: nada é alterado no WhatsApp nem gravado no ERP.
- Diagnóstico: quantidade de etiquetas do WhatsApp Business e a nova linha
  "Barra de etiquetas" (ativa / oculta por você / indisponível).

### 1.5.1
- Tempo de "gravando áudio…" configurável em cada áudio, no ERP (vazio =
  automático, 0 = na hora, 1 a 60 s). O aviso da seta mostra o tempo.

### 1.5.0
- Áudios em Ogg/Opus vão pelo **caminho rápido**: o cliente vê "gravando
  áudio…" por alguns segundos e o áudio é enviado na hora como mensagem de
  voz, usando a biblioteca aberta WA-JS (embutida em `vendor/`, versão 4.7.2).
- A gravação simulada da 1.4.0 virou o **plano B** e o anexo como arquivo, o
  **plano C**. O aviso diz qual caminho foi usado.
- Telemetria e servidores de terceiros da biblioteca **desligados**.
- Diagnóstico com 5 linhas novas: biblioteca carregada, WhatsApp pronto,
  telemetria desligada, tipo de conversa aberta e etiquetas do WhatsApp
  Business.

### 1.4.0
- Áudios vão como **mensagem de voz gravada na hora**: a extensão aperta
  gravar no WhatsApp, toca o áudio no lugar do microfone (sem som no
  computador) e pausa no fim. Você confere e aperta enviar.
- Quadro "Gravando áudio…" com tempo, barra e botão Cancelar; cancela sozinho
  se você trocar de conversa.
- Se a gravação não estiver disponível, anexa como arquivo e avisa.
- Botão "Como arquivo" no cartão de áudio (jeito antigo).
- Diagnóstico mostra "Ponte do microfone carregada" e "Botão de gravar
  encontrado".
- Precisa do Chrome 111 ou mais novo.

### 1.3.0
- Abas no topo do painel: "Mensagens" (igual a antes) e "Etiquetas". A aba
  aberta fica salva.
- Aba Etiquetas: marcar/desmarcar a conversa aberta com 1 clique, todas as
  etiquetas com o número de clientes, lista de clientes por etiqueta (mais
  recentes primeiro, "Ver mais" de 50 em 50) e busca por nome ou telefone.
- Clicar num cliente coloca o telefone ou o nome na busca do WhatsApp (sem
  abrir a conversa).
- Diagnóstico mostra se os contadores da aba Etiquetas carregaram.

### 1.2.0
- Etiquetas: linha "Etiquetas" no painel, com chips coloridos e o botão "+"
  para marcar ou desmarcar na conversa aberta.
- Reconhece o cliente pelo telefone (ou só pelo nome, com aviso) e não
  etiqueta grupos.
- As etiquetas ficam guardadas no Chrome junto com as mensagens e são
  atualizadas ao abrir o painel e a cada 5 minutos.
- Diagnóstico mostra a identificação da conversa e quantas etiquetas foram
  carregadas (o texto copiado continua sem nomes, telefones ou mensagens).

### 1.1.0
- Visual novo: título "Mensagens", linha de status da conversa, categorias
  coloridas que abrem e fecham com animação, cartões com subtítulo e prévia
  em formato de balão do WhatsApp.
- Botão de tema (automático, claro ou escuro), salvo no Chrome.
- Esqueleto de carregamento, mensagens claras quando a lista está vazia ou dá
  erro, botão "Tentar de novo".
- Lista guardada no Chrome: abre na hora, atualiza em segundo plano e a cada
  5 minutos, e funciona sem conexão com a última versão.
- Mais alternativas para achar a caixa de mensagem, o nome do contato e a
  legenda do anexo, e o painel volta sozinho se o WhatsApp recarregar a tela.
- Botão Diagnóstico com "Copiar diagnóstico".
- Tecla Esc fecha o painel; navegação por teclado com foco visível.

### 1.0.0
- Primeira versão: painel com busca, filtros, categorias, prévia e envio
  assistido (sem enviar sozinho).

---

## Limites conhecidos

- Arquivos acima de **40 MB** não são anexados pela extensão. Anexe esses à
  mão.
- O WhatsApp Web muda o próprio site de vez em quando. Se a seta parar de
  funcionar (por exemplo, o texto não aparece na caixa ou a legenda não é
  preenchida), rode o Diagnóstico e envie o texto copiado.

---

## Para quem mantém o código

### Arquitetura

```
WhatsApp Web (mundo da página, "world": "MAIN")
  mic-bridge.js ............ document_start: ponte do microfone (plano B)
  wa-before.js ............. document_idle: desliga telemetria/servidores, guarda WPP de outra extensão
  vendor/wppconnect-wa.js .. biblioteca WA-JS 4.7.2, sem alterações (ver vendor/README.md)
  wa-bridge.js ............. fala com a WA-JS (cópia privada do WPP)
        ▲  window.postMessage (dois protocolos separados:
        │  'tsp-wa-content'/'tsp-wa-bridge' e 'tsp-wajs-content'/'tsp-wajs-bridge')
        ▼
Mundo isolado da extensão
  content.js ............... painel; áudio: rápido (WA-JS) → plano B (microfone) → plano C (arquivo)
        ▲  chrome.runtime.sendMessage
        ▼
Service worker
  background.js + supabase-api.js .. Supabase (biblioteca, arquivos, etiquetas)
```

- Só o service worker acessa a rede (Supabase). `content.js`, `mic-bridge.js`,
  `wa-before.js` e `wa-bridge.js` não usam `fetch`, `XMLHttpRequest`,
  `WebSocket`, `sendBeacon`, `eval` nem `new Function`.
- Protocolo do `wa-bridge.js`: pedido `{ source: 'tsp-wajs-content', id,
  type, payload }`; resposta `{ source: 'tsp-wajs-bridge', id, type, ok, data
  | error: { code, message, stage } }`. Tipos: `status`, `activeChat`,
  `sendVoice { chatId, audio, recordMs }` (só `@c.us`/`@lid`;
  markIsRecording → espera → markIsPaused sempre → sendFileMessage com Blob
  `audio/ogg; codecs=opus`) e `cancel { id }`. Só leitura (1.6.0):
  `labels` (getAllLabels), `labelChats { labelId, offset, limit }`
  (chat.list com `withLabels`, sem arquivadas, ordenado por data, prévia só da
  mensagem já carregada) e `openChat { chatId }` (openChatBottom, só para
  conversas já carregadas). `stage: 'before-send'` = nada
  foi enviado (pode ir para o plano B); `'sending'` = o envio começou (não
  tentar de novo).
- Atualizar a WA-JS: ver `vendor/README.md` (npm pack fora do repositório,
  conferir SHA-256, trocar o arquivo sem alterar, rodar os testes).

### Arquivos

- `manifest.json`: configuração da extensão (Manifest V3). Acesso só a
  `web.whatsapp.com` e ao domínio do Supabase.
- `config.js`: URL e anon key do Supabase (os mesmos valores do `.env` do ERP;
  a anon key é pública por design).
- `background.js` e `supabase-api.js`: buscam os dados e os arquivos no
  Supabase. Só leitura, exceto `wa_items.usage_count` e as etiquetas
  (`wa_contacts` e `wa_contact_labels`).
- `mic-bridge.js`: roda no mundo da página (`"world": "MAIN"`,
  `document_start`; por isso o Chrome 111+). Envolve
  `navigator.mediaDevices.getUserMedia`: só quando o painel arma (via
  `postMessage`), o próximo pedido só de áudio recebe um stream Web Audio com
  o áudio da biblioteca (sem ligar no alto-falante). Desarma após usar, após
  erro ou após 10 s. Qualquer outro pedido vai direto para a função original.
  Não faz conexões de rede.
- `content.js`: o painel (em Shadow DOM), o cache em `chrome.storage.local`
  (`library`, `labels`, `collapsed`, `lastUsed`, `themePref`) e a integração
  com o WhatsApp Web (seletores com alternativas na constante `SEL`; a
  identificação da conversa fica em `identifyConversation`).
- Não precisa de build: o Chrome carrega os arquivos como estão.
