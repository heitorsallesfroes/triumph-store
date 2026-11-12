// Aba WhatsApp → RESULTADOS ("meus follow-ups funcionam?"). Regras puras (sem React nem Supabase):
// node scripts/tests/waResults.test.ts
//
// Conta CONVERSAS (uma por pessoa), não envios. Para cada follow recebido por uma conversa:
//   respondeu = o cliente mandou mensagem (wa_replies) depois daquele envio e antes do próximo follow;
//   comprou   = venda pelo WhatsApp ligada à conversa até 7 dias depois do último follow recebido (antes do próximo);
//   seguiu    = recebeu a etapa seguinte (e quantos dias depois).
// ERP 12/11: cada automação/régua tem um TIPO ("Follow-up de venda", "Pós-venda" ou "Outro"; escolhido no bloco e
// gravado em system_config "wa_results_types"). Só "Follow-up de venda" e o follow MANUAL entram nas contas de follow
// (cards, funil, comprou, faturamento, rodapé). Envio para quem já comprou (venda ligada à conversa nos 30 dias ANTES do
// envio) nunca conta como follow de venda. Pós-venda e Outro: seção à parte, só com entraram e responderam.
// Follow manual (fora de uma régua): mensagem rápida de uma CATEGORIA de follow-up, mensagem marcada como follow-up ou
// envio com etapa gravada. Etapa = a gravada (envio ou mensagem); sem etapa gravada, automática: 1º, 2º, 3º follow
// manual que a conversa recebeu desde a última resposta do cliente ou a última compra.
import {
  buildIndex, originOf, stepOfSend, pct, median, DAY_MS, FOLLOW_WINDOW_DAYS, automationTable, campaignVariantTable,
  type Index, type PanelInput, type Range, type SendGroupRow, type SendRow, type WaSale,
} from './waPanel.ts';

const ts = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const money2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (t: number, r: Pick<Range, 'from' | 'to'>) => t >= r.from && t <= r.to;
export const BOUGHT_BEFORE_DAYS = 30;
export const PROJECTION_DAYS = 30;

// ── Tipo de cada automação/régua ──────────────────────────────────────────
export type PathType = 'follow' | 'posvenda' | 'outro';
export const PATH_TYPES: { id: PathType; label: string }[] = [
  { id: 'follow', label: 'Follow-up de venda' }, { id: 'posvenda', label: 'Pós-venda' }, { id: 'outro', label: 'Outro' },
];
export const TYPES_KEY = 'wa_results_types';
export interface AutomationInfo { id: string; name?: string | null; trigger_label_source?: string | null; trigger_wa_label_id?: string | null }
// O que a aba lê além do Painel (tudo opcional: sem isso, toda automação é follow-up de venda, como antes)
export interface ResultsExtra {
  automations?: AutomationInfo[];
  types?: Record<string, PathType>;        // system_config wa_results_types (id da automação → tipo)
  followCategories?: string[];             // categorias "Mensagens desta categoria são follow-up"
  followItems?: string[];                  // mensagens marcadas "Contar como follow-up" (sem etapa)
  itemCategory?: Record<string, string>;   // mensagem → categoria
  now?: number;
}
const POS_NAME = /avalia|instru|p[oó]s[\s-]*venda|configura|garantia/i;
export function defaultPathType(name: string | null | undefined, a?: AutomationInfo | null): PathType {
  if (a && a.trigger_label_source === 'whatsapp' && String(a.trigger_wa_label_id ?? '') === '1') return 'posvenda'; // etiqueta "Cliente"
  return POS_NAME.test(name || '') ? 'posvenda' : 'follow';
}
export function parseTypes(raw: unknown): Record<string, PathType> {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return {}; } }
  const out: Record<string, PathType> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    Object.entries(v as Record<string, unknown>).forEach(([k, t]) => { if (t === 'follow' || t === 'posvenda' || t === 'outro') out[k] = t; });
  }
  return out;
}

export interface StageStats {
  step: number; title: string; reached: number;
  responded: number; respondedPct: number | null; medianMinutes: number | null;
  bought: number; boughtPct: number | null; revenue: number;
  followed: number; followedPct: number | null; followDays: number | null;
}
export interface PathFunnel {
  id: string; name: string; kind: string; type: PathType; typeSaved: boolean;
  titles: string[]; entered: number; bought: number; boughtPct: number | null; revenue: number; stages: StageStats[];
}
export interface OtherPath { id: string; name: string; type: PathType; typeSaved: boolean; entered: number; responded: number; respondedPct: number | null }

// uma conversa e os follows que recebeu, em ordem (etapa = número da etapa)
interface ConvStages { key: string; stages: { step: number; t: number; itemId: string | null }[] }

function replyTimes(input: PanelInput, idx: Index): Map<string, number[]> {
  const m = new Map<string, number[]>();
  input.replies.forEach((x) => { const k = idx.keyOfChat(x.chat_id); const t = ts(x.replied_at); if (k && Number.isFinite(t)) m.set(k, [...(m.get(k) || []), t]); });
  m.forEach((v) => v.sort((a, b) => a - b));
  return m;
}
const buysAfter = (idx: Index, key: string, t: number, end: number) =>
  (idx.salesByKey.get(key) || []).filter((s) => s.t > t && s.t <= Math.min(end, t + FOLLOW_WINDOW_DAYS * DAY_MS));
// as contas de cada etapa (mesmas regras para o funil por caminho e os acumulados)
function stageStats(convs: ConvStages[], idx: Index, replies: Map<string, number[]>, titleOf: (id: string | null) => string): StageStats[] {
  const steps = new Map<number, { reached: number; responded: number; minutes: number[]; bought: number; sales: Map<string, WaSale>; followed: number; days: number[]; titles: Map<string, number> }>();
  convs.forEach((c) => {
    c.stages.forEach((st, i) => {
      const next = c.stages[i + 1];
      const end = next ? next.t : Infinity;
      const g = steps.get(st.step) || { reached: 0, responded: 0, minutes: [] as number[], bought: 0, sales: new Map<string, WaSale>(), followed: 0, days: [] as number[], titles: new Map<string, number>() };
      g.reached++;
      const title = titleOf(st.itemId);
      g.titles.set(title, (g.titles.get(title) || 0) + 1);
      const rep = (replies.get(c.key) || []).find((t) => t > st.t && t < end);
      if (rep != null) { g.responded++; g.minutes.push((rep - st.t) / 60000); }
      const buys = buysAfter(idx, c.key, st.t, end);
      if (buys.length) { g.bought++; buys.forEach((s) => g.sales.set(s.id, s)); }
      if (next) { g.followed++; g.days.push((next.t - st.t) / DAY_MS); }
      steps.set(st.step, g);
    });
  });
  return [...steps.keys()].sort((a, b) => a - b).map((step) => {
    const g = steps.get(step)!;
    const title = [...g.titles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || `Follow ${step}`;
    return {
      step, title, reached: g.reached, responded: g.responded, respondedPct: pct(g.responded, g.reached), medianMinutes: median(g.minutes),
      bought: g.bought, boughtPct: pct(g.bought, g.reached), revenue: money2([...g.sales.values()].reduce((x, s) => x + s.total, 0)),
      followed: g.followed, followedPct: pct(g.followed, g.reached), followDays: median(g.days),
    };
  });
}
const isAutomationSend = (s: SendRow) => originOf(s) === 'automacao';
const NOT_MANUAL = ['automacao', 'disparo', 'agendada'];

// ── Classificação dos envios (uma vez, usada por todas as seções) ─────────
export interface FollowSend { send: SendRow; key: string; t: number; kind: 'auto' | 'manual'; step: number }
interface Classified {
  idx: Index; replies: Map<string, number[]>;
  typeOf: (id: string) => { type: PathType; saved: boolean };
  follows: FollowSend[];                  // follows de venda (automação "Follow-up de venda" + manuais), sem pós-compra
  timeline: Map<string, number[]>;        // conversa → horários dos follows de venda (para "antes do próximo follow")
  otherAuto: Map<string, Map<string, { t: number; itemId: string | null }[]>>; // pós-venda/outro: automação → conversa → envios
}
function classify(input: PanelInput, extra: ResultsExtra, itemSteps: Map<string, number>): Classified {
  const idx = buildIndex(input);
  const replies = replyTimes(input, idx);
  const autos = new Map((extra.automations || []).map((a) => [a.id, a]));
  const saved = extra.types || {};
  const typeOf = (id: string) => (saved[id] ? { type: saved[id], saved: true } : { type: defaultPathType(input.names[id] ?? autos.get(id)?.name, autos.get(id)), saved: false });
  const followCats = new Set(extra.followCategories || []);
  const followItems = new Set(extra.followItems || []);
  const itemCat = extra.itemCategory || {};
  const manualMarked = (s: SendRow) => stepOfSend(s, itemSteps) != null
    || (!!s.item_id && (followItems.has(s.item_id) || (!!itemCat[s.item_id] && followCats.has(itemCat[s.item_id]))));
  // comprou antes: venda ligada à conversa nos 30 dias anteriores ao envio
  const boughtBefore = (key: string, t: number) => (idx.salesByKey.get(key) || []).some((x) => x.t < t && x.t >= t - BOUGHT_BEFORE_DAYS * DAY_MS);
  const lastBefore = (list: number[] | undefined, t: number) => { let v = -Infinity; (list || []).forEach((x) => { if (x < t && x > v) v = x; }); return v; };

  const rows = input.sends
    .map((s) => ({ s, key: idx.keyOfChat(s.chat_id), t: ts(s.created_at) }))
    .filter((x) => x.s.status === 'enviado' && x.key && Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t) as { s: SendRow; key: string; t: number }[];
  const follows: FollowSend[] = [];
  const otherAuto: Classified['otherAuto'] = new Map();
  const manualByKey = new Map<string, number[]>(); // follows manuais já vistos (etapa automática)
  rows.forEach(({ s, key, t }) => {
    if (isAutomationSend(s)) {
      if (!s.source_id) return;
      if (typeOf(s.source_id).type !== 'follow') {
        const m = otherAuto.get(s.source_id) || new Map();
        m.set(key, [...(m.get(key) || []), { t, itemId: s.item_id }]);
        otherAuto.set(s.source_id, m);
        return;
      }
      if (!boughtBefore(key, t)) follows.push({ send: s, key, t, kind: 'auto', step: 0 });
      return;
    }
    if (NOT_MANUAL.includes(originOf(s)) || !manualMarked(s) || boughtBefore(key, t)) return;
    const since = Math.max(lastBefore(replies.get(key), t), lastBefore((idx.salesByKey.get(key) || []).map((x) => x.t), t));
    const prev = (manualByKey.get(key) || []).filter((x) => x > since).length;
    manualByKey.set(key, [...(manualByKey.get(key) || []), t]);
    follows.push({ send: s, key, t, kind: 'manual', step: stepOfSend(s, itemSteps) ?? prev + 1 });
  });
  const timeline = new Map<string, number[]>();
  follows.forEach((f) => timeline.set(f.key, [...(timeline.get(f.key) || []), f.t]));
  return { idx, replies, typeOf, follows, timeline, otherAuto };
}
const nextFollow = (c: Classified, key: string, t: number) => { const n = (c.timeline.get(key) || []).find((x) => x > t); return n == null ? Infinity : n; };

// Funil por caminho: um bloco por automação/régua "Follow-up de venda" com envios para conversas que entraram no período
function pathFunnelsOf(input: PanelInput, c: Classified, r: Range): PathFunnel[] {
  const titles = new Map(input.items.map((i) => [i.id, i.title]));
  const titleOf = (id: string | null) => (id ? titles.get(id) || '(mensagem apagada)' : '(sem mensagem)');
  const byAuto = new Map<string, Map<string, { t: number; itemId: string | null }[]>>();
  c.follows.filter((f) => f.kind === 'auto').forEach((f) => {
    const id = f.send.source_id as string;
    const m = byAuto.get(id) || new Map();
    m.set(f.key, [...(m.get(f.key) || []), { t: f.t, itemId: f.send.item_id }]);
    byAuto.set(id, m);
  });
  const out: PathFunnel[] = [];
  byAuto.forEach((m, id) => {
    const convs: ConvStages[] = [];
    m.forEach((list, key) => {
      const sorted = list.sort((a, b) => a.t - b.t);
      if (!inRange(sorted[0].t, r)) return; // entrou no período (1º envio da automação no período)
      convs.push({ key, stages: sorted.slice(0, 10).map((x, i) => ({ step: i + 1, t: x.t, itemId: x.itemId })) });
    });
    if (!convs.length) return;
    const stages = stageStats(convs, c.idx, c.replies, titleOf);
    const sales = new Map<string, WaSale>();
    let bought = 0;
    convs.forEach((cv) => {
      let any = false;
      cv.stages.forEach((st, i) => {
        const end = cv.stages[i + 1] ? cv.stages[i + 1].t : Infinity;
        buysAfter(c.idx, cv.key, st.t, end).forEach((s) => { sales.set(s.id, s); any = true; });
      });
      if (any) bought++;
    });
    const ty = c.typeOf(id);
    out.push({
      id, name: input.names[id] || 'Automação apagada', kind: 'automacao', type: ty.type, typeSaved: ty.saved, titles: stages.map((s) => s.title),
      entered: convs.length, bought, boughtPct: pct(bought, convs.length), revenue: money2([...sales.values()].reduce((x, s) => x + s.total, 0)), stages,
    });
  });
  return out.sort((a, b) => b.entered - a.entered || a.name.localeCompare(b.name, 'pt-BR'));
}

// Pós-venda e outras: entraram (1º envio da automação no período) e responderam (depois de um envio, antes do próximo)
function otherPathsOf(input: PanelInput, c: Classified, r: Range): OtherPath[] {
  const out: OtherPath[] = [];
  c.otherAuto.forEach((m, id) => {
    let entered = 0;
    let responded = 0;
    m.forEach((list, key) => {
      const sorted = list.slice().sort((a, b) => a.t - b.t);
      if (!inRange(sorted[0].t, r)) return;
      entered++;
      const rep = sorted.slice(0, 10).some((x, i) => { const end = sorted[i + 1] ? sorted[i + 1].t : Infinity; return (c.replies.get(key) || []).some((t) => t > x.t && t < end); });
      if (rep) responded++;
    });
    if (!entered) return;
    const ty = c.typeOf(id);
    out.push({ id, name: input.names[id] || 'Automação apagada', type: ty.type, typeSaved: ty.saved, entered, responded, respondedPct: pct(responded, entered) });
  });
  return out.sort((a, b) => b.entered - a.entered || a.name.localeCompare(b.name, 'pt-BR'));
}

// Acumulados: follow manual (fora de uma régua), pela etapa (gravada ou automática)
function accumulatedOf(input: PanelInput, c: Classified, r: Range): StageStats[] {
  const titles = new Map(input.items.map((i) => [i.id, i.title]));
  const titleOf = (id: string | null) => (id ? titles.get(id) || '(mensagem apagada)' : 'Mensagem digitada');
  const byKey = new Map<string, Map<number, { t: number; itemId: string | null }>>();
  c.follows.forEach((f) => {
    if (f.kind !== 'manual' || !inRange(f.t, r)) return;
    const m = byKey.get(f.key) || new Map();
    const cur = m.get(f.step);
    if (!cur || f.t < cur.t) m.set(f.step, { t: f.t, itemId: f.send.item_id });
    byKey.set(f.key, m);
  });
  const convs: ConvStages[] = [...byKey.entries()].map(([key, m]) => ({ key, stages: [...m.entries()].map(([step, x]) => ({ step, ...x })).sort((a, b) => a.t - b.t || a.step - b.step) }));
  return stageStats(convs, c.idx, c.replies, titleOf);
}

// Resultado por mensagem de follow-up (de venda: automação "Follow-up de venda" ou follow manual)
export interface FollowMessageCard { id: string; title: string; step: number | null; received: number; responded: number; respondedPct: number | null; medianMinutes: number | null; bought: number; boughtPct: number | null; revenue: number }
function messageCardsOf(input: PanelInput, c: Classified, r: Range, itemSteps: Map<string, number>): FollowMessageCard[] {
  const titles = new Map(input.items.map((i) => [i.id, i.title]));
  const byItem = new Map<string, Map<string, number>>(); // item → conversa → 1º envio no período
  c.follows.forEach((f) => {
    if (!f.send.item_id || !inRange(f.t, r)) return;
    const m = byItem.get(f.send.item_id) || new Map();
    if (!m.has(f.key) || f.t < (m.get(f.key) as number)) m.set(f.key, f.t);
    byItem.set(f.send.item_id, m);
  });
  return [...byItem.entries()].map(([id, m]) => {
    let responded = 0;
    let bought = 0;
    const minutes: number[] = [];
    const sales = new Map<string, WaSale>();
    m.forEach((t, key) => {
      const end = nextFollow(c, key, t);
      const rep = (c.replies.get(key) || []).find((x) => x > t && x < end);
      if (rep != null) { responded++; minutes.push((rep - t) / 60000); }
      const buys = buysAfter(c.idx, key, t, end);
      if (buys.length) { bought++; buys.forEach((s) => sales.set(s.id, s)); }
    });
    return {
      id, title: titles.get(id) || '(mensagem apagada)', step: itemSteps.get(id) ?? null, received: m.size, responded, respondedPct: pct(responded, m.size), medianMinutes: median(minutes),
      bought, boughtPct: pct(bought, m.size), revenue: money2([...sales.values()].reduce((x, s) => x + s.total, 0)),
    };
  }).sort((a, b) => (a.step ?? 99) - (b.step ?? 99) || b.received - a.received);
}

// Cards do topo (só follow-up de venda, no período) + projeção dos próximos 30 dias no ritmo do período
export interface FollowCards {
  conversations: number; sent: number; responded: number; respondedPct: number | null;
  sales: number; revenue: number; ticket: number | null; bought: number; conversion: number | null;
  projection: { days: number; sales: number; revenue: number };
}
function followCardsOf(c: Classified, r: Range, now: number): FollowCards {
  const inP = c.follows.filter((f) => inRange(f.t, r));
  const convs = new Map<string, number[]>();
  inP.forEach((f) => convs.set(f.key, [...(convs.get(f.key) || []), f.t]));
  let responded = 0;
  let bought = 0;
  const sales = new Map<string, WaSale>();
  convs.forEach((list, key) => {
    let rep = false;
    let buy = false;
    list.forEach((t) => {
      const end = nextFollow(c, key, t);
      if ((c.replies.get(key) || []).some((x) => x > t && x < end)) rep = true;
      const b = buysAfter(c.idx, key, t, end);
      if (b.length) { buy = true; b.forEach((s) => sales.set(s.id, s)); }
    });
    if (rep) responded++;
    if (buy) bought++;
  });
  const revenue = money2([...sales.values()].reduce((x, s) => x + s.total, 0));
  // ritmo: dias do período até agora (o período que ainda não acabou conta só o que já passou)
  const days = Math.max(1, Math.ceil((Math.min(r.to, now) - r.from + 1) / DAY_MS));
  return {
    conversations: convs.size, sent: inP.length, responded, respondedPct: pct(responded, convs.size),
    sales: sales.size, revenue, ticket: sales.size ? money2(revenue / sales.size) : null, bought, conversion: pct(bought, convs.size),
    projection: { days, sales: Math.round((sales.size / days) * PROJECTION_DAYS), revenue: money2((revenue / days) * PROJECTION_DAYS) },
  };
}

// Disparos: por disparo (enviadas · responderam % · vendas · R$) e, com 2+ variações (2.14.0), por variação
export type CampaignRow = SendGroupRow & { variants: SendGroupRow[] };
export function campaignRows(input: PanelInput, idx: Index, r: Range): CampaignRow[] {
  const vars = campaignVariantTable(input, idx, r);
  return automationTable(input, idx, r).filter((x) => x.kind === 'disparo').map((c) => {
    const v = vars.filter((x) => x.id.startsWith(`${c.id}#`)).sort((a, b) => Number(a.id.split('#')[1]) - Number(b.id.split('#')[1]));
    return { ...c, variants: v.length > 1 ? v : [] };
  });
}

// Rodapé: vendas pelo WhatsApp do período; "depois de um follow" = até 7 dias depois do último follow DE VENDA
function footerOf(c: Classified, r: Range) {
  const sales = c.idx.waSales.filter((s) => inRange(s.t, r));
  const sum = (l: WaSale[]) => money2(l.reduce((x, s) => x + s.total, 0));
  const after = sales.filter((s) => s.keys.some((k) => {
    const before = (c.timeline.get(k) || []).filter((t) => t < s.t);
    return before.length > 0 && s.t - Math.max(...before) <= FOLLOW_WINDOW_DAYS * DAY_MS;
  }));
  const fromAd = sales.filter((s) => s.ad);
  return { sales: sales.length, revenue: sum(sales), afterFollow: after.length, afterFollowRevenue: sum(after), fromAd: fromAd.length, fromAdRevenue: sum(fromAd) };
}

// Tudo da aba de uma vez
export function computeResults(input: PanelInput, r: Range, extra: ResultsExtra = {}) {
  const itemSteps = new Map<string, number>();
  input.items.forEach((i) => { if (Number.isInteger(i.follow_step) && (i.follow_step as number) >= 1) itemSteps.set(i.id, i.follow_step as number); });
  const c = classify(input, extra, itemSteps);
  return {
    cards: followCardsOf(c, r, extra.now ?? Date.now()),
    paths: pathFunnelsOf(input, c, r),
    others: otherPathsOf(input, c, r),
    accumulated: accumulatedOf(input, c, r),
    messages: messageCardsOf(input, c, r, itemSteps),
    campaigns: campaignRows(input, c.idx, r),
    footer: footerOf(c, r),
  };
}
export type ResultsModel = ReturnType<typeof computeResults>;
