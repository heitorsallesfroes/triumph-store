// 🧾 Emissor próprio de NF-e (modelo 55) direto na SEFAZ — núcleo em Node puro (sem Tiny/Bling).
// Base: docs/emissor-nfe-guia.md, adaptado para o RJ (autorizador SVRS, fuso -03:00) e para o gabarito do Tiny
// (nota real autorizada em produção pela SVRS): CFOP 5102/6102, uCom "Pc", SEM GTIN, ICMSSN102 CSOSN 102,
// IPI cEnq 999 + IPINT CST 53, PISNT/COFINSNT CST 08, vTotTrib por item, modFrete 9 com vol 0.000, tPag 90 com vPag 0.
// O XML é montado JÁ na forma canônica (sem espaços, atributos em ordem, sem tag vazia) e assinado com XMLDSig
// (enveloped, C14N, RSA-SHA1) usando o certificado A1; o envio é SOAP 1.2 com o próprio certificado (TLS mútuo).
// Arquivos em api/_lib não viram função na Vercel (começam com "_").
import crypto from 'node:crypto';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import forge from 'node-forge';

export const NS = 'http://www.portalfiscal.inf.br/nfe';
const DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const WSDL = 'http://www.portalfiscal.inf.br/nfe/wsdl/';

// ── web services por autorizador (tabela de Web Services do Portal da NF-e, NF-e 4.00) ──
// [caminho no servidor, serviço do WSDL, método SOAP]
const SVRS_PATHS = {
  autorizacao: ['ws/NfeAutorizacao/NFeAutorizacao4.asmx', 'NFeAutorizacao4', 'nfeAutorizacaoLote'],
  retAutorizacao: ['ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx', 'NFeRetAutorizacao4', 'nfeRetAutorizacaoLote'],
  consulta: ['ws/NfeConsulta/NfeConsulta4.asmx', 'NFeConsultaProtocolo4', 'nfeConsultaNF'],
  status: ['ws/NfeStatusServico/NfeStatusServico4.asmx', 'NFeStatusServico4', 'nfeStatusServicoNF'],
  evento: ['ws/recepcaoevento/recepcaoevento4.asmx', 'NFeRecepcaoEvento4', 'nfeRecepcaoEvento'],
};
export const AUTORIZADORES = {
  SVRS: {
    1: { host: 'https://nfe.svrs.rs.gov.br/', servicos: SVRS_PATHS }, // produção
    2: { host: 'https://nfe-homologacao.svrs.rs.gov.br/', servicos: SVRS_PATHS }, // homologação
  },
};
// UF → autorizador (as UFs sem SEFAZ própria de NF-e usam a SVRS; o RJ é uma delas)
export const WS_UF = Object.fromEntries(['AC', 'AL', 'AP', 'DF', 'ES', 'PB', 'PI', 'RJ', 'RN', 'RO', 'RR', 'SC', 'SE', 'TO'].map((uf) => [uf, 'SVRS']));
export function urlServico(uf, amb, servico) {
  const aut = AUTORIZADORES[WS_UF[String(uf).toUpperCase()]];
  if (!aut) throw new Error(`UF ${uf} sem autorizador configurado no mapa de web services`);
  const a = aut[Number(amb) === 1 ? 1 : 2];
  const [caminho, wsdl, metodo] = a.servicos[servico];
  return { url: a.host + caminho, wsdl, metodo };
}

export const UF_COD = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };
const FUSO_UF = { RJ: -3 }; // RJ: -03:00 o ano todo (sem horário de verão)
export const HOMOLOG_DEST = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
export const HOMOLOG_ITEM = 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
export const FRASE_SIMPLES = 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.';
export const VER_PROC = 'TriumphERP-NFe 1.0';

// ── texto e números ──
// tira caracteres de controle e espaços duplos; escapa como o C14N escreve no conteúdo (& < >)
export const txt = (v, max = 60) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const dig = (v) => String(v ?? '').replace(/\D/g, '');
export const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const d2 = (v) => r2(v).toFixed(2);
const tag = (n, v) => (v === undefined || v === null || v === '' ? '' : `<${n}>${v}</${n}>`);
export const brl = (v) => r2(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── certificado A1 (.pfx em base64 + senha) ──
export function lerCertificado(pfxB64, senha) {
  const der = forge.util.decode64(String(pfxB64).replace(/\s+/g, ''));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), String(senha));
  const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  const plain = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
  const chaves = [...shrouded, ...plain];
  if (!chaves.length) throw new Error('o .pfx não tem chave privada');
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter(Boolean);
  const key = chaves[0].key;
  // o certificado da empresa é o que casa com a chave (os outros são da cadeia)
  const pub = forge.pki.publicKeyToPem(forge.pki.setRsaPublicKey(key.n, key.e));
  const cert = certs.find((c) => forge.pki.publicKeyToPem(c.publicKey) === pub) || certs[0];
  if (!cert) throw new Error('o .pfx não tem certificado');
  const nome = (cert.subject.getField('CN') || {}).value || '';
  // CNPJ: no CN ("RAZAO:00000000000000") ou no OID 2.16.76.1.3.3 do ICP-Brasil
  let cnpj = (nome.match(/:(\d{14})\b/) || [])[1] || '';
  if (!cnpj) {
    const alt = cert.getExtension('subjectAltName');
    const bruto = alt ? JSON.stringify(alt.altNames || []) : '';
    cnpj = (bruto.match(/\d{14}/) || [])[0] || '';
  }
  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(cert),
    certB64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
    cadeia: certs.filter((c) => c !== cert).map((c) => forge.pki.certificateToPem(c)).join(''),
    nome, cnpj, validade: cert.validity.notAfter, inicio: cert.validity.notBefore,
  };
}

// ── assinatura XMLDSig (o elemento já está na forma canônica) ──
// no C14N o elemento assinado leva o xmlns herdado do pai; os atributos já estão em ordem (Id antes de versao)
export function assinar(xml, elemento, id, cert) {
  const ini = xml.indexOf(`<${elemento} `);
  const fim = xml.indexOf(`</${elemento}>`) + elemento.length + 3;
  if (ini < 0 || fim < elemento.length + 3) throw new Error(`elemento ${elemento} não encontrado para assinar`);
  const canon = xml.slice(ini, fim).replace(`<${elemento} `, `<${elemento} xmlns="${NS}" `);
  const digest = crypto.createHash('sha1').update(canon, 'utf8').digest('base64');
  const signedInfo = `<SignedInfo xmlns="${DSIG}"><CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod><SignatureMethod Algorithm="${DSIG}rsa-sha1"></SignatureMethod><Reference URI="#${id}"><Transforms><Transform Algorithm="${DSIG}enveloped-signature"></Transform><Transform Algorithm="${C14N}"></Transform></Transforms><DigestMethod Algorithm="${DSIG}sha1"></DigestMethod><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const valor = crypto.createSign('RSA-SHA1').update(signedInfo, 'utf8').sign(cert.keyPem, 'base64');
  const assinatura = `<Signature xmlns="${DSIG}">${signedInfo.replace(` xmlns="${DSIG}"`, '')}<SignatureValue>${valor}</SignatureValue><KeyInfo><X509Data><X509Certificate>${cert.certB64}</X509Certificate></X509Data></KeyInfo></Signature>`;
  return xml.slice(0, fim) + assinatura + xml.slice(fim);
}

// confere a assinatura feita por assinar() (digest do infNFe + RSA do SignedInfo com o certificado do KeyInfo)
export function verificarAssinatura(xml, elemento = 'infNFe') {
  const ini = xml.indexOf(`<${elemento} `);
  const fim = xml.indexOf(`</${elemento}>`) + elemento.length + 3;
  const canon = xml.slice(ini, fim).replace(`<${elemento} `, `<${elemento} xmlns="${NS}" `);
  const sig = xml.slice(xml.indexOf('<Signature '), xml.indexOf('</Signature>') + 12);
  const si = sig.slice(sig.indexOf('<SignedInfo>'), sig.indexOf('</SignedInfo>') + 13).replace('<SignedInfo>', `<SignedInfo xmlns="${DSIG}">`);
  const digest = (sig.match(/<DigestValue>([^<]+)<\/DigestValue>/) || [])[1];
  const valor = (sig.match(/<SignatureValue>([^<]+)<\/SignatureValue>/) || [])[1];
  const certB64 = (sig.match(/<X509Certificate>([^<]+)<\/X509Certificate>/) || [])[1];
  const digestOk = crypto.createHash('sha1').update(canon, 'utf8').digest('base64') === digest;
  const pem = `-----BEGIN CERTIFICATE-----\n${certB64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  const assinaturaOk = crypto.createVerify('RSA-SHA1').update(si, 'utf8').verify(pem, valor, 'base64');
  return { digestOk, assinaturaOk, ok: digestOk && assinaturaOk };
}

// ── chave de acesso ──
export function dvChave(c43) {
  let soma = 0, peso = 2;
  for (let i = c43.length - 1; i >= 0; i--) { soma += Number(c43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}
export function montarChave({ uf, aamm, cnpj, serie, numero, cNF, tpEmis = 1 }) {
  const c43 = `${UF_COD[uf]}${aamm}${dig(cnpj).padStart(14, '0')}55${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}${tpEmis}${cNF}`;
  return c43 + dvChave(c43);
}
// cNF: 8 dígitos aleatórios, diferente do número da nota
export function novoCNF(numero) {
  let c;
  do { c = String(crypto.randomInt(10000000, 99999999)); } while (c === String(numero).padStart(8, '0'));
  return c;
}

// data/hora com fuso
export function dhLocal(d = new Date(), fuso = -3) {
  const l = new Date(d.getTime() + fuso * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${l.getUTCFullYear()}-${p(l.getUTCMonth() + 1)}-${p(l.getUTCDate())}T${p(l.getUTCHours())}:${p(l.getUTCMinutes())}:${p(l.getUTCSeconds())}${fuso < 0 ? '-' : '+'}${p(Math.abs(fuso))}:00`;
}

// ── conferência antes de montar (mensagens em português para a tela) ──
export function cpfValido(c) {
  c = dig(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
export function cnpjValido(c) {
  c = dig(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = p.reduce((a, w, i) => a + Number(c[i]) * w, 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
// itens sem NCM: devolve os nomes dos produtos (a nota não sai enquanto houver algum)
export const itensSemNcm = (itens) => (itens || []).filter((i) => !/^\d{8}$/.test(dig(i.ncm))).map((i) => String(i.nome || i.codigo || 'item sem nome').trim());
export function conferir(nota) {
  const e = [];
  const d = nota.dest || {};
  const doc = dig(d.doc);
  if (!(doc.length === 11 ? cpfValido(doc) : doc.length === 14 ? cnpjValido(doc) : false)) e.push('CPF/CNPJ do cliente inválido');
  if (String(d.nome || '').trim().length < 2) e.push('nome do cliente');
  if (!String(d.endereco || '').trim()) e.push('endereço (rua) do cliente');
  if (!String(d.bairro || '').trim()) e.push('bairro do cliente');
  if (dig(d.cep).length !== 8) e.push('CEP do cliente');
  if (!/^\d{7}$/.test(dig(d.cod_municipio))) e.push('código IBGE do município do cliente (confira o CEP)');
  if (!String(d.municipio || '').trim()) e.push('cidade do cliente');
  if (!UF_COD[String(d.uf || '').toUpperCase()]) e.push('UF do cliente');
  const itens = nota.itens || [];
  if (!itens.length) e.push('a nota precisa de pelo menos 1 item');
  if (itens.length && !itens.some((i) => Number(i.valor) > 0)) e.push('pelo menos 1 item precisa ter valor (brinde sozinho não vira nota)');
  itens.forEach((i, k) => {
    if (!String(i.nome || '').trim()) e.push(`nome do item ${k + 1}`);
    if (!(Number(i.qtd) > 0)) e.push(`quantidade do item ${k + 1} (${i.nome || ''})`);
    if (!(Number(i.valor) >= 0)) e.push(`valor do item ${k + 1} (${i.nome || ''})`);
  });
  const semNcm = itensSemNcm(itens);
  if (semNcm.length) e.push(`produto sem NCM: ${semNcm.join(', ')} (cadastre o NCM em Produtos ou, se for brinde, em Acessórios)`);
  return e;
}

// ── rateio proporcional ao valor de cada item; os centavos que sobram vão no último item com valor ──
export function ratear(total, itens) {
  const t = r2(total);
  const base = r2(itens.reduce((a, i) => a + i.vProd, 0));
  const out = itens.map(() => 0);
  if (!(t > 0) || !(base > 0)) return out;
  const ultimo = itens.reduce((u, i, k) => (i.vProd > 0 ? k : u), -1);
  let resto = t;
  itens.forEach((i, k) => {
    if (!(i.vProd > 0)) return;
    const v = k === ultimo ? r2(resto) : r2((t * i.vProd) / base);
    out[k] = v; resto = r2(resto - v);
  });
  return out;
}

// ── XML da NF-e ──
// nota: { ambiente, serie, numero, data(Date), cNF, natOp, dest:{doc,nome,email,fone,endereco,numero,complemento,bairro,cep,cod_municipio,municipio,uf},
//         itens:[{codigo,nome,ncm,cest,cfop?,unidade,qtd,valor(unit),orig,csosn}], desconto, frete, pagamento:{tPag}, info,
//         ibpt:{fed,est}, indPres, ibscbs }
// emit: { cnpj, ie, razao, fantasia, logradouro, numero, complemento, bairro, cep, cod_municipio, municipio, uf, fone, crt, resp:{cnpj,contato,email,fone} }
export function montarXml(nota, emit) {
  const amb = Number(nota.ambiente) === 1 ? 1 : 2;
  const data = nota.data || new Date();
  const uf = String(emit.uf || 'RJ').toUpperCase();
  const fuso = FUSO_UF[uf] ?? -3;
  const dh = dhLocal(data, fuso);
  const aamm = dh.slice(2, 4) + dh.slice(5, 7);
  const cNF = String(nota.cNF || novoCNF(nota.numero)).padStart(8, '0');
  const chave = montarChave({ uf, aamm, cnpj: emit.cnpj, serie: nota.serie, numero: nota.numero, cNF });
  const id = `NFe${chave}`;
  const d = nota.dest;
  const ufDest = String(d.uf).toUpperCase();
  const fora = ufDest !== uf;
  const cfopPadrao = fora ? '6102' : '5102';
  const indPres = Number(nota.indPres ?? 2);

  // itens, desconto e frete rateados (brinde de valor 0 fica com 0 em tudo)
  const itens = nota.itens.map((i) => ({ ...i, qtd: Number(i.qtd), valor: r2(i.valor), vProd: r2(Number(i.qtd) * Number(i.valor)) }));
  const vProd = r2(itens.reduce((a, i) => a + i.vProd, 0));
  const vDescTot = Math.min(r2(nota.desconto), vProd);
  const vFrete = r2(nota.frete);
  const descs = ratear(vDescTot, itens), fretes = ratear(vFrete, itens);
  itens.forEach((i, k) => { i.vDesc = descs[k]; i.vFrete = fretes[k]; });
  const vNF = r2(vProd - vDescTot + vFrete);
  // tributos aproximados (Lei 12.741): % federal e estadual sobre o valor do item já com desconto
  const pFed = Number(nota.ibpt?.fed) || 0, pEst = Number(nota.ibpt?.est) || 0;
  itens.forEach((i) => { const b = r2(i.vProd - i.vDesc); i.tFed = r2((b * pFed) / 100); i.tEst = r2((b * pEst) / 100); i.vTotTrib = r2(i.tFed + i.tEst); });
  const tFed = r2(itens.reduce((a, i) => a + i.tFed, 0)), tEst = r2(itens.reduce((a, i) => a + i.tEst, 0));
  const vTotTrib = r2(tFed + tEst);

  const ide = `<ide><cUF>${UF_COD[uf]}</cUF><cNF>${cNF}</cNF><natOp>${txt(nota.natOp || 'Venda de mercadorias de terceiros para consumidor final', 60)}</natOp><mod>55</mod><serie>${Number(nota.serie)}</serie><nNF>${Number(nota.numero)}</nNF><dhEmi>${dh}</dhEmi><dhSaiEnt>${dh}</dhSaiEnt><tpNF>1</tpNF><idDest>${fora ? 2 : 1}</idDest><cMunFG>${dig(emit.cod_municipio)}</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>${amb}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>${indPres}</indPres>${[2, 3, 4, 9].includes(indPres) ? '<indIntermed>0</indIntermed>' : ''}<procEmi>0</procEmi><verProc>${VER_PROC}</verProc></ide>`;
  const foneEmit = dig(emit.fone);
  const emitXml = `<emit><CNPJ>${dig(emit.cnpj)}</CNPJ><xNome>${txt(emit.razao)}</xNome>${tag('xFant', txt(emit.fantasia))}<enderEmit><xLgr>${txt(emit.logradouro)}</xLgr><nro>${txt(emit.numero || 'S/N')}</nro>${tag('xCpl', txt(emit.complemento))}<xBairro>${txt(emit.bairro)}</xBairro><cMun>${dig(emit.cod_municipio)}</cMun><xMun>${txt(emit.municipio)}</xMun><UF>${uf}</UF><CEP>${dig(emit.cep)}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais>${foneEmit.length >= 6 ? tag('fone', foneEmit) : ''}</enderEmit><IE>${dig(emit.ie)}</IE><CRT>${Number(emit.crt) || 1}</CRT></emit>`;
  const doc = dig(d.doc);
  const foneDest = dig(d.fone).replace(/^55(?=\d{10,11}$)/, '');
  const email = String(d.email || '').trim();
  const destXml = `<dest>${doc.length === 14 ? tag('CNPJ', doc) : tag('CPF', doc)}<xNome>${amb === 2 ? HOMOLOG_DEST : txt(d.nome)}</xNome><enderDest><xLgr>${txt(d.endereco)}</xLgr><nro>${txt(d.numero || 'S/N')}</nro>${tag('xCpl', txt(d.complemento))}<xBairro>${txt(d.bairro)}</xBairro><cMun>${dig(d.cod_municipio)}</cMun><xMun>${txt(d.municipio)}</xMun><UF>${ufDest}</UF><CEP>${dig(d.cep)}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais>${foneDest.length >= 6 && foneDest.length <= 14 ? tag('fone', foneDest) : ''}</enderDest><indIEDest>9</indIEDest>${/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? tag('email', txt(email, 60)) : ''}</dest>`;
  const det = itens.map((i, k) => {
    const nome = amb === 2 && k === 0 ? HOMOLOG_ITEM : txt(i.nome, 120);
    const un = txt(i.unidade || 'Pc', 6);
    const prod = `<prod><cProd>${txt(i.codigo || String(k + 1), 60)}</cProd><cEAN>SEM GTIN</cEAN><xProd>${nome}</xProd><NCM>${dig(i.ncm)}</NCM>${dig(i.cest).length === 7 ? tag('CEST', dig(i.cest)) : ''}<CFOP>${i.cfop || cfopPadrao}</CFOP><uCom>${un}</uCom><qCom>${i.qtd.toFixed(4)}</qCom><vUnCom>${i.valor.toFixed(10)}</vUnCom><vProd>${d2(i.vProd)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${un}</uTrib><qTrib>${i.qtd.toFixed(4)}</qTrib><vUnTrib>${i.valor.toFixed(10)}</vUnTrib>${i.vFrete > 0 ? tag('vFrete', d2(i.vFrete)) : ''}${i.vDesc > 0 ? tag('vDesc', d2(i.vDesc)) : ''}<indTot>1</indTot></prod>`;
    const imp = `<imposto><vTotTrib>${d2(i.vTotTrib)}</vTotTrib><ICMS><ICMSSN102><orig>${Number(i.orig) || 0}</orig><CSOSN>${i.csosn || '102'}</CSOSN></ICMSSN102></ICMS><IPI><cEnq>999</cEnq><IPINT><CST>53</CST></IPINT></IPI><PIS><PISNT><CST>08</CST></PISNT></PIS><COFINS><COFINSNT><CST>08</CST></COFINSNT></COFINS>${nota.ibscbs ? ibscbsItem(i) : ''}</imposto>`;
    return `<det nItem="${k + 1}">${prod}${imp}</det>`;
  }).join('');
  const tot = `<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${d2(vProd)}</vProd><vFrete>${d2(vFrete)}</vFrete><vSeg>0.00</vSeg><vDesc>${d2(vDescTot)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${d2(vNF)}</vNF><vTotTrib>${d2(vTotTrib)}</vTotTrib></ICMSTot>${nota.ibscbs ? ibscbsTotal(itens, vNF) : ''}</total>`;
  // gabarito do Tiny: modFrete 9 (sem transporte) e um volume com peso 0.000; com frete cobrado vira 0 (por conta do emitente)
  const transp = `<transp><modFrete>${vFrete > 0 ? 0 : 9}</modFrete><vol><pesoL>0.000</pesoL><pesoB>0.000</pesoB></vol></transp>`;
  const tPag = String(nota.pagamento?.tPag || '90');
  const pag = `<pag><detPag><tPag>${tPag}</tPag>${tPag === '99' ? tag('xPag', txt(nota.pagamento?.xPag || 'Outros', 60)) : ''}<vPag>${tPag === '90' ? '0.00' : d2(vNF)}</vPag></detPag></pag>`;
  const infoTrib = `Tributos aproximados: R$ ${brl(tFed)} (Federal) e R$ ${brl(tEst)} (Estadual). Fonte: IBPT`;
  const cpl = [infoTrib, String(nota.info ?? FRASE_SIMPLES).trim()].filter(Boolean).join('. ').replace(/\.\.+/g, '.');
  const infAdic = `<infAdic><infCpl>${txt(cpl, 5000)}</infCpl></infAdic>`;
  const r = emit.resp || {};
  const resp = r.contato && r.email && dig(r.fone).length >= 6 ? `<infRespTec><CNPJ>${dig(r.cnpj || emit.cnpj)}</CNPJ><xContato>${txt(r.contato)}</xContato><email>${txt(r.email)}</email><fone>${dig(r.fone)}</fone></infRespTec>` : '';
  const inf = `<infNFe Id="${id}" versao="4.00">${ide}${emitXml}${destXml}${det}${tot}${transp}${pag}${infAdic}${resp}</infNFe>`;
  return { xml: `<NFe xmlns="${NS}">${inf}</NFe>`, chave, id, cNF, vNF, vProd, vDesc: vDescTot, vFrete, vTotTrib, tFed, tEst, itens };
}

// IBS/CBS (reforma tributária): só vai se a homologação da SVRS exigir (rejeição 1115/225); alíquotas de teste de 2026
function ibscbsItem(i) {
  const b = r2(i.vProd - i.vDesc), vIBS = r2(b * 0.001), vCBS = r2(b * 0.009);
  return `<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>${d2(b)}</vBC><gIBSUF><pIBSUF>0.1000</pIBSUF><vIBSUF>${d2(vIBS)}</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.0000</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>${d2(vIBS)}</vIBS><gCBS><pCBS>0.9000</pCBS><vCBS>${d2(vCBS)}</vCBS></gCBS></gIBSCBS></IBSCBS>`;
}
function ibscbsTotal(itens, vNF) {
  const b = r2(itens.reduce((a, i) => a + i.vProd - i.vDesc, 0));
  const vIBS = r2(itens.reduce((a, i) => a + r2((i.vProd - i.vDesc) * 0.001), 0)), vCBS = r2(itens.reduce((a, i) => a + r2((i.vProd - i.vDesc) * 0.009), 0));
  return `<IBSCBSTot><vBCIBSCBS>${d2(b)}</vBCIBSCBS><gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>${d2(vIBS)}</vIBSUF></gIBSUF><gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>${d2(vIBS)}</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS><gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${d2(vCBS)}</vCBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS></IBSCBSTot><vNFTot>${d2(vNF)}</vNFTot>`;
}

// prepara (monta + assina) sem mandar — o XML assinado é guardado ANTES do envio
export function preparar(nota, emit, cert) {
  const m = montarXml(nota, emit);
  return { ...m, assinado: assinar(m.xml, 'infNFe', m.id, cert) };
}
export const fecharProc = (assinado, prot) => `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NS}" versao="4.00">${assinado}${String(prot).replace(/^<(\w+:)?protNFe[^>]*>/, '<protNFe versao="4.00">').replace(/<\/(\w+:)?protNFe>$/, '</protNFe>')}</nfeProc>`;

// ── cadeia ICP-Brasil para o TLS com a SEFAZ ──
// Os servidores da SVRS usam certificado da ICP-Brasil (*.svrs.rs.gov.br ← AC SERPRO SSLv1 ← AC Raiz Brasileira v10),
// que não vem no Node. Em vez de desligar a verificação, as ACs oficiais do ITI (api/_lib/icp-brasil.pem) entram
// como "ca" junto com as raízes padrão do Node. A verificação do servidor continua LIGADA.
export const lerCadeiaIcp = (pem) => String(pem || '').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
let caSefaz = null;
export function caParaSefaz() {
  if (!caSefaz) caSefaz = [...tls.rootCertificates, ...lerCadeiaIcp(fs.readFileSync(new URL('./icp-brasil.pem', import.meta.url), 'utf8'))];
  return caSefaz;
}

// ── SOAP 1.2 com o certificado (TLS mútuo) ──
export const envelope = (wsdl, corpo) => `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="${WSDL}${wsdl}">${corpo}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
export function soap(servico, uf, amb, corpo, cert, { timeout = 25000, transporte } = {}) {
  const { url, wsdl, metodo } = urlServico(uf, amb, servico);
  const env = envelope(wsdl, corpo);
  if (transporte) return transporte({ url, wsdl, metodo, env, servico, amb });
  const u = new URL(url);
  return new Promise((ok, falha) => {
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST', key: cert.keyPem, cert: cert.certPem + (cert.cadeia || ''), ca: caParaSefaz(), timeout,
      headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${WSDL}${wsdl}/${metodo}"`, 'Content-Length': Buffer.byteLength(env) },
    }, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (c) => { b += c; });
      res.on('end', () => (res.statusCode >= 400 && !/cStat/.test(b) ? falha(new Error(`SEFAZ HTTP ${res.statusCode}`)) : ok(b)));
    });
    req.on('timeout', () => req.destroy(new Error('a SEFAZ não respondeu a tempo')));
    req.on('error', falha);
    req.end(env);
  });
}
export const pega = (xml, t) => { const m = String(xml ?? '').match(new RegExp(`<(?:\\w+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${t}>`)); return m ? m[1] : null; };
export const bloco = (xml, t) => { const m = String(xml ?? '').match(new RegExp(`<(?:\\w+:)?${t}[\\s>][\\s\\S]*?</(?:\\w+:)?${t}>`)); return m ? m[0] : null; };

export async function status(uf, amb, cert, opts) {
  const r = await soap('status', uf, amb, `<consStatServ xmlns="${NS}" versao="4.00"><tpAmb>${amb}</tpAmb><cUF>${UF_COD[uf]}</cUF><xServ>STATUS</xServ></consStatServ>`, cert, { timeout: 15000, ...opts });
  return { cStat: pega(r, 'cStat'), motivo: pega(r, 'xMotivo'), tMed: pega(r, 'tMed') };
}

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
// lê o protNFe de uma resposta (envio síncrono ou consulta do recibo)
function lerProt(r, p) {
  const prot = bloco(r, 'protNFe');
  const cStat = prot ? pega(prot, 'cStat') : pega(r, 'cStat');
  const motivo = prot ? pega(prot, 'xMotivo') : pega(r, 'xMotivo');
  const autorizada = ['100', '150'].includes(String(cStat));
  return {
    autorizada, cStat, motivo, chave: p.chave, vNF: p.vNF, protocolo: prot ? pega(prot, 'nProt') : null, recebida: prot ? pega(prot, 'dhRecbto') : null,
    assinado: p.assinado, xml: autorizada ? fecharProc(p.assinado, prot) : null,
    // 204/539 = já existe na SEFAZ com esse número (resposta perdida antes): consultar pela chave
    duplicada: ['204', '539'].includes(String(cStat)),
  };
}
// manda (síncrono, indSinc=1). Se a SEFAZ responder 103 (lote recebido), busca o resultado no NFeRetAutorizacao4.
export async function enviar(p, { ambiente, uf = 'RJ' }, cert, opts = {}) {
  const amb = Number(ambiente) === 1 ? 1 : 2;
  const lote = `<enviNFe xmlns="${NS}" versao="4.00"><idLote>${String(Date.now()).slice(-15)}</idLote><indSinc>1</indSinc>${p.assinado}</enviNFe>`;
  const r = await soap('autorizacao', uf, amb, lote, cert, opts);
  const cLote = pega(bloco(r, 'retEnviNFe') || r, 'cStat');
  if (String(cLote) === '103' && !bloco(r, 'protNFe')) {
    const nRec = pega(r, 'nRec');
    for (let i = 0; i < 3 && nRec; i++) {
      await espera(opts.esperaMs ?? 1500);
      const rr = await soap('retAutorizacao', uf, amb, `<consReciNFe xmlns="${NS}" versao="4.00"><tpAmb>${amb}</tpAmb><nRec>${nRec}</nRec></consReciNFe>`, cert, opts);
      if (bloco(rr, 'protNFe')) return lerProt(rr, p);
      if (String(pega(rr, 'cStat')) !== '105') return lerProt(rr, p); // 105 = ainda em processamento
    }
    return { pendente: true, cStat: '105', motivo: 'Lote em processamento na SEFAZ', chave: p.chave, assinado: p.assinado };
  }
  return lerProt(r, p);
}

export async function consultar(chave, uf, amb, cert, opts) {
  const r = await soap('consulta', uf, amb, `<consSitNFe xmlns="${NS}" versao="4.00"><tpAmb>${amb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chave}</chNFe></consSitNFe>`, cert, opts);
  const prot = bloco(r, 'protNFe');
  const ret = bloco(r, 'retConsSitNFe') || r;
  return { cStat: pega(ret, 'cStat'), motivo: pega(ret, 'xMotivo'), protNFe: prot, protCStat: prot ? pega(prot, 'cStat') : null, protocolo: prot ? pega(prot, 'nProt') : null };
}

// ── cancelamento (evento 110111, docs/emissor-nfe-guia.md) ──
// até 24 h depois da autorização; justificativa de 15 a 255 letras; vai para o ambiente da própria nota.
export const justificativaLimpa = (j) => String(j ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
// monta e assina o evento (separado do envio para conferir o XML nos testes)
export function eventoCancelamento({ chave, protocolo, justificativa, ambiente, cnpj, uf = 'RJ', data = new Date(), seq = 1 }, cert) {
  const amb = Number(ambiente) === 1 ? 1 : 2;
  const just = justificativaLimpa(justificativa);
  if (just.length < 15) throw new Error('a justificativa precisa de pelo menos 15 letras');
  if (!/^\d{44}$/.test(String(chave || ''))) throw new Error('nota sem chave de acesso');
  if (!/^\d{15}$/.test(String(protocolo || ''))) throw new Error('nota sem protocolo de autorização');
  const n = String(seq).padStart(2, '0');
  const id = `ID110111${chave}${n}`;
  const inf = `<infEvento Id="${id}"><cOrgao>${UF_COD[String(uf).toUpperCase()]}</cOrgao><tpAmb>${amb}</tpAmb><CNPJ>${dig(cnpj)}</CNPJ><chNFe>${chave}</chNFe><dhEvento>${dhLocal(data, FUSO_UF[String(uf).toUpperCase()] ?? -3)}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>${Number(seq)}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${protocolo}</nProt><xJust>${txt(just, 255)}</xJust></detEvento></infEvento>`;
  return { id, evento: assinar(`<evento xmlns="${NS}" versao="1.00">${inf}</evento>`, 'infEvento', id, cert) };
}
export const fecharProcEvento = (evento, retEvento) => `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="${NS}" versao="1.00">${evento}${String(retEvento).replace(/^<(\w+:)?retEvento[^>]*>/, '<retEvento versao="1.00">').replace(/<\/(\w+:)?retEvento>$/, '</retEvento>')}</procEventoNFe>`;
export async function cancelar(dados, cert, opts = {}) {
  const uf = String(dados.uf || 'RJ').toUpperCase();
  const amb = Number(dados.ambiente) === 1 ? 1 : 2;
  const { evento } = eventoCancelamento({ ...dados, uf }, cert);
  const r = await soap('evento', uf, amb, `<envEvento xmlns="${NS}" versao="1.00"><idLote>${String(Date.now()).slice(-15)}</idLote>${evento}</envEvento>`, cert, opts);
  const ret = bloco(r, 'retEvento');
  const cStat = ret ? pega(ret, 'cStat') : pega(r, 'cStat');
  // 135 = evento registrado e vinculado; 155 = cancelamento homologado fora de prazo
  const cancelada = ['135', '155'].includes(String(cStat));
  return {
    cancelada, cStat, motivo: ret ? pega(ret, 'xMotivo') : pega(r, 'xMotivo'), protocolo: ret ? pega(ret, 'nProt') : null,
    registrado: ret ? pega(ret, 'dhRegEvento') : null, evento, xml: cancelada ? fecharProcEvento(evento, ret) : null,
  };
}

// textos em português para as rejeições mais comuns (o motivo da SEFAZ vem junto, sempre)
export const DICAS_REJEICAO = {
  204: 'Já existe uma nota com esse número na SEFAZ. Clique em "Consultar SEFAZ".',
  225: 'O XML não passou no schema da SEFAZ (algum campo com formato errado).',
  213: 'O CNPJ do emitente não é o mesmo do certificado.',
  230: 'A Inscrição Estadual do emitente não está cadastrada.',
  233: 'A Inscrição Estadual do destinatário não está cadastrada.',
  237: 'CPF do destinatário inválido.',
  297: 'A assinatura digital não confere.',
  539: 'Já existe uma nota com esse número (chave diferente). Clique em "Consultar SEFAZ".',
  598: 'Em homologação o nome do destinatário precisa ser o texto de teste da SEFAZ.',
  778: 'NCM inválido ou inexistente em algum item.',
  972: 'A SEFAZ pede os dados do responsável técnico (preencha em Notas fiscais › Configuração).',
  1115: 'A SEFAZ exigiu o grupo IBS/CBS (reforma tributária).',
  501: 'Passou do prazo de cancelamento (24 h depois da autorização).',
  573: 'Essa nota já tem um cancelamento registrado. Clique em "Consultar SEFAZ".',
};
