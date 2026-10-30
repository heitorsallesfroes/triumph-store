# vendor/: biblioteca WA-JS (WPPConnect)

## O que é

`wppconnect-wa.js` é a biblioteca aberta **WA-JS**, do projeto WPPConnect. Ela
roda dentro da página do WhatsApp Web e dá acesso às funções do próprio
WhatsApp. A extensão usa só estas funções, e só quando você clica na seta de um
áudio:

- `WPP.chat.getActiveChat()`: saber qual conversa está aberta;
- `WPP.chat.markIsRecording()` / `WPP.chat.markIsPaused()`: mostrar e tirar o
  "gravando áudio…" para o cliente;
- `WPP.chat.sendFileMessage(..., { type: 'audio', isPtt: true, ... })`: enviar
  o áudio como mensagem de voz;
- `WPP.labels.getAllLabels()`: só para contar as etiquetas do WhatsApp
  Business no Diagnóstico.

Quem fala com a biblioteca é o `wa-bridge.js` (código nosso).

## Origem e versão

| | |
|---|---|
| Pacote | `@wppconnect/wa-js` (npm) |
| Versão | **4.7.2** |
| Arquivo | `dist/wppconnect-wa.js` do pacote, **sem nenhuma alteração** |
| SHA-256 | `97aca719c9ef8e618e7941425920451139def9bd70f5d8449c24864f406dfc85` |
| Licença | Apache-2.0 (`LICENSE-wa-js.txt`); licenças dos componentes em `wppconnect-wa.js.LICENSE.txt` |
| Código-fonte | https://github.com/wppconnect-team/wa-js |

O `.gitattributes` desta pasta impede o git de converter as quebras de linha
(senão o SHA-256 deixaria de bater no Windows).

## Privacidade

Por padrão a biblioteca manda estatísticas de uso ao Google Analytics e usa
servidores de terceiros para gerar prévia de links. Na extensão **as duas
coisas ficam desligadas**: o `wa-before.js` roda antes da biblioteca e define
`window.WPPConfig` com `disableGoogleAnalytics: true` e
`linkPreviewApiServers: []`. O Diagnóstico do painel mostra se isso está
valendo ("Telemetria e servidores de terceiros da biblioteca desligados").

## Como atualizar

1. Numa pasta temporária, **fora do repositório**:
   `npm pack @wppconnect/wa-js@<nova versão>` e `tar -xzf` no `.tgz`
   (não instale dependências nem rode scripts do pacote).
2. Calcule o SHA-256 de `package/dist/wppconnect-wa.js`
   (PowerShell: `Get-FileHash <arquivo> -Algorithm SHA256`) e anote.
3. Confira no `CHANGELOG.md` e nos `.d.ts` do pacote se as funções acima
   continuam com os mesmos nomes e parâmetros, e se `disableGoogleAnalytics` e
   `linkPreviewApiServers` ainda existem.
4. Troque, sem modificar, `wppconnect-wa.js`, `wppconnect-wa.js.LICENSE.txt` e
   `LICENSE-wa-js.txt`, e atualize a versão e o SHA-256 nesta página.
5. Rode os testes da extensão (fluxo rápido do áudio, privacidade, suítes
   anteriores).

## Atenção

A biblioteca depende do código interno do WhatsApp Web. Quando o WhatsApp muda
o site, ela pode parar de funcionar até sair uma versão nova. Nesse caso a
extensão usa sozinha o plano B (gravação simulada) ou anexa como arquivo, e o
Diagnóstico mostra "WhatsApp pronto para a biblioteca: não".
