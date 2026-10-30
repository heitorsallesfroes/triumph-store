# Extensão "Mensagens" (Triumph Store)

Esta extensão do Google Chrome mostra, **dentro do WhatsApp Web**, um painel com
as mensagens, áudios, imagens, vídeos e documentos cadastrados na aba
**WhatsApp** do ERP.

Ela **nunca envia nada sozinha**: só coloca o texto na caixa de mensagem ou
abre a prévia do anexo. Quem confere e aperta Enter (ou o botão de enviar) é
sempre você.

Versão atual: **1.1.0**

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
   rodapé (por exemplo, `v1.1.0`).

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
  - **Áudio:** por enquanto vai como **arquivo de áudio** (não como mensagem
    de voz gravada).
  - Se nenhuma conversa estiver aberta, aparece o aviso **"Abra uma conversa"**.
- Cada uso soma 1 no contador "Mais usadas" do ERP.
- No rodapé aparecem o último item usado e a versão da extensão.

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

- `manifest.json`: configuração da extensão (Manifest V3). Acesso só a
  `web.whatsapp.com` e ao domínio do Supabase.
- `config.js`: URL e anon key do Supabase (os mesmos valores do `.env` do ERP;
  a anon key é pública por design).
- `background.js` e `supabase-api.js`: buscam os dados e os arquivos no
  Supabase. Só leitura, exceto `usage_count`.
- `content.js`: o painel (em Shadow DOM), o cache em `chrome.storage.local`
  (`library`, `collapsed`, `lastUsed`, `themePref`) e a integração com o
  WhatsApp Web (seletores com alternativas na constante `SEL`).
- Não precisa de build: o Chrome carrega os arquivos como estão.
