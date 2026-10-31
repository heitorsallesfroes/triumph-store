# Extensão "Mensagens" (Triumph Store)

Esta extensão do Google Chrome mostra, **dentro do WhatsApp Web**, um painel com
as mensagens, áudios, imagens, vídeos e documentos cadastrados na aba
**WhatsApp** do ERP.

Ela **nunca envia nada sozinha**: só coloca o texto na caixa de mensagem ou
abre a prévia do anexo. Quem confere e aperta Enter (ou o botão de enviar) é
sempre você.

No topo do painel fica um **menu de seções** (Mensagens, Etiquetas, Quadro…).
No topo do WhatsApp Web fica uma **barra** com as etiquetas. Existem dois tipos
de etiqueta, sempre com o nome junto:

- **Etiquetas do WhatsApp**: as nativas do WhatsApp Business. Ficam no
  WhatsApp (aparecem também no celular).
- **Etiquetas do CRM**: as nossas, guardadas no Supabase (tabelas
  `wa_labels`, `wa_contacts` e `wa_contact_labels`). Ficam só no nosso
  sistema e vão ser a base de follows e disparos no futuro.

Versão atual: **1.9.0** (precisa do **Google Chrome 111 ou mais novo**)

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
- **Seta:** **envia** o item na conversa individual que está aberta (1.9.0):
  - Cada parte sai na ordem, com a espera e o "digitando…" configurados (veja
    "Editor de mensagens" abaixo). `{nome}` vira o primeiro nome do contato
    (se o contato estiver salvo só como número, `{nome}` fica como está).
    `{produto}` e `{rastreio}` ficam como estão: para trocar à mão, use
    **Colocar na caixa** no menu **···** (só itens de 1 texto).
  - **Áudio de 1 parte** (cadastro antigo): continua indo como **mensagem de
    voz gravada na hora** (veja abaixo). O botão **Como arquivo**, no cartão do
    áudio, anexa como arquivo de áudio, do jeito antigo.
  - Enquanto envia, o rodapé do painel mostra, por exemplo, **"Enviando 2/5 ·
    aguardando 3s"** com o botão **Parar**. Parar interrompe antes da próxima
    parte.
  - Nunca envia para grupo nem para conversa que não esteja carregada no
    WhatsApp Web. Um envio por vez.
  - Se o WhatsApp não confirmar o envio de uma parte, a sequência **para** e
    aparece "Confira a conversa antes de tentar de novo". A extensão nunca
    reenvia sozinha.
  - Sem a biblioteca WA-JS pronta, itens de 1 parte voltam ao jeito antigo
    (texto na caixa, arquivo anexado para você conferir e enviar).
  - Se nenhuma conversa estiver aberta, aparece o aviso **"Abra uma conversa"**.
- Cada envio completo soma 1 no contador "Mais usadas" do ERP.
- No rodapé aparecem o último item usado e a versão da extensão.

### Editor de mensagens (no painel)

- **+ Nova** (ao lado da busca) abre o editor dentro do painel. No menu **···**
  de cada mensagem: **Editar**, **Duplicar**, **Colocar na caixa** (só texto),
  **Agendar nesta conversa** e **Excluir** (confirmação ali mesmo).
- No editor: **Título** (até 80 caracteres), **Categoria** (ou "Nova
  categoria…") e as **partes** (até 10). Cada parte tem:
  - tipo: Texto, Imagem, Vídeo, Áudio ou PDF;
  - texto (até 4096 caracteres, com contador) ou arquivo (Escolher/Trocar, com
    prévia e tamanho; imagem jpg/png/webp, vídeo mp4, áudio
    ogg/mp3/m4a/wav/webm, PDF; até 40 MB);
  - legenda (imagem, vídeo e PDF);
  - **esperar** (0 a 600 s antes desta parte) e **digitando** (0 a 60 s de
    "digitando…" antes de enviar; no áudio vira **gravando**);
  - ↑ ↓ para mudar a ordem e × para remover.
- Embaixo: **+ Adicionar** (Texto, Imagem, Vídeo, Áudio, PDF), o **tempo
  total**, e os botões **Salvar**, **Salvar e enviar** e **Cancelar**.
- Os arquivos vão para o mesmo lugar do ERP (bucket `wa-media` do Supabase).
- **Categorias:** no **···** do nome da categoria, **Renomear** ou **Excluir**
  (só categoria vazia; se tiver mensagens, aparece um aviso).
- Excluir uma mensagem apaga as partes dela. Os arquivos continuam guardados.
- No ERP, uma mensagem com várias partes aparece como a **parte 1** (o ERP ainda
  não mostra as outras). Se você editar essa mensagem no ERP, só a parte 1 muda
  lá; as outras partes continuam como estavam.
- Sem a migration `20261031130000_wa_item_parts.sql` aplicada, o editor
  funciona só com **1 parte** e mostra "Atualize o banco para usar este
  recurso" nas opções de várias partes, esperar e digitando.

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

### Menu do painel

Logo abaixo do cabeçalho do painel há uma fileira de botões, com ícone e nome:

- **Mensagens**: a biblioteca de mensagens (como antes).
- **Etiquetas**: as etiquetas do CRM, dentro do próprio painel (veja abaixo).
- **Quadro**: abre o Quadro grande. O painel continua na seção em que estava.
- **Agendados**, **Disparos** e **Follows**: desativados, com o selo "em
  breve" (passe o mouse: "Chega nas próximas versões").

A seção ativa fica destacada em laranja e o título do cabeçalho muda
("Mensagens" ou "Etiquetas CRM"). O painel lembra a última seção escolhida.
O **Diagnóstico** sempre abre na seção Mensagens.

### Barra do topo

Aparece sempre no topo do WhatsApp Web, só com as etiquetas:

- **WhatsApp | CRM**: escolhe quais etiquetas a barra e o Quadro mostram. A
  escolha fica salva.
- Depois vêm as etiquetas da família escolhida, com a cor, o nome e o número.
  Etiqueta com 0 fica mais apagada. Clique numa delas para abrir o Quadro com
  ela na primeira coluna. Se a família não tiver etiquetas, aparece "Nenhuma
  etiqueta do WhatsApp" ou "Nenhuma etiqueta do CRM".
- No modo CRM aparecem só as etiquetas não ocultas, na ordem da lista. Os
  números do CRM se atualizam a cada minuto (com a aba do WhatsApp visível) e
  logo depois de qualquer mudança feita pela extensão.
- **Ocultar a barra:** clique no **×** ou no botão de etiqueta (🏷) no
  cabeçalho do painel. O mesmo botão mostra de novo. A escolha fica salva.

Na seção Mensagens, a linha **Etiquetas CRM** abaixo de "Conversa: …"
continua lá: clique no **+** para marcar ou desmarcar as etiquetas do CRM na
conversa aberta.

### Seção "Etiquetas" do painel (Etiquetas CRM)

Abra o painel e clique em **Etiquetas** no menu. **Esc** fecha primeiro a
edição ou o formulário que estiver aberto; depois, fecha o painel. Tem três
partes:

**ESTA CONVERSA** (a conversa aberta no WhatsApp)
- **Etiquetas CRM:** clique numa etiqueta para marcar ou desmarcar. A marcada
  fica com a cor cheia e um ✓. Sem conversa aberta, ou num grupo, ficam
  desativadas.
- **Nota do contato (CRM):** escreva até 2000 caracteres (o contador mostra
  quanto falta). **Só grava quando você clica em "Salvar nota"**. Se você
  trocar de conversa sem salvar, o texto não salvo se perde. Salvar a nota
  cria o contato no CRM se ele ainda não existir (pelo telefone ou, sem
  telefone, pelo nome).
- **Etiquetas do WhatsApp nesta conversa** (separado, logo abaixo, só no
  WhatsApp Business): as etiquetas nativas, com marcar/desmarcar e
  **Desfazer**, como na 1.7.0. Só conversas individuais.

**TODAS AS ETIQUETAS CRM**
- A lista com cor, nome e número de contatos. Clique numa etiqueta para ver os
  contatos dela (os mais recentes primeiro; "Ver mais" mostra mais 50) e use
  "Buscar cliente" para achar por nome ou telefone. Clicar num cliente coloca o
  telefone (ou o nome) na busca do WhatsApp; clique você no resultado. A
  extensão **não abre** a conversa.
- **Exportar CSV** (com a etiqueta aberta): prepara o arquivo com todos os
  contatos da etiqueta (colunas nome e telefone, separadas por ";", em UTF-8,
  para abrir direto no Excel). Clique em **Baixar crm-<etiqueta>-<data>.csv**
  para salvar. O arquivo é montado no seu computador.
- **⋯** ao lado de cada etiqueta: **Renomear**, **Cor** (10 cores fixas),
  **Ocultar/Mostrar** (a oculta some da barra e do Quadro, mas continua na
  lista com o selo "oculta"), **↑/↓** e **Excluir**. Para mudar a ordem, você
  também pode arrastar pelo ⠿.
- **Excluir** pede confirmação ali mesmo: "Excluir 'X'? Os contatos continuam
  salvos; só a etiqueta e as marcações somem."
- **+ Nova etiqueta CRM:** nome (até 40 caracteres) e cor.
- Dica: "Sugestão de funil: Novo lead → Qualificação → Negociação → Proposta →
  Pós-venda. Comece com 3 a 6 etiquetas."

**COPIAR DO WHATSAPP** (só no WhatsApp Business)
- Escolha uma etiqueta do WhatsApp e a etiqueta CRM de destino (ou "Criar nova
  com o mesmo nome"). Clique em **Copiar contatos**.
- Antes, o aviso diz quantas conversas entram: "Só entram as conversas
  carregadas no WhatsApp Web agora (N de M)."
- Entram só conversas individuais. Com número (`@c.us`), o contato entra pelo
  telefone. Com id `@lid` (o WhatsApp esconde o número), entra pelo nome da
  conversa. Grupos e conversas sem nome ficam de fora. As mensagens nunca são
  lidas.
- Grava em lotes de 100, com barra de progresso e botão **Parar**. No fim
  aparece, por exemplo: "Copiados 225 (200 por telefone, 25 só pelo nome). Já
  estavam: 0. Fora: 5 (grupos/sem nome)."
- É uma **cópia única**: depois disso, a etiqueta do WhatsApp e a do CRM seguem
  independentes.

Como a extensão reconhece o cliente no CRM:
- Pelo **telefone** da conversa, sempre que o WhatsApp Web mostra o número.
- Se o número não aparece, pelo **nome** do contato. Nesse caso aparece o aviso
  "identificado só pelo nome". Quando o telefone aparecer depois, a extensão
  passa a usar o telefone e mantém as etiquetas CRM.
- **Grupos** não recebem etiquetas CRM.
- Só abrir uma conversa não grava nada. No CRM ficam só nome, telefone, as
  etiquetas CRM e a nota que você escrever. **Prévias de mensagens nunca vão
  para o Supabase.**
- Se uma etiqueta não salvar (sem internet, por exemplo), ela some e aparece o
  aviso "Não consegui salvar". É só tentar de novo.

#### Antes de usar: atualizar o banco (uma vez)

A 1.8.0 usa duas colunas novas no Supabase (`wa_labels.hidden` e
`wa_contacts.notes`), criadas pela migration
`supabase/migrations/20261031120000_crm_labels_hidden_and_notes.sql`.
Enquanto ela não for aplicada:
- nada fica oculto e a opção **Ocultar** fica desativada;
- a nota fica desativada, com o aviso "Nota disponível após atualizar o banco".

O resto funciona normalmente. O Diagnóstico mostra "Colunas novas do banco: ok"
ou "falta atualizar".

### Quadro (WhatsApp | CRM)

O mesmo seletor **WhatsApp | CRM** da barra fica no cabeçalho do Quadro.
**Colunas** escolhe até 6 etiquetas, lembradas separadamente para cada
família. **Esc** ou **Fechar** fecha o Quadro.

**Modo WhatsApp** (igual à 1.7.0):
- Uma coluna por etiqueta do WhatsApp, com um cartão por conversa (nome, última
  mensagem, data e não lidas). Clique num cartão (ou aperte Enter) para abrir a
  conversa.
- **Trocar a etiqueta:** arraste o cartão para outra coluna (ou use **Mover
  para…**). Enquanto salva, o cartão fica apagado. Deu certo: ele vai para o
  topo da outra coluna e aparece "Etiqueta trocada para X" com **Desfazer** (8
  segundos). Deu errado: o cartão fica onde estava e aparece "Não consegui
  trocar a etiqueta. Confira no WhatsApp."
- **O número da etiqueta** é o do WhatsApp e pode incluir conversas que o
  WhatsApp Web ainda não carregou ("Mostrando N conversas carregadas no WhatsApp
  Web agora."). Conversas arquivadas não entram.
- A extensão só troca etiquetas do WhatsApp quando você arrasta, clica ou aperta
  Desfazer, uma conversa por vez. Nunca cria, apaga, renomeia nem muda a cor
  delas.

**Modo CRM:**
- Uma coluna por etiqueta CRM (não oculta), com um cartão por contato: nome,
  telefone, data em que entrou na etiqueta e 📝 se tiver nota. 50 por vez, com
  "Mostrar mais".
- Arrastar (ou **Mover para…**) tira o contato da etiqueta CRM de origem e põe
  na de destino, com **Desfazer** (8 segundos). Se falhar, o cartão volta.
- Clicar num cartão abre a conversa se houver telefone e ela estiver carregada
  no WhatsApp Web. Se não estiver, aparece "Conversa não carregada no WhatsApp
  Web. Procure pelo nome: X".

Nomes, números e prévias ficam só na memória enquanto o Quadro está aberto.

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

### 1.9.0
- **Editor de mensagens no painel**: criar, editar, duplicar e excluir
  mensagens, e criar/renomear/excluir categorias, sem sair do WhatsApp.
- **Mensagens com várias partes** (até 10: texto, imagem, vídeo, áudio, PDF),
  com espera e "digitando…"/"gravando…" em cada parte.
- A **seta envia** a mensagem na conversa aberta, parte por parte, com
  "Enviando 2/5 · aguardando 3s" e **Parar** no rodapé. Itens de 1 texto ainda
  podem ir só para a caixa ("Colocar na caixa").
- Diagnóstico: "Itens com várias partes" (ok / falta atualizar o banco).
- Precisa da migration `20261031130000_wa_item_parts.sql` para várias partes.

### 1.8.1
- O menu saiu da barra do topo e foi para o **topo do painel**: Mensagens,
  Etiquetas, Quadro e (em breve) Agendados, Disparos e Follows.
- As Etiquetas CRM agora ficam **dentro do painel** (seção Etiquetas), com as
  mesmas funções. A janela flutuante "Etiquetas CRM" deixou de existir.
- A barra do topo ficou só com o seletor WhatsApp | CRM, as etiquetas e o ×.
- O painel lembra a seção escolhida.

### 1.8.0
- **Barra-menu** no topo: Quadro, Etiquetas CRM e (em breve) Agendar,
  Disparos e Follows. Seletor **WhatsApp | CRM**. A barra aparece mesmo sem
  WhatsApp Business.
- Painel da direita **só com as mensagens** (sem abas).
- Janela **Etiquetas CRM**: etiquetas e nota da conversa, etiquetas do WhatsApp
  da conversa (separadas), criar, renomear, cor, ocultar, ordem, excluir,
  exportar CSV e copiar contatos de uma etiqueta do WhatsApp.
- **Quadro** também no modo CRM, com arrastar e Desfazer.
- Diagnóstico: "Etiquetas CRM" (quantidade e ocultas) e "Colunas novas do
  banco".
- Precisa da migration `20261031120000_crm_labels_hidden_and_notes.sql` para
  ocultar etiquetas e para as notas (sem ela, o resto funciona).

### 1.7.0
- **Trocar etiquetas do WhatsApp Business** pela extensão, sempre por ação
  sua: arrastar o cartão para outra coluna do Quadro (ou o botão "Mover
  para…"), com **Desfazer**.
- Aba **Etiquetas** com duas partes: "ETIQUETAS DO WHATSAPP" (marcar/desmarcar
  na conversa aberta e abrir o Quadro) e "ETIQUETAS DO SISTEMA" (as do ERP,
  iguais a antes).
- Diagnóstico: nova linha "Trocar etiquetas" (disponível / indisponível: conta
  não Business / biblioteca não pronta).

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
  `audio/ogg; codecs=opus`; `requireLoaded: true` exige conversa carregada),
  `sendText { chatId, text, typingMs }` e `sendMedia { chatId, kind, data,
  mime, fileName, caption, typingMs }` (1.9.0: só `@c.us`/`@lid` já
  carregadas; markIsComposing → espera cancelável → markIsPaused sempre →
  sendTextMessage/sendFileMessage com `createChat: false`) e `cancel { id }`
  (vale para os três antes do envio). Só leitura (1.6.0):
  `labels` (getAllLabels), `labelChats { labelId, offset, limit, noPreview }`
  (chat.list com `withLabels`, sem arquivadas, ordenado por data, prévia só da
  mensagem já carregada) e `openChat { chatId }` (openChatBottom, só para
  conversas já carregadas). Etiquetas (1.7.0): `chatLabels { chatId }`
  (lê `chat.labels`) e `setChatLabels { chatId, add: [id], remove: [id] }`
  (no máx. 1 add e 1 remove, ids existentes, conversa já carregada; chama
  `labels.addOrRemoveLabels` uma vez, relê a conversa por até 1,5 s e devolve
  `{ labelIds, confirmed }`; erros `not_business`, `invalid_*` em
  `before-send` e `label_failed` em `sending`). É a única escrita em
  etiquetas, e o painel só a pede em clique, arraste ou "Desfazer".
  `stage: 'before-send'` = nada
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
  Supabase (o único lugar com acesso à rede). Escrevem só `wa_items.usage_count`
  e as etiquetas CRM (`wa_labels`, `wa_contacts`, `wa_contact_labels`), sempre
  a pedido de um clique. O background só atende os tipos da lista `HANDLERS`;
  cada função valida a entrada (UUID, tamanhos, cores da paleta). Excluir uma
  etiqueta CRM apaga as marcações e a etiqueta, nunca contatos. Colunas novas
  (`hidden`, `notes`): tenta com a coluna e, se o banco responder 400 citando
  a coluna, tenta sem.
- `mic-bridge.js`: roda no mundo da página (`"world": "MAIN"`,
  `document_start`; por isso o Chrome 111+). Envolve
  `navigator.mediaDevices.getUserMedia`: só quando o painel arma (via
  `postMessage`), o próximo pedido só de áudio recebe um stream Web Audio com
  o áudio da biblioteca (sem ligar no alto-falante). Desarma após usar, após
  erro ou após 10 s. Qualquer outro pedido vai direto para a função original.
  Não faz conexões de rede.
- `content.js`: o painel (em Shadow DOM), o cache em `chrome.storage.local`
  (`library`, `labels`, `collapsed`, `lastUsed`, `themePref`, `labelsBarHidden`,
  `labelsFamily`, `boardLabelIds`, `boardCrmLabelIds`, `panelSection`; nada de contatos, telefones ou notas) e a integração
  com o WhatsApp Web (seletores com alternativas na constante `SEL`; a
  identificação da conversa fica em `identifyConversation`).
- Não precisa de build: o Chrome carrega os arquivos como estão.
