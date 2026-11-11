// Regras da aba Instagram (FASE 1, só leitura). Puras (sem React nem Supabase): conferidas em
// scripts/tests/igInsights.test.ts. Os dados vêm da edge function "instagram" (src/lib/igDb.ts).
// Tudo o que aparece em "O que funciona" sai daqui, com a conta escrita no cartão ("Por quê").

export type IgPeriod = 7 | 14 | 30 | 90 | 180 | 365;
export const IG_PERIODS: IgPeriod[] = [7, 14, 30, 90, 180, 365];
// 6 e 12 meses: montados com o HISTÓRICO GUARDADO (a Meta só devolve totais em blocos de 30 dias)
export const HISTORY_PERIODS: IgPeriod[] = [180, 365];
export const periodLabel = (d: number) => (d === 180 ? "6 meses" : d === 365 ? "12 meses" : `${d} dias`);
export type MediaKind = 'REEL' | 'CAROUSEL' | 'IMAGE' | 'VIDEO';
export const KIND_LABEL: Record<MediaKind, string> = { REEL: 'Reel', CAROUSEL: 'Carrossel', IMAGE: 'Foto', VIDEO: 'Vídeo' };
export const KIND_COLOR: Record<MediaKind, string> = { REEL: '#c026d3', CAROUSEL: '#2563eb', IMAGE: '#059669', VIDEO: '#ea580c' };

export interface IgMetrics {
  reach: number | null; views: number | null; likes: number | null; comments: number | null; saved: number | null; shares: number | null;
  total_interactions: number | null; follows: number | null; profile_visits: number | null; avg_watch_ms: number | null; total_watch_ms: number | null;
}
export interface IgMedia { id: string; kind: MediaKind; caption: string; permalink: string | null; timestamp: string | null; thumb: string | null; children?: { kind: string; thumb: string | null }[]; metrics: IgMetrics }
export interface IgTotals { reach: number | null; views: number | null; accounts_engaged: number | null; total_interactions: number | null; profile_views: number | null; website_clicks: number | null; profile_links_taps: number | null; follows: number | null; unfollows: number | null; net_followers: number | null }
export interface IgProfile { id: string; username: string; name: string; picture: string | null; followers: number | null; follows: number | null; media_count: number | null; biography: string; website: string }
export interface IgDailyRow { day: string; reach: number | null; views: number | null; gained: number | null; lost: number | null }

// ── comparação com o período anterior ──
export interface Delta { pct: number | null; dir: 'up' | 'down' | 'flat' | 'none' }
export function deltaOf(cur: number | null | undefined, prev: number | null | undefined): Delta {
  if (cur == null || prev == null) return { pct: null, dir: 'none' };
  if (prev === 0) return cur === 0 ? { pct: 0, dir: 'flat' } : { pct: null, dir: cur > 0 ? 'up' : 'down' };
  const pct = (cur - prev) / Math.abs(prev);
  return { pct, dir: Math.abs(pct) < 0.005 ? 'flat' : pct > 0 ? 'up' : 'down' };
}
// cliques na bio: "website_clicks" (antigo) ou "profile_links_taps" (novo), o que a Meta devolver
export const bioTaps = (t: IgTotals | null | undefined): number | null => (t ? t.website_clicks ?? t.profile_links_taps ?? null : null);

// ── engajamento ──
// (curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance; sem alcance = null
export function engagementOf(m: IgMetrics): number | null {
  if (!m.reach) return null;
  return ((m.likes || 0) + (m.comments || 0) + (m.saved || 0) + (m.shares || 0)) / m.reach;
}

export type SortKey = 'views' | 'reach' | 'likes' | 'comments' | 'saved' | 'shares' | 'follows' | 'engagement';
export const SORT_LABEL: Record<SortKey, string> = { views: 'Visualizações', reach: 'Alcance', likes: 'Curtidas', comments: 'Comentários', saved: 'Salvamentos', shares: 'Compartilhamentos', follows: 'Seguidores gerados', engagement: 'Taxa de engajamento' };
export const sortValue = (m: IgMedia, k: SortKey): number | null => (k === 'engagement' ? engagementOf(m.metrics) : m.metrics[k]);
// maior primeiro; sem valor vai para o fim; empate: mais recente primeiro
export function sortMedia(list: IgMedia[], k: SortKey): IgMedia[] {
  return [...list].sort((a, b) => {
    const x = sortValue(a, k); const y = sortValue(b, k);
    if (x == null && y == null) return String(b.timestamp).localeCompare(String(a.timestamp));
    if (x == null) return 1; if (y == null) return -1;
    return y - x || String(b.timestamp).localeCompare(String(a.timestamp));
  });
}

const avg = (xs: (number | null)[]): number | null => { const v = xs.filter((x): x is number => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const MIN_POSTS = 2; // faixa/formato com menos de 2 posts não vence (aparece como "poucos dados")

// ── melhor formato: média por tipo ──
export interface FormatRow { kind: MediaKind; posts: number; reach: number | null; views: number | null; engagement: number | null; follows: number | null; saved: number | null }
export interface FormatResult { rows: FormatRow[]; best: FormatRow | null; bestEngagement: FormatRow | null; why: string; lowData: boolean }
export function bestFormat(list: IgMedia[]): FormatResult {
  const kinds = [...new Set(list.map((m) => m.kind))];
  const rows: FormatRow[] = kinds.map((kind) => {
    const g = list.filter((m) => m.kind === kind);
    return { kind, posts: g.length, reach: avg(g.map((m) => m.metrics.reach)), views: avg(g.map((m) => m.metrics.views)), engagement: avg(g.map((m) => engagementOf(m.metrics))), follows: avg(g.map((m) => m.metrics.follows)), saved: avg(g.map((m) => m.metrics.saved)) };
  }).sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1));
  const eligible = rows.filter((r) => r.posts >= MIN_POSTS);
  const pool = eligible.length ? eligible : rows;
  const best = pool.filter((r) => r.reach != null).sort((a, b) => (b.reach as number) - (a.reach as number))[0] || null;
  const bestEngagement = pool.filter((r) => r.engagement != null).sort((a, b) => (b.engagement as number) - (a.engagement as number))[0] || null;
  const why = best ? `Média de alcance por post de cada formato (só formatos com ${MIN_POSTS}+ posts disputam). ${KIND_LABEL[best.kind]}: ${fmtN(best.reach)} em ${best.posts} post${best.posts > 1 ? 's' : ''}.` : 'Sem posts com alcance no período.';
  return { rows, best, bestEngagement, why, lowData: !eligible.length };
}

// ── melhores dias e horários (horário de São Paulo) ──
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const BANDS = [
  { id: 'madrugada', label: 'Madrugada (0h–6h)', from: 0, to: 6 },
  { id: 'manha', label: 'Manhã (6h–12h)', from: 6, to: 12 },
  { id: 'tarde', label: 'Tarde (12h–18h)', from: 12, to: 18 },
  { id: 'noite', label: 'Noite (18h–24h)', from: 18, to: 24 },
] as const;
const spParts = (iso: string) => { const d = new Date(Date.parse(iso) - 3 * 3600000); return { wd: d.getUTCDay(), h: d.getUTCHours(), day: d.toISOString().slice(0, 10) }; };
export interface SlotRow { id: string; label: string; posts: number; reach: number | null; engagement: number | null }
export interface TimesResult { days: SlotRow[]; bands: SlotRow[]; bestDay: SlotRow | null; bestBand: SlotRow | null; why: string }
export function bestTimes(list: IgMedia[]): TimesResult {
  const withT = list.filter((m) => m.timestamp && Number.isFinite(Date.parse(m.timestamp)));
  const slot = (id: string, label: string, g: IgMedia[]): SlotRow => ({ id, label, posts: g.length, reach: avg(g.map((m) => m.metrics.reach)), engagement: avg(g.map((m) => engagementOf(m.metrics))) });
  const days = WEEKDAYS.map((label, wd) => slot(String(wd), label, withT.filter((m) => spParts(m.timestamp as string).wd === wd))).filter((r) => r.posts > 0);
  const bands = BANDS.map((b) => slot(b.id, b.label, withT.filter((m) => { const h = spParts(m.timestamp as string).h; return h >= b.from && h < b.to; }))).filter((r) => r.posts > 0);
  const pick = (rows: SlotRow[]) => { const e = rows.filter((r) => r.posts >= MIN_POSTS && r.reach != null); return e.sort((a, b) => (b.reach as number) - (a.reach as number) || (b.engagement ?? 0) - (a.engagement ?? 0))[0] || null; };
  const sortRows = (rows: SlotRow[]) => [...rows].sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1));
  return { days: sortRows(days), bands: sortRows(bands), bestDay: pick(days), bestBand: pick(bands), why: `Média de alcance (e de engajamento) dos posts publicados em cada dia da semana e faixa de horário (São Paulo). Só faixas com ${MIN_POSTS}+ posts disputam.` };
}

// ── top 3 em seguidores e salvamentos ──
export function topBy(list: IgMedia[], k: 'follows' | 'saved', n = 3): IgMedia[] {
  return sortMedia(list.filter((m) => (m.metrics[k] || 0) > 0), k).slice(0, n);
}

// ── frequência de postagem × alcance ──
// Com 3+ semanas: semanas com mais posts (acima da mediana) × as outras, pela média de alcance somado dos posts.
// Com menos: dias COM post × dias SEM post, pela média do alcance diário da conta (o gráfico).
export interface FreqResult { mode: 'week' | 'day' | 'none'; rows: { label: string; posts: number; reach: number | null }[]; high: number | null; low: number | null; text: string; why: string }
const weekKey = (day: string) => { const t = Date.parse(`${day}T00:00:00Z`); const wd = new Date(t).getUTCDay(); return new Date(t - ((wd + 6) % 7) * 86400000).toISOString().slice(0, 10); }; // segunda-feira
export function frequencyVsReach(list: IgMedia[], daily: IgDailyRow[] | null, period: { fromDay: string; toDay: string }): FreqResult {
  const posts = list.filter((m) => m.timestamp);
  const weeks = new Map<string, { posts: number; reach: number }>();
  for (let t = Date.parse(`${period.fromDay}T00:00:00Z`); t <= Date.parse(`${period.toDay}T00:00:00Z`); t += 86400000) { const k = weekKey(new Date(t).toISOString().slice(0, 10)); if (!weeks.has(k)) weeks.set(k, { posts: 0, reach: 0 }); }
  posts.forEach((m) => { const w = weeks.get(weekKey(spParts(m.timestamp as string).day)); if (w) { w.posts++; w.reach += m.metrics.reach || 0; } });
  const wrows = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ label: `Semana de ${k.slice(8, 10)}/${k.slice(5, 7)}`, posts: v.posts, reach: v.reach }));
  if (wrows.length >= 3 && posts.length) {
    const med = [...wrows.map((r) => r.posts)].sort((a, b) => a - b)[Math.floor(wrows.length / 2)];
    const hi = wrows.filter((r) => r.posts > med); const lo = wrows.filter((r) => r.posts <= med);
    const high = avg(hi.map((r) => r.reach)); const low = avg(lo.map((r) => r.reach));
    const text = !hi.length ? `Você postou num ritmo parecido todas as semanas (${med} por semana); ainda não dá para comparar.`
      : `Semanas com mais de ${med} post${med === 1 ? '' : 's'}: alcance médio de ${fmtN(high)} por semana; nas outras: ${fmtN(low)}.`;
    return { mode: 'week', rows: wrows, high, low, text, why: 'Alcance de cada semana = soma do alcance dos posts publicados nela. Semanas acima da mediana de posts × as demais.' };
  }
  if (daily && daily.length) {
    const postDays = new Set(posts.map((m) => spParts(m.timestamp as string).day));
    const rows = daily.map((d) => ({ label: `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}`, posts: posts.filter((m) => spParts(m.timestamp as string).day === d.day).length, reach: d.reach }));
    const high = avg(daily.filter((d) => postDays.has(d.day)).map((d) => d.reach)); const low = avg(daily.filter((d) => !postDays.has(d.day)).map((d) => d.reach));
    const text = high == null || low == null ? 'Ainda não dá para comparar (precisa de dias com e sem post).' : `Dias com post: alcance médio de ${fmtN(high)}; dias sem post: ${fmtN(low)}${low > 0 ? ` (${high >= low ? '+' : ''}${Math.round(((high - low) / low) * 100)}%)` : ''}.`;
    return { mode: 'day', rows, high, low, text, why: 'Alcance diário da conta (gráfico) nos dias em que houve post × nos dias sem post.' };
  }
  return { mode: 'none', rows: [], high: null, low: null, text: 'Sem dados suficientes para comparar.', why: '' };
}

// ── público ──
export interface AudienceRow { key: string; value: number }
// % de cada item sobre o total; só os n maiores (keepOrder: mantém a ordem recebida, ex.: faixas etárias)
export function audienceShare(rows: AudienceRow[], n = 8, keepOrder = false): { label: string; value: number; pct: number }[] {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return [];
  const big = new Set([...rows].sort((a, b) => b.value - a.value).slice(0, n));
  return (keepOrder ? rows : [...rows].sort((a, b) => b.value - a.value)).filter((r) => big.has(r)).map((r) => ({ label: r.key, value: r.value, pct: r.value / total }));
}
export const GENDER_LABEL: Record<string, string> = { F: 'Mulheres', M: 'Homens', U: 'Não informado' };
export const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
export const sortAges = (rows: AudienceRow[]) => [...rows].sort((a, b) => AGE_ORDER.indexOf(a.key) - AGE_ORDER.indexOf(b.key));

// ── formatos ──
export function fmtN(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} mi`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1).replace('.', ',').replace(',0', '')} mil`;
  return Math.round(n).toLocaleString('pt-BR');
}
export const fmtPct = (n: number | null | undefined, d = 1) => (n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(d).replace('.', ',')}%`);
export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
  const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60);
  return `${h} h${m ? ` ${m} min` : ''}`;
}
export function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(Date.parse(iso) - 3 * 3600000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} às ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
export function deltaText(d: Delta): string {
  if (d.dir === 'none') return '—';
  if (d.dir === 'flat') return '= 0%';
  if (d.pct == null) return d.dir === 'up' ? '▲ novo' : '▼';
  return `${d.dir === 'up' ? '▲' : '▼'} ${Math.abs(Math.round(d.pct * 100))}%`;
}

// ════════════════════════════════════════════════════════════════════════════
// HISTÓRICO PRÓPRIO — stories (ig_stories) e a foto do dia da conta (ig_daily_account) / posts (ig_daily_media),
// guardados pela edge function "instagram" (collect_stories a cada 1 h; collect_daily 1x por dia).
// ════════════════════════════════════════════════════════════════════════════
export interface IgStory {
  id: string; media_type: string | null; thumb: string | null; permalink: string | null; posted_at: string; expires_at: string; last_read_at: string;
  views: number | null; reach: number | null; replies: number | null; shares: number | null; total_interactions: number | null; follows: number | null; profile_visits: number | null;
  navigation: number | null; taps_forward: number | null; taps_back: number | null; exits: number | null; swipe_forward: number | null;
}
export interface IgDayAccount { day: string; followers: number | null; reach: number | null; views: number | null; accounts_engaged: number | null; total_interactions: number | null; profile_views: number | null; profile_links_taps: number | null; gained: number | null; lost: number | null }
export const storyDay = (s: Pick<IgStory, 'posted_at'>) => spParts(s.posted_at).day;
export const storyHour = (s: Pick<IgStory, 'posted_at'>) => spParts(s.posted_at).h;
// a leitura guardada é a final? (a última leitura foi com 23 h ou mais do story no ar)
export const storyFinal = (s: Pick<IgStory, 'posted_at' | 'last_read_at'>) => Date.parse(s.last_read_at) - Date.parse(s.posted_at) >= 23 * 3600000;

// stories por dia (o dia mais novo primeiro; dentro do dia, pela hora)
export interface StoryDay { day: string; stories: IgStory[]; views: number; reach: number; replies: number }
export function storiesByDay(list: IgStory[]): StoryDay[] {
  const m = new Map<string, IgStory[]>();
  list.forEach((s) => { const d = storyDay(s); m.set(d, [...(m.get(d) || []), s]); });
  return [...m.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([day, ss]) => {
    const stories = [...ss].sort((a, b) => a.posted_at.localeCompare(b.posted_at));
    const sum = (k: 'views' | 'reach' | 'replies') => stories.reduce((n, s) => n + (s[k] || 0), 0);
    return { day, stories, views: sum('views'), reach: sum('reach'), replies: sum('replies') };
  });
}
// ranking dos melhores stories: mais views; empate: mais alcance, mais respostas
export function bestStories(list: IgStory[], n = 5): IgStory[] {
  return [...list].filter((s) => s.views != null).sort((a, b) => (b.views as number) - (a.views as number) || (b.reach ?? 0) - (a.reach ?? 0) || (b.replies ?? 0) - (a.replies ?? 0)).slice(0, n);
}
// taxa de saída (saídas ÷ views), quando a Meta devolveu
export const exitRate = (s: Pick<IgStory, 'exits' | 'views'>) => (s.exits != null && s.views ? s.exits / s.views : null);

// "O que funciona" nos stories — regras transparentes:
//   - média de views por story (todos os do período com views);
//   - melhor horário: média de views dos stories publicados em cada hora (São Paulo); só horas com 2+ stories disputam;
//   - quantos stories por dia rendem mais: dias agrupados por quantidade (1 · 2–3 · 4–6 · 7+); compara a média de views
//     POR STORY e o total de views do DIA; vence o grupo (com 2+ dias) com mais views por dia.
export interface StoryHourRow { hour: number; label: string; stories: number; avgViews: number | null }
export interface StoryPerDayRow { id: string; label: string; days: number; avgPerStory: number | null; avgPerDay: number | null }
export interface StoryWorks { avgViews: number | null; stories: number; hours: StoryHourRow[]; bestHour: StoryHourRow | null; perDay: StoryPerDayRow[]; bestPerDay: StoryPerDayRow | null; why: string }
const PER_DAY = [{ id: '1', label: '1 story', from: 1, to: 1 }, { id: '2-3', label: '2–3 stories', from: 2, to: 3 }, { id: '4-6', label: '4–6 stories', from: 4, to: 6 }, { id: '7+', label: '7 ou mais', from: 7, to: Infinity }];
export function storyWhatWorks(list: IgStory[]): StoryWorks {
  const withV = list.filter((s) => s.views != null);
  const hours: StoryHourRow[] = Array.from({ length: 24 }, (_, h) => {
    const g = withV.filter((s) => storyHour(s) === h);
    return { hour: h, label: `${String(h).padStart(2, '0')}h`, stories: g.length, avgViews: avg(g.map((s) => s.views)) };
  }).filter((r) => r.stories > 0);
  const bestHour = [...hours].filter((r) => r.stories >= MIN_POSTS && r.avgViews != null).sort((a, b) => (b.avgViews as number) - (a.avgViews as number) || b.stories - a.stories)[0] || null;
  const days = storiesByDay(withV);
  const perDay: StoryPerDayRow[] = PER_DAY.map((b) => {
    const g = days.filter((d) => d.stories.length >= b.from && d.stories.length <= b.to);
    return { id: b.id, label: b.label, days: g.length, avgPerStory: avg(g.flatMap((d) => d.stories.map((s) => s.views))), avgPerDay: avg(g.map((d) => d.views)) };
  }).filter((r) => r.days > 0);
  const bestPerDay = [...perDay].filter((r) => r.days >= MIN_POSTS && r.avgPerDay != null).sort((a, b) => (b.avgPerDay as number) - (a.avgPerDay as number))[0] || null;
  return {
    avgViews: avg(withV.map((s) => s.views)), stories: withV.length, hours: [...hours].sort((a, b) => (b.avgViews ?? -1) - (a.avgViews ?? -1)), bestHour, perDay, bestPerDay,
    why: `Views de cada story na última leitura guardada (antes de expirar). Melhor horário: média de views por hora de publicação (São Paulo), só horas com ${MIN_POSTS}+ stories. Stories por dia: dias agrupados pela quantidade; vence o grupo com ${MIN_POSTS}+ dias e mais views por dia.`,
  };
}

// cruzamento com o link rastreável do canal "stories" (ig_links): cliques, conversas e vendas por dia de story
export interface StoryLinkDay { day: string; stories: number; views: number; clicks: number; conversations: number; sales: number; revenue: number }
export function storyLinkByDay(days: StoryDay[], clicks: { created_at: string }[], convs: { firstAt: number; sales: number; revenue: number }[]): StoryLinkDay[] {
  const out = new Map<string, StoryLinkDay>();
  const row = (d: string) => { if (!out.has(d)) out.set(d, { day: d, stories: 0, views: 0, clicks: 0, conversations: 0, sales: 0, revenue: 0 }); return out.get(d) as StoryLinkDay; };
  days.forEach((d) => { const r = row(d.day); r.stories = d.stories.length; r.views = d.views; });
  clicks.forEach((c) => { row(spParts(c.created_at).day).clicks++; });
  convs.forEach((c) => { const r = row(spParts(new Date(c.firstAt).toISOString()).day); r.conversations++; r.sales += c.sales; r.revenue = Math.round((r.revenue + c.revenue) * 100) / 100; });
  return [...out.values()].sort((a, b) => b.day.localeCompare(a.day));
}

// ── conta: séries do histórico (períodos maiores que 30 dias e seguidores ao longo do tempo) ──
export const historySince = (rows: Pick<IgDayAccount, 'day'>[]): string | null => (rows.length ? [...rows].map((r) => r.day).sort()[0] : null);
const sumN = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
// totais do período pela soma dos dias guardados (o ALCANCE somado conta a mesma pessoa em dias diferentes)
export function historyTotals(rows: IgDayAccount[], fromDay: string, toDay: string): IgTotals & { days: number } {
  const r = rows.filter((x) => x.day >= fromDay && x.day <= toDay);
  const follows = sumN(r.map((x) => x.gained));
  const unfollows = sumN(r.map((x) => x.lost));
  return {
    reach: sumN(r.map((x) => x.reach)), views: sumN(r.map((x) => x.views)), accounts_engaged: sumN(r.map((x) => x.accounts_engaged)), total_interactions: sumN(r.map((x) => x.total_interactions)),
    profile_views: sumN(r.map((x) => x.profile_views)), website_clicks: null, profile_links_taps: sumN(r.map((x) => x.profile_links_taps)),
    follows, unfollows, net_followers: follows == null ? null : follows - (unfollows || 0), days: r.length,
  };
}
// série por semana (segunda-feira) do histórico, no formato do gráfico
export function historyWeekly(rows: IgDayAccount[], fromDay: string, toDay: string): IgDailyRow[] {
  const m = new Map<string, IgDailyRow>();
  const add = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : a + b);
  rows.filter((x) => x.day >= fromDay && x.day <= toDay).forEach((x) => {
    const k = weekKey(x.day);
    const cur = m.get(k) || { day: k, reach: null, views: null, gained: null, lost: null };
    m.set(k, { day: k, reach: add(cur.reach, x.reach), views: add(cur.views, x.views), gained: add(cur.gained, x.gained), lost: add(cur.lost, x.lost) });
  });
  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
}
// seguidores ao longo do tempo: a foto do dia quando existe; nos dias sem foto, refeito a partir do dia seguinte
// (seguidores do dia seguinte − ganhos + perdas do dia seguinte). real = foto do dia; senão estimado.
export function followersSeries(rows: IgDayAccount[]): { day: string; followers: number | null; real: boolean }[] {
  const s = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const out = s.map((r) => ({ day: r.day, followers: r.followers, real: r.followers != null }));
  for (let i = out.length - 2; i >= 0; i--) {
    if (out[i].followers != null) continue;
    const next = out[i + 1];
    const nr = s[i + 1];
    if (next.followers != null && nr.gained != null) out[i].followers = next.followers - (nr.gained || 0) + (nr.lost || 0);
  }
  return out;
}
