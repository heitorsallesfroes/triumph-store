# Nota fiscal própria (NF-e) — passo a passo

Fase 1: **só teste (homologação)**. A nota vai para a SEFAZ (SVRS, que atende o RJ), mas **não tem valor fiscal**.
Produção só depois que você conferir o DANFE de teste.

---

## 1. Gerar o base64 do certificado (Windows)

1. Coloque o arquivo do certificado A1 (`.pfx`) numa pasta, por exemplo `C:\certificado\triumph.pfx`.
2. Abra o **PowerShell** (menu Iniciar → digite "PowerShell" → Enter).
3. Cole este comando (troque o caminho pelo do seu arquivo) e aperte Enter:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\certificado\triumph.pfx")) | Set-Clipboard
```

4. Pronto: o texto do certificado (uma linha só, bem comprida) já está **copiado**. Não aparece nada na tela, é normal.

> Não salve esse texto em arquivo, e-mail ou WhatsApp. Ele vai direto para a Vercel.

## 2. Colar na Vercel

1. Entre em **vercel.com** → abra o projeto do ERP → **Settings** → **Environment Variables**.
2. Crie estas 4 variáveis (Key = nome, Value = valor). Marque **Production** (e **Preview**, se usar) e, se aparecer, **Sensitive**:

| Key | Value |
|---|---|
| `NFE_CERT_B64` | cole (Ctrl+V) o texto copiado no passo 1 |
| `NFE_CERT_SENHA` | a senha do certificado |
| `SUPABASE_URL` | o endereço do Supabase (o mesmo do `VITE_SUPABASE_URL`, ex.: `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings** → **API Keys** → chave **service_role / secret** |

3. Salve e faça um **Redeploy** (Deployments → os três pontinhos do último → Redeploy). Variável nova só vale depois do redeploy.

> Essas 4 coisas ficam **só** na Vercel. Nada disso vai para o código nem para o GitHub. O arquivo `.env.example` tem só os nomes.

## 3. Criar as tabelas no Supabase

1. Supabase → **SQL Editor** → **New query**.
2. Copie todo o conteúdo de `supabase/migrations/20261120120000_nfe_emissor.sql`, cole e clique **Run**.
3. Isso cria `nfe_config` (já com os dados da LOJA TRIUMPH LTDA, série 2) e `nfe_notas`, mais as funções de número.
4. Faça o mesmo com `supabase/migrations/20261121120000_acessorios_ncm.sql`: cria a coluna **NCM** nos acessórios/brindes
   e já preenche pulseira (**9113.90.00**) e fone (**8518.30.00**). Os outros ficam vazios.
5. Em **Acessórios / Brindes**, confira a coluna NCM e preencha (botão de editar) o que aparecer "sem NCM".
   Brinde sem NCM trava a nota.

## 4. Testar

1. No ERP, menu **Gestão → Notas fiscais**:
   - **Certificado digital** tem que aparecer "Válido até …".
   - Clique **Testar conexão com a SEFAZ**: o certo é **107 — Serviço em operação** em homologação (e em produção; esse teste não emite nada).
   - Confira os dados em **Emitente e numeração** (clique Editar para mudar).
2. **Histórico de Vendas** → numa venda, botão **Nota fiscal**:
   - Confira cliente (CPF, endereço, CEP — a cidade e o código IBGE vêm do CEP) e itens (nome, NCM, qtd, valor).
   - O NCM do produto vem de **Produtos**; o do brinde vem de **Acessórios / Brindes**. Se faltar, o modal diz qual item está sem e não emite.
   - Cliente de **fora do RJ**: aparece um aviso amarelo ("a nota sai com CFOP 6102, operação interestadual").
     Confira a UF e o endereço e marque **Conferi**; só então o botão de emitir libera.
   - Em teste, o nome do cliente e do 1º item aparecem com o texto da SEFAZ ("…HOMOLOGACAO - SEM VALOR FISCAL"). É obrigatório.
   - Clique **Emitir teste (homologação)**.
3. Resultado:
   - **Autorizada** → botões **Baixar DANFE (PDF)** e **Baixar XML**.
   - **Rejeitada** → aparece o código e o motivo. O número volta. Corrija e emita de novo.
   - **Pendente** (SEFAZ não respondeu) → clique **Consultar SEFAZ** antes de tentar outra vez.

## 5. O que conferir no DANFE de teste

- Chave de acesso e código de barras; protocolo de autorização.
- Emitente: LOJA TRIUMPH LTDA, CNPJ 49.923.481/0001-04, IE 13748756, Rua Quinze de Novembro, 106, Sala 908, Centro, Niterói/RJ.
- Natureza: "Venda de mercadorias de terceiros para consumidor final"; série 2.
- Itens: NCM de cada produto, CFOP 5102 (6102 se o cliente for de fora do RJ), CSOSN 102, unidade "Pc"; brinde com 0,00.
- Total = produtos − desconto (+ frete).
- Dados adicionais: "Tributos aproximados: R$ … (Federal) e R$ … (Estadual). Fonte: IBPT" e a frase do Simples.
- Tarja "SEM VALOR FISCAL - HOMOLOGAÇÃO".

Compare o XML baixado com o XML de uma nota real do Tiny (CFOP, CSOSN, IPI, PIS/COFINS, `indPres`, `natOp`, `infCpl`).

## Problemas comuns

| Aparece | O que fazer |
|---|---|
| "certificado não configurado" | faltou `NFE_CERT_B64` ou `NFE_CERT_SENHA` na Vercel, ou faltou o Redeploy |
| "não consegui abrir o certificado" | senha errada, ou o base64 não foi copiado inteiro (gere de novo pelo passo 1) |
| "faça login no ERP" (401) | a sessão expirou: saia e entre de novo |
| "Aplique no Supabase a migration…" | faltou o passo 3 |
| "produto sem NCM: …" / "Item sem NCM: …" | cadastre o NCM em **Produtos** (produto) ou **Acessórios / Brindes** (brinde), ou digite no modal |
| Brinde "sem NCM" mesmo cadastrado | faltou aplicar `20261121120000_acessorios_ncm.sql` (passo 3.4) |
| Botão de emitir cinza com aviso amarelo | cliente de fora do RJ: marque **Conferi** depois de conferir |
| "unable to get local issuer certificate" | o servidor da SEFAZ usa a cadeia ICP-Brasil. Ela já vai no projeto (`api/_lib/icp-brasil.pem`) — faça o Redeploy. Se a SEFAZ trocar de AC, veja "Cadeia ICP-Brasil" abaixo |
| Rejeição 972 (responsável técnico) | preencha nome, e-mail e telefone do responsável técnico em Notas fiscais → Editar |
| Rejeição 1115 / 225 | o sistema já tenta de novo com o grupo IBS/CBS em teste; se continuar, mande o motivo completo |

## Cadeia ICP-Brasil (TLS com a SEFAZ)

Os servidores da SVRS (`nfe-homologacao.svrs.rs.gov.br` e `nfe.svrs.rs.gov.br`) usam certificado da ICP-Brasil:
`*.svrs.rs.gov.br` ← **AC SERPRO SSLv1** ← **AC Raiz Brasileira v10**. Essas ACs não vêm no Node, então o
`api/_lib/icp-brasil.pem` traz o pacote oficial do ITI (raízes v5 a v12 e as intermediárias) e entra como `ca`
junto com as raízes padrão. A verificação do servidor **continua ligada** (nada de `rejectUnauthorized: false`).

Para atualizar (se um dia a SEFAZ trocar de AC): baixe o pacote em
<https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip>, junte todos os
certificados em PEM no `api/_lib/icp-brasil.pem` (o teste `node scripts/tests/nfe.test.ts` confere que a Raiz v10
e a AC SERPRO SSLv1 estão lá) e faça o Redeploy.
