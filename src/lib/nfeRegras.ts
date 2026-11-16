// 🧾 Regras do modal da NF-e própria sem banco nem rede (testadas em scripts/tests/nfe.test.ts).
const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');

// NCM do brinde: vem do cadastro de Acessórios (coluna accessories.ncm). Brinde digitado à mão
// (custom_name, sem acessório cadastrado) ou acessório sem NCM fica vazio, e a nota trava.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ncmDoBrinde = (saleAccessory: any): string => {
  const ac = Array.isArray(saleAccessory?.accessories) ? saleAccessory.accessories[0] : saleAccessory?.accessories;
  return dig(ac?.ncm);
};

// itens sem NCM válido (8 números): nome de cada um, para dizer qual trava a nota
export const itensSemNcm = (itens: { nome?: string; ncm?: unknown }[]): string[] =>
  itens.map((i, k) => ({ i, k })).filter(({ i }) => !/^\d{8}$/.test(dig(i.ncm))).map(({ i, k }) => i.nome || `item ${k + 1}`);

// origem, unidade e GTIN do cadastro de Produtos (padrão 0, "Pc" e "SEM GTIN" quando não tem ou antes da migration)
export function dadosFiscais(p: { origem?: unknown; unidade?: unknown; gtin?: unknown } | null | undefined): { orig: number; unidade: string; gtin: string } {
  const o = parseInt(String(p?.origem ?? ''), 10);
  const un = String(p?.unidade ?? '').trim().slice(0, 6);
  const g = String(p?.gtin ?? '').trim();
  return { orig: o >= 0 && o <= 8 ? o : 0, unidade: un || 'Pc', gtin: g || 'SEM GTIN' };
}

// presença do comprador na nota (indPres): venda "Loja Física" = 1 (presencial); Motoboy, Correios e o resto = 2 (internet)
export type IndPres = 1 | 2;
export const presencaDaVenda = (deliveryType: unknown): IndPres => (String(deliveryType ?? '').trim() === 'loja_fisica' ? 1 : 2);
export const TEXTO_PRESENCA: Record<IndPres, string> = { 1: 'Venda presencial (loja)', 2: 'Venda não presencial (internet)' };

// ── nome do arquivo baixado (DANFE e XML) ──
// "Nota Fiscal - Amanda Rangel de Freitas.pdf"; teste: "Nota Fiscal - TESTE - …"; cancelada: "Nota Fiscal - CANCELADA - …".
// Sem os caracteres que o Windows não aceita (\ / : * ? " < > |) nem espaços duplos.
export const limparNomeArquivo = (s: unknown): string => String(s ?? '')
  .replace(/[\\/:*?"<>|]/g, ' ')
  .replace(/[^ -~\u00a0-\uffff]/g, ' ')   // caracteres de controle
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[. ]+$/, '')    // Windows não aceita nome terminando em ponto ou espaço
  .slice(0, 150)
  .trim();
const HOMOLOG_RE = /AMBIENTE DE HOMOLOGACAO/i;
const entidades: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// nome do cliente no XML (<dest><xNome>), menos o texto da SEFAZ das notas de teste
export function clienteDoXml(xml: unknown): string {
  const dest = String(xml ?? '').match(/<dest>([\s\S]*?)<\/dest>/);
  const nome = (dest?.[1].match(/<xNome>([\s\S]*?)<\/xNome>/)?.[1] || '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => entidades[e]).replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
  return HOMOLOG_RE.test(nome) ? '' : nome;
}
export function nomeArquivoNota(n: { cliente?: string | null; xml?: string | null; ambiente?: number; status?: string }, ext: 'pdf' | 'xml'): string {
  const nome = limparNomeArquivo(n.cliente && !HOMOLOG_RE.test(n.cliente) ? n.cliente : clienteDoXml(n.xml)) || 'Sem nome';
  return `${['Nota Fiscal', n.ambiente === 2 ? 'TESTE' : '', n.status === 'cancelada' ? 'CANCELADA' : '', nome].filter(Boolean).join(' - ')}.${ext}`;
}
// lote de DANFEs: várias notas = "Notas Fiscais - DD-MM-AAAA.pdf" (dia no horário de Brasília); uma só = nome da nota
export function nomeLoteDanfes(agora: Date = new Date()): string {
  const [a, m, d] = new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10).split('-');
  return `Notas Fiscais - ${d}-${m}-${a}.pdf`;
}

// cliente fora do RJ: a nota sai com CFOP 6102 (interestadual) e o botão só libera depois de marcar "Conferi"
export const AVISO_FORA_RJ = 'Cliente de fora do RJ: a nota sai com CFOP 6102 (operação interestadual). Confira antes de emitir.';
export const foraDoRj = (uf: unknown) => { const u = String(uf ?? '').trim().toUpperCase(); return u !== '' && u !== 'RJ'; };
export const podeEmitirUf = (uf: unknown, conferiu: boolean) => !foraDoRj(uf) || conferiu;

// ── brindes: NCM e código (cProd) ──
// Os brindes das vendas são, na prática, PRODUTOS vendidos a R$ 0,00 (sale_items: "Fone Bluetooth i12", pulseiras…),
// itens manuais a 0,00 e, raramente, acessórios (sale_accessories). O NCM vem do cadastro; se não houver, pelo nome.
export const NCM_PELO_NOME: [RegExp, string][] = [[/pulseira/i, '91139000'], [/\bfones?\b/i, '85183000']];
export const ncmPeloNome = (nome: unknown): string => {
  const s = String(nome ?? '');
  return (NCM_PELO_NOME.find(([re]) => re.test(s)) || [null, ''])[1];
};
// código legível para o cProd: "Fone Bluetooth" + "i12" → "FONE-I12"; sem complemento, o nome todo
const slug = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const codigoLegivel = (nome: unknown, complemento?: unknown): string => {
  const comp = slug(complemento);
  const base = comp ? slug(String(nome ?? '').trim().split(/\s+/)[0]) : slug(nome);
  return ([base, comp].filter(Boolean).join('-') || 'BRINDE').slice(0, 60);
};

// ── cancelamento ──
export const JUST_MIN = 15;
export const JUST_MAX = 255;
export const PRAZO_CANCELAR_MS = 24 * 3600 * 1000; // igual ao servidor (api/_lib/fiscal.js)
export function prazoCancelamento(n: { status?: string; autorizada_em?: string | null } | null, agora = new Date()) {
  if (!n || n.status !== 'autorizada' || !n.autorizada_em) return { pode: false, restanteMs: 0, vencido: false };
  const restanteMs = new Date(n.autorizada_em).getTime() + PRAZO_CANCELAR_MS - agora.getTime();
  return { pode: restanteMs > 0, restanteMs: Math.max(0, restanteMs), vencido: restanteMs <= 0 };
}
export const restanteTexto = (ms: number) => { const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3); return h ? `${h} h ${m} min` : `${m} min`; };

// a venda já tem nota pelo Tiny? (colunas antigas da venda)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const temNotaTiny = (v: any) => !!(v && (v.nfe_id || v.nfe_status || v.nfe_chave || v.nfe_url));

// selo da nota antiga do Tiny: número (tirado da chave de 44 dígitos, posições 26–34) e link para abrir, se houver
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function notaTiny(v: any): { numero: string | null; url: string | null } | null {
  if (!temNotaTiny(v)) return null;
  const chave = String(v.nfe_chave || '').replace(/D/g, '');
  const numero = chave.length === 44 ? String(Number(chave.slice(25, 34))) : null;
  const url = v.nfe_url || (chave ? `https://erp.olist.com/notas_fiscais#edit/${chave}` : null);
  return { numero, url };
}

// ── selo da nota própria no Histórico de Vendas ──
export interface NotaSelo { venda_id?: string | null; ambiente: number; numero: number; status: string; criado_em?: string }
export interface Selo { texto: string; cor: 'verde' | 'amarelo' | 'vermelho' | 'cinza'; teste: boolean }
const COR: Record<string, Selo['cor']> = { autorizada: 'verde', pendente: 'amarelo', emitindo: 'amarelo', rejeitada: 'vermelho', cancelada: 'cinza' };
const PRIORIDADE: Record<string, number> = { autorizada: 0, pendente: 1, emitindo: 1, cancelada: 2, rejeitada: 3 };
// a nota que representa a venda: rejeitada só se não houver outra; real antes de teste;
// autorizada > pendente > cancelada; mais nova primeiro
const peso = (n: NotaSelo) => (n.status === 'rejeitada' ? 100 : 0) + (n.ambiente === 2 ? 10 : 0) + (PRIORIDADE[n.status] ?? 9);
export function seloDaVenda(notas: NotaSelo[]): Selo | null {
  if (!notas.length) return null;
  const n = [...notas].sort((a, b) => (peso(a) - peso(b)) || String(b.criado_em || '').localeCompare(String(a.criado_em || '')))[0];
  const teste = n.ambiente === 2;
  const st = n.status === 'emitindo' ? 'pendente' : n.status;
  return { texto: `NF-e nº ${n.numero}${teste ? ' teste' : ''} ${st}`, cor: COR[n.status] || 'cinza', teste };
}
export function selosPorVenda(notas: NotaSelo[]): Record<string, Selo> {
  const por: Record<string, NotaSelo[]> = {};
  for (const n of notas) if (n.venda_id) (por[n.venda_id] ||= []).push(n);
  return Object.fromEntries(Object.entries(por).map(([id, l]) => [id, seloDaVenda(l) as Selo]));
}
