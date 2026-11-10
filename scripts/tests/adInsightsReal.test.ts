// Gerenciador de Anúncios novo lendo os DADOS REAIS (SOMENTE LEITURA): node scripts/tests/adInsightsReal.test.ts
// - o ERP pelo MESMO código da página (src/lib/adInsightsDb.ts → loadTracking), com src/lib/supabase.ts trocado pelo
//   cliente realReadOnly.ts (só GET/HEAD; insert/update/upsert/delete dão erro na hora);
// - a Meta pela edge function publicada (action "dashboard", só leitura). Se a função ainda não tiver a leitura nova,
//   avisa que precisa publicar e confere só o ERP;
// - confere: ligação conversa → anúncio → venda sem venda repetida e só de conversas de anúncio, lucro = faturamento −
//   produtos − (gasto + imposto), categorias com as faixas de ROAS, nenhuma escrita. Não mostra nomes nem telefones.
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
const g = globalThis as unknown as { __RO_SUPABASE: unknown };
g.__RO_SUPABASE = readOnlyClient(SUPABASE_URL, SUPABASE_ANON_KEY, (m, p) => queries.push([m, p]));

// src/lib/supabase → o cliente somente leitura; imports sem extensão → .ts (como o Vite resolve)
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
const Db = await import(src('waTrackingDb.ts')) as typeof import('../../src/lib/waTrackingDb.ts');
const AD = await import(src('adInsightsDb.ts')) as typeof import('../../src/lib/adInsightsDb.ts');
const SC = await import(src('systemConfig.ts')) as typeof import('../../src/lib/systemConfig.ts');

await SC.loadSystemConfig();
const tax = SC.getConfigNumber('ad_tax_rate');
const r = A.adRanges('30');
const money = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
console.log(`Período ${r.cur.fromDay} a ${r.cur.toDay} (anterior ${r.prev.fromDay} a ${r.prev.toDay}) · imposto do anúncio ${(tax * 100).toFixed(2)}%`);

// ERP (o mesmo carregamento da página)
const erp = await Db.loadTracking({ from: r.prev.from, to: r.cur.to, fromDay: r.prev.fromDay, toDay: r.cur.toDay, days: r.prev.days + r.cur.days });
if (erp.missing.length) console.log(`Ainda sem: ${erp.missing.join(', ')}`);
const model = T.buildConversations(erp.input, T.businessHoursOf(erp.settings));
const byAd = A.erpByAd(model, r.cur);
const saleIds = [...byAd.values()].flatMap((a) => a.saleIds);
assert.equal(new Set(saleIds).size, saleIds.length, 'nenhuma venda contada em dois anúncios');
const adConvSales = new Set(model.conversations.filter((c) => c.ad).flatMap((c) => c.saleIds.length ? c.saleIds : c.saleLinks.map((s) => s.id)));
saleIds.forEach((id) => assert.ok(adConvSales.has(id), 'só vendas de conversas que vieram de anúncio'));
const costs = await AD.loadSaleCosts(saleIds);
console.log(`ERP: ${model.conversations.length} conversas carregadas · ${[...byAd.values()].reduce((s, a) => s + a.conversations, 0)} conversas de anúncio no período · ${saleIds.length} vendas ligadas a anúncio · ${[...costs.values()].filter((c) => c.productCost == null).length} sem custo`);
console.log(`  anúncios com conversa/venda no ERP: ${byAd.size} (sem ad_id: ${byAd.has('sem-id') ? byAd.get('sem-id')!.conversations : 0} conversas)`);

// Meta (edge function publicada)
let meta: { daily: import('../../src/lib/adInsights.ts').MetaDaily[]; period: import('../../src/lib/adInsights.ts').MetaPeriod[] } = { daily: [], period: [] };
let metaOk = false;
try {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ad-manager`, { method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dashboard', part: 'metrics', ...A.metaFetchWindow(r) }) });
  const d = await res.json();
  if (d && d.success && Array.isArray(d.daily)) { meta = { daily: d.daily, period: d.period || [] }; metaOk = true; }
  else console.log(`⚠ Meta: ${d && d.error ? d.error : `HTTP ${res.status}`} → a função ad-manager ainda não tem a leitura "dashboard": publique com "supabase functions deploy ad-manager". Conferindo só o ERP.`);
} catch (e) { console.log(`⚠ Meta: ${e instanceof Error ? e.message : e}`); }

const cards = A.buildAdCards({ model, meta: meta.daily, period: meta.period, costs, taxRate: tax, goals: A.DEFAULT_GOALS }, r.cur);
const t = A.totalsOf(model, meta.daily, costs, tax, r.cur);
const p = A.totalsOf(model, meta.daily, costs, tax, r.prev);
assert.equal(Math.round((t.revenue - t.productCost - t.spendReal) * 100) / 100, t.profit, 'lucro = faturamento − produtos − (gasto + imposto)');
console.log(`\nComo estou? (30 dias${metaOk ? '' : ', sem a Meta'})`);
console.log(`  Gasto ${money(t.spendReal)} (${money(t.spend)} + ${money(t.tax)} imposto) · Faturamento ${money(t.revenue)} · Produtos ${money(t.productCost)} · Lucro real ${money(t.profit)}`);
console.log(`  ROAS real ${t.roas == null ? '—' : t.roas.toFixed(2)} (${A.roasTier(t.roas) || '—'}) · Custo/venda ${money(t.cpa)} · Custo/conversa ${money(t.cpc)} · ${t.sales} vendas · ${t.conversations} conversas`);
console.log(`  anterior: gasto ${money(p.spendReal)} · faturamento ${money(p.revenue)} · lucro ${money(p.profit)}`);
const boxes = A.categoryBoxes(cards);
console.log(`\nDecisões: ${boxes.map((b) => `${A.CATEGORY_LABEL[b.category]} ${b.count} (${money(b.spendReal)})`).join(' · ')}`);
console.log(`Dinheiro: ${A.moneySplit(cards).map((s) => `${s.label} ${(s.pct * 100).toFixed(0)}%`).join(' · ')}`);
cards.forEach((c) => {
  assert.ok(c.verdict.reasons.length >= 1 && c.verdict.reasons.length <= 3);
  if (c.verdict.category !== 'acompanhar') assert.equal(c.verdict.tier, A.roasTier(c.money.roas ?? 0), 'faixa do cartão = faixa do ROAS real');
  if (c.verdict.category === 'escalar') assert.ok((c.money.roas ?? 0) >= A.DEFAULT_GOALS.roasGood);
  if (c.verdict.category === 'resolver') assert.ok((c.money.roas ?? 0) < A.DEFAULT_GOALS.roasOk);
});
cards.slice(0, 12).forEach((c) => console.log(`  [${A.CATEGORY_LABEL[c.verdict.category]}] ${c.name.slice(0, 40)} · gasto ${money(c.money.spendReal)} · ${c.money.conversations} conv · ${c.money.sales} vendas · ROAS ${c.money.roas == null ? '—' : c.money.roas.toFixed(2)} · ${c.verdict.action}`));
const chk = A.metaCheck(cards);
if (metaOk) console.log(`\nConferir com a Meta: Meta ${chk.reduce((s, x) => s + x.metaPurchases, 0)} compras × ERP ${chk.reduce((s, x) => s + x.erpSales, 0)} vendas × CAPI ${chk.reduce((s, x) => s + x.capiPurchases, 0)}`);

// nenhuma escrita: o cliente só faz GET/HEAD
assert.ok(queries.length > 0 && queries.every(([m]) => m === 'GET' || m === 'HEAD'), 'só GET/HEAD');
console.log(`\n${queries.length} consultas ao Supabase, todas de leitura (GET/HEAD). ok`);
