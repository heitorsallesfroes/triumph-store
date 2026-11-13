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

## 4. Testar

1. No ERP, menu **Gestão → Notas fiscais**:
   - **Certificado digital** tem que aparecer "Válido até …".
   - Clique **Testar conexão com a SEFAZ**: o certo é **107 — Serviço em operação** em homologação (e em produção; esse teste não emite nada).
   - Confira os dados em **Emitente e numeração** (clique Editar para mudar).
2. **Histórico de Vendas** → numa venda, botão **Nota fiscal**:
   - Confira cliente (CPF, endereço, CEP — a cidade e o código IBGE vêm do CEP) e itens (nome, NCM, qtd, valor).
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
| "produto sem NCM: …" | cadastre o NCM do produto em **Produtos** (ou digite no modal) |
| Rejeição 972 (responsável técnico) | preencha nome, e-mail e telefone do responsável técnico em Notas fiscais → Editar |
| Rejeição 1115 / 225 | o sistema já tenta de novo com o grupo IBS/CBS em teste; se continuar, mande o motivo completo |
