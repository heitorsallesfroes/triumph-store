# Emissor próprio de NF-e (modelo 55) direto na SEFAZ — o que aprendemos

> Documento para quem vai construir um emissor igual ligado a um ERP em **React + Supabase + Vercel**.
> Tudo o que é secreto ou pessoal foi trocado por exemplos (`SEU_TOKEN`, `00000000000000`, `exemplo.com`, `SUA_CIDADE`).
> Estado de origem: **Amazonas (SEFAZ-AM)**, empresa do **Simples Nacional (CRT 1)**, vendas a **consumidor final pessoa física**.

---

## ⚠️ Antes de tudo: a arquitetura que ficou NÃO é PHP/VPS

O roteiro clássico (PHP + sped-nfe + Docker num VPS + SQLite + proxy) foi usado **só no começo, como protótipo de homologação**, rodando em Docker no próprio computador (não num VPS). Ele serviu para validar o XML e os dados com a SEFAZ.

A versão que está **em produção** é outra e mais simples:

- **Sem VPS, sem PHP, sem SQLite, sem proxy.** O emissor é **JavaScript (Node)** rodando numa **função serverless da Vercel**, no mesmo projeto do ERP.
- O XML é montado, **assinado (XMLDSig)** e enviado à SEFAZ por **SOAP 1.2 com TLS mútuo** usando o certificado A1, tudo em Node puro (`crypto`, `https` e `node-forge` para abrir o `.pfx`).
- O banco é o **Supabase (Postgres)**: tabelas `nfe_config` e `nfe_notas` e duas funções para a numeração.
- O **DANFE é gerado no navegador** (jsPDF) a partir do XML autorizado.

Por isso, algumas coisas do pedido original (rotas `/cce`, `/inutilizar`, Dockerfile de produção, banco SQLite) **não existem** neste projeto. Onde for o caso, explico o que fazer.

---

## 1. VISÃO GERAL

### 1.1 Arquitetura

```
[Navegador: tela "Notas fiscais" (React)]
      │  POST /api?action=fiscal  { op: 'emitir', ... }   (JWT do usuário no Authorization)
      ▼
[Vercel: função serverless api/index.js → lib/fiscal.js → lib/nfe.js]
      │  1) confere os dados  2) reserva o número (RPC no Supabase)
      │  3) monta e assina o XML  4) GUARDA o XML assinado  5) envia
      ▼
[SEFAZ do estado: web service NFeAutorizacao4 (SOAP 1.2, TLS com o certificado A1)]
      │  resposta síncrona (indSinc=1): protNFe com cStat 100 = autorizada
      ▼
[Supabase: nfe_notas.xml = nfeProc autorizado]  →  DANFE gerado no navegador a partir do XML
```

- **Na Vercel:** toda a lógica fiscal, o certificado (variáveis de ambiente) e a conversa com a SEFAZ.
- **No ERP (navegador):** a tela que lista as vendas, o formulário da nota, o DANFE em PDF e o .zip dos XMLs do mês.
- **No Supabase:** configuração do emitente, numeração e todas as notas com o XML.
- **Proxy:** nenhum. A função serverless fala direto com a SEFAZ.

### 1.2 Versões

| Peça | Versão |
|---|---|
| Runtime | Node 20 (padrão da Vercel) |
| Assinatura/certificado | `node-forge` 1.x (só para abrir o .pfx) + `crypto` nativo (RSA-SHA1) |
| Leiaute | NF-e 4.00 |
| DANFE | `jspdf` 2.x, no navegador |
| Protótipo de homologação (não usado em produção) | Docker `php:8.3` + `nfephp-org/sped-nfe` 5.2.x + `sped-da` |

**Memória/CPU:** a função roda no plano gratuito (Hobby) da Vercel. Uma emissão leva de 1 a 4 s (quase tudo é espera pela SEFAZ). Atenção ao **limite de tempo da função**: deixe o `timeout` do SOAP em até 30 s.

### 1.3 Custo mensal

| Item | Custo |
|---|---|
| Vercel (Hobby) | R$ 0 |
| Supabase (plano grátis, o mesmo do ERP) | R$ 0 |
| Domínio | não precisa (usa o do ERP) |
| Certificado A1 | o único custo: pago por ano na certificadora |
| Bling/emissor pago | substituído |

> Atenção ao limite de **12 funções serverless** do plano Hobby da Vercel: por isso tudo entra como `?action=fiscal&op=...` numa função que já existe.

---

## 2. CÓDIGO (sanitizado e completo)

### 2.1 Variáveis de ambiente (Vercel)

```bash
# .env.example — só nomes e exemplos. NUNCA comite o .env real.
NFE_CERT_B64=COLE_AQUI_O_PFX_EM_BASE64_NUMA_LINHA_SO
NFE_CERT_SENHA=SENHA_DO_CERTIFICADO
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_SECRET_KEY=sb_secret_SEU_TOKEN        # chave de servidor, só no backend
```

Gerar o base64 do certificado **sem quebra de linha** (o Vercel recusa valor com `\n`):

```bash
base64 -i certificado.pfx | tr -d '\n' | pbcopy      # macOS
base64 -w0 certificado.pfx                            # Linux
```

Dependências:

```bash
npm i node-forge jspdf
```

> **Dockerfile, docker-compose, OpenSSL legacy e script instalador:** não existem nesta arquitetura. No protótipo PHP, o OpenSSL 3 precisou do *legacy provider* para abrir o .pfx antigo (RC2-40). O `node-forge` abre esse .pfx sem isso, e esse foi um dos motivos de sair do PHP.

### 2.2 Banco (Supabase/Postgres) — tabelas e numeração

Regra de numeração: **um contador por empresa e ambiente** (`proximo_producao` e `proximo_homolog`), na **série** configurada. A série 2 foi usada para rodar em paralelo com o emissor antigo (série 1) sem conflito de número.
- O número é reservado de forma atômica (`nfe_reservar`): duas emissões ao mesmo tempo nunca pegam o mesmo número.
- **Rejeitada:** a nota não existe na SEFAZ, então o número **volta** (`nfe_devolver`).
- **Sem resposta:** o número **fica preso** até a consulta dizer se a nota entrou ou não.
- Índices únicos impedem número repetido e duas notas para a mesma venda.

```sql
-- 092: TFX Fiscal — NF-e própria (no lugar do Bling)
-- nfe_config: dados do emitente e numeração por ambiente (1 = produção, 2 = homologação/teste)
-- nfe_notas: cada nota emitida (XML autorizado guardado aqui; o DANFE é gerado do XML)
create table if not exists nfe_config (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  ambiente int not null default 2 check (ambiente in (1, 2)),
  serie int not null default 2,
  proximo_producao int not null default 1,
  proximo_homolog int not null default 20,
  emitente jsonb not null default '{}',          -- cnpj, ie, razao, fantasia, endereço, cod_municipio, crt, resp técnico
  natop text not null default 'Venda de mercadoria a não contribuinte',
  ibpt_fed numeric not null default 19.89,       -- % aproximado de tributos (Lei 12.741), igual ao que o Bling mostrava
  ibpt_est numeric not null default 20.00,
  info text not null default '',                 -- informação complementar fixa (vai em toda nota)
  atualizado_em timestamptz not null default now()
);

create table if not exists nfe_notas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  venda_id text,                                 -- id da venda no Gestão
  ambiente int not null,
  serie int not null,
  numero int not null,
  chave text,
  status text not null default 'emitindo' check (status in ('emitindo', 'autorizada', 'rejeitada', 'cancelada', 'erro')),
  cstat text,
  motivo text,
  protocolo text,
  cliente text,
  valor numeric,
  dados jsonb,                                   -- o que foi pedido (cliente, itens) — para refazer se rejeitar
  xml text,                                      -- nfeProc autorizado
  xml_cancelamento text,
  criado_em timestamptz not null default now(),
  autorizada_em timestamptz,
  cancelada_em timestamptz
);
create index if not exists nfe_notas_tenant on nfe_notas (tenant_id, criado_em desc);
create unique index if not exists nfe_notas_numero on nfe_notas (tenant_id, ambiente, serie, numero) where status in ('emitindo', 'autorizada', 'cancelada');
create unique index if not exists nfe_notas_venda on nfe_notas (tenant_id, ambiente, venda_id) where status in ('emitindo', 'autorizada') and venda_id is not null;

-- reserva o próximo número sem repetir (duas emissões juntas nunca pegam o mesmo)
create or replace function nfe_reservar(p_tenant uuid, p_ambiente int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into nfe_config (tenant_id) values (p_tenant) on conflict do nothing;
  if p_ambiente = 1 then
    update nfe_config set proximo_producao = proximo_producao + 1 where tenant_id = p_tenant returning proximo_producao - 1 into n;
  else
    update nfe_config set proximo_homolog = proximo_homolog + 1 where tenant_id = p_tenant returning proximo_homolog - 1 into n;
  end if;
  return n;
end $$;
-- devolve o número quando a SEFAZ rejeitou (nota rejeitada não existe lá; o número pode ser usado de novo)
create or replace function nfe_devolver(p_tenant uuid, p_ambiente int, p_numero int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_ambiente = 1 then
    update nfe_config set proximo_producao = p_numero where tenant_id = p_tenant and proximo_producao = p_numero + 1;
  else
    update nfe_config set proximo_homolog = p_numero where tenant_id = p_tenant and proximo_homolog = p_numero + 1;
  end if;
  return found;
end $$;

alter table nfe_config enable row level security;
alter table nfe_notas enable row level security;
revoke all on nfe_config, nfe_notas from public, anon, authenticated;
revoke all on function nfe_reservar(uuid, int), nfe_devolver(uuid, int, int) from public, anon, authenticated;
grant execute on function nfe_reservar(uuid, int), nfe_devolver(uuid, int, int) to service_role;
notify pgrst, 'reload schema';

-- conferência
select to_regclass('public.nfe_config') is not null as config_ok,
       to_regclass('public.nfe_notas') is not null as notas_ok,
       to_regprocedure('nfe_reservar(uuid,int)') is not null as numeracao_ok;

```

### 2.3 Rotas (uma função, várias operações)

Em vez de `/emitir`, `/notas`, `/cancelar`…, há **uma rota** com `op`, para respeitar o limite de funções da Vercel. A autenticação é o **JWT do Supabase do usuário logado** (papel owner ou editor), e não um token fixo.

| Pedido | Faz |
|---|---|
| `GET ?action=fiscal` | painel: config, situação do certificado, notas e vendas recentes |
| `GET ?action=fiscal&op=rascunho&venda=ID` | monta a nota a partir da venda (cliente + itens + NCM) |
| `GET ?action=fiscal&op=produtos` | estoque para adicionar ou trocar item |
| `GET ?action=fiscal&op=cep&cep=00000000` | endereço e código IBGE pelo CEP (ViaCEP) |
| `GET ?action=fiscal&op=cep_rua&rua=...&bairro=...` | acha o CEP pela rua quando o cadastro não tem |
| `GET ?action=fiscal&op=sefaz` | status do serviço (produção e homologação) |
| `GET ?action=fiscal&op=xml&id=ID[&tipo=cancelamento]` | XML autorizado ou do cancelamento |
| `GET ?action=fiscal&op=xmls&mes=AAAA-MM` | XMLs do mês para o contador |
| `POST {op:'emitir', ...}` | emite |
| `POST {op:'consultar', id}` | consulta pela chave (nota sem resposta) |
| `POST {op:'cancelar', id, justificativa}` | cancela (evento 110111) |
| `POST {op:'config', emitente, ambiente, serie, ...}` | salva dados da empresa e numeração |

**Não implementado** (e como fazer):
- **CC-e:** evento `110110`, igual ao cancelamento. Troque `tpEvento`, `descEvento` ("Carta de Correcao"), `xCorrecao` e `xCondUso` (texto fixo da norma), e incremente `nSeqEvento` a cada correção.
- **Inutilizar:** serviço `NFeInutilizacao4`, com `inutNFe`/`infInut` assinado (Id `ID` + UF + ano + CNPJ + mod + série + número inicial + número final). Só faz sentido para números pulados que nunca foram enviados.

```js
// api/index.js — trecho da rota (exigirPapel valida o JWT e devolve o tenant)
      case 'fiscal': {
        const auth = await exigirPapel(req, ['owner', 'editor']);
        if (auth.erro) return res.status(auth.erro).json({ error: auth.erro === 401 ? 'faça login novamente' : 'sem acesso' });
        const FIS = require('../lib/fiscal');
        const tenantId = auth.tenants[0];
        const [t] = await db.select('tenants', `select=id,gestao_tenant_id&id=eq.${tenantId}&limit=1`);
        const gt = t?.gestao_tenant_id || null;
        try {
          if (req.method === 'GET') {
            if (q.op === 'xml') return res.status(200).json(await FIS.xml(db, tenantId, q.id, q.tipo));
            if (q.op === 'cep') return res.status(200).json(await FIS.cep(q.cep));
            if (q.op === 'cep_rua') return res.status(200).json((await FIS.cepPelaRua(q.uf || 'AM', q.cidade || 'Manaus', q.rua, q.bairro)) || { erro: 'não achei o CEP por esse endereço' });
            if (q.op === 'xmls') return res.status(200).json(await FIS.xmlsDoMes(db, tenantId, q.mes));
            if (q.op === 'produtos') return res.status(200).json(gt ? { produtos: await FIS.produtos(gt) } : { produtos: [] });
            if (q.op === 'rascunho') return res.status(200).json(gt ? await FIS.rascunho(gt, q.venda) : { erro: 'Gestão não ligado' });
            if (q.op === 'sefaz') return res.status(200).json(await FIS.statusSefaz());
            return res.status(200).json(await FIS.painel(db, tenantId, gt));
          }
          const b = typeof req.body === 'object' && req.body ? req.body : {};
          if (b.op === 'emitir') return res.status(200).json(await FIS.emitir(db, tenantId, gt, b));
          if (b.op === 'consultar') return res.status(200).json(await FIS.consultar(db, tenantId, b.id));
          if (b.op === 'cancelar') {
            return res.status(200).json(await FIS.cancelar(db, tenantId, b.id, b.justificativa));
          }
          if (b.op === 'config') return res.status(200).json(await FIS.salvarConfig(db, tenantId, b));
          return res.status(400).json({ error: 'op inválida' });
        } catch (e) {
          if (/nfe_(config|notas|reservar)/.test(e.message)) return res.status(200).json({ erro: 'Rode o SQL 092 no Supabase (notas fiscais).' });
          return res.status(500).json({ error: String(e.message).slice(0, 300) });
        }
      }
```

### 2.4 Núcleo NF-e — `lib/nfe.js` (XML, assinatura, SOAP, consulta, cancelamento)

```js
// 🧾 TFX Fiscal — NF-e modelo 55 direto na SEFAZ (sem Bling), em Node puro.
// Monta o XML igual ao validado na homologação da SEFAZ-AM (sped-nfe, 14/10), assina com o certificado A1
// (XMLDSig enveloped, C14N, RSA-SHA1) e manda pelo web service SOAP 1.2 com o próprio certificado (TLS mútuo).
// Regras da loja (iguais às notas do Bling): CFOP 5102 (6102 fora do AM), CSOSN 102, PIS/COFINS CST 49 zerados,
// indPres 9, modFrete 9 quando não há transporte, só os itens pagos (brinde de valor 0 não entra).
const crypto = require('crypto');
const https = require('https');
const forge = require('node-forge');

const NS = 'http://www.portalfiscal.inf.br/nfe';
const DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const WS = {
  AM: {
    1: 'https://nfe.sefaz.am.gov.br/services2/services/',
    2: 'https://homnfe.sefaz.am.gov.br/services2/services/',
  },
};
const SERV = {
  autorizacao: ['NfeAutorizacao4', 'NFeAutorizacao4', 'nfeAutorizacaoLote'],
  consulta: ['NfeConsulta4', 'NFeConsultaProtocolo4', 'nfeConsultaNF'],
  status: ['NfeStatusServico4', 'NFeStatusServico4', 'nfeStatusServicoNF'],
  evento: ['RecepcaoEvento4', 'NFeRecepcaoEvento4', 'nfeRecepcaoEvento'],
};
const UF_COD = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };
const HOMOLOG_NOME = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';

// ── texto ──
// escapa como o C14N espera no conteúdo (& < >); tira espaços duplos/pontas e caracteres de controle
const txt = (v, max = 60) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dig = (v) => String(v ?? '').replace(/\D/g, '');
const d2 = (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
const tag = (n, v) => (v === undefined || v === null || v === '' ? '' : `<${n}>${v}</${n}>`);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// ── certificado A1 (.pfx em base64 + senha) ──
function lerCertificado(pfxB64, senha) {
  const der = forge.util.decode64(String(pfxB64).replace(/\s+/g, ''));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), String(senha));
  const chaves = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert);
  const key = chaves[0].key;
  // o certificado da empresa é o que casa com a chave (os outros são da cadeia)
  const pub = forge.pki.publicKeyToPem(forge.pki.setRsaPublicKey(key.n, key.e));
  const cert = certs.find((c) => forge.pki.publicKeyToPem(c.publicKey) === pub) || certs[0];
  const certPem = forge.pki.certificateToPem(cert);
  const nome = (cert.subject.getField('CN') || {}).value || '';
  const cnpj = (nome.match(/:(\d{14})/) || [])[1] || '';
  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certPem,
    certB64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
    cadeia: certs.filter((c) => c !== cert).map((c) => forge.pki.certificateToPem(c)).join(''),
    nome, cnpj, validade: cert.validity.notAfter,
  };
}

// ── assinatura XMLDSig (o elemento é gerado por nós já na forma canônica) ──
// no C14N o elemento assinado leva o xmlns herdado e os atributos em ordem (Id antes de versao)
function assinar(xml, elemento, id, cert) {
  const ini = xml.indexOf(`<${elemento} `);
  const fim = xml.indexOf(`</${elemento}>`) + elemento.length + 3;
  const canon = xml.slice(ini, fim).replace(`<${elemento} `, `<${elemento} xmlns="${NS}" `);
  const digest = crypto.createHash('sha1').update(canon, 'utf8').digest('base64');
  const signedInfo = `<SignedInfo xmlns="${DSIG}"><CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod><SignatureMethod Algorithm="${DSIG}rsa-sha1"></SignatureMethod><Reference URI="#${id}"><Transforms><Transform Algorithm="${DSIG}enveloped-signature"></Transform><Transform Algorithm="${C14N}"></Transform></Transforms><DigestMethod Algorithm="${DSIG}sha1"></DigestMethod><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const valor = crypto.createSign('RSA-SHA1').update(signedInfo, 'utf8').sign(cert.keyPem, 'base64');
  const assinatura = `<Signature xmlns="${DSIG}">${signedInfo.replace(` xmlns="${DSIG}"`, '')}<SignatureValue>${valor}</SignatureValue><KeyInfo><X509Data><X509Certificate>${cert.certB64}</X509Certificate></X509Data></KeyInfo></Signature>`;
  return xml.slice(0, fim) + assinatura + xml.slice(fim);
}

// ── chave de acesso ──
function dvChave(c43) {
  let soma = 0, peso = 2;
  for (let i = c43.length - 1; i >= 0; i--) { soma += Number(c43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}
function montarChave({ uf, data, cnpj, serie, numero, cNF }) {
  const aamm = `${String(data.getFullYear()).slice(2)}${String(data.getMonth() + 1).padStart(2, '0')}`;
  const c43 = `${UF_COD[uf]}${aamm}${dig(cnpj).padStart(14, '0')}55${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}1${cNF}`;
  return c43 + dvChave(c43);
}

// data/hora com fuso (Manaus = -04:00 o ano todo)
function dhLocal(d = new Date(), fuso = -4) {
  const l = new Date(d.getTime() + fuso * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  const sinal = fuso < 0 ? '-' : '+';
  return `${l.getUTCFullYear()}-${p(l.getUTCMonth() + 1)}-${p(l.getUTCDate())}T${p(l.getUTCHours())}:${p(l.getUTCMinutes())}:${p(l.getUTCSeconds())}${sinal}${p(Math.abs(fuso))}:00`;
}
const dataLocal = (d, fuso = -4) => { const l = new Date(d.getTime() + fuso * 3600e3); return new Date(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()); };

// ── conferência antes de montar (mensagens em português, para a tela) ──
function cpfValido(c) {
  c = dig(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
function cnpjValido(c) {
  c = dig(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = p.reduce((a, w, i) => a + Number(c[i]) * w, 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
function conferir(nota) {
  const e = [];
  const d = nota.dest || {};
  const doc = dig(d.doc);
  if (!(doc.length === 11 ? cpfValido(doc) : doc.length === 14 ? cnpjValido(doc) : false)) e.push('CPF/CNPJ do cliente inválido');
  if (String(d.nome || '').trim().length < 2) e.push('nome do cliente');
  if (!String(d.endereco || '').trim()) e.push('endereço do cliente');
  if (!String(d.bairro || '').trim()) e.push('bairro do cliente');
  if (dig(d.cep).length !== 8) e.push('CEP do cliente');
  if (!/^\d{7}$/.test(dig(d.cod_municipio))) e.push('município do cliente (código IBGE: confira o CEP)');
  if (!UF_COD[String(d.uf || '').toUpperCase()]) e.push('UF do cliente');
  if (!nota.itens?.length) e.push('nenhum item com valor');
  (nota.itens || []).forEach((i, k) => {
    if (!/^\d{8}$/.test(dig(i.ncm))) e.push(`NCM do item ${k + 1} (${i.nome || ''})`);
    if (!(Number(i.qtd) > 0) || !(Number(i.valor) > 0)) e.push(`quantidade/valor do item ${k + 1}`);
  });
  return e;
}

// ── XML da NF-e ──
// nota: { ambiente, serie, numero, data(Date), dest:{doc,nome,email,fone,endereco,numero,complemento,bairro,cep,cod_municipio,municipio,uf},
//         itens:[{codigo,nome,ncm,cest,cfop?,unidade,qtd,valor(unit),orig,csosn}], desconto, frete, pagamento:{tPag}, info, ibpt:{fed,est} }
// emit: { cnpj, ie, razao, fantasia, logradouro, numero, bairro, cep, cod_municipio, municipio, uf, fone, crt, resp:{contato,email,fone} }
function montarXml(nota, emit) {
  const amb = Number(nota.ambiente) === 1 ? 1 : 2;
  const data = nota.data || new Date();
  const uf = String(emit.uf || 'AM').toUpperCase();
  const cNF = String(nota.cNF || crypto.randomInt(10000000, 99999999));
  const chave = montarChave({ uf, data: dataLocal(data), cnpj: emit.cnpj, serie: nota.serie, numero: nota.numero, cNF });
  const id = `NFe${chave}`;
  const d = nota.dest;
  const ufDest = String(d.uf).toUpperCase();
  const fora = ufDest !== uf;
  const cfopPadrao = fora ? '6102' : '5102';

  // itens e rateio do desconto (proporcional; a diferença dos centavos vai no último)
  const itens = nota.itens.map((i) => ({ ...i, qtd: Number(i.qtd), valor: Number(i.valor), vProd: r2(Number(i.qtd) * Number(i.valor)) }));
  const vProd = r2(itens.reduce((a, i) => a + i.vProd, 0));
  const vDescTot = Math.min(r2(nota.desconto), vProd);
  let resto = vDescTot;
  itens.forEach((i, k) => { const v = k === itens.length - 1 ? r2(resto) : r2((vDescTot * i.vProd) / vProd); i.vDesc = v; resto = r2(resto - v); });
  const vFrete = r2(nota.frete);
  let restoF = vFrete;
  itens.forEach((i, k) => { const v = k === itens.length - 1 ? r2(restoF) : r2((vFrete * i.vProd) / vProd); i.vFrete = v; restoF = r2(restoF - v); });
  const vNF = r2(vProd - vDescTot + vFrete);
  const pFed = Number(nota.ibpt?.fed) || 0, pEst = Number(nota.ibpt?.est) || 0;
  itens.forEach((i) => { i.vTotTrib = r2(((i.vProd - i.vDesc) * (pFed + pEst)) / 100); });
  const vTotTrib = r2(itens.reduce((a, i) => a + i.vTotTrib, 0));

  const ide = `<ide><cUF>${UF_COD[uf]}</cUF><cNF>${cNF}</cNF><natOp>${txt(nota.natOp || 'Venda de mercadoria a não contribuinte', 60)}</natOp><mod>55</mod><serie>${Number(nota.serie)}</serie><nNF>${Number(nota.numero)}</nNF><dhEmi>${dhLocal(data)}</dhEmi><dhSaiEnt>${dhLocal(data)}</dhSaiEnt><tpNF>1</tpNF><idDest>${fora ? 2 : 1}</idDest><cMunFG>${dig(emit.cod_municipio)}</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>${amb}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>${nota.indPres || 9}</indPres>${(nota.indPres || 9) === 9 || (nota.indPres || 9) === 2 ? '<indIntermed>0</indIntermed>' : ''}<procEmi>0</procEmi><verProc>TFX-Fiscal 1.0</verProc></ide>`;
  const foneEmit = dig(emit.fone);
  const emitXml = `<emit><CNPJ>${dig(emit.cnpj)}</CNPJ><xNome>${txt(emit.razao)}</xNome>${emit.fantasia ? tag('xFant', txt(emit.fantasia)) : ''}<enderEmit><xLgr>${txt(emit.logradouro)}</xLgr><nro>${txt(emit.numero || 'S/N', 60)}</nro><xBairro>${txt(emit.bairro)}</xBairro><cMun>${dig(emit.cod_municipio)}</cMun><xMun>${txt(emit.municipio)}</xMun><UF>${uf}</UF><CEP>${dig(emit.cep)}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais>${foneEmit.length >= 6 ? tag('fone', foneEmit) : ''}</enderEmit><IE>${dig(emit.ie)}</IE><CRT>${Number(emit.crt) || 1}</CRT></emit>`;
  const doc = dig(d.doc);
  const foneDest = dig(d.fone).replace(/^55(?=\d{10,11}$)/, '');
  const destXml = `<dest>${doc.length === 14 ? tag('CNPJ', doc) : tag('CPF', doc)}<xNome>${amb === 2 ? HOMOLOG_NOME : txt(d.nome)}</xNome><enderDest><xLgr>${txt(d.endereco)}</xLgr><nro>${txt(d.numero || 'S/N')}</nro>${d.complemento ? tag('xCpl', txt(d.complemento)) : ''}<xBairro>${txt(d.bairro)}</xBairro><cMun>${dig(d.cod_municipio)}</cMun><xMun>${txt(d.municipio)}</xMun><UF>${ufDest}</UF><CEP>${dig(d.cep)}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais>${foneDest.length >= 6 ? tag('fone', foneDest) : ''}</enderDest><indIEDest>9</indIEDest>${/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email || '').trim()) ? tag('email', txt(d.email, 60)) : ''}</dest>`;
  const det = itens.map((i, k) => {
    const prod = `<prod><cProd>${txt(i.codigo || String(k + 1), 60)}</cProd><cEAN>SEM GTIN</cEAN><xProd>${txt(i.nome, 120)}</xProd><NCM>${dig(i.ncm)}</NCM>${dig(i.cest).length === 7 ? tag('CEST', dig(i.cest)) : ''}<CFOP>${i.cfop || cfopPadrao}</CFOP><uCom>${txt(i.unidade || 'UN', 6)}</uCom><qCom>${i.qtd.toFixed(4)}</qCom><vUnCom>${i.valor.toFixed(10)}</vUnCom><vProd>${d2(i.vProd)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${txt(i.unidade || 'UN', 6)}</uTrib><qTrib>${i.qtd.toFixed(4)}</qTrib><vUnTrib>${i.valor.toFixed(10)}</vUnTrib>${i.vFrete > 0 ? tag('vFrete', d2(i.vFrete)) : ''}${i.vDesc > 0 ? tag('vDesc', d2(i.vDesc)) : ''}<indTot>1</indTot></prod>`;
    const imp = `<imposto>${i.vTotTrib > 0 ? tag('vTotTrib', d2(i.vTotTrib)) : ''}<ICMS><ICMSSN102><orig>${Number(i.orig) || 0}</orig><CSOSN>${i.csosn || '102'}</CSOSN></ICMSSN102></ICMS><PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>${nota.ibscbs ? ibscbsItem(i) : ''}</imposto>`;
    return `<det nItem="${k + 1}">${prod}${imp}</det>`;
  }).join('');
  const tot = `<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${d2(vProd)}</vProd><vFrete>${d2(vFrete)}</vFrete><vSeg>0.00</vSeg><vDesc>${d2(vDescTot)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${d2(vNF)}</vNF>${vTotTrib > 0 ? tag('vTotTrib', d2(vTotTrib)) : ''}</ICMSTot>${nota.ibscbs ? ibscbsTotal(itens, vNF) : ''}</total>`;
  const transp = `<transp><modFrete>${vFrete > 0 ? 0 : 9}</modFrete></transp>`;
  const pag = `<pag><detPag><indPag>0</indPag><tPag>${nota.pagamento?.tPag || '17'}</tPag>${(nota.pagamento?.tPag || '17') === '99' ? tag('xPag', 'Outros') : ''}<vPag>${d2(vNF)}</vPag></detPag></pag>`;
  const infoTrib = vTotTrib > 0 ? `Total aproximado de tributos: R$ ${d2(vTotTrib).replace('.', ',')} (${(pFed + pEst).toFixed(2).replace('.', ',')}%) Federais R$ ${d2(r2(vTotTrib * pFed / (pFed + pEst))).replace('.', ',')} (${pFed.toFixed(2).replace('.', ',')}%) Estaduais R$ ${d2(r2(vTotTrib * pEst / (pFed + pEst))).replace('.', ',')} (${pEst.toFixed(2).replace('.', ',')}%). Fonte IBPT.` : '';
  const cpl = [nota.info, infoTrib, 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.'].filter(Boolean).join(' ');
  const infAdic = `<infAdic><infCpl>${txt(cpl, 5000)}</infCpl></infAdic>`;
  const resp = emit.resp && emit.resp.contato ? `<infRespTec><CNPJ>${dig(emit.cnpj)}</CNPJ><xContato>${txt(emit.resp.contato)}</xContato><email>${txt(emit.resp.email)}</email><fone>${dig(emit.resp.fone)}</fone></infRespTec>` : '';
  const inf = `<infNFe Id="${id}" versao="4.00">${ide}${emitXml}${destXml}${det}${tot}${transp}${pag}${infAdic}${resp}</infNFe>`;
  return { xml: `<NFe xmlns="${NS}">${inf}</NFe>`, chave, id, vNF, vTotTrib };
}
// IBS/CBS (reforma tributária): a homologação do AM exigiu em 2026 mesmo para o Simples; valores de teste
function ibscbsItem(i) {
  const b = r2(i.vProd - i.vDesc), vIBS = r2(b * 0.001), vCBS = r2(b * 0.009);
  return `<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>${d2(b)}</vBC><gIBSUF><pIBSUF>0.1000</pIBSUF><vIBSUF>${d2(vIBS)}</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>${d2(vIBS)}</vIBS><gCBS><pCBS>0.9000</pCBS><vCBS>${d2(vCBS)}</vCBS></gCBS></gIBSCBS></IBSCBS>`;
}
function ibscbsTotal(itens, vNF) {
  const b = r2(itens.reduce((a, i) => a + i.vProd - i.vDesc, 0));
  const vIBS = r2(itens.reduce((a, i) => a + r2((i.vProd - i.vDesc) * 0.001), 0)), vCBS = r2(itens.reduce((a, i) => a + r2((i.vProd - i.vDesc) * 0.009), 0));
  return `<IBSCBSTot><vBCIBSCBS>${d2(b)}</vBCIBSCBS><gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>${d2(vIBS)}</vIBSUF></gIBSUF><gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>${d2(vIBS)}</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS><gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${d2(vCBS)}</vCBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS><gMono><vIBSMono>0.00</vIBSMono><vCBSMono>0.00</vCBSMono><vIBSMonoReten>0.00</vIBSMonoReten><vCBSMonoReten>0.00</vCBSMonoReten><vIBSMonoRet>0.00</vIBSMonoRet><vCBSMonoRet>0.00</vCBSMonoRet></gMono></IBSCBSTot><vNFTot>${d2(vNF)}</vNFTot>`;
}

// ── SOAP com o certificado ──
function soap(servico, uf, amb, corpo, cert, { timeout = 30000 } = {}) {
  const [arq, wsdl, metodo] = SERV[servico];
  const url = new URL(WS[uf][amb] + arq);
  const env = `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${wsdl}">${corpo}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
  return new Promise((ok, falha) => {
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST', key: cert.keyPem, cert: cert.certPem,
      // a cadeia da SEFAZ é ICP-Brasil (fora das CAs do Node); o sped-nfe também não valida o servidor
      rejectUnauthorized: false, timeout,
      headers: { 'Content-Type': `application/soap+xml;charset=utf-8;action="http://www.portalfiscal.inf.br/nfe/wsdl/${wsdl}/${metodo}"`, 'Content-Length': Buffer.byteLength(env) },
    }, (res) => { let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => (res.statusCode >= 500 && !/cStat/.test(b) ? falha(new Error(`SEFAZ HTTP ${res.statusCode}`)) : ok(b))); });
    req.on('timeout', () => req.destroy(new Error('SEFAZ não respondeu a tempo')));
    req.on('error', falha);
    req.end(env);
  });
}
const pega = (xml, t) => { const m = String(xml).match(new RegExp(`<(?:\\w+:)?${t}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${t}>`)); return m ? m[1] : null; };
const bloco = (xml, t) => { const m = String(xml).match(new RegExp(`<(?:\\w+:)?${t}[ >][\\s\\S]*?</(?:\\w+:)?${t}>`)); return m ? m[0] : null; };

async function status(uf, amb, cert) {
  const r = await soap('status', uf, amb, `<consStatServ xmlns="${NS}" versao="4.00"><tpAmb>${amb}</tpAmb><cUF>${UF_COD[uf]}</cUF><xServ>STATUS</xServ></consStatServ>`, cert, { timeout: 15000 });
  return { cStat: pega(r, 'cStat'), motivo: pega(r, 'xMotivo') };
}

// prepara (monta + assina) sem mandar — dá para guardar o XML antes de enviar
function preparar(nota, emit, cert) {
  const m = montarXml(nota, emit);
  return { ...m, assinado: assinar(m.xml, 'infNFe', m.id, cert) };
}
const fecharProc = (assinado, prot) => `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NS}" versao="4.00">${assinado}${prot.replace(/^<(\w+:)?protNFe[^>]*>/, '<protNFe versao="4.00">').replace(/<\/\w+:protNFe>$/, '</protNFe>')}</nfeProc>`;

// manda (síncrono): devolve { autorizada, cStat, motivo, protocolo, xml (nfeProc se autorizada), duplicada }
async function enviar(p, { ambiente, uf = 'AM' }, cert) {
  const amb = Number(ambiente) === 1 ? 1 : 2;
  const lote = `<enviNFe xmlns="${NS}" versao="4.00"><idLote>${Date.now().toString().slice(-15)}</idLote><indSinc>1</indSinc>${p.assinado}</enviNFe>`;
  const r = await soap('autorizacao', uf, amb, lote, cert);
  const prot = bloco(r, 'protNFe');
  const cStat = prot ? pega(prot, 'cStat') : pega(r, 'cStat');
  const motivo = prot ? pega(prot, 'xMotivo') : pega(r, 'xMotivo');
  const autorizada = ['100', '150'].includes(String(cStat));
  return {
    autorizada, cStat, motivo, chave: p.chave, vNF: p.vNF, protocolo: prot ? pega(prot, 'nProt') : null, recebida: prot ? pega(prot, 'dhRecbto') : null,
    assinado: p.assinado, xml: autorizada ? fecharProc(p.assinado, prot) : null,
    // 204/539 = já existe na SEFAZ com esse número (ex.: resposta perdida antes): consultar pela chave
    duplicada: ['204', '539'].includes(String(cStat)),
  };
}
async function emitir(nota, emit, cert) {
  return enviar(preparar(nota, emit, cert), { ambiente: nota.ambiente, uf: String(emit.uf || 'AM').toUpperCase() }, cert);
}

async function consultar(chave, uf, amb, cert) {
  const r = await soap('consulta', uf, amb, `<consSitNFe xmlns="${NS}" versao="4.00"><tpAmb>${amb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chave}</chNFe></consSitNFe>`, cert);
  const prot = bloco(r, 'protNFe');
  return { cStat: pega(r, 'cStat'), motivo: pega(r, 'xMotivo'), protNFe: prot, protocolo: prot ? pega(prot, 'nProt') : null };
}

// cancelamento (até 24 h depois da autorização, justificativa de 15 a 255 letras)
async function cancelar({ chave, protocolo, justificativa, ambiente, cnpj, uf = 'AM' }, cert) {
  const amb = Number(ambiente) === 1 ? 1 : 2;
  const just = String(justificativa || '').replace(/\s+/g, ' ').trim();
  if (just.length < 15) throw new Error('a justificativa precisa de pelo menos 15 letras');
  const id = `ID110111${chave}01`;
  const inf = `<infEvento Id="${id}"><cOrgao>${UF_COD[uf]}</cOrgao><tpAmb>${amb}</tpAmb><CNPJ>${dig(cnpj)}</CNPJ><chNFe>${chave}</chNFe><dhEvento>${dhLocal(new Date())}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${protocolo}</nProt><xJust>${txt(just, 255)}</xJust></detEvento></infEvento>`;
  const evento = assinar(`<evento xmlns="${NS}" versao="1.00">${inf}</evento>`, 'infEvento', id, cert);
  const r = await soap('evento', uf, amb, `<envEvento xmlns="${NS}" versao="1.00"><idLote>${Date.now().toString().slice(-15)}</idLote>${evento}</envEvento>`, cert);
  const ret = bloco(r, 'retEvento');
  const cStat = ret ? pega(ret, 'cStat') : pega(r, 'cStat');
  return { cancelada: ['135', '155'].includes(String(cStat)), cStat, motivo: ret ? pega(ret, 'xMotivo') : pega(r, 'xMotivo'), protocolo: ret ? pega(ret, 'nProt') : null, xml: ret ? `<procEventoNFe xmlns="${NS}" versao="1.00">${evento}${ret}</procEventoNFe>` : null };
}

module.exports = { preparar, enviar, fecharProc, lerCertificado, montarXml, montarChave, dvChave, assinar, emitir, consultar, cancelar, status, conferir, cpfValido, cnpjValido, dhLocal, UF_COD };
```

### 2.5 Regras de negócio — `lib/fiscal.js` (venda → nota, numeração, emitir, consultar, cancelar)

> `GV.cliente()` é um pequeno cliente REST do Supabase do ERP (lê `vendas`, `clientes_loja`, `estoque`). Troque pelos nomes das suas tabelas.

```js
// 🧾 TFX Fiscal no Ads TFX: venda do Gestão → NF-e autorizada na SEFAZ, sem Bling.
// Fluxo: escolhe a venda → a tela já vem com cliente (cadastro do Gestão + CEP) e itens (NCM/nome fiscal do estoque)
// → confere → reserva o número → assina e manda → guarda o XML. Rejeitou: o número volta e dá para corrigir e reenviar.
const NFE = require('./nfe');
const GV = require('./gestaoVenda');
const { env } = require('./env');

const num = (v) => Number(v) || 0;
const r2 = (v) => Math.round(num(v) * 100) / 100;
const dig = (v) => String(v ?? '').replace(/\D/g, '');
const UUID = /^[0-9a-f-]{36}$/i;

let certCache = null;
function certificado() {
  if (certCache) return certCache;
  const b64 = env('NFE_CERT_B64', ''), senha = env('NFE_CERT_SENHA', '');
  if (!b64 || !senha) return null;
  certCache = NFE.lerCertificado(b64, senha);
  return certCache;
}
function infoCert() {
  try {
    const c = certificado();
    if (!c) return { ok: false, erro: 'certificado não configurado (NFE_CERT_B64 e NFE_CERT_SENHA no Vercel)' };
    const dias = Math.floor((c.validade - Date.now()) / 864e5);
    return { ok: dias > 0, cnpj: c.cnpj, nome: c.nome, validade: c.validade.toISOString().slice(0, 10), dias, erro: dias > 0 ? null : 'certificado vencido' };
  } catch (e) { return { ok: false, erro: `não consegui abrir o certificado: ${e.message}` }; }
}

async function config(db, tenantId) {
  const [c] = await db.select('nfe_config', `select=*&tenant_id=eq.${tenantId}&limit=1`);
  return c || { tenant_id: tenantId, ambiente: 2, serie: 2, proximo_producao: 1, proximo_homolog: 20, emitente: {}, natop: 'Venda de mercadoria a não contribuinte', ibpt_fed: 19.89, ibpt_est: 20, info: '' };
}
async function salvarConfig(db, tenantId, b) {
  const atual = await config(db, tenantId);
  const e = { ...(atual.emitente || {}), ...(b.emitente || {}) };
  const limpo = {};
  for (const k of ['cnpj', 'ie', 'razao', 'fantasia', 'logradouro', 'numero', 'bairro', 'cep', 'cod_municipio', 'municipio', 'uf', 'fone', 'crt']) if (e[k] !== undefined) limpo[k] = String(e[k]).trim().slice(0, 120);
  if (e.resp) limpo.resp = { contato: String(e.resp.contato || '').slice(0, 60), email: String(e.resp.email || '').slice(0, 60), fone: dig(e.resp.fone).slice(0, 14) };
  const row = {
    tenant_id: tenantId, emitente: limpo,
    ambiente: [1, 2].includes(Number(b.ambiente)) ? Number(b.ambiente) : atual.ambiente,
    serie: Math.max(1, Math.min(889, parseInt(b.serie ?? atual.serie, 10) || 2)),
    natop: String(b.natop ?? atual.natop).trim().slice(0, 60) || atual.natop,
    ibpt_fed: Math.max(0, Math.min(100, num(b.ibpt_fed ?? atual.ibpt_fed))), ibpt_est: Math.max(0, Math.min(100, num(b.ibpt_est ?? atual.ibpt_est))),
    info: String(b.info ?? atual.info ?? '').slice(0, 1000), atualizado_em: new Date().toISOString(),
  };
  // número inicial só muda se pedir (e nunca para trás de uma nota já emitida)
  for (const [k, amb] of [['proximo_producao', 1], ['proximo_homolog', 2]]) {
    if (b[k] === undefined) continue;
    const pedido = parseInt(b[k], 10);
    if (!(pedido > 0)) continue;
    const [ult] = await db.select('nfe_notas', `select=numero&tenant_id=eq.${tenantId}&ambiente=eq.${amb}&serie=eq.${row.serie}&status=in.(emitindo,autorizada,cancelada)&order=numero.desc&limit=1`).catch(() => []);
    if (ult && pedido <= ult.numero) return { erro: `o próximo número precisa ser maior que ${ult.numero} (última nota emitida)` };
    row[k] = pedido;
  }
  await db.upsert('nfe_config', [row], 'tenant_id');
  return { ok: true };
}

// ── CEP → endereço e código IBGE do município ──
async function cep(c, f = fetch) {
  const d = dig(c);
  if (d.length !== 8) return { erro: 'CEP precisa de 8 números' };
  try {
    const r = await f(`https://viacep.com.br/ws/${d}/json/`); const j = await r.json();
    if (j.erro) return { erro: 'CEP não encontrado' };
    return { cep: d, endereco: j.logradouro || '', bairro: j.bairro || '', municipio: j.localidade || '', uf: j.uf || '', cod_municipio: j.ibge || '' };
  } catch (e) { return { erro: `não consegui consultar o CEP: ${e.message}` }; }
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
async function cepPelaRua(uf, cidade, rua, bairro, f = fetch) {
  const r = String(rua || '').replace(/,.*$/, '').replace(/\b(rua|r\.|av\.?|avenida|travessa|tv\.?|beco|alameda)\b/gi, '').trim();
  if (r.length < 3) return null;
  const b = semAcento(bairro);
  const palavras = r.split(/\s+/).filter((w) => w.length > 2);
  const tentativas = [r, palavras.slice(0, 2).join(' '), [...palavras].sort((a, b) => b.length - a.length)[0] || ''].filter((x, i, a) => x.length >= 3 && a.indexOf(x) === i);
  for (const termo of tentativas) {
    try {
      let lista = await (await f(`https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(termo)}/json/`)).json();
      if (!Array.isArray(lista) || !lista.length) continue;
      // a rua tem que bater: todas as palavras importantes do endereço aparecem no nome da rua do CEP
      const chave = palavras.map(semAcento);
      lista = lista.filter((x) => chave.every((w) => semAcento(x.logradouro).includes(w)));
      if (!lista.length) continue;
      const certo = lista.find((x) => b && semAcento(x.bairro) === b) || lista.find((x) => b && (semAcento(x.bairro).includes(b) || b.includes(semAcento(x.bairro)))) || (lista.length === 1 ? lista[0] : null);
      if (certo) return { cep: dig(certo.cep), cod_municipio: certo.ibge, endereco: certo.logradouro, bairro: certo.bairro };
    } catch { /* tenta o próximo */ }
  }
  return null;
}

// ── painel: notas + vendas recentes do Gestão ──
async function painel(db, tenantId, gestaoTenant) {
  const [cfg, notas] = await Promise.all([
    config(db, tenantId),
    db.select('nfe_notas', `select=id,venda_id,ambiente,serie,numero,chave,status,cstat,motivo,protocolo,cliente,valor,criado_em,autorizada_em,cancelada_em&tenant_id=eq.${tenantId}&order=criado_em.desc&limit=150`),
  ]);
  let vendas = [];
  if (gestaoTenant) {
    const g = GV.cliente();
    const desde = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
    vendas = (await g.get(`vendas?select=id,data,cliente,cliente_id,descricao,valor,qtd,itens&tenant_id=eq.${encodeURIComponent(gestaoTenant)}&data=gte.${desde}&order=data.desc&limit=200`).catch(() => []))
      .map((v) => ({ id: v.id, data: v.data, cliente: v.cliente, descricao: v.descricao, total: r2(num(v.valor) * (num(v.qtd) || 1)) }));
  }
  return { config: cfg, cert: infoCert(), notas, vendas, gestao: !!gestaoTenant };
}

// produto do estoque do Gestão → item da nota (nome fiscal, NCM e o resto)
function itemDoEstoque(p, nomeLoja) {
  return {
    produto_id: p.id || null, codigo: String(p.sku || String(p.id || '').replace(/-/g, '').slice(0, 8)).toUpperCase().slice(0, 30),
    nome: p.descricao_fiscal || p.nome || p.produto || nomeLoja || '', nome_loja: nomeLoja || p.nome || p.produto || '',
    ncm: dig(p.ncm), cest: dig(p.cest), unidade: p.unidade || 'UN', orig: num(p.origem), csosn: p.csosn || '102',
  };
}
// estoque para escolher/adicionar item na nota
async function produtos(gestaoTenant, f = fetch) {
  const g = GV.cliente(f);
  const lista = await g.get(`estoque?select=*&tenant_id=eq.${encodeURIComponent(gestaoTenant)}&limit=1000`).catch(() => []);
  return lista.map((p) => ({ ...itemDoEstoque(p), valor: r2(p.preco_venda), qtd_estoque: num(p.qtd) }))
    .filter((p) => p.nome).sort((a, b) => a.nome_loja.localeCompare(b.nome_loja, 'pt-BR'));
}

// ── monta o formulário a partir da venda (cliente do cadastro + itens com dados fiscais do estoque) ──
async function rascunho(gestaoTenant, vendaId, f = fetch) {
  const g = GV.cliente(f);
  const t = encodeURIComponent(gestaoTenant);
  const [v] = await g.get(`vendas?select=*&tenant_id=eq.${t}&id=eq.${encodeURIComponent(String(vendaId))}`);
  if (!v) return { erro: 'venda não encontrada no Gestão' };
  let cli = null;
  if (v.cliente_id) [cli] = await g.get(`clientes_loja?select=*&tenant_id=eq.${t}&id=eq.${encodeURIComponent(String(v.cliente_id))}`).catch(() => []);
  let itens = Array.isArray(v.itens) ? v.itens : (() => { try { return JSON.parse(v.itens || '[]'); } catch { return []; } })();
  itens = itens.filter((i) => num(i.valor) > 0 && num(i.qtd) > 0);
  if (!itens.length) itens = [{ produto: String(v.descricao || v.produto || '').split('+')[0].trim(), qtd: num(v.qtd) || 1, valor: num(v.valor) }];
  const ids = itens.map((i) => i.produto_id).filter(Boolean);
  const est = ids.length ? await g.get(`estoque?select=*&tenant_id=eq.${t}&id=in.(${ids.map((x) => encodeURIComponent(String(x))).join(',')})`).catch(() => []) : [];
  const porId = new Map(est.map((p) => [String(p.id), p]));
  const nomes = itens.filter((i) => !porId.has(String(i.produto_id))).map((i) => i.produto);
  const porNome = new Map();
  if (nomes.length) (await g.get(`estoque?select=*&tenant_id=eq.${t}&limit=1000`).catch(() => [])).forEach((p) => porNome.set(String(p.nome || p.produto || '').toLowerCase(), p));
  const linhas = itens.map((i) => {
    const p = porId.get(String(i.produto_id)) || porNome.get(String(i.produto || '').toLowerCase()) || {};
    return { ...itemDoEstoque(p, i.produto), qtd: num(i.qtd) || 1, valor: r2(i.valor) };
  });
  const bruto = r2(linhas.reduce((a, i) => a + i.qtd * i.valor, 0));
  const cobrado = r2(num(v.valor) * (num(v.qtd) || 1));
  const desconto = cobrado > 0 && cobrado < bruto ? r2(bruto - cobrado) : 0;
  const dest = {
    doc: dig(cli?.cpf_cnpj), nome: cli?.nome || v.cliente || '', email: cli?.email || '', fone: dig(cli?.telefone),
    cep: dig(cli?.cep), endereco: cli?.endereco || '', numero: cli?.numero || '', complemento: cli?.complemento || '', bairro: cli?.bairro || '',
    municipio: cli?.cidade || 'SUA_CIDADE', uf: (cli?.estado || 'AM').toUpperCase().slice(0, 2), cod_municipio: '',
  };
  if (dest.cep.length === 8) {
    const c = await cep(dest.cep, f);
    if (!c.erro) { dest.cod_municipio = c.cod_municipio; dest.municipio = c.municipio; dest.uf = c.uf; if (!dest.endereco) dest.endereco = c.endereco; if (!dest.bairro) dest.bairro = c.bairro; }
  } else {
    if (/SUA_CIDADE/i.test(dest.municipio)) dest.cod_municipio = '0000000'; // código IBGE da sua cidade
    // sem CEP no cadastro: procura pela rua (ViaCEP) e fica com o do mesmo bairro
    const achado = await cepPelaRua(dest.uf || 'AM', dest.municipio || 'SUA_CIDADE', dest.endereco, dest.bairro, f);
    if (achado) { dest.cep = achado.cep; dest.cod_municipio = achado.cod_municipio || dest.cod_municipio; dest.cep_auto = true; }
  }
  return { venda: { id: v.id, data: v.data, descricao: v.descricao, total: cobrado }, dest, itens: linhas, desconto, cliente_id: cli?.id || null };
}

// guarda no cadastro do Gestão o que foi digitado na nota (CPF, e-mail, endereço) — na próxima já vem pronto
async function completarCliente(gestaoTenant, clienteId, d, f = fetch) {
  if (!clienteId) return;
  const g = GV.cliente(f);
  const t = encodeURIComponent(gestaoTenant);
  const [c] = await g.get(`clientes_loja?select=id,cpf_cnpj,email,cep,endereco,numero,bairro,cidade,estado&tenant_id=eq.${t}&id=eq.${encodeURIComponent(String(clienteId))}`).catch(() => []);
  if (!c) return;
  const novo = { cpf_cnpj: dig(d.doc), email: d.email, cep: dig(d.cep), endereco: d.endereco, numero: d.numero, bairro: d.bairro, cidade: d.municipio, estado: d.uf };
  const patch = {};
  Object.keys(novo).forEach((k) => { if (novo[k] && !c[k]) patch[k] = novo[k]; });
  if (Object.keys(patch).length) await g.patch('clientes_loja', `id=eq.${c.id}&tenant_id=eq.${t}`, patch).catch(() => {});
}

function limparPedido(b) {
  const d = b.dest || {};
  return {
    dest: { doc: dig(d.doc), nome: String(d.nome || '').trim(), email: String(d.email || '').trim(), fone: dig(d.fone), cep: dig(d.cep), endereco: String(d.endereco || '').trim(), numero: String(d.numero || '').trim() || 'S/N', complemento: String(d.complemento || '').trim(), bairro: String(d.bairro || '').trim(), municipio: String(d.municipio || '').trim(), uf: String(d.uf || '').trim().toUpperCase(), cod_municipio: dig(d.cod_municipio) },
    itens: (Array.isArray(b.itens) ? b.itens : []).slice(0, 50).map((i) => ({ codigo: String(i.codigo || '').trim().slice(0, 60), nome: String(i.nome || '').trim(), ncm: dig(i.ncm), cest: dig(i.cest), unidade: String(i.unidade || 'UN').trim().slice(0, 6) || 'UN', orig: num(i.orig), csosn: ['102', '103', '300', '400'].includes(String(i.csosn)) ? String(i.csosn) : '102', qtd: num(i.qtd), valor: r2(i.valor) })).filter((i) => i.qtd > 0 && i.valor > 0),
    desconto: Math.max(0, r2(b.desconto)),
    tPag: ['01', '03', '04', '17', '99'].includes(String(b.tPag)) ? String(b.tPag) : '17',
    info: String(b.info || '').trim().slice(0, 500),
  };
}

// ── emitir ──
async function emitir(db, tenantId, gestaoTenant, b) {
  const cert = certificado();
  if (!cert) return { erro: 'falta o certificado digital no servidor (NFE_CERT_B64 e NFE_CERT_SENHA)' };
  const cfg = await config(db, tenantId);
  const emit = cfg.emitente || {};
  if (!emit.cnpj || !emit.ie || !emit.cod_municipio) return { erro: 'preencha os dados da empresa (CNPJ, IE, endereço) em Configurar' };
  if (dig(emit.cnpj) !== cert.cnpj) return { erro: 'o CNPJ da empresa não é o mesmo do certificado' };
  const ambiente = Number(cfg.ambiente) === 1 ? 1 : 2;
  const p = limparPedido(b);
  const problemas = NFE.conferir({ dest: p.dest, itens: p.itens });
  if (problemas.length) return { erro: `confira: ${problemas.join(', ')}` };
  const bruto = r2(p.itens.reduce((a, i) => a + i.qtd * i.valor, 0));
  if (p.desconto >= bruto) return { erro: 'o desconto não pode ser maior que o total' };
  const vendaId = b.venda_id ? String(b.venda_id).slice(0, 60) : null;
  if (vendaId) {
    const [ja] = await db.select('nfe_notas', `select=id,numero,status&tenant_id=eq.${tenantId}&ambiente=eq.${ambiente}&venda_id=eq.${encodeURIComponent(vendaId)}&status=in.(emitindo,autorizada,erro)&limit=1`);
    if (ja) return { erro: ja.status === 'autorizada' ? `essa venda já tem a nota nº ${ja.numero}` : `a nota nº ${ja.numero} dessa venda ficou sem resposta: clique em Consultar nela antes` };
  }

  const numero = await db.rpc('nfe_reservar', { p_tenant: tenantId, p_ambiente: ambiente });
  const data = new Date();
  const cNF = String(require('crypto').randomInt(10000000, 99999999));
  const nota = { ambiente, serie: cfg.serie, numero, data, cNF, natOp: cfg.natop, dest: p.dest, itens: p.itens, desconto: p.desconto, pagamento: { tPag: p.tPag }, info: [cfg.info, p.info].filter(Boolean).join(' '), ibpt: { fed: cfg.ibpt_fed, est: cfg.ibpt_est }, ibscbs: ambiente === 2 };
  const uf = String(emit.uf || 'AM').toUpperCase();
  let pre;
  try { pre = NFE.preparar(nota, emit, cert); } catch (e) {
    await db.rpc('nfe_devolver', { p_tenant: tenantId, p_ambiente: ambiente, p_numero: numero }).catch(() => {});
    return { erro: `não consegui montar a nota: ${e.message}` };
  }
  let linha;
  try {
    // o XML assinado fica guardado ANTES de mandar: se a resposta se perder, o Consultar fecha a nota com ele
    linha = await db.insert('nfe_notas', { tenant_id: tenantId, venda_id: vendaId, ambiente, serie: cfg.serie, numero, chave: pre.chave, status: 'emitindo', cliente: p.dest.nome.slice(0, 120), valor: pre.vNF, dados: { ...p, venda_id: vendaId, cliente_id: b.cliente_id || null }, xml: pre.assinado });
    linha = Array.isArray(linha) ? linha[0] : linha;
  } catch (e) {
    await db.rpc('nfe_devolver', { p_tenant: tenantId, p_ambiente: ambiente, p_numero: numero }).catch(() => {});
    return { erro: `não consegui registrar a nota: ${e.message}` };
  }
  const salvar = (patch) => db.patch('nfe_notas', `id=eq.${linha.id}&tenant_id=eq.${tenantId}`, patch);

  let r;
  try {
    r = await NFE.enviar(pre, { ambiente, uf }, cert);
    // produção sem o grupo IBS/CBS (igual ao Bling); se a SEFAZ passar a exigir, manda de novo com ele (mesma chave)
    if (!r.autorizada && String(r.cStat) === '1115' && !nota.ibscbs) {
      nota.ibscbs = true; pre = NFE.preparar(nota, emit, cert);
      await salvar({ xml: pre.assinado, valor: pre.vNF });
      r = await NFE.enviar(pre, { ambiente, uf }, cert);
    }
  } catch (e) {
    // sem resposta: a nota pode ter entrado. Fica com a chave e o XML; o botão Consultar resolve
    await salvar({ status: 'erro', motivo: `sem resposta da SEFAZ: ${e.message}`.slice(0, 300) }).catch(() => {});
    return { erro: `a SEFAZ não respondeu (${e.message}). Clique em Consultar na nota nº ${numero} antes de tentar de novo.`, id: linha.id };
  }
  if (r.autorizada) {
    await salvar({ status: 'autorizada', cstat: r.cStat, motivo: r.motivo, protocolo: r.protocolo, chave: r.chave, xml: r.xml, autorizada_em: new Date().toISOString() });
    if (gestaoTenant && b.cliente_id) await completarCliente(gestaoTenant, b.cliente_id, p.dest).catch(() => {});
    return { ok: true, id: linha.id, numero, chave: r.chave, protocolo: r.protocolo, ambiente };
  }
  if (r.duplicada) {
    await salvar({ status: 'erro', cstat: r.cStat, motivo: r.motivo }).catch(() => {});
    return { erro: `SEFAZ: ${r.motivo}. Clique em Consultar na nota nº ${numero}.`, id: linha.id };
  }
  // rejeitada: não existe na SEFAZ → o número volta para a próxima
  await salvar({ status: 'rejeitada', cstat: r.cStat, motivo: r.motivo, xml: r.assinado });
  await db.rpc('nfe_devolver', { p_tenant: tenantId, p_ambiente: ambiente, p_numero: numero }).catch(() => {});
  return { erro: `SEFAZ recusou (${r.cStat}): ${r.motivo}`, rejeitada: true, cstat: r.cStat };
}

async function pegarNota(db, tenantId, id) {
  if (!UUID.test(String(id || ''))) return null;
  const [n] = await db.select('nfe_notas', `select=*&tenant_id=eq.${tenantId}&id=eq.${id}&limit=1`);
  return n || null;
}

// consulta na SEFAZ uma nota que ficou sem resposta (e fecha o XML se ela tiver sido autorizada)
async function consultar(db, tenantId, id) {
  const n = await pegarNota(db, tenantId, id);
  if (!n) return { erro: 'nota não encontrada' };
  const cert = certificado(); if (!cert) return { erro: 'certificado não configurado' };
  const r = await NFE.consultar(n.chave, 'AM', n.ambiente, cert);
  const salvar = (patch) => db.patch('nfe_notas', `id=eq.${n.id}&tenant_id=eq.${tenantId}`, patch);
  if (['100', '150'].includes(String(r.cStat)) && r.protNFe) {
    const xml = n.xml && !n.xml.includes('<nfeProc') ? NFE.fecharProc(n.xml, r.protNFe) : n.xml;
    await salvar({ status: 'autorizada', cstat: '100', motivo: 'Autorizado o uso da NF-e', protocolo: r.protocolo, xml, autorizada_em: n.autorizada_em || new Date().toISOString() });
    return { ok: true, status: 'autorizada' };
  }
  if (['101', '151', '155'].includes(String(r.cStat))) { await salvar({ status: 'cancelada', cstat: r.cStat, motivo: r.motivo }); return { ok: true, status: 'cancelada' }; }
  if (String(r.cStat) === '217') {
    // não existe na SEFAZ: libera o número
    await salvar({ status: 'rejeitada', cstat: r.cStat, motivo: 'não chegou na SEFAZ' });
    await db.rpc('nfe_devolver', { p_tenant: tenantId, p_ambiente: n.ambiente, p_numero: n.numero }).catch(() => {});
    return { ok: true, status: 'rejeitada', motivo: 'a nota não chegou na SEFAZ; pode emitir de novo' };
  }
  return { ok: true, status: n.status, cstat: r.cStat, motivo: r.motivo };
}

async function cancelar(db, tenantId, id, justificativa) {
  const n = await pegarNota(db, tenantId, id);
  if (!n) return { erro: 'nota não encontrada' };
  if (n.status !== 'autorizada') return { erro: 'só nota autorizada pode ser cancelada' };
  const cert = certificado(); if (!cert) return { erro: 'certificado não configurado' };
  const cfg = await config(db, tenantId);
  const r = await NFE.cancelar({ chave: n.chave, protocolo: n.protocolo, justificativa, ambiente: n.ambiente, cnpj: cfg.emitente?.cnpj || cert.cnpj }, cert);
  if (!r.cancelada) return { erro: `SEFAZ não cancelou (${r.cStat}): ${r.motivo}` };
  await db.patch('nfe_notas', `id=eq.${n.id}&tenant_id=eq.${tenantId}`, { status: 'cancelada', cstat: r.cStat, motivo: r.motivo, xml_cancelamento: r.xml, cancelada_em: new Date().toISOString() });
  return { ok: true };
}

async function xml(db, tenantId, id, tipo) {
  const n = await pegarNota(db, tenantId, id);
  if (!n) return { erro: 'nota não encontrada' };
  return { numero: n.numero, serie: n.serie, chave: n.chave, ambiente: n.ambiente, status: n.status, protocolo: n.protocolo, xml: tipo === 'cancelamento' ? n.xml_cancelamento : n.xml };
}

// XMLs de um mês (produção) para o contador: autorizadas e canceladas (com o evento de cancelamento)
async function xmlsDoMes(db, tenantId, mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) return { erro: 'mês inválido' };
  const [a, m] = mes.split('-').map(Number);
  const ini = new Date(Date.UTC(a, m - 1, 1, 4)).toISOString(), fim = new Date(Date.UTC(a, m, 1, 4)).toISOString();
  const notas = await db.select('nfe_notas', `select=numero,serie,chave,status,valor,cliente,xml,xml_cancelamento,autorizada_em&tenant_id=eq.${tenantId}&ambiente=eq.1&status=in.(autorizada,cancelada)&autorizada_em=gte.${ini}&autorizada_em=lt.${fim}&order=numero.asc&limit=2000`);
  return { mes, notas };
}

async function statusSefaz() {
  const cert = certificado(); if (!cert) return { erro: 'certificado não configurado' };
  const [p, h] = await Promise.all([NFE.status('AM', 1, cert).catch((e) => ({ erro: e.message })), NFE.status('AM', 2, cert).catch((e) => ({ erro: e.message }))]);
  return { producao: p, homologacao: h };
}

module.exports = { xmlsDoMes, produtos, cepPelaRua, painel, rascunho, emitir, consultar, cancelar, xml, cep, salvarConfig, statusSefaz, infoCert, limparPedido };
```

### 2.6 O JSON que a tela manda para emitir

```json
{
  "op": "emitir",
  "venda_id": "ID_DA_VENDA_NO_ERP",
  "cliente_id": "ID_DO_CLIENTE_NO_ERP",
  "dest": {
    "doc": "00000000000",
    "nome": "NOME DO CLIENTE",
    "email": "cliente@exemplo.com",
    "fone": "00000000000",
    "cep": "00000000",
    "endereco": "Rua Exemplo",
    "numero": "123",
    "complemento": "",
    "bairro": "Centro",
    "municipio": "SUA_CIDADE",
    "uf": "AM",
    "cod_municipio": "0000000"
  },
  "itens": [
    { "codigo": "ABC123", "nome": "RELOGIO SMARTWATCH", "ncm": "00000000", "cest": "", "unidade": "UN", "orig": 0, "csosn": "102", "qtd": 1, "valor": 399.00 },
    { "codigo": "PUL01", "nome": "PULSEIRA", "ncm": "00000000", "unidade": "UN", "orig": 0, "csosn": "102", "qtd": 2, "valor": 25.00 }
  ],
  "desconto": 49.00,
  "tPag": "17",
  "info": "Garantia de 1 ano."
}
```

Diferenças em relação ao pedido original:
- **Frete:** o núcleo (`montarXml`) aceita `frete` e rateia entre os itens (`modFrete` 0 quando há frete, 9 quando não há), mas a tela não manda frete, porque a loja não cobra frete na nota. Para usar, inclua `frete` em `limparPedido`.
- **Pagamentos múltiplos e troco:** não implementado. Sai um `detPag` com o valor total da nota. Para vários pagamentos, monte vários `detPag`; o **troco** vai em `<vTroco>` dentro de `<pag>`, e a soma dos `vPag` menos o troco tem que dar o `vNF`.

Respostas da rota:

```jsonc
// autorizada
{ "ok": true, "id": "uuid", "numero": 12, "chave": "13...44 dígitos", "protocolo": "000000000000000", "ambiente": 1 }
// rejeitada (o número volta)
{ "erro": "SEFAZ recusou (225): Rejeição: Falha no Schema XML", "rejeitada": true, "cstat": "225" }
// pendente (sem resposta ou duplicidade): a nota fica com status 'erro' e a tela mostra o botão Consultar
{ "erro": "a SEFAZ não respondeu (...). Clique em Consultar na nota nº 12 antes de tentar de novo.", "id": "uuid" }
// erro antes de enviar (validação)
{ "erro": "confira: CEP do cliente, NCM do item 2 (PULSEIRA)" }
```

### 2.7 DANFE no navegador — `src/lib/danfe.js`

Gerado a partir do `nfeProc`, em retrato A4:
- **Canhoto** com recebimento, número e série.
- **Cabeçalho** com dados do emitente, quadro DANFE (entrada/saída, número, série) e **código de barras Code 128C da chave**, feito à mão, sem biblioteca.
- **Protocolo** de autorização.
- **Destinatário, cálculo do imposto, transporte, produtos e dados adicionais** (tributos aproximados e frase do Simples).
- **Tarja** "SEM VALOR FISCAL" em homologação e "CANCELADA" quando for o caso.
- **Logo:** sem logo (texto em vez de imagem, para não depender de arquivo).

```js
// 🧾 DANFE (retrato, A4) gerado no navegador a partir do XML autorizado (nfeProc). Sem servidor, sem Bling.
// Traz o que a lei pede: emitente, chave com código de barras (Code 128C), protocolo, destinatário, impostos,
// produtos e dados adicionais. Homologação sai com a tarja "SEM VALOR FISCAL".
const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');

// Code 128 conjunto C (só números, em pares)
export function code128c(numeros) {
  const pares = String(numeros).match(/\d\d/g) || [];
  const cod = [105, ...pares.map(Number)];
  const soma = cod.reduce((a, v, i) => a + v * (i || 1), 0);
  cod.push(soma % 103, 106);
  return cod.map((v) => C128[v]).join('');
}

const fmt = (v, c = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const chaveFmt = (c) => String(c || '').replace(/(\d{4})(?=\d)/g, '$1 ');
const docFmt = (d) => { d = String(d || ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d; };
const dataFmt = (s) => { if (!s) return ''; const [d, h] = String(s).split('T'); return `${d.split('-').reverse().join('/')} ${String(h || '').slice(0, 8)}`; };

export function lerNota(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const q = (sel, base = doc) => base.getElementsByTagName(sel)[0];
  const t = (sel, base) => q(sel, base)?.textContent || '';
  const inf = q('infNFe');
  const emit = q('emit'), dest = q('dest'), tot = q('ICMSTot'), prot = q('infProt');
  const ender = (b, n) => q(n, b);
  return {
    chave: (inf?.getAttribute('Id') || '').replace('NFe', ''),
    numero: t('nNF'), serie: t('serie'), dhEmi: t('dhEmi'), natOp: t('natOp'), tpAmb: t('tpAmb'),
    protocolo: t('nProt', prot), dhRecbto: t('dhRecbto', prot),
    emit: { nome: t('xNome', emit), fantasia: t('xFant', emit), doc: t('CNPJ', emit), ie: t('IE', emit), lgr: t('xLgr', ender(emit, 'enderEmit')), nro: t('nro', ender(emit, 'enderEmit')), bairro: t('xBairro', ender(emit, 'enderEmit')), mun: t('xMun', ender(emit, 'enderEmit')), uf: t('UF', ender(emit, 'enderEmit')), cep: t('CEP', ender(emit, 'enderEmit')), fone: t('fone', ender(emit, 'enderEmit')) },
    dest: { nome: t('xNome', dest), doc: t('CNPJ', dest) || t('CPF', dest), lgr: t('xLgr', dest), nro: t('nro', dest), bairro: t('xBairro', dest), mun: t('xMun', dest), uf: t('UF', dest), cep: t('CEP', dest), fone: t('fone', dest), email: t('email', dest) },
    tot: { vBC: t('vBC', tot), vICMS: t('vICMS', tot), vProd: t('vProd', tot), vFrete: t('vFrete', tot), vSeg: t('vSeg', tot), vDesc: t('vDesc', tot), vOutro: t('vOutro', tot), vIPI: t('vIPI', tot), vNF: t('vNF', tot), vTotTrib: t('vTotTrib', tot) },
    modFrete: t('modFrete'),
    itens: [...doc.getElementsByTagName('det')].map((d) => ({ cod: t('cProd', d), desc: t('xProd', d), ncm: t('NCM', d), cst: t('CSOSN', d), orig: t('orig', d), cfop: t('CFOP', d), un: t('uCom', d), qtd: t('qCom', d), vun: t('vUnCom', d), vprod: t('vProd', d), vdesc: t('vDesc', d) })),
    infCpl: t('infCpl'),
  };
}

export async function gerarDanfe(xml, { cancelada = false } = {}) {
  const { jsPDF } = await import('jspdf');
  const n = lerNota(xml);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 7, L = W - 2 * M;
  pdf.setLineWidth(0.2);
  const caixa = (x, y, w, h, rot, val, { tam = 8, neg = false, alinhar = 'left' } = {}) => {
    pdf.rect(x, y, w, h);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.text(String(rot).toUpperCase(), x + 1, y + 2.3);
    pdf.setFont('helvetica', neg ? 'bold' : 'normal'); pdf.setFontSize(tam);
    const v = pdf.splitTextToSize(String(val ?? ''), w - 2)[0] || '';
    pdf.text(v, alinhar === 'right' ? x + w - 1 : x + 1, y + h - 1.4, { align: alinhar });
  };
  const titulo = (y, s) => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.text(s, M, y - 0.8); };
  let y = M;

  // canhoto
  pdf.rect(M, y, L - 40, 10); pdf.rect(M + L - 40, y, 40, 10);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6);
  pdf.text(pdf.splitTextToSize(`RECEBEMOS DE ${n.emit.nome} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO. EMISSÃO: ${dataFmt(n.dhEmi).slice(0, 10)}  DEST.: ${n.dest.nome}  VALOR TOTAL: R$ ${fmt(n.tot.vNF)}`, L - 44), M + 1, y + 2.5);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('NF-e', M + L - 20, y + 3.5, { align: 'center' });
  pdf.setFontSize(8); pdf.text(`Nº ${String(n.numero).padStart(9, '0').replace(/(\d{3})(?=\d)/g, '$1.')}`, M + L - 20, y + 6.5, { align: 'center' }); pdf.text(`SÉRIE ${n.serie}`, M + L - 20, y + 9.2, { align: 'center' });
  y += 12; pdf.setLineDashPattern([1, 1], 0); pdf.line(M, y, M + L, y); pdf.setLineDashPattern([], 0); y += 2;

  // cabeçalho
  const hC = 32;
  pdf.rect(M, y, 80, hC); pdf.rect(M + 80, y, 32, hC); pdf.rect(M + 112, y, L - 112, hC);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
  pdf.text(pdf.splitTextToSize(n.emit.nome, 76), M + 40, y + 6, { align: 'center' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
  pdf.text([`${n.emit.lgr}, ${n.emit.nro}`, `${n.emit.bairro} - CEP ${n.emit.cep}`, `${n.emit.mun} - ${n.emit.uf}${n.emit.fone ? `  Fone: ${n.emit.fone}` : ''}`], M + 40, y + 16, { align: 'center' });
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text('DANFE', M + 96, y + 6, { align: 'center' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.text(['Documento Auxiliar da', 'Nota Fiscal Eletrônica'], M + 96, y + 9.5, { align: 'center' });
  pdf.setFontSize(7.5); pdf.text(['0 - ENTRADA', '1 - SAÍDA'], M + 84, y + 17); pdf.rect(M + 103, y + 14.5, 5, 5); pdf.setFont('helvetica', 'bold'); pdf.text('1', M + 105.5, y + 18.3, { align: 'center' });
  pdf.setFontSize(8.5); pdf.text(`Nº ${String(n.numero).padStart(9, '0').replace(/(\d{3})(?=\d)/g, '$1.')}`, M + 96, y + 25, { align: 'center' }); pdf.text(`SÉRIE ${n.serie}  FOLHA 1/1`, M + 96, y + 29, { align: 'center' });
  // código de barras da chave
  const barras = code128c(n.chave);
  const bx = M + 114, bw = L - 116, mod = bw / barras.split('').reduce((a, c) => a + Number(c), 0);
  let x = bx; pdf.setFillColor(0, 0, 0);
  barras.split('').forEach((w, i) => { const larg = Number(w) * mod; if (i % 2 === 0) pdf.rect(x, y + 2, larg, 11, 'F'); x += larg; });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.text('CHAVE DE ACESSO', bx, y + 16);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.8); pdf.text(chaveFmt(n.chave), bx, y + 19.5);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
  pdf.text(pdf.splitTextToSize('Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora', bw), bx, y + 23);
  y += hC;
  caixa(M, y, 112, 8, 'Natureza da operação', n.natOp);
  caixa(M + 112, y, L - 112, 8, 'Protocolo de autorização de uso', n.protocolo ? `${n.protocolo} - ${dataFmt(n.dhRecbto)}` : '');
  y += 8;
  caixa(M, y, 66, 8, 'Inscrição estadual', n.emit.ie); caixa(M + 66, y, 66, 8, 'Insc. estadual do subst. trib.', ''); caixa(M + 132, y, L - 132, 8, 'CNPJ', docFmt(n.emit.doc));
  y += 11;

  // destinatário
  titulo(y, 'DESTINATÁRIO / REMETENTE');
  caixa(M, y, 120, 8, 'Nome / razão social', n.dest.nome); caixa(M + 120, y, 45, 8, 'CNPJ / CPF', docFmt(n.dest.doc)); caixa(M + 165, y, L - 165, 8, 'Data da emissão', dataFmt(n.dhEmi).slice(0, 10));
  y += 8;
  caixa(M, y, 100, 8, 'Endereço', `${n.dest.lgr}, ${n.dest.nro}`); caixa(M + 100, y, 45, 8, 'Bairro / distrito', n.dest.bairro); caixa(M + 145, y, 20, 8, 'CEP', n.dest.cep); caixa(M + 165, y, L - 165, 8, 'Data da saída', dataFmt(n.dhEmi).slice(0, 10));
  y += 8;
  caixa(M, y, 80, 8, 'Município', n.dest.mun); caixa(M + 80, y, 40, 8, 'Fone / fax', n.dest.fone); caixa(M + 120, y, 10, 8, 'UF', n.dest.uf); caixa(M + 130, y, 35, 8, 'Inscrição estadual', ''); caixa(M + 165, y, L - 165, 8, 'Hora da saída', dataFmt(n.dhEmi).slice(11));
  y += 11;

  // impostos
  titulo(y, 'CÁLCULO DO IMPOSTO');
  const w6 = L / 6;
  [['Base de cálc. do ICMS', n.tot.vBC], ['Valor do ICMS', n.tot.vICMS], ['Base cálc. ICMS ST', 0], ['Valor do ICMS ST', 0], ['V. aprox. tributos', n.tot.vTotTrib], ['Valor total dos produtos', n.tot.vProd]].forEach(([r, v], i) => caixa(M + i * w6, y, w6, 8, r, fmt(v), { alinhar: 'right' }));
  y += 8;
  [['Valor do frete', n.tot.vFrete], ['Valor do seguro', n.tot.vSeg], ['Desconto', n.tot.vDesc], ['Outras despesas', n.tot.vOutro], ['Valor do IPI', n.tot.vIPI], ['Valor total da nota', n.tot.vNF]].forEach(([r, v], i) => caixa(M + i * w6, y, w6, 8, r, fmt(v), { alinhar: 'right', neg: i === 5 }));
  y += 11;

  // transporte
  titulo(y, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS');
  caixa(M, y, 90, 8, 'Razão social', ''); caixa(M + 90, y, 50, 8, 'Frete por conta', { 0: '0-Emitente', 1: '1-Destinatário', 9: '9-Sem frete' }[n.modFrete] || n.modFrete); caixa(M + 140, y, L - 140, 8, 'Placa / UF', '');
  y += 11;

  // produtos
  titulo(y, 'DADOS DOS PRODUTOS / SERVIÇOS');
  const cols = [['Código', 16], ['Descrição do produto / serviço', 58], ['NCM/SH', 15], ['CSOSN', 10], ['CFOP', 9], ['UN', 8], ['Qtd.', 12], ['V. unit.', 16], ['V. desc.', 14], ['V. total', 18], ['BC ICMS', 10], ['V. ICMS', 10]];
  const soma = cols.reduce((a, c) => a + c[1], 0);
  const cw = cols.map((c) => (c[1] * L) / soma);
  pdf.rect(M, y, L, 5);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5);
  let cx = M; cols.forEach((c, i) => { pdf.text(c[0].toUpperCase(), cx + 0.8, y + 3.4); if (i) pdf.line(cx, y, cx, y + 5); cx += cw[i]; });
  y += 5;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.8);
  n.itens.forEach((it) => {
    const desc = pdf.splitTextToSize(it.desc, cw[1] - 1.5);
    const h = Math.max(5, desc.length * 3 + 2);
    const vals = [it.cod, desc, it.ncm, `${it.orig}${it.cst}`, it.cfop, it.un, fmt(it.qtd, 4), fmt(it.vun), fmt(it.vdesc), fmt(it.vprod), '0,00', '0,00'];
    cx = M; vals.forEach((v, i) => { const dir = i >= 6; pdf.text(v, dir ? cx + cw[i] - 0.8 : cx + 0.8, y + 3.4, dir ? { align: 'right' } : undefined); cx += cw[i]; });
    pdf.rect(M, y, L, h); cx = M; cw.forEach((w, i) => { if (i) pdf.line(cx, y, cx, y + h); cx += w; });
    y += h;
  });
  y += 3;

  // dados adicionais
  titulo(y + 3, 'DADOS ADICIONAIS');
  y += 3;
  const hA = Math.max(28, 297 - M - y);
  pdf.rect(M, y, L * 0.65, hA); pdf.rect(M + L * 0.65, y, L * 0.35, hA);
  pdf.setFontSize(5.5); pdf.text('INFORMAÇÕES COMPLEMENTARES', M + 1, y + 2.3); pdf.text('RESERVADO AO FISCO', M + L * 0.65 + 1, y + 2.3);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text(pdf.splitTextToSize(n.infCpl, L * 0.65 - 3), M + 1, y + 6);

  // tarjas
  const tarja = (s) => { pdf.setTextColor(200, 0, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(28); pdf.text(s, W / 2, 175, { align: 'center', angle: 30 }); pdf.setTextColor(0, 0, 0); };
  if (n.tpAmb === '2') tarja('SEM VALOR FISCAL - HOMOLOGAÇÃO');
  if (cancelada) tarja('NF-e CANCELADA');
  return { pdf, nota: n };
}
```

### 2.8 Tela no ERP — `src/components/NotasFiscais.jsx`

- **Lista:** vendas dos últimos 45 dias e as notas emitidas.
- **"Emitir NF":** abre o formulário já preenchido (cliente, CEP com busca automática, itens com o nome fiscal e o NCM do estoque, desconto, forma de pagamento).
- **Ações por nota:** **Consultar**, **Cancelar**, **DANFE**, **XML**.
- **XMLs do mês em .zip** para o contador.

```jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { gerarDanfe } from '../lib/danfe';
import { criarZip } from '../lib/zip';

// 🧾 TFX Fiscal: nota fiscal da venda do Gestão em 1 clique (no lugar do Bling).
const PAG = [['17', 'PIX'], ['01', 'Dinheiro'], ['03', 'Cartão de crédito'], ['04', 'Cartão de débito'], ['99', 'Outros']];
const STATUS = { autorizada: '✅ Autorizada', cancelada: '⛔ Cancelada', rejeitada: '❌ Recusada', erro: '⚠️ Sem resposta', emitindo: '⏳ Enviando' };
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
const VAZIO = { dest: { doc: '', nome: '', email: '', fone: '', cep: '', endereco: '', numero: '', complemento: '', bairro: '', municipio: 'Manaus', uf: 'AM', cod_municipio: '1302603' }, itens: [{ codigo: '', nome: '', ncm: '91021110', qtd: 1, valor: 0, unidade: 'UN', csosn: '102', orig: 0 }], desconto: 0, tPag: '17', info: '' };

export default function NotasFiscais({ session }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [busca, setBusca] = useState('');
  const [produtos, setProdutos] = useState(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const H = useMemo(() => ({ Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }), [session.access_token]);
  const get = useCallback(async (qs = '') => { const r = await fetch(`/api?action=fiscal${qs}`, { headers: H }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; }, [H]);
  const post = async (corpo) => { const r = await fetch('/api?action=fiscal', { method: 'POST', headers: H, body: JSON.stringify(corpo) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; };

  const carregar = useCallback(async () => {
    setErro('');
    try { const j = await get(); if (j.erro) throw new Error(j.erro); setD(j); } catch (e) { setErro(e.message); setD((x) => x || { notas: [], vendas: [], config: {}, cert: {} }); }
  }, [get]);
  useEffect(() => { carregar(); }, [carregar]);

  const abrirVenda = async (v) => {
    setMsg(''); setOcupado(true);
    try { const j = await get(`&op=rascunho&venda=${encodeURIComponent(v.id)}`); if (j.erro) throw new Error(j.erro); setForm({ ...j, venda_id: v.id, tPag: '17', info: '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setOcupado(false);
  };
  const setDest = (k, v) => setForm((f) => ({ ...f, dest: { ...f.dest, [k]: v } }));
  const setItem = (i, k, v) => setForm((f) => ({ ...f, itens: f.itens.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  // CEP digitado (8 números) → preenche rua, bairro e município na hora (o número da casa fica)
  const buscarCep = async (c) => {
    const d8 = String(c).replace(/\D/g, '');
    if (d8.length !== 8) return;
    setBuscandoCep(true);
    const j = await get(`&op=cep&cep=${d8}`).catch(() => ({}));
    setBuscandoCep(false);
    if (j.erro || !j.cod_municipio) { setMsg(`⚠️ ${j.erro || 'CEP não encontrado'}`); return; }
    setForm((f) => ({ ...f, dest: { ...f.dest, cep: d8, cod_municipio: j.cod_municipio, municipio: j.municipio, uf: j.uf, endereco: j.endereco || f.dest.endereco, bairro: j.bairro || f.dest.bairro, cep_auto: false } }));
  };
  // sem CEP: acha pela rua + bairro
  const cepPelaRua = async () => {
    setBuscandoCep(true);
    const dd = form.dest;
    const j = await get(`&op=cep_rua&rua=${encodeURIComponent(dd.endereco || '')}&bairro=${encodeURIComponent(dd.bairro || '')}&cidade=${encodeURIComponent(dd.municipio || 'Manaus')}&uf=${encodeURIComponent(dd.uf || 'AM')}`).catch(() => ({ erro: 'falhou' }));
    setBuscandoCep(false);
    if (j.erro) { setMsg(`⚠️ ${j.erro}. Digite o CEP.`); return; }
    setForm((f) => ({ ...f, dest: { ...f.dest, cep: j.cep, cod_municipio: j.cod_municipio, cep_auto: true } }));
  };
  // estoque do Gestão para trocar/adicionar produto
  const carregarProdutos = async () => { if (produtos) return; const j = await get('&op=produtos').catch(() => ({ produtos: [] })); setProdutos(j.produtos || []); };
  const trocarProduto = (k, id) => {
    const p = (produtos || []).find((x) => String(x.produto_id) === String(id)); if (!p) return;
    setForm((f) => ({ ...f, itens: f.itens.map((x, j) => (j === k ? { ...x, ...p, qtd: x.qtd, valor: Number(x.valor) > 0 ? x.valor : p.valor } : x)) }));
  };
  const adicionarProduto = (id) => {
    const p = (produtos || []).find((x) => String(x.produto_id) === String(id)); if (!p) return;
    setForm((f) => ({ ...f, itens: [...f.itens.filter((x) => x.nome || Number(x.valor) > 0), { ...p, qtd: 1, valor: p.valor }] }));
  };

  const emitir = async () => {
    setOcupado(true); setMsg('');
    try {
      const j = await post({ op: 'emitir', ...form, itens: form.itens.map((i) => ({ ...i, valor: String(i.valor).replace(',', '.'), qtd: String(i.qtd).replace(',', '.') })), desconto: String(form.desconto || 0).replace(',', '.') });
      if (j.erro) setMsg(`⚠️ ${j.erro}`);
      else { setMsg(`✅ Nota nº ${j.numero} autorizada${j.ambiente === 2 ? ' (teste, sem valor fiscal)' : ''}. Baixe o DANFE na lista abaixo.`); setForm(null); }
    } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setOcupado(false); carregar();
  };
  const baixar = async (n, tipo) => {
    try {
      const j = await get(`&op=xml&id=${n.id}${tipo === 'cancelamento' ? '&tipo=cancelamento' : ''}`);
      if (!j.xml) throw new Error('XML não encontrado');
      if (tipo === 'pdf') {
        const { pdf } = await gerarDanfe(j.xml, { cancelada: n.status === 'cancelada' });
        pdf.save(`DANFE-${n.numero}.pdf`);
      } else {
        const blob = new Blob([j.xml], { type: 'application/xml' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${j.chave}${tipo === 'cancelamento' ? '-cancelamento' : ''}.xml`; a.click(); URL.revokeObjectURL(a.href);
      }
    } catch (e) { setMsg(`⚠️ ${e.message}`); }
  };
  const consultar = async (n) => { setOcupado(true); try { const j = await post({ op: 'consultar', id: n.id }); setMsg(j.erro ? `⚠️ ${j.erro}` : `Nota nº ${n.numero}: ${STATUS[j.status] || j.status}${j.motivo ? ` — ${j.motivo}` : ''}`); } catch (e) { setMsg(`⚠️ ${e.message}`); } setOcupado(false); carregar(); };
  const cancelar = async (n) => {
    const just = window.prompt(`Cancelar a nota nº ${n.numero} de ${n.cliente}?\nEscreva o motivo (mínimo 15 letras):`, 'Venda desfeita a pedido do cliente');
    if (!just) return;
    setOcupado(true);
    try { const j = await post({ op: 'cancelar', id: n.id, justificativa: just }); setMsg(j.erro ? `⚠️ ${j.erro}` : `⛔ Nota nº ${n.numero} cancelada na SEFAZ.`); } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setOcupado(false); carregar();
  };
  // 📦 XMLs do mês para o contador (todas as notas de produção, canceladas com o evento junto)
  const [mesXml, setMesXml] = useState(() => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 7));
  const exportarMes = async () => {
    setOcupado(true);
    try {
      const j = await get(`&op=xmls&mes=${mesXml}`);
      if (j.erro) throw new Error(j.erro);
      if (!j.notas.length) throw new Error('nenhuma nota de produção nesse mês');
      const arqs = [];
      j.notas.forEach((n) => { if (n.xml) arqs.push({ nome: `${n.chave}-nfe.xml`, texto: n.xml }); if (n.xml_cancelamento) arqs.push({ nome: `${n.chave}-cancelamento.xml`, texto: n.xml_cancelamento }); });
      const resumo = ['numero;serie;chave;situacao;cliente;valor', ...j.notas.map((n) => [n.numero, n.serie, n.chave, n.status, `"${String(n.cliente || '').replace(/"/g, "'")}"`, String(n.valor).replace('.', ',')].join(';'))].join('\n');
      arqs.push({ nome: `resumo-${mesXml}.csv`, texto: resumo });
      const a = document.createElement('a'); a.href = URL.createObjectURL(criarZip(arqs)); a.download = `notas-fiscais-${mesXml}.zip`; a.click(); URL.revokeObjectURL(a.href);
      setMsg(`📦 ${j.notas.length} nota(s) de ${mesXml.split('-').reverse().join('/')} baixadas. É esse arquivo que vai para o contador.`);
    } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setOcupado(false);
  };
  const salvarCfg = async () => {
    setOcupado(true);
    try { const j = await post({ op: 'config', ...cfg }); if (j.erro) throw new Error(j.erro); setMsg('Configuração salva ✓'); setCfg(null); } catch (e) { setMsg(`⚠️ ${e.message}`); }
    setOcupado(false); carregar();
  };

  if (!d) return <section className="cartao"><div className="centro-bloco"><span className="spinner pequeno" /></div></section>;
  const c = d.config || {};
  const prod = Number(c.ambiente) === 1;
  const emitidas = new Map((d.notas || []).filter((n) => ['autorizada', 'emitindo', 'erro'].includes(n.status) && n.ambiente === (prod ? 1 : 2)).map((n) => [String(n.venda_id), n]));
  const vendas = (d.vendas || []).filter((v) => !busca || `${v.cliente} ${v.descricao}`.toLowerCase().includes(busca.toLowerCase()));
  const total = form ? Math.max(0, form.itens.reduce((a, i) => a + (Number(String(i.qtd).replace(',', '.')) || 0) * (Number(String(i.valor).replace(',', '.')) || 0), 0) - (Number(String(form.desconto).replace(',', '.')) || 0)) : 0;
  const pode24h = (n) => n.status === 'autorizada' && Date.now() - Date.parse(n.autorizada_em || n.criado_em) < 24 * 3600e3;

  return (
    <div className="fis">
      {erro && <div className="erro" role="alert">{erro}</div>}
      {msg && <div className={msg.startsWith('⚠️') ? 'erro' : 'aviso-ok'} role="status" onClick={() => setMsg('')}>{msg}</div>}

      <section className="cartao fis-topo">
        <div>
          <span className={`fis-amb${prod ? ' prod' : ''}`}>{prod ? '✅ Produção (vale de verdade)' : '🧪 Teste (homologação, sem valor fiscal)'}</span>
          <small className="mudo">Série {c.serie} · próxima nº {prod ? c.proximo_producao : c.proximo_homolog} · {d.cert?.ok ? `certificado ok até ${dia(d.cert.validade)} (${d.cert.dias} dias)` : `⚠️ ${d.cert?.erro || 'sem certificado'}`}</small>
        </div>
        <div className="bts">
          <button type="button" className="botao fantasma" onClick={() => { setForm({ ...VAZIO, venda_id: null }); setMsg(''); }}>+ Nota avulsa</button>
          <button type="button" className="botao fantasma" onClick={() => setCfg(cfg ? null : { ...c, emitente: { ...(c.emitente || {}), resp: { ...(c.emitente?.resp || {}) } } })}>⚙️ Configurar</button>
        </div>
      </section>

      {cfg && (
        <section className="cartao fis-form">
          <header className="cartao-topo"><h2>⚙️ Empresa e numeração</h2></header>
          <div className="chips">{[[2, '🧪 Teste'], [1, '✅ Produção']].map(([k, r]) => <button key={k} type="button" className={`chip${Number(cfg.ambiente) === k ? ' ativo' : ''}`} onClick={() => setCfg({ ...cfg, ambiente: k })}>{r}</button>)}</div>
          {Number(cfg.ambiente) === 1 && Number(c.ambiente) !== 1 && <p className="erro">Em produção a nota vale de verdade e vai para a SEFAZ. Confira os dados da empresa antes de salvar.</p>}
          <div className="fis-grade">
            {[['cnpj', 'CNPJ'], ['ie', 'Inscrição estadual'], ['razao', 'Razão social'], ['fantasia', 'Nome fantasia'], ['logradouro', 'Rua'], ['numero', 'Número'], ['bairro', 'Bairro'], ['cep', 'CEP'], ['municipio', 'Município'], ['cod_municipio', 'Cód. IBGE do município'], ['uf', 'UF'], ['fone', 'Telefone'], ['crt', 'CRT (1 = Simples)']].map(([k, r]) => (
              <label key={k}>{r}<input value={cfg.emitente?.[k] || ''} onChange={(e) => setCfg({ ...cfg, emitente: { ...cfg.emitente, [k]: e.target.value } })} /></label>
            ))}
            {[['contato', 'Resp. técnico: nome'], ['email', 'Resp. técnico: e-mail'], ['fone', 'Resp. técnico: fone']].map(([k, r]) => (
              <label key={`r${k}`}>{r}<input value={cfg.emitente?.resp?.[k] || ''} onChange={(e) => setCfg({ ...cfg, emitente: { ...cfg.emitente, resp: { ...cfg.emitente.resp, [k]: e.target.value } } })} /></label>
            ))}
            <label>Série<input type="number" value={cfg.serie} onChange={(e) => setCfg({ ...cfg, serie: e.target.value })} /></label>
            <label>Próximo nº (produção)<input type="number" value={cfg.proximo_producao} onChange={(e) => setCfg({ ...cfg, proximo_producao: e.target.value })} /></label>
            <label>Próximo nº (teste)<input type="number" value={cfg.proximo_homolog} onChange={(e) => setCfg({ ...cfg, proximo_homolog: e.target.value })} /></label>
            <label>Natureza da operação<input value={cfg.natop} onChange={(e) => setCfg({ ...cfg, natop: e.target.value })} /></label>
            <label>% tributos federais (IBPT)<input value={cfg.ibpt_fed} onChange={(e) => setCfg({ ...cfg, ibpt_fed: e.target.value })} /></label>
            <label>% tributos estaduais (IBPT)<input value={cfg.ibpt_est} onChange={(e) => setCfg({ ...cfg, ibpt_est: e.target.value })} /></label>
          </div>
          <label>Informação fixa em toda nota (opcional)<input value={cfg.info || ''} onChange={(e) => setCfg({ ...cfg, info: e.target.value })} placeholder="ex.: Garantia de 3 meses contra defeito de fábrica" /></label>
          <div className="bts"><button type="button" className="botao" disabled={ocupado} onClick={salvarCfg}>Salvar</button><button type="button" className="botao fantasma" onClick={() => setCfg(null)}>Fechar</button></div>
        </section>
      )}

      {form && (
        <section className="cartao fis-form">
          <header className="cartao-topo"><h2>🧾 {form.venda ? `Nota da venda de ${dia(form.venda.data)}` : 'Nota avulsa'}</h2>{form.venda && <small className="mudo">{form.venda.descricao} · {brl(form.venda.total)}</small>}</header>
          <h3 className="fis-sub">Cliente</h3>
          <div className="fis-grade">
            <label>CPF (ou CNPJ)<input value={form.dest.doc} onChange={(e) => setDest('doc', e.target.value)} placeholder="000.000.000-00" inputMode="numeric" /></label>
            <label className="largo">Nome completo<input value={form.dest.nome} onChange={(e) => setDest('nome', e.target.value)} /></label>
            <label>CEP<input value={form.dest.cep} onChange={(e) => { setDest('cep', e.target.value); setDest('cep_auto', false); if (e.target.value.replace(/\D/g, '').length === 8) buscarCep(e.target.value); }} inputMode="numeric" placeholder={buscandoCep ? 'buscando…' : '00000-000'} />{!String(form.dest.cep || '').replace(/\D/g, '') && form.dest.endereco && <button type="button" className="botao fantasma pequeno" disabled={buscandoCep} onClick={cepPelaRua}>🔎 Achar pelo endereço</button>}</label>
            <label className="largo">Rua<input value={form.dest.endereco} onChange={(e) => setDest('endereco', e.target.value)} /></label>
            <label>Número<input value={form.dest.numero} onChange={(e) => setDest('numero', e.target.value)} placeholder="S/N" /></label>
            <label>Bairro<input value={form.dest.bairro} onChange={(e) => setDest('bairro', e.target.value)} /></label>
            <label>Município<input value={`${form.dest.municipio || ''}${form.dest.uf ? ` - ${form.dest.uf}` : ''}`} readOnly title="vem do CEP" /></label>
            <label>E-mail <small className="mudo">opcional</small><input value={form.dest.email} onChange={(e) => setDest('email', e.target.value)} /></label>
          </div>
          {!form.dest.cod_municipio && <p className="erro">Digite o CEP para achar o município.</p>}
          {form.dest.cep_auto && <p className="mudo pequeno">📍 O CEP não estava no cadastro: achei pela rua e bairro. Confira.</p>}
          <h3 className="fis-sub">Produtos <small className="mudo">brinde (valor 0) não entra na nota</small></h3>
          <div className="fis-itens">
            {form.itens.map((i, k) => (
              <div key={k} className="fis-item">
                <label className="fis-desc">Produto do estoque
                  <select value={i.produto_id || ''} onFocus={carregarProdutos} onChange={(e) => trocarProduto(k, e.target.value)}>
                    <option value="">{produtos ? '— trocar pelo produto do estoque —' : (i.nome_loja || 'trocar produto…')}</option>
                    {(produtos || []).map((p) => <option key={p.produto_id} value={p.produto_id}>{p.nome_loja}{p.qtd_estoque ? ` (${p.qtd_estoque} un.)` : ''}</option>)}
                    {i.produto_id && !produtos && <option value={i.produto_id}>{i.nome_loja}</option>}
                  </select>
                </label>
                <label>NCM<input value={i.ncm} onChange={(e) => setItem(k, 'ncm', e.target.value)} inputMode="numeric" className={/^\d{8}$/.test(String(i.ncm).replace(/\D/g, '')) ? '' : 'fis-falta'} /></label>
                <label>Qtd<input value={i.qtd} onChange={(e) => setItem(k, 'qtd', e.target.value)} inputMode="decimal" /></label>
                <label>Valor un. (R$)<input value={i.valor} onChange={(e) => setItem(k, 'valor', e.target.value)} inputMode="decimal" /></label>
                <div className="fis-x">{form.itens.length > 1 && <button type="button" className="botao fantasma pequeno" title="tirar item" onClick={() => setForm({ ...form, itens: form.itens.filter((_, j) => j !== k) })}>✕</button>}</div>
                <label className="fis-desc-nota">Descrição que sai na nota<input value={i.nome} onChange={(e) => setItem(k, 'nome', e.target.value)} placeholder="ex.: Relógio smartwatch S11 Mini" /></label>
              </div>
            ))}
          </div>
          <div className="fis-add">
            <select value="" onFocus={carregarProdutos} onChange={(e) => adicionarProduto(e.target.value)}>
              <option value="">+ Adicionar item do estoque…</option>
              {(produtos || []).map((p) => <option key={p.produto_id} value={p.produto_id}>{p.nome_loja} · R$ {Number(p.valor || 0).toFixed(2).replace('.', ',')}</option>)}
            </select>
            <button type="button" className="botao fantasma pequeno" onClick={() => setForm((f) => ({ ...f, itens: [...f.itens, { codigo: '', nome: '', ncm: f.itens[0]?.ncm || '', qtd: 1, valor: 0, unidade: 'UN', csosn: '102', orig: 0 }] }))}>+ Item em branco</button>
          </div>
          <div className="fis-grade">
            <label>Desconto (R$)<input value={form.desconto} onChange={(e) => setForm({ ...form, desconto: e.target.value })} /></label>
            <label>Pagamento<select value={form.tPag} onChange={(e) => setForm({ ...form, tPag: e.target.value })}>{PAG.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
            <label className="largo">Observação na nota <small className="mudo">opcional</small><input value={form.info} onChange={(e) => setForm({ ...form, info: e.target.value })} placeholder="ex.: IMEI / nº de série" /></label>
          </div>
          <div className="fis-total"><span>Total da nota</span><b>{brl(total)}</b>{form.venda && Math.abs(total - form.venda.total) > 0.009 && <small className="erro">diferente da venda ({brl(form.venda.total)})</small>}</div>
          <div className="bts">
            <button type="button" className="botao" disabled={ocupado || !d.cert?.ok} onClick={emitir}>{ocupado ? 'Enviando para a SEFAZ…' : prod ? '✅ Emitir nota' : '🧪 Emitir nota de teste'}</button>
            <button type="button" className="botao fantasma" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </section>
      )}

      <section className="cartao">
        <header className="cartao-topo"><h2>Vendas dos últimos 45 dias</h2><input className="fis-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou produto" /></header>
        {!d.gestao ? <p className="mudo">Ligue o Gestão TFX para puxar as vendas.</p> : !vendas.length ? <p className="mudo">Nenhuma venda.</p> : (
          <div className="fis-vendas">
            {vendas.slice(0, 60).map((v) => {
              const n = emitidas.get(String(v.id));
              return (
                <div key={v.id} className="fis-venda">
                  <div><b>{v.cliente || 'Sem nome'}</b><small className="mudo">{dia(v.data)} · {v.descricao}</small></div>
                  <span>{brl(v.total)}</span>
                  {n ? <span className="fis-tem">{n.status === 'autorizada' ? `NF nº ${n.numero}` : STATUS[n.status]}</span> : <button type="button" className="botao pequeno" disabled={ocupado} onClick={() => abrirVenda(v)}>Emitir NF</button>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="cartao">
        <header className="cartao-topo"><h2>Notas emitidas</h2><div className="fis-add"><input type="month" value={mesXml} onChange={(e) => setMesXml(e.target.value)} /><button type="button" className="botao fantasma pequeno" disabled={ocupado} onClick={exportarMes}>📦 XMLs do mês (contador)</button><button type="button" className="botao fantasma pequeno" onClick={carregar}>Atualizar</button></div></header>
        {!d.notas?.length ? <p className="mudo">Nenhuma ainda.</p> : (
          <div className="tabela-rolagem"><table className="pz-tab"><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Valor</th><th>Situação</th><th /></tr></thead><tbody>
            {d.notas.map((n) => (
              <tr key={n.id} title={n.motivo || ''}>
                <td>{n.numero}{n.ambiente === 2 && <small className="mudo"> teste</small>}</td>
                <td>{dia(n.criado_em)}</td>
                <td style={{ textAlign: 'left' }}>{n.cliente}</td>
                <td>{brl(n.valor)}</td>
                <td style={{ whiteSpace: 'normal' }}>{STATUS[n.status] || n.status}{['rejeitada', 'erro'].includes(n.status) && n.motivo && <small className="mudo"> {n.cstat ? `${n.cstat}: ` : ''}{n.motivo}</small>}</td>
                <td className="fis-acoes">
                  {['autorizada', 'cancelada'].includes(n.status) && <><button type="button" className="botao fantasma pequeno" onClick={() => baixar(n, 'pdf')}>DANFE</button><button type="button" className="botao fantasma pequeno" onClick={() => baixar(n, 'xml')}>XML</button></>}
                  {n.status === 'cancelada' && <button type="button" className="botao fantasma pequeno" onClick={() => baixar(n, 'cancelamento')}>XML canc.</button>}
                  {['erro', 'emitindo'].includes(n.status) && <button type="button" className="botao pequeno" disabled={ocupado} onClick={() => consultar(n)}>Consultar</button>}
                  {pode24h(n) && <button type="button" className="botao fantasma pequeno" disabled={ocupado} onClick={() => cancelar(n)}>Cancelar</button>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <small className="mudo">Cancelamento: até 24 h depois de autorizada. Guarde o XML: a lei pede 5 anos (fica guardado aqui também).</small>
      </section>
    </div>
  );
}
```

---

## 3. REGRAS FISCAIS QUE O CÓDIGO APLICA

| Campo | Regra | Por quê |
|---|---|---|
| CFOP | **5102** dentro do estado e **6102** fora (`idDest` 1 ou 2) | revenda de mercadoria a consumidor |
| CSOSN | **102** (Simples, sem crédito), `orig` 0 (nacional) por item, configurável | Simples Nacional |
| PIS/COFINS | `PISOutr`/`COFINSOutr` **CST 49**, tudo zerado | igual ao emissor antigo da loja, aceito pela SEFAZ e pelo contador |
| NCM | 8 dígitos, vindo do cadastro do produto (campo próprio, sem chute) | obrigatório; a tela bloqueia se faltar |
| Nome do item | `descricao_fiscal` do estoque (nome fiscal), não o nome comercial | o nome comercial ("S11 MINI PRATA") não serve para o fisco |
| Brinde | item com valor 0 **não entra** na nota | igual ao emissor antigo |
| Desconto | rateado **proporcional ao valor** de cada item; os centavos que sobram vão no **último item** (`vDesc` dos itens soma exatamente o `vDesc` total) | sem isso dá rejeição de total |
| Frete | mesmo rateio do desconto; `modFrete` 0 com frete, 9 sem | |
| Arredondamento | tudo em 2 casas com `Math.round(v*100)/100`; `vUnCom` com 10 casas e `qCom` com 4 | evita diferença de centavo entre item e total |
| Pagamento | `tPag` **17 (PIX)** por padrão (também 01, 03, 04, 99 com `xPag`), `indPag` 0, um `detPag` com o `vNF` | todas as vendas são PIX |
| Consumidor final | `indFinal` 1, `indPres` **9** (não presencial: venda pelo WhatsApp), `indIntermed` 0 (obrigatório quando `indPres` é 2 ou 9) | |
| Cliente | CPF (11) ou CNPJ (14) **validado pelo dígito**, `indIEDest` **9** (não contribuinte) | |
| Data/hora | `dhEmi`/`dhSaiEnt` com fuso (`-04:00` no AM o ano todo) | fuso errado dá rejeição de data |
| Tributos aproximados (Lei 12.741) | % federal e estadual configuráveis (padrão do emissor antigo: 19,89% e 20%); `vTotTrib` por item e no total, mais o texto "Total aproximado de tributos: R$ … Fonte IBPT." | o ideal é a tabela IBPT por NCM; aqui é % fixo |
| Frase do Simples | "Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI." | |
| Homologação | `xNome` do destinatário **obrigatoriamente** "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" | senão dá rejeição |
| Responsável técnico | `infRespTec` opcional (só vai se preenchido) | algumas UFs exigem |

**IBS/CBS (reforma tributária):** a **homologação do AM passou a exigir o grupo IBS/CBS em 2026 mesmo para o Simples**. A **produção ainda não exigia** (o XML do emissor antigo em produção não tinha). O código manda o grupo em homologação e, em produção, só manda de novo com o grupo se a SEFAZ responder 1115. Fique de olho: isso vai mudar ao longo de 2026/2027.

**O que é do AM e o que muda para o RJ:**
- **Web services:** cada UF tem os seus endereços. O AM tem servidor próprio (`nfe.sefaz.am.gov.br`). O **RJ usa a SVRS** (Sefaz Virtual do RS): `nfe.svrs.rs.gov.br` (produção) e `nfe-homologacao.svrs.rs.gov.br` (homologação), com caminhos diferentes (`/ws/NfeAutorizacao/NFeAutorizacao4.asmx` etc.). Troque o mapa `WS`/`SERV` e confira os caminhos na tabela oficial do Portal da NF-e.
- **cUF:** `UF_COD` (AM 13, RJ 33).
- **Fuso:** o RJ é `-03:00`.
- **Fora do estado:** o CFOP vira 6102 e o `idDest` vira 2. Para **consumidor final de outra UF**, confira com o contador a **DIFAL**. No Simples normalmente não destaca, mas há regras por UF, e o RJ tem **FECP**.
- **IBS/CBS em homologação:** confira se a SVRS também está exigindo.
- **IBPT:** os % mudam por UF e por NCM.

---

## 4. ERROS QUE APARECERAM E COMO RESOLVEMOS

| Erro / cStat | Causa | Correção |
|---|---|---|
| **297 / "Assinatura difere do calculado"** | o C14N do elemento assinado não batia: faltava o `xmlns` herdado no `infNFe` e a ordem dos atributos tem que ser `Id` antes de `versao` | gerar o XML **já na forma canônica** (sem espaços, atributos em ordem) e calcular o digest do `infNFe` com o `xmlns` do pai (ver `assinar()`) |
| Certificado errado na assinatura | o .pfx traz a **cadeia** (AC raiz e intermediária) e às vezes o primeiro certificado não é o da empresa | escolher o certificado cuja chave pública **bate com a chave privada** (ver `lerCertificado()`) |
| `unable to verify the first certificate` / TLS | a cadeia da SEFAZ é ICP-Brasil, que não vem no Node | `rejectUnauthorized: false` no `https.request` (o sped-nfe faz igual). Mais seguro: incluir a cadeia ICP-Brasil em `ca` |
| Senha/base64 do certificado "inválidos" | o base64 colado com **quebras de linha** no Vercel | `tr -d '\n'` ao gerar; no código, `replace(/\s+/g, '')` antes de decodificar |
| OpenSSL 3 não abre o .pfx (protótipo PHP) | .pfx antigo com RC2-40; OpenSSL 3 desativa por padrão | no PHP, *legacy provider* no `openssl.cnf`; no Node, o `node-forge` abre sem isso |
| **1115 / schema** em homologação | o AM exigiu o grupo **IBS/CBS** em homologação em 2026 | mandar o grupo em homologação; em produção, tentar sem e repetir com o grupo se vier 1115 |
| **225 / Falha no schema** | tags vazias, ordem errada, e-mail inválido, telefone com 55 na frente | `tag()` não gera tag vazia; e-mail só se for válido; tira o `55` do telefone; ordem das tags exatamente como no leiaute |
| Rejeição do nome em homologação | o destinatário precisa ter o texto fixo de homologação | trocar `xNome` automaticamente quando `tpAmb` = 2 |
| Falta `indIntermed` | obrigatório quando `indPres` é 2 ou 9 | incluir `<indIntermed>0</indIntermed>` |
| **204 / 539 (duplicidade)** | a nota entrou, mas a resposta se perdeu (timeout) e tentaram de novo com o mesmo número | **guardar o XML assinado antes de enviar**; sem resposta, a nota fica pendente e o botão **Consultar** fecha o `nfeProc` com o protocolo |
| **217 (não consta)** ao consultar | a nota nunca chegou | marca rejeitada e **devolve o número** |
| Número repetido / buraco | duas emissões juntas, ou rejeitada que consumia número | RPC atômica `nfe_reservar` e `nfe_devolver` só para rejeitada |
| Timeout | SEFAZ lenta e limite de tempo da função | `timeout` de 30 s no SOAP; nunca reenviar automaticamente, sempre consultar |
| Código do município vazio | cadastro do cliente sem CEP | ViaCEP pelo CEP; sem CEP, busca pela rua e bairro e **só aceita rua com o mesmo nome** (antes pegava a rua errada) |
| Rejeição de total/desconto | soma dos `vDesc` dos itens ≠ `vDesc` total por arredondamento | rateio com a sobra no último item |
| tPag errado | o emissor antigo usava 01 (dinheiro) para PIX | `tPag` 17 |
| DANFE com campos "camuflados" e rótulos tortos | layout com rótulo e valor sobrepostos | função `caixa()` com rótulo pequeno em cima e valor embaixo, texto cortado na largura |
| Cancelamento recusado | justificativa com menos de 15 letras, ou fora do prazo (24 h) | validar antes de mandar |

**O que mais demorou:** a **assinatura**. O digest só bate quando o texto canônico é idêntico ao que a SEFAZ recalcula, e o erro não diz onde está a diferença. A solução foi parar de canonicalizar depois e **montar o XML já canônico** desde o início. Em segundo lugar ficou o **IBS/CBS** exigido só em homologação.

---

## 5. PASSO A PASSO QUE FUNCIONOU

1. **Certificado A1** (.pfx) da empresa, válido, e a senha.
2. **Confirmar com o contador:** regime (CRT), CFOP, CSOSN, NCM de cada produto, série a usar e se a empresa está **credenciada como emissora de NF-e** na SEFAZ do estado. Empresa que já emitia por outro sistema já está credenciada; para emitir pelo próprio sistema não precisa de novo cadastro.
3. **Banco:** rodar o SQL da seção 2.2 no Supabase.
4. **Variáveis no Vercel:** `NFE_CERT_B64` e `NFE_CERT_SENHA` (a seção 2.1 mostra como gerar o base64).
5. **Status da SEFAZ:** `GET ?action=fiscal&op=sefaz` tem que voltar **cStat 107** ("Serviço em operação") em produção e homologação. Se der erro aqui, o problema é certificado ou TLS, não o XML.
6. **Configurar o emitente** (CNPJ igual ao do certificado, IE, endereço, código IBGE, CRT) com **ambiente 2 (homologação)** e uma série separada.
7. **Homologação:** emitir notas de teste (o número de homologação começa em 20 para não confundir) até sair **cStat 100**. Testar também: **cancelamento** (cStat 135), consulta, rejeição proposital (CPF inválido, NCM faltando).
8. **Conferir o DANFE de homologação:**
   - chave legível e código de barras;
   - protocolo;
   - destinatário;
   - NCM e CFOP por item;
   - total = produtos − desconto (+ frete);
   - tributos aproximados;
   - frase do Simples;
   - tarja de homologação.

   Validar o XML no validador do Portal da NF-e ou da SEFAZ.
9. **Comparar com uma nota real do emissor antigo:** abrir os dois XMLs e conferir campo a campo (CFOP, CSOSN, PIS/COFINS, `indPres`, `natOp`, `infCpl`). Foi isso que evitou surpresa em produção.
10. **Produção:** trocar para **ambiente 1**, definir o próximo número de produção da série e emitir **uma nota real de valor baixo**. Se tiver algo errado, **cancelar em até 24 h**.
11. **Rotina:** emitir pela tela da venda. Nota sem resposta → **Consultar**. No fim do mês → **XMLs do mês (.zip)** para o contador.

**Backup dos XMLs (guarda de 5 anos):**
- **Supabase:** o XML autorizado e o de cancelamento ficam na tabela `nfe_notas`. Ative backup automático ou PITR.
- **Cópia mensal fora do banco:** o botão "XMLs do mês" baixa um .zip. Guarde no Drive ou mande ao contador todo mês.
- **Extra recomendado:** um cron mensal que mande o .zip por e-mail ao contador.

---

## 6. O QUE EU FARIA DIFERENTE

- **Começaria direto em Node na Vercel.** O protótipo PHP + Docker ajudou a validar, mas manter duas implementações custou tempo. Para quem já tem Node/Vercel, o caminho Node é menos infraestrutura (sem VPS, sem SQLite, sem proxy) e custo zero.
- **Guardaria o XML assinado antes de enviar** desde a primeira versão (ver os erros 204/539).
- **Mandaria o XML de uma nota real do emissor antigo** como gabarito logo no começo.
- **Nome fiscal e NCM no cadastro do produto** desde o início: o nome comercial não serve na nota.
- **Funções que valem a pena:**
  - envio do **DANFE e do XML por e-mail ou WhatsApp** ao cliente, automático depois de autorizar;
  - **CC-e** e **inutilização** (seção 2.3);
  - **NFC-e** (modelo 65, para balcão: precisa de CSC e QR Code);
  - **devolução** (finNFe 4 com NF referenciada, CFOP 1202/2202);
  - **IBPT por NCM** (tabela oficial) no lugar do % fixo;
  - **pagamentos múltiplos com troco**;
  - **frete na tela**;
  - **cron do .zip mensal** para o contador;
  - **alerta de certificado vencendo** (o painel já mostra os dias que faltam).
