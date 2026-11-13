// 🧾 Regras de negócio da NF-e própria: pedido da tela → conferência → número → XML assinado guardado → SEFAZ.
// Fluxo (docs/emissor-nfe-guia.md): confere → reserva o número (RPC atômica) → monta e assina → GUARDA o XML assinado
// → envia. Autorizada: guarda o nfeProc. Rejeitada: o número volta. Sem resposta: fica "pendente" (botão Consultar SEFAZ).
// Nunca duas notas autorizadas/pendentes para a mesma venda no mesmo ambiente (conferido aqui e por índice único no banco).
// Produção (ambiente 1) só com a chave "Liberar notas reais" LIGADA NO BANCO (nfe_config.producao_liberada):
// o servidor lê a configuração a cada emissão e não confia no que a tela manda. Sem a migration da fase 2 = só teste.
// Cancelamento (evento 110111): só nota autorizada, até 24 h depois da autorização, no ambiente da própria nota;
// o procEventoNFe fica em nfe_notas.dados.cancelamento (não precisa de coluna nova).
import * as NFE from './nfe.js';

export const MIGRATION_FASE2 = 'supabase/migrations/20261122120000_nfe_producao.sql';
export const producaoLiberada = (cfg) => cfg?.producao_liberada === true;
export const ambientesLiberados = (cfg) => (producaoLiberada(cfg) ? [1, 2] : [2]);
export const PRAZO_CANCELAR_MS = 24 * 3600 * 1000;
// pode cancelar? (autorizada e dentro das 24 h contadas da autorização)
export function prazoCancelamento(n, agora = new Date()) {
  if (!n || n.status !== 'autorizada' || !n.autorizada_em) return { pode: false, restanteMs: 0, vencido: false };
  const restanteMs = new Date(n.autorizada_em).getTime() + PRAZO_CANCELAR_MS - agora.getTime();
  return { pode: restanteMs > 0, restanteMs: Math.max(0, restanteMs), vencido: restanteMs <= 0 };
}
// a venda já tem nota pelo Tiny? (colunas antigas da venda: nfe_id, nfe_status, nfe_chave, nfe_url)
export const temNotaTiny = (v) => !!(v && (v.nfe_id || v.nfe_status || v.nfe_chave || v.nfe_url));
const CANC_EM = 'cancelada_em:dados->cancelamento->>em';
export const TPAG = { '90': 'Sem pagamento', '01': 'Dinheiro', '03': 'Cartão de crédito', '04': 'Cartão de débito', '17': 'PIX', '99': 'Outros' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const { r2, dig } = NFE;
const ATIVAS = 'emitindo,pendente,autorizada';
const STATUS_TXT = { autorizada: 'autorizada', pendente: 'pendente (sem resposta da SEFAZ)', emitindo: 'sendo enviada', rejeitada: 'rejeitada', cancelada: 'cancelada' };

// ctx: { db, cert: () => certificado|null, soapOpts?: { transporte, esperaMs }, agora?: () => Date }
export function infoCert(ctx) {
  try {
    const c = ctx.cert();
    if (!c) return { ok: false, erro: 'certificado não configurado (NFE_CERT_B64 e NFE_CERT_SENHA na Vercel)' };
    const dias = Math.floor((c.validade.getTime() - Date.now()) / 864e5);
    return { ok: dias >= 0, cnpj: c.cnpj, nome: c.nome, validade: c.validade.toISOString().slice(0, 10), dias, erro: dias >= 0 ? null : 'certificado vencido' };
  } catch (e) { return { ok: false, erro: `não consegui abrir o certificado (senha ou base64 errados?): ${e.message}` }; }
}

export async function config(db) {
  const [c] = await db.select('nfe_config', 'select=*&id=eq.1&limit=1');
  if (!c) throw new Error('nfe_config vazia: aplique a migration das notas fiscais no Supabase');
  return c;
}

const CAMPOS_EMIT = ['cnpj', 'ie', 'razao', 'fantasia', 'logradouro', 'numero', 'complemento', 'bairro', 'cep', 'cod_municipio', 'municipio', 'uf', 'fone', 'crt'];
export async function salvarConfig(ctx, b) {
  const { db } = ctx;
  const atual = await config(db);
  const e = { ...(atual.emitente || {}), ...(b.emitente || {}) };
  const emitente = {};
  for (const k of CAMPOS_EMIT) if (e[k] !== undefined && e[k] !== null) emitente[k] = String(e[k]).trim().slice(0, 120);
  for (const k of ['cnpj', 'ie', 'cep', 'cod_municipio', 'fone']) if (emitente[k]) emitente[k] = dig(emitente[k]);
  if (emitente.uf) emitente.uf = emitente.uf.toUpperCase().slice(0, 2);
  const rs = e.resp || {};
  emitente.resp = { cnpj: dig(rs.cnpj).slice(0, 14), contato: String(rs.contato || '').trim().slice(0, 60), email: String(rs.email || '').trim().slice(0, 60), fone: dig(rs.fone).slice(0, 14) };
  if (emitente.cnpj && !NFE.cnpjValido(emitente.cnpj)) return { erro: 'CNPJ do emitente inválido' };
  if (emitente.cod_municipio && !/^\d{7}$/.test(emitente.cod_municipio)) return { erro: 'código IBGE do município precisa de 7 números' };
  const patch = {
    emitente,
    serie: Math.max(1, Math.min(889, parseInt(b.serie ?? atual.serie, 10) || 2)),
    natop: String(b.natop ?? atual.natop).trim().slice(0, 60) || atual.natop,
    ibpt_fed: Math.max(0, Math.min(100, num(b.ibpt_fed ?? atual.ibpt_fed))),
    ibpt_est: Math.max(0, Math.min(100, num(b.ibpt_est ?? atual.ibpt_est))),
    tpag: TPAG[String(b.tpag ?? atual.tpag)] ? String(b.tpag ?? atual.tpag) : '90',
    info: String(b.info ?? atual.info ?? '').slice(0, 1000),
    atualizado_em: new Date().toISOString(),
  };
  // próximo número de homologação: só muda se pedir, e nunca para trás de uma nota já emitida
  if (b.proximo_homolog !== undefined && b.proximo_homolog !== '' && Number(b.proximo_homolog) !== Number(atual.proximo_homolog)) {
    const pedido = parseInt(b.proximo_homolog, 10);
    if (!(pedido > 0)) return { erro: 'próximo número inválido' };
    const [ult] = await db.select('nfe_notas', `select=numero&ambiente=eq.2&serie=eq.${patch.serie}&status=in.(emitindo,pendente,autorizada,cancelada)&order=numero.desc&limit=1`);
    if (ult && pedido <= ult.numero) return { erro: `o próximo número precisa ser maior que ${ult.numero} (última nota de teste)` };
    patch.proximo_homolog = pedido;
  }
  // próximo número de produção: mesma regra (nunca para trás de uma nota real já emitida)
  if (b.proximo_producao !== undefined && b.proximo_producao !== '' && Number(b.proximo_producao) !== Number(atual.proximo_producao)) {
    const pedido = parseInt(b.proximo_producao, 10);
    if (!(pedido > 0)) return { erro: 'próximo número de produção inválido' };
    const [ult] = await db.select('nfe_notas', `select=numero&ambiente=eq.1&serie=eq.${patch.serie}&status=in.(emitindo,pendente,autorizada,cancelada)&order=numero.desc&limit=1`);
    if (ult && pedido <= ult.numero) return { erro: `o próximo número de produção precisa ser maior que ${ult.numero} (última nota real)` };
    patch.proximo_producao = pedido;
  }
  await db.patch('nfe_config', 'id=eq.1', patch);
  return { ok: true };
}

export async function painel(ctx) {
  const [cfg, notas] = await Promise.all([
    config(ctx.db),
    ctx.db.select('nfe_notas', 'select=id,venda_id,ambiente,serie,numero,chave,status,cstat,motivo,protocolo,cliente,valor,criado_em,autorizada_em&order=criado_em.desc&limit=200'),
  ]);
  return { config: cfg, cert: infoCert(ctx), notas, ambientes: ambientesLiberados(cfg), producao_liberada: producaoLiberada(cfg), tpag: TPAG };
}

// liga/desliga as notas reais (produção). Ligar pede confirmação e acerta o próximo número de produção antes.
export async function liberarProducao(ctx, b) {
  const { db } = ctx;
  const atual = await config(db);
  if (!('producao_liberada' in atual)) return { erro: `Aplique no Supabase a migration da fase 2 (${MIGRATION_FASE2}) antes de liberar as notas reais.` };
  const agora = new Date().toISOString();
  if (!b.ligar) { await db.patch('nfe_config', 'id=eq.1', { producao_liberada: false, atualizado_em: agora }); return { ok: true, producao_liberada: false }; }
  if (b.confirmar !== true) return { erro: 'confirme para liberar as notas reais' };
  const ci = infoCert(ctx);
  if (!ci.ok) return { erro: `certificado: ${ci.erro}` };
  const pedido = parseInt(b.proximo_producao ?? atual.proximo_producao, 10);
  if (!(pedido > 0)) return { erro: 'próximo número de produção inválido' };
  const [ult] = await db.select('nfe_notas', `select=numero&ambiente=eq.1&serie=eq.${atual.serie}&status=in.(emitindo,pendente,autorizada,cancelada)&order=numero.desc&limit=1`);
  if (ult && pedido <= ult.numero) return { erro: `o próximo número precisa ser maior que ${ult.numero} (última nota real)` };
  await db.patch('nfe_config', 'id=eq.1', { producao_liberada: true, producao_liberada_em: agora, proximo_producao: pedido, atualizado_em: agora });
  return { ok: true, producao_liberada: true, proximo_producao: pedido, serie: atual.serie };
}

// lista da tela Notas fiscais: só leitura, por ambiente e período de emissão (criado_em); o resto (abas, busca,
// ordem, páginas) a tela faz em cima disso. Campos leves: nada de XML.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
export const LIMITE_LISTA = 3000;
export async function lista(ctx, q = {}) {
  const f = [`select=id,venda_id,ambiente,serie,numero,chave,status,cstat,motivo,protocolo,cliente,valor,criado_em,autorizada_em,uf:dados->dest->>uf,doc:dados->dest->>doc,${CANC_EM}`];
  if (q.amb === '1' || q.amb === '2') f.push(`ambiente=eq.${q.amb}`);
  if (q.de) { if (!ISO.test(q.de)) return { erro: 'data inicial inválida' }; f.push(`criado_em=gte.${encodeURIComponent(q.de)}`); }
  if (q.ate) { if (!ISO.test(q.ate)) return { erro: 'data final inválida' }; f.push(`criado_em=lt.${encodeURIComponent(q.ate)}`); }
  f.push('order=criado_em.desc', `limit=${LIMITE_LISTA + 1}`);
  const notas = await ctx.db.select('nfe_notas', f.join('&'));
  return { notas: notas.slice(0, LIMITE_LISTA), truncado: notas.length > LIMITE_LISTA };
}

// selo da nota própria no Histórico de Vendas (só o necessário de cada nota)
export async function selos(ctx) {
  const notas = await ctx.db.select('nfe_notas', 'select=venda_id,ambiente,numero,status,criado_em&venda_id=not.is.null&order=criado_em.desc&limit=5000');
  return { notas };
}

// XMLs de um mês para o contador: só produção, autorizadas e canceladas (com o XML do cancelamento), pela data de
// autorização no horário do RJ (-03:00). Em partes de 50 (a resposta da Vercel tem limite de tamanho).
export const PARTE_XMLS = 50;
export async function xmlsDoMes(ctx, mes, offset = 0) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || ''))) return { erro: 'mês inválido (use AAAA-MM)' };
  const [a, m] = mes.split('-').map(Number);
  const ini = new Date(Date.UTC(a, m - 1, 1, 3)).toISOString(), fim = new Date(Date.UTC(a, m, 1, 3)).toISOString();
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const notas = await ctx.db.select('nfe_notas', `select=id,numero,serie,chave,status,xml,xml_canc:dados->cancelamento->>xml,autorizada_em&ambiente=eq.1&status=in.(autorizada,cancelada)&autorizada_em=gte.${ini}&autorizada_em=lt.${fim}&order=numero.asc&limit=${PARTE_XMLS + 1}&offset=${off}`);
  return { mes, notas: notas.slice(0, PARTE_XMLS), mais: notas.length > PARTE_XMLS, proximo: off + PARTE_XMLS };
}

export async function notasDaVenda(ctx, vendaId) {
  if (!UUID.test(String(vendaId || ''))) return { erro: 'venda inválida' };
  const [notas, cfg] = await Promise.all([
    ctx.db.select('nfe_notas', `select=id,ambiente,serie,numero,chave,status,cstat,motivo,protocolo,valor,criado_em,autorizada_em,${CANC_EM}&venda_id=eq.${vendaId}&order=criado_em.desc&limit=20`),
    config(ctx.db).catch(() => null),
  ]);
  return { notas, cert: infoCert(ctx), producao_liberada: producaoLiberada(cfg), ambientes: ambientesLiberados(cfg) };
}

// pedido da tela → dados limpos
export function limparPedido(b) {
  const d = b.dest || {};
  const s = (v, max = 60) => String(v ?? '').trim().slice(0, max);
  return {
    dest: { doc: dig(d.doc), nome: s(d.nome), email: s(d.email), fone: dig(d.fone), cep: dig(d.cep), endereco: s(d.endereco), numero: s(d.numero) || 'S/N', complemento: s(d.complemento), bairro: s(d.bairro), municipio: s(d.municipio), uf: s(d.uf, 2).toUpperCase(), cod_municipio: dig(d.cod_municipio) },
    itens: (Array.isArray(b.itens) ? b.itens : []).slice(0, 100).map((i) => ({
      produto_id: i.produto_id ? s(i.produto_id, 40) : null,
      codigo: s(i.codigo, 60), nome: s(i.nome, 120), ncm: dig(i.ncm), cest: dig(i.cest),
      unidade: s(i.unidade || 'Pc', 6) || 'Pc', gtin: NFE.gtinNota(i.gtin), orig: Math.max(0, Math.min(8, parseInt(i.orig, 10) || 0)), csosn: '102',
      qtd: num(i.qtd), valor: r2(num(i.valor)), brinde: !!i.brinde,
    })).filter((i) => i.qtd > 0),
    desconto: Math.max(0, r2(num(b.desconto))),
    frete: Math.max(0, r2(num(b.frete))),
  };
}

// ── emitir ──
export async function emitir(ctx, b) {
  const { db } = ctx;
  const ambiente = Number(b.ambiente ?? 2);
  if (![1, 2].includes(ambiente)) return { erro: 'ambiente inválido' };
  const cfg = await config(db);
  // trava de produção: vale o que está NO BANCO, não o que a tela mandou
  if (ambiente === 1 && !producaoLiberada(cfg)) return { erro: 'notas reais (produção) não liberadas: ligue "Liberar notas reais" em Notas fiscais › Emitente e numeração', producao_bloqueada: true };
  const emit = cfg.emitente || {};
  if (!emit.cnpj || !emit.ie || !emit.cod_municipio || !emit.razao) return { erro: 'preencha os dados da empresa (CNPJ, IE, razão social, endereço) em Notas fiscais › Configuração' };
  const p = limparPedido(b);
  const problemas = NFE.conferir({ dest: p.dest, itens: p.itens });
  if (problemas.length) return { erro: `confira: ${problemas.join('; ')}`, sem_ncm: NFE.itensSemNcm(p.itens) };
  const bruto = r2(p.itens.reduce((a, i) => a + i.qtd * i.valor, 0));
  if (p.desconto >= bruto) return { erro: 'o desconto não pode ser maior ou igual ao total dos produtos' };
  const ci = infoCert(ctx);
  if (!ci.ok) return { erro: ci.erro };
  const cert = ctx.cert();
  if (cert.cnpj && dig(emit.cnpj) !== cert.cnpj) return { erro: `o CNPJ da empresa (${emit.cnpj}) não é o mesmo do certificado (${cert.cnpj})` };
  const vendaId = b.venda_id ? String(b.venda_id) : null;
  if (vendaId && !UUID.test(vendaId)) return { erro: 'venda inválida' };
  if (vendaId && ambiente === 1 && b.confirmar_tiny !== true) {
    const [v] = await db.select('sales', `select=nfe_id,nfe_status,nfe_chave,nfe_url&id=eq.${vendaId}&limit=1`).catch(() => []);
    if (temNotaTiny(v)) return { erro: 'Esta venda já tem nota emitida pelo Tiny. Confirme antes de emitir outra.', tiny: true };
  }
  if (vendaId) {
    const [ja] = await db.select('nfe_notas', `select=id,numero,status&ambiente=eq.${ambiente}&venda_id=eq.${vendaId}&status=in.(${ATIVAS})&limit=1`);
    if (ja) return { erro: ja.status === 'autorizada' ? `essa venda já tem a nota nº ${ja.numero} autorizada` : `a nota nº ${ja.numero} dessa venda está ${STATUS_TXT[ja.status] || ja.status}: clique em "Consultar SEFAZ" antes`, id: ja.id, status: ja.status };
  }

  const devolver = (n) => db.rpc('nfe_devolver', { p_ambiente: ambiente, p_numero: n }).catch(() => false);
  const numero = Number(await db.rpc('nfe_reservar', { p_ambiente: ambiente }));
  if (!(numero > 0)) return { erro: 'não consegui reservar o número da nota' };
  const data = ctx.agora ? ctx.agora() : new Date();
  const uf = String(emit.uf || 'RJ').toUpperCase();
  const nota = {
    ambiente, serie: cfg.serie, numero, data, cNF: NFE.novoCNF(numero), natOp: cfg.natop, indPres: 2,
    dest: p.dest, itens: p.itens, desconto: p.desconto, frete: p.frete,
    pagamento: { tPag: cfg.tpag || '90' }, info: cfg.info, ibpt: { fed: cfg.ibpt_fed, est: cfg.ibpt_est }, ibscbs: false,
  };
  let pre;
  try { pre = NFE.preparar(nota, emit, cert); } catch (e) { await devolver(numero); return { erro: `não consegui montar a nota: ${e.message}` }; }
  let linha;
  try {
    // o XML assinado fica guardado ANTES de mandar: se a resposta se perder, o "Consultar SEFAZ" fecha a nota com ele
    linha = await db.insert('nfe_notas', { venda_id: vendaId, ambiente, serie: cfg.serie, numero, chave: pre.chave, status: 'emitindo', cliente: p.dest.nome.slice(0, 120), valor: pre.vNF, dados: { ...p, venda_id: vendaId }, xml: pre.assinado });
  } catch (e) {
    await devolver(numero);
    if (e.code === '23505') return { erro: 'já existe uma nota ativa para essa venda (ou esse número): atualize a tela' };
    return { erro: `não consegui registrar a nota: ${e.message}` };
  }
  const salvar = (patch) => db.patch('nfe_notas', `id=eq.${linha.id}`, { ...patch, atualizado_em: new Date().toISOString() });
  const pendente = async (motivo, cstat = null) => {
    await salvar({ status: 'pendente', cstat, motivo: String(motivo).slice(0, 300) }).catch(() => {});
    return { pendente: true, id: linha.id, numero, erro: `${motivo}. A nota nº ${numero} ficou pendente: clique em "Consultar SEFAZ" antes de tentar de novo.` };
  };

  let r;
  try {
    r = await NFE.enviar(pre, { ambiente, uf }, cert, ctx.soapOpts);
    // sem IBS/CBS por padrão (igual ao Tiny); em homologação, se a SVRS exigir, manda de novo com o grupo (mesma chave)
    if (!r.autorizada && !r.pendente && ['1115', '225'].includes(String(r.cStat)) && ambiente === 2 && !nota.ibscbs) {
      nota.ibscbs = true;
      pre = NFE.preparar(nota, emit, cert);
      await salvar({ xml: pre.assinado, valor: pre.vNF });
      r = await NFE.enviar(pre, { ambiente, uf }, cert, ctx.soapOpts);
    }
  } catch (e) {
    return pendente(`a SEFAZ não respondeu (${e.message})`);
  }
  if (r.pendente) return pendente(r.motivo || 'lote em processamento', r.cStat);
  if (r.autorizada) {
    await salvar({ status: 'autorizada', cstat: r.cStat, motivo: r.motivo, protocolo: r.protocolo, chave: r.chave, xml: r.xml, autorizada_em: new Date().toISOString() });
    return { ok: true, id: linha.id, numero, serie: cfg.serie, chave: r.chave, protocolo: r.protocolo, ambiente, ibscbs: nota.ibscbs };
  }
  if (r.duplicada) return pendente(`SEFAZ: ${r.motivo}`, r.cStat);
  // rejeitada: a nota não existe na SEFAZ → o número volta para a próxima
  await salvar({ status: 'rejeitada', cstat: r.cStat, motivo: r.motivo, xml: r.assinado });
  await devolver(numero);
  return { erro: `SEFAZ rejeitou (${r.cStat}): ${r.motivo}`, rejeitada: true, cstat: r.cStat, motivo: r.motivo, dica: NFE.DICAS_REJEICAO[Number(r.cStat)] || null, id: linha.id };
}

async function pegarNota(db, id) {
  if (!UUID.test(String(id || ''))) return null;
  const [n] = await db.select('nfe_notas', `select=*&id=eq.${id}&limit=1`);
  return n || null;
}

// consulta na SEFAZ uma nota pendente (e fecha o nfeProc se ela tiver sido autorizada)
export async function consultar(ctx, id) {
  const { db } = ctx;
  const n = await pegarNota(db, id);
  if (!n) return { erro: 'nota não encontrada' };
  if (!['pendente', 'emitindo'].includes(n.status)) return { ok: true, status: n.status, motivo: n.motivo };
  const cert = ctx.cert(); if (!cert) return { erro: 'certificado não configurado' };
  const cfg = await config(db);
  const uf = String(cfg.emitente?.uf || 'RJ').toUpperCase();
  let r;
  try { r = await NFE.consultar(n.chave, uf, n.ambiente, cert, ctx.soapOpts); } catch (e) { return { erro: `a SEFAZ não respondeu (${e.message}); tente de novo em alguns minutos` }; }
  const salvar = (patch) => db.patch('nfe_notas', `id=eq.${n.id}`, { ...patch, atualizado_em: new Date().toISOString() });
  const cs = String(r.protCStat || r.cStat);
  if (['100', '150'].includes(cs) && r.protNFe) {
    const xml = n.xml && !n.xml.includes('<nfeProc') ? NFE.fecharProc(n.xml, r.protNFe) : n.xml;
    await salvar({ status: 'autorizada', cstat: cs, motivo: NFE.pega(r.protNFe, 'xMotivo') || r.motivo, protocolo: r.protocolo, xml, autorizada_em: n.autorizada_em || new Date().toISOString() });
    return { ok: true, status: 'autorizada', numero: n.numero, chave: n.chave, protocolo: r.protocolo };
  }
  if (['101', '151', '155'].includes(String(r.cStat))) { await salvar({ status: 'cancelada', cstat: r.cStat, motivo: r.motivo }); return { ok: true, status: 'cancelada', motivo: r.motivo }; }
  if (String(r.cStat) === '217') {
    // não existe na SEFAZ: libera o número
    await salvar({ status: 'rejeitada', cstat: '217', motivo: 'a nota não chegou na SEFAZ' });
    await db.rpc('nfe_devolver', { p_ambiente: n.ambiente, p_numero: n.numero }).catch(() => false);
    return { ok: true, status: 'rejeitada', motivo: 'a nota não chegou na SEFAZ; pode emitir de novo' };
  }
  return { ok: true, status: n.status, cstat: r.cStat, motivo: r.motivo };
}

export async function xml(ctx, id, tipo) {
  const n = await pegarNota(ctx.db, id);
  if (!n) return { erro: 'nota não encontrada' };
  const canc = n.dados?.cancelamento || null;
  if (tipo === 'cancelamento') {
    if (!canc?.xml) return { erro: 'essa nota não tem XML de cancelamento' };
    return { numero: n.numero, serie: n.serie, chave: n.chave, ambiente: n.ambiente, status: n.status, protocolo: canc.protocolo, xml: canc.xml, tipo };
  }
  return { numero: n.numero, serie: n.serie, chave: n.chave, ambiente: n.ambiente, status: n.status, protocolo: n.protocolo, xml: n.xml, tem_cancelamento: !!canc?.xml };
}

// cancela na SEFAZ (evento 110111) no ambiente da própria nota
export async function cancelar(ctx, id, justificativa) {
  const { db } = ctx;
  const n = await pegarNota(db, id);
  if (!n) return { erro: 'nota não encontrada' };
  if (n.status !== 'autorizada') return { erro: n.status === 'cancelada' ? 'essa nota já está cancelada' : 'só nota autorizada pode ser cancelada' };
  const just = NFE.justificativaLimpa(justificativa);
  if (just.length < 15) return { erro: 'a justificativa precisa de pelo menos 15 letras' };
  if (just.length > 255) return { erro: 'a justificativa pode ter no máximo 255 letras' };
  const agora = ctx.agora ? ctx.agora() : new Date();
  if (!prazoCancelamento(n, agora).pode) return { erro: 'passou do prazo de 24 h depois da autorização: a SEFAZ não aceita mais o cancelamento', prazo_vencido: true };
  const cert = ctx.cert(); if (!cert) return { erro: 'certificado não configurado' };
  const cfg = await config(db);
  const uf = String(cfg.emitente?.uf || 'RJ').toUpperCase();
  let r;
  try {
    r = await NFE.cancelar({ chave: n.chave, protocolo: n.protocolo, justificativa: just, ambiente: n.ambiente, cnpj: cfg.emitente?.cnpj || cert.cnpj, uf, data: agora }, cert, ctx.soapOpts);
  } catch (e) { return { erro: `a SEFAZ não respondeu (${e.message}); a nota continua autorizada, tente de novo` }; }
  if (!r.cancelada) return { erro: `SEFAZ não cancelou (${r.cStat}): ${r.motivo}`, cstat: r.cStat, motivo: r.motivo, dica: NFE.DICAS_REJEICAO[Number(r.cStat)] || null };
  const em = new Date().toISOString();
  await db.patch('nfe_notas', `id=eq.${n.id}`, {
    status: 'cancelada', cstat: r.cStat, motivo: r.motivo, atualizado_em: em,
    dados: { ...(n.dados || {}), cancelamento: { xml: r.xml, protocolo: r.protocolo, cstat: r.cStat, motivo: r.motivo, justificativa: just, em, registrado: r.registrado } },
  });
  return { ok: true, status: 'cancelada', numero: n.numero, protocolo: r.protocolo, cstat: r.cStat, motivo: r.motivo };
}

export async function statusSefaz(ctx) {
  const cert = ctx.cert(); if (!cert) return { erro: 'certificado não configurado' };
  const cfg = await config(ctx.db);
  const uf = String(cfg.emitente?.uf || 'RJ').toUpperCase();
  const um = (amb) => NFE.status(uf, amb, cert, ctx.soapOpts).catch((e) => ({ erro: e.message }));
  const [homologacao, producao] = await Promise.all([um(2), um(1)]);
  return { uf, autorizador: NFE.WS_UF[uf] || null, homologacao, producao };
}
