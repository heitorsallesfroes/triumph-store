/* eslint-disable @typescript-eslint/no-explicit-any */
// 🧾 DANFE (retrato, A4) gerado no navegador a partir do XML autorizado (nfeProc), no padrão comum:
// canhoto, logo + emitente, quadro DANFE (entrada/saída, número, série, folha), código de barras Code 128C da chave,
// chave formatada, protocolo, destinatário, cálculo do imposto, transportador/volumes, produtos e dados adicionais.
// Homologação sai com a tarja "SEM VALOR FISCAL". Base: docs/emissor-nfe-guia.md (seção 2.7).
import type { jsPDF as JsPDF } from 'jspdf';

const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');

// Code 128 conjunto C (só números, em pares): start C (105), dados, dígito verificador, stop
export function code128c(numeros: string): string {
  const pares = String(numeros).match(/\d\d/g) || [];
  const cod = [105, ...pares.map(Number)];
  const soma = cod.reduce((a, v, i) => a + v * (i || 1), 0);
  cod.push(soma % 103, 106);
  return cod.map((v) => C128[v]).join('');
}

const fmt = (v: unknown, c = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const chaveFmt = (c: string) => String(c || '').replace(/(\d{4})(?=\d)/g, '$1 ');
const docFmt = (d: string) => { d = String(d || ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d; };
const cepFmt = (c: string) => String(c || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
const dataFmt = (s: string) => { if (!s) return ''; const [d, h] = String(s).split('T'); return `${d.split('-').reverse().join('/')} ${String(h || '').slice(0, 8)}`; };
const nnf = (n: string) => String(n).padStart(9, '0').replace(/(\d{3})(?=\d)/g, '$1.');

export function lerNota(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const q = (sel: string, base: Document | Element = doc) => base.getElementsByTagName(sel)[0];
  const t = (sel: string, base?: Element) => (base ? q(sel, base)?.textContent : q(sel)?.textContent) || '';
  const inf = q('infNFe');
  const emit = q('emit'), dest = q('dest'), tot = q('ICMSTot'), prot = q('infProt'), transp = q('transp');
  const ee = emit ? q('enderEmit', emit) : undefined, ed = dest ? q('enderDest', dest) : undefined;
  return {
    chave: (inf?.getAttribute('Id') || '').replace('NFe', ''),
    numero: t('nNF'), serie: t('serie'), dhEmi: t('dhEmi'), dhSaiEnt: t('dhSaiEnt'), natOp: t('natOp'), tpAmb: t('tpAmb'), tpNF: t('tpNF'),
    protocolo: t('nProt', prot), dhRecbto: t('dhRecbto', prot),
    emit: { nome: t('xNome', emit), fantasia: t('xFant', emit), doc: t('CNPJ', emit), ie: t('IE', emit), lgr: t('xLgr', ee), nro: t('nro', ee), cpl: t('xCpl', ee), bairro: t('xBairro', ee), mun: t('xMun', ee), uf: t('UF', ee), cep: t('CEP', ee), fone: t('fone', ee) },
    dest: { nome: t('xNome', dest), doc: t('CNPJ', dest) || t('CPF', dest), ie: t('IE', dest), lgr: t('xLgr', ed), nro: t('nro', ed), cpl: t('xCpl', ed), bairro: t('xBairro', ed), mun: t('xMun', ed), uf: t('UF', ed), cep: t('CEP', ed), fone: t('fone', ed) },
    tot: { vBC: t('vBC', tot), vICMS: t('vICMS', tot), vBCST: t('vBCST', tot), vST: t('vST', tot), vProd: t('vProd', tot), vFrete: t('vFrete', tot), vSeg: t('vSeg', tot), vDesc: t('vDesc', tot), vOutro: t('vOutro', tot), vIPI: t('vIPI', tot), vNF: t('vNF', tot), vTotTrib: t('vTotTrib', tot) },
    modFrete: t('modFrete', transp), pesoB: t('pesoB', transp), pesoL: t('pesoL', transp), qVol: t('qVol', transp),
    itens: [...doc.getElementsByTagName('det')].map((d) => ({ cod: t('cProd', d), desc: t('xProd', d), ncm: t('NCM', d), cst: t('CSOSN', d) || t('CST', d), orig: t('orig', d), cfop: t('CFOP', d), un: t('uCom', d), qtd: t('qCom', d), vun: t('vUnCom', d), vprod: t('vProd', d), vdesc: t('vDesc', d) })),
    infCpl: t('infCpl'),
  };
}

// logo da loja (o mesmo do recibo), reduzida para não pesar o PDF; sem logo, sai só o texto
async function carregarLogo(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.src = '/Logo2p-1.png';
    await img.decode();
    const w = 600, h = Math.round((img.naturalHeight / img.naturalWidth) * w) || 338;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); if (!g) return null;
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    return { data: cv.toDataURL('image/jpeg', 0.85), w, h };
  } catch { return null; }
}

// juntarEm: um PDF já aberto (vários DANFEs num arquivo só): este DANFE começa numa folha nova dele
export async function gerarDanfe(xml: string, { cancelada = false, juntarEm }: { cancelada?: boolean; juntarEm?: JsPDF } = {}): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf');
  const n = lerNota(xml);
  const logo = await carregarLogo();
  const pdf: any = juntarEm || new jsPDF({ unit: 'mm', format: 'a4' });
  const base = juntarEm ? pdf.getNumberOfPages() : 0; // folhas dos DANFEs anteriores
  if (juntarEm) pdf.addPage();
  const W = 210, H = 297, M = 7, L = W - 2 * M;
  pdf.setLineWidth(0.2);
  const caixa = (x: number, y: number, w: number, h: number, rot: string, val: unknown, { tam = 8, neg = false, alinhar = 'left' as 'left' | 'right' | 'center' } = {}) => {
    pdf.rect(x, y, w, h);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.text(String(rot).toUpperCase(), x + 1, y + 2.3);
    pdf.setFont('helvetica', neg ? 'bold' : 'normal'); pdf.setFontSize(tam);
    const v = pdf.splitTextToSize(String(val ?? ''), w - 2)[0] || '';
    const px = alinhar === 'right' ? x + w - 1 : alinhar === 'center' ? x + w / 2 : x + 1;
    pdf.text(v, px, y + h - 1.4, { align: alinhar });
  };
  const titulo = (y: number, s: string) => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.text(s, M, y - 0.8); };
  const tarja = (s: string) => {
    pdf.saveGraphicsState?.();
    pdf.setTextColor(235, 120, 120); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(26);
    pdf.text(s, W / 2, 190, { align: 'center', angle: 30 });
    pdf.setTextColor(0, 0, 0);
    pdf.restoreGraphicsState?.();
  };
  const homolog = n.tpAmb === '2';
  let y = M;

  // ── canhoto ──
  pdf.rect(M, y, L - 42, 7); pdf.rect(M, y + 7, 40, 9); pdf.rect(M + 40, y + 7, L - 82, 9); pdf.rect(M + L - 42, y, 42, 16);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.8);
  pdf.text(pdf.splitTextToSize(`RECEBEMOS DE ${n.emit.nome} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO. EMISSÃO: ${dataFmt(n.dhEmi).slice(0, 10)}  DESTINATÁRIO: ${n.dest.nome}  VALOR TOTAL: R$ ${fmt(n.tot.vNF)}`, L - 45), M + 1, y + 2.5);
  pdf.setFontSize(5.5); pdf.text('DATA DE RECEBIMENTO', M + 1, y + 9.3); pdf.text('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', M + 41, y + 9.3);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('NF-e', M + L - 21, y + 4.5, { align: 'center' });
  pdf.setFontSize(8); pdf.text(`Nº ${nnf(n.numero)}`, M + L - 21, y + 9, { align: 'center' }); pdf.text(`SÉRIE ${String(n.serie).padStart(3, '0')}`, M + L - 21, y + 13, { align: 'center' });
  y += 18; pdf.setLineDashPattern([1, 1], 0); pdf.line(M, y, M + L, y); pdf.setLineDashPattern([], 0); y += 2;

  // ── cabeçalho: emitente | DANFE | chave ──
  const hC = 34;
  pdf.rect(M, y, 82, hC); pdf.rect(M + 82, y, 32, hC); pdf.rect(M + 114, y, L - 114, hC);
  let yt = y + 5;
  if (logo) {
    const lw = 30, lh = (logo.h / logo.w) * lw;
    pdf.addImage(logo.data, 'JPEG', M + 26, y + 1.5, lw, Math.min(lh, 15));
    yt = y + 1.5 + Math.min(lh, 15) + 3;
  }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(logo ? 8.5 : 10);
  const nomeL = pdf.splitTextToSize(n.emit.nome, 78);
  pdf.text(nomeL, M + 41, yt, { align: 'center' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.8);
  const end = [`${n.emit.lgr}, ${n.emit.nro}${n.emit.cpl ? ` - ${n.emit.cpl}` : ''}`, `${n.emit.bairro} - CEP ${cepFmt(n.emit.cep)}`, `${n.emit.mun} - ${n.emit.uf}${n.emit.fone ? `  Fone: ${n.emit.fone}` : ''}`];
  pdf.text(end, M + 41, yt + nomeL.length * 3.4 + 0.6, { align: 'center' });
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text('DANFE', M + 98, y + 6, { align: 'center' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.3); pdf.text(['Documento Auxiliar da', 'Nota Fiscal Eletrônica'], M + 98, y + 9.5, { align: 'center' });
  pdf.setFontSize(7.2); pdf.text(['0 - ENTRADA', '1 - SAÍDA'], M + 85, y + 17); pdf.rect(M + 105, y + 14.5, 5, 5);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text(n.tpNF || '1', M + 107.5, y + 18.4, { align: 'center' });
  pdf.setFontSize(8.5); pdf.text(`Nº ${nnf(n.numero)}`, M + 98, y + 25.5, { align: 'center' });
  pdf.setFontSize(7.5); pdf.text(`SÉRIE ${String(n.serie).padStart(3, '0')}`, M + 98, y + 29, { align: 'center' });
  const folhaY = y + 32.3;
  // código de barras da chave
  const barras = code128c(n.chave);
  const bx = M + 116, bw = L - 118, mod = bw / barras.split('').reduce((a, c) => a + Number(c), 0);
  let x = bx; pdf.setFillColor(0, 0, 0);
  barras.split('').forEach((w, i) => { const larg = Number(w) * mod; if (i % 2 === 0) pdf.rect(x, y + 2, larg, 11, 'F'); x += larg; });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.text('CHAVE DE ACESSO', bx, y + 16.5);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.6); pdf.text(chaveFmt(n.chave), bx, y + 20);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.3);
  pdf.text(pdf.splitTextToSize('Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora', bw), bx, y + 24);
  y += hC;
  caixa(M, y, 114, 8, 'Natureza da operação', n.natOp);
  caixa(M + 114, y, L - 114, 8, 'Protocolo de autorização de uso', n.protocolo ? `${n.protocolo} - ${dataFmt(n.dhRecbto)}` : '', { neg: true });
  y += 8;
  caixa(M, y, 66, 8, 'Inscrição estadual', n.emit.ie); caixa(M + 66, y, 66, 8, 'Insc. estadual do subst. trib.', ''); caixa(M + 132, y, L - 132, 8, 'CNPJ', docFmt(n.emit.doc));
  y += 11;

  // ── destinatário ──
  titulo(y, 'DESTINATÁRIO / REMETENTE');
  caixa(M, y, 120, 8, 'Nome / razão social', n.dest.nome); caixa(M + 120, y, 45, 8, 'CNPJ / CPF', docFmt(n.dest.doc)); caixa(M + 165, y, L - 165, 8, 'Data da emissão', dataFmt(n.dhEmi).slice(0, 10));
  y += 8;
  caixa(M, y, 100, 8, 'Endereço', `${n.dest.lgr}, ${n.dest.nro}${n.dest.cpl ? ` - ${n.dest.cpl}` : ''}`); caixa(M + 100, y, 45, 8, 'Bairro / distrito', n.dest.bairro); caixa(M + 145, y, 20, 8, 'CEP', cepFmt(n.dest.cep)); caixa(M + 165, y, L - 165, 8, 'Data da saída', dataFmt(n.dhSaiEnt || n.dhEmi).slice(0, 10));
  y += 8;
  caixa(M, y, 80, 8, 'Município', n.dest.mun); caixa(M + 80, y, 40, 8, 'Fone / fax', n.dest.fone); caixa(M + 120, y, 10, 8, 'UF', n.dest.uf); caixa(M + 130, y, 35, 8, 'Inscrição estadual', n.dest.ie); caixa(M + 165, y, L - 165, 8, 'Hora da saída', dataFmt(n.dhSaiEnt || n.dhEmi).slice(11));
  y += 11;

  // ── cálculo do imposto ──
  titulo(y, 'CÁLCULO DO IMPOSTO');
  const w6 = L / 6;
  [['Base de cálc. do ICMS', n.tot.vBC], ['Valor do ICMS', n.tot.vICMS], ['Base cálc. ICMS ST', n.tot.vBCST], ['Valor do ICMS ST', n.tot.vST], ['V. aprox. tributos', n.tot.vTotTrib], ['Valor total dos produtos', n.tot.vProd]].forEach(([r, v], i) => caixa(M + i * w6, y, w6, 8, r, fmt(v), { alinhar: 'right' }));
  y += 8;
  [['Valor do frete', n.tot.vFrete], ['Valor do seguro', n.tot.vSeg], ['Desconto', n.tot.vDesc], ['Outras despesas', n.tot.vOutro], ['Valor do IPI', n.tot.vIPI], ['Valor total da nota', n.tot.vNF]].forEach(([r, v], i) => caixa(M + i * w6, y, w6, 8, r, fmt(v), { alinhar: 'right', neg: i === 5 }));
  y += 11;

  // ── transportador / volumes ──
  titulo(y, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS');
  const frete: Record<string, string> = { 0: '0-Por conta do emitente', 1: '1-Por conta do destinatário', 2: '2-Por conta de terceiros', 9: '9-Sem transporte' };
  caixa(M, y, 90, 8, 'Razão social', ''); caixa(M + 90, y, 50, 8, 'Frete por conta', frete[n.modFrete] || n.modFrete); caixa(M + 140, y, L - 140, 8, 'Placa / UF', '');
  y += 8;
  caixa(M, y, 40, 8, 'Quantidade', n.qVol); caixa(M + 40, y, 50, 8, 'Espécie', ''); caixa(M + 90, y, 50, 8, 'Peso bruto', fmt(n.pesoB, 3), { alinhar: 'right' }); caixa(M + 140, y, L - 140, 8, 'Peso líquido', fmt(n.pesoL, 3), { alinhar: 'right' });
  y += 11;

  // ── produtos ──
  const cols: [string, number][] = [['Código', 16], ['Descrição do produto / serviço', 58], ['NCM/SH', 14], ['CSOSN', 10], ['CFOP', 9], ['UN', 7], ['Qtd.', 12], ['V. unit.', 15], ['V. desc.', 13], ['V. total', 16], ['BC ICMS', 11], ['V. ICMS', 10]];
  const soma = cols.reduce((a, c) => a + c[1], 0);
  const cw = cols.map((c) => (c[1] * L) / soma);
  const cabecalhoProdutos = () => {
    titulo(y, 'DADOS DOS PRODUTOS / SERVIÇOS');
    pdf.rect(M, y, L, 5);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.3);
    let cx = M; cols.forEach((c, i) => { pdf.text(c[0].toUpperCase(), cx + 0.8, y + 3.4); if (i) pdf.line(cx, y, cx, y + 5); cx += cw[i]; });
    y += 5;
  };
  cabecalhoProdutos();
  let folhas = 1;
  n.itens.forEach((it) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.6);
    const desc = pdf.splitTextToSize(it.desc, cw[1] - 1.5);
    const h = Math.max(5, desc.length * 2.9 + 2);
    if (y + h > H - 45) { // quebra de página: os dados adicionais ficam na última
      if (homolog) tarja('SEM VALOR FISCAL - HOMOLOGAÇÃO');
      pdf.addPage(); folhas++; y = M + 4; cabecalhoProdutos();
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.6);
    }
    const vals = [it.cod, desc, it.ncm, `${it.orig}${it.cst}`, it.cfop, it.un, fmt(it.qtd, 4), fmt(it.vun), fmt(it.vdesc), fmt(it.vprod), '0,00', '0,00'];
    let cx = M; vals.forEach((v, i) => { const dir = i >= 6; pdf.text(v, dir ? cx + cw[i] - 0.8 : cx + 0.8, y + 3.4, dir ? { align: 'right' } : undefined); cx += cw[i]; });
    pdf.rect(M, y, L, h); cx = M; cw.forEach((w, i) => { if (i) pdf.line(cx, y, cx, y + h); cx += w; });
    y += h;
  });
  y += 4;

  // ── dados adicionais ──
  titulo(y + 3, 'DADOS ADICIONAIS');
  y += 3;
  const hA = Math.max(28, H - M - y);
  pdf.rect(M, y, L * 0.65, hA); pdf.rect(M + L * 0.65, y, L * 0.35, hA);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.text('INFORMAÇÕES COMPLEMENTARES', M + 1, y + 2.3); pdf.text('RESERVADO AO FISCO', M + L * 0.65 + 1, y + 2.3);
  pdf.setFontSize(7); pdf.text(pdf.splitTextToSize(n.infCpl, L * 0.65 - 3), M + 1, y + 6);

  // folha x/y em todas as páginas
  for (let p = 1; p <= folhas; p++) {
    pdf.setPage(base + p); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
    if (p === 1) pdf.text(`FOLHA ${p}/${folhas}`, M + 98, folhaY, { align: 'center' });
    else pdf.text(`NF-e Nº ${nnf(n.numero)} SÉRIE ${String(n.serie).padStart(3, '0')} - FOLHA ${p}/${folhas}`, M, M + 1);
  }
  pdf.setPage(base + folhas);
  if (homolog) tarja('SEM VALOR FISCAL - HOMOLOGAÇÃO');
  if (cancelada) tarja('NF-e CANCELADA');
  return pdf as JsPDF;
}
