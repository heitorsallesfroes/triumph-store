# Extensão "Mensagens" (Triumph Store)

Esta extensão do Google Chrome mostra, **dentro do WhatsApp Web**, um painel com
as mensagens, áudios, imagens, vídeos e documentos cadastrados na aba
**WhatsApp** do ERP.

Ela **só envia sozinha o que você configurou**: agendamentos, réguas de
follow ligadas por você e disparos iniciados por você. Tudo isso passa por um
**motor único** com limites, horário comercial e o botão **Pausar tudo** (veja
"Motor de envios" abaixo). O resto (a seta, "Colocar na caixa") só acontece
no seu clique.

No topo do painel fica um **menu de seções** (Mensagens, Etiquetas, Quadro…).
No topo do WhatsApp Web fica uma **barra** com as etiquetas. Existem dois tipos
de etiqueta, sempre com o nome junto:

- **Etiquetas do WhatsApp**: as nativas do WhatsApp Business. Ficam no
  WhatsApp (aparecem também no celular).
- **Etiquetas do CRM**: as nossas, guardadas no Supabase (tabelas
  `wa_labels`, `wa_contacts` e `wa_contact_labels`). Ficam só no nosso
  sistema e são a base dos follows e dos disparos.

Versão atual: **2.3.0** (precisa do **Google Chrome 111 ou mais novo**)

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

### 💰 Vendas pela conversa — 2.3.0

Registra a venda da conversa aberta **direto no ERP**, do mesmo jeito que a tela
"Nova Venda" do ERP: mesmas tabelas (`sales`, `sale_items`,
`sale_accessories`), mesmos cálculos (taxas de cartão da configuração, custos,
lucro, volumes), status **Em separação** e **estoque baixado na hora**, como o
ERP faz (o Tiny também é avisado). Finalize a venda no ERP, como sempre.

- Abra pelo botão **💰 Venda** na linha da conversa ou pela seção **Vendas**.
- Cliente (nome e telefone da conversa, editáveis), produtos do ERP (com cor,
  estoque e preço; o valor pode ser mudado), acessórios (brindes: entram só no
  custo, como no ERP), pagamento (as opções do ERP), entrega (Loja Física,
  Motoboy com taxa, Correios com frete; cidade e bairro do ERP; rua, número,
  complemento, referência, CEP e horário com atalhos), garantia em meses.
- **Pegar endereço da conversa**: a localização mandada pelo cliente vira um
  link do Google Maps nas observações; um texto que parece endereço só aparece
  como sugestão ("Usar como rua").
- **Origem**: se a conversa veio de um anúncio (Instagram/Facebook), mostra
  "Veio do anúncio: <título>" e "abrir anúncio"; senão, "Orgânico".
- **Tirar das automações e pôr na etiqueta CRM Cliente** (marcado): tira das
  etiquetas de automação que você deixar marcadas e põe em "Cliente".
- **Registrar venda**: só grava nesse clique. Se a conversa já teve venda
  registrada nas últimas 24 h, pergunta antes. Depois mostra "Venda registrada
  (pendente). Finalize no ERP." (com link se `ERP_URL` estiver preenchido em
  `config.js`).
- **Gerar mensagem do entregador**: monta o texto (cliente, telefone, rua,
  bairro, referência, horário, produtos, valor a cobrar e forma, mapa) com
  **Copiar** e **Enviar para…** (uma conversa carregada, por clique).
- A lista mostra as últimas 20 vendas registradas pela extensão; clicar abre
  a conversa.
- Automações: gatilho novo **"QUANDO uma venda for registrada pela conversa"**
  (uma vez por venda).
- Precisa da migration `20261103170000_sales_whatsapp_origin.sql` para guardar
  a conversa, a origem e a garantia, para a lista e para o gatilho. Sem ela, a
  venda é registrada igual, só sem esses campos.

### Prévia editável (olho) — 2.1.0

- Na prévia, os textos e as legendas ficam **editáveis**, já com o `{nome}`
  preenchido. Sem nome, o lugar fica destacado e aparece um campo para digitar
  o nome (só nesta conversa).
- **Enviar só nesta conversa** manda o que está na tela; a mensagem salva
  **não muda**. **Restaurar** volta o texto original.

### Mensagem rápida que etiqueta — 2.1.0

- No editor de mensagens: **Ao enviar, colocar na etiqueta CRM** e **e tirar
  da etiqueta CRM** (opcionais).
- Só muda as etiquetas quando a mensagem **inteira** sai com sucesso: pela
  seta, pela prévia, por agendamento, automação ou disparo. Se falhar ou for
  parada, não mexe. Cria o contato (e guarda o id da conversa) se preciso.
- "Colocar na caixa" (você aperta Enter) não conta como envio.

### Agendamento (seção ⏰ Agendados)

- Abra a conversa individual no WhatsApp, abra o painel e clique em
  **Agendados** (ou use **Agendar nesta conversa** no menu **···** de uma
  mensagem).
- **Agendar para <conversa aberta>**: escolha a data e a hora (ou um atalho:
  **+1h**, **+3h**, **amanhã 9h**, **amanhã 14h**, **em 2 dias**) e a mensagem:
  **Escrever agora** (texto, até 4096 caracteres) ou uma **mensagem salva**
  (inclusive as de várias partes). Clique em **Agendar**.
- Grupos não recebem agendamentos.
- **Pendentes**: conversa, prévia curta, data/hora e **Cancelar**.
  **Últimos 3 dias**: enviada, falhou, cancelada ou expirada.
- **Sai na hora marcada com o WhatsApp Web aberto; se estiver fechado, sai
  quando você abrir (até 24 h de atraso; depois disso expira).**
- A extensão confere os agendamentos a cada 30 segundos (com o WhatsApp
  pronto) e envia **um de cada vez**, com 15 a 30 segundos entre eles. Antes de
  enviar, ela "reserva" o agendamento no banco: com duas abas ou dois
  computadores abertos, só um envia.
- **2.0.0, com a migration `20261103130000_wa_flows.sql` aplicada**: os
  agendamentos passam pelo **motor de envios** (veja abaixo). Valem os mesmos
  limites, o intervalo entre contatos, o horário comercial e o "Pausar tudo":
  um agendamento marcado para fora do expediente sai no começo do próximo
  expediente (se passar de 24 h de atraso, expira). Contato com a etiqueta CRM
  **Não enviar** não recebe (fica "falhou").
- Enquanto envia, o rodapé do painel mostra "Agendado · Enviando 1/3 …" com
  **Parar** (Parar marca o agendamento como cancelado).
- Se a conversa não estiver carregada no WhatsApp Web, o agendamento fica como
  **falhou** (não cria conversa). Se o WhatsApp não confirmar o envio, também
  fica **falhou** e a extensão **nunca reenvia sozinha**: confira a conversa.
- Sem a migration `20261031140000_wa_schedules.sql` aplicada, a seção mostra
  "Atualize o banco para usar este recurso" (o resto funciona).

### Motor de envios (2.0.0)

Tudo que sai sozinho (agendados, follows e disparos) passa por **uma fila só**:

- **Uma mensagem por vez.** Entre um contato e outro, espera um intervalo
  **aleatório** entre o mínimo e o máximo configurados (padrão 45 a 120 s).
- **Limites somados** (padrão 30 por hora e 150 por dia), contando follows,
  disparos e agendados juntos (tabela `wa_send_log`).
- **Horário comercial** (padrão 09:00–19:00, seg–sáb). Fora dele, nada sai;
  continua no próximo expediente.
- **Pausar tudo**: no topo da seção Follows e no rodapé do painel (quando há
  envio automático ligado). Pausar também para a sequência automática em
  andamento.
- **Não enviar**: a extensão cria sozinha a etiqueta CRM cinza "Não enviar".
  Contato com ela nunca recebe nada automático.
- **Um computador por vez**: a aba que executa guarda uma "trava" no banco e a
  renova a cada 30 s. Se ela fechar, outra aba (ou outro PC) assume em até
  90 s. O Diagnóstico mostra "este computador executa", "outro computador
  executa" ou "pausado".
- Cada envio é **reservado no banco** antes. Se o WhatsApp não confirmar o
  envio, fica **falhou** e **nunca é reenviado**. Se falhar antes de enviar
  (ex.: conversa não carregada), fica falhou ou pulado, com o motivo.
- Edite os limites em **Follows → Limites e horário**.

### Automações (seção 🔁 Automações) — 2.1.0

Cada automação é **QUANDO → SE → ENTÃO**, sempre para os contatos de uma
etiqueta CRM, e roda **uma vez por entrada na etiqueta** (se o contato sair e
entrar de novo, vale de novo).

- **QUANDO** (gatilho):
  - **Ficou sem responder**: a sua última mensagem está há X minutos **úteis**
    sem resposta (só no horário comercial e dias permitidos; conversas paradas
    há mais de N dias são puladas).
  - **Entrou na etiqueta há**: X minutos, horas ou dias **corridos** desde que
    o contato entrou na etiqueta, mesmo que tenha conversado no meio.
  - **Respondeu**: a última mensagem carregada é do cliente.
  - **Dia e hora fixos**: em dias da semana e hora escolhidos, para todos da
    etiqueta (cada um uma vez por dia).
  - "Venda registrada" aparece desativado: chega com a Etapa E.
- **SE** (todas precisam bater): tem a etiqueta CRM; não tem a etiqueta CRM;
  veio do anúncio com a palavra; conversa parada há no máximo X dias.
- **ENTÃO** (em ordem): enviar mensagem salva (com variantes "se tem a
  etiqueta X, manda Y"), adicionar etiqueta, remover etiqueta, mover (tira a do
  gatilho e põe outra) e parar. **Se o envio falhar, as ações seguintes não
  rodam.**
- Os cartões mostram as frases "Quando… / Se… / Então…". Botões: Editar,
  Ligar/Desligar, Duplicar e Excluir (com confirmação no painel). O editor tem
  os 3 blocos e o resumo ao vivo.
- **+ Nova automação**: modelos prontos (Follow de venda, Pedido de avaliação,
  Recompra, Garantia vencendo e, na 2.2.0, **Respondeu → tirar da régua**: quem
  respondeu sai da etiqueta e vai para "Responder", que aparece como coluna no
  Quadro) ou em branco. O modelo só preenche o editor;
  nada é criado antes de **Salvar**. Etiquetas que ainda não existem aparecem
  com o botão **Criar agora**.
- **Simular**, **Testar com a conversa aberta**, **Histórico** e os contadores
  continuam iguais. Tudo passa pelo motor de envios (limites, horário, Pausar
  tudo, "Não enviar", trava entre abas).
- As réguas da 2.0.0 viram automações equivalentes quando a migration
  `20261103150000_wa_automations.sql` é aplicada (e uma automação "respondeu"
  para quem tinha "Se responder vai para"). Antes disso, a seção mostra
  "Atualize o banco para usar este recurso" e as réguas continuam rodando.

#### Etiqueta do WhatsApp no gatilho — 2.5.0

- Nos gatilhos **Ficou sem responder**, **Entrou na etiqueta há**,
  **Respondeu** e **Dia e hora fixos**, a etiqueta pode ser **CRM: …** ou
  **WhatsApp: …** (etiquetas nativas do WhatsApp Business).
- O WhatsApp não guarda quando a etiqueta foi colocada. Por isso a extensão
  anota a **primeira vez que viu** cada conversa em cada etiqueta do WhatsApp
  usada por automações **ativas**, e essa data vale como "entrou em":
  - na hora em que a etiqueta é colocada ou tirada no WhatsApp Web aberto;
  - e numa conferência leve a cada 10 min (só a aba que executa, só essas
    etiquetas, sem ler mensagens).
  - Quem já estava na etiqueta quando a automação foi ligada conta como
    "entrou agora".
  - Tirou a etiqueta: sai. Colocou de novo depois: é uma entrada nova (roda de
    novo).
- Ações novas: **Adicionar etiqueta do WhatsApp** e **Remover etiqueta do
  WhatsApp** (só etiquetas que já existem; a extensão nunca cria, apaga ou
  renomeia etiquetas do WhatsApp). Com gatilho do WhatsApp, **Mover** tira a
  etiqueta do WhatsApp do gatilho e põe a etiqueta CRM escolhida.
- Conversa sem contato no CRM: a extensão cria o contato (telefone pelo número
  da conversa, ou o nome) e liga a conversa a ele, como já fazia.

#### 🔁 Adicionar à automação — 2.5.0

- Botão **🔁 Automação** no topo da conversa (ao lado do 💰 e do 📈) e
  **🔁 Adicionar à automação** em Automações → Ferramentas.
- A tela mostra **"Esta conversa está em:"** cada automação em que a conversa
  está (adicionada por você, pela etiqueta CRM ou pela etiqueta do WhatsApp),
  com quanto falta para o próximo passo, e o botão **Tirar desta automação**.
- Escolha uma automação e clique em **Adicionar**: a conversa entra a partir
  de **agora**, sem marcar etiqueta. Em "Entrou na etiqueta há" o tempo conta
  desde agora; em "Ficou sem responder" e "Respondeu", só vale o que acontecer
  depois de agora; em "Dia e hora fixos", entra na lista daquela automação. A
  mesma conversa não entra duas vezes na mesma automação.
- **Tirar desta automação**: encerra a inscrição e, se a conversa também está
  pela etiqueta, essa entrada não roda mais (entrar de novo na etiqueta vale).
- Automação desligada não roda para ninguém, nem para quem foi adicionado.
- Precisa da migration `20261104120000_automations_wa_labels.sql`. Sem ela, as
  automações de etiqueta CRM continuam como antes e a tela mostra "Atualize o
  banco para usar este recurso".

### {nome} inteligente (2.1.0)

- Ordem: o nome salvo no CRM; senão a primeira palavra do nome do WhatsApp.
  Nos dois casos, **só se a palavra estiver na lista de nomes brasileiros
  comuns** (`data/nomes-br.js`, 10 mil nomes do Censo 2010 do IBGE), sem
  diferenciar acento e maiúsculas. "Loja do Zé", "Fé em Deus" e emoji não
  viram nome. O nome aparece com a primeira letra maiúscula.
- `{nome}` sozinho: o nome, ou vazio. `Olá{, nome}! Tudo bem?`: vira
  "Olá, Fernanda! Tudo bem?" com nome e "Olá! Tudo bem?" sem nome (o trecho
  inteiro entre chaves some).
- Vale para a seta, a prévia, agendados, automações e disparos.

### Disparos (seção 📣 Disparos)

Manda uma mensagem salva para todos de uma etiqueta CRM, **um por vez**, pelo
mesmo motor (mesmos limites, intervalo, horário comercial e "Pausar tudo").

- **+ Novo disparo**: nome, etiqueta CRM, mensagem salva (pode ter várias
  partes; `{nome}` vira o primeiro nome), início (ao confirmar ou numa data e
  hora) e "pular quem recebeu qualquer envio automático nos últimos N dias"
  (padrão 7).
- **Permitir conversas novas** (desligado por padrão): desligado, só manda para
  conversas **já carregadas** no WhatsApp Web; as outras ficam "pulado:
  conversa não carregada". Ligado, também manda para números que nunca falaram
  com você: só números (não `@lid`), e só depois de o WhatsApp confirmar que o
  número tem WhatsApp (senão "pulado: número sem WhatsApp").
- **Confirmação** antes de iniciar: total da etiqueta, quantos vão receber,
  quantos serão pulados e por quê, tempo estimado pelos limites e o aviso
  "Envios em massa podem fazer o WhatsApp bloquear seu número. Use mensagens
  que o cliente espera receber e respeite os limites." **Nada sai antes de
  "Iniciar disparo".**
- Ao iniciar, a lista é **congelada** (uma "foto" da etiqueta naquele
  momento), já pulando "Não enviar" e contatos sem telefone/id da conversa.
  Quem entrar na etiqueta depois não recebe.
- Durante: progresso (enviados, falhas, pulados, restantes), **Pausar**,
  **Retomar**, **Cancelar** (com confirmação; os que faltavam ficam "pulado:
  disparo cancelado") e **Ver alvos**. Fora do expediente o disparo para e
  continua no próximo.
- Sem a migration `20261103140000_wa_campaigns.sql`, a seção mostra "Atualize
  o banco para usar este recurso".
- **2.2.0** (migration `20261103160000_wa_campaigns_v2.sql`):
  - **Mensagem**: "Escrever só para este disparo" (padrão; o mesmo editor de
    partes das mensagens: texto, imagem, vídeo, áudio, PDF, esperar,
    digitando/gravando, até 10 partes, `{nome}` e `Olá{, nome}!`) ou "Usar uma
    mensagem salva". A mensagem exclusiva não cria nada em Mensagens; o botão
    **Salvar também como mensagem rápida** cria, se você quiser.
  - **Público**: além da etiqueta principal, "também tem a etiqueta X", "NÃO
    tem a etiqueta X" (vários), "excluir quem respondeu nos últimos X dias" e
    "excluir quem recebeu envio automático nos últimos X dias".
  - **Depois de enviar** (só para quem recebeu com sucesso): adicionar,
    remover ou mover etiqueta CRM, com "Criar agora". A etiqueta "Ao enviar"
    da mensagem salva continua valendo.
  - **Simular** no editor e na confirmação: quem recebe (com a prévia da 1ª
    parte já com o nome), quem é pulado e por quê, total e tempo estimado.
    Nada é enviado nem gravado.
  - **Duplicar**: cria um rascunho igual (mensagem, ações, filtros), sem alvos.
  - Sem essa migration, o disparo funciona como na 2.0.0 (só mensagem salva).

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
- **Agendados**: agendar mensagens (veja "Agendamento" abaixo).
- **Disparos**: envio para uma etiqueta CRM (veja "Disparos" acima).
- **Automações**: Quando → Se → Então (veja "Automações" acima).

A seção ativa fica destacada em laranja e o título do cabeçalho muda
("Mensagens", "Etiquetas CRM" ou "Agendados"). O painel lembra a última seção escolhida.
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

### 📈 Compra para o Facebook (Conversões)

Na conversa de um cliente que comprou (na loja, pelo WhatsApp, etc.), o botão
**📈 Compra p/ Facebook** (ao lado do 💰) manda o evento de compra
("Purchase") para o Conjunto de dados (Pixel) do Facebook, com o anúncio de
onde o cliente veio. É **separado** do 💰 Venda (que lança no ERP) e substitui
o que hoje é feito pelo Tintim.

- Mostra o anúncio detectado (título, id, Instagram/Facebook) ou "Não achei
  anúncio nesta conversa (será enviado só com o telefone)".
- Valor (padrão: total da última venda desta conversa no ERP), data e hora
  (padrão: agora, até 7 dias atrás) e descrição/produto (opcional).
- Se já houve um evento para esta conversa nos últimos 7 dias, pergunta
  "Já enviado em … por R$ … Enviar outro?".
- **Nada vai ao Facebook sem clicar em "Enviar compra".** O telefone vai só
  embaralhado (hash SHA-256), nunca em texto. O token do Facebook fica só no
  Supabase (secret da função), nunca na extensão.
- Seção **Conversões** no menu: histórico (data, cliente, valor, anúncio,
  método, status, teste) e o interruptor **Modo teste**.
- "Detalhes técnicos do anúncio" (recolhido) mostra só os nomes e tamanhos
  dos campos do anúncio. Mande um print dele se o anúncio não for detectado.

**2.6.0 — o que faltava para fechar o Tintim:**

- **Código de clique (ctwa_clid):** o WhatsApp guarda o identificador do
  clique dentro do `conversionData` (em bytes). A extensão lê esses bytes
  (protobuf, até 3 níveis) e o `ctwaSignals` e usa o código mais provável.
  Em "Detalhes técnicos" aparece só onde foi achado (campo, número do campo,
  tamanho e os 6 primeiros + 4 últimos caracteres), nunca o código inteiro.
  O evento leva também o id do anúncio, a origem (`FB_Ads`) e o app
  (Instagram/Facebook).
- **Com o código de clique o evento vai sempre com ele.** Com o WABA
  configurado: método "WhatsApp" (business_messaging). Sem o WABA: método
  "chat" com o código + telefone. Se o Facebook recusar o código no método
  "chat", a função tenta de novo uma vez sem ele e anota isso no histórico.
- **Telefone e nome automáticos** (📈 e 💰 Venda): em conversas sem número
  aparente (`@lid`), o telefone vem do próprio WhatsApp Web; se não der, do
  contato do CRM. Se nada achar, o campo fica vazio e destacado em vermelho.
  Nas automações por etiqueta do WhatsApp, o contato novo do CRM também ganha
  o número verdadeiro.
- **Contato automático:** em Conversões → **CONTATO AUTOMÁTICO**, o
  interruptor "Enviar 'Contato' ao Facebook quando um lead novo de anúncio
  chamar" (**desligado** por padrão) e um **Modo teste** só para ele. Ligado,
  a aba que executa os envios manda **1 evento "Contact" por conversa** nova
  que chegar de anúncio **depois de ligar** (nunca para conversas antigas), no
  máximo 1 a cada 10 s. A detecção usa só o WhatsApp Web aberto (sem consultar
  o banco); o interruptor vale para todos os computadores. Os Contatos
  aparecem no histórico como "Contato (lead de anúncio)".
- **Tintim:** se ainda estiver ativo, não envie a mesma compra pelos dois (o
  Facebook conta duas vezes). Use o modo teste até desligar o Tintim.
- **Publique a função de novo** depois de atualizar (passo 6 abaixo): a 2.6.0
  mudou `supabase/functions/meta-purchase-event/`. Sem migration nova.

**2.6.2 — anúncio de conversas longas:**

- O anúncio de onde o lead veio fica **salvo no banco** (tabela
  `wa_ad_attribution`, uma linha por conversa) assim que chega a mensagem do
  cliente com o anúncio. Vale sempre, mesmo com o "Contato automático"
  desligado. Quem grava é a aba que executa os envios.
- Ao abrir o WhatsApp, essa aba também grava o anúncio das conversas que já
  estão carregadas e ainda não estão na tabela (leads que chegaram com o
  computador desligado).
- Gravar de novo a mesma conversa não sobrescreve nada; só completa o código de
  clique se ele estava vazio.
- No 📈 o anúncio é procurado nesta ordem: **salvo no banco** → **mensagens
  carregadas** → **mensagens antigas** (a extensão pede ao WhatsApp as mensagens
  anteriores, 100 por vez, até achar o anúncio, chegar ao começo da conversa ou
  passar de 30 dias / 1000 mensagens; pode levar alguns segundos). Achou nas
  antigas: grava no banco para a próxima vez. "Detalhes técnicos" mostra a
  origem do anúncio.
- Precisa da migration `supabase/migrations/20261104160000_wa_ad_attribution.sql`.
  Sem ela, o 📈 continua procurando nas mensagens (carregadas e antigas).

**2.6.3 — nome e telefone sempre DESTA conversa:**

- No 📈 e no 💰, o telefone vem só da própria conversa: em conversa com número,
  os dígitos dela; em conversa `@lid`, o número que o WhatsApp dá para ela.
  Nunca o telefone salvo no CRM nem o que aparece na tela de outra conversa.
  O nome é o desta conversa (nome salvo ou o nome que o cliente usa); o do CRM
  só entra se o telefone do CRM for o desta conversa.
- **Trava antes de enviar** (Compra, Contato automático e 💰 Venda): se o
  telefone não for desta conversa, nada sai e aparece "O telefone não é desta
  conversa. Confira antes de enviar.". Se a conversa mudou no meio, também
  não envia.
- **Trocou de conversa:** as telas ligadas à conversa fecham (📈 Compra, 💰
  Venda, 🔁 "Esta conversa nas automações" e o Agendar com algo digitado) e o
  painel volta para **Mensagens**. O que estava digitado e não foi enviado é
  descartado sem perguntar (inclusive a prévia editada e a nota do cliente).
  Respostas de buscas da conversa anterior que chegam depois são ignoradas. As
  telas gerais (Disparos, Quadro, Automações, Etiquetas, lista de agendados)
  ficam onde estavam.

**Configurar (uma vez só):**

1. **ID do Conjunto de dados (Pixel):** em business.facebook.com abra o
   **Gerenciador de Eventos** → no menu da esquerda, **Fontes de dados** →
   clique no seu Conjunto de dados. O número embaixo do nome (ou em
   **Configurações** → "ID do conjunto de dados") é o ID.
2. **Token da API de Conversões:** no mesmo Conjunto de dados, aba
   **Configurações** → seção **API de Conversões** → **Gerar token de
   acesso**. Copie o token (ele só aparece uma vez).
3. **Código de teste:** aba **Testar eventos** → em "API de Conversões" há um
   código como `TEST12345`. Copie.
4. **(Opcional) ID da conta do WhatsApp Business (WABA):** em
   business.facebook.com → **Configurações** → **Contas** → **Contas do
   WhatsApp**. Só ajuda quando o WhatsApp entrega o identificador do clique do
   anúncio. Sem ele, o evento vai pelo telefone (método "chat").
5. **Colar no Supabase:** em supabase.com abra o projeto → **Edge Functions**
   → **Secrets** (ou "Manage secrets") → adicione, com estes nomes exatos:
   - `META_ACCESS_TOKEN` = o token do passo 2
   - `META_DATASET_ID` = o ID do passo 1
   - `META_TEST_EVENT_CODE` = o código do passo 3
   - `META_WABA_ID` = o ID do passo 4 (opcional)
6. **Publicar a função** (no computador com o projeto, na pasta `project`):
   ```
   npx supabase login
   npx supabase functions deploy meta-purchase-event --project-ref jcnvlqfpmmejtzfhfjix
   ```
7. **Aplicar a migration** `supabase/migrations/20261103190000_wa_conversion_events.sql`
   (SQL Editor do Supabase).

**Testar:** Diagnóstico → linha "Conversões Facebook" deve dizer "função
publicada; secrets ok". Depois, em **Conversões**, ligue **Modo teste**, abra a
conversa **"Meu Numero Pessoal"**, clique em 📈, coloque **R$ 1** e clique em
**Enviar compra**. Deve aparecer "Enviado ✓ (o Facebook recebeu 1 evento)". No
Gerenciador de Eventos → **Testar eventos**, o evento "Purchase" aparece em
alguns segundos. Depois desligue o Modo teste.

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

### 2.6.3
- 📈/💰: nome e telefone só da conversa aberta (corrige o formulário que
  mostrava dados de outra conversa); trava do telefone antes de enviar.
- Trocar de conversa fecha as telas da conversa e volta para Mensagens.

### 2.6.2
- Anúncio do lead salvo no banco (`wa_ad_attribution`) na chegada e na abertura
  do WhatsApp; o 📈 procura no banco, nas mensagens carregadas e nas antigas.
  Migration `20261104160000_wa_ad_attribution.sql`.
- Taxas do link de pagamento só a partir de `fee_link_start_date` (ERP).

### 2.6.1
- Taxas próprias do link de pagamento (ERP e venda pelo chat).

### 2.6.0
- Compra para o Facebook com o código de clique lido do `conversionData`
  (protobuf) e do `ctwaSignals`; id do anúncio, origem e app no evento.
- Evento "Contato" automático para leads novos de anúncio (desligado por
  padrão, com modo teste próprio), um por conversa.
- Telefone verdadeiro de conversas `@lid` (WhatsApp Web, depois CRM) no 📈 e
  no 💰; campo destacado quando não acha.
- Edge Function `meta-purchase-event` atualizada (publicar de novo): aceita
  "Contact", manda sempre o ctwa_clid quando houver, tenta sem ele se o
  Facebook recusar no método "chat" e grava o tipo de evento no histórico.

### 2.5.0
- Automações com etiqueta do WhatsApp no gatilho (além da CRM), com a data de
  "entrou na etiqueta" anotada pela extensão; ações para pôr e tirar etiqueta
  do WhatsApp.
- Botão 🔁 na conversa: ver em quais automações ela está, adicionar a partir
  de agora e tirar. Substitui o "Colocar" das Ferramentas (que marcava a
  etiqueta CRM do gatilho).
- Migration `20261104120000_automations_wa_labels.sql` (aplicar no Supabase).
- Desempenho: com automação ativa, +1 leitura a cada 2 min (inscrições). As
  etiquetas do WhatsApp só geram consultas se alguma automação ativa usar uma
  delas (a conferência é a cada 10 min). Sem automação ativa, nada muda.

### 2.4.1 (desempenho do banco)
- Só a aba com a trava trabalha em segundo plano; as outras só tentam pegar a
  trava a cada 2 min. A trava é renovada a cada 60 s (era 30 s) e a renovação
  já traz as configurações.
- O motor confere "tem algo ativo?" (agendados, disparos, automações) a cada
  2 min. Sem nada ativo, não consulta mais nada. Com algo ativo, busca trabalho
  no máximo a cada 60 s, e as contagens de envio são lidas a cada 5 min.
- As execuções das automações são filtradas pelos contatos no banco. As
  listas grandes vêm em páginas de 1000 (sem `limit=10000`).
- Contagens das etiquetas CRM só com o painel (ou o Quadro) aberto, a cada
  5 min. Listas das seções Agendados, Disparos e Automações: a cada 60 s e só
  com a aba visível. Biblioteca: a cada 5 min, só com a aba visível.
- Leituras iguais ao mesmo tempo viram uma só, e etiquetas, biblioteca e
  configurações ficam 45 s em memória (qualquer gravação, entrar ou sair da
  conta limpa a memória).
- Criar ou ativar um agendado, disparo ou automação pelo painel faz o motor
  conferir na hora.

### 2.4.0
- **📈 Compra p/ Facebook**: manda o evento de compra ao Conjunto de dados do
  Facebook pela conversa (Edge Function `meta-purchase-event`; token só nos
  secrets do Supabase; telefone só em hash). Seção **Conversões** com histórico
  e Modo teste. Detalhes técnicos do anúncio para diagnóstico.
- Diagnóstico: linha "Conversões Facebook" (função publicada? secrets? só sim
  ou não).
- Precisa da migration `20261103190000_wa_conversion_events.sql` e de publicar
  a função (ver "Compra para o Facebook").

### 2.3.0
- **💰 Vendas pela conversa**: registrar venda no ERP pela conversa (igual à
  tela Nova Venda), mensagem do entregador, lista das vendas, origem do anúncio
  e gatilho de automação "venda registrada".
- Diagnóstico: linha "Vendas pela conversa".
- Precisa da migration `20261103170000_sales_whatsapp_origin.sql`.

### 2.2.0
- **Disparos**: mensagem exclusiva do disparo (editor de partes), "Salvar
  também como mensagem rápida", filtros de público, ações "Depois de enviar",
  Simular e Duplicar.
- Modelo de automação **Respondeu → tirar da régua**.
- Precisa da migration `20261103160000_wa_campaigns_v2.sql`.

### 2.1.0
- **Automações** "Quando → Se → Então" no lugar das réguas (seção 🔁
  Automações): 4 gatilhos, condições, ações em ordem, modelos prontos,
  uma execução por entrada na etiqueta (`wa_automation_runs`). As réguas da
  2.0.0 são migradas sem perder nada.
- **Mensagem rápida que etiqueta**: põe/tira etiquetas CRM quando a mensagem
  inteira sai.
- **Prévia editável** com "Enviar só nesta conversa" e "Restaurar".
- **{nome} inteligente** (lista de nomes do IBGE) e a sintaxe `{, nome}`.
- Diagnóstico: linha "Automações".
- Precisa da migration `20261103150000_wa_automations.sql`.

### 2.0.0
- **Motor de envios** único para agendados, follows e disparos: fila só, uma
  sequência por vez, intervalo aleatório, limites por hora/dia somados, horário
  comercial, **Pausar tudo**, etiqueta CRM **Não enviar** e trava para só um
  computador executar.
- **Follows** (réguas) na seção 🔁 Follows: esquema em cartões, editor,
  Simular, Testar com a conversa aberta, Colocar numa régua e Histórico.
- **Disparos** na seção 📣 Disparos: lista congelada da etiqueta, pulos com
  motivo, confirmação com estimativa e aviso, pausar/retomar/cancelar,
  conversas novas só com a opção ligada e o número confirmado.
- O id da conversa (`chat_id`) é guardado no contato ao marcar etiqueta CRM ou
  copiar do WhatsApp.
- Diagnóstico: "Motor de envios" e "Follows e Disparos".
- Precisa das migrations `20261103130000_wa_flows.sql` (motor e follows) e
  `20261103140000_wa_campaigns.sql` (disparos).

### 1.9.1
- **Login**: aviso "Entre com sua conta do sistema" no topo do painel. Com a
  conta conectada, as chamadas ao Supabase usam o seu login. Diagnóstico:
  linha "Conta" e botão "Sair".

### 1.9.0
- **Editor de mensagens no painel**: criar, editar, duplicar e excluir
  mensagens, e criar/renomear/excluir categorias, sem sair do WhatsApp.
- **Mensagens com várias partes** (até 10: texto, imagem, vídeo, áudio, PDF),
  com espera e "digitando…"/"gravando…" em cada parte.
- A **seta envia** a mensagem na conversa aberta, parte por parte, com
  "Enviando 2/5 · aguardando 3s" e **Parar** no rodapé. Itens de 1 texto ainda
  podem ir só para a caixa ("Colocar na caixa").
- **Agendamento** na seção ⏰ Agendados (texto ou mensagem salva, atalhos de
  data, pendentes e últimos 3 dias). Sai com o WhatsApp Web aberto, até 24 h
  de atraso; reserva no banco para não enviar em dobro.
- Diagnóstico: "Itens com várias partes" e "Agendamentos" (ok / falta
  atualizar o banco).
- Precisa das migrations `20261031130000_wa_item_parts.sql` (várias partes) e
  `20261031140000_wa_schedules.sql` (agendamento).

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
  data/nomes-br.js ......... lista de nomes comuns para o {nome} (2.1.0)
  sale-calc.js ............. cálculos da venda copiados do ERP (2.3.0; também no background)
  engine.js ................ motor de envios (lógica pura + fila; sem rede, sem DOM)
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
  Motor (2.0.0, só leitura): `chatsInfo { chatIds (até 500, só @c.us/@lid),
  keywords (até 20) }` → `{ chats: { id: { loaded, last: { fromMe, t }, ad:
  [palavras que aparecem no ctwaContext], lastIn (2.2.0: horário da última
  mensagem do cliente) } } }`; nunca devolve texto.
  Disparo (2.0.0-D2): `campaignSend { campaign: true, chatId (só número @c.us),
  kind: 'texto' | 'voz' | 'imagem' | 'video' | 'documento' | 'audio-arquivo', ... }`
  é o **único** pedido com `createChat: true`: chama `contact.queryExists`
  antes (sem WhatsApp → `no_whatsapp` em `before-send`) e manda só a 1ª parte;
  o painel só o usa em disparo com "Permitir conversas novas".
- Atualizar a WA-JS: ver `vendor/README.md` (npm pack fora do repositório,
  conferir SHA-256, trocar o arquivo sem alterar, rodar os testes).

### Arquivos

- `manifest.json`: configuração da extensão (Manifest V3). Acesso só a
  `web.whatsapp.com` e ao domínio do Supabase.
- `config.js`: URL e anon key do Supabase (os mesmos valores do `.env` do ERP;
  a anon key é pública por design).
- `background.js` e `supabase-api.js`: buscam os dados e os arquivos no
  Supabase (o único lugar com acesso à rede). Escrevem só `wa_items.usage_count`,
  as etiquetas CRM (`wa_labels`, `wa_contacts`, `wa_contact_labels`), a
  biblioteca pelo editor (`wa_categories`, `wa_items`, `wa_item_parts` e
  arquivos novos no bucket `wa-media`) e os agendamentos (`wa_schedules`),
  sempre a pedido de um clique (ou, no caso do executor, para marcar o
  resultado de um agendamento feito pelo usuário). 2.0.0: o motor também
  grava `wa_settings` (trava e "Pausar tudo"), `wa_send_log` (cada envio
  automático) e troca as etiquetas CRM da régua do contato que recebeu ou
  respondeu; réguas (`wa_flows`, `wa_flow_variants`) e limites só pelo editor.
  Disparos (`wa_campaigns`, `wa_campaign_targets`): criados e iniciados só por
  clique; o motor só reserva e marca o resultado de cada alvo. 2.1.0:
  automações (`wa_automations`) só pelo editor; o motor grava
  `wa_automation_runs` (reserva) e troca as etiquetas das ações; as etiquetas
  "ao enviar" do item (`wa_items.on_send_*`) são aplicadas depois do envio. O background só atende os tipos da lista `HANDLERS`;
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
- `sale-calc.js` (2.3.0): cópia dos cálculos da tela "Nova Venda" do ERP
  (`src/pages/Sales.tsx`, `src/lib/cardFees.ts`, `src/lib/systemConfig.ts`,
  `src/lib/addressValidation.ts`, `src/lib/dateUtils.ts`). Se o ERP mudar a
  conta, mude aqui também. O background recalcula a venda com os dados frescos
  do banco antes de gravar.
- Conversões (2.4.0): a extensão só chama a Edge Function
  `supabase/functions/meta-purchase-event` (mesmo host do Supabase, com o JWT
  do usuário; a função recusa quem não está logado) e lê `wa_conversion_events`
  (gravada só pela função, com a service role). A lógica da função fica em
  `event.ts` (sem imports, testável fora do Deno); a versão da Graph API é a
  constante `GRAPH_API_VERSION`. A ponte (`adContext`) só lê o
  `ctwaContext` das mensagens carregadas e devolve um resumo do
  `conversionData` (tipo, tamanho, nomes das chaves), nunca o conteúdo.
- `data/nomes-br.js` (2.1.0): `TSP_NOMES_BR`, um `Set` com os 10 mil
  primeiros nomes mais comuns do Censo 2010 (IBGE, conjunto "genero-nomes" do
  Brasil.IO), sem acento e em minúsculas. Gerado uma vez fora da extensão.
- `engine.js` (2.0.0): carregado antes do `content.js`, no mesmo mundo
  isolado. Tempo útil, avaliação das réguas, limites, intervalo aleatório,
  trava e a fila única (`TspEngine.createMotor`). Não faz rede nem mexe na
  página: recebe o background, a ponte e o envio em sequência por parâmetro.
- `content.js`: o painel (em Shadow DOM), o cache em `chrome.storage.local`
  (`library`, `labels`, `collapsed`, `lastUsed`, `themePref`, `labelsBarHidden`,
  `labelsFamily`, `boardLabelIds`, `boardCrmLabelIds`, `panelSection`; nada de contatos, telefones ou notas) e a integração
  com o WhatsApp Web (seletores com alternativas na constante `SEL`; a
  identificação da conversa fica em `identifyConversation`).
- Não precisa de build: o Chrome carrega os arquivos como estão.
