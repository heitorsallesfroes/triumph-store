# Páginas públicas: Política de Privacidade e Exclusão de Dados

Exigidas pela Meta na análise do app (Instagram). Abrem **sem login**, no computador e no celular:

- https://triumph-store.vercel.app/privacidade → `public/privacidade/index.html`
- https://triumph-store.vercel.app/exclusao-de-dados → `public/exclusao-de-dados/index.html`
- estilo: `public/legal.css` (mesma identidade do ERP; segue o tema claro/escuro escolhido no ERP)

São **HTML estático** (fora do React e do login): a Vercel serve a pasta `public/` como está, e o robô da Meta
consegue ler o texto sem rodar JavaScript. Nada aqui lê ou grava dados.

Na tela de login do ERP (`src/components/AuthGate.tsx`) há dois links discretos no rodapé para essas páginas.

## Para atualizar o texto
Edite os dois `index.html` e troque a data de "Atualizada em …" no topo. Contatos usados: e-mail
store.triumph1@gmail.com e WhatsApp (21) 98092-1808. Para a Meta: URL da Política de Privacidade = `/privacidade`;
URL de instruções de exclusão de dados = `/exclusao-de-dados`.

## Teste
`node scripts/tests/legalChrome.test.ts`: Chrome real com um servidor local que serve `public/` como a Vercel; confere
que as páginas abrem sem login, o conteúdo pedido, o celular (360 px) e os links do login.
