// Aba WhatsApp → RESULTADOS ("meus follow-ups funcionam?"). Regras puras (sem React nem Supabase):
// node scripts/tests/waResults.test.ts
//
// Conta CONVERSAS (uma por pessoa), não envios. Para cada follow recebido por uma conversa:
//   respondeu = o cliente mandou mensagem (wa_replies) depois daquele envio e antes do próximo follow;
//   comprou   = venda pelo WhatsApp ligada à conversa até 7 dias depois do último follow recebido (antes do próximo);
//   seguiu    = recebeu a etapa seguinte (e quantos dias depois).
// Funil por caminho: um bloco por automação/régua (2.13.0) e sequência — a etapa é o 1º, 2º, 3º envio da automação
// para a conversa (das conversas que ENTRARAM no período). Acumulados: follow-ups fora de uma régua (mensagem rápida
// marcada como follow-up, envio manual), agrupados pela etapa marcada (follow_step).
import {
  buildIndex, originOf, stepOfSend, summaryFor, pct, median, DAY_MS, FOLLOW_WINDOW_DAYS, automationTable,
  type Index, type PanelInput, type Range, type SendGroupRow, type SendRow, type WaSale,
} from './waPanel.ts';

const ts = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const money2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (t: number, r: Pick<Range, 'from' | 'to'>) => t >= r.from && t <= r.to;

export interface StageStats {
  step: number; title: string; reached: number;
  responded: number; respondedPct: number | null; medianMinutes: number | null;
  bought: number; boughtPct: number | null; revenue: number;
  followed: number; followedPct: number | null; followDays: number | null;
}
export interface PathFunnel { id: string; name: string; kind: string; titles: string[]; entered: number; bought: number; boughtPct: number | null; revenue: number; stages: StageStats[] }

// uma conversa e os follows que recebeu, em ordem (etapa = número da etapa)
interface ConvStages { key: string; stages: { step: number; t: number; itemId: string | null }[] }

function replyTimes(input: PanelInput, idx: Index): Map<string, number[]> {
  const m = new Map<string, number[]>();
  input.replies.forEach((x) => { const k = idx.keyOfChat(x.chat_id); const t = ts(x.replied_at); if (k && Number.isFinite(t)) m.set(k, [...(m.get(k) || []), t]); });
  m.forEach((v) => v.sort((a, b) => a - b));
  return m;
}
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
      const buys = (idx.salesByKey.get(c.key) || []).filter((s) => s.t > st.t && s.t <= Math.min(end, st.t + FOLLOW_WINDOW_DAYS * DAY_MS));
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
const isAutomationSend = (s: SendRow) => { const o = originOf(s); return o === 'automacao'; };

// Funil por caminho: um bloco por automação/régua/sequência com envios para conversas que entraram no período
export function pathFunnels(input: PanelInput, idx: Index, r: Range): PathFunnel[] {
  const titles = new Map(input.items.map((i) => [i.id, i.title]));
  const titleOf = (id: string | null) => (id ? titles.get(id) || '(mensagem apagada)' : '(sem mensagem)');
  const replies = replyTimes(input, idx);
  const byAuto = new Map<string, Map<string, { t: number; itemId: string | null }[]>>();
  input.sends.forEach((s) => {
    const t = ts(s.created_at);
    const k = idx.keyOfChat(s.chat_id);
    if (s.status !== 'enviado' || !isAutomationSend(s) || !s.source_id || !k || !Number.isFinite(t)) return;
    const m = byAuto.get(s.source_id) || new Map();
    m.set(k, [...(m.get(k) || []), { t, itemId: s.item_id }]);
    byAuto.set(s.source_id, m);
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
    const stages = stageStats(convs, idx, replies, titleOf);
    const sales = new Map<string, WaSale>();
    let bought = 0;
    convs.forEach((c) => {
      let any = false;
      c.stages.forEach((st, i) => {
        const end = c.stages[i + 1] ? c.stages[i + 1].t : Infinity;
        (idx.salesByKey.get(c.key) || []).filter((s) => s.t > st.t && s.t <= Math.min(end, st.t + FOLLOW_WINDOW_DAYS * DAY_MS)).forEach((s) => { sales.set(s.id, s); any = true; });
      });
      if (any) bought++;
    });
    out.push({
      id, name: input.names[id] || 'Automação apagada', kind: 'automacao', titles: stages.map((s) => s.title), entered: convs.length, bought, boughtPct: pct(bought, convs.length),
      revenue: money2([...sales.values()].reduce((x, s) => x + s.total, 0)), stages,
    });
  });
  return out.sort((a, b) => b.entered - a.entered || a.name.localeCompare(b.name, 'pt-BR'));
}

// Acumulados: follow-ups fora de uma régua (mensagem rápida marcada como follow-up / envio manual com etapa), pela etapa
export function accumulatedFollowups(input: PanelInput, idx: Index, r: Range, itemSteps: Map<string, number>): StageStats[] {
  const titles = new Map(input.items.map((i) => [i.id, i.title]));
  const titleOf = (id: string | null) => (id ? titles.get(id) || '(mensagem apagada)' : 'Mensagem digitada');
  const byKey = new Map<string, Map<number, { t: number; itemId: string | null }>>();
  input.sends.forEach((s) => {
    const t = ts(s.created_at);
    const o = originOf(s);
    if (s.status !== 'enviado' || !Number.isFinite(t) || !inRange(t, r) || ['automacao', 'disparo', 'agendada'].includes(o)) return;
    const step = stepOfSend(s, itemSteps);
    const k = idx.keyOfChat(s.chat_id);
    if (step == null || !k) return;
    const m = byKey.get(k) || new Map();
    const cur = m.get(step);
    if (!cur || t < cur.t) m.set(step, { t, itemId: s.item_id });
    byKey.set(k, m);
  });
  const convs: ConvStages[] = [...byKey.entries()].map(([key, m]) => ({ key, stages: [...m.entries()].map(([step, x]) => ({ step, ...x })).sort((a, b) => a.t - b.t || a.step - b.step) }));
  return stageStats(convs, idx, replyTimes(input, idx), titleOf);
}

// Resultado por mensagem de follow-up: cada mensagem marcada como follow-up ou enviada por automação
export interface FollowMessageCard { id: string; title: string; step: number | null; received: number; responded: number; respondedPct: number | null; medianMinutes: number | null; bought: number; boughtPct: number | null; revenue: number }
export function followMessageCards(input: PanelInput, idx: Index, r: Range, itemSteps: Map<string, number>): FollowMessageCard[] {
  const titles = new Map(input.items.map((i) => [i.id, i.title]));
  const replies = replyTimes(input, idx);
  // envios de follow por conversa, em ordem (para "antes do próximo follow")
  const follows = new Map<string, number[]>();
  const isFollow = (s: SendRow) => s.status === 'enviado' && !!s.item_id && (isAutomationSend(s) || stepOfSend(s, itemSteps) != null);
  input.sends.forEach((s) => { const k = idx.keyOfChat(s.chat_id); const t = ts(s.created_at); if (k && Number.isFinite(t) && isFollow(s)) follows.set(k, [...(follows.get(k) || []), t]); });
  follows.forEach((v) => v.sort((a, b) => a - b));
  const byItem = new Map<string, Map<string, number>>(); // item → conversa → 1º envio no período
  input.sends.forEach((s) => {
    const t = ts(s.created_at);
    const k = idx.keyOfChat(s.chat_id);
    if (!isFollow(s) || !k || !Number.isFinite(t) || !inRange(t, r)) return;
    const m = byItem.get(s.item_id as string) || new Map();
    if (!m.has(k) || t < (m.get(k) as number)) m.set(k, t);
    byItem.set(s.item_id as string, m);
  });
  return [...byItem.entries()].map(([id, m]) => {
    let responded = 0;
    let bought = 0;
    const minutes: number[] = [];
    const sales = new Map<string, WaSale>();
    m.forEach((t, key) => {
      const next = (follows.get(key) || []).find((x) => x > t);
      const end = next == null ? Infinity : next;
      const rep = (replies.get(key) || []).find((x) => x > t && x < end);
      if (rep != null) { responded++; minutes.push((rep - t) / 60000); }
      const buys = (idx.salesByKey.get(key) || []).filter((s) => s.t > t && s.t <= Math.min(end, t + FOLLOW_WINDOW_DAYS * DAY_MS));
      if (buys.length) { bought++; buys.forEach((s) => sales.set(s.id, s)); }
    });
    return {
      id, title: titles.get(id) || '(mensagem apagada)', step: itemSteps.get(id) ?? null, received: m.size, responded, respondedPct: pct(responded, m.size), medianMinutes: median(minutes),
      bought, boughtPct: pct(bought, m.size), revenue: money2([...sales.values()].reduce((x, s) => x + s.total, 0)),
    };
  }).sort((a, b) => (a.step ?? 99) - (b.step ?? 99) || b.received - a.received);
}

// Disparos: por disparo (enviadas · responderam % · vendas · R$)
export const campaignRows = (input: PanelInput, idx: Index, r: Range): SendGroupRow[] => automationTable(input, idx, r).filter((x) => x.kind === 'disparo');

// Tudo da aba de uma vez
export function computeResults(input: PanelInput, r: Range) {
  const idx = buildIndex(input);
  const itemSteps = new Map<string, number>();
  input.items.forEach((i) => { if (Number.isInteger(i.follow_step) && (i.follow_step as number) >= 1) itemSteps.set(i.id, i.follow_step as number); });
  const s = summaryFor(input, idx, r, itemSteps);
  return {
    paths: pathFunnels(input, idx, r),
    accumulated: accumulatedFollowups(input, idx, r, itemSteps),
    messages: followMessageCards(input, idx, r, itemSteps),
    campaigns: campaignRows(input, idx, r),
    footer: { sales: s.sales, revenue: s.revenue, afterFollow: s.afterFollow, afterFollowRevenue: s.afterFollowRevenue, fromAd: s.fromAd, fromAdRevenue: s.fromAdRevenue },
  };
}
export type ResultsModel = ReturnType<typeof computeResults>;
