// Tela "Automações do WhatsApp" (aba WhatsApp → ⚡ Automações), SÓ LEITURA. Regras puras, sem React nem Supabase,
// conferidas fora do navegador (node scripts/tests/waAutomations.test.ts).
//
// A descrição das réguas é a MESMA da extensão (extension/engine.js: seqIndex, seqNodeLabel, sinceEntryText,
// seqSimulate, seqSendSteps, seqDescribe, horário da automação/etapa), PORTADA para cá — o ERP não importa arquivos
// da extensão. Diferença: as horas são contadas no horário de São Paulo (UTC−3, sem horário de verão desde 2019),
// para a tela dar o mesmo resultado em qualquer computador (a extensão usa o relógio do próprio computador, que lá
// também é o de São Paulo).
//
// def = { start, steps, schedule } — passos:
//   { id, type: 'enviar', item_id } · { id, type: 'etiqueta', op: 'colocar'|'tirar', source, label_id|wa_label_id, remove_others }
//   { id, type: 'esperar', amount, unit, from?: 'entrada', after_mine?, send_window?, yes: [...], no: [...] }  (❓ ESPERAR RESPOSTA)
//   { id, type: 'pausa', amount, unit, from?, mode?: 'ate', until_day, until_time, send_window? }               (⏳ ESPERAR)
//   { id, type: 'fim' } · { id, type: 'ir', to }

export const MIN_MS = 60 * 1000;
export const HOUR_MS = 60 * MIN_MS;
export const DAY_MS = 24 * HOUR_MS;
const SP_OFFSET = 3 * HOUR_MS; // São Paulo = UTC−3

// ── Tipos ──
export interface SeqWindow { start?: string; end?: string }
export interface SeqNode {
  id: string; type: string;
  item_id?: string | null; op?: string; source?: string; label_id?: string | null; wa_label_id?: string | null; remove_others?: boolean;
  amount?: number | string; unit?: string; from?: string; after_mine?: boolean; mode?: string; until_day?: number | string | null; until_time?: string;
  send_window?: SeqWindow | null; yes?: SeqNode[]; no?: SeqNode[]; to?: string;
}
export interface SeqStart { type?: string; origin?: string; source?: string; label_id?: string | null; wa_label_id?: string | null; exclude?: { source?: string; label_id?: string; wa_label_id?: string }[] }
export interface SeqSchedule { mode?: string; days?: number[]; windows?: SeqWindow[]; week?: SeqWindow[][]; daily_limit?: number | string | null }
export interface SeqDef { start?: SeqStart; steps?: SeqNode[]; business?: boolean; schedule?: SeqSchedule | null }
export interface AutomationRow {
  id: string; name: string; active: boolean; kind?: string | null; sequence?: SeqDef | null; activated_at?: string | null; position?: number | null;
  trigger_type?: string | null; trigger_label_source?: string | null; trigger_label_id?: string | null; trigger_wa_label_id?: string | null;
  wait_minutes?: number | null; test_chat_id?: string | null; include_existing?: boolean | null; created_at?: string | null;
}
export interface Branch { node: string; result: 'sim' | 'nao' | string; at?: number | null }
export interface RunRow {
  id: string; automation_id: string; chat_id: string; contact_id?: string | null; entry_key?: string | null; node: string | null;
  status: string; outcome?: string | null; wait_started_at?: string | null; due_at?: string | null; last_sent_at?: string | null;
  skip_wait?: boolean | null; branches?: Branch[] | null; created_at: string; ended_at?: string | null; updated_at?: string | null;
}
export interface SendLogRow { id: string; created_at: string; chat_id: string | null; contact_id?: string | null; item_id: string | null; status: string; reason?: string | null; source_id?: string | null }
export interface ItemRow { id: string; title: string; type?: string | null; body?: string | null; file_url?: string | null; file_name?: string | null }
export interface Names { item: (id: string | null | undefined) => string; label: (id: string | null | undefined, source: 'crm' | 'whatsapp') => string }
export const plainNames: Names = { item: (id) => (id ? `mensagem ${id.slice(0, 6)}` : '(sem mensagem)'), label: (id, s) => (id ? (s === 'whatsapp' ? `nº ${id}` : `etiqueta ${id.slice(0, 6)}`) : '(sem etiqueta)') };

// ── Relógio de São Paulo ──
const sp = (ms: number) => new Date(ms - SP_OFFSET); // use os getUTC*
const atMinute = (y: number, m: number, d: number, minutes: number) => Date.UTC(y, m, d, 0, minutes) + SP_OFFSET;
export const midnightOf = (ms: number) => { const d = sp(ms); return atMinute(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0); };
const nextMidnight = (ms: number) => midnightOf(ms) + DAY_MS;
const dayOfWeek = (ms: number) => sp(ms).getUTCDay();
const minuteOfDay = (ms: number) => { const d = sp(ms); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const two = (n: number) => String(n).padStart(2, '0');
const hm = (minutes: number) => `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;
export const msOf = (iso: string | null | undefined): number | null => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };

// ── Índice dos passos (engine.js seqIndex) ──
export interface IndexEntry { node: SeqNode; list: SeqNode[]; i: number; depth: number; parent: { id: string; branch: 'yes' | 'no' } | null }
export function seqIndex(def: SeqDef | null | undefined): Map<string, IndexEntry> {
  const map = new Map<string, IndexEntry>();
  const walk = (list: SeqNode[] | undefined, depth: number, parent: IndexEntry['parent']) => (list || []).forEach((n, i) => {
    if (!n || !n.id) return;
    map.set(n.id, { node: n, list: list as SeqNode[], i, depth, parent });
    if (n.type === 'esperar') { walk(n.yes, depth + 1, { id: n.id, branch: 'yes' }); walk(n.no, depth + 1, { id: n.id, branch: 'no' }); }
  });
  walk(def?.steps, 1, null);
  return map;
}
const seqNextOf = (idx: Map<string, IndexEntry>, id: string) => { const e = idx.get(id); const n = e && e.list[e.i + 1]; return n ? n.id : null; };
const seqFirstOf = (list: SeqNode[] | undefined) => (list && list[0] ? list[0].id : null);

// ── Tempos ──
const SEQ_UNIT_MIN: Record<string, number> = { minutos: 1, horas: 60, dias: 1440 };
export const seqFromEntry = (n: SeqNode | null | undefined) => !!n && n.from === 'entrada' && (n.type === 'esperar' || (n.type === 'pausa' && n.mode !== 'ate'));
export const seqNeedMin = (n: SeqNode) => Math.max(1, Number(n.amount) || 0) * (SEQ_UNIT_MIN[n.unit || ''] || 60);
export function unitText(amount: number | string | undefined, unit: string | undefined): string {
  const n = Number(amount) || 0;
  if (unit === 'minutos') return `${n} minuto${n === 1 ? '' : 's'}`;
  if (unit === 'horas') return `${n} hora${n === 1 ? '' : 's'}`;
  return `${n} dia${n === 1 ? '' : 's'}`;
}
// "dia 3 desde a entrada" / "3 h desde a entrada"
export function sinceEntryText(n: SeqNode): string {
  const m = seqNeedMin(n);
  if (m % 1440 === 0) return `dia ${m / 1440} desde a entrada`;
  if (m % 60 === 0) return `${m / 60} h desde a entrada`;
  return `${m} min desde a entrada`;
}
const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DAY_CAP = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function untilText(n: SeqNode): string {
  const day = n.until_day === 'qualquer' || n.until_day == null || n.until_day === '' ? null : Number(n.until_day);
  return `até ${day == null ? 'o próximo dia' : `${day === 0 || day === 6 ? 'o próximo' : 'a próxima'} ${DAY_LONG[day]}`} às ${n.until_time || '--:--'}`;
}
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const minOf = (v: unknown) => { const s = String(v || '').slice(0, 5); return HM_RE.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null; };

// ── Horário da automação (engine.js weekOf / weekSummary / nextSendTime) ──
type Week = [number, number][][];
// horário geral padrão da extensão (DEFAULT_SETTINGS: seg–sáb 09:00–19:00), usado quando a automação segue o
// "horário geral" (ele fica nas configurações do motor, fora das tabelas que esta tela lê)
export const DEFAULT_WEEK: Week = [0, 1, 2, 3, 4, 5, 6].map((d) => (d >= 1 && d <= 6 ? [[9 * 60, 19 * 60]] : [])) as Week;
function weekFromJson(w: unknown): Week | null {
  if (!Array.isArray(w) || w.length !== 7) return null;
  return w.map((ws) => (Array.isArray(ws) ? ws : []).map((x: SeqWindow) => [minOf(x && x.start), minOf(x && x.end)] as [number | null, number | null])
    .filter(([a, b]) => a != null && b != null && (b as number) > (a as number)).map(([a, b]) => [a as number, b as number] as [number, number])
    .sort((x, y) => x[0] - y[0]));
}
export function weekOf(sc: SeqSchedule | null | undefined): Week {
  const nw = weekFromJson(sc && sc.week);
  if (nw) return nw;
  const days = new Set(((sc && sc.days) || []).map(Number));
  const ws = ((sc && sc.windows) || []).map((w) => [minOf(w && w.start), minOf(w && w.end)] as [number | null, number | null])
    .filter(([a, b]) => a != null && b != null && (b as number) > (a as number)).map(([a, b]) => [a as number, b as number] as [number, number]).sort((x, y) => x[0] - y[0]);
  return [0, 1, 2, 3, 4, 5, 6].map((d) => (days.has(d) ? ws.map((w) => [...w] as [number, number]) : [])) as Week;
}
export const isCustomSchedule = (def: SeqDef | null | undefined) => !!(def && def.schedule && def.schedule.mode === 'personalizado');
export const scheduleWeek = (def: SeqDef | null | undefined): Week => (isCustomSchedule(def) ? weekOf(def!.schedule) : DEFAULT_WEEK);
// 9:00 → "9h", 9:30 → "9h30"
const hShort = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? two(m % 60) : ''}`;
// "Seg–Sex 9h–18h · Sáb 9h–14h" (dias seguidos com as mesmas faixas viram uma faixa; fechado não aparece)
export function weekSummary(week: Week, { short = true } = {}): string {
  const f = short ? hShort : hm;
  const key = (d: number) => (week[d] || []).map(([a, b]) => `${f(a)}–${f(b)}`).join(' e ');
  const groups: { k: string; days: number[] }[] = [];
  [1, 2, 3, 4, 5, 6, 0].forEach((d) => {
    const k = key(d);
    const g = groups[groups.length - 1];
    if (g && g.k === k) g.days.push(d); else groups.push({ k, days: [d] });
  });
  const open = groups.filter((g) => g.k);
  if (!open.length) return 'nenhum dia';
  if (open.length === 1 && open[0].days.length === 7) return `Todos os dias ${open[0].k}`;
  return open.map((g) => `${g.days.length > 2 ? `${DAY_CAP[g.days[0]]}–${DAY_CAP[g.days[g.days.length - 1]]}` : g.days.map((d) => DAY_CAP[d]).join(', ')} ${g.k}`).join(' · ');
}
export function scheduleSummary(def: SeqDef | null | undefined): string {
  if (!isCustomSchedule(def)) return 'Horário geral da extensão';
  const lim = Number(def!.schedule!.daily_limit);
  return `${weekSummary(weekOf(def!.schedule))}${Number.isInteger(lim) && lim > 0 ? ` · até ${lim} por dia` : ''}`;
}
const inWeek = (ms: number, week: Week) => (week[dayOfWeek(ms)] || []).some(([a, b]) => minuteOfDay(ms) >= a && minuteOfDay(ms) < b);
function nextInWeek(ms: number, week: Week): number | null {
  if (inWeek(ms, week)) return ms;
  let day = midnightOf(ms);
  for (let i = 0; i < 15; i++) {
    for (const [a] of week[dayOfWeek(day)] || []) { const t = day + a * MIN_MS; if (t >= ms) return t; }
    day = nextMidnight(day);
  }
  return null;
}
const winWeek = (w: SeqWindow | null | undefined): Week | null => { const a = minOf(w && w.start); const b = minOf(w && w.end); return a != null && b != null && b > a ? [0, 1, 2, 3, 4, 5, 6].map(() => [[a, b]]) as Week : null; };
// quando a etapa pode enviar: faixa da etapa e horário da automação ao mesmo tempo (null = nunca em 15 dias)
export function nextSendTime(ms: number, def: SeqDef | null | undefined, stepWindow?: SeqWindow | null): number | null {
  const week = scheduleWeek(def);
  const ws = winWeek(stepWindow);
  let t: number | null = ms;
  for (let i = 0; i < 60 && t != null; i++) {
    if (ws && !inWeek(t, ws)) { t = nextInWeek(t, ws); continue; }
    if (!inWeek(t, week)) { t = nextInWeek(t, week); continue; }
    return t;
  }
  return null;
}
// ⏳ "Esperar até o próximo [dia] às HH:MM": a próxima vez, DEPOIS do começo da espera
export function pausaUntil(waitStart: number, n: SeqNode): number | null {
  const m = minOf(n && n.until_time);
  if (m == null) return null;
  const want = n.until_day === 'qualquer' || n.until_day == null || n.until_day === '' ? null : Number(n.until_day);
  let day = midnightOf(waitStart);
  for (let i = 0; i < 15; i++) {
    const t = day + m * MIN_MS;
    if (t > waitStart && (want == null || dayOfWeek(day) === want)) return t;
    day = nextMidnight(day);
  }
  return null;
}

// ── Textos de cada caixa ──
const labelOf = (n: SeqNode, names: Names) => (n.source === 'whatsapp' ? names.label(n.wa_label_id, 'whatsapp') : names.label(n.label_id, 'crm'));
const shortUnit = (n: SeqNode) => `${n.amount} ${n.unit === 'minutos' ? 'min' : n.unit === 'horas' ? 'h' : Number(n.amount) === 1 ? 'dia' : 'dias'}`;
// Nome curto de cada passo (engine.js seqNodeLabel: "quantos estão em cada passo")
export function seqNodeLabel(def: SeqDef, id: string | null | undefined, names: Names = plainNames): string {
  const e = id ? seqIndex(def).get(id) : null;
  if (!e) return 'passo removido';
  const n = e.node;
  if (n.type === 'esperar') return `Esperando resposta (${seqFromEntry(n) ? 'até ' : ''}${shortUnit(n)}${seqFromEntry(n) ? ' depois de entrar' : ''})`;
  if (n.type === 'pausa') return n.mode === 'ate' ? `Esperando ${untilText(n)}` : seqFromEntry(n) ? `Esperando até ${unitText(n.amount, n.unit)} depois de entrar` : `Esperando ${unitText(n.amount, n.unit)}`;
  if (n.type === 'enviar') return `Antes de mandar “${names.item(n.item_id)}”`;
  if (n.type === 'etiqueta') return `${n.op === 'tirar' ? 'Tirando' : 'Colocando'} a etiqueta “${labelOf(n, names)}”`;
  if (n.type === 'fim') return 'Terminando';
  return n.type;
}

export type BoxKind = 'esperar' | 'enviar' | 'etiqueta' | 'pausa' | 'fim' | 'ir' | 'outro';
// mesmas cores e ícones do construtor da extensão
export const BOX_STYLE: Record<BoxKind, { icon: string; title: string; color: string }> = {
  esperar: { icon: '❓', title: 'ESPERAR RESPOSTA', color: '#8b5cf6' },
  enviar: { icon: '✉', title: 'ENVIAR', color: '#3b82f6' },
  etiqueta: { icon: '🏷', title: 'ETIQUETA', color: '#f97316' },
  pausa: { icon: '⏳', title: 'ESPERAR', color: '#64748b' },
  fim: { icon: '⏹', title: 'FIM', color: '#111827' },
  ir: { icon: '↪', title: 'CONTINUAR', color: '#64748b' },
  outro: { icon: '•', title: 'PASSO', color: '#64748b' },
};
export const boxKind = (n: SeqNode): BoxKind => (['esperar', 'enviar', 'etiqueta', 'pausa', 'fim', 'ir'].includes(n.type) ? n.type as BoxKind : 'outro');
const windowText = (w: SeqWindow | null | undefined) => (w && minOf(w.start) != null && minOf(w.end) != null ? `envia só entre ${w.start} e ${w.end}` : '');
// frase da caixa: { text, sub }
export function boxText(def: SeqDef, n: SeqNode, names: Names = plainNames): { text: string; sub: string | null } {
  const win = windowText(n.send_window);
  if (n.type === 'esperar') {
    const text = seqFromEntry(n) ? `Espera resposta até ${unitText(n.amount, n.unit)} depois de entrar` : `Espera resposta por ${unitText(n.amount, n.unit)}${n.after_mine ? ', contando da sua última mensagem' : ''}`;
    return { text, sub: [seqFromEntry(n) ? sinceEntryText(n) : '', win].filter(Boolean).join(' · ') || null };
  }
  if (n.type === 'pausa') {
    const text = n.mode === 'ate' ? `Espera ${untilText(n)}` : seqFromEntry(n) ? `Espera até ${unitText(n.amount, n.unit)} depois de entrar` : `Espera ${unitText(n.amount, n.unit)}`;
    return { text, sub: [seqFromEntry(n) ? sinceEntryText(n) : '', win].filter(Boolean).join(' · ') || null };
  }
  if (n.type === 'enviar') return { text: `Envia ${names.item(n.item_id)}`, sub: null };
  if (n.type === 'etiqueta') return { text: `${n.op === 'tirar' ? 'Tira' : 'Coloca'} ${labelOf(n, names)}${n.op !== 'tirar' && n.remove_others ? ' (e tira as outras)' : ''}`, sub: n.source === 'whatsapp' ? 'etiqueta do WhatsApp' : 'etiqueta do CRM' };
  if (n.type === 'fim') return { text: 'Termina: a pessoa sai da automação', sub: null };
  if (n.type === 'ir') return { text: `Continua em “${seqNodeLabel(def, n.to, names)}”`, sub: null };
  return { text: n.type, sub: null };
}
// "Se responder: coloca Analisar conversa e termina"
export function yesSummary(def: SeqDef, n: SeqNode, names: Names = plainNames): string {
  const parts: string[] = [];
  let more = false;
  for (const x of n.yes || []) {
    if (x.type === 'fim') break;
    if (x.type === 'etiqueta') parts.push(`${x.op === 'tirar' ? 'tira' : 'coloca'} ${labelOf(x, names)}${x.op !== 'tirar' && x.remove_others ? ' (e tira as outras)' : ''}`);
    else if (x.type === 'enviar') parts.push(`envia ${names.item(x.item_id)}`);
    else if (x.type === 'pausa') parts.push(boxText(def, x, names).text.toLowerCase());
    else if (x.type === 'esperar') { parts.push('espera resposta de novo'); more = true; break; }
    else if (x.type === 'ir') { parts.push(`continua em “${seqNodeLabel(def, x.to, names)}”`); more = true; break; }
  }
  if (!parts.length) return 'Se responder: termina';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
  return `Se responder: ${list}${more ? '' : ' e termina'}`;
}
// caminho principal ("se não responder"): os passos de cima para baixo, entrando sempre no ❌ das esperas de resposta
export function mainPath(def: SeqDef | null | undefined): SeqNode[] {
  const out: SeqNode[] = [];
  let list = (def && def.steps) || [];
  for (let g = 0; g < 50; g++) {
    let next: SeqNode[] | null = null;
    for (const n of list) {
      if (!n || !n.id) continue;
      out.push(n);
      if (n.type === 'fim' || n.type === 'ir') return out;
      if (n.type === 'esperar') { next = n.no || []; break; }
    }
    if (!next) break;
    list = next;
  }
  return out;
}
// passo onde o percurso está "estacionado" vale para o funil (os outros passos passam na hora)
export const parkingNode = (n: SeqNode) => n.type === 'esperar' || n.type === 'pausa' || n.type === 'enviar';

// ── Como começa / status ──
export function startText(a: AutomationRow, names: Names = plainNames): string {
  if (a.kind === 'sequencia') {
    const s = (a.sequence && a.sequence.start) || {};
    if (s.type === 'lead') return `Quando o lead chama pela primeira vez${s.origin === 'anuncio' ? ' (só de anúncio)' : s.origin === 'organico' ? ' (só orgânico)' : ''}`;
    if (s.type === 'etiqueta') return s.source === 'whatsapp' ? `Quando entra na etiqueta do WhatsApp ${names.label(s.wa_label_id, 'whatsapp')}` : `Quando entra na etiqueta CRM ${names.label(s.label_id, 'crm')}`;
    if (s.type === 'venda') return `Quando uma venda é registrada${s.label_id ? ` (só quem está em ${names.label(s.label_id, 'crm')})` : ''}`;
    if (s.type === 'manual') return 'Quando você adiciona a conversa pela extensão (🔁)';
    return 'Começo não escolhido';
  }
  const wa = a.trigger_label_source === 'whatsapp';
  const lbl = wa ? `do WhatsApp ${names.label(a.trigger_wa_label_id, 'whatsapp')}` : `CRM ${names.label(a.trigger_label_id, 'crm')}`;
  if (a.trigger_type === 'entrou_etiqueta') return `Quando entra na etiqueta ${lbl}`;
  if (a.trigger_type === 'sem_resposta') return `Quando não responde (etiqueta ${lbl})`;
  if (a.trigger_type === 'respondeu') return `Quando responde (etiqueta ${lbl})`;
  if (a.trigger_type === 'venda_registrada') return 'Quando uma venda é registrada';
  if (a.trigger_type === 'dia_hora') return 'Em dia e hora marcados';
  return 'Automação simples';
}
// faltas que deixam a automação como rascunho (engine.js seqValidate, sem os avisos de horário)
export function seqProblems(def: SeqDef | null | undefined): number {
  let n = 0;
  const st = (def && def.start) || {};
  if (!['lead', 'etiqueta', 'venda', 'manual'].includes(st.type || '')) n++;
  if (st.type === 'etiqueta' && !(st.source === 'whatsapp' ? st.wa_label_id : st.label_id)) n++;
  if (!(def && def.steps && def.steps.length)) n++;
  seqIndex(def).forEach(({ node: x }) => {
    if (x.type === 'enviar' && !x.item_id) n++;
    if (x.type === 'etiqueta' && !(x.source === 'whatsapp' ? x.wa_label_id : x.label_id)) n++;
    if ((x.type === 'esperar' || (x.type === 'pausa' && x.mode !== 'ate')) && !(Number(x.amount) >= 1)) n++;
  });
  return n;
}
export type AutoStatus = 'ligada' | 'desligada' | 'rascunho';
export function statusOf(a: AutomationRow): AutoStatus {
  if (a.active) return 'ligada';
  if (a.kind === 'sequencia' && seqProblems(a.sequence) > 0) return 'rascunho';
  return 'desligada';
}

// ── Datas para a tela (horário de São Paulo) ──
export const fmtDateTime = (ms: number | null) => { if (ms == null) return '—'; const d = sp(ms); return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)} às ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`; };
export const fmtTime = (ms: number) => { const d = sp(ms); return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`; };
// "hoje 14:00" · "amanhã 09:00" · "sex 13/11 às 09:00"
export function fmtWhen(ms: number | null, now: number): string {
  if (ms == null) return '—';
  const days = Math.round((midnightOf(ms) - midnightOf(now)) / DAY_MS);
  if (days === 0) return `hoje ${fmtTime(ms)}`;
  if (days === 1) return `amanhã ${fmtTime(ms)}`;
  if (days === -1) return `ontem ${fmtTime(ms)}`;
  const d = sp(ms);
  return `${DAY_SHORT[d.getUTCDay()]} ${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)} às ${fmtTime(ms)}`;
}
// "agora" · "há 5 min" · "há 3 h" · "há 2 dias"
export function fmtAgo(ms: number | null, now: number): string {
  if (ms == null) return '—';
  const m = Math.max(0, Math.floor((now - ms) / MIN_MS));
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d === 1 ? '' : 's'}`;
}
// engine.js formatLeft
export function formatLeft(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / MIN_MS));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${two(m % 60)}`;
  return `${Math.floor(h / 24)} dias`;
}

// ── Simular (engine.js seqSimulate), também a partir do ponto em que a pessoa está ──
export interface SimEvent { kind: 'inicio' | 'enviar' | 'etiqueta' | 'pausa' | 'nao' | 'respondeu' | 'fim'; text: string; node: string | null; at: number; day: number; when?: number }
export interface SimFrom { node: string | null; tm: number; firstDue: number | null }
export function seqSimulate(def: SeqDef, scenario: 'nunca' | 'primeiro' = 'nunca', { names = plainNames, startAt = null, from = null }: { names?: Names; startAt?: number | null; from?: SimFrom | null } = {}): SimEvent[] {
  const idx = seqIndex(def);
  const out: SimEvent[] = [];
  const real = Number.isFinite(startAt as number);
  const start = real ? (startAt as number) : 0;
  let tm = from ? from.tm : start;
  let at = 0;
  let win: SeqWindow | null | undefined = null;
  let replied = false;
  let id = from ? from.node : seqFirstOf(def && def.steps);
  let first = from ? from.firstDue : null; // prazo real da espera em que a pessoa está agora
  const push = (ev: Omit<SimEvent, 'at' | 'day' | 'when'>, when?: number) => {
    const t = when ?? tm;
    out.push(real ? { ...ev, at: Math.round((t - start) / MIN_MS), when: t, day: Math.floor((t - start) / DAY_MS) } : { ...ev, at, day: Math.floor(at / 1440) });
  };
  const waitFor = (n: SeqNode) => {
    const need = seqNeedMin(n);
    // prazo real da espera atual (se já passou, o que vem depois fica "atrasado": o motor faz assim que puder)
    if (first != null) { const due = first; first = null; tm = due; return due; }
    if (seqFromEntry(n)) { if (!real) at = Math.max(at, need); else tm = Math.max(tm, start + need * MIN_MS); return tm; }
    if (!real) { at += need; return tm; }
    tm += need * MIN_MS;
    return tm;
  };
  if (!from) push({ kind: 'inicio', text: 'Entra na automação', node: 'start' });
  for (let g = 0; g < 200; g++) {
    if (!id) { push({ kind: 'fim', text: 'Fim: sai da automação', node: null }); break; }
    const e = idx.get(id);
    if (!e) { push({ kind: 'fim', text: 'Fim', node: null }); break; }
    const n = e.node;
    if (n.type === 'fim') { push({ kind: 'fim', text: 'Fim: sai da automação', node: n.id }); break; }
    if (n.type === 'ir') { id = n.to || null; continue; }
    if (n.type === 'enviar') {
      if (real) {
        const ok = nextSendTime(tm, def, win);
        if (ok == null) { push({ kind: 'fim', text: 'Sem horário possível para enviar (confira os horários)', node: n.id }); break; }
        tm = ok;
      }
      push({ kind: 'enviar', text: `Recebe ${names.item(n.item_id)}`, node: n.id });
      win = null;
      first = null;
    }
    if (n.type === 'etiqueta') push({ kind: 'etiqueta', text: `${n.op === 'tirar' ? 'Sai da' : 'Entra na'} etiqueta ${labelOf(n, names)}${n.op !== 'tirar' && n.remove_others ? ' (e sai das outras)' : ''}`, node: n.id });
    if (n.type === 'pausa') {
      if (n.mode === 'ate') {
        if (first != null) { tm = Math.max(tm, first); first = null; } else if (real) { const u = pausaUntil(tm, n); tm = u == null ? tm : u; } else at += 1440;
        push({ kind: 'pausa', text: `Esperou ${untilText(n)}`, node: n.id });
      } else {
        const due = waitFor(n);
        push({ kind: 'pausa', text: seqFromEntry(n) ? `Esperou até ${unitText(n.amount, n.unit)} depois de entrar` : `Esperou ${unitText(n.amount, n.unit)}`, node: n.id }, real ? due : undefined);
      }
      win = n.send_window || null;
    }
    if (n.type === 'esperar') {
      win = n.send_window || null;
      if (scenario === 'primeiro' && !replied) {
        replied = true;
        if (real) tm += 5 * MIN_MS; else at += 5;
        push({ kind: 'respondeu', text: '✅ Respondeu', node: n.id });
        id = seqFirstOf(n.yes);
        continue;
      }
      const due = waitFor(n);
      push({ kind: 'nao', text: seqFromEntry(n) ? `❌ Não respondeu até ${unitText(n.amount, n.unit)} depois de entrar` : `❌ Não respondeu em ${unitText(n.amount, n.unit)}`, node: n.id }, real ? due : undefined);
      id = seqFirstOf(n.no);
      continue;
    }
    id = seqNextOf(idx, id);
  }
  return out;
}
// "na hora" · "+2 h" · "+1 dia 3 h"
export function simAtText(min: number): string {
  if (!min) return 'na hora';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return `+${[d ? `${d} dia${d === 1 ? '' : 's'}` : '', h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')}`;
}
// As caixas ✉ ENVIAR na ordem do caminho de quem nunca responde (engine.js seqSendSteps): n (1º, 2º…), minutos e
// dia desde a entrada e as ❓ que deram ❌ até ela
export interface SendStep { node: string; n: number; at: number; day: number; branches: string[]; itemId: string | null }
export function seqSendSteps(def: SeqDef): SendStep[] {
  const idx = seqIndex(def);
  const out: SendStep[] = [];
  const seen = new Set<string>();
  let branches: string[] = [];
  seqSimulate(def, 'nunca').forEach((ev) => {
    if (ev.kind === 'nao' && ev.node) branches = [...branches, ev.node];
    if (ev.kind === 'enviar' && ev.node && !seen.has(ev.node)) {
      seen.add(ev.node);
      out.push({ node: ev.node, n: out.length + 1, at: ev.at, day: ev.day, branches: [...branches], itemId: (idx.get(ev.node)?.node.item_id) || null });
    }
  });
  return out;
}

// ── Pessoa na régua ──
// prazo da espera em que o percurso está (null se não está numa espera ou ainda depende da SUA mensagem)
export function currentDue(def: SeqDef, run: RunRow): number | null {
  const e = run.node ? seqIndex(def).get(run.node) : null;
  if (!e) return null;
  const n = e.node;
  if (n.type !== 'esperar' && n.type !== 'pausa') return null;
  const recorded = msOf(run.due_at);
  if (recorded != null) return recorded;
  const entered = msOf(run.created_at);
  const ws = msOf(run.wait_started_at);
  if (seqFromEntry(n) && entered != null) return entered + seqNeedMin(n) * MIN_MS;
  if (n.type === 'pausa' && n.mode === 'ate') return ws != null ? pausaUntil(ws, n) : null;
  if (n.type === 'esperar' && n.after_mine) return null;
  return ws != null ? ws + seqNeedMin(n) * MIN_MS : null;
}
// Texto do passo atual (engine.js seqDescribe)
export function seqDescribe(def: SeqDef, run: RunRow, now: number, names: Names = plainNames): string {
  if (run.status && run.status !== 'ativo') return outcomeText(run.outcome).toLowerCase();
  const e = seqIndex(def).get(run.node || seqFirstOf(def.steps) || '');
  if (!e) return 'terminando';
  const n = e.node;
  const due = currentDue(def, run);
  if (n.type === 'esperar') {
    if (n.after_mine && !due) return 'esperando a sua mensagem';
    return due ? `esperando resposta (${due > now ? `faltam ${formatLeft(due - now)}` : 'prazo vencido'})` : 'esperando resposta';
  }
  if (n.type === 'pausa') return due ? `esperando (${due > now ? `faltam ${formatLeft(due - now)}` : 'prazo vencido'})` : n.mode === 'ate' ? `esperando ${untilText(n)}` : `esperando ${unitText(n.amount, n.unit)}`;
  if (n.type === 'enviar') return `vai mandar ${names.item(n.item_id)}`;
  if (n.type === 'etiqueta') return 'vai mexer nas etiquetas';
  return 'continuando';
}
// o que ainda vai acontecer com a pessoa (cenário "nunca responde"), com data/hora prevista
export function futureOf(def: SeqDef, run: RunRow, now: number, names: Names = plainNames): SimEvent[] {
  if (run.status !== 'ativo') return [];
  const entered = msOf(run.created_at) ?? now;
  const node = run.node || seqFirstOf(def.steps);
  return seqSimulate(def, 'nunca', { names, startAt: entered, from: { node, tm: now, firstDue: currentDue(def, run) } });
}
// próximo envio (ou o fim) e quando; late = já passou do previsto (o motor faz assim que puder)
export interface NextStep { text: string; when: number | null; late: boolean; kind: SimEvent['kind'] }
export function nextStep(def: SeqDef, run: RunRow, now: number, names: Names = plainNames): NextStep | null {
  const fut = futureOf(def, run, now, names);
  const ev = fut.find((x) => x.kind === 'enviar') || fut.find((x) => x.kind === 'fim') || null;
  if (!ev) return null;
  const when = ev.when ?? null;
  return { text: ev.kind === 'fim' ? 'Termina a automação' : ev.text, when, late: when != null && when < now - 5 * MIN_MS, kind: ev.kind };
}
// linha do tempo da pessoa: o que já aconteceu (✓, com a data real) e o que está previsto
export interface TimelineEvent { done: boolean; kind: string; text: string; when: number | null; late?: boolean; detail?: string | null }
export function personTimeline(def: SeqDef, run: RunRow, sends: SendLogRow[], now: number, names: Names = plainNames): TimelineEvent[] {
  const idx = seqIndex(def);
  const done: TimelineEvent[] = [{ done: true, kind: 'inicio', text: 'Entrou na automação', when: msOf(run.created_at) }];
  (run.branches || []).forEach((b) => {
    const n = idx.get(b.node)?.node;
    const t = Number(b.at) || null;
    if (b.result === 'sim') done.push({ done: true, kind: 'respondeu', text: '✅ Respondeu', when: t, detail: n ? seqNodeLabel(def, n.id, names) : null });
    else done.push({ done: true, kind: 'nao', text: n && seqFromEntry(n) ? `❌ Não respondeu até ${unitText(n.amount, n.unit)} depois de entrar` : n ? `❌ Não respondeu em ${unitText(n.amount, n.unit)}` : '❌ Não respondeu', when: t });
  });
  sends.forEach((s) => {
    const t = msOf(s.created_at);
    if (s.status === 'enviado') done.push({ done: true, kind: 'enviar', text: `Recebeu ${names.item(s.item_id)}`, when: t });
    else if (s.status === 'pulado') done.push({ done: true, kind: 'pulado', text: `Não recebeu ${names.item(s.item_id)} (pulado)`, when: t, detail: s.reason || null });
    else if (s.status === 'falhou') done.push({ done: true, kind: 'erro', text: `Erro ao enviar ${names.item(s.item_id)}`, when: t, detail: s.reason || null });
  });
  if (run.status !== 'ativo') done.push({ done: true, kind: 'fim', text: `Saiu: ${outcomeText(run.outcome)}`, when: endedAt(run) });
  done.sort((a, b) => (a.when ?? 0) - (b.when ?? 0));
  const fut: TimelineEvent[] = futureOf(def, run, now, names).map((ev) => ({ done: false, kind: ev.kind, text: ev.kind === 'fim' ? 'Termina a automação' : ev.text, when: ev.when ?? null, late: ev.when != null && ev.when < now - 5 * MIN_MS }));
  return [...done, ...fut];
}

// extensão 2.16.8: "Pular espera" já clicado no painel da conversa (skip_wait no banco): o próximo envio está na fila
export const SKIPPED_WAIT_TEXT = '⏩ pulou a espera';
export const skippedWait = (run: RunRow): boolean => run.status === 'ativo' && run.skip_wait === true;

// ── Saídas ──
// quando terminou (quem foi encerrado direto no banco pode não ter ended_at: vale a última mudança)
export const endedAt = (run: RunRow) => msOf(run.ended_at) ?? msOf(run.updated_at);
const OUTCOMES: Record<string, string> = {
  respondeu: 'Respondeu ✅', nao_respondeu: 'Chegou ao fim sem responder', fim: 'Chegou ao fim', manual: 'Tirado manualmente',
  nao_enviar: 'Etiqueta Não enviar', etiqueta_excluida: 'Etiqueta excluída', id_duplicado: 'ID duplicado (troca de id do WhatsApp)',
  outra_regua: 'Entrou em outra régua', reentrou: 'Entrou de novo', sem_mensagem: 'Mensagem não existe mais',
};
export const outcomeText = (o: string | null | undefined) => (o ? OUTCOMES[o] || o : 'Saiu');
export const OUTCOME_KEYS = Object.keys(OUTCOMES);
export type OutcomeGroup = 'respondeu' | 'fim' | 'outro';
export const outcomeGroup = (o: string | null | undefined): OutcomeGroup => (o === 'respondeu' ? 'respondeu' : o === 'nao_respondeu' || o === 'fim' ? 'fim' : 'outro');
// em que etapa parou: a caixa em que estava, ou a última ❓ decidida
export function stopText(def: SeqDef, run: RunRow, names: Names = plainNames): string {
  if (run.node && seqIndex(def).has(run.node)) return seqNodeLabel(def, run.node, names);
  const b = (run.branches || [])[(run.branches || []).length - 1];
  if (b && seqIndex(def).has(b.node)) return `${b.result === 'sim' ? '✅' : '❌'} ${seqNodeLabel(def, b.node, names)}`;
  return '—';
}

// ── Funil e conversão ──
export interface FunnelRow { node: string; label: string; kind: BoxKind; count: number }
// quantos percursos ativos estão em cada passo do caminho principal (os que estão em outro caminho: "outros")
export function funnel(def: SeqDef, activeNodes: (string | null)[], names: Names = plainNames): { rows: FunnelRow[]; other: number } {
  const counts = new Map<string, number>();
  activeNodes.forEach((n) => { const k = n || seqFirstOf(def.steps) || ''; counts.set(k, (counts.get(k) || 0) + 1); });
  const rows: FunnelRow[] = [];
  let placed = 0;
  mainPath(def).forEach((n) => {
    const c = counts.get(n.id) || 0;
    placed += c;
    if (parkingNode(n) || c) rows.push({ node: n.id, label: seqNodeLabel(def, n.id, names), kind: boxKind(n), count: c });
  });
  return { rows, other: activeNodes.length - placed };
}
// Respondeu depois de qual follow: as ✉ ENVIAR que a pessoa recebeu antes da ❓ que deu ✅
export interface ConversionRow { key: string; label: string; itemId: string | null; responded: number; sent: number | null; rate: number | null }
export function conversionBySend(def: SeqDef, runs: RunRow[], sentByItem: Record<string, number> | null, names: Names = plainNames): ConversionRow[] {
  const path = mainPath(def);
  const sendsBefore = new Map<string, number>();
  let k = 0;
  path.forEach((n) => { if (n.type === 'enviar') k++; if (n.type === 'esperar') sendsBefore.set(n.id, k); });
  const steps = seqSendSteps(def);
  const responded = new Map<number, number>();
  runs.forEach((r) => {
    if (r.outcome !== 'respondeu') return;
    const sim = (r.branches || []).find((b) => b.result === 'sim');
    if (!sim || !sendsBefore.has(sim.node)) return;
    const s = sendsBefore.get(sim.node) as number;
    responded.set(s, (responded.get(s) || 0) + 1);
  });
  const rows: ConversionRow[] = [];
  if (responded.get(0)) rows.push({ key: 's0', label: 'Antes do 1º envio', itemId: null, responded: responded.get(0) as number, sent: null, rate: null });
  steps.forEach((s) => {
    const sent = sentByItem && s.itemId != null && sentByItem[s.itemId] != null ? sentByItem[s.itemId] : null;
    const got = responded.get(s.n) || 0;
    rows.push({ key: s.node, label: `Depois do ${names.item(s.itemId)}`, itemId: s.itemId, responded: got, sent, rate: sent ? got / sent : null });
  });
  return rows;
}

// ── Pessoas ──
// "21 9****-1234" (DDD + 1º dígito + **** + 4 últimos); sem DDD do Brasil: só os 4 últimos
export function maskPhone(phone: string | null | undefined): string {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '—';
  const local = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
  if (local.length >= 10 && local.length <= 11) {
    const ddd = local.slice(0, 2);
    const num = local.slice(2);
    return `${ddd} ${num[0]}****-${num.slice(-4)}`;
  }
  return `****${d.slice(-4)}`;
}
export const phoneOfChat = (chatId: string | null | undefined) => { const m = /^(\d{8,15})@c\.us$/.exec(chatId || ''); return m ? m[1] : null; };
export const waLink = (phone: string | null | undefined) => { const d = String(phone || '').replace(/\D/g, ''); return d ? `https://web.whatsapp.com/send?phone=${d}` : null; };
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// busca por nome (sem acento) ou por dígitos do telefone
export function matchesPerson(q: string, name: string | null | undefined, phone: string | null | undefined): boolean {
  const t = q.trim();
  if (!t) return true;
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 3 && String(phone || '').includes(digits)) return true;
  return fold(String(name || '')).includes(fold(t));
}
// prévia do texto: as 2 primeiras linhas (e se tem mais)
export function previewLines(body: string | null | undefined, lines = 2): { text: string; more: boolean } {
  const all = String(body || '').replace(/\r/g, '').split('\n').filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));
  return { text: all.slice(0, lines).join('\n'), more: all.length > lines };
}
