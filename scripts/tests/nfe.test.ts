// NF-e própria (api/_lib/nfe.js + fiscal.js + api/nfe.js). Sem rede e sem banco: node scripts/tests/nfe.test.ts
// 1) certificado A1 de mentira gerado aqui (node-forge) → lerCertificado acha a chave, o CNPJ e a validade;
// 2) XML no gabarito do Tiny; dentro do RJ (5102/idDest 1) e fora (6102/idDest 2); homologação troca os nomes;
// 3) rateio de desconto e frete (centavos no último item, brinde fica com 0);
// 4) trava de NCM (não emite e diz qual produto); 5) assinatura: conferida aqui E pelo SignedXml do .NET;
// 6) schemas oficiais NF-e 4.00 (PL_010 v1.30, scripts/tests/fixtures/nfe-xsd) via PowerShell/.NET;
// 7) fluxo de emissão com banco e SEFAZ falsos: autorizada, rejeitada devolve o número, sem resposta = pendente,
//    1115 em homologação reenvia com IBS/CBS, venda repetida bloqueada, consulta fecha o nfeProc; 8) rota sem login = 401;
// 9) TLS com a SVRS: cadeia ICP-Brasil (Raiz v10 → AC SERPRO SSLv1) como ca, sem desligar a verificação;
// 10) brinde puxa o NCM do cadastro de Acessórios (migration accessories.ncm); 11) cliente fora do RJ exige "Conferi";
// 12) fase 2: evento de cancelamento no schema oficial (envEventoCancNFe/procEventoCancNFe v1.00) e assinado,
//     cancelamento com SEFAZ simulada (135 cancela; 501 e sem resposta mantêm autorizada), prazo de 24 h,
//     trava de produção lida NO BANCO, venda com nota do Tiny, XMLs do mês, lista e selos; brinde com cProd legível.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import * as N from '../../api/_lib/nfe.js';
import * as F from '../../api/_lib/fiscal.js';
import { criarHandler } from '../../api/nfe.js';
import { code128c } from '../../src/lib/danfe.ts';
import * as R from '../../src/lib/nfeRegras.ts';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const XSD = path.join(AQUI, 'fixtures', 'nfe-xsd');
const TMP = mkdtempSync(path.join(tmpdir(), 'nfe-teste-'));
let passou = 0;
const t = async (nome: string, fn: () => unknown) => { try { await fn(); passou++; console.log(`ok - ${nome}`); } catch (e) { console.error(`FALHOU - ${nome}`); throw e; } };

// ── certificado de mentira (autoassinado, CN no padrão ICP-Brasil "RAZAO:CNPJ") ──
function certificadoFalso(cnpj = '49923481000104', senha = 'senha-teste') {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const c = forge.pki.createCertificate();
  c.publicKey = keys.publicKey; c.serialNumber = '0a1b2c';
  c.validity.notBefore = new Date(Date.now() - 864e5); c.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  const attrs = [{ name: 'commonName', value: `LOJA TRIUMPH LTDA:${cnpj}` }, { name: 'countryName', value: 'BR' }];
  c.setSubject(attrs); c.setIssuer(attrs); c.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [c], senha, { algorithm: '3des' });
  return { b64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()), senha };
}
const falso = certificadoFalso();
const cert = N.lerCertificado(falso.b64, falso.senha);

const EMIT = { cnpj: '49923481000104', ie: '13748756', razao: 'LOJA TRIUMPH LTDA', fantasia: 'Triumph Store', crt: '1', logradouro: 'Rua Quinze de Novembro', numero: '106', complemento: 'Sala 908', bairro: 'Centro', cep: '24020125', cod_municipio: '3303302', municipio: 'Niterói', uf: 'RJ', fone: '' };
const DEST_RJ = { doc: '529.982.247-25', nome: 'Cliente de Teste', email: 'cliente@exemplo.com', fone: '5521999998888', cep: '24220-000', endereco: 'Rua Moreira César', numero: '10', complemento: 'apto 101', bairro: 'Icaraí', municipio: 'Niterói', uf: 'RJ', cod_municipio: '3303302' };
const DEST_SP = { ...DEST_RJ, cep: '01310100', endereco: 'Avenida Paulista', bairro: 'Bela Vista', municipio: 'São Paulo', uf: 'SP', cod_municipio: '3550308' };
const ITENS = [
  { codigo: 'S11-PRATA', nome: 'Relógio smartwatch S11 & pulseira <prata>', ncm: '85176277', qtd: 1, valor: 399.9 },
  { codigo: 'PUL-ROSA', nome: 'Pulseira extra rosa', ncm: '91139000', qtd: 2, valor: 33.33 },
  { codigo: 'BRINDE', nome: 'Película (brinde)', ncm: '39199090', qtd: 1, valor: 0 },
];
const notaBase = (o: Record<string, unknown> = {}) => ({ ambiente: 2, serie: 2, numero: 7, data: new Date('2026-11-13T15:04:05Z'), cNF: '12345678', natOp: 'Venda de mercadorias de terceiros para consumidor final', indPres: 2, dest: DEST_RJ, itens: ITENS, desconto: 10, frete: 0, pagamento: { tPag: '90' }, info: N.FRASE_SIMPLES, ibpt: { fed: 21.08, est: 22 }, ibscbs: false, ...o });
const pega = (x: string, tg: string) => N.pega(x, tg);
const todos = (x: string, tg: string) => [...x.matchAll(new RegExp(`<${tg}>([^<]*)</${tg}>`, 'g'))].map((m) => m[1]);

// ── validação externa (.NET): schema + assinatura ──
const temPS = (() => { try { execFileSync('powershell', ['-NoProfile', '-Command', '1'], { stdio: 'ignore' }); return true; } catch { return false; } })();
function validar(xsd: string, xmls: Record<string, string>, assinatura = false) {
  const arqs = Object.entries(xmls).map(([nome, conteudo]) => { const p = path.join(TMP, `${nome}.xml`); writeFileSync(p, conteudo, 'utf8'); return p; });
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(AQUI, 'nfe-validar.ps1'), '-Xsd', path.join(XSD, xsd), '-Xml', arqs.join('|')];
  if (assinatura) args.push('-Assinatura');
  return execFileSync('powershell', args, { encoding: 'utf8' }).trim().split(/\r?\n/);
}

await t('certificado de mentira: acha a chave, o CNPJ (do CN) e a validade', () => {
  assert.equal(cert.cnpj, '49923481000104');
  assert.match(cert.keyPem, /PRIVATE KEY/);
  assert.ok(cert.validade > new Date());
  assert.throws(() => N.lerCertificado(falso.b64, 'senha errada'));
});

await t('chave de acesso: 44 dígitos, cUF 33, modelo 55, série 002, DV certo', () => {
  const m = N.montarXml(notaBase(), EMIT);
  assert.equal(m.chave.length, 44);
  assert.equal(m.chave.slice(0, 2), '33');
  assert.equal(m.chave.slice(2, 6), '2611');
  assert.equal(m.chave.slice(6, 20), '49923481000104');
  assert.equal(m.chave.slice(20, 22), '55');
  assert.equal(m.chave.slice(22, 25), '002');
  assert.equal(m.chave.slice(25, 34), '000000007');
  assert.equal(m.chave.slice(34, 35), '1');
  assert.equal(m.chave.slice(35, 43), '12345678');
  assert.equal(Number(m.chave[43]), N.dvChave(m.chave.slice(0, 43)));
});

await t('gabarito do Tiny no XML (ide, itens, impostos, transp, pag, infCpl)', () => {
  const { xml } = N.montarXml(notaBase({ ambiente: 1 }), EMIT);
  assert.equal(pega(xml, 'natOp'), 'Venda de mercadorias de terceiros para consumidor final');
  assert.equal(pega(xml, 'dhEmi'), '2026-11-13T12:04:05-03:00');
  for (const [k, v] of [['idDest', '1'], ['indFinal', '1'], ['indPres', '2'], ['indIntermed', '0'], ['finNFe', '1'], ['tpImp', '1'], ['tpNF', '1'], ['serie', '2'], ['cMunFG', '3303302'], ['CRT', '1'], ['IE', '13748756'], ['indIEDest', '9'], ['modFrete', '9'], ['tPag', '90'], ['vPag', '0.00'], ['pesoL', '0.000'], ['pesoB', '0.000']]) assert.equal(pega(xml, k), v, k);
  assert.ok(xml.includes('<xCpl>Sala 908</xCpl>'));
  assert.deepEqual(todos(xml, 'CFOP'), ['5102', '5102', '5102']);
  assert.deepEqual(todos(xml, 'uCom'), ['Pc', 'Pc', 'Pc']);
  assert.deepEqual(todos(xml, 'uTrib'), ['Pc', 'Pc', 'Pc']);
  assert.deepEqual(todos(xml, 'cEAN'), ['SEM GTIN', 'SEM GTIN', 'SEM GTIN']);
  assert.deepEqual(todos(xml, 'cEANTrib'), ['SEM GTIN', 'SEM GTIN', 'SEM GTIN']);
  assert.equal((xml.match(/<ICMSSN102><orig>0<\/orig><CSOSN>102<\/CSOSN><\/ICMSSN102>/g) || []).length, 3);
  assert.equal((xml.match(/<IPI><cEnq>999<\/cEnq><IPINT><CST>53<\/CST><\/IPINT><\/IPI>/g) || []).length, 3);
  assert.equal((xml.match(/<PIS><PISNT><CST>08<\/CST><\/PISNT><\/PIS>/g) || []).length, 3);
  assert.equal((xml.match(/<COFINS><COFINSNT><CST>08<\/CST><\/COFINSNT><\/COFINS>/g) || []).length, 3);
  assert.ok(!xml.includes('IBSCBS'), 'sem IBS/CBS por padrão');
  // escape do texto
  assert.ok(xml.includes('Relógio smartwatch S11 &amp; pulseira &lt;prata&gt;'));
  // telefone sem o 55, e-mail válido
  assert.equal(pega(xml, 'fone'), '21999998888');
  assert.equal(pega(xml, 'email'), 'cliente@exemplo.com');
  // tributos aproximados por item e no texto (21,08% federal + 22,00% estadual sobre o valor com desconto)
  const vt = todos(xml, 'vTotTrib');
  assert.equal(vt.length, 4); // 3 itens + total
  assert.equal(vt[2], '0.00', 'brinde sem tributo');
  const cpl = pega(xml, 'infCpl')!;
  const m = N.montarXml(notaBase({ ambiente: 1 }), EMIT);
  assert.equal(cpl, `Tributos aproximados: R$ ${N.brl(m.tFed)} (Federal) e R$ ${N.brl(m.tEst)} (Estadual). Fonte: IBPT. ${N.FRASE_SIMPLES}`);
  assert.equal(m.tFed, N.r2(m.itens.reduce((a: number, i: any) => a + i.tFed, 0)));
  assert.equal(Number(vt[3]), N.r2(m.tFed + m.tEst));
});

await t('origem, unidade e GTIN do cadastro de Produtos: usa quando tem, padrão 0 / Pc / SEM GTIN', () => {
  const itens = [{ ...ITENS[0], gtin: '7891000315507', orig: 2, unidade: 'Un' }, { ...ITENS[1], gtin: '7891000315508' }, ITENS[2]];
  const { xml } = N.montarXml(notaBase({ ambiente: 1, itens }), EMIT);
  assert.deepEqual(todos(xml, 'cEAN'), ['7891000315507', 'SEM GTIN', 'SEM GTIN'], 'dígito verificador errado vira SEM GTIN');
  assert.deepEqual(todos(xml, 'cEANTrib'), ['7891000315507', 'SEM GTIN', 'SEM GTIN']);
  assert.deepEqual(todos(xml, 'uCom'), ['Un', 'Pc', 'Pc']);
  assert.deepEqual(todos(xml, 'orig'), ['2', '0', '0']);
  for (const [g, ok] of [['7891000315507', true], ['96385074', true], ['012345678905', true], ['17891000315504', true], ['7891000315508', false], ['123', false], ['SEM GTIN', false], ['', false], [null, false]] as [unknown, boolean][]) {
    assert.equal(N.gtinNota(g), ok ? g : 'SEM GTIN', String(g));
  }
  // o pedido da tela (limparPedido) passa o GTIN, a origem e a unidade; sem eles fica o padrão
  const p = F.limparPedido({ itens: [{ nome: 'A', qtd: 1, valor: 10, gtin: '7891000315507', orig: '2', unidade: 'Un' }, { nome: 'B', qtd: 1, valor: 5 }] });
  assert.deepEqual(p.itens.map((i: any) => [i.gtin, i.orig, i.unidade]), [['7891000315507', 2, 'Un'], ['SEM GTIN', 0, 'Pc']]);
  // rascunho da nota (src/lib/nfeRegras.ts): do produto, ou o padrão antes da migration
  assert.deepEqual(R.dadosFiscais({ origem: 1, unidade: 'Un', gtin: '7891000315507' }), { orig: 1, unidade: 'Un', gtin: '7891000315507' });
  assert.deepEqual(R.dadosFiscais({ origem: null, unidade: '', gtin: '' }), { orig: 0, unidade: 'Pc', gtin: 'SEM GTIN' });
  assert.deepEqual(R.dadosFiscais(undefined), { orig: 0, unidade: 'Pc', gtin: 'SEM GTIN' });
  assert.deepEqual(R.dadosFiscais({ origem: 9 }), { orig: 0, unidade: 'Pc', gtin: 'SEM GTIN' }, 'origem fora de 0–8 vira 0');
});

await t('brinde entra com valor 0,00', () => {
  const { xml } = N.montarXml(notaBase(), EMIT);
  const det3 = xml.slice(xml.indexOf('<det nItem="3">'), xml.indexOf('</det>', xml.indexOf('<det nItem="3">')));
  assert.equal(pega(det3, 'vProd'), '0.00');
  assert.equal(pega(det3, 'vUnCom'), '0.0000000000');
  assert.ok(!det3.includes('<vDesc>'), 'brinde não recebe desconto');
});

await t('CFOP e idDest: dentro do RJ 5102/1, fora do RJ 6102/2', () => {
  const rj = N.montarXml(notaBase(), EMIT).xml;
  const sp = N.montarXml(notaBase({ dest: DEST_SP }), EMIT).xml;
  assert.equal(pega(rj, 'idDest'), '1');
  assert.equal(pega(sp, 'idDest'), '2');
  assert.deepEqual(todos(sp, 'CFOP'), ['6102', '6102', '6102']);
  assert.equal(pega(sp.slice(sp.indexOf('<dest>')), 'UF'), 'SP');
});

await t('rateio do desconto e do frete: proporcional, soma exata, centavos no último item com valor', () => {
  const m = N.montarXml(notaBase({ desconto: 10, frete: 25.5 }), EMIT);
  const vProd = 399.9 + 66.66;
  assert.equal(m.vProd, N.r2(vProd));
  const descs = m.itens.map((i: any) => i.vDesc), fretes = m.itens.map((i: any) => i.vFrete);
  assert.equal(N.r2(descs.reduce((a: number, v: number) => a + v, 0)), 10);
  assert.equal(N.r2(fretes.reduce((a: number, v: number) => a + v, 0)), 25.5);
  assert.equal(descs[0], N.r2((10 * 399.9) / vProd));
  assert.equal(descs[1], N.r2(10 - descs[0]));
  assert.equal(descs[2], 0); assert.equal(fretes[2], 0);
  assert.equal(m.vNF, N.r2(vProd - 10 + 25.5));
  assert.equal(pega(m.xml, 'modFrete'), '0', 'com frete: por conta do emitente');
  // total do XML bate com os itens
  const tot = m.xml.slice(m.xml.indexOf('<ICMSTot>'));
  assert.equal(pega(tot, 'vDesc'), '10.00'); assert.equal(pega(tot, 'vFrete'), '25.50'); assert.equal(pega(tot, 'vNF'), m.vNF.toFixed(2));
  // caso chato de arredondamento: 3 itens iguais e desconto de 1 centavo a mais
  const r = N.ratear(0.1, [{ vProd: 10 }, { vProd: 10 }, { vProd: 10 }]);
  assert.deepEqual(r, [0.03, 0.03, 0.04]);
  assert.deepEqual(N.ratear(5, [{ vProd: 0 }, { vProd: 0 }]), [0, 0]);
});

await t('homologação: nome do cliente e do 1º item viram o texto da SEFAZ', () => {
  const h = N.montarXml(notaBase(), EMIT).xml;
  assert.equal(pega(h.slice(h.indexOf('<dest>')), 'xNome'), N.HOMOLOG_DEST);
  assert.deepEqual(todos(h, 'xProd').slice(0, 2), [N.HOMOLOG_ITEM, 'Pulseira extra rosa']);
  assert.equal(pega(h, 'tpAmb'), '2');
  const p = N.montarXml(notaBase({ ambiente: 1 }), EMIT).xml;
  assert.equal(pega(p.slice(p.indexOf('<dest>')), 'xNome'), 'Cliente de Teste');
});

await t('trava de NCM: não passa e diz qual produto está sem', () => {
  const itens = [...ITENS, { nome: 'Carregador magnético', ncm: '', qtd: 1, valor: 20 }, { nome: 'Capa', ncm: '1234', qtd: 1, valor: 5 }];
  const e = N.conferir({ dest: DEST_RJ, itens });
  assert.ok(e.some((x: string) => x.includes('produto sem NCM: Carregador magnético, Capa')), e.join(' / '));
  assert.deepEqual(N.itensSemNcm(itens), ['Carregador magnético', 'Capa']);
  assert.deepEqual(N.conferir({ dest: DEST_RJ, itens: ITENS }), []);
  assert.ok(N.conferir({ dest: { ...DEST_RJ, doc: '11111111111' }, itens: ITENS }).includes('CPF/CNPJ do cliente inválido'));
  assert.ok(N.conferir({ dest: DEST_RJ, itens: [ITENS[2]] }).some((x: string) => x.includes('brinde sozinho')));
});

await t('assinatura: confere (digest + RSA) e quebra se mexer em 1 caractere', () => {
  const p = N.preparar(notaBase(), EMIT, cert);
  assert.deepEqual(N.verificarAssinatura(p.assinado), { digestOk: true, assinaturaOk: true, ok: true });
  assert.equal(N.verificarAssinatura(p.assinado.replace('<vNF>', '<vNF>1')).digestOk, false);
  assert.ok(p.assinado.indexOf('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">') > p.assinado.indexOf('</infNFe>'));
  assert.ok(p.assinado.includes('<Reference URI="#NFe' + p.chave + '">'));
});

const amostras = () => {
  const prod = N.preparar(notaBase({ ambiente: 1 }), EMIT, cert);
  const homolog = N.preparar(notaBase({ desconto: 10, frete: 12.34 }), EMIT, cert);
  const fora = N.preparar(notaBase({ dest: DEST_SP, ambiente: 1, pagamento: { tPag: '17' } }), EMIT, cert);
  const ibs = N.preparar(notaBase({ ibscbs: true }), EMIT, cert);
  const cnpjDest = N.preparar(notaBase({ ambiente: 1, dest: { ...DEST_RJ, doc: '11.222.333/0001-81' }, pagamento: { tPag: '99' } }), EMIT, cert);
  const umItem = N.preparar(notaBase({ ambiente: 1, itens: [ITENS[0]], desconto: 0 }), EMIT, cert);
  // dados fiscais do cadastro de Produtos: GTIN de verdade, origem 2 e unidade "Un"
  const gtin = N.preparar(notaBase({ ambiente: 1, itens: [{ ...ITENS[0], gtin: '7891000315507', orig: 2, unidade: 'Un' }, ITENS[2]], desconto: 0 }), EMIT, cert);
  return { prod, homolog, fora, ibs, cnpjDest, umItem, gtin };
};

await t('schemas oficiais NF-e 4.00 (PL_010 v1.30) + assinatura conferida pelo .NET (SignedXml)', () => {
  if (!temPS) { console.log('  (PowerShell não encontrado: validação de schema pulada)'); return; }
  const a = amostras();
  const xmls = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.assinado]));
  const out = validar('nfe_v4.00.xsd', xmls, true);
  for (const nome of Object.keys(xmls)) {
    assert.ok(out.some((l) => l.startsWith('OK ') && l.endsWith(`${nome}.xml`)), `schema ${nome}: ${out.filter((l) => l.includes(`${nome}.xml`)).join('\n')}`);
    assert.ok(out.some((l) => l === `ASSINATURA OK ${path.join(TMP, `${nome}.xml`)}`), `assinatura ${nome}: ${out.join('\n')}`);
  }
  // o lote de envio, a consulta, o status e o nfeProc (com um protNFe de exemplo) também passam nos schemas deles
  const lote = `<enviNFe xmlns="${N.NS}" versao="4.00"><idLote>123456789012345</idLote><indSinc>1</indSinc>${a.homolog.assinado}</enviNFe>`;
  assert.match(validar('enviNFe_v4.00.xsd', { lote })[0], /^OK /);
  const prot = `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SVRS202611</verAplic><chNFe>${a.homolog.chave}</chNFe><dhRecbto>2026-11-13T12:04:06-03:00</dhRecbto><nProt>333260000000001</nProt><digVal>${'A'.repeat(27)}=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`;
  assert.match(validar('procNFe_v4.00.xsd', { proc: N.fecharProc(a.homolog.assinado, prot) })[0], /^OK /);
  assert.match(validar('consStatServ_v4.00.xsd', { st: `<consStatServ xmlns="${N.NS}" versao="4.00"><tpAmb>2</tpAmb><cUF>33</cUF><xServ>STATUS</xServ></consStatServ>` })[0], /^OK /);
  assert.match(validar('consSitNFe_v4.00.xsd', { cs: `<consSitNFe xmlns="${N.NS}" versao="4.00"><tpAmb>2</tpAmb><xServ>CONSULTAR</xServ><chNFe>${a.homolog.chave}</chNFe></consSitNFe>` })[0], /^OK /);
  // e o validador pega erro de verdade (não aceita qualquer coisa)
  const ruim = validar('nfe_v4.00.xsd', { ruim: a.prod.assinado.replace('<indPres>2</indPres>', '<indPres>X</indPres>') });
  assert.match(ruim[0], /^ERRO /);
  assert.match(validar('nfe_v4.00.xsd', { ruimIbs: a.ibs.assinado.replace('<cClassTrib>000001</cClassTrib>', '') })[0], /^ERRO .*cClassTrib|^ERRO .*gIBSCBS/);
  const adulterada = validar('nfe_v4.00.xsd', { adulterada: a.prod.assinado.replace('<vNF>', '<vNF>1') }, true);
  assert.ok(adulterada.some((l) => l.startsWith('ASSINATURA ERRO')), adulterada.join('\n'));
});

await t('DANFE: código de barras Code 128C da chave (start C, 22 pares, verificador, stop)', () => {
  const chave = N.montarXml(notaBase(), EMIT).chave;
  const b = code128c(chave);
  const mods = b.split('').reduce((a: number, c: string) => a + Number(c), 0);
  assert.equal(mods, 11 * 24 + 13);
  assert.ok(b.startsWith('211232'), 'start C');
  assert.ok(b.endsWith('2331112'), 'stop');
  // verificador = (105 + soma(par × posição)) mod 103, conferido em exemplos feitos à mão:
  // "00" → [105, 0] → 105 mod 103 = 2;  "11" → [105, 11] → 116 mod 103 = 13
  assert.equal(code128c('00'), '211232' + '212222' + '222221' + '2331112');
  assert.equal(code128c('11'), '211232' + '231212' + '122132' + '2331112');
});

await t('mapa de web services: RJ → SVRS (produção e homologação)', () => {
  assert.equal(N.WS_UF.RJ, 'SVRS');
  assert.equal(N.urlServico('RJ', 2, 'autorizacao').url, 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx');
  assert.equal(N.urlServico('RJ', 1, 'autorizacao').url, 'https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx');
  assert.equal(N.urlServico('RJ', 2, 'retAutorizacao').url, 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx');
  assert.equal(N.urlServico('RJ', 2, 'consulta').url, 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx');
  assert.equal(N.urlServico('RJ', 2, 'status').url, 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx');
  assert.equal(N.urlServico('RJ', 1, 'evento').url, 'https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx');
  assert.equal(N.urlServico('RJ', 2, 'consulta').wsdl, 'NFeConsultaProtocolo4');
  assert.throws(() => N.urlServico('SP', 2, 'status'));
});


// ── fluxo com banco e SEFAZ falsos ──
// filtros do PostgREST que o fiscal.js usa: campo=eq.x e campo=in.(a,b)
function bancoFalso() {
  const st: any = { vendas: [] as any[], queries: [] as string[], config: { id: 1, ambiente: 2, serie: 2, proximo_producao: 1, proximo_homolog: 1, emitente: EMIT, natop: 'Venda de mercadorias de terceiros para consumidor final', ibpt_fed: 21.08, ibpt_est: 22, tpag: '90', info: N.FRASE_SIMPLES }, notas: [] as any[], rpcs: [] as string[] };
  const casa = (n: any, q: string) => q.split('&').every((p) => {
    const [k, v = ''] = p.split('=');
    if (v.startsWith('eq.')) return String(n[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(n[k]));
    if (v.startsWith('gte.')) return String(n[k] ?? '') >= decodeURIComponent(v.slice(4));
    if (v.startsWith('lt.')) return String(n[k] ?? '') < decodeURIComponent(v.slice(3));
    return true;
  });
  return {
    st,
    select: async (tab: string, q: string) => { st.queries.push(`${tab}?${q}`); return tab === 'nfe_config' ? [st.config] : tab === 'sales' ? st.vendas.filter((n: any) => casa(n, q)) : st.notas.filter((n: any) => casa(n, q)); },
    insert: async (_tab: string, row: any) => {
      const ativa = (n: any) => ['emitindo', 'pendente', 'autorizada'].includes(n.status);
      if (row.venda_id && st.notas.some((n: any) => n.venda_id === row.venda_id && n.ambiente === row.ambiente && ativa(n))) { const e: any = new Error('duplicate key'); e.code = '23505'; throw e; }
      const n = { id: `aaaaaaa${st.notas.length}-0000-4000-8000-000000000000`, criado_em: new Date().toISOString(), ...row };
      st.notas.push(n); return n;
    },
    patch: async (tab: string, f: string, d: any) => { if (tab === 'nfe_config') { Object.assign(st.config, d); return; } Object.assign(st.notas.find((n: any) => `id=eq.${n.id}` === f), d); },
    rpc: async (fn: string, a: any) => {
      st.rpcs.push(fn);
      const campo = a?.p_ambiente === 1 ? 'proximo_producao' : 'proximo_homolog';
      if (fn === 'nfe_reservar') return st.config[campo]++;
      if (fn === 'nfe_devolver') { if (st.config[campo] === a.p_numero + 1) { st.config[campo] = a.p_numero; return true; } return false; }
      return null;
    },
  };
}
const resposta = (corpo: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${corpo}</nfeResultMsg></soap:Body></soap:Envelope>`;
const protXml = (chave: string, cStat: string, motivo: string) => `<protNFe versao="4.00" xmlns="${N.NS}"><infProt Id="ID333260000000123"><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><chNFe>${chave}</chNFe><dhRecbto>2026-11-13T12:00:00-03:00</dhRecbto>${cStat === '100' ? '<nProt>333260000000123</nProt><digVal>abc=</digVal>' : ''}<cStat>${cStat}</cStat><xMotivo>${motivo}</xMotivo></infProt></protNFe>`;
const chaveDo = (env: string) => (env.match(/Id="NFe(\d{44})"/) || [])[1];
const retEnvi = (env: string, cStat: string, motivo: string) => resposta(`<retEnviNFe versao="4.00" xmlns="${N.NS}"><tpAmb>2</tpAmb><cStat>104</cStat><xMotivo>Lote processado</xMotivo>${protXml(chaveDo(env), cStat, motivo)}</retEnviNFe>`);
const VENDA = '11111111-2222-4333-8444-555555555555';
const pedido = (o: Record<string, unknown> = {}) => ({ op: 'emitir', venda_id: VENDA, dest: DEST_RJ, itens: ITENS, desconto: 10, frete: 0, ...o });
const contexto = (db: any, transporte: (a: any) => Promise<string>) => ({ db, cert: () => cert, soapOpts: { transporte, esperaMs: 0 } });

await t('emitir: autorizada guarda o nfeProc; o XML assinado já estava salvo antes do envio', async () => {
  const db = bancoFalso();
  let xmlAntes = '';
  const r: any = await F.emitir(contexto(db, async ({ env, url }) => { assert.match(url, /nfe-homologacao\.svrs/); xmlAntes = db.st.notas[0].xml; return retEnvi(env, '100', 'Autorizado o uso da NF-e'); }), pedido());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.numero, 1); assert.equal(r.serie, 2); assert.equal(r.ambiente, 2);
  assert.ok(xmlAntes.includes('<Signature'), 'XML assinado salvo antes de enviar');
  const n = db.st.notas[0];
  assert.equal(n.status, 'autorizada'); assert.equal(n.protocolo, '333260000000123'); assert.equal(n.venda_id, VENDA);
  assert.ok(n.xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${N.NS}" versao="4.00"><NFe`));
  assert.ok(n.xml.includes('<protNFe versao="4.00"><infProt'));
  // mesma venda de novo no mesmo ambiente: bloqueada, sem gastar número
  const de2: any = await F.emitir(contexto(db, async () => { throw new Error('não devia enviar'); }), pedido());
  assert.match(de2.erro, /já tem a nota nº 1 autorizada/);
  assert.equal(db.st.config.proximo_homolog, 2);
});

await t('emitir: rejeitada mostra código e motivo e devolve o número', async () => {
  const db = bancoFalso();
  const r: any = await F.emitir(contexto(db, async ({ env }) => retEnvi(env, '778', 'Rejeição: Informado NCM inexistente')), pedido());
  assert.equal(r.rejeitada, true); assert.equal(r.cstat, '778');
  assert.equal(r.erro, 'SEFAZ rejeitou (778): Rejeição: Informado NCM inexistente');
  assert.ok(r.dica);
  assert.equal(db.st.notas[0].status, 'rejeitada');
  assert.equal(db.st.config.proximo_homolog, 1, 'número devolvido');
  // rejeitada não trava a venda: pode emitir de novo (e pega o mesmo número)
  const r2: any = await F.emitir(contexto(db, async ({ env }) => retEnvi(env, '100', 'Autorizado o uso da NF-e')), pedido());
  assert.equal(r2.ok, true); assert.equal(r2.numero, 1);
});

await t('emitir: sem resposta = pendente (número preso) e "Consultar SEFAZ" fecha a nota', async () => {
  const db = bancoFalso();
  const r: any = await F.emitir(contexto(db, async () => { throw new Error('a SEFAZ não respondeu a tempo'); }), pedido());
  assert.equal(r.pendente, true); assert.match(r.erro, /pendente/);
  const n = db.st.notas[0];
  assert.equal(n.status, 'pendente'); assert.equal(db.st.config.proximo_homolog, 2, 'número continua reservado');
  // venda pendente bloqueia nova emissão
  assert.match((await F.emitir(contexto(db, async () => ''), pedido()) as any).erro, /pendente/);
  // consulta: autorizada → nfeProc com o XML guardado
  const c: any = await F.consultar(contexto(db, async ({ servico, env }) => {
    assert.equal(servico, 'consulta'); assert.ok(env.includes(`<chNFe>${n.chave}</chNFe>`));
    return resposta(`<retConsSitNFe versao="4.00" xmlns="${N.NS}"><tpAmb>2</tpAmb><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>${protXml(n.chave, '100', 'Autorizado o uso da NF-e')}</retConsSitNFe>`);
  }), n.id);
  assert.equal(c.status, 'autorizada');
  assert.equal(n.status, 'autorizada'); assert.ok(n.xml.includes('<nfeProc'));
  assert.ok(N.verificarAssinatura(n.xml).ok);
});

await t('consultar: 217 (não consta na SEFAZ) vira rejeitada e devolve o número', async () => {
  const db = bancoFalso();
  await F.emitir(contexto(db, async () => { throw new Error('ECONNRESET'); }), pedido());
  const c: any = await F.consultar(contexto(db, async () => resposta(`<retConsSitNFe versao="4.00" xmlns="${N.NS}"><tpAmb>2</tpAmb><cStat>217</cStat><xMotivo>Rejeição: NF-e não consta na base de dados da SEFAZ</xMotivo></retConsSitNFe>`)), db.st.notas[0].id);
  assert.equal(c.status, 'rejeitada'); assert.equal(db.st.config.proximo_homolog, 1);
});

await t('emitir: lote assíncrono (103) busca o resultado no NFeRetAutorizacao4', async () => {
  const db = bancoFalso();
  let chave = '';
  const r: any = await F.emitir(contexto(db, async ({ servico, env }) => {
    if (servico === 'autorizacao') { chave = chaveDo(env); return resposta(`<retEnviNFe versao="4.00" xmlns="${N.NS}"><cStat>103</cStat><xMotivo>Lote recebido com sucesso</xMotivo><infRec><nRec>331000000000001</nRec><tMed>1</tMed></infRec></retEnviNFe>`); }
    assert.equal(servico, 'retAutorizacao'); assert.ok(env.includes('<nRec>331000000000001</nRec>'));
    return resposta(`<retConsReciNFe versao="4.00" xmlns="${N.NS}"><cStat>104</cStat><xMotivo>Lote processado</xMotivo>${protXml(chave, '100', 'Autorizado o uso da NF-e')}</retConsReciNFe>`);
  }), pedido());
  assert.equal(r.ok, true, JSON.stringify(r));
});

await t('emitir: 1115 em homologação reenvia com o grupo IBS/CBS (mesma chave); sem 1115 não manda o grupo', async () => {
  const db = bancoFalso();
  const envios: string[] = [];
  const r: any = await F.emitir(contexto(db, async ({ env }) => { envios.push(env); return envios.length === 1 ? retEnvi(env, '1115', 'Rejeição: grupo IBS/CBS obrigatório') : retEnvi(env, '100', 'Autorizado o uso da NF-e'); }), pedido());
  assert.equal(r.ok, true); assert.equal(r.ibscbs, true);
  assert.equal(envios.length, 2);
  assert.ok(!envios[0].includes('<IBSCBS>')); assert.ok(envios[1].includes('<IBSCBS>'));
  assert.equal(chaveDo(envios[0]), chaveDo(envios[1]));
});

await t('emitir: trava de NCM antes de gastar número; produção bloqueada sem a chave no banco; CNPJ tem que ser o do certificado', async () => {
  const db = bancoFalso();
  const semNcm: any = await F.emitir(contexto(db, async () => { throw new Error('não devia enviar'); }), pedido({ itens: [...ITENS, { nome: 'Carregador magnético', ncm: '', qtd: 1, valor: 20 }] }));
  assert.match(semNcm.erro, /produto sem NCM: Carregador magnético/);
  assert.deepEqual(semNcm.sem_ncm, ['Carregador magnético']);
  assert.deepEqual(db.st.rpcs, [], 'nenhum número reservado');
  assert.match((await F.emitir(contexto(db, async () => ''), pedido({ ambiente: 1 })) as any).erro, /notas reais \(produção\) não liberadas/);
  const outro = N.lerCertificado(certificadoFalso('11222333000181').b64, 'senha-teste');
  assert.match((await F.emitir({ db, cert: () => outro }, pedido()) as any).erro, /não é o mesmo do certificado/);
  assert.deepEqual(db.st.rpcs, []);
});

await t('rota /api/nfe: sem login = 401; com JWT válido no Supabase Auth responde', async () => {
  const handler = criarHandler({ url: 'https://exemplo.supabase.co', key: 'chave-servidor', db: bancoFalso(), cert: () => cert, fetchFn: (async (u: string, init: any) => {
    assert.equal(u, 'https://exemplo.supabase.co/auth/v1/user');
    const ok = init.headers.Authorization === 'Bearer aaa.bbb.ccc';
    return { ok, json: async () => (ok ? { id: 'u1' } : {}) };
  }) as any });
  const chamar = async (headers: Record<string, string>) => {
    const res: any = { code: 0, body: null, headers: {}, setHeader(k: string, v: string) { this.headers[k] = v; }, status(c: number) { this.code = c; return this; }, json(b: unknown) { this.body = b; return this; } };
    await handler({ method: 'GET', headers, query: { op: 'painel' } } as any, res);
    return res;
  };
  assert.equal((await chamar({})).code, 401);
  assert.equal((await chamar({ authorization: 'Bearer token-invalido' })).code, 401);
  assert.equal((await chamar({ authorization: 'Bearer xxx.yyy.zzz' })).code, 401);
  const ok = await chamar({ authorization: 'Bearer aaa.bbb.ccc' });
  assert.equal(ok.code, 200); assert.equal(ok.body.cert.cnpj, '49923481000104'); assert.deepEqual(ok.body.ambientes, [2]);
});

// ── FASE 2: cancelamento (evento 110111), trava de produção, Tiny, contador ──
const retEvento = (chave: string, cStat: string, motivo: string, amb = 2) => resposta(`<retEnvEvento xmlns="${N.NS}" versao="1.00"><idLote>1</idLote><tpAmb>${amb}</tpAmb><verAplic>SVRS202611</verAplic><cOrgao>33</cOrgao><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo><retEvento versao="1.00"><infEvento><tpAmb>${amb}</tpAmb><verAplic>SVRS202611</verAplic><cOrgao>33</cOrgao><cStat>${cStat}</cStat><xMotivo>${motivo}</xMotivo><chNFe>${chave}</chNFe><tpEvento>110111</tpEvento><xEvento>Cancelamento registrado</xEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>2026-11-13T13:00:00-03:00</dhRegEvento>${cStat === '135' ? '<nProt>333260000000456</nProt>' : ''}</infEvento></retEvento></retEnvEvento>`);
// emite (SEFAZ falsa autoriza) e devolve a nota guardada no banco falso
async function notaAutorizada(db: any, o: Record<string, unknown> = {}) {
  const r: any = await F.emitir(contexto(db, async ({ env }) => retEnvi(env, '100', 'Autorizado o uso da NF-e')), pedido(o));
  assert.equal(r.ok, true, JSON.stringify(r));
  return db.st.notas.find((n: any) => n.id === r.id);
}
const JUST = 'Venda desfeita a pedido do cliente';
const depoisDe = (n: any, ms: number) => () => new Date(new Date(n.autorizada_em).getTime() + ms);

await t('evento de cancelamento: schema oficial (envEventoCancNFe v1.00) e assinatura conferida pelo .NET', () => {
  const chave = N.montarXml(notaBase(), EMIT).chave;
  const { id, evento } = N.eventoCancelamento({ chave, protocolo: '333260000000123', justificativa: '  Venda   desfeita & cliente <desistiu> ', ambiente: 2, cnpj: EMIT.cnpj, uf: 'RJ', data: new Date('2026-11-13T15:30:00Z') }, cert);
  assert.equal(id, `ID110111${chave}01`);
  assert.equal(pega(evento, 'cOrgao'), '33'); assert.equal(pega(evento, 'tpAmb'), '2'); assert.equal(pega(evento, 'tpEvento'), '110111');
  assert.equal(pega(evento, 'dhEvento'), '2026-11-13T12:30:00-03:00');
  assert.equal(pega(evento, 'xJust'), 'Venda desfeita &amp; cliente &lt;desistiu&gt;');
  assert.ok(N.verificarAssinatura(evento, 'infEvento').ok, 'assinatura do infEvento');
  assert.throws(() => N.eventoCancelamento({ chave, protocolo: '333260000000123', justificativa: 'curta demais', ambiente: 2, cnpj: EMIT.cnpj }, cert), /15 letras/);
  if (!temPS) { console.log('  (PowerShell não encontrado: validação de schema pulada)'); return; }
  const env = `<?xml version="1.0" encoding="UTF-8"?><envEvento xmlns="${N.NS}" versao="1.00"><idLote>1</idLote>${evento}</envEvento>`;
  const proc = N.fecharProcEvento(evento, N.bloco(retEvento(chave, '135', 'Evento registrado e vinculado a NF-e'), 'retEvento'));
  const s1 = validar('envEventoCancNFe_v1.00.xsd', { envEvento: env }, true);
  assert.ok(s1.every((l) => l.startsWith('OK') || l.startsWith('ASSINATURA OK')), s1.join('\n'));
  const s2 = validar('procEventoCancNFe_v1.00.xsd', { procEvento: proc });
  assert.ok(s2.every((l) => l.startsWith('OK')), s2.join('\n'));
});

await t('cancelar: SEFAZ simulada registra (135) → nota cancelada, procEventoNFe guardado, DANFE/XML continuam e XML do cancelamento sai', async () => {
  const db = bancoFalso();
  const n = await notaAutorizada(db);
  let chamada: any = null;
  const ctx = { ...contexto(db, async (a: any) => { chamada = a; return retEvento(n.chave, '135', 'Evento registrado e vinculado a NF-e'); }), agora: depoisDe(n, 3600e3) };
  assert.match((await F.cancelar(ctx, n.id, 'curta') as any).erro, /15 letras/);
  assert.equal(chamada, null, 'justificativa curta nem vai para a SEFAZ');
  const r: any = await F.cancelar(ctx, n.id, JUST);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(chamada.url, /^https:\/\/nfe-homologacao\.svrs\.rs\.gov\.br\/ws\/recepcaoevento\/recepcaoevento4\.asmx$/);
  assert.equal(chamada.metodo, 'nfeRecepcaoEvento');
  assert.match(chamada.env, new RegExp(`<chNFe>${n.chave}</chNFe>`));
  assert.match(chamada.env, /<nProt>333260000000123<\/nProt>/);
  assert.equal(n.status, 'cancelada');
  assert.ok(n.dados.cancelamento.xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="${N.NS}" versao="1.00"><evento`));
  assert.equal(n.dados.cancelamento.protocolo, '333260000000456');
  assert.equal(n.dados.cancelamento.justificativa, JUST);
  assert.ok(n.dados.dest, 'os dados da nota continuam');
  const x: any = await F.xml(ctx, n.id);
  assert.ok(x.xml.includes('<nfeProc'), 'XML da nota continua'); assert.equal(x.status, 'cancelada'); assert.equal(x.tem_cancelamento, true);
  const xc: any = await F.xml(ctx, n.id, 'cancelamento');
  assert.ok(xc.xml.includes('<procEventoNFe'));
  assert.match((await F.cancelar(ctx, n.id, JUST) as any).erro, /já está cancelada/);
  // depois de cancelada, a venda pode ter outra nota
  const outra: any = await F.emitir(contexto(db, async ({ env }) => retEnvi(env, '100', 'Autorizado')), pedido());
  assert.equal(outra.ok, true, JSON.stringify(outra));
});

await t('cancelar: SEFAZ recusa (501) ou não responde → a nota continua autorizada', async () => {
  const db = bancoFalso();
  const n = await notaAutorizada(db);
  const rec: any = await F.cancelar({ ...contexto(db, async () => retEvento(n.chave, '501', 'Rejeicao: Prazo de cancelamento superior ao previsto na Legislacao')), agora: depoisDe(n, 60e3) }, n.id, JUST);
  assert.match(rec.erro, /SEFAZ não cancelou \(501\)/); assert.match(rec.dica, /prazo/);
  assert.equal(n.status, 'autorizada'); assert.equal(n.dados.cancelamento, undefined);
  const caiu: any = await F.cancelar({ ...contexto(db, async () => { throw new Error('ECONNRESET'); }), agora: depoisDe(n, 60e3) }, n.id, JUST);
  assert.match(caiu.erro, /não respondeu .*continua autorizada/);
  assert.equal(n.status, 'autorizada');
});

await t('prazo de 24 h: 23h59 cancela; 24h01 bloqueia sem chamar a SEFAZ; só nota autorizada', async () => {
  const db = bancoFalso();
  const n = await notaAutorizada(db);
  let chamou = 0;
  const transp = async () => { chamou++; return retEvento(n.chave, '135', 'Evento registrado'); };
  const tarde: any = await F.cancelar({ ...contexto(db, transp), agora: depoisDe(n, 24 * 3600e3 + 60e3) }, n.id, JUST);
  assert.equal(tarde.prazo_vencido, true); assert.match(tarde.erro, /passou do prazo de 24 h/); assert.equal(chamou, 0);
  assert.equal(F.prazoCancelamento(n, new Date(new Date(n.autorizada_em).getTime() + 24 * 3600e3)).pode, false);
  const p = F.prazoCancelamento(n, new Date(new Date(n.autorizada_em).getTime() + 23 * 3600e3 + 59 * 60e3));
  assert.equal(p.pode, true); assert.equal(p.restanteMs, 60e3);
  assert.equal(F.prazoCancelamento({ status: 'pendente', autorizada_em: n.autorizada_em }).pode, false);
  assert.equal(F.prazoCancelamento({ status: 'autorizada', autorizada_em: null }).pode, false);
  const ok: any = await F.cancelar({ ...contexto(db, transp), agora: depoisDe(n, 23 * 3600e3 + 59 * 60e3) }, n.id, JUST);
  assert.equal(ok.ok, true); assert.equal(chamou, 1);
});

await t('trava de produção: o servidor lê a chave NO BANCO; ligada emite na produção com nome real e numeração de produção', async () => {
  const db = bancoFalso();
  const transp = async ({ env, url }: any) => { assert.match(url, /^https:\/\/nfe\.svrs\.rs\.gov\.br\//); return retEnvi(env, '100', 'Autorizado o uso da NF-e'); };
  // sem a coluna (migration não aplicada) e com a chave desligada: bloqueia, mesmo que a tela mande ambiente 1
  for (const cfg of [{}, { producao_liberada: false }, { producao_liberada: 'true' }]) {
    Object.assign(db.st.config, cfg);
    const r: any = await F.emitir(contexto(db, async () => { throw new Error('não devia enviar'); }), pedido({ ambiente: 1, producao_liberada: true }));
    assert.equal(r.producao_bloqueada, true, JSON.stringify(cfg));
  }
  assert.deepEqual(db.st.rpcs, [], 'nenhum número de produção gasto');
  // ligar: sem a migration avisa; sem confirmar não liga; número não volta para trás
  const semColuna = bancoFalso(); delete semColuna.st.config.producao_liberada;
  assert.match((await F.liberarProducao({ db: semColuna, cert: () => cert }, { ligar: true, confirmar: true }) as any).erro, /20261122120000_nfe_producao\.sql/);
  db.st.config.producao_liberada = false;
  assert.match((await F.liberarProducao({ db, cert: () => cert }, { ligar: true, proximo_producao: 1 }) as any).erro, /confirme/);
  assert.equal(db.st.config.producao_liberada, false);
  const lig: any = await F.liberarProducao({ db, cert: () => cert }, { ligar: true, confirmar: true, proximo_producao: '12' });
  assert.equal(lig.ok, true); assert.equal(db.st.config.producao_liberada, true); assert.equal(db.st.config.proximo_producao, 12);
  assert.deepEqual((await F.painel({ db, cert: () => cert }) as any).ambientes, [1, 2]);
  const r: any = await F.emitir(contexto(db, transp), pedido({ ambiente: 1 }));
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.numero, 12); assert.equal(r.ambiente, 1);
  const xml = db.st.notas.find((n: any) => n.id === r.id).xml;
  assert.equal(pega(xml, 'tpAmb'), '1');
  assert.equal(pega(xml.slice(xml.indexOf('<dest>')), 'xNome'), 'Cliente de Teste', 'produção vai com o nome real');
  assert.ok(!xml.includes('HOMOLOGACAO'));
  assert.equal(db.st.config.proximo_homolog, 1, 'numeração de teste não mexe');
  assert.match((await F.liberarProducao({ db, cert: () => cert }, { ligar: true, confirmar: true, proximo_producao: 5 }) as any).erro, /maior que 12/);
  // cancelamento usa o ambiente da própria nota (produção)
  const n = db.st.notas.find((x: any) => x.id === r.id);
  let url = '';
  const c: any = await F.cancelar({ ...contexto(db, async (a: any) => { url = a.url; return retEvento(n.chave, '135', 'Evento registrado', 1); }), agora: depoisDe(n, 1000) }, n.id, JUST);
  assert.equal(c.ok, true); assert.match(url, /^https:\/\/nfe\.svrs\.rs\.gov\.br\/ws\/recepcaoevento/);
  // desligar: volta a bloquear
  await F.liberarProducao({ db, cert: () => cert }, { ligar: false });
  assert.equal((await F.emitir(contexto(db, transp), pedido({ ambiente: 1 })) as any).producao_bloqueada, true);
});

await t('venda com nota do Tiny: produção exige confirmar; teste não', async () => {
  const db = bancoFalso();
  db.st.config.producao_liberada = true;
  db.st.vendas.push({ id: VENDA, nfe_status: 'emitida', nfe_chave: '33261149923481000104550010000001231000001234' });
  const transp = async ({ env }: any) => retEnvi(env, '100', 'Autorizado');
  const r: any = await F.emitir(contexto(db, transp), pedido({ ambiente: 1 }));
  assert.equal(r.tiny, true); assert.match(r.erro, /já tem nota emitida pelo Tiny/);
  assert.deepEqual(db.st.rpcs, []);
  assert.equal((await F.emitir(contexto(db, transp), pedido({ ambiente: 2 })) as any).ok, true);
  assert.equal((await F.emitir(contexto(db, transp), pedido({ ambiente: 1, confirmar_tiny: true })) as any).ok, true);
  assert.equal(F.temNotaTiny({ nfe_status: null, nfe_chave: '', nfe_url: null, nfe_id: null }), false);
});

await t('contador: XMLs do mês só de produção (autorizadas e canceladas), pela data de autorização no horário do RJ, em partes', async () => {
  const db = bancoFalso();
  assert.match((await F.xmlsDoMes({ db }, '2026-13') as any).erro, /mês inválido/);
  const r: any = await F.xmlsDoMes({ db }, '2026-11', 50);
  const q = db.st.queries.at(-1);
  assert.match(q, /ambiente=eq\.1&status=in\.\(autorizada,cancelada\)/);
  assert.match(q, /autorizada_em=gte\.2026-11-01T03:00:00\.000Z&autorizada_em=lt\.2026-12-01T03:00:00\.000Z/);
  assert.match(q, /xml_canc:dados->cancelamento->>xml/);
  assert.match(q, /limit=51&offset=50/);
  assert.equal(r.proximo, 100); assert.equal(r.mais, false);
  assert.match((await F.xmlsDoMes({ db }, '2026-12') as any).mes, /2026-12/);
  assert.match(db.st.queries.at(-1), /lt\.2027-01-01T03:00:00\.000Z/);
});

await t('lista da tela: filtro de ambiente e período por data de emissão, sem XML; data inválida recusa', async () => {
  const db = bancoFalso();
  await notaAutorizada(db);
  const r: any = await F.lista({ db }, { amb: '2', de: '2000-01-01T03:00:00Z', ate: '2999-01-01T03:00:00Z' });
  assert.equal(r.notas.length, 1); assert.equal(r.truncado, false);
  const q = db.st.queries.at(-1);
  assert.match(q, /ambiente=eq\.2/); assert.match(q, /criado_em=gte\./); assert.match(q, /criado_em=lt\./);
  assert.match(q, /uf:dados->dest->>uf,doc:dados->dest->>doc/);
  assert.doesNotMatch(q.split('&')[0], /(^|,)xml(,|$)/, 'lista não traz XML');
  await F.lista({ db }, { amb: 'todas' });
  assert.doesNotMatch(db.st.queries.at(-1), /ambiente=eq/);
  assert.match((await F.lista({ db }, { de: '2026-11-01; drop table' }) as any).erro, /data inicial inválida/);
  const s: any = await F.selos({ db });
  assert.equal(s.notas.length, 1);
});

// ── TLS com a SVRS: cadeia ICP-Brasil (sem desligar a verificação) ──
const RAIZ = path.join(AQUI, '..', '..');
await t('cadeia ICP-Brasil: pacote do ITI com a Raiz v10 e a AC SERPRO SSLv1 (quem assina *.svrs.rs.gov.br)', () => {
  const pem = readFileSync(path.join(RAIZ, 'api', '_lib', 'icp-brasil.pem'), 'utf8');
  const certs = N.lerCadeiaIcp(pem).map((b: string) => new X509Certificate(b));
  assert.ok(certs.length > 100, `só ${certs.length} certificados`);
  assert.ok(certs.every((c) => c.ca), 'todos têm que ser de AC');
  const cn = (c: X509Certificate) => (c.subject.match(/CN=([^\n]+)/) || [])[1];
  const raiz = certs.find((c) => cn(c) === 'Autoridade Certificadora Raiz Brasileira v10');
  const serpro = certs.find((c) => cn(c) === 'Autoridade Certificadora do SERPRO SSLv1');
  assert.ok(raiz && serpro, 'falta a Raiz v10 ou a AC SERPRO SSLv1');
  assert.ok(raiz.verify(raiz.publicKey), 'Raiz v10 é autoassinada');
  assert.ok(serpro.checkIssued(raiz) && serpro.verify(raiz.publicKey), 'AC SERPRO SSLv1 assinada pela Raiz v10');
  // o "ca" do TLS = raízes padrão do Node + ICP-Brasil (não substitui as do Node)
  const ca = N.caParaSefaz();
  assert.equal(ca.length, tls.rootCertificates.length + certs.length);
  assert.ok(tls.rootCertificates.every((r) => ca.includes(r)));
});
await t('TLS: soap passa o ca da ICP-Brasil, verificação nunca desligada, .pem vai junto na Vercel', () => {
  const fonte = readFileSync(path.join(RAIZ, 'api', '_lib', 'nfe.js'), 'utf8');
  assert.match(fonte, /https\.request\(\{[^}]*ca: caParaSefaz\(\)/);
  for (const f of ['api/_lib/nfe.js', 'api/_lib/fiscal.js', 'api/nfe.js']) {
    const s = readFileSync(path.join(RAIZ, f), 'utf8');
    assert.doesNotMatch(s, /rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/, f);
  }
  const vercel = JSON.parse(readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  assert.equal(vercel.functions['api/nfe.js'].includeFiles, 'api/_lib/icp-brasil.pem');
});

// ── brindes com NCM do cadastro de Acessórios ──
await t('brinde: NCM vem do acessório; sem NCM (ou brinde digitado à mão) continua travando e diz qual', () => {
  assert.equal(R.ncmDoBrinde({ quantity: 1, accessories: { name: 'Pulseira de silicone', ncm: '9113.90.00' } }), '91139000');
  assert.equal(R.ncmDoBrinde({ quantity: 1, accessories: [{ name: 'Fone', ncm: '85183000' }] }), '85183000');
  assert.equal(R.ncmDoBrinde({ quantity: 1, accessories: { name: 'Película' } }), ''); // antes da migration / sem NCM
  assert.equal(R.ncmDoBrinde({ quantity: 1, custom_name: 'Brinde avulso', accessories: null }), '');
  const itens = [{ nome: 'Relógio', ncm: '91021900' }, { nome: 'Pulseira', ncm: '91139000' }, { nome: 'Película', ncm: '' }];
  assert.deepEqual(R.itensSemNcm(itens), ['Película']);
  assert.deepEqual(N.itensSemNcm(itens), ['Película']); // a mesma trava no servidor
  assert.ok(N.conferir({ dest: DEST_RJ, itens: [...ITENS, { codigo: 'BRINDE1', nome: 'Película', ncm: '', qtd: 1, valor: 0 }] })
    .some((x: string) => /produto sem NCM: Película .*Acessórios/.test(x)));
});
await t('brinde (produto a R$ 0,00 em sale_items): NCM pelo nome se faltar no cadastro e cProd legível', () => {
  assert.equal(R.ncmPeloNome('Kit de Pulseiras'), '91139000');
  assert.equal(R.ncmPeloNome('Pulseira Trail Loop Cinza c/ Verde 45/49mm'), '91139000');
  assert.equal(R.ncmPeloNome('Fone Bluetooth i12'), '85183000');
  assert.equal(R.ncmPeloNome('Caixa de Som Gold 8W'), '', 'outros ficam vazios (e a nota trava dizendo qual)');
  assert.equal(R.ncmPeloNome('Microfone de lapela'), '', 'só a palavra "fone"');
  assert.equal(R.codigoLegivel('Fone Bluetooth', 'i12'), 'FONE-I12');
  assert.equal(R.codigoLegivel('Kit de', 'Pulseiras'), 'KIT-PULSEIRAS');
  assert.equal(R.codigoLegivel('Pulseira Aço Milanese Rose Gold 22mm'), 'PULSEIRA-ACO-MILANESE-ROSE-GOLD-22MM');
  assert.equal(R.codigoLegivel(''), 'BRINDE');
  assert.ok(R.codigoLegivel('x'.repeat(100)).length <= 60, 'cProd tem no máximo 60');
  // o cProd legível passa no XML montado (a montagem não muda)
  const x = N.montarXml(notaBase({ itens: [...ITENS, { codigo: R.codigoLegivel('Fone Bluetooth', 'i12'), nome: 'Fone Bluetooth i12', ncm: R.ncmPeloNome('Fone Bluetooth i12'), qtd: 1, valor: 0, brinde: true }] }), EMIT).xml;
  assert.ok(x.includes('<cProd>FONE-I12</cProd>')); assert.ok(x.includes('<NCM>85183000</NCM>'));
});
await t('tela e servidor concordam: prazo de 24 h e nota do Tiny', () => {
  const aut = '2026-11-13T15:00:00.000Z';
  for (const ms of [0, 60e3, 23 * 3600e3 + 59 * 60e3, 24 * 3600e3, 24 * 3600e3 + 1]) {
    const agora = new Date(Date.parse(aut) + ms);
    assert.deepEqual(R.prazoCancelamento({ status: 'autorizada', autorizada_em: aut }, agora), F.prazoCancelamento({ status: 'autorizada', autorizada_em: aut }, agora), String(ms));
  }
  for (const v of [{ nfe_status: 'emitida' }, { nfe_chave: '1' }, { nfe_url: 'x' }, { nfe_id: 5 }, {}, null]) assert.equal(R.temNotaTiny(v), F.temNotaTiny(v));
  assert.equal(R.restanteTexto(5 * 3600e3 + 7 * 60e3), '5 h 7 min');
});
await t('migration accessories.ncm: coluna nova e preenchimento só de pulseira e fone', () => {
  const sql = readFileSync(path.join(RAIZ, 'supabase', 'migrations', '20261121120000_acessorios_ncm.sql'), 'utf8');
  assert.match(sql, /alter table accessories add column if not exists ncm text;/);
  assert.match(sql, /set ncm = '91139000' where coalesce\(ncm, ''\) = '' and name ilike '%pulseira%'/);
  assert.match(sql, /set ncm = '85183000' where coalesce\(ncm, ''\) = '' and name ilike '%fone%'/);
  assert.equal((sql.match(/^update /gm) || []).length, 2, 'só pulseira e fone');
  assert.doesNotMatch(sql, /\b(drop|delete|truncate)\b/i);
});

// ── cliente fora do RJ ──
await t('fora do RJ: aviso amarelo e o botão só libera com "Conferi"; RJ não pede nada', () => {
  assert.equal(R.AVISO_FORA_RJ, 'Cliente de fora do RJ: a nota sai com CFOP 6102 (operação interestadual). Confira antes de emitir.');
  assert.equal(R.foraDoRj('RJ'), false); assert.equal(R.foraDoRj('rj'), false); assert.equal(R.foraDoRj(''), false);
  assert.equal(R.foraDoRj('SP'), true);
  assert.equal(R.podeEmitirUf('RJ', false), true);
  assert.equal(R.podeEmitirUf('SP', false), false);
  assert.equal(R.podeEmitirUf('SP', true), true);
});

await t('nenhum segredo no repositório: .env.example só com os nomes', () => {
  const ex = readFileSync(path.join(AQUI, '..', '..', '.env.example'), 'utf8');
  for (const k of ['NFE_CERT_B64', 'NFE_CERT_SENHA', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) assert.match(ex, new RegExp(`^${k}=\\s*$`, 'm'));
});

rmSync(TMP, { recursive: true, force: true });
console.log(`\n${passou} testes da NF-e passaram`);
