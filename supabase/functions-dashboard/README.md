# Edge functions prontas para o painel do Supabase

Para publicar pelo painel, use os arquivos de supabase/functions-dashboard/<nome>/.

O editor web do painel não aceita a pasta compartilhada `supabase/functions/_shared/`. Por isso, para cada function
que usa essa pasta, existe aqui uma cópia com os arquivos de `_shared` já dentro da pasta da function e os imports
trocados de `'../_shared/x.ts'` para `'./x.ts'`. **A lógica é a mesma** (o teste confere arquivo por arquivo).

| function | arquivos (todos vão para o editor da function) |
|---|---|
| `ig-manage` | `index.ts`, `manage.ts`, `igApi.ts`, `igEngine.ts`, `igRules.ts`, `igStore.ts`, `igToken.ts` |
| `ig-webhook` | `index.ts`, `hook.ts`, `igApi.ts`, `igEngine.ts`, `igRules.ts`, `igStore.ts`, `igToken.ts` |

No painel (Edge Functions → a function → Code): crie/cole cada arquivo com o **mesmo nome**, mantenha `index.ts` como
o arquivo de entrada e, nas configurações da function, deixe **Verify JWT desligado** (as duas são públicas: o
webhook da Meta e o retorno do OAuth não mandam login).

- **Não edite estas cópias.** Mude o original em `supabase/functions/` e gere de novo:
  `node scripts/bundle-functions.mjs` (`--check` só confere se estão em dia).
- Teste: `node scripts/tests/bundleFunctions.test.ts` (iguais ao original, exceto os caminhos de import; nenhum
  import para `../`).
