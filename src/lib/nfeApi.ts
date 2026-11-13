// 🧾 NF-e própria: chamadas à rota /api/nfe (função da Vercel) com o login do ERP, CEP → código IBGE (ViaCEP)
// e o rascunho da nota a partir da venda do Histórico (cliente + itens com o NCM do cadastro de Produtos).
import { supabase } from './supabase';
import { ncmDoBrinde } from './nfeRegras';

export interface NfeDest {
  doc: string; nome: string; email: string; fone: string; cep: string; endereco: string; numero: string;
  complemento: string; bairro: string; municipio: string; uf: string; cod_municipio: string;
}
export interface NfeItem { produto_id?: string | null; codigo: string; nome: string; ncm: string; qtd: number | string; valor: number | string; unidade?: string; brinde?: boolean }
export interface NfeNota {
  id: string; venda_id?: string | null; ambiente: number; serie: number; numero: number; chave: string | null;
  status: 'emitindo' | 'pendente' | 'autorizada' | 'rejeitada' | 'cancelada'; cstat: string | null; motivo: string | null;
  protocolo: string | null; cliente?: string | null; valor: number | null; criado_em: string; autorizada_em: string | null;
}
export interface NfeCert { ok: boolean; cnpj?: string; nome?: string; validade?: string; dias?: number; erro?: string | null }

export const HOMOLOG_DEST = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
export const HOMOLOG_ITEM = 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
export const STATUS_NFE: Record<string, string> = { autorizada: '✅ Autorizada', pendente: '⚠️ Pendente (sem resposta)', emitindo: '⏳ Enviando', rejeitada: '❌ Rejeitada', cancelada: '⛔ Cancelada' };

const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
// aceita "1.234,56", "1234,56" e "1234.56"
export const numBR = (v: unknown) => {
  const s = String(v ?? '').trim();
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : 0;
};

async function cabecalhos() {
  const { data } = await supabase.auth.getSession();
  const jwt = data?.session?.access_token || '';
  return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
}
async function lerResposta(r: Response) {
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('sessão expirada: faça login de novo no ERP');
  if (!r.ok) throw new Error(j.error || `erro ${r.status} na rota /api/nfe`);
  return j;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nfeGet(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  return lerResposta(await fetch(`/api/nfe?${qs}`, { headers: await cabecalhos() }));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nfePost(corpo: Record<string, unknown>): Promise<any> {
  return lerResposta(await fetch('/api/nfe', { method: 'POST', headers: await cabecalhos(), body: JSON.stringify(corpo) }));
}

// CEP → rua, bairro, cidade, UF e código IBGE do município
export async function cepComIbge(cep: string): Promise<{ endereco: string; bairro: string; municipio: string; uf: string; cod_municipio: string } | null> {
  const d = dig(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j.erro) return null;
    return { endereco: j.logradouro || '', bairro: j.bairro || '', municipio: j.localidade || '', uf: j.uf || '', cod_municipio: j.ibge || '' };
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Venda = Record<string, any>;
// monta o rascunho da nota com o que está na venda (os itens vêm do banco; o NCM do cadastro de Produtos)
export async function rascunhoDaVenda(venda: Venda): Promise<{ dest: NfeDest; itens: NfeItem[]; desconto: number; frete: number; total: number }> {
  const [{ data: itens }, brindes] = await Promise.all([
    supabase.from('sale_items').select('product_id, quantity, unit_price, products(id, model, color, sku, ncm)').eq('sale_id', venda.id),
    supabase.from('sale_accessories').select('quantity, custom_name, accessories(name, ncm)').eq('sale_id', venda.id),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let acess: any[] | null = brindes.data;
  // antes da migration accessories.ncm a coluna não existe: busca sem ela (o brinde fica sem NCM e a nota trava)
  if (brindes.error) acess = (await supabase.from('sale_accessories').select('quantity, custom_name, accessories(name)').eq('sale_id', venda.id)).data;
  const linhas: NfeItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of (itens || []) as any[]) {
    const p = Array.isArray(it.products) ? it.products[0] : it.products;
    const valor = r2(Number(it.unit_price) || 0);
    linhas.push({
      produto_id: it.product_id, codigo: String(p?.sku || String(it.product_id || '').replace(/-/g, '').slice(0, 8)).toUpperCase(),
      nome: p ? `${p.model || ''} ${p.color || ''}`.trim() : 'Produto', ncm: dig(p?.ncm), qtd: Number(it.quantity) || 1, valor, brinde: valor === 0,
    });
  }
  const manuais = Array.isArray(venda.manual_items) ? venda.manual_items : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manuais.forEach((m: any, k: number) => linhas.push({ codigo: `MAN${k + 1}`, nome: String(m.name || 'Item').trim(), ncm: dig(m.ncm), qtd: Number(m.quantity) || 1, valor: r2(Number(m.price) || 0), brinde: !(Number(m.price) > 0) }));
  // brindes (acessórios da venda) entram com valor 0,00, como no Tiny; o NCM vem do cadastro de Acessórios
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (acess || []).forEach((a: any, k: number) => {
    const ac = Array.isArray(a.accessories) ? a.accessories[0] : a.accessories;
    linhas.push({ codigo: `BRINDE${k + 1}`, nome: String(a.custom_name || ac?.name || 'Brinde').trim(), ncm: ncmDoBrinde(a), qtd: Number(a.quantity) || 1, valor: 0, brinde: true });
  });
  linhas.sort((a, b) => Number(!!a.brinde) - Number(!!b.brinde)); // itens pagos primeiro
  const bruto = r2(linhas.reduce((s, i) => s + numBR(i.qtd) * numBR(i.valor), 0));
  const total = r2(Number(venda.total_sale_price) || 0);
  const desconto = total > 0 && total < bruto ? r2(bruto - total) : 0;
  const dest: NfeDest = {
    doc: dig(venda.customer_cpf), nome: String(venda.customer_name || '').trim(), email: '', fone: dig(venda.customer_phone),
    cep: dig(venda.zip_code), endereco: String(venda.address_street || '').trim(), numero: String(venda.address_number || '').trim(),
    complemento: String(venda.address_complement || '').trim(), bairro: String(venda.neighborhood || '').trim(),
    municipio: String(venda.city || '').trim(), uf: String(venda.state || 'RJ').trim().toUpperCase().slice(0, 2), cod_municipio: '',
  };
  const c = await cepComIbge(dest.cep);
  if (c) { dest.cod_municipio = c.cod_municipio; dest.municipio = c.municipio || dest.municipio; dest.uf = c.uf || dest.uf; if (!dest.endereco) dest.endereco = c.endereco; if (!dest.bairro) dest.bairro = c.bairro; }
  return { dest, itens: linhas, desconto, frete: 0, total };
}

function baixarArquivo(nome: string, conteudo: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(conteudo); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export async function baixarXml(notaId: string) {
  const j = await nfeGet({ op: 'xml', id: notaId });
  if (j.erro || !j.xml) throw new Error(j.erro || 'XML não encontrado');
  baixarArquivo(`${j.chave || `nfe-${j.numero}`}${j.status === 'autorizada' ? '-procNFe' : '-assinado'}.xml`, new Blob([j.xml], { type: 'application/xml' }));
}
export async function baixarDanfe(notaId: string) {
  const j = await nfeGet({ op: 'xml', id: notaId });
  if (j.erro || !j.xml) throw new Error(j.erro || 'XML não encontrado');
  if (j.status !== 'autorizada' && j.status !== 'cancelada') throw new Error('o DANFE só sai de nota autorizada');
  const { gerarDanfe } = await import('./danfe');
  const pdf = await gerarDanfe(j.xml, { cancelada: j.status === 'cancelada' });
  pdf.save(`DANFE-${String(j.numero).padStart(9, '0')}-serie${j.serie}${j.ambiente === 2 ? '-HOMOLOGACAO' : ''}.pdf`);
}
