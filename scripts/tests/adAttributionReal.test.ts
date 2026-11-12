// Revisão do modo "Estimado" e dos números do topo do Gerenciador de Anúncios contra os DADOS REAIS (SOMENTE LEITURA).
//   node scripts/tests/adAttributionReal.test.ts
// O mesmo carregamento da página (src/lib/adInsightsDb.ts / waTrackingDb.ts), com o cliente realReadOnly.ts (só
// GET/HEAD; qualquer escrita dá erro na hora). Mostra só totais e contagens (sem nomes nem telefones). Confere:
//   - nenhuma venda contada duas vezes (em dois anúncios, ou identificada E Instagram);
//   - identificadas + Instagram orgânico + sem origem = todas as vendas do período (quantidade e R$);
//   - a repartição soma exatamente as vendas sem origem repartíveis; Instagram orgânico fica fora;
//   - ROAS geral / identificado = faturamento ÷ (gasto + imposto);
//   - conversa com dois anúncios diferentes (wa_leads × wa_ad_attribution), venda antes do 1º contato, fuso
//     (sale_date × created_at em São Paulo) e as diferenças entre o topo e a soma dos cartões — listadas como avisos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readOnlyClient } from './realReadOnly.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg: { self: { WA_CONFIG?: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string } } } = { self: {} };
vm.runInNewContext(fs.readFileSync(path.join(HERE, '..', '..', 'extension', 'config.js'), 'utf8'), cfg);
const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg.self.WA_CONFIG!;
const queries: [string, string][] = [];
(globalThis as unknown as { __RO_SUPABASE: unknown }).__RO_SUPABASE = readOnlyClient(SUPABASE_URL, SUPABASE_ANON_KEY, (m, p) => queries.push([m, p]));
const shim = `data:text/javascript,${encodeURIComponent('export const supabase = globalThis.__RO_SUPABASE;')}`;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (/^\\.{1,2}\\/(.*\\/)?supabase$/.test(spec) && ctx.parentURL && ctx.parentURL.includes('/src/lib/')) return { url: ${JSON.stringify(shim)}, shortCircuit: true };
  if (/^\\.{1,2}\\//.test(spec) && !/\\.[a-z]+$/i.test(spec)) return next(spec + '.ts', ctx);
  return next(spec, ctx);
}`)}`, pathToFileURL(HERE + path.sep));
const src = (f: string) => pathToFileURL(path.join(HERE, '..', '..', 'src', 'lib', f)).href;
const A = await import(src('adInsights.ts')) as typeof import('../../src/lib/adInsights.ts');
const T = await import(src('waTracking.ts')) as typeof import('../../src/lib/waTracking.ts');
const P = await import(src('waPanel.ts')) as typeof import('../../src/lib/waPanel.ts');
const AD = await import(src('adInsightsDb.ts')) as typeof import('../../src/lib/adInsightsDb.ts');
const SC = await import(src('systemConfig.ts')) as typeof import('../../src/lib/systemConfig.ts');

await SC.loadSystemConfig();
const tax = SC.getConfigNumber('ad_tax_rate');
const money = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
const warns: string[] = [];
const warn = (s: string) => { warns.push(s); };

const trackStart = await AD.loadTrackStart(true);
console.log(`Início do rastreio conversa → anúncio: ${trackStart == null ? '—' : new Date(trackStart).toISOString()} (${trackStart == null ? '' : P.spDay(trackStart)} em São Paulo)`);

for (const days of ['7', '30'] as const) {
  const r = A.adRanges(days);
  const erp = await AD.loadErp(r, true);
  const model = T.buildConversations(erp.input, T.businessHoursOf(erp.settings));
  let meta: { daily: import('../../src/lib/adInsights.ts').MetaDaily[] } = { daily: [] };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ad-manager`, { method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dashboard', part: 'metrics', ...A.metaFetchWindow(r) }) });
    const d = await res.json();
    if (d && d.success && Array.isArray(d.daily)) meta = { daily: d.daily }; else console.log(`⚠ Meta: ${(d && d.error) || res.status}`);
  } catch (e) { console.log(`⚠ Meta: ${e instanceof Error ? e.message : e}`); }
  const w = r.cur;
  const byAd = A.erpByAd(model, w);
  const sales = A.periodSales(erp.input.sales, w);
  const ig = A.igOrganicSaleIds(model, w);
  const costs = await AD.loadSaleCosts(sales.map((s) => s.id));
  const att = A.attributeSales(byAd, sales, costs, trackStart, ig);
  const old = A.attributeSales(byAd, sales, costs, trackStart); // como era antes (Instagram repartido)
  console.log(`\n══ ${days} dias: ${w.fromDay} a ${w.toDay} ══`);
  console.log(`  vendas do período ${att.all.count} (${money(att.all.revenue)}) = identificadas ${att.identified.count} (${money(att.identified.revenue)}) + Instagram orgânico ${att.instagram.count} (${money(att.instagram.revenue)}) + sem origem ${att.unattributed.count} (${money(att.unattributed.revenue)})`);
  console.log(`  sem origem: ${att.preTrack.count} antes do rastreio (${money(att.preTrack.revenue)}, não repartidas) + ${att.distributable.count} repartíveis (${money(att.distributable.revenue)}) · conversas de anúncio ${att.totalConversations} · repartiu: ${att.distributed ? 'sim' : 'não'}`);

  // ── contas que precisam fechar ──
  const ids = [...byAd.values()].flatMap((a) => a.saleIds);
  assert.equal(new Set(ids).size, ids.length, 'venda contada em dois anúncios');
  assert.ok(att.identified.ids.every((id) => !att.instagram.ids.includes(id)), 'venda identificada E Instagram');
  assert.equal(att.identified.count + att.instagram.count + att.unattributed.count, att.all.count, 'identificadas + Instagram + sem origem = todas');
  assert.ok(near(att.identified.revenue + att.instagram.revenue + att.unattributed.revenue, att.all.revenue), 'R$: identificadas + Instagram + sem origem = todas');
  assert.equal(att.preTrack.count + att.distributable.count, att.unattributed.count, 'sem origem = antes do rastreio + repartíveis');
  const sh = [...att.shares.values()];
  if (att.distributed) {
    assert.ok(near(sh.reduce((x, s) => x + s.sales, 0), att.distributable.count), 'repartição soma as vendas repartíveis');
    assert.ok(near(sh.reduce((x, s) => x + s.revenue, 0), att.distributable.revenue), 'repartição soma o R$ repartível');
  }
  assert.ok(att.instagram.ids.every((id) => ig.has(id)) && !att.distributable.ids.some((id) => ig.has(id)), 'Instagram orgânico fora da repartição');
  const trio = A.roasTrio(meta.daily, tax, w, att);
  const spend = A.spendReal(A.metaSpendIn(meta.daily, w), tax);
  if (spend > 0) { assert.ok(near(trio.general! * spend, att.all.revenue) && near(trio.identified! * spend, att.identified.revenue), 'ROAS = R$ ÷ (gasto + imposto)'); }
  console.log(`  ROAS geral ${trio.general == null ? '—' : trio.general.toFixed(2)} · identificado ${trio.identified == null ? '—' : trio.identified.toFixed(2)} · gasto com imposto ${money(spend)}`);

  // ── avisos (o que pode estar errado nos dados ou na regra) ──
  if (att.instagram.count) warn(`${days} dias: ${att.instagram.count} venda(s) do Instagram orgânico (${money(att.instagram.revenue)}) ERAM repartidas entre os anúncios no modo Estimado (antes: ${old.distributable.count} repartíveis, agora ${att.distributable.count}).`);
  const cards = A.buildAdCards({ model, meta: meta.daily, period: [], costs, taxRate: tax, goals: A.DEFAULT_GOALS, mode: 'estimado', attribution: att }, w);
  const cardsRev = cards.reduce((x, c) => x + c.money.revenue, 0);
  const tE = A.totalsOf(model, meta.daily, costs, tax, w, { mode: 'estimado', attribution: att });
  if (Math.abs(cardsRev - tE.revenue) > 0.05) warn(`${days} dias: no modo Estimado o "Faturamento" do topo (${money(tE.revenue)}, todas as vendas) ≠ soma dos cartões (${money(cardsRev)}); a diferença (${money(tE.revenue - cardsRev)}) = Instagram orgânico ${money(att.instagram.revenue)} + antes do rastreio ${money(att.preTrack.revenue)}${att.distributed ? '' : ` + sem origem não repartidas ${money(att.distributable.revenue)}`}.`);
  const noId = byAd.get('sem-id');
  const noIdShare = att.shares.get('sem-id');
  if (noId && noId.conversations) warn(`${days} dias: ${noId.conversations} conversa(s) de anúncio SEM ad_id entram na repartição como "Anúncio não identificado"${noIdShare ? ` (${A.salesTxt(noIdShare.sales)} venda(s) estimada(s), ${money(noIdShare.revenue)})` : ''}: essa parte não aparece em nenhum anúncio da Meta.`);
  // venda de conversa de anúncio ANTES do 1º contato: vira "sem origem" e é repartida
  const before = model.conversations.filter((c) => c.ad && c.tracked).flatMap((c) => c.saleLinks.filter((s) => s.t >= w.from && s.t <= w.to && s.t < c.firstAt));
  if (before.length) warn(`${days} dias: ${before.length} venda(s) (${money(before.reduce((x, s) => x + s.total, 0))}) de conversas de anúncio feitas ANTES do 1º contato registrado: ficam "sem origem" e entram na repartição.`);
  // vendas de conversas orgânicas rastreadas (não Instagram) que entram como "sem origem"
  const orgTracked = new Set(model.conversations.filter((c) => !c.ad && !c.ig && c.tracked).flatMap((c) => c.saleLinks.filter((s) => s.t >= w.from && s.t <= w.to).map((s) => s.id)));
  const orgDist = att.distributable.ids.filter((id) => orgTracked.has(id));
  if (orgDist.length) warn(`${days} dias: ${orgDist.length} venda(s) ligadas a conversas ORGÂNICAS rastreadas (WhatsApp sem anúncio e sem Instagram) entram na repartição como "sem origem".`);
  // venda ligada a anúncio E a Instagram (a mesma pessoa por dois caminhos): o anúncio vale primeiro
  const both = att.identified.ids.filter((id) => ig.has(id));
  if (both.length) warn(`${days} dias: ${both.length} venda(s) ligadas a anúncio E ao Instagram orgânico (contadas só no anúncio).`);
  // fuso: sale_date × created_at no dia de São Paulo; e quantas mudariam de período se o dia fosse em UTC
  const rows = erp.input.sales.filter((s) => { const t = P.saleTime(s); return t >= w.from - 86400000 && t <= w.to + 86400000; });
  const diffDay = rows.filter((s) => s.created_at && s.sale_date && P.spDay(Date.parse(s.created_at)) !== String(s.sale_date).slice(0, 10));
  if (diffDay.length) warn(`${days} dias: ${diffDay.length} venda(s) com sale_date diferente do dia (São Paulo) de created_at: conta o sale_date (12h).`);
  const utcEdge = rows.filter((s) => s.created_at && P.spDay(Date.parse(s.created_at)) === String(s.sale_date || '').slice(0, 10) && new Date(s.created_at).toISOString().slice(0, 10) !== P.spDay(Date.parse(s.created_at)) && [w.fromDay, w.toDay].includes(P.spDay(Date.parse(s.created_at))));
  console.log(`  fuso: ${utcEdge.length} venda(s) nas bordas do período feitas entre 21h e 0h (dia UTC ≠ dia de São Paulo) — contadas pelo dia de São Paulo`);
  // conversa com dois anúncios diferentes
  const leadAd = new Map(erp.input.leads.filter((l) => l.origin === 'anuncio' && l.ad_id).map((l) => [l.chat_id, String(l.ad_id)]));
  const mism = erp.input.attributions.filter((a) => a.ad_id && leadAd.has(a.chat_id) && leadAd.get(a.chat_id) !== String(a.ad_id));
  if (mism.length) warn(`${days} dias: ${mism.length} conversa(s) com anúncio diferente em wa_leads × wa_ad_attribution (o rastreio usa o 1º registro).`);
  console.log(`  conversas com anúncio diferente (wa_leads × wa_ad_attribution): ${mism.length}`);
}

// início do rastreio: o 1º registro pode ser uma conversa antiga achada na varredura (bem antes de o rastreio existir)
if (trackStart != null) {
  const ads = (await AD.loadErp(A.adRanges('90'), true)).input;
  const firstLead = ads.leads.filter((l) => l.origin === 'anuncio').map((l) => Date.parse(l.first_message_at)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (firstLead && firstLead - trackStart > 7 * 86400000) warn(`início do rastreio = ${P.spDay(trackStart)} (1º registro de wa_ad_attribution), mas o 1º lead de anúncio em wa_leads é de ${P.spDay(firstLead)}: as vendas sem origem entre essas datas são repartidas como se o rastreio já existisse.`);
}
console.log(`\nAvisos (${warns.length}):`);
warns.forEach((x) => console.log(`  - ${x}`));
assert.ok(queries.length > 0 && queries.every(([m]) => m === 'GET' || m === 'HEAD'), 'só GET/HEAD');
console.log(`\n${queries.length} consultas ao Supabase, todas de leitura (GET/HEAD). ok`);
