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

Versão atual: **2.18.4** (precisa do **Google Chrome 111 ou mais novo**)

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

### 🖼️ Mídias (biblioteca de mídias) — 2.7.0

Um lugar único com as fotos, vídeos, áudios e PDFs da loja, em pastas, para
enviar na conversa com um clique e reaproveitar sem subir o mesmo arquivo de
novo.

- **Pastas:** criar, renomear, apagar (as mídias dela vão para "Sem pasta") e
  mudar a ordem (↑ ↓). Busca pelo título e filtro por tipo.
- **Grade** com miniatura (a foto, o primeiro quadro do vídeo ou um ícone),
  título e tamanho.
- **Subir:** botão "Subir arquivos" ou arrastar e soltar, vários de uma vez.
  Limites: foto 5 MB, vídeo 16 MB, áudio 16 MB, PDF 20 MB. O mesmo arquivo
  não entra duas vezes: se já estiver na biblioteca, avisa e não sobe de novo.
- **Clicar numa mídia:** prévia e os botões **Enviar nesta conversa** (com a
  legenda editável; o padrão é a legenda salva), **Editar** (título, legenda e
  pasta) e **Apagar**. Apagar só funciona se nenhuma mensagem rápida, disparo
  ou automação estiver usando o arquivo; se estiver, mostra onde.
- O envio é manual e imediato na conversa aberta, igual à seta das mensagens
  rápidas (não passa pelos limites/horário do motor). Áudio .ogg vai como
  mensagem de voz.
- **Reaproveitar:** no editor das mensagens rápidas e na mensagem exclusiva do
  disparo, cada parte com arquivo tem **Subir arquivo** e **Escolher da
  biblioteca** (usa o mesmo arquivo, nada é copiado). Arquivo subido pelo
  editor também entra na biblioteca ("Sem pasta"). As automações enviam
  mensagens rápidas, então usam a biblioteca por elas.
- **Prévia no editor (2.7.1):** "Escolher da biblioteca" abre uma grade de
  miniaturas só do tipo da parte (foto; vídeo com o primeiro quadro e ▶; áudio
  com 🎵 e a duração; PDF com 📄), com título e tamanho, busca e filtro por
  pasta. Passar o mouse mostra uma prévia maior; no áudio, ▶ toca ali mesmo
  antes de escolher. Depois de escolher ou subir, a parte mostra a prévia do
  arquivo (miniatura, player pequeno ou ícone + nome) com o botão **Trocar**;
  as mensagens que já têm mídia também mostram a prévia ao abrir o editor.
  As miniaturas só carregam quando aparecem na tela e ficam em cache.
- **Importar mídias das mensagens rápidas:** cria na biblioteca as mídias que
  já estão nas mensagens rápidas, sem subir de novo e sem mudar as mensagens.
- **Rodapé:** espaço usado no wa-media (soma dos arquivos da biblioteca) de
  1 GB; amarelo acima de 70% e vermelho acima de 90%.
- Precisa da migration `supabase/migrations/20261105090000_wa_media_library.sql`.
  Sem ela, a aba mostra "Atualize o banco para usar este recurso" e o editor
  continua subindo arquivos como antes.

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
- 2.7.1: logo abaixo, **Ao enviar, colocar na etiqueta do WhatsApp** e **e
  tirar da etiqueta do WhatsApp** (etiquetas do próprio WhatsApp Business;
  "(não mexe)" é o padrão). Mesma regra e mesma troca de etiqueta das
  automações; etiqueta do WhatsApp apagada depois é ignorada sem erro.
  Precisa da migration `supabase/migrations/20261105120000_wa_items_on_send_wa_labels.sql`;
  sem ela, tudo funciona como antes.
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

Desde a 2.16.10, abrir uma conversa pelo cartão **encolhe** o Quadro para o
lugar da lista de conversas (a conversa no meio, o painel à direita), com o
cartão aberto destacado. **⤢ Expandir** volta ao Quadro grande.

**Nome do cartão** (desde a 2.16.11, nos dois modos, grande e encolhido): (1) o
nome salvo na sua agenda do WhatsApp, (2) o nome do CRM, (3) o nome do perfil
da pessoa com "~" (ex.: "~Zé"), (4) o número. Quando aparece um nome, o número
fica pequeno, em cinza, embaixo. Os nomes vêm só do que o WhatsApp Web já tem
carregado (nada é consultado no servidor); sem nome, vale o próximo da ordem.

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

### 2.18.4 — Catálogo no topo da aba Mídias · zoom do construtor não cobre caixas · apagadas também as suas
- **Aba Mídias**: o bloco **"Exportar catálogo do WhatsApp"** agora fica no **topo** da aba (antes ficava embaixo,
  depois da grade de mídias).
- **Construtor de automação em cascata**: o controle de zoom (− 100% + ↺) saiu de cima da área de desenho e fica numa
  faixa própria logo abaixo dela: com a régua longa (ou com zoom grande), nenhuma caixa — nem o **FIM** — fica
  debaixo dele.
- **Mensagens apagadas/editadas**: a cópia local passa a guardar também as **suas** mensagens (antes só as do
  cliente: a mensagem que você apagava não ganhava o 👁). Selo **"👁 Ver mensagem apagada"** e a lista **"Mensagens
  apagadas/editadas"** valem para texto, foto e áudio apagados pelo cliente **e por você** (na lista: "apagada por
  você"; na janela: "Mensagem apagada por você"). Áudio/foto sem o tamanho informado também têm o arquivo guardado
  (até 5 MB). Continua só neste computador, 7 dias, até 200 MB.
- Testes: `deleted.test.cjs` (as suas: texto, foto e áudio) e `chrome-real.test.cjs` (catálogo no topo, zoom sem
  cobrir caixas, a sua foto apagada).

### 2.18.3 — Links rastreáveis do Instagram sem o código visível: a FRASE liga a conversa
- O link `/l/<apelido>` (e o "link direto do WhatsApp" wa.me, para o ManyChat) agora abre o WhatsApp só com a
  **frase do link** (ex.: "Olá! Vi o perfil de vocês no Instagram e quero saber mais"), sem `[IG-BIO]`. O código
  antigo **continua aceito** (vale primeiro), só não é mais gerado.
- O painel manda para a ponte, a cada 5 min, as frases ativas num lugar só: links ativos (`ig_links.message`),
  automações (`ig_automations.wa_phrase`) e Direct (`ig_direct_phrase`) — as **nossas** frases, nenhum texto de
  cliente. Na **1ª mensagem de um lead novo**, a ponte compara **dentro da página** (sem acento, maiúscula, pontuação,
  emoji nem espaço a mais; até ~15% de letras diferentes, mín. 2; texto a mais antes/depois tudo bem; empate entre
  duas frases → nenhuma) e manda só o **resumo (hash) da frase reconhecida** — o texto nunca sai. Sem frase
  reconhecida, o resumo da mensagem inteira, como na 2.18.2. A mesma regra do ERP (`src/lib/igLinks.ts`).
- **Reserva por horário**: 1ª mensagem sem código e sem frase, que não veio de anúncio, até **10 min depois de um
  clique** num link → liga ao link **só se houve exatamente 1 clique sem conversa** nesse intervalo (cada conversa já
  ligada ao mesmo link "usa" um clique).
- `ig_link_leads.match` guarda como foi ligada: **frase**, **horário** ou **código**. Sem a migration
  `20261117120000_ig_link_phrases.sql`: frase e código gravam como antes (sem o campo) e a reserva por horário fica
  desligada.
- Testes: `iglinkphrase.test.cjs` (e `igphrase.test.cjs` / `igcode.test.cjs` continuam).

### 2.18.2 — Frase das automações do Instagram na 1ª mensagem
- As automações do Instagram (ERP → Instagram → Automações) mandam um botão para o WhatsApp da loja com uma **frase
  natural** (ex.: "Olá! Vi o comentário no Instagram e quero saber da promoção 🔥"). Na **1ª mensagem de um lead novo**
  sem código `[IG-...]`, a ponte manda só um **resumo (hash)** da mensagem — nunca o texto; o painel compara com os
  resumos das frases (`ig_automations.wa_phrase` e `system_config.ig_direct_phrase`) e, batendo, grava a conversa em
  `ig_link_leads` com o **código da automação** (ex.: IG-A-COMENT; Direct: IG-DIRECT). O resto não muda.
- Sem a migration `20261115120000_ig_automations.sql`: nada de frase (o código `[IG-...]` continua).
- Testes: `igphrase.test.cjs`.

### 2.18.1 — Sai da automação quando tiram a etiqueta do WhatsApp de início · nome da agenda no ERP
- **Sair ao tirar a etiqueta** (só automações cuja caixa **▶ COMEÇA** é uma **etiqueta do WhatsApp**): se tirarem
  essa etiqueta da pessoa, o percurso termina **antes do próximo envio**, com o motivo **"saiu da etiqueta"** (aparece
  no Histórico da extensão e no ERP → Automações → Histórico). Exemplo: "Avaliação Google" começa em "Cliente"; pôs o
  motoboy nela sem querer e tirou → ele sai e não recebe nada.
  - Opção na caixa COMEÇA: **"Se tirarem a etiqueta: sair da automação"** (padrão **ligado**; desligada = como antes).
  - Precisa de **2 leituras seguidas** (1 por minuto) sem a etiqueta. Na 1ª leitura sem ela, o envio já fica segurado.
  - **Troca de id @c.us ↔ @lid não é retirada**: se qualquer id da mesma pessoa (o @lid mapeado ou o mesmo telefone)
    está na etiqueta, ela fica. Conversa que sumiu da memória do WhatsApp Web (o que a troca de id costuma fazer), lista
    da etiqueta ainda carregando ou que falhou = "não sei" → não sai.
  - Retirada feita **pela própria automação** daquele percurso (passo "tirar" essa etiqueta, ou "colocar … e tirar as
    outras") não conta.
  - Automações que começam por **etiqueta do CRM** (ex.: Régua de follow-up), por lead, venda ou à mão: **nada muda**.
- **Nome da agenda no banco**: a extensão grava o nome salvo na agenda (e o do perfil) de cada conversa que conhece
  em `wa_contact_names` — ao abrir a conversa, quando a lista carrega e numa varredura leve a cada 30 min (só o que
  mudou). Só com o que o WhatsApp Web já tem na memória: **sem consultar o servidor** e sem mexer no WA-JS (vendor).
  O ERP mostra: **nome da agenda → nome do CRM → nome do perfil (~) → número**.
- Sem a migration `20261114120000_wa_contact_names.sql`: a extensão funciona como antes (não grava o nome).
- Testes: `labelexit.test.cjs` (motor de verdade: tirar "Cliente" à mão → sai; troca c.us↔lid → não sai; Régua de
  follow-up sem mudança; gravação dos nomes; ponte com WA-JS falsa) e `chrome-real.test.cjs` (a opção na caixa COMEÇA).

### 2.18.0 — Links rastreáveis do Instagram ([IG-...]) até a venda
- Os links do ERP (aba Instagram → **Rastreio**, ex.: `triumph-store.vercel.app/l/bio`) abrem o WhatsApp da loja
  com a mensagem e um código no fim: **"Olá! Vim pelo Instagram 😊 [IG-BIO]"**.
- Quando chega a **1ª mensagem de um lead novo** com um código `[IG-...]`, a extensão grava a conversa em
  `ig_link_leads` (conversa, telefone, hora e o código; o link é achado pelo código). **Só o código sai da página do
  WhatsApp** — o texto da mensagem nunca é guardado e a mensagem não é alterada. Vale também para os leads achados na
  varredura da abertura (72 h).
- No ERP, a conversa passa a aparecer como **"Instagram (orgânico) · <canal> · <apelido>"** em WhatsApp →
  Rastreamento, separada de **Meta Ads** e **Não rastreada**. Anúncio continua valendo primeiro (conversa que veio de
  anúncio fica Meta Ads).
- Sem a migration `20261113120000_ig_links.sql`: a extensão funciona como antes (não grava o código).
- Testes: `igcode.test.cjs` (ponte com WA-JS falsa, motor e gravação com PostgREST falso).

### 2.17.2 — Não esquecer a compra para o Facebook depois da venda (💰)
- Logo depois de **"Venda registrada"** aparece, no mesmo lugar: **"📈 Enviar a compra para o Facebook? R$ 734,00"**
  com **Enviar agora** e **Agora não**.
- **Enviar agora** usa o mesmo envio do 📈 (função `meta-purchase-event`, intocada): o valor da venda, a mesma
  conversa, o anúncio salvo da conversa, a mesma trava do telefone e o modo teste do 📈. A compra real fica ligada à
  venda recém-criada (`sale_id`). Mostra o resultado: "Compra enviada ao Facebook ✓", "já tinha sido enviada" ou o
  erro com a mensagem (com "Tentar de novo").
- **Não pergunta** quando a venda já tem compra real enviada ligada a ela (mesmo `sale_id`; inclusive a compra que o
  formulário da venda ligou, quando o 📈 foi antes do 💰). Se a conversa teve outra compra real nos últimos 7 dias, a
  pergunta avisa ("Envie só se for outro pedido").
- **Mais → "Ao salvar venda"**: Perguntar (padrão) / Enviar sempre automático / Não perguntar (neste computador). O
  automático não envia por cima de outra compra recente da conversa: nesse caso pergunta.
- Testes: `salefb.test.cjs` e `chrome-real.test.cjs` (pergunta, "Enviar agora" pela função simulada com valor,
  conversa, anúncio e `sale_id`; configuração em Mais).

### ERP (11/11) — Rastreamento: Vendas × Facebook (só leitura)
- Bloco **"Vendas: ERP × Facebook"** na aba WhatsApp → Rastreamento, lado a lado: **Faturamento no ERP** (todas as
  vendas do período, pela data da venda; canceladas/reembolsadas não contam) × **Enviado ao Facebook** (Compras com
  status enviado, sem testes, no período) e a **diferença** em R$ e em quantidade.
- Lista **"Vendas sem conversão enviada"** do período: cliente, data, valor, se tem conversa do WhatsApp ligada
  (`wa_chat_id`) e **Abrir conversa** (web.whatsapp.com) para enviar pelo 📈. Sem conversa ligada: "sem conversa — não
  dá para enviar". Venda com conversão = Compra real ligada a ela (`sale_id`) ou, sem ligação, Compra real da mesma
  conversa até 7 dias antes/depois (cada Compra cobre uma venda só).
- **Aviso no topo** quando há venda de hoje/ontem sem conversão: "⚠ 2 vendas sem conversão enviada (R$ 1.200) — hoje e
  ontem", com "ver lista".
- Só leitura: o ERP não envia nada ao Facebook. Contas em `src/lib/waTracking.ts` (`salesFbGap`, `recentFbGap`),
  leitura em `src/lib/waTrackingDb.ts` (`loadSalesFb`). Testes: `scripts/tests/waTracking.test.ts` e
  `scripts/tests/waChrome.test.ts` (Chrome real, 20/20).

### 2.17.1 — Radar só daqui pra frente e contando as etiquetas do WhatsApp
- **Por quê**: na 2.17.0 o Radar mostrou 115 conversas, muitas antigas e muitas de clientes que já têm etiqueta do
  WhatsApp (ex.: "Cliente").
- **Só daqui pra frente**: o Radar guarda quando foi ligado (`since` em `system_config` → `wa_radar_config`); desligar e
  religar grava uma nova data. Só entram conversas cuja **última** mensagem (de qualquer lado) é **depois** dessa
  data. Ao atualizar para esta versão, a data de início vira o momento da atualização (a configuração da 2.17.0 não
  tinha data), então as conversas já paradas somem.
- **Etiqueta do WhatsApp também é destino**: conversa com **qualquer** etiqueta (CRM ou do WhatsApp) não entra, menos
  as marcadas nas configurações como "não contam" (CRM e WhatsApp, separadas). A opção antiga "etiquetas do WhatsApp
  que tiram do radar" deixou de existir (agora todas tiram).
- **"Não precisa para todas"** no aviso e em Mais → Radar: o 1º clique pede confirmação ("Confirmar: silenciar as N"),
  o 2º silencia todas da lista até chegar mensagem nova em cada uma (uma gravação só em `wa_radar_snooze`).
- Topo de Mais → Radar: **"Ligado desde 11/11 13:40"** (ou "Desligado").
- Testes: `radar.test.cjs` (data de início, atualização da 2.17.0, etiquetas do WhatsApp, em lote) e
  `chrome-real.test.cjs` (Ligado desde, etiqueta do WhatsApp, "não conta", para todas com confirmação, religar).

### 2.17.0 — Radar: conversas sem etiqueta CRM e sem automação há mais de 2 h
- **Objetivo**: todo lead deve estar numa etiqueta CRM ou numa automação. O Radar avisa quando uma conversa fica parada
  sem nenhum dos dois, para você decidir à mão.
- **Regra** (confere a cada 5 min, só no horário geral de envio): conversa individual (não grupo, não arquivada, não a
  sua própria nem "Meu Numero Pessoal"), com mensagem sua ou do cliente nos últimos 7 dias, cuja **última** mensagem
  (de qualquer lado) tem mais de 2 h, e cujo contato **não tem etiqueta CRM** e **não tem percurso ativo** em
  automação/régua ligada (régua: percurso "ativo"; automação: inscrição sem saída). O contato é achado pela conversa
  (chat_id), pelo telefone do @c.us ou pelo telefone que o WhatsApp Web já tem do @lid.
- **Aviso**: popup discreto no canto inferior esquerdo (não bloqueia a tela): "⚠ 3 conversas sem destino há mais de
  2 h", com nome da agenda/nome/número, a última mensagem resumida ("Cliente: …" / "Você: …") e há quanto tempo.
  Clicar numa abre a conversa e o painel na aba **Etiquetas**. Por conversa: **Não precisa** (silencia até chegar
  mensagem nova) e **Lembrar em 1 h**. **Fechar**: o aviso volta só se aparecer conversa nova na lista.
- **Contador** (bolinha vermelha com o número) no botão do painel, e **Mais → Radar** com a mesma lista, o botão
  "Conferir agora" (vale também fora do horário) e as **configurações**: ligar/desligar, tempo (padrão 2 h), etiquetas
  CRM que também contam como "sem destino" (nenhuma por padrão) e etiquetas do WhatsApp que tiram a conversa do radar
  (ex.: Motoboy).
- **Onde fica guardado** (vale em qualquer computador, sem migration): `system_config` chave `wa_radar_snooze` ("Não
  precisa"/"Lembrar") e chave `wa_radar_config` (configurações). O resto é **só leitura** do que já existe (conversas
  na memória do WhatsApp Web, etiquetas, percursos). O resumo da mensagem só aparece na tela: nunca vai para o banco nem
  para o `chrome.storage` (neste computador fica só a lista de ids que já estavam no aviso ao "Fechar").
- Correção junto: o **Diagnóstico do Produto** (2.16.14) abria sem o estilo do painel (fundo transparente); agora abre
  com o tema, como o Radar.
- Testes: `radar.test.cjs` (regra, ponte, banco só leitura, system_config) e `chrome-real.test.cjs` (popup, contador,
  Mais → Radar, abrir na aba Etiquetas, "Não precisa", "Fechar", etiqueta Motoboy), com WhatsApp e banco simulados.
  Telas em `screenshots/2.17.0/`.

### 2.16.14 — Diagnóstico do Produto e prévia da reserva sempre a da extensão
- **Por quê**: no teste real da 2.16.13 (conversa "Meu Numero Pessoal", 3 partes Produto) os três saíram como link
  com foto pequena e "R$ 709,00" cheio, sem o cartão nativo. Faltava ver o que aconteceu em cada passo.
- **Mais → Manutenção → Diagnóstico do Produto**: escolha um produto do catálogo e clique em **Ler produto**. O texto
  (botão **Copiar**) mostra o que cada leitura trouxe — `getProductById` e o catálogo carregado no WhatsApp: preço,
  `sale_price`/`salePriceAmount1000` e as datas da oferta, URLs das fotos e os nomes dos campos —, se
  `WPP.whatsapp.functions.sendProductToChat` existe, com aridade e assinatura, e a descrição que a prévia vai usar.
  Nada é enviado.
- **Testar envio em Meu Numero Pessoal**: só funciona com a conversa "Meu Numero Pessoal" aberta; o 1º clique pede
  confirmação ("Confirmar: enviar …"), o 2º envia. O texto mostra cada tentativa: nativo ordem 1 e ordem 2 (erro
  exato ou "nenhuma mensagem nova"), reserva (upload da foto grande `thumbnailHQ`: ok ou o motivo — upload
  indisponível, foto não carregou, foto pequena, erro do upload), o que foi enviado (título, descrição, miniatura) e o
  que a mensagem ficou tendo depois de enviada (`previewAccepted`: a prévia ficou a nossa ou foi trocada).
- **Log da extensão**: cada envio de Produto (mensagem rápida, sequência, disparo) guarda esse mesmo registro neste
  computador (últimos 30, `chrome.storage.local`, chave `productSendLog`), **sem dados de cliente** (nem conversa, nem
  número, nem o texto da mensagem). Os 10 últimos aparecem no fim do texto do Diagnóstico do Produto, para copiar e
  mandar.
- **Correções na reserva**:
  - a prévia é sempre a montada pela extensão (título = nome, descrição com a oferta, miniatura), no mesmo formato da
    prévia da WA-JS (`richPreviewType: 0`, `doNotPlayInline`, `canonicalUrl`), enviada com `linkPreview: false` para a
    biblioteca não buscar outra;
  - **oferta**: além do `getProductById`, lê também o produto do catálogo carregado no WhatsApp (onde vem
    `salePriceAmount1000`). Se nenhuma leitura traz campo de oferta e a parte foi salva com oferta cujo cheio bate com
    o preço atual, usa a oferta salva. Oferta vencida ou futura nunca entra. A foto vem de qualquer leitura que tenha;
  - foto grande: o tamanho mínimo passou a ser o da WA-JS (140 x 100; antes 300 de largura), e cada falha diz o motivo.
- Vendor WA-JS intocado. Testes simulados: `productdiag.test.cjs` (registro do envio, prévia, oferta, leitura) e
  `chrome-real.test.cjs` (botão, leitura, log, teste só em "Meu Numero Pessoal" com confirmação).

### 2.16.13 — Parte "Produto" com o cartão do catálogo e o preço de oferta
- **Preço de oferta**: a parte Produto passa a usar o preço **promocional** do catálogo quando houver (ex.: R$ 629,00,
  com R$ 709,00 riscado). Antes só aparecia o cheio, porque a oferta vem em `sale_price` na leitura do produto e
  a extensão não lia esse campo. Oferta vencida, que ainda não começou, ou igual/maior que o cheio é ignorada. A
  prévia no painel mostra a oferta com o cheio riscado.
- **1º caminho — cartão NATIVO**: envia o produto como o WhatsApp Web faz ao compartilhar pelo catálogo (foto
  grande, oferta com o cheio riscado e o botão "Ver"), pela função interna que a WA-JS já expõe
  (`WPP.whatsapp.functions.sendProductToChat`), sem mexer no vendor e sem consultar nada de fora. A ordem dos
  parâmetros dessa função não é documentada: tenta (produto, conversa) e, se der erro, (conversa, produto). Só vale
  se uma mensagem nova aparecer na conversa; o texto da parte vai logo depois, como mensagem separada.
- **2º caminho — reserva automática**: se o nativo falhar, vai o link do produto com a prévia montada pela extensão.
  Título = nome; descrição = "R$ 629,00 · de R$ 709,00"; a foto do catálogo em tamanho grande, subida pelo upload de
  miniaturas do próprio WhatsApp (`thumbnailHQ`). Sem esse upload, vai a miniatura pequena. Se o nativo não der
  erro mas nada aparecer em 6 s, não tenta de novo (para não mandar duas vezes) e vai a reserva.
- Depois de enviar, o aviso "Enviado." diz por qual caminho o produto saiu: "🛍️ Produto como cartão do catálogo."
  ou "🛍️ Produto como link com foto grande (reserva)." / "🛍️ Produto como link (reserva)."
- Testado só com a WhatsApp/WA-JS simulada: `productcard.test.cjs` (oferta, nativo nas duas ordens, reserva com foto
  grande, sem envio duplicado) e `chrome-real.test.cjs` (prévia com a oferta e o aviso do caminho). Ainda falta
  conferir no WhatsApp de verdade, na conversa "Meu Numero Pessoal", qual caminho a sua versão usa.

### 2.16.12 — Sem contato duplicado "só pelo nome"; nome longo da agenda aceito
- **Como o painel acha o contato da conversa**, sempre nesta ordem: (1) o contato com o **mesmo chat_id** da conversa
  aberta; (2) o **mesmo telefone** (do @c.us, ou do @lid pelo cache do WhatsApp Web); (3) só então pelo **nome**. Se
  já existe um contato com o mesmo chat_id ou telefone, **nenhum contato novo é criado**: a etiqueta vai para ele.
  Ex.: a conversa 178352…@lid ("Cliente Ana Maria S11 Mini Rose Gold / …" na agenda) agora mostra o contato antigo
  (Follow Up 1) e não diz mais "identificado só pelo nome".
- **Nome longo**: nome da agenda com mais de 100 letras é cortado em 100 para salvar e comparar, em vez de dar "Não
  consegui identificar esta conversa (Identificação inválida)". O nome nunca é a chave quando há chat_id ou telefone.
- **Juntar contatos duplicados**: roda uma vez quando o painel abre e pelo botão **Mais → Manutenção → Juntar contatos
  duplicados**. Contatos com o mesmo chat_id ou o mesmo telefone vão para o **mais antigo**: etiquetas (sem duplicar,
  com a data de entrada mais antiga), nota, nome (prefere o da agenda), percursos de automação, inscrições, régua e
  disparos; depois o duplicado é apagado e o painel mostra quantos juntou. Contatos sem par não são tocados.
- Testes: `dupmerge.test.cjs` (os dois casos reais, a ordem chat_id → telefone → nome, nome com 150 letras e a junção
  de etiquetas, percursos, inscrições e nota) e `chrome-real.test.cjs` (os dois casos e o botão de juntar).

### 2.16.11 — Quadro mostra o nome da agenda em vez do número
- Os cartões do Quadro (WhatsApp e CRM, grande e encolhido) mostram, nesta ordem: o **nome salvo na sua agenda do
  WhatsApp** (o mesmo da lista de conversas), o **nome do CRM**, o **nome do perfil** com "~" na frente, e só por último
  o **número**. Ex.: antes "+55 (21) 97976-2603", agora "Maria" com "+55 (21) 97976-2603" pequeno e cinza embaixo.
- Vale também para conversa @lid (o nome da agenda do mesmo número). Os nomes saem só do que o WhatsApp Web já tem na
  memória: nenhuma consulta ao servidor, a biblioteca WA-JS não foi alterada. Sem nome: cai para o próximo, sem erro.
- O Quadro não tem campo de busca, então não houve busca para mudar.
- Testes: `boardnames.test.cjs` (ponte com WA-JS falsa e ordem dos nomes) e `chrome-real.test.cjs` (cartões com nome
  da agenda, ~perfil e número; número embaixo; mesma ordem no encolhido).

### 2.16.10 — Quadro encolhido ao lado da conversa
- Clicar num cartão do Quadro (WhatsApp ou CRM) abre a conversa e o Quadro **não fecha mais**: ele **encolhe** para o
  lugar da lista de conversas do WhatsApp (da barra da esquerda até onde começa a conversa), com as colunas lado a lado
  (rolagem para o lado) e o **cartão aberto destacado**. A conversa fica livre no meio e o painel continua à direita:
  dá para atender um lead atrás do outro sem reabrir o Quadro.
  ```
  ┌──── QUADRO (encolhido) ────┬──── CONVERSA (WhatsApp) ────┬─ PAINEL ─┐
  │ Analisar │ Follow Up 1 │…  │  mensagens do lead…         │ rápidas  │
  │ [card]◄── clicado          │                             │ etiqueta │
  └────────────────────────────┴─────────────────────────────┴──────────┘
  ```
- Outro cartão abre a outra conversa e o destaque passa para ele. Se a conversa aberta mudar pelo WhatsApp, o destaque
  acompanha (sem cartão daquela conversa: nenhum destacado).
- **⤢ Expandir** volta ao Quadro grande; **Fechar** (ou Esc) fecha. Abrir o Quadro de novo (barra ou "Quadro") vem
  grande. Arrastar para trocar a etiqueta continua funcionando no encolhido ("Mover para…", "Colunas" e o seletor
  WhatsApp | CRM ficam só no grande). A largura acompanha a janela.
- Teste: `chrome-real.test.cjs` (grande → clicar no cartão → encolhido do lado da conversa com o cartão destacado e o
  painel à direita; outro cartão; conversa trocada pelo WhatsApp; Expandir; Fechar e abrir de novo grande).

### 2.16.9 — lista de conversas não pula mais para o topo em envio com imagem / várias partes
- **O problema**: a 2.10.3 vigiava a lista (#pane-side) só por 2 s depois de cada parte. Com mídia (upload) e
  mensagens de várias partes o WhatsApp pula a lista depois disso (ex.: "Follow Padrão 2", imagem com legenda, rolado
  em "Ontem": a lista ia para o topo e ficava).
- **Agora** a vigia vai do **começo do envio até 3 s depois da ÚLTIMA parte** (texto, imagem, áudio, vídeo,
  documento, álbum, catálogo/rich), em todo envio da extensão (mensagens rápidas, mídias, catálogo, áudio do 🎤,
  agendados, disparos, automações) e no Enter/botão Enviar do WhatsApp (também o "Enviar" da prévia de foto/vídeo/
  documento). Enquanto a mensagem estiver com o **reloginho** do WhatsApp (ainda enviando), a janela não fecha.
- **Sem brigar**: se você rola, clica na lista ou abre outra conversa nesse meio tempo, não restaura (até o fim desse
  envio). Mensagem de cliente chegando não restaura (nem no meio do envio: no topo fica a conversa dela, não a aberta).
- Volta para onde você estava + 1 linha só na 1ª vez de cada envio; nas partes seguintes volta para o mesmo lugar
  (sem escorregar uma linha por parte). No máximo 3 voltas por parte.
- Com a lista filtrada (Não lidas, etiqueta), em que a conversa aberta pode não estar na lista, continua funcionando.
- "Manter a posição da lista de conversas ao enviar" (Personalizar) continua ligada por padrão.
- Testes: `prefs.test.cjs` (janela até 3 s depois da última parte, envio em andamento, você mexeu, mensagem de
  cliente, sem escorregar) e `chrome-real.test.cjs` (imagem que leva 6 s e pula no fim; 6 s com o reloginho e pula
  depois; 5 partes; você rola no meio; mensagem de cliente no meio; lista filtrada). O tempo limite do teste no Chrome
  real passou para 7 min (os envios demorados somam ~1 min).

### 2.16.8 — mostra que o "Pular espera" já foi clicado
- No painel da conversa ("🔁 Na automação … · passo: esperando resposta"), com a espera pulada (`skip_wait` no
  percurso) o botão **Pular espera** some e aparece o selo **"⏩ Espera pulada às 12:28 · na fila de envio"** (a hora é
  a da gravação no banco, `updated_at`). Embaixo, a previsão (`E.seqSkipForecast`, as mesmas regras do motor):
  - na fila: **"na fila: 5º · sai por volta de 12:40"**: lugar aproximado (percursos ativos prontos para mandar —
    espera pulada ou prazo vencido —, na ordem em que o motor lê) × o intervalo médio entre contatos, a partir do
    último envio; se não couber no limite desta hora, depois que ele liberar;
  - parado: **"limite por hora — volta às 13:00"** (quando o envio mais antigo da última hora completar 1 h),
    **"limite do dia — volta amanhã 09:00"** (geral ou o limite próprio da régua), **"fora do horário — amanhã 09:00"**
    (horário da automação e a faixa "enviar só entre" da espera) ou "pausado".
- Vem do banco (`seqChatRuns` + `seqSkipInfo`): igual ao reabrir a conversa e em qualquer computador.
- ERP (⚡ Automações → Pessoas): o selo **"⏩ pulou a espera"** na pessoa (ver `src/components/whatsapp/WaAutomations.README.md`).
- Nada muda no envio. Sem migration. Testes: `skipwait.test.cjs` (previsões, servidor, envio igual) e
  `chrome-real.test.cjs` (botão → selo, previsão e o mesmo selo ao voltar na conversa); ERP:
  `scripts/tests/waAutomations.test.ts` e `scripts/tests/waAutomationsChrome.test.ts`.

### 2.16.7 — mesma pessoa com dois @lid diferentes: etiqueta da régua e percurso duplicado
- **O problema (10/11)**: o contato 5521997520054 tinha `wa_contacts.chat_id = 80685…@lid`, mas a conversa aberta era
  `196980…@lid` (o mesmo número com outro @lid). Na Régua de follow-up, o percurso adicionado à mão na 196980…@lid
  mandou o Follow 1, mas a caixa ETIQUETA (colocar Follow Up 2, tirar as outras) foi pulada sem erro: o contato não foi
  achado pelo chat_id da conversa. Depois nasceu outro percurso do mesmo contato na 80685…@lid (entrada pela etiqueta
  Follow Up 1), que mandaria o Follow 1 de novo.
- **Caixa ETIQUETA (CRM)**: usa o **contact_id do percurso**. Só sem ele procura pelo chat_id e pelo **telefone**
  (o do @lid vem do cache do WhatsApp, `chatPhone`; o servidor acha o contato pelo telefone com e sem o 55, sem criar
  outro). Não achou ninguém → **não pula calado**: grava "etiqueta não aplicada: contato não encontrado" no log da
  automação (`wa_send_log`, status "pulado", não conta nos limites) e o painel da conversa mostra
  **"⚠ <régua>: etiqueta não aplicada (contato não encontrado) · dd/mm hh:mm"** (amarelo, últimos 7 dias).
  `seqRuns` também acha o contato do percurso pelo contact_id (nome, telefone e etiquetas do "Não enviar").
- **Percurso duplicado**: antes de criar um percurso (`seqCreateRuns`), se a mesma régua já tem percurso da **mesma
  pessoa em outra conversa** (mesmo contact_id ou mesmo telefone; @lid ↔ @lid, @c.us ↔ @lid), **ativo ou que terminou
  por resposta nas últimas 24 h**, não cria outro. A mesma conversa segue como antes (a mesma entrada nunca duplica;
  entrada nova = percurso novo). O contact_id que faltava é preenchido. A limpeza de duplicados ativos (2.16.5) agora
  também junta dois @lid do mesmo contact_id (fica o mais antigo). Entrar à mão ("Adicionar à automação") tira o
  percurso da mesma pessoa pela outra conversa ("reentrou") e grava o contact_id pelo telefone.
- **Abrir a conversa**: se o telefone dela já tem contato com **outro** chat_id, o contato passa a apontar para a
  conversa atual (`adoptChatId`; uma vez por conversa na aba; nunca cria contato; não mexe se outro contato já tem
  este chat_id).
- Teste `idswap.test.cjs` "motor: 500 trocas…" não depende mais da hora do dia: tinha mensagem inexistente
  ("sem mensagem" → `fim` quando caía no horário comercial). Agora tem mensagem de verdade.
- Sem migration. Testes: `idswap.test.cjs` (etiqueta pelo contact_id, pelo telefone do @lid e o aviso; não criar o
  percurso repetido; lid ↔ lid ativos; entrar à mão; abrir a conversa) e `chrome-real.test.cjs` (contato passa para a
  conversa aberta e o aviso amarelo no painel).

### 2.16.6 — "Adicionar à automação" no meio da régua: "Esperar o tempo da régua"
- Em **Começar no: Follow N**, as opções agora são **Enviar esta etapa agora** (como antes: entra como se tivesse
  entrado há o tempo desta etapa e sai assim que estiver no horário de envio) e **Esperar o tempo da régua** (antes
  "No horário marcado", que saía na hora porque o prazo já tinha vencido).
- **Esperar o tempo da régua** = a pessoa entra como se tivesse **acabado de receber o follow anterior**: a entrada é
  recuada o tempo dele e o percurso começa logo depois dele, com as esperas entre os dois contando a partir de agora.
  Ex.: Follow 1 = 3 h, Follow 2 = dia 1 → entrada recuada 3 h; o Follow 2 sai ao completar "dia 1 desde a entrada"
  (≈ 21 h depois de agora), respeitando o horário de envio e a faixa da espera. Terça 10:24 → vence quarta 07:24 →
  sai quarta 09:00 (horário 09:00–18:00).
  - No **Follow 1**: começa do começo, agora (espera o tempo da 1ª espera inteiro). "Começar no: o começo" não mudou.
  - Se a pessoa **responder** durante essa espera → ✅ (sai da régua), como sempre. Mensagens de antes de entrar não
    contam.
- Antes de clicar em **Adicionar**, aparece a previsão **"Follow N sai: qua 11/11 às 09:00"** (`seqManualForecast` no
  `engine.js`: roda o próprio `seqStep` no tempo, com esperas, "desde a entrada", faixas e horário da automação; a
  mesma conta do Simular). Muda na hora ao trocar a etapa ou a opção.
- Sem migration (o percurso usa os campos de sempre: `node`, `created_at` = entrada, `wait_started_at`, `branches`).
- Testes: `entrystep.test.cjs` (Follow 2 "Esperar o tempo da régua" terça 10:24 → quarta 09:00; "Enviar agora" na
  hora; respondeu → ✅; Follow 1; Follow 4 na faixa) e `chrome-real.test.cjs` (opções, previsão e percurso criado).

### 2.16.5 — troca de id do WhatsApp (c.us ↔ lid) não conta mais como entrada na etiqueta
- **O problema (9/11)**: o WhatsApp trocou o id de ~511 conversas que já estavam na etiqueta "Cliente" (de `@lid` para
  `@c.us` e de volta). A ponte viu o `@c.us` "entrando" e gravou como entrada confirmada; a régua "Avaliação Google"
  criou 511 percursos. Agora a etiqueta nativa **identifica a pessoa pelo telefone** antes de contar uma entrada:
  - **id canônico = o `@lid`** (o da conversa, ou o que o WA-JS mapeia para o `@c.us`, **só pelo cache**
    `lidPnCache`, sem consultar o servidor). Sem `@lid` conhecido, o próprio id. `wa_native_label_seen` é gravada e
    consultada sempre por ele.
  - se o mesmo número (pelo `@lid` do WA-JS, pelo `@c.us` do telefone ou pelo `@lid` do contato do CRM com esse
    telefone) **já tem linha nessa etiqueta** (ativa, ou que saiu nas últimas 24 h), é a **mesma pessoa**: não é entrada
    nova; a linha só passa para o id canônico, com a **mesma** data de entrada ("já estava" continua "já estava").
  - na varredura e nos eventos, a saída de um id com a outra forma do mesmo número presente **não** marca "saiu".
- **Proteção extra**: mais de **20** entradas "confirmadas" de uma vez na mesma etiqueta (num ciclo) = troca de id em
  massa: todas ficam "já estava" e vai um aviso no log da automação (`proteção: N entradas de uma vez = "já estava"`,
  status "pulado", não manda nada). Até 20 continuam contando normalmente.
- **Percurso duplicado**: se a mesma régua tiver percurso ativo para o `@c.us` e para o `@lid` do mesmo número, fica
  só o mais antigo; os outros saem (`status 'saiu'`, `outcome 'id_duplicado'`), antes de qualquer envio.
- **Números do painel (Agora / passos "Esperando…" / Saíram)**: vêm só do banco, iguais em qualquer computador
  ("Motor: este computador" ou "outro computador executa"). Antes dependiam da checagem "o banco tem sequências?"
  guardada por 30 min (uma falha passageira virava "Ninguém entrou ainda") e uma leitura lenta podia segurar a
  atualização. Agora cada leitura tem prazo de 20 s, a lista atualiza a cada minuto e, se uma leitura falhar, ficam
  os últimos números (só aparece "Ninguém entrou ainda" com resposta do banco).
- Sem migration. O vendor WA-JS não foi alterado.
- Testes: `idswap.test.cjs` (500 conversas trocando c.us → lid já na etiqueta → 0 entradas e 0 percursos; 1 entrada
  real continua; proteção dos 20; percurso duplicado; números do painel com a checagem falhando; ponte só pelo cache).

### 2.16.4 — até 10 "esperar resposta" um dentro do outro
- `SEQ_MAX_DEPTH` passou de 5 para **10** (`engine.js`; o servidor, que tinha o 5 fixo, usa o mesmo 10). Dá para
  montar a régua 3 h, dia 1, 3, 7, 15, 25… com 6 ou mais follows.
- Conferido com 10 níveis: validação, os dois menus "+" (construtor visual e editor de sequência: no 10º nível o
  ❓ fica bloqueado com "No máximo 10 …"), Simular, execução e o desenho em cascata (rolagem horizontal até o 10º,
  mesma letra e largura das caixas).
- Testes: `builder.test.cjs` (sequência de 8 níveis: valida, simula e executa as 9 mensagens na ordem; respondeu no
  meio; servidor salva ligada; 10 ok / 11 não) e o Chrome real (passo 24: régua de 10 níveis).

### 2.16.3 — salvar automação incompleta como rascunho
- **"Salvar desligada" sempre salva**, mesmo com caixas incompletas (ex.: ✉ ENVIAR MENSAGEM sem mensagem): vira
  **rascunho** desligado. As caixas incompletas continuam com borda vermelha (também ao abrir o rascunho de novo).
  Sem nome, salva como "Rascunho". O aviso diz quantos itens faltam.
- **Ligar exige tudo completo**: "Salvar e ligar", "Testar comigo" e "Salvar" de uma automação ligada mostram
  **"Para ligar, faltam N itens:"** com a lista ("Follow 3: escolha ou crie a mensagem") e rolam até a 1ª caixa vermelha.
- **Lista de automações**: rascunho incompleto mostra o selo **"RASCUNHO · faltam N itens"**, o interruptor fica
  bloqueado (a dica mostra o que falta) e aparece "Para ligar, complete: …".
- **"Fechar" com alterações não salvas** pergunta **Salvar como rascunho / Descartar / Continuar editando** (numa
  automação ligada: "Salvar (continua ligada)", que precisa estar completa).
- **Servidor**: sequência desligada (e sem conversa de teste) aceita o que falta escolher vazio (mensagem, etiqueta,
  destino, tempo); o formato continua conferido. Ligar pelo interruptor confere a sequência guardada e recusa
  rascunho incompleto ("Complete a automação antes de ligar (…)").
- Também nesta leva (correção da 2.16.0): ao salvar, o `from: 'entrada'` das caixas ⏳/❓ agora fica guardado (antes o
  servidor descartava e a régua voltava a contar "depois da etapa anterior").
- Testes: `sequence.test.cjs` (rascunho aceito desligado, recusado ligado/em teste, ligar rascunho recusado) e o
  Chrome real (passo 23).

### 2.16.2 — "depois que a pessoa ENTROU" como padrão
- **Caixa nova** ⏳ ESPERAR (modo "esperar um tempo") e ❓ ESPERAR RESPOSTA já vem com "Contar o tempo" =
  **depois que a pessoa ENTROU na automação** (`from: 'entrada'`).
- **Modelos prontos** contam desde a entrada, nos mesmos momentos de antes: Régua de follow-up = até o dia 1, 3 e 6;
  Pós-venda = dia 7; Lead novo que sumiu = 1 dia depois da SUA mensagem e depois até o dia 3; Follow-up de lead novo =
  2 h depois da SUA mensagem, depois até o dia 1 e o dia 3. (A espera "contando da MINHA última mensagem" continua
  "depois da etapa anterior".)
- **Caixas já salvas não mudam**: sem `from` continua "depois da etapa anterior".
- Na caixa "desde a entrada" aparece sempre **"dia X desde a entrada"** (ou **"X h desde a entrada"**).
- **Aviso amarelo** (não impede salvar), na caixa e no lado: espera "desde a entrada" com tempo **menor ou igual** ao
  que a espera anterior do mesmo caminho já garante, ex.: Follow 2 em "1 dia" depois de um Follow 1 até o dia 3 →
  "⚠ Conta desde a entrada (dia 1), mas a espera anterior já vai até dia 3 desde a entrada: esta seguiria na hora.
  Aumente o tempo (ex.: dia 4)." Pelo ❌ (não respondeu) e depois de ⏳ conta o prazo inteiro; pelo ✅ só o que havia antes
  (pode ter respondido logo). Atualiza enquanto você digita o tempo.
- Testes: `builder.test.cjs` (modelos, motor com régua nova e com régua salva antiga, aviso), `sequence.test.cjs` e o
  Chrome real (passo 22: aviso amarelo e ⏳ nova pelo "+" já "desde a entrada").

### 2.16.1 — catálogo exportado com as fotos em tamanho cheio
- **Antes:** as fotos exportadas vinham em miniatura (100x133 px): a lista da WA-JS (`getProducts`) pede o catálogo
  em 100x100 e a exportação pegava a URL `requested` (`stp=dst-jpg_p100x100`).
- **Agora:** cada produto é pedido de novo, só leitura, em tamanho grande (`WPP.whatsapp.functions.queryProduct` com
  1080 px; sem ela, `getProductById`) e, das URLs que o WhatsApp devolve, vale a `full` (a original). A URL assinada
  **não é editada** (mudar o `stp` quebra a assinatura).
- **Tamanho conferido nos bytes:** a ponte lê largura x altura do cabeçalho (JPEG, PNG ou WebP). Só sobe foto com o
  **lado maior ≥ 600 px**; miniatura não sobe. Produto que só tem miniatura aparece na lista
  **"sem foto grande: o WhatsApp só deu miniatura (100x133 px)"**. O retrato guarda `width`/`height` de cada foto.
- **Substitui as miniaturas:** ao exportar de novo, as fotos do retrato anterior que saíram são apagadas de
  `wa-media/catalog/<id>/` (só de produtos que ganharam foto nova; o retrato novo é gravado antes). O resultado mostra
  "N fotos antigas (miniatura) apagadas do wa-media".
- Testes: `catalog.test.cjs` (catálogo simulado com foto grande e com só miniatura, medição JPEG/PNG/WebP, limpeza do
  bucket) e o passo 21 do Chrome real (produto "Só Miniatura" 100x133 vai para "sem foto grande").

### 2.16.0 — réguas por "dia desde o primeiro contato" + entrar no meio da régua
- **Espera desde a entrada.** Na caixa **⏳ ESPERAR** (modo "esperar um tempo") e no prazo da **❓ ESPERAR RESPOSTA**,
  "Contar o tempo": **depois da etapa anterior** (como sempre) ou **depois que a pessoa ENTROU na automação**
  (`from: 'entrada'` no jsonb da caixa). Ex.: Follow 3 = "até 3 dias depois de entrar"; a caixa mostra
  **"Espera resposta até 3 dias depois de entrar · dia 3 desde a entrada"**. Um envio atrasado (fora do horário) não
  empurra os próximos. Se o momento já passou (ex.: entrou no meio), segue na hora; se cair fora do horário de envio,
  espera o próximo horário permitido (horário da automação e "enviar só entre" da etapa). Na ❓ "desde a entrada" o
  "contar da MINHA última mensagem" não vale. Respondeu durante a espera → ✅ (sai da régua, como sempre).
- **Hora da entrada** de cada percurso = `created_at` de `wa_sequence_runs` (**sem migration**): lead novo = hora da
  **1ª mensagem do lead** (`wa_leads.first_message_at`); etiqueta = entrada na etiqueta; venda = registro da venda;
  🔁 = inscrição. Percursos antigos: a hora em que foram criados.
- **Entrar no meio da régua** (🔁 na conversa e "Adicionar à automação" no "⋯", a mesma tela): toda régua aparece na lista.
  Escolhida a régua, **"Começar no:"** o começo ou **Follow 1 … Follow N** (as caixas ✉ ENVIAR na ordem do caminho de
  quem não responde, com o dia). A pessoa entra **como se tivesse entrado há X tempo** (o tempo da etapa): o percurso
  nasce já naquela etapa, com os ❌ anteriores marcados, e as próximas seguem a contagem normal.
  **"Enviar esta etapa agora"** = sai assim que o horário da automação deixar; **"No horário marcado"** = passa pela
  espera logo antes da etapa (valem o "até o próximo dia às HH:MM" e o "enviar só entre" dela).
- Uma conversa pode estar em várias réguas; ao entrar por etapa, **"Tirar das outras réguas?"** (marcado por padrão)
  encerra as outras (`outcome: outra_regua`). Entrar de novo na mesma régua encerra o percurso antigo (`reentrou`).
- **Simular**: cada linha com **"dia X · data/hora prevista"** (dia 0 = o dia em que entrou).
- Código: `engine.js` (`seqFromEntry`, `sinceEntryText`, `seqSendSteps`, `seqManualPlan`; `seqStep`/`seqSimulate` com
  `entered_at`), `supabase-api.js` (`seqCreateRuns` grava a entrada; `seqManualEnter`), `content.js` (caixa e Simular do
  construtor; tela "Adicionar à automação").
- Testes: `tests/entrystep.test.cjs` (contagem desde a entrada, atraso que não acumula, já passou → segue, horário fora
  da janela, entrada manual no Follow 4 agora / no horário marcado, respondeu → sai, lead com a hora da 1ª mensagem no
  motor, servidor) e o passo 22 do `tests/chrome-real.test.cjs` (caixa e Simular com "dia X", "Começar no: Follow 4",
  "Tirar das outras réguas?", percurso criado com a entrada de 5 dias atrás; nada enviado).

### 2.15.3 — exportar o catálogo do WhatsApp Business
- Aba **Mídias** → bloco **"CATÁLOGO DO WHATSAPP"** → **"Exportar catálogo do WhatsApp"**. Só lê: **não muda o catálogo
  e não envia nada para ninguém**.
- A ponte lê pela WA-JS 4.7.2 (`WPP.catalog.getProducts`; se vier vazio, `getMyCatalog`; produto sem descrição ou sem
  foto na lista: `getProductById`; coleções por `getCollections`, se existir) **todos os produtos visíveis** (os ocultos
  ficam de fora): id, nome, descrição completa (até 5000 caracteres), preço, preço promocional (só se for menor que o
  preço), moeda, link `https://wa.me/p/<id>/<número da loja>`, coleções, SKU/link do site (se cadastrados) e **todas as
  fotos** (principal + adicionais, até 20 por produto).
- Cada foto é baixada na página do WhatsApp e sobe para o bucket **wa-media** em `catalog/<id do produto>/<sha256>.<ext>`.
  Antes de subir, confere se o arquivo já está lá (mesmo sha256 = mesmo caminho): se está, **reaproveita** sem subir de
  novo. Exportar de novo só sobe as fotos novas.
- O retrato completo fica em `system_config`, chave **`wa_catalog_snapshot`** (JSON: `exported_at`, `phone`,
  `product_count`, `image_count`, `products` com os links das fotos no bucket e a origem de cada uma, `failed`). **Sem
  migration.** Cada exportação troca o retrato anterior.
- No fim: **"N produtos e M fotos exportados em <data>"** (e quantas já estavam no wa-media). Se uma foto ou os detalhes de
  um produto falham, o produto segue com o que deu certo, os outros continuam e aparece a lista **"Com problema"**. Sem
  exportação nesta tela, mostra a data da última.
- Código: `wa-bridge.js` (`catalogExport`, `catalogImage`), `supabase-api.js` (`uploadCatalogImage`,
  `saveCatalogSnapshot`, `catalogSnapshotInfo`), `content.js` (`exportCatalog`, `renderCatalogExport`).
- Testes: `tests/catalog.test.cjs` (ponte com catálogo falso, upload sem duplicar, retrato limpo) e o passo 21 do
  `tests/chrome-real.test.cjs` (Chrome real com catálogo simulado e Storage falso: exporta, lista a foto que falhou, grava
  o retrato, exporta de novo sem subir nada, nenhum envio).

### 2.15.2 — criativo do anúncio no 👁 do Rastreamento (ERP)
- A extensão agora guarda em `wa_ad_attribution`, além do link do post/reel (`source_url`, já guardado desde a 2.6.2),
  a **miniatura do criativo** (`thumbnail_url`: o `thumbnailUrl` do ctwaContext; se não houver e o anúncio for imagem,
  o `mediaUrl`; só https; a miniatura em base64 não é guardada) e o **tipo de mídia** (`media_type`: IMAGE / VIDEO).
- Conversa que já estava na tabela: ganha o link do criativo, a miniatura e o tipo de mídia **só se estavam vazios**
  (como o ctwa_clid). Nada que já foi gravado é trocado.
- Banco: `supabase/migrations/20261112120000_wa_ad_attribution_creative.sql` (add column if not exists). Sem ela, a
  extensão grava como antes (sem a miniatura) e o ERP mostra o bloco sem a miniatura.
- ERP → WhatsApp → Rastreamento → 👁 de uma conversa de anúncio: bloco **"Anúncio"** com o título, a origem
  (Instagram/Facebook), a miniatura (se guardada), **"Ver criativo"** (abre o `source_url` em nova aba) e
  **"Abrir no Gerenciador de Anúncios"** (conta 546602844126870, com o anúncio selecionado). Sem `source_url`: só o
  Gerenciador; sem id do anúncio: só o "Ver criativo". Na tabela, passar o mouse na etiqueta **Meta Ads** mostra o título.
- Código: `wa-bridge.js` (`adSummary`), `supabase-api.js` (`saveAdAttributions`, `getAdAttribution`); no ERP,
  `src/lib/waTracking.ts` (`conversationAd`, `adBadgeTitle`), `src/lib/waTrackingDb.ts` (`loadAdAttributions`) e
  `WaTracking.tsx` (`AdBlock`).
- Testes: `tests/adcreative.test.cjs` e `scripts/tests/waTracking.test.ts` (bloco "Anúncio").

### 2.15.1 — nome completo do cliente na venda (💰)
- O campo **"Nome do cliente"** do 💰 agora vem com o nome completo, nesta ordem:
  1. o nome da **última venda do ERP com o mesmo telefone** (cliente que já comprou). O telefone é procurado nos
     formatos comuns do ERP ("21987654321", "5521987654321", "(21) 98765-4321", "+55 21 98765-4321"…); se nenhum bater,
     vale a última venda desta conversa;
  2. o nome **salvo na sua agenda** do WhatsApp ou o **nome do perfil** (pushname), limpo: sem "~", emojis, números,
     "Cliente", modelos de relógio (Apple Watch, IWO, Series, Pro…) e o que vem depois de "/", "|" ou " - ". Só é usado
     com **2+ palavras** e se a **primeira palavra for o nome aprendido** da conversa (ou se não houver nome aprendido);
  3. o nome aprendido/definido da conversa (só o primeiro nome, como antes).
- Formato com iniciais maiúsculas: "ANA MARIA OLIVEIRA" → "Ana Maria Oliveira" ("da", "de", "do", "das", "dos", "e"
  minúsculos).
- Abaixo do campo aparecem os nomes encontrados como botões pequenos (ex.: **Ana · Ana Maria Oliveira**): um clique
  troca o nome. Só aparece quando há 2 ou mais opções.
- O **{nome}** das mensagens não muda: continua só o primeiro nome.
- Código: `sale-calc.js` (`titleCaseName`, `cleanProfileName`, `customerNameChoice`), `supabase-api.js`
  (`lastSaleCustomerName`), a ponte (`chatPhone` devolve também o nome da agenda e o pushname, separados).
- Testes: `tests/fullname.test.cjs` (perfil com emoji e "~", perfil que não combina com o nome aprendido, cliente que já
  comprou com telefone formatado no ERP, iniciais maiúsculas, botões).

### 2.15.0 — ver mensagens apagadas e editadas
- A extensão guarda **só neste computador** (IndexedDB `tsp-deleted-msgs` do navegador; **nunca** no Supabase nem em
  outro servidor) uma cópia de cada mensagem **recebida do cliente** em conversa individual: o texto e, para mídia, a
  miniatura e, se tiver até 5 MB, o arquivo. Suas mensagens e grupos nunca são guardados.
- Cópias com mais de 7 dias somem sozinhas. Limite total de 200 MB: passando disso, apaga as mais antigas primeiro.
- Quando o cliente **apaga** (evento `chat.msg_revoke` da WA-JS), aparece junto do "Mensagem apagada" o selo
  **"👁 Ver mensagem apagada"**: abre uma janela com o conteúdo original (texto, imagem, áudio tocável, vídeo, documento
  para baixar). Quando ele **edita** (`chat.msg_edited`): selo **"✏️ Ver original"** (mostra o original e cada edição).
- Painel da conversa: lista **"Mensagens apagadas/editadas nesta conversa (últimos 7 dias)"**; clique para abrir.
- Personalizar → "Mensagens apagadas e editadas": **"Guardar mensagens apagadas"** (ligado por padrão; desligado, para
  de guardar) e **"Apagar tudo agora"**.
- Só funciona para mensagens que chegaram com o WhatsApp Web aberto e a extensão ligada. Se o evento não existir ou
  falhar, não aparece nada (sem erro). O arquivo da WA-JS não mudou.
- Arquivo novo: `deleted-store.js` (mundo MAIN, carregado antes de `wa-bridge.js`).
- Testes: `tests/deleted.test.cjs` (o armazenamento de verdade em memória: só recebidas, nada de grupo, 7 dias, 200 MB,
  5 MB, original mantido na edição; a ponte de verdade com eventos falsos de receber/apagar/editar, desligado, apagar
  tudo e sem eventos) e Chrome real (selos, janela com áudio tocável, original + editada, lista no painel,
  Personalizar).

### 2.14.4 — abrir qualquer conversa com um clique
- Acabou o aviso "Conversa não carregada no WhatsApp Web. Procure pelo nome…". Agora uma função única abre a conversa:
  1. pelo id, se ela está carregada na lista (inclusive arquivada);
  2. se não está, pede ao WhatsApp Web para abrir pelo id (WA-JS 4.7.2 `chat.openChatBottom`), também @lid;
  3. se não der, pelo telefone (o do contato ou o do @lid). Telefone só abre depois de `contact.queryExists`
     confirmar que o número tem WhatsApp, então nunca abre uma conversa vazia com número sem WhatsApp.
  4. Só se tudo falhar aparece o aviso com o número e o botão **"Copiar número"**.
- **Quadro**: clicar no nome ou no número do cartão abre a conversa (mão + dica "Abrir conversa"). "Mover para…"
  continua só movendo.
- A mesma função vale na lista de clientes da etiqueta (sem telefone: põe o nome na busca, como antes), Agendados,
  Disparos (prévia e alvos), automações (Simular e Histórico), 📈 Resultados e 💰 vendas.
- Nunca abre grupo. O arquivo da WA-JS não mudou.
- Testes: `tests/openconv.test.cjs` (a ponte de verdade com WA-JS falsa: carregada, não carregada pelo telefone, número
  sem WhatsApp, @lid, grupo; e todos os lugares usando a mesma função) e Chrome real (Agendados: clique abre; falha
  mostra o número e "Copiar número").

### 2.14.3 — horário por dia da semana
- Na caixa ▶ COMEÇA (Horário de envio → Personalizado) e na tela **"Horário geral e limites de segurança"**, o horário
  virou uma **tabela com os 7 dias**, um embaixo do outro (Seg, Ter, Qua, Qui, Sex, Sáb, Dom). Em cada linha:
  - caixinha liga/desliga ("fechado" quando desligada);
  - início e fim da faixa;
  - "+ faixa" para ter mais de uma faixa no mesmo dia (ex.: 09:00–12:00 e 14:00–18:00).
- Atalho **"Copiar para os dias úteis"**: copia a linha de segunda para terça a sexta.
- A frase da caixa virou um resumo curto: "Seg–Sex 19:00–22:00 · Sáb 10:00–14:00".
- O aviso amarelo de "fora do horário comum (08:00–21:00)" passou a ser por linha.
- **Conversão automática**: os horários já salvos (dias marcados + uma faixa para todos) viram a tabela com o mesmo
  resultado, ao abrir a automação ou ao salvar.
- Como fica gravado:
  - automação: no jsonb (`sequence.schedule.week`), sem migration;
  - horário geral: no `system_config` (chave `wa_business_week`), sem migration. Os campos antigos de `wa_settings`
    (dias, início, fim) continuam preenchidos como resumo.
- O motor, o Simular e a previsão dos disparos usam o horário de cada dia. As esperas continuam em tempo corrido
  (2.14.2), então a regra "esperas só no horário comercial" não existe mais.
- Correção da 2.14.2: no assistente de automações antigas, "sem resposta por X dias" ainda contava "dias úteis" de
  expediente. Agora 1 dia = 24 h.
- Testes:
  - `tests/schedule.test.cjs`: sábado com horário diferente, dia fechado, duas faixas no mesmo dia, conversão do
    formato antigo com o mesmo resultado hora a hora, "Copiar para os dias úteis", horário geral por dia no motor e
    na previsão, servidor;
  - Chrome real: a tabela na caixa COMEÇA e na tela geral.

### 2.14.2 — esperas sempre em tempo corrido
- Saiu a opção "Esperas contam só no horário comercial", tanto da caixa ▶ COMEÇA quanto do editor antigo. Toda espera
  agora é em **tempo corrido**: 5 dias são 5 dias de calendário e 2 horas são 2 horas.
- Vale para as réguas (⏳ esperar e ❓ esperar resposta), para a automação antiga "sem resposta por X horas" e para o
  follow antigo.
- Se o envio cair fora do horário de envio, ele espera o próximo horário permitido, como já era.
- Automações que estavam com a opção ligada passam para tempo corrido sem precisar editar. Ao salvar, a régua passa a
  ser gravada com `business: false`.
- O Simular e a previsão contam em tempo corrido. Os textos das telas foram ajustados.
- Testes: `sequence.test.cjs` e `builder.test.cjs` (2 h a partir de sexta 18h30 vencem sexta 20h30; 5 dias = 5 dias
  de calendário; régua antiga com a opção ligada) e o Chrome real.

### 2.14.1 — telas de automação e disparo mais limpas
- Botão **"⋯" (Mais opções)** discreto no canto: os itens menos usados ficam nele e funcionam igual. Fecha ao
  escolher, ao clicar fora e com Esc.
- **Construtor de automação**:
  - no topo ficam só "Salvar desligada", "Salvar e ligar" e "Fechar" + "⋯" (Simular, Testar comigo);
  - ligada: "Salvar", "Salvar e desligar" e "Fechar" + "⋯";
  - em teste: continua o selo **EM TESTE** e o botão "Ligar para todos".
- **Lista de automações**: a seção "Ferramentas" saiu. Simular, Testar com a conversa aberta, Histórico e "Adicionar a
  conversa aberta a uma automação" ficam no "⋯" ao lado do título.
- **Disparo**:
  - formulário: "Salvar" (abre a revisão, como antes) e "Cancelar" + "⋯" (Simular);
  - confirmação: "Iniciar disparo" e "Voltar" + "⋯" (Simular), com a previsão ("N contatos · termina em cerca de…")
    sozinha logo abaixo do botão de iniciar;
  - "Pausar" e "Retomar" continuam no cartão do disparo.
- Nada muda nas regras. Testado no Chrome real, que abre o "⋯" e confere o que fica à vista em cada tela.

### 2.14.0 — disparos mais completos e mais seguros
- **Público por etiqueta do WhatsApp**: em "Para quem", escolha CRM ou WhatsApp e a etiqueta (com "+ Nova etiqueta…").
  - A extensão lê pela WA-JS **todas** as conversas da etiqueta do WhatsApp, inclusive as não carregadas e as
    arquivadas, e mostra "N contatos nesta etiqueta" antes de começar.
  - Conversa `@lid` com telefone recebe pelo número. Conversa da etiqueta que não está carregada também recebe, porque
    ela existe e só não está na lista.
  - Os filtros "também tem a etiqueta" e "NÃO tem a etiqueta" aceitam CRM e WhatsApp.
- **Depois de enviar**: colocar e tirar etiqueta CRM ou do WhatsApp, inclusive "Todas menos a que vou colocar".
  "Não enviar" nunca sai. Com público do WhatsApp sem contato no CRM, o contato é criado pelo telefone para receber a
  etiqueta CRM.
- **"Excluir quem recebeu qualquer envio automático nos últimos X dias"**: agora fica desligado por padrão, em
  "Opções avançadas", com a explicação de que serve para não somar follow-up e disparo no mesmo dia. Quem tem "Não
  enviar" (CRM ou WhatsApp) continua sempre fora.
- **Velocidade e segurança**:

  | Modelo | Intervalo | Por hora | Por dia | Pausa |
  | --- | --- | --- | --- | --- |
  | Bem seguro | 90–180 s | 20 | 100 | 10 min a cada 15 envios |
  | Normal | 45–120 s | 30 | 150 | 5 min a cada 20 envios |

  - **Personalizado**: intervalo mínimo e máximo, por hora, por dia, "pausar X min a cada N envios", e dias e horário
    próprios (ou o horário geral). Um disparo com horário próprio pode rodar fora do horário geral.
  - **Limite duro**, que nenhum disparo passa: intervalo mínimo de 20 s, 60 por hora e 400 por dia. A tela e o
    servidor recusam valores acima disso.
  - Velocidade acima do "Normal" mostra o aviso amarelo de risco de bloqueio.
  - **Previsão**: "N contatos · termina em cerca de X h (hoje/amanhã às HH:MM)", no formulário, no Simular e na
    confirmação.
  - O limite por hora e por dia do disparo conta o disparo **somado** com as automações e os agendados. Os limites
    gerais e o intervalo geral também valem.
- **Variações da mensagem**:
  - "+ Variação" cria até 5 versões alternativas do texto; fotos, áudios e as outras partes ficam iguais.
  - A distribuição pode ser alternada (1ª, 2ª, 1ª…), aleatória ou por porcentagem (exata e intercalada).
  - `{Oi|Olá|Oiii}` sorteia uma palavra a cada envio. `{nome}` e `{, nome}` continuam como antes.
  - Na prévia, o botão "Ver outra variação" mostra as outras versões.
  - O resultado por variação (enviadas, responderam %, vendas) aparece nos alvos do disparo e na aba **Resultados** do
    ERP.
- Continuam como antes: prévia, "Salvar e revisar", Simular, pausar/retomar, e o disparo só começa com a confirmação.
- **Migration `supabase/migrations/20261111120000_wa_campaigns_v214.sql`** (você aplica). Ela cria:
  - em `wa_campaigns`: as colunas `audience`, `speed` e `variants`, e `skip_recent_days` com 0 como padrão;
  - em `wa_send_log`: a coluna `variant`.

  Sem ela, o disparo funciona como antes (CRM, velocidade geral, sem variações).
- Correções na tela de disparo:
  - as etiquetas do WhatsApp são relidas ao abrir o formulário (antes a lista podia ficar velha ou em "Carregando…");
  - a tela dos alvos mostra por que o disparo está esperando (intervalo, pausa, limite somado, fora do horário).
- Testes:
  - `tests/campaign.test.cjs`: modelos, limite duro, pausa a cada N, soma com automações, horário próprio, previsão,
    variações, `{a|b}` e o servidor (público do WhatsApp com conversa não carregada, filtros, ações, resultado por
    variação, sem a migration);
  - Chrome real, seção 18: o disparo inteiro com o motor de verdade enviando para uma conversa carregada e para uma
    não carregada, com as variações alternando, `{Oi|Olá}`, pelo menos 20 s entre envios, a etiqueta do WhatsApp depois
    de enviar e a variação no log;
  - ERP: `scripts/tests/waResults.test.ts`, resultado por variação.

### 2.13.4 — criar etiqueta na hora, em qualquer lista
- Toda lista de etiquetas tem **"+ Nova etiqueta…"** como primeira opção. Isso vale para o editor de mensagem rápida
  ("Ao enviar, colocar/tirar"), a venda 💰, os disparos e seus filtros, as automações antigas (gatilho, condições,
  ações, variantes), as sequências e o construtor visual. Escolhendo a opção, abre ali mesmo um campo pequeno
  (nome + cor) com "Criar" e "Cancelar". A etiqueta criada é salva e já fica escolhida naquela lista, sem sair da tela
  e sem perder o que estava sendo editado.
- Vale para etiqueta **CRM** e para etiqueta do **WhatsApp**. A do WhatsApp é criada no WhatsApp Business pela WA-JS
  4.7.2 (`labels.addNewLabel`, com as cores da paleta do WhatsApp). Em conta que não é Business, a opção aparece como
  "indisponível: só no WhatsApp Business". A lista do gatilho mista oferece as duas opções.
- Nome repetido (sem diferenciar maiúsculas): avisa "Já existe" e escolhe a existente.
- Uma função só (`withLabelCreate`) reaproveitada em todas as listas. O atalho 🏷️ do cabeçalho já tinha
  "+ Nova etiqueta". A cópia de etiqueta do WhatsApp para CRM já tinha "Criar nova com o mesmo nome".
- Correção da 2.13.2: uma régua com ⏳ "até o próximo dia às…" voltava com "Escolha quanto tempo esperar" ao ser
  reaberta e salva de novo.
- Testes: `tests/labelcreate.test.cjs` e o Chrome real, seção 17 (cria uma CRM com cor, trata o nome repetido, cria
  uma do WhatsApp pela ponte simulada e salva).

### 2.13.3 — nome da conversa a partir da venda
- Ao registrar a venda pelo 💰, ou ao ligar uma venda do ERP à conversa (📈, inclusive a ligação automática pelo
  telefone), o "Nome para mensagens" da conversa vira o **primeiro nome do cliente da venda** ("MARIA DA SILVA" →
  "Maria"; sem "Cliente", sem números, primeira letra maiúscula), com a origem **"da venda"** no painel.
- Ordem do {nome}: **definido à mão → da venda → aprendido da sua mensagem → vazio**. O definido à mão nunca é trocado;
  o aprendido não troca o da venda; uma venda nova troca o nome "da venda".
- **Migration `supabase/migrations/20261110130000_wa_chat_names_venda.sql`** (só amplia as origens permitidas; você
  aplica). Sem ela, a venda e a ligação funcionam igual — o nome só não é gravado.
- Testes: `tests/salename.test.cjs` e o Chrome real (💰 registrar troca o aprendido "Maria" pelo "da venda").

### 2.13.2 — horários por automação e por etapa
- **Caixa ▶ COMEÇA → "Horário de envio"**: "Usar o horário geral" (padrão; mostra qual é) ou **Personalizado**: dias da
  semana + uma ou mais faixas (ex.: 09:00–12:00 e 14:00–18:00) e "Limite desta automação por dia" (vazio = sem limite
  próprio). A caixa mostra a frase ("Envia entre 14:00 e 18:00, seg–sex").
- **Caixa ⏳ ESPERAR**: além de "esperar X tempo", "**Esperar até o próximo [dia / dia da semana] às HH:MM**" (ex.:
  amanhã às 10:00) e "**Depois da espera, enviar só entre HH:MM e HH:MM**" (fora da faixa: espera a próxima).
  **Caixa ❓ ESPERAR RESPOSTA**: o mesmo "enviar só entre" (o prazo conta normal; o envio seguinte, ✅ ou ❌, respeita a
  faixa).
- **Ordem das regras**: faixa da etapa → horário da automação (geral ou personalizado) → limites gerais por hora/dia e
  intervalo entre envios (sempre valem). Uma régua com horário personalizado pode enviar fora do horário geral (ex.:
  domingo); disparos e agendados continuam no horário geral. Faixa fora de 08:00–21:00: aviso amarelo ("mensagem fora
  do horário comum pode incomodar"), mas deixa. Fora da janela, o painel da conversa mostra "faltam…" até a próxima.
- **Simular** mostra a data e a hora previstas de cada passo (horário da automação, faixas e esperas).
- A tela "Limites e horário" virou **"Horário geral e limites de segurança"**, explicando que é o padrão das automações
  e que os limites valem sempre.
- Tudo guardado no jsonb da automação (`sequence.schedule`, `mode/until_day/until_time` e `send_window` nas caixas):
  **sem migration**.
- Testes: `tests/schedule.test.cjs` (janela personalizada, esperar até amanhã 10:00, fora da janela espera a próxima,
  limites gerais e o limite próprio por dia, domingo com horário personalizado, servidor) e o Chrome real.

### 2.13.1 — excluir mensagem rápida que está em uso
- O erro "Supabase 400 … 23514 Failing row contains …" vinha da regra de `wa_schedules` (mensagem ou texto
  obrigatório): ao excluir a mensagem, o agendamento antigo já enviado ficava sem as duas. A regra nova (já aplicada
  no banco) só exige isso de agendamento **pendente**: `wa_schedules_item_or_body_check`. Registrada em
  `supabase/migrations/20261110120000_wa_schedules_item_or_body.sql` (pode rodar de novo sem erro).
- **Antes de excluir**, a extensão confere onde a mensagem está em uso e, se estiver, não exclui e mostra onde:
  "Esta mensagem está em N agendamento(s) pendente(s)" (conversa e data), automações/réguas (inclusive as caixas ✉ do
  construtor e as variantes), réguas de follow antigas e disparos não terminados — "Cancele ou troque antes de excluir."
  O banco confere de novo na hora de apagar (se alguém usar a mensagem no meio, aparece a lista).
- **Erro do banco ao excluir** vira uma frase clara (ex.: "O banco recusou excluir: um agendamento antigo ainda aponta
  para esta mensagem…"); o texto técnico fica em "Detalhes".
- Testes: `tests/itemdelete.test.cjs` e o Chrome real (em uso num agendamento pendente e numa régua; erro 23514 com
  "Detalhes"; mensagem livre exclui).

### ERP (09/11) — botão "Atualizar", F5 sem voltar ao Início e aviso de versão nova
- **F5 volta para a mesma página**: a página e a sub-aba ficam no endereço (`?pagina=whatsapp&aba=rastreamento`;
  os outros parâmetros e os links "Abrir no ERP" da extensão continuam valendo) e no navegador. Ao abrir (depois do
  login): link da extensão → endereço → última página aberta → Início. Sub-abas lembradas: WhatsApp (Painel /
  Rastreamento / Resultados), Controle de Estoque e Marketing. **Voltar/avançar** do navegador navegam entre as
  páginas do ERP (trocar de sub-aba não cria entrada nova).
- **Botão "Atualizar" (↻)** no topo de todas as páginas, ao lado do "Ao vivo": recarrega os dados da página aberta
  sem recarregar o site (cada página chama a própria função de recarregar), mantendo página, sub-aba, período e
  filtros. Gira enquanto carrega e depois mostra "Atualizado às HH:MM". Atalho: **tecla R** (quando não estiver
  digitando num campo; Ctrl+R continua sendo o do navegador). Na **Nova Venda** com algo preenchido (e em
  Configurações com mudança não salva) ele pergunta antes; na Nova Venda ele só recarrega as listas (produtos,
  motoboys…) e o que foi digitado continua.
- **Aviso de versão nova**: a cada 2 minutos (e ao voltar para a aba) confere se o `index.html` publicado na Vercel
  aponta para arquivos `/assets/…` diferentes dos carregados. Se mudou, aparece a faixa "Nova versão do sistema
  disponível · Atualizar" no topo. Nunca recarrega sozinho; clicar recarrega e volta para a mesma página.
- Nada muda nas regras das páginas. Arquivos: `src/lib/erpRoute.ts`, `src/lib/erpRefresh.ts`, `src/lib/erpVersion.ts`.
- Testes: `scripts/tests/erpRoute.test.ts` (endereço, guardado, link da extensão, histórico, "Atualizar", tecla R,
  versão nova) e o novo Chrome real do ERP inteiro `scripts/tests/erpChrome.test.ts` (F5 volta para WhatsApp →
  Rastreamento, voltar/avançar, "Atualizar" e tecla R mantêm 30 dias + Meta Ads, Nova Venda pergunta antes, faixa de
  versão nova sem recarregar sozinho e o "Atualizar" dela volta para a mesma página).

### ERP (09/11) — aba WhatsApp: 3 abas sem repetição (Painel · Rastreamento · Resultados)
Cada aba responde uma pergunta; nenhum gráfico aparece em duas. Tudo agregado sem o limite de 1000 linhas,
claro/escuro, com esqueleto ao carregar.
- **Painel ("como estou?")**: período no topo e comparação com o anterior (▲▼ %). Cartões: Conversas ativas · Leads
  novos (anúncio / orgânico) · Vendas pelo WhatsApp (qtd e R$) · Ticket médio · Conversão lead → venda · Vendas de
  anúncio (R$ e % do faturamento) · Vendas depois de follow-up (R$ e %) · **Aguardando 1ª resposta agora** (leads dos
  últimos 7 dias sem resposta da loja). "Leads × vendas por dia", mapa de horários e o resultado por anúncio. Saíram
  daqui o funil dos follow-ups e as tabelas de mensagem rápida / automações (agora em Resultados).
- **Rastreamento (como o Tintim; azul = Meta Ads, laranja = Não rastreada)**: no topo "Conversas aguardando primeira
  resposta" (com "Ver conversas", que filtra a tabela) e "Tempo médio de jornada" (do 1º contato até a venda);
  filtros (período com De/Até, Todas as origens / Meta Ads / Não rastreada, "Baixar relatório" CSV); "Visão geral
  das conversas" (total de conversas novas ativas, rastreadas e não rastreadas com %, tempo médio de 1ª resposta com
  "Calcular a partir da 2ª mensagem", meia-lua); "Origem das conversas" (barras empilhadas por dia com o número
  dentro); "Funil da jornada de compra" (Fez contato → Comprou, blocos azuis); "Vendas" (data do 1º contato / da
  venda, total, faturamento, barras, "Baixar relatório de vendas"); a tabela **Conversas** (totais, busca por
  telefone ou nome, origem, "Conversas aguardando primeira resposta", etapa; colunas Contato · Origem (Meta Ads +
  anúncio ou "Via Campanha de Mensagem", ou Não rastreada) · Etapa da jornada · Primeira · Última mensagem (ao vivo,
  mais recente primeiro) · Ações: 👁 lateral com a linha do tempo da conversa e 💬 abrir no WhatsApp; 25 por página)
  e os **Eventos enviados ao Facebook**.
- **Resultados ("meus follow-ups funcionam?")**: "Funil por caminho" (um bloco por automação/régua e sequência:
  "FOLLOW 1 → FOLLOW 2 → FOLLOW 3", "N entraram · N compraram (x%) · R$" e, por etapa, quantas chegaram, "💬 x%
  responderam (n · em X min)", "💰 n compraram · R$", "↓ x% seguiram · Xd depois"); "Acumulados" (follow-ups fora de
  régua, por etapa); "Resultado por mensagem de follow-up"; "Disparos"; rodapé "Vendas pelo WhatsApp: N (R$) · N
  depois de um follow · N vieram de anúncio". Regras no (i): respondeu = mensagem do cliente depois do envio e antes
  do próximo follow; comprou = venda até 7 dias depois do último follow recebido; seguiu = recebeu a etapa seguinte.
  "Vendas depois de follow-up" (Painel e rodapé) agora conta também os envios das automações/réguas.
- Testes: `scripts/tests/waResults.test.ts` (novo), `waTracking.test.ts`, `waPanel.test.ts` e o Chrome real
  `scripts/tests/waChrome.test.ts` (abre as 3 abas, paginação, filtros, "Ver conversas", lateral 👁, vendas,
  Resultados). Sem migration nova.

### 2.13.0 — construtor visual de automações (em cascata)
- **"+ Nova automação" e "Editar" abrem uma tela ampla por cima do WhatsApp Web** (fundo claro): nome e botões no
  topo (**Simular · Testar comigo · Salvar desligada · Salvar e ligar · Fechar**), o desenho no meio e a edição da
  caixa escolhida no quadro da direita. Rolagem e zoom (− / + / ↺). Esc fecha.
- **O desenho em cascata**: caixas ligadas por linhas, de cima para baixo; um **"+"** entre duas caixas insere
  outra ali; clicar numa caixa abre a edição dela. Cada caixa diz numa frase o que faz.
- **Caixas**: ▶ **COMEÇA** (a primeira, uma só: entrar numa etiqueta CRM ou do WhatsApp · lead novo — todos / só
  anúncio / só orgânico · venda registrada · adicionada por mim pelo 🔁; "Quem entra: só daqui pra frente (padrão) /
  também quem já está" com a contagem e a lista; "Só no horário comercial"; "Nunca para quem tem a etiqueta": o
  **Não enviar sempre** + outras) · ✉ **ENVIAR MENSAGEM** (mensagem pronta com busca e prévia, ou "+ Criar mensagem
  aqui", o mesmo editor das mensagens rápidas) · ⏳ **ESPERAR** (só o tempo, sem caminhos) · ❓ **ESPERAR RESPOSTA**
  (abre dois caminhos lado a lado: ✅ Se responder / ❌ Se não responder; até 10 níveis) · 🏷 **ETIQUETA** (colocar ou
  tirar, CRM ou WhatsApp; "tirar de todas menos a que vou colocar"; o Não enviar nunca sai) · ⏹ **FIM**. Todo
  caminho termina em FIM (posto sozinho). ❓ inserido no meio leva o que vinha embaixo para o ❌.
- **Validação visual**: caixa incompleta fica com borda vermelha e a frase do que falta ("Escolha ou crie a
  mensagem."); não liga (nem testa) com caixa vermelha.
- **Modelos já desenhados**: Régua de follow-up (3 etapas) · Pós-venda · Lead novo que sumiu · Em branco. Mensagens
  com o mesmo título da sugestão ("Follow 1"…) já vêm escolhidas; etiquetas que não existem são criadas ao salvar.
  Os modelos antigos continuam em "Mais modelos (editor antigo)".
- **Simular**: linha do tempo de quem nunca responde e de quem responde no 1º passo (nada é enviado).
  **Testar comigo**: escolhe a conversa (a aberta já vem), só ela recebe (EM TESTE). **Salvar e ligar**: "Vale para
  quem se encaixar daqui pra frente. N já estão e não vão receber." (ou a lista, se escolheu incluir).
- **Mesmo motor das sequências da 2.12.0** (mesmo jsonb, limites, horário, Não enviar, só daqui pra frente).
  Novidades no motor: ⏳ ESPERAR (`type: 'pausa'`), "Nunca para quem tem a etiqueta" (`start.exclude`; quem tem sai
  com `etiqueta_excluida`), o "Não enviar" do WhatsApp também tira da automação e nunca é tirado; mudar o COMEÇA de
  uma automação ligada vale daqui pra frente de novo. **Sem migration nova.**
- **Automações antigas abrem no desenho** quando dá (entrou na etiqueta, venda registrada, não respondeu); ao salvar,
  passam a rodar como régua. As que não dá (O cliente respondeu, dia e hora fixos, condições "Só se…", variantes)
  abrem no editor antigo com o aviso "Editor antigo: …".
- Na conversa e na lista nada muda (já existiam desde a 2.12.0): "Na automação X · esperando resposta (faltam 3h)"
  com "Tirar da automação" / "Pular espera"; interruptor, frase-resumo, quantos em cada caixa e saídas por ✅/❌.
- Prints em `screenshots/2.13.0` (régua de 3 etapas, caixa incompleta em vermelho, simulação). Testes:
  `tests/builder.test.cjs` (modelos; respondeu no 1º passo; não respondeu até o fim; resposta durante a espera;
  incluir quem já está; ⏳; exclusões; FIM automático; "+"; simulação; conversão; servidor) e o Chrome real (montar
  a régua pelo modelo, trocar mensagem, caixa vermelha, simular, testar comigo, ligar para todos).

### 2.12.8 + ERP — conversas como no Tintim (todas as conversas, ativas x leads novos, ao vivo)
- **Precisa da migration `supabase/migrations/20261109120000_wa_chat_activity.sql`** (tabelas `wa_chat_activity` e
  `wa_chat_activity_days`, mesmas políticas das `wa_*`, já preparada para a Fase 2 e com o "desfazer" no topo).
  Sem ela, a extensão e o ERP continuam como antes (só os leads de `wa_leads`) e o ERP avisa "Ainda sem: conversas
  ativas…".
- **A extensão registra TODAS as conversas individuais**, não só os leads novos. Para cada conversa grava: telefone,
  nome, quando viu pela 1ª vez, a 1ª mensagem (se souber), a última mensagem e de quem foi (cliente/loja), a última
  do cliente, se é lead novo e, por dia, se o cliente e/ou a loja falaram. Nunca o texto. Só a aba com a trava
  grava, e **no máximo 1 vez por conversa a cada 30 s** (o que chega no meio espera e vai junto).
- **Ao abrir o WhatsApp Web**, a extensão varre todas as conversas individuais com mensagem nas **últimas 72 h**
  (WPP.chat.list, inclusive as que não estão na tela). Para saber se é lead novo, usa as mensagens carregadas e,
  só quando não dá para saber, carrega as antigas pela WA-JS (até 150 conversas, 50 mensagens cada, no máximo
  ~1,5 min, sem segurar o motor de envios). Assim **quem chamou com o PC desligado entra quando você abrir**
  (também em `wa_leads`, como antes; antes eram só 24 h e só as conversas carregadas).
- **Painel e Rastreamento**: dois números separados, cada um com (i):
  - **Conversas ativas**: conversas em que o cliente mandou mensagem no período (novas ou antigas), igual ao
    "Conversas novas ativas" do Tintim;
  - **Leads novos**: conversas que falaram com a loja pela 1ª vez no período (anúncio/orgânico).
- **Tabela "Conversas" do Rastreamento**: mostra todas as conversas ativas do período (não só leads), com a etapa
  (Fez contato / Respondeu / Comprou + valor) e de quem foi a última mensagem; ordem padrão **última mensagem, mais
  recente primeiro**; atualiza sozinha a cada 30 s com o selo **Ao vivo** (quando o período inclui hoje) sem sair
  da página em que você está; **Próxima/Anterior** corrigidos ("Página X de Y · N conversas", 25 por página); filtro
  de etapa **Todas / Comprou / Respondeu / Só fez contato**.
- **Saiu "Possíveis vendas não marcadas"**, e a extensão **parou de gravar o sinal de compra** (`buy_signal_at` fica
  no banco, sem uso).
- **Eventos enviados ao Facebook**: Próxima/Anterior corrigidos (carrega os eventos do período e pagina na tela, sem
  depender da contagem do Supabase) e filtro **Todos / Compras / Contatos**.
- Testes: `tests/panel.test.cjs` (atividade sem sinal de compra, 1 gravação a cada 30 s, upsert das duas tabelas,
  varredura de 72 h com mensagens antigas carregadas só quando precisa), Chrome real da extensão (a varredura da
  abertura grava a atividade e o lead que chegou com o PC desligado), `scripts/tests/waTracking.test.ts` e
  `scripts/tests/waPanel.test.ts` (conversas ativas x leads novos, ordem, filtro de etapa, paginação) e o novo
  **`scripts/tests/waChrome.test.ts`**: a aba WhatsApp do ERP no Chrome real, com um Supabase falso (Painel,
  cartões, Próxima/Anterior, Ao vivo sem voltar para a página 1, filtros de etapa e de evento).

### 2.12.7 — busca de produtos por pedaços de palavras (💰 e Nova Venda do ERP)
- A busca "Digite modelo, cor ou nome do acessório..." do 💰 e da **Nova Venda** do ERP agora acha por pedaços:
  "pul ros go 38" acha "Pulseira Aço Milanese Rose Gold 38/41mm". Cada pedaço (separado por espaço) tem que
  aparecer em "modelo + cor" (produto) ou no nome (acessório), em qualquer ordem.
- Sem diferença de maiúsculas e acentos (aço = aco); "/", "-" e "." não contam (38/41 acha com "38" ou "3841").
- Ordem: primeiro os que têm os pedaços no começo das palavras; empate pelo mais recente (data de cadastro), senão
  alfabético. O pedaço achado aparece **em negrito**.
- **Enter** adiciona o primeiro da lista (**↑ ↓** escolhem outro), limpa a busca e o cursor volta para ela.
- A busca é uma função só: `src/lib/productSearch.ts` no ERP e a cópia `product-search.js` na extensão.
- Testes: `tests/search.test.cjs`, `scripts/tests/productSearch.test.ts` (as duas cópias são iguais e dão o mesmo
  resultado; "pul ros go 38", "s11 rose", "aco mil", ordem dos pedaços) e o Chrome real (negrito, ↑↓, Enter).

### 2.12.6 — ligar/desligar as automações mais simples
- O editor da automação não tem mais a caixa **"Ativa"** nem o quadro **"Segurança"** no meio. Perto dos botões fica
  só a linha: "Só vale para quem entrar depois de ligar. Nunca envia para 'Não enviar'."
- Botões no fim do editor:
  - automação desligada (ou nova): **Salvar desligada** (cinza), **Salvar e ligar** (laranja) e **Testar comigo**;
  - automação ligada: **Salvar** (continua ligada) e **Salvar e desligar**;
  - em teste: **Salvar**, **Salvar e desligar** e **Ligar para todos**.
- **Salvar e ligar** (e "Ligar para todos", e o interruptor da lista) abre uma confirmação só: "Ligar 'Pedido de
  avaliação'? Vale só para quem entrar na etiqueta CLIENTE - TESTE a partir de agora. 16 contatos que já estão nela
  não vão receber." [Ligar] [Cancelar]. Incluir quem já está na etiqueta fica em **Opções avançadas** (fechado e
  desmarcado); marcando, aparece a lista e o botão vira "Ligar e incluir 16".
- **Testar comigo**: escolhe a conversa (a aberta já vem escolhida) e liga só para ela ("EM TESTE" na lista). **Ligar
  para todos** sai do teste pela mesma confirmação, e o "daqui pra frente" recomeça nessa hora.
- Na lista: um **interruptor** liga/desliga em cada automação (ligar abre a confirmação; desligar é na hora) e a
  etiqueta EM TESTE quando for o caso.
- Nada mudou nas regras (só daqui pra frente, limites, horário, "Não enviar").
- Testes: `tests/activation.test.cjs` (a frase da confirmação, os botões de cada estado, o interruptor) e o Chrome
  real (editor ligado/desligado/em teste, confirmação com opções avançadas, "Ligar e incluir 23", "Testar comigo",
  "Ligar para todos", interruptor).

### 2.12.5 — "só daqui pra frente" à prova de falhas para etiquetas do WhatsApp
- Antes: ao ligar uma automação/sequência com gatilho de etiqueta do WhatsApp, só as conversas **carregadas** no
  WhatsApp Web eram registradas como "já estavam"; um contato antigo que carregava depois era visto pela 1ª vez e
  contava como entrada nova.
- **Ao ligar (e ao salvar com o gatilho/etiqueta trocado)**: a extensão lê TODAS as conversas que têm a etiqueta pelas
  associações da etiqueta na WA-JS (inclusive as que não estão carregadas na lista e as arquivadas) e registra todas
  como "já estavam". A tela de ligar mostra o total, e a mensagem diz "23 contatos com a etiqueta Cliente ficaram de
  fora". Vale também para a sequência que começa por etiqueta do WhatsApp (o motor agora acompanha essas etiquetas).
- **Regra extra de segurança**: para etiqueta do WhatsApp, só conta como "entrou depois" quando a extensão VIU a
  conversa SEM a etiqueta e depois COM ela (a ponte lembra as etiquetas de cada conversa que já viu), quando a
  conversa tinha saído da etiqueta e voltou (conta logo depois da saída vista), ou quando a etiqueta foi posta pela
  própria extensão (painel, automação, venda). Conversa que aparece pela 1ª vez já com a etiqueta fica registrada como
  "já estava" (data de entrada 01/01/2000, que nunca passa da ativação) e não dispara — mesmo que o registro ao
  ligar tenha falhado. "Incluir quem já estava" continua funcionando.
- Na lista das automações: **"Ignorados por já estarem na etiqueta: N"** (quem está na etiqueta e entrou antes de
  ligar).
- Etiquetas CRM: sem mudança (já têm a data certa de entrada). Sem migration.
- Testes: `tests/labelsafety.test.cjs` (lista completa da etiqueta, entrada vista × 1ª aparição, etiqueta posta pela
  extensão, varredura/eventos/registro no banco, "ignorados", e de ponta a ponta: contato antigo não carregado NÃO
  dispara; contato que recebe a etiqueta depois de ligar dispara) e o Chrome real (ligar com 23 conversas na
  etiqueta, registro, mensagem e "Ignorados").

### 2.12.4 — 💰 etiquetas e automações ao registrar a venda
- Conferido: a etiqueta CRM **era gravada** (as vendas do 💰 de 07/11 — Joyce Lima e Carlos Quinteiro — ganharam a
  etiqueta CRM "Cliente" 2 s depois da venda). Ela só não aparecia na lista de conversas porque é do CRM, não do
  WhatsApp Business.
- No fim do formulário, "Ao registrar a venda" agora tem:
  - **Tirar de todas as automações e sequências** (marcado por padrão): sai de todas as automações (pela etiqueta CRM,
    pela etiqueta do WhatsApp ou adicionada pelo 🔁) e das sequências ativas desta conversa — menos as de "Venda
    registrada" e as sequências que começam pela venda (o pós-venda continua). As etiquetas não são mexidas por isso.
  - **Etiqueta do WhatsApp ao registrar** (padrão: a etiqueta do WhatsApp chamada "Cliente", se existir) e **Tirar das
    etiquetas do WhatsApp**: Nenhuma (padrão), uma etiqueta ou "Todas (menos a que vai colocar)".
  - **Etiqueta CRM ao registrar**: "Não mexe" (padrão) ou uma etiqueta CRM.
  - A última escolha fica lembrada neste computador (`chrome.storage.local`, `saleAfterPrefs`).
  - A etiqueta **"Não enviar" nunca é retirada** (nem aparece para tirar).
- Tudo isso só é feito **depois que a venda foi gravada**. Se a venda falhar, nada é mexido e o aviso diz isso. Na tela
  "Venda registrada" aparece cada parte com ✓ (o que fez) ou ✗ (o motivo), para fazer à mão só o que falhou.
- Testes: `tests/saleafter.test.cjs` (padrões, escolha lembrada, "Não enviar", "Todas menos a que vai colocar",
  etiqueta apagada, a ordem venda → etiquetas) e o Chrome real (padrões na tela, venda que falha sem mexer em nada,
  depois da venda: CRM, sequência de lead encerrada e a de pós-venda mantida, EMBALAR tirada, CLIENTE colocada,
  "Não enviar" intacta, e a escolha lembrada no formulário seguinte).

### ERP (07/11) — aba WhatsApp: só Painel e Rastreamento + vendas no Rastreamento
- Sub-abas: **Painel · Rastreamento**. Saíram as telas "Clientes → CRM", "Pós-venda automático", "Resultados",
  "Mensagens (antigo)" e "Conversões (Facebook)" — tudo isso é feito pela extensão. Nenhuma tabela ou dado foi
  apagado. "Pós-venda automático" estava **desligado** (`wa_settings.auto_client_enabled = false`, sem etiqueta):
  o gatilho `sales_wa_auto_client_label` continua no banco e não faz nada; para pôr o cliente numa etiqueta depois
  da venda, use as Automações da extensão (gatilho "Venda registrada").
- "Conversões (Facebook)" virou a seção **Eventos enviados ao Facebook** no fim do Rastreamento (mesmos cartões,
  filtros De/Até — que acompanham o período da aba — e a tabela com a coluna Venda do ERP).
- **Vendas no Rastreamento** ("Vendas das conversas" R$ 0,00 e "Comprou" 0% com vendas no dia). Duas causas:
  1. as vendas do último dia (hoje) não eram carregadas: o filtro era `sale_date <= dia`, e `sale_date` tem hora;
  2. só entravam conversas registradas em `wa_leads`/`wa_ad_attribution`; conversas que já existiam antes do
     rastreamento (as @lid de Joyce Lima, Bruno Gomes e Lucas Azevedo) e a venda ligada pelo 📈
     (`wa_conversion_events.sale_id`) eram ignoradas.
  Agora a venda conta para a conversa quando foi registrada pelo 💰, ligada pelo 📈 ou é do ERP com o telefone da
  conversa (o @lid é ligado ao telefone pela própria venda do 💰). Conversa sem registro do início entra pelo chat da
  venda, marcada "início não registrado", com as vendas do período (fora da média da 1ª resposta). O (i) na etapa
  da tabela mostra como cada venda foi ligada. O cartão "Conversas" mostra quantas são novas e quantas já existiam.
- **Tempo médio da 1ª resposta**: por padrão só no horário comercial do motor de envios (`wa_settings`:
  dias, início e fim, no horário de São Paulo), com a opção de desligar.
- Testes: `scripts/tests/waTracking.test.ts` (réplica das vendas de 07/11, @lid × telefone, venda pelo telefone,
  conversa antiga só com as vendas do período, filtro do último dia, horário do motor).

### 2.12.3 — 💰 Venda pelo WhatsApp igual à "Nova Venda" do ERP
- O formulário do 💰 agora espelha a tela **Nova Venda** do ERP (`src/pages/Sales.tsx`), compacto, com as
  seções recolhíveis (clique no título; o que foi digitado fica) e campos lado a lado quando o painel está largo:
  - **Data da venda** (padrão hoje; as taxas do link de pagamento seguem essa data, como no ERP).
  - **Produtos**: a mesma busca do ERP (modelo, cor ou acessório; sem resultado → "Adicionar manualmente").
    Cada produto com **Qtd**, **Custo (R$)** (vem o custo do produto e dá para editar) e **Preço venda (R$)**;
    **Acessórios** com Qtd e custo; **Itens manuais** com nome, Qtd, custo e preço.
  - **Cliente**: nome (o aprendido/salvo da conversa ou o do WhatsApp), telefone desta conversa (trava da 2.6.3),
    CPF (opcional, validado), **📋 Colar formulário** (a mesma leitura do ERP), "Pegar endereço da conversa",
    CEP (com 8 dígitos busca rua, UF, cidade e bairro no ViaCEP, como o ERP), UF, Rua, Número, Complemento,
    Cidade, Bairro e **Fornecedor** (com 2 ou mais smartwatches, um fornecedor por smartwatch).
  - **Pagamento**: várias formas ("+ Adicionar forma de pagamento"), as mesmas opções, bandeiras e parcelas com a
    taxa, valor bruto/líquido em "Outros", a taxa de cada forma, **Pago / A cobrar** e "Total da venda · Alocado ·
    Falta alocar".
  - **Entrega**: tipo (Loja Física, Motoboy, Correios), motoboy, taxa de entrega, custo Correios (começa em
    R$ 13,11, como no ERP), observações e os volumes (automático).
  - **Resumo financeiro** igual ao do ERP: valor total, taxa do cartão, valor recebido, lucro final e o
    detalhamento dos custos.
- Saíram **Horário de entrega**, **Garantia (meses)** e **Origem**. A origem é automática: **anúncio** se a conversa
  tem anúncio registrado (`wa_ad_attribution`) ou o WhatsApp mostra o anúncio nas mensagens; senão **orgânico**.
- Ficaram os extras do chat: "Tirar das automações e pôr na etiqueta CRM", "Gerar mensagem do entregador" (sem a
  linha de horário; com complemento e observações), "Abrir esta venda no ERP" e a ligação com o 📈 (2.10.5).
- Gravação exatamente como o `handleSubmit` do ERP: mesmas colunas de `sales` (CPF, fornecedor, `payment_methods`,
  itens manuais, volumes, status "Em separação", data escolhida + hora de agora), `sale_items` com o custo de cada
  item (e o fornecedor por smartwatch), `sale_accessories` com o custo, fornecedor novo criado pelo nome, cidade e
  bairro novos, item manual novo vira produto "acessório", custo editado gravado no produto (como o ERP faz ao
  sair do campo), estoque baixado e o Tiny avisado. Mesmas validações (sem item, CPF inválido, motoboy sem bairro/
  cidade, total alocado diferente do total).
- Permissão nova: `https://viacep.com.br/*` (só o CEP vai para lá).
- Testes: `scripts/tests/saleParity.test.ts` (recorta o código de verdade do `Sales.tsx`, `cardFees.ts`,
  `systemConfig.ts` e `cpfValidation.ts` e compara o objeto gravado com o da extensão para a mesma venda: 2
  produtos com custo editado, 2 formas de pagamento, Correios, link pela data da venda, 2 smartwatches, "Outros";
  e o "Colar formulário"), `tests/sale.test.cjs` (a gravação de ponta a ponta com banco falso) e o Chrome real
  (formulário, colar formulário + CEP, resumo, recolher, registrar e conferir o que foi gravado).

### 2.12.2 — Rastreamento no ERP (última mensagem e sinais de compra)
- **Precisa da migration `20261107120000_wa_leads_tracking.sql`** (colunas `last_message_at` e `buy_signal_at` em
  `wa_leads`). Sem ela a extensão segue como antes e não grava esses dois dados.
- A aba com a trava agora grava, para cada conversa que já é lead (`wa_leads`), a hora da **última mensagem** que viu
  (sua ou do cliente) e a hora da última mensagem com **sinal de compra** — "pix", "comprovante", "paguei",
  "endereço de entrega" ou "pagamento" (sem acento/maiúscula; "pixel" não conta). O texto é conferido na ponte, no
  navegador, e **nunca sai dela**: vai só "sim" e a hora. As duas colunas só avançam (gravação condicional).
- ERP → WhatsApp → **Rastreamento** (nova sub-aba, logo depois do Painel): conversas novas, rastreadas (anúncio) x
  não rastreadas, tempo médio da 1ª resposta (com "só horário comercial": seg–sáb, 8h–18h), vendas e faturamento das
  conversas, Fez contato → Comprou, origem por dia, jornada Fez contato → Respondeu → Comprou, vendas por dia
  ("Data do primeiro contato" / "Data da venda"), tabela de conversas (busca, ordenar, paginada, CSV) e **Possíveis
  vendas não marcadas** (sinal de compra sem venda ligada, com "Abrir conversa" no wa.me).
- ERP → Conversões (Facebook): **Cliente** e **Telefone** preenchidos também nos Contatos (e Telefone nas Compras), a
  partir do nome aprendido/salvo, do lead, do anúncio e da venda ligada; telefone sempre mascarado no meio.
- Nada mudou no envio de Contato/Compra ao Facebook.
- Testes: `tests/panel.test.cjs` (sinal de compra com/sem acento e em legenda, nada de texto saindo da ponte,
  última mensagem/sinal por conversa, PATCH condicional, sem a coluna não grava) e
  `scripts/tests/waTracking.test.ts` (as contas da aba Rastreamento e o Cliente/Telefone das Conversões).

### 2.12.1 — atalhos no cabeçalho da conversa + etiquetas/nome que falhavam calados
- **Atalhos no cabeçalho do WhatsApp**: no topo da conversa aberta, logo à esquerda dos ícones de vídeo/ligação e no
  mesmo tamanho deles, entram 💰 Venda (formulário de venda pelo chat), 📈 Compra p/ Facebook, ⏰ Agendar mensagem
  (o agendar desta conversa) e 🏷️ Etiqueta CRM — uma lista suspensa ali mesmo, com as etiquetas CRM marcáveis e
  desmarcáveis em 1 clique, busca e "+ Nova etiqueta" (cria com o que foi digitado e já marca). Cada ícone tem dica
  ao passar o mouse; com o painel fechado, abre o painel na tela certa. O clique não abre os dados do contato.
  - Só em conversa individual: em grupo os atalhos somem (grupo não recebe etiqueta nem agendamento).
  - Uma verificação leve (uma consulta ao DOM a cada 1,2 s, só com a aba visível) reinsere quando você troca de
    conversa ou o WhatsApp recria o cabeçalho. Se o WhatsApp mudar e os ícones dele não forem achados, não faz nada:
    os botões continuam no painel.
  - Personalizar → "Atalhos no cabeçalho da conversa" (ligado), quais dos 4 aparecem e "Esconder do painel 💰 Venda,
    📈 Compra p/ Facebook e 🔁 Automação" (desligado).
- **"Etiquetas CRM: Não consegui carregar" (07/11, conversa "Meu Numero Pessoal")**: a consulta estava certa — as
  mesmas leituras feitas direto no Supabase devolvem as 2 etiquetas e o nome dessa conversa (`36369816625228@lid`,
  contato salvo pelo nome, sem telefone). No mesmo minuto, naquela aba, falharam a leitura das etiquetas, a do nome
  (por isso "Nome: —", embora o banco já tivesse um nome) e a gravação do "Heitor": as chamadas da aba para a
  extensão/Supabase falharam (rede, o serviço da extensão reiniciando ou a aba com a versão anterior da extensão
  depois de atualizar). Não há registro do motivo exato, porque o painel o descartava. Agora:
  - lê de novo sozinho (3 tentativas, com intervalo); não repete o que nunca vai dar certo (extensão atualizada →
    "recarregue o WhatsApp (F5)", conversa não identificada);
  - mostra o motivo real em **Detalhes** (sessão expirada 401, sem conexão, Supabase com erro/lento, extensão não
    respondeu, consulta recusada, conversa não identificada) com a mensagem técnica e um botão **Tentar de novo** —
    na linha das etiquetas, na aba Etiquetas e na lista suspensa do 🏷️.
- **Nome não aprendido ("Olá, Heitor!! Tudo bem?" e "Bommm dia, Heitor!! Tduo bem?")**: a regra da 2.9.1 aprende
  "Heitor" nas duas (testado com essas frases exatas; nem o "!!" nem a etiqueta da conversa atrapalham). O problema
  era a gravação: a fila das suas mensagens era esvaziada e, se a gravação falhasse (a mesma falha das etiquetas),
  o nome se perdia sem aviso. Agora o nome aprendido fica guardado e grava de novo sozinho (3 tentativas na hora e
  depois 8 s, 16 s, 32 s… até 5 min); se não gravar, a linha "Nome" mostra "Não consegui gravar o nome aprendido
  “Heitor”" com o motivo e "Tentar de novo". Se a leitura do nome falhar, mostra "Não consegui ler o nome desta
  conversa" (em vez de "—" calado).
- Testes: `tests/learn.test.cjs` (as duas frases, gravação que falha e volta, "Tentar de novo", 3 tentativas, o que
  não repete, motivos, preferências) e o Chrome real com um cabeçalho simulado com os ícones do WhatsApp (posição e
  tamanho, abrir o painel na tela certa, lista suspensa: criar/marcar/desmarcar/buscar/Esc, reinserir ao recriar e
  ao trocar de conversa, grupo, Personalizar, cabeçalho sem ícones, e as etiquetas que falham 2 vezes e carregam,
  ou falham 3 e mostram o motivo + "Tentar de novo").

### 2.12.0 — automação em SEQUÊNCIA com caminhos "Respondeu / Não respondeu"
- Dois modelos novos em "+ Nova automação": **Sequência (respondeu / não respondeu)** e **Follow-up de lead
  novo**. Abrem um editor visual em lista vertical (de cima para baixo, como uma receita):
  - **Começo (quem entra)**: "Lead novo chamou" (automático, pelos leads registrados — `wa_leads` — sem precisar
    de etiqueta; todos / só de anúncio / só orgânicos), "Entrou na etiqueta" (CRM ou WhatsApp), "Venda
    registrada (💰)" ou "Adicionei manualmente" (🔁 Automação da conversa → Adicionar à automação).
  - **Passos**: ✉️ Enviar mensagem (escolher ou "+ Criar mensagem aqui"), 🏷️ Colocar/tirar etiqueta (CRM ou
    WhatsApp, com "Tirar todas as outras (menos a que vai colocar)") e ⏳ **Esperar resposta** por X
    minutos/horas/dias.
  - Todo "Esperar resposta" abre **dois caminhos** coloridos: ✅ **Respondeu** e ❌ **Não respondeu**, cada um
    com os seus passos (pode ter outra espera dentro, até 10 níveis). Cada caminho termina em **Fim** (sai da
    automação) ou **Continuar para…** (outro passo; a validação não deixa um laço sem espera).
  - **Respondeu** = o cliente mandou qualquer mensagem depois do nosso último envio desta sequência (pela conversa
    e pelas respostas registradas em `wa_replies`). Se você mandar outra mensagem durante a espera, o tempo
    recomeça dela. Opção "Contar a partir da MINHA última mensagem" (espera você responder antes) e
    **"Contar o tempo das esperas só no horário comercial"**.
- **Follow-up de lead novo** (tudo editável): lead novo chamou → (você responde à mão) → espera resposta 2h depois
  da SUA última mensagem → ❌ Follow 1 → espera 1 dia → ❌ Follow 2 → espera 2 dias → ❌ Follow 3 → Fim; em
  qualquer ✅ → coloca "Em atendimento" e Fim.
- **Painel da conversa**: se a conversa está numa sequência, aparece "🔁 Na automação X · passo: esperando
  resposta (faltam 1h20)" com **Tirar da automação** e **Pular espera** (segue pelo ❌ no próximo ciclo).
- **Lista de automações**: cada sequência mostra quantos estão em cada passo agora e quantos saíram por ✅ e ❌.
- **Segurança igual**: só daqui pra frente (quem já estava antes de ligar não entra), "Não enviar" tira a conversa
  da sequência, limites por hora/dia, intervalo entre envios, horário comercial e "Testar comigo". Cada envio
  trava o passo antes de mandar (`version`), então duas abas/PCs nunca mandam o mesmo passo. As automações de
  sempre continuam funcionando.
- Banco: migration `20261106210000_wa_sequences.sql` (`kind` e `sequence` em `wa_automations`; `trigger_type` aceita
  `sequencia`; tabela nova `wa_sequence_runs` com o passo de cada conversa, mesmas políticas, registrada na Fase 2
  e no rollback; `notify pgrst`). Sem ela, as sequências não aparecem e o resto funciona como antes.
- Regras em `engine.js` (`seqStep`, `seqValidate`, `seqDescribe`, `seqTemplate`) e no motor (entrada, decisão,
  etiquetas e envio). Testes: `tests/sequence.test.cjs` (respondeu no 1º passo, não respondeu até o fim, resposta
  durante a espera, horário comercial, "Não enviar", "Pular espera", "Continuar para…", trava de versão, modo
  teste, só daqui pra frente, painel e servidor) e o Chrome real (modelo no editor visual, validação por passo,
  salvar e os números da lista).

### 2.11.0 — automações mais simples + criar mensagem dentro da automação
- **"+ Nova automação"** agora começa por modelos com uma frase explicando cada um:
  - **Pós-venda: pedir avaliação** — venda registrada pelo 💰 → espera X dias → manda a mensagem (e,
    opcional, coloca numa etiqueta);
  - **Follow-up em etapas** — quem entra em "Follow Up 1" e não responde em X recebe a mensagem e vai para
    "Follow Up 2"… (1 a 4 etapas; vira uma automação por etapa; a última sai da etiqueta ou vai para a
    escolhida). Se o cliente responder, para;
  - **Lead novo sem resposta** — lead (anúncio ou não) da etiqueta escolhida (CRM ou do WhatsApp, ex.:
    "Novo cliente") que não respondeu em X horas recebe a mensagem;
  - **Cliente sumido** — quem está na etiqueta e não responde à sua última mensagem há X dias úteis recebe a
    mensagem;
  - **Em branco (avançado)** — o editor completo. Os modelos antigos ficam em "Mais modelos (editor avançado)".
- Passo a passo em 3 telas: **Quem** (etiqueta, com quantos estão nela hoje e o aviso de que só vale para quem
  entrar depois de ligar), **Quando** ("7 dias depois da venda", "3 horas sem responder"; o "sem responder"
  conta só o horário comercial) e **O quê** (mensagem: escolher ou criar aqui; para onde mover depois). No fim,
  o **resumo em uma frase** e os botões **Testar comigo** (modo teste com a conversa escolhida), **Ligar** e
  **Salvar desligada**. Etiquetas que ainda não existem são criadas ao ligar.
- **Criar mensagem na hora**: na ação "Enviar mensagem" (no passo a passo e no editor avançado), além de
  escolher uma pronta, **"+ Criar mensagem aqui"** abre o MESMO editor das mensagens rápidas (texto, áudio,
  imagem, álbum, vídeo, PDF, localização, produto, catálogo, contato, Pix, {nome}, {saudacao},
  esperar/digitando). Ao salvar, a mensagem é criada na categoria **"Automações"** (criada se não existir) e
  já fica escolhida na ação; Cancelar volta sem mudar nada. **"Editar esta mensagem"** ao lado da escolhida.
- **Editor avançado mais claro**: frases em vez de termos técnicos ("Algum tempo depois de entrar na
  etiqueta", "Não respondeu à sua mensagem por algum tempo", "Colocar uma etiqueta CRM"…), um **(i)** explicando
  cada opção, as **variantes** atrás de "Mais opções" e **validação antes de salvar**: o que falta fica marcado
  em vermelho no lugar (ex.: "Ação 2: escolha a etiqueta") e nada é salvo. O gatilho "venda registrada" ganhou
  "esperar X dias depois da venda" (0 = na hora, como antes; até 90).
- **Lista**: cada automação mostra a frase-resumo, LIGADA/DESLIGADA, EM TESTE, **quantos estão na fila agora**
  (esperando + prontos, calculado como o "Simular", sem enviar) e **quantos já receberam**.
- Segurança igual: só daqui pra frente, nunca para "Não enviar", limites e horário comercial. As automações
  existentes continuam funcionando e abrem no editor avançado. Sem migration nova.
- Regras em `engine.js` (`WIZARDS`, `wizardToAutomations`, `wizardSentence`, `validateAutomationDraft`; espera
  da venda em `evaluateAutomation`). Testes: `tests/automations.test.cjs` (cada modelo gera a automação certa,
  frase, validação no lugar certo, espera da venda, as geradas passam na validação do servidor). O teste no
  Chrome real usa um banco falso em memória: abre "+ Nova automação" → Pós-venda → os 3 passos → "+ Criar
  mensagem aqui" (editor das mensagens rápidas, categoria "Automações") → volta com a mensagem escolhida →
  resumo → "Salvar desligada" (confere a automação gravada) e a validação do editor avançado.

### 2.10.5 — a Compra do 📈 ligada à venda do ERP (extensão + ERP)
- Depois de enviar uma **Compra real** no 📈 (e também ao abrir o 📈 de uma conversa que já tem compra real
  enviada), o painel procura a venda no ERP (`sales`):
  1. **pelo telefone desta conversa** (mesma normalização do painel do ERP), vendas dos últimos **7 dias**:
     achou **uma** → liga sozinha; achou **mais de uma** → mostra para você escolher;
  2. não achou: vendas dos últimos **3 dias** sem telefone (ou com outro telefone) com **valor parecido
     (±10%)**, com cliente, data e valor, e o botão **"É esta"** (preenche também o telefone da venda, se
     estiver vazio);
  3. nenhuma: **"Lançar venda no ERP"**, que abre o 💰 Venda desta conversa já com o valor (o 1º produto entra
     com o valor da compra) e, ao registrar, liga a venda à compra.
- No 📈 (e no HISTÓRICO da aba Conversões, botão "Ligar à venda do ERP"): **"Venda do ERP ligada: #id ·
  cliente · R$"** com **"Desligar"** para corrigir engano (depois de desligar, não liga sozinha de novo).
- Ligar **só** grava o `sale_id` na compra e preenche `wa_chat_id` da venda (se vazio) e o telefone (se
  vazio). Nunca altera valores, itens ou estoque. "Desligar" desfaz só o que a ligação preencheu. Não liga
  venda cancelada/reembolsada, de outra conversa ou já ligada a outra compra.
- Banco: migration `20261106180000_wa_conversion_sale_link.sql` (`sale_id`, `sale_link_set_chat`,
  `sale_link_set_phone` em `wa_conversion_events`; `notify pgrst`). Sem ela, o 📈 funciona como antes.
- **ERP**: vendas ligadas assim já contam no **Painel** como vendas do WhatsApp (pelo `wa_chat_id`). A lista
  **Conversões (Facebook)** ganhou a coluna **"Venda do ERP"** (ligada ou "—").
- Testes: `tests/salelink.test.cjs` (achar pelo telefone, mais de uma, escolher por valor, nenhuma, ligar,
  desligar, só os campos permitidos, sem a migration) e `scripts/tests/waConversions.test.ts`. O teste no
  Chrome real ganhou um **Supabase falso dentro do service worker** da extensão (protocolo DevTools) e usa o
  HISTÓRICO do 📈 de verdade: liga pelo telefone, escolhe por valor, nenhuma, mais de uma e desliga,
  conferindo cada gravação.

### 2.10.4 — tirar partes na prévia (só deste envio)
- A prévia da mensagem rápida agora mostra **todas as partes** na ordem em que vão sair (áudio, imagem,
  vídeo, PDF, álbum, cartões e texto editável), cada uma com um **✕** pequeno no canto ("Não enviar esta
  parte agora"). Clicou: a parte fica apagada/riscada com **"Não vai ser enviada · desfazer"**.
- No **álbum** ("Várias imagens"), cada foto tem o seu ✕ (e ↺ para voltar): tira só aquela foto. Sobrando
  1 foto, ela vai como imagem/vídeo normal com a legenda; tirando todas, a parte inteira sai.
- Vale **só para este envio**: a mensagem rápida salva não muda. "Restaurar" volta tudo.
- O "esperar" e o "digitando" das partes tiradas não contam: o rodapé mostra "2 de 3 partes · tempo total
  ~10s". Tirando todas, o botão fica desligado (**"Nada para enviar"**).
- As etiquetas de **"Ao enviar"** (CRM e WhatsApp) continuam valendo quando as partes escolhidas saem
  (pelo menos uma enviada com sucesso). Se o envio falhar ou for parado no meio, elas não mudam, como antes.
- Regras em `engine.js` (`previewSendPlan`, `sendLabelsApply`); testes em `tests/preview.test.cjs`. O teste
  no Chrome real grava uma mensagem de teste (áudio + texto + álbum de 3 fotos) no cache local, abre a
  prévia e usa os ✕ de verdade (tirar a 1ª parte de áudio, desfazer, foto do álbum, tirar todas,
  Restaurar). Print em `extension/screenshots/2.10.4`.

### 2.10.3 — a lista de conversas não volta mais para o topo depois de enviar
- **Manter a posição da lista de conversas ao enviar** (no Personalizar, **ligado** por padrão). A
  extensão guarda onde **você** deixou a lista da esquerda (`#pane-side`, ou o que rola dentro dele) a cada
  rolagem sua (roda do mouse, toque, teclado ou barra). Quando você envia (Enter na caixa, botão Enviar
  ou envio pela extensão) e a lista pula para o topo em até **2 s**, ela volta para onde estava **mais
  uma linha**: a conversa que recebeu a mensagem subiu para o topo e as de cima desceram uma linha, então
  é assim que as **mesmas conversas** continuam na tela (descontar a linha deixaria tudo uma linha fora do
  lugar).
- Não briga com você: se você rolar ou clicar na lista depois de enviar, não mexe. Mensagem de cliente
  (que também leva a conversa para o topo) e clique para abrir outra conversa não restauram. No máximo 3
  vezes por envio. Se o WhatsApp mudar a página e a lista não for encontrada, não faz nada (sem erro).
- **Próxima ▼** (junto dos botões da conversa; dá para desligar em Personalizar → Botões da conversa):
  abre a conversa logo abaixo da aberta na lista, para ir descendo sem rolar. Se a de baixo ainda não
  estiver desenhada, desce uma linha e tenta de novo.
- Regras em `engine.js` (`listShouldRestore`, `listRestoreTarget`; testes em `prefs.test.cjs`). O teste no
  Chrome real ganhou uma lista simulada que pula para o topo depois do envio (Enter e botão), com mensagem
  de cliente, clique na lista, rolagem sua logo depois, opção desligada, "Próxima ▼" e página sem a lista.

### 2.10.2 — painel personalizável (só visual)
- **Seções recolhíveis**: Conversa (e os botões), Etiquetas CRM, Nome e Busca + filtros ganham uma
  setinha ▸/▾. Recolhida, a seção vira uma linha com o resumo ("Etiquetas CRM: Cliente, Follow Up 1",
  "Busca e filtros: Texto · "frete""). O estado fica lembrado.
- **Divisória arrastável** entre o topo e a lista: arraste para cima/baixo para mudar quanto espaço o
  topo ocupa (o topo rola por dentro se não couber); setas ↑/↓ no teclado também; **duplo clique** volta
  ao padrão. Só aparece em Mensagens. Lembrada.
- **Personalizar** (ícone de ajustes no cabeçalho do painel): liga/desliga
  - **abas do menu** (as desligadas vão para "Mais"; Mensagens nunca some);
  - **filtros das Mensagens** (Tudo sempre aparece; padrão: Tudo, Mais usadas, Texto, Áudio, Imagem,
    Vídeo; os outros ficam no chip **"+ filtros"**; o filtro em uso sempre aparece);
  - **botões da conversa** (💰 Venda, 📈 Compra p/ Facebook, 🔁 Automação);
  - **densidade**: Confortável / Compacta (menos espaço; texto nunca abaixo de 11 px);
  - **Voltar ao padrão**.
- Tudo guardado no armazenamento local da extensão (`panelPrefs`, por computador), sem banco. A
  largura do painel continua funcionando junto. Nenhuma regra, envio ou dado mudou.
- **Teste "o painel abre no Chrome real"** (padrão para toda versão daqui pra frente):
  `node extension/tests/chrome-real.test.cjs` abre o Google Chrome instalado, carrega a extensão
  (Extensions.loadUnpacked pelo protocolo DevTools do próprio Chrome: o Chrome 137+ não aceita mais
  `--load-extension`, e o Playwright não está instalado — sem npm install), serve um
  https://web.whatsapp.com **simulado**, confere que o painel aparece (#tsp-wa-host) e que não há erro
  no console, e usa cada função do Personalizar com mouse de verdade (arrastar a divisória e a largura,
  recarregar e conferir que tudo foi lembrado). Toda a rede de verdade fica bloqueada: o teste nunca fala
  com o Supabase nem pega a trava do motor. Esse teste pegou dois erros desta versão antes de sair
  (um "Cannot access 'board' before initialization" e o menu que não fechava) e pega o erro da 2.10.0.
  `SHOTS_DIR=pasta` salva os prints; `HEADFUL=1` mostra a janela.
- **Todos os testes**: `node extension/tests/run-all.cjs` (manifest, regras, registros, preferências e o
  Chrome real). Prints em `extension/screenshots/2.10.2` (padrão, Personalizar, compacto, seções recolhidas).

### 2.10.1 — correção urgente: o painel não abria (desde a 2.9.2)
- O manifest listava `rich-parts.js` em dois `content_scripts` (mundo MAIN e mundo isolado). O Chrome
  injeta o mesmo arquivo só uma vez por página: ele rodava só no MAIN, o mundo isolado ficava sem
  `TspRich` e o `content.js` quebrava ao abrir ("Cannot read properties of undefined (reading 'TYPES')").
- Agora o mundo isolado carrega `rich-parts-iso.js`, cópia idêntica de `rich-parts.js` (só com um
  comentário no topo). **Ao mudar `rich-parts.js`, copie também para `rich-parts-iso.js`.**
- Teste novo: `node extension/tests/manifest.test.cjs` falha se algum arquivo aparecer em mais de uma
  entrada de `content_scripts` ou se `rich-parts-iso.js` ficar diferente de `rich-parts.js`.

### 2.10.0 — Painel de resultados (extensão + ERP)
**Extensão: registros novos** (só a aba que tem a trava grava; sem a migration, nada muda):
- **Lead novo** (`wa_leads`, uma linha por conversa): a 1ª mensagem do cliente numa conversa
  individual sem nenhuma mensagem antes, com o telefone, a hora, a origem (**anúncio** quando a
  mensagem tem ctwaContext, senão **orgânico**) e o id/título do anúncio. Ao abrir o WhatsApp,
  recupera os leads das últimas 24 h que chegaram com o PC desligado (só conversas que o WhatsApp
  diz estarem completas e cuja 1ª mensagem é do cliente); a mesma conversa nunca duplica.
- **Resposta do cliente** (`wa_replies`): a 1ª mensagem do cliente depois de um envio nosso
  (o que você digitou, mensagem rápida, agendada, automação ou disparo), ligada ao último envio
  registrado antes dela (até 7 dias), com os minutos até responder. Só a 1ª resposta de cada envio conta.
- **Tipo de cada envio** em `wa_send_log`: coluna `origin` (manual, rapida, agendada, automacao,
  disparo) e `follow_step`; `item_id` (mensagem rápida) e `source_id` (automação/disparo) já existiam.
  - Mensagem rápida pela seta, pela prévia ou da aba Mídias: registrada como `rapida`.
  - O que você digita no WhatsApp (de qualquer aparelho): `manual`, uma vez por "vez de falar" da loja
    (o cliente falou depois, ou 30 min sem a loja falar); pula se outra aba/PC já registrou um envio na
    conversa 3 min antes/depois. A extensão espera 45 s antes de gravar, para isso dar certo.
  - O limite por hora/dia, o intervalo entre envios, o histórico e o "pular quem recebeu" dos disparos
    continuam contando **só** os envios automáticos (como antes).
- **Mensagem rápida é follow-up**: no editor, "Esta mensagem é um follow-up" + **Etapa** (1 a 10).
  Automações que enviam a mensagem herdam a etapa (fica gravada em cada envio).
- Nunca guarda o texto das mensagens: só conversa, lado (loja/cliente) e hora.
- Banco: migration `20261106150000_wa_panel.sql` (tabelas `wa_leads` e `wa_replies` com as mesmas
  políticas das wa_*, registradas na Fase 2 e no rollback; colunas novas com `add column if not exists`;
  `source` aceita `manual`/`rapida`; índices por data e chat_id; `notify pgrst`).

**ERP: aba WhatsApp → "Painel"** (a primeira, aberta por padrão):
- Período: Hoje, Ontem, 7 dias, 30 dias, Este mês (comparado com o mesmo trecho do mês passado) e
  Personalizado; cada número compara com o período anterior (▲▼ e %).
- Cartões: leads novos (anúncio / orgânico), conversas respondidas, vendas pelo WhatsApp (quantidade e
  R$), ticket médio, conversão lead → venda, vendas depois de follow-up, vendas de anúncio e compras
  enviadas ao Facebook. Cada número tem um (i) com a regra.
- Gráfico "Leads por dia" (barras empilhadas anúncio x orgânico + linha de vendas), funil dos follow-ups
  (Follow 1 → 2 → 3…: receberam, responderam com tempo mediano, compraram depois e "seguiram sem
  responder"; conta conversas), tabelas ordenáveis por qualquer coluna (por mensagem rápida, por
  anúncio, automações e disparos) e mapa de calor dia da semana × hora dos leads.
- **Regras**: venda pelo WhatsApp = registrada pelo 💰 da conversa ou venda do ERP (não cancelada/
  reembolsada) com o telefone de uma conversa (lead, anúncio, envio ou resposta registrados).
  "Depois de um follow" = até 7 dias depois do último follow-up recebido pela conversa antes da venda.
  "De anúncio" = conversa com registro em `wa_ad_attribution`/lead de anúncio, ou venda do 💰 com
  origem anúncio. Envios antigos sem etapa usam a etapa atual da mensagem rápida.
- Tudo em lotes de 1000 linhas (sem o limite do Supabase); sem a migration, o painel avisa o que falta
  e mostra o resto. Esqueleto ao carregar, "Sem dados neste período" quando vazio, tema claro/escuro e
  celular. As outras sub-abas ganharam o mesmo visual (título de seção e cartões de número); a aba
  "Resultados" segue mostrando só os envios automáticos.
- Contas em `src/lib/waPanel.ts` (funções puras) e leitura em `src/lib/waPanelDb.ts`.
- Testes: `node scripts/tests/waPanel.test.ts` (regras e contas do painel) e
  `node extension/tests/panel.test.cjs` (registros da extensão).

### 2.9.2
- **Tipos novos de parte** nas mensagens rápidas (botões em "+ Adicionar" e no tipo da
  parte; também na mensagem exclusiva do disparo):
  - **📍 Localização**: nome do local, endereço, latitude e longitude. Cole o link do
    Google Maps e a latitude/longitude são preenchidas sozinhas (formatos `@lat,long`,
    `?q=lat,long`, `query=`, e o ponto exato `!3d…!4d…` dos links de lugar; o nome do
    lugar também vem do link). Link curto (`maps.app.goo.gl`) não traz as coordenadas:
    o painel avisa para abrir o link e colar o endereço completo, ou digitar os números.
    Envio com `sendLocationMessage` (nome e endereço no cartão).
  - **🛍️ Produto do catálogo**: "Escolher produto" lista os produtos do SEU catálogo do
    WhatsApp Business (foto, nome, preço; produto oculto fica de fora) com busca. A
    WA-JS 4.7.2 **não tem envio de produto**: vai o link `https://wa.me/p/<id>/<seu número>`
    com o cartão de prévia (foto, nome e preço atuais do catálogo), montado do mesmo jeito
    que a própria WA-JS faz no `sendCatalogMessage`. Produto sem foto vai sem miniatura.
    Texto opcional na mesma mensagem.
  - **📒 Catálogo**: cartão do catálogo inteiro (`sendCatalogMessage`), com texto opcional.
  - **👤 Contato**: nome e telefone, ou escolha de um contato salvo no WhatsApp (busca por
    nome ou número; só contatos com número). Envio com `sendVCardContactMessage`.
  - **💠 Chave Pix**: tipo (CPF, CNPJ, telefone, e-mail, aleatória), chave e nome do
    recebedor; a chave é conferida antes de salvar (CPF 11 números, CNPJ 14, telefone com
    DDD, e-mail, chave aleatória de 36 caracteres). Envio com `sendPixKeyMessage`. Em conta
    que não é WhatsApp Business: erro claro e a parte **não é enviada**; se o WhatsApp
    recusar no envio: "Chave Pix: o WhatsApp não aceitou o envio nesta conta…".
- Funcionam em todos os caminhos (seta, prévia "Enviar só nesta conversa", agendamento,
  automação, follow e disparo, inclusive conversa nova), respeitam "esperar" e "digitando",
  e aparecem na prévia como cartão, na ordem das partes. {nome} e {saudacao} valem no
  texto junto do produto e do catálogo.
- Filtros da aba: **Localização, Produto, Catálogo, Contato, Pix** (a mensagem entra no
  filtro se tiver uma parte daquele tipo).
- Banco: migration `20261106120000_wa_item_parts_rich.sql` (coluna `data` jsonb em
  `wa_item_parts` e os tipos novos na regra do tipo; `notify pgrst`). **Sem ela, os tipos
  novos e os filtros não aparecem e tudo funciona como antes.** `wa_items` não muda:
  quando a 1ª parte é de um tipo novo, ele guarda um texto com o resumo (o ERP mostra
  "📍 Localização: …").
- Um tipo some do editor quando a WA-JS desta conta não tem a função dele (ex.: Produto,
  Catálogo e Pix em conta que não é Business).
- `rich-parts.js` (novo): validação, link do Maps e montagem do envio, usado pelo painel,
  pelo service worker e pela ponte. Testes: `node extension/tests/rich-parts.test.cjs`
  (salvar com e sem a migration, prévia, envio simulado com uma WA-JS falsa, links do Maps
  com e sem coordenadas, produto sem foto).

### 2.9.1
- **Nome aprendido mais rígido** (o "Olá!! Bommmm dia, tudo bem?" ensinava
  "Bommmm"). Agora só aprende quando o nome vem **direto** depois do cumprimento,
  separado só por vírgula e/ou espaço ("Olá, Fernanda", "Oi Fernanda", "Oii,
  Fernanda!"); com "!", "?", "." ou quebra de linha no meio, não aprende.
- Depois do nome só pode vir fim do texto ou pontuação (! , . ?), com ou sem
  espaço antes: "Bom dia", "Bommmm dia", "Olá Fernanda tudo bem" não ensinam.
- Nunca viram nome: palavras que começam com "Bom"/"Boa" (Bom, Bommmm, Boaa…),
  "Ótima", "Ótimo", "Uma", "Excelente", "Feliz" e todas as palavras dos 3 textos
  da {saudacao} (`wa_greetings`).
- Mensagem rápida com {nome} que saiu com o nome **vazio** não ensina nada
  (a conversa fica sem aprender durante o envio e 20 s depois).
- Exemplos: "Olá!! Bommmm dia, tudo bem?" → nada; "Olá, Fernanda!! Bommmm dia" →
  Fernanda; "Bom dia, Fernanda" → Fernanda; "Olá!! Uma ótima tarde" → nada;
  "Oi Bommmm" → nada.

### 2.9.0
- 📈 da conversa: no topo, **Já enviado nesta conversa** (compras e contatos desta
  conversa: data/hora, valor, real ou teste, status) ou "Nenhuma compra enviada
  nesta conversa".
- **Trava contra compra duplicada**: com compra REAL enviada para a conversa nos
  últimos 7 dias, o botão vira **Enviar outra compra** e pede confirmação ("Já foi
  enviada uma compra de R$ X em DD/MM às HH:MM. É uma compra NOVA (outro pedido)?").
  Compras em modo teste não contam.
- Selo **💰 compra enviada** no histórico da aba Conversões e na conversa aberta
  (perto das etiquetas).
- **Contato automático**: o lead de anúncio vinha da ponte sem telefone; lead
  @lid sem código de clique ia sem telefone e o Facebook recusava (sem registro no
  histórico). Agora o telefone vem do WhatsApp para a conversa (@lid inclusive),
  conferido. E, a cada abertura do WhatsApp, os leads guardados (wa_ad_attribution)
  que chegaram depois de ligar o Contato e ainda não têm Contato entram na fila
  (sem duplicar; só dos últimos 7 dias).
- Aba Conversões: **Diagnóstico** com "Últimos leads de anúncio capturados: N hoje
  · último às HH:MM" e "Contatos enviados hoje: N".
- ERP, aba WhatsApp: nova aba **Conversões (Facebook)** com a lista (data, cliente,
  telefone mascarado, evento, valor, anúncio, real/teste, status), filtro por período,
  totais e paginação (sem o limite de 1000 linhas). Só leitura.

### 2.8.9
- **Legenda do álbum ("Várias imagens")**: a WA-JS da extensão (4.7.2) não tem
  envio de álbum de verdade (várias mídias numa mensagem só): ela só envia um
  arquivo por vez (`WPP.chat.sendFileMessage`). Por isso as fotos vão **sem
  legenda** (para o WhatsApp agrupar) e a legenda vai como **mensagem de texto
  separada**, ~1,5 s depois da última foto. Opção na parte: **Legenda: depois das
  fotos** (padrão) ou **antes das fotos** (guardada junto da lista de arquivos;
  sem migration). Vale para seta, prévia, agendamento, automação e disparo; a
  prévia mostra a grade e a mensagem separada.

### 2.8.8
- **Automações só valem daqui pra frente** (segurança): gatilhos de etiqueta
  ("entrou na etiqueta", "há X tempo", "sem resposta", "respondeu") só contam quem
  entrou na etiqueta DEPOIS de ligar a automação. Ligar de novo, ou editar uma ligada
  trocando o gatilho ou a etiqueta, conta como nova ativação. Na etiqueta do
  WhatsApp, quem já estava nela ao ligar fica registrado como "já estava".
  "Dia e hora" só vale a partir do próximo dia/hora depois de ligar; "venda
  registrada" só para vendas registradas depois de ligar.
- Ao **Ligar**: mostra "X contatos já estão nessa etiqueta e NÃO vão receber" e a
  opção desmarcada **Incluir também quem já está na etiqueta**, que só vale depois
  de confirmar a lista de quem vai receber.
- **Testar só com uma conversa**: no editor, escolha a conversa (ou "Usar a conversa
  aberta"); em teste, roda só para ela e a lista mostra **EM TESTE**.
- Migration `supabase/migrations/20261105200000_wa_automations_activation.sql`
  (activated_at, include_existing, test_chat_id); ela também faz as automações já
  ligadas valerem a partir de agora. Sem ela, a extensão não deixa ligar automação
  ("Atualize o banco").

### 2.8.7
- **Várias imagens (álbum)**: tipo novo de parte com até 10 fotos/vídeos (MP4).
  **Subir arquivos** (vários de uma vez ou arrastando) e **Escolher da biblioteca**
  com seleção múltipla ("Adicionar N"). No editor: grade de miniaturas com ✕ em
  cada uma e arrastar para mudar a ordem. Legenda opcional (vai na primeira).
- Na parte **Imagem**: **+ adicionar mais fotos** transforma em "Várias imagens"
  mantendo a foto atual.
- Envio (manual, prévia, agendado, automação e disparo): "esperar" e "digitando"
  antes da primeira; depois as fotos saem em seguida, sem pausa, para o WhatsApp
  agrupar. Se uma falhar, as outras continuam e o aviso diz qual. No disparo, a
  parte conta como 1 mensagem no limite por hora.
- Prévia mostra a grade das fotos. Precisa da migration
  `supabase/migrations/20261105190000_wa_item_parts_files.sql` (coluna files nas
  partes); sem ela o tipo novo não aparece e tudo funciona como antes.

### 2.8.6
- Mensagem rápida: em **e tirar da etiqueta CRM** e **e tirar da etiqueta do
  WhatsApp**, nova opção **Todas (menos a que vai colocar)** logo abaixo de
  "(não mexe)". Quando a mensagem inteira sai com sucesso, tira o contato de todas
  as etiquetas daquele tipo, menos a escolhida em "colocar" (e coloca nela); com
  "colocar" em "(não mexe)", tira de todas. A etiqueta **Não enviar** nunca é
  retirada. Precisa da migration
  `supabase/migrations/20261105180000_wa_items_remove_all_labels.sql`; sem ela a
  opção não aparece e tudo funciona como antes.
- Disparos e Automações não ganharam a opção: lá "tirar etiqueta" é uma ação
  própria de cada disparo/automação, não o mesmo campo da mensagem rápida.

### 2.8.5
- **Arrastar para reordenar** (com o mouse):
  - Categorias das mensagens rápidas: arraste o cabeçalho (alça ⋮⋮ ao passar o
    mouse; linha laranja onde vai cair). O menu da categoria ficou com
    **Renomear** e **Apagar**.
  - Mensagens: arraste para mudar a ordem dentro da categoria ou solte em cima
    de outra categoria (aberta ou fechada) para mover.
  - Mídias: arraste as pastas para mudar a ordem (saíram ↑ ↓) e solte uma mídia
    numa pasta (ou em "Sem pasta") para mover.
  - Clique simples continua abrindo/fechando e abrindo a prévia (o arraste só
    começa depois de mover alguns pixels). **Esc** cancela. Com filtro ou busca
    ativos, o arraste fica desligado ("Limpe a busca para reordenar"). Erro ao
    salvar volta para a ordem anterior com aviso. Tudo fica salvo no banco.

### 2.8.4
- **Largura do painel ajustável**: arraste a borda esquerda do painel (o cursor
  vira ↔ e aparece uma linha laranja). Mínimo 300 px; máximo 50% da janela ou
  700 px (o menor). O WhatsApp ao lado encolhe/cresce junto, também ao mudar o
  tamanho da janela. A largura fica guardada neste computador; **duplo clique**
  na borda volta ao padrão (360 px). Pelo teclado: foco na borda e ← / →.
- Estreito (até 340 px): menu de abas só com ícones (o nome aparece na dica).
  Largo (acima de 480 px): grade de Mídias com mais colunas e, no editor de
  mensagem, campos lado a lado.
- Prints em `extension/screenshots/2.8.4` (320 px, padrão e 600 px).

### 2.8.3
- **Nome para mensagens** por conversa (tabela `wa_chat_names`, migration
  `20261105150000_wa_chat_names.sql`). O {nome} usa só: nome **definido por
  você** → nome **aprendido da sua mensagem** → vazio. Não usa mais o nome do
  contato do WhatsApp, o pushname nem o ERP (sem a migration, funciona como antes).
- **Aprender da sua mensagem**: quando você envia "Olá, Fernanda!!", "Oi
  Fernanda", "Oii, Fernanda!", "Bom dia, Fernanda" etc., "Fernanda" vira o nome
  da conversa. Só a primeira palavra depois do cumprimento, com maiúscula, só
  letras (2–20); "Tudo", "Pessoal", "Amiga", "Cliente"… não contam. Mensagens
  recebidas não ensinam nada. O definido à mão nunca é trocado pelo aprendido.
- No topo do painel: **Nome: Fernanda ✏️** com a origem ("aprendido da sua
  mensagem" / "definido por você"); sem nome, "Nome: — ✏️". Salvar vazio apaga.
- Sem nome, o trecho some junto com a vírgula: "Olá, {nome}!!" → "Olá!!";
  "{nome}, tudo bem?" → "Tudo bem?". A prévia mostra o texto já trocado e avisa
  "Sem nome para esta conversa (vai sair sem nome)".
- **{saudacao}**: troca na hora do envio (manual, agendada, automação e disparo),
  no horário de São Paulo: manhã 5h–11h59, tarde 12h–17h59, noite 18h–4h59.
  Textos editáveis na engrenagem da aba Mensagens ("Textos da saudação", com
  exemplo ao vivo); padrão "Bommmm dia", "Uma ótima tarde", "Uma ótima noite"
  (guardados em system_config, chave `wa_greetings`).
- Editor: botões **+ {nome}** e **+ {saudacao}** que inserem no cursor.

### 2.8.2
- Mensagens rápidas: **+ Nova mensagem** e **+ Nova categoria** (pede o nome ali
  mesmo) no topo da aba.
- Categorias vazias aparecem na lista (contador 0 e "Nenhuma mensagem. + Nova
  mensagem aqui", que abre o editor já nessa categoria). Com filtro ou busca
  ativos, só aparecem as categorias com resultado.
- Menu ⋯ da categoria: **Renomear**, **Subir**, **Descer** e **Apagar**. Com
  mensagens, pergunta "Apagar a categoria e as N mensagens dela?" (as mídias da
  biblioteca e os arquivos não são apagados); vazia, confirmação simples. Some da
  lista e do editor na hora.
- Ao apagar a última mensagem de uma categoria: "A categoria X ficou vazia.
  Apagar a categoria também?" com **Apagar** e **Manter**.

### 2.8.1
- **Lista de Mensagens rápidas** (só visual): o título ocupa a largura toda e
  quebra em até 2 linhas; embaixo, menor, o tipo e o resumo ("Áudio de voz ·
  46.9 KB", "PDF · tabela.pdf", "5 partes · …"). Na linha ficam só **▶ Enviar**
  (laranja) e **⋯**. A **Prévia** foi para o ⋯ (e clicar no título também abre),
  e o "Como arquivo" virou **Enviar áudio como arquivo** dentro do ⋯.
- Título 13 px, resumo 11 px, cabeçalho da categoria 12 px, e menos espaço
  entre os itens (cabem mais mensagens sem rolar).
- Menu: "Mais" com ícone do mesmo tamanho e o nome na mesma linha das outras abas.
- Mídias, Agendados, Disparos e Automações: títulos longos também quebram em
  até 2 linhas em vez de cortar.
- Prints em `extension/screenshots/2.8.1`.

### 2.8.0
- **Design do painel** (só visual; nenhuma regra, texto de regra, banco ou envio mudou):
  - Sistema visual único no Shadow DOM: cores (laranja da Triumph como destaque),
    4 tamanhos de texto (11/12/13/15 px), espaços em múltiplos de 4, cantos e
    sombras como tokens. Todas as telas usam só esses valores.
  - Tema claro e escuro acompanhando o WhatsApp Web (como antes), com o texto
    laranja numa variante mais escura/clara para ficar legível nos dois.
  - Menu numa linha só: **Mensagens, Mídias, Etiquetas, Vendas, Conversões** e
    **Mais** (Quadro, Agendados, Disparos, Automações). Nomes inteiros, ícones do
    mesmo tamanho, aba ativa com fundo e traço laranja; "Mais" fica destacado
    quando a aba aberta está dentro dele. Painel com 360 px para caber tudo.
  - Faixa da conversa (💰 Venda, 📈 Compra p/ Facebook, 🔁 Automação) quebra a
    linha em vez de cortar.
  - Mesmo padrão em listas, cartões e formulários (rótulo em cima, campos da
    mesma altura, botão principal laranja, secundário neutro, perigo vermelho),
    estados vazios com ícone (Mídias com "Subir arquivo"), "Carregando…" com
    esqueleto e mensagens de sucesso/aviso/erro no mesmo formato.
  - Etiquetas CRM e do WhatsApp com o mesmo chip: fundo suave na cor da
    etiqueta e texto legível.
  - Foco visível no teclado, áreas de clique de pelo menos 28 px e nenhum texto
    menor que 11 px.
  - Prints em `extension/screenshots/2.8.0` (claro e escuro).

### 2.7.2
- **Abrir no ERP direto na venda**: depois de registrar a venda pelo 💰, o botão
  **Abrir esta venda no ERP** abre o Histórico de Vendas já nessa venda (rola até
  ela e realça). Na aba Vendas, cada venda da lista tem **Abrir no ERP**, e o
  botão **Nova venda no ERP** abre a Nova Venda do ERP com o nome e o telefone
  desta conversa (com a trava do telefone da 2.6.3). Precisa do ERP atualizado
  (lê `?pagina=historico&venda=<id>` e `?pagina=nova-venda&nome=&telefone=`).

### 2.7.1
- Editor das mensagens rápidas e dos disparos: "Escolher da biblioteca" em
  grade de miniaturas (pasta, busca, prévia maior ao passar o mouse, ouvir o
  áudio), prévia do arquivo escolhido com "Trocar"; miniaturas sob demanda e
  em cache.
- Mensagem rápida que põe/tira **etiqueta do WhatsApp** ao enviar. Migration
  `20261105120000_wa_items_on_send_wa_labels.sql`.

### 2.7.0
- Aba **Mídias**: biblioteca de mídias em pastas (subir sem duplicar, enviar na
  conversa, editar, apagar só sem uso, importar das mensagens rápidas, espaço
  usado). "Escolher da biblioteca" no editor das mensagens rápidas e dos
  disparos. Migration `20261105090000_wa_media_library.sql`.

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
  rich-parts.js ............ tipos novos de parte: validação e montagem do envio (2.9.2)
  wa-bridge.js ............. fala com a WA-JS (cópia privada do WPP)
        ▲  window.postMessage (dois protocolos separados:
        │  'tsp-wa-content'/'tsp-wa-bridge' e 'tsp-wajs-content'/'tsp-wajs-bridge')
        ▼
Mundo isolado da extensão
  data/nomes-br.js ......... lista de nomes comuns para o {nome} (2.1.0)
  sale-calc.js ............. cálculos da venda copiados do ERP (2.3.0; também no background)
  rich-parts-iso.js ........ cópia idêntica de rich-parts.js para este mundo (2.10.1; o background usa rich-parts.js)
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
  `web.whatsapp.com`, ao domínio do Supabase e (2.12.3) ao `viacep.com.br` — só o CEP
  digitado/colado na venda vai para lá, como no ERP.
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
  `src/lib/addressValidation.ts`, `src/lib/dateUtils.ts`; 2.12.3: também
  `src/lib/cpfValidation.ts`, o "Colar formulário", itens manuais, várias formas
  de pagamento e o fornecedor por smartwatch). Se o ERP mudar a conta, mude aqui
  também: `scripts/tests/saleParity.test.ts` roda o código do `Sales.tsx` e o
  daqui com a mesma venda e falha se o objeto gravado ficar diferente. O
  background confere tudo de novo antes de gravar.
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
