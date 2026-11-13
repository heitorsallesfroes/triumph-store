// NF-e própria (api/_lib/nfe.js + fiscal.js + api/nfe.js). Sem rede e sem banco: node scripts/tests/nfe.test.ts
// 1) certificado A1 de mentira gerado aqui (node-forge) → lerCertificado acha a chave, o CNPJ e a validade;
// 2) XML no gabarito do Tiny; dentro do RJ (5102/idDest 1) e fora (6102/idDest 2); homologação troca os nomes;
// 3) rateio de desconto e frete (centavos no último item, brinde fica com 0);
// 4) trava de NCM (não emite e diz qual produto); 5) assinatura: conferida aqui E pelo SignedXml do .NET;
// 6) schemas oficiais NF-e 4.00 (PL_010 v1.30, scripts/tests/fixtures/nfe-xsd) via PowerShell/.NET;
// 7) fluxo de emissão com banco e SEFAZ falsos: autorizada, rejeitada devolve o número, sem resposta = pendente,
//    1115 em homologação reenvia com IBS/CBS, venda repetida bloqueada, consulta fecha o nfeProc; 8) rota sem login = 401.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import * as N from '../../api/_lib/nfe.js';
import * as F from '../../api/_lib/fiscal.js';
import { criarHandler } from '../../api/nfe.js';
import { code128c } from '../../src/lib/danfe.ts';

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
  return { prod, homolog, fora, ibs, cnpjDest, umItem };
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
  const st: any = { config: { id: 1, ambiente: 2, serie: 2, proximo_producao: 1, proximo_homolog: 1, emitente: EMIT, natop: 'Venda de mercadorias de terceiros para consumidor final', ibpt_fed: 21.08, ibpt_est: 22, tpag: '90', info: N.FRASE_SIMPLES }, notas: [] as any[], rpcs: [] as string[] };
  const casa = (n: any, q: string) => q.split('&').every((p) => {
    const [k, v = ''] = p.split('=');
    if (v.startsWith('eq.')) return String(n[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(n[k]));
    return true;
  });
  return {
    st,
    select: async (tab: string, q: string) => (tab === 'nfe_config' ? [st.config] : st.notas.filter((n: any) => casa(n, q))),
    insert: async (_tab: string, row: any) => {
      const ativa = (n: any) => ['emitindo', 'pendente', 'autorizada'].includes(n.status);
      if (row.venda_id && st.notas.some((n: any) => n.venda_id === row.venda_id && n.ambiente === row.ambiente && ativa(n))) { const e: any = new Error('duplicate key'); e.code = '23505'; throw e; }
      const n = { id: `aaaaaaa${st.notas.length}-0000-4000-8000-000000000000`, ...row };
      st.notas.push(n); return n;
    },
    patch: async (tab: string, f: string, d: any) => { if (tab === 'nfe_config') { Object.assign(st.config, d); return; } Object.assign(st.notas.find((n: any) => `id=eq.${n.id}` === f), d); },
    rpc: async (fn: string, a: any) => {
      st.rpcs.push(fn);
      if (fn === 'nfe_reservar') return st.config.proximo_homolog++;
      if (fn === 'nfe_devolver') { if (st.config.proximo_homolog === a.p_numero + 1) { st.config.proximo_homolog = a.p_numero; return true; } return false; }
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

await t('emitir: trava de NCM antes de gastar número; produção bloqueada nesta fase; CNPJ tem que ser o do certificado', async () => {
  const db = bancoFalso();
  const semNcm: any = await F.emitir(contexto(db, async () => { throw new Error('não devia enviar'); }), pedido({ itens: [...ITENS, { nome: 'Carregador magnético', ncm: '', qtd: 1, valor: 20 }] }));
  assert.match(semNcm.erro, /produto sem NCM: Carregador magnético/);
  assert.deepEqual(semNcm.sem_ncm, ['Carregador magnético']);
  assert.deepEqual(db.st.rpcs, [], 'nenhum número reservado');
  assert.match((await F.emitir(contexto(db, async () => ''), pedido({ ambiente: 1 })) as any).erro, /produção ainda não liberada/);
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

await t('nenhum segredo no repositório: .env.example só com os nomes', () => {
  const ex = readFileSync(path.join(AQUI, '..', '..', '.env.example'), 'utf8');
  for (const k of ['NFE_CERT_B64', 'NFE_CERT_SENHA', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) assert.match(ex, new RegExp(`^${k}=\\s*$`, 'm'));
});

rmSync(TMP, { recursive: true, force: true });
console.log(`\n${passou} testes da NF-e passaram`);
