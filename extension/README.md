# Extensão "Biblioteca WhatsApp" (Triumph Store)

Esta extensão do Google Chrome mostra, **dentro do WhatsApp Web**, um painel com
as mensagens, áudios, imagens, vídeos e documentos cadastrados na aba
**WhatsApp** do ERP.

Ela **nunca envia nada sozinha**: só coloca o texto na caixa de mensagem ou
abre a prévia do anexo. Quem confere e aperta Enter (ou o botão de enviar) é
sempre você.

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

## Como usar

- No WhatsApp Web, aparece um **botãozinho laranja com um raio** no meio do
  topo da tela. Clique nele para abrir ou fechar o painel.
- O painel abre na direita e o WhatsApp encolhe para a esquerda, sem cobrir a
  conversa.
- **Busca:** digite parte do título.
- **Filtros:** Tudo, Mais usadas, Texto, Áudio, Imagem, Vídeo e Documento.
- **Categorias:** clique no nome para recolher ou abrir. O número ao lado é a
  quantidade de itens.
- **Olho:** mostra a prévia (texto, imagem, vídeo ou player de áudio).
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
- No rodapé do painel aparece o último item usado.
- Cadastrou algo novo no ERP? Clique no botão de **atualizar** (setas
  circulares) no topo do painel.

---

## Como atualizar depois de um `git pull`

1. Baixe as novidades do projeto (`git pull`), como de costume.
2. Abra `chrome://extensions`.
3. No cartão da extensão "Triumph Store - Biblioteca WhatsApp", clique no
   ícone de **recarregar** (seta circular).
4. Volte para a aba do WhatsApp Web e aperte **F5** para recarregar a página.

Se o painel mostrar "A extensão foi atualizada. Recarregue o WhatsApp (F5).",
é só fazer o passo 4.

---

## Limites conhecidos

- Arquivos acima de **40 MB** não são anexados pela extensão. Anexe esses à
  mão.
- O WhatsApp Web muda o próprio site de vez em quando. Se a seta parar de
  funcionar (por exemplo, o texto não aparece na caixa ou a legenda não é
  preenchida), avise para ajustar a extensão.

---

## Para quem mantém o código

- `manifest.json`: configuração da extensão (Manifest V3). Acesso só a
  `web.whatsapp.com` e ao domínio do Supabase.
- `config.js`: URL e anon key do Supabase (os mesmos valores do `.env` do ERP;
  a anon key é pública por design).
- `background.js` e `supabase-api.js`: buscam os dados e os arquivos no
  Supabase. Só leitura, exceto `usage_count`.
- `content.js`: o painel (em Shadow DOM) e a integração com o WhatsApp Web.
- Não precisa de build: o Chrome carrega os arquivos como estão.
