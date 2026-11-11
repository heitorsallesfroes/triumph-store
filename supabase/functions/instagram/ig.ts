// Edge Function "instagram" — FASE 1: SÓ LEITURA (só GET na Graph API do Instagram; nada é publicado, respondido
// ou alterado). Só para usuário LOGADO no ERP (o JWT do Authorization é conferido no Supabase Auth; a chave anon
// sozinha é recusada). Secrets: IG_ACCESS_TOKEN (obrigatório) e IG_USER_ID (opcional; padrão @store_triumph).
// O token nunca volta para o navegador (as mensagens de erro saem sem ele).
//
// Actions (POST { action, ... }):
//   "account" part "top"      perfil + totais do período e do período anterior (days = 7 | 14 | 30 | 90)
//   "account" part "daily"    série por dia (até 30 dias) ou por semana (90 dias): seguidores ganhos/perdidos,
//                             alcance e visualizações
//   "account" part "audience" cidades, faixa etária e gênero dos seguidores (se a Meta devolver)
//   "media"                   posts/reels/carrosséis publicados no período, com os insights de cada um
//   "media_detail" { id }     um conteúdo (só se for da conta), com todas as métricas e os itens do carrossel
// Métrica que a Meta não aceitar mais (ex.: "impressions", trocada por "views" em 2025) é pulada e volta em
// "warnings"; o resto continua. A lógica fica aqui (testável no Node com a Graph SIMULADA); index.ts só liga o Deno.

export const GRAPH_API_VERSION = 'v25.0';
export const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
export const DEFAULT_IG_USER_ID = '17841442995645189';
export const PERIODS = [7, 14, 30, 90];
const DAY = 86400000;
const SP_OFFSET = 3 * 3600000; // São Paulo, UTC−3 (sem horário de verão)
const MAX_RANGE_DAYS = 30; // a Meta não aceita since/until com mais de 30 dias nos insights da conta
const MAX_MEDIA = 150;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export interface Deps {
  token: string | null | undefined;
  igUserId?: string | null;
  getUser: (jwt: string) => Promise<{ id: string } | null>;
  fetch: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<Any> }>;
  now: () => number;
}
export interface Out { status: number; json: Record<string, unknown> }

// ── períodos (dias de São Paulo) ──
export interface Win { since: number; until: number; fromDay: string; toDay: string } // since/until em segundos
const spDay = (ms: number) => new Date(ms - SP_OFFSET).toISOString().slice(0, 10);
const startOfSpDay = (day: string) => Date.parse(`${day}T00:00:00-03:00`);
export function windowsOf(days: number, now: number): { cur: Win; prev: Win } {
  const today = startOfSpDay(spDay(now));
  const curStart = today - (days - 1) * DAY;
  const prevStart = curStart - days * DAY;
  const mk = (a: number, b: number): Win => ({ since: Math.floor(a / 1000), until: Math.floor(b / 1000), fromDay: spDay(a), toDay: spDay(b - 1) });
  return { cur: mk(curStart, now), prev: mk(prevStart, curStart) };
}
// pedaços de no máximo 30 dias (a Meta recusa intervalos maiores)
export function chunksOf(w: Win, maxDays = MAX_RANGE_DAYS): Win[] {
  const out: Win[] = [];
  for (let a = w.since * 1000; a < w.until * 1000; a += maxDays * DAY) {
    const b = Math.min(a + maxDays * DAY, w.until * 1000);
    out.push({ since: Math.floor(a / 1000), until: Math.floor(b / 1000), fromDay: spDay(a), toDay: spDay(b - 1) });
  }
  return out;
}
// baldes do gráfico: por dia até 30 dias; por semana (7 dias) acima disso
export function bucketsOf(w: Win): { size: 'day' | 'week'; list: Win[] } {
  const days = Math.round((w.until - w.since) / 86400);
  const size = days > 31 ? 'week' : 'day';
  return { size, list: chunksOf(w, size === 'week' ? 7 : 1) };
}

// ── Graph API: só GET, erro sem token ──
export class GraphError extends Error {
  code: number; fatal: boolean;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
    // token inválido/expirado, sem permissão geral, limite de chamadas: para tudo (não adianta pular a métrica)
    this.fatal = [190, 102, 4, 17, 32, 613, 80001, 80002].includes(code);
  }
}
const clean = (s: unknown) => String(s ?? '').replace(/access_token=[^&\s"]+/gi, 'access_token=***').slice(0, 300);

function makeGet(deps: Deps) {
  let calls = 0;
  const get = async (path: string, params: Record<string, string | number | undefined> = {}): Promise<Any> => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)); });
    q.set('access_token', String(deps.token));
    calls++;
    let body: Any = null; let status = 0;
    try {
      const r = await deps.fetch(`${GRAPH}/${path}?${q.toString()}`);
      status = r.status;
      body = await r.json().catch(() => null);
    } catch {
      throw new GraphError('Não consegui falar com o Instagram', -1);
    }
    if (!body || body.error) {
      const e = body && body.error ? body.error : {};
      throw new GraphError(clean(e.error_user_msg || e.message || `Erro ${status}`), Number(e.code) || status || -1);
    }
    return body;
  };
  return { get, calls: () => calls };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const run = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}

// Avisos: um por métrica (não um por post)
class Warnings {
  private map = new Map<string, string>();
  add(metric: string, where: string, msg: string) { const k = `${where}|${metric}`; if (!this.map.has(k)) this.map.set(k, `${where}: métrica "${metric}" não aceita pela Meta e foi pulada (${msg})`); }
  note(msg: string) { this.map.set(msg, msg); }
  list() { return [...this.map.values()]; }
}

const num = (v: unknown): number | null => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };

// valor de um item de insights (total_value ou values[]), e o detalhamento (breakdowns) se houver
function valueOf(item: Any): number | null {
  if (!item) return null;
  if (item.total_value && item.total_value.value !== undefined) return num(item.total_value.value);
  if (Array.isArray(item.values)) { let s = 0; let any = false; item.values.forEach((v: Any) => { const n = num(v && v.value); if (n != null) { s += n; any = true; } }); return any ? s : null; }
  return null;
}
function breakdownOf(item: Any): { keys: string[]; value: number }[] {
  const b = item && item.total_value && Array.isArray(item.total_value.breakdowns) ? item.total_value.breakdowns[0] : null;
  return b && Array.isArray(b.results) ? b.results.map((r: Any) => ({ keys: (r.dimension_values || []).map(String), value: num(r.value) || 0 })) : [];
}

// Pede várias métricas numa chamada; se a Meta recusar, tenta uma por uma e pula as recusadas (com aviso).
// "skip" guarda as métricas já recusadas nesta execução (não pergunta de novo em cada dia/post).
async function insights(get: (p: string, q: Record<string, string | number | undefined>) => Promise<Any>, path: string, metrics: string[], params: Record<string, string | number | undefined>,
  warn: Warnings, where: string, skip: Set<string>): Promise<Record<string, Any>> {
  const list = metrics.filter((m) => !skip.has(`${where}|${m}`));
  const out: Record<string, Any> = {};
  if (!list.length) return out;
  const take = (body: Any) => { (body && Array.isArray(body.data) ? body.data : []).forEach((it: Any) => { if (it && it.name) out[it.name] = it; }); };
  try {
    take(await get(path, { ...params, metric: list.join(',') }));
    return out;
  } catch (e) {
    if (e instanceof GraphError && e.fatal) throw e;
    if (list.length === 1) { skip.add(`${where}|${list[0]}`); warn.add(list[0], where, (e as Error).message); return out; }
  }
  for (const m of list) {
    try { take(await get(path, { ...params, metric: m })); } catch (e) {
      if (e instanceof GraphError && e.fatal) throw e;
      skip.add(`${where}|${m}`); warn.add(m, where, (e as Error).message);
    }
  }
  return out;
}

// ── conta ──
const ACCOUNT_METRICS = ['reach', 'views', 'accounts_engaged', 'total_interactions', 'profile_views', 'website_clicks', 'profile_links_taps'];
export interface Totals { reach: number | null; views: number | null; accounts_engaged: number | null; total_interactions: number | null; profile_views: number | null; website_clicks: number | null; profile_links_taps: number | null; follows: number | null; unfollows: number | null; net_followers: number | null }

const addN = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : a + b);
async function totalsOf(get: Any, ig: string, w: Win, warn: Warnings, skip: Set<string>): Promise<Totals> {
  const t: Totals = { reach: null, views: null, accounts_engaged: null, total_interactions: null, profile_views: null, website_clicks: null, profile_links_taps: null, follows: null, unfollows: null, net_followers: null };
  for (const c of chunksOf(w)) {
    const base = { metric_type: 'total_value', period: 'day', since: c.since, until: c.until };
    const [m, f] = await Promise.all([
      insights(get, `${ig}/insights`, ACCOUNT_METRICS, base, warn, 'Conta', skip),
      insights(get, `${ig}/insights`, ['follows_and_unfollows'], { ...base, breakdown: 'follow_type' }, warn, 'Conta', skip),
    ]);
    for (const k of ACCOUNT_METRICS) (t as Any)[k] = addN((t as Any)[k], valueOf(m[k]));
    if (f.follows_and_unfollows) {
      const b = breakdownOf(f.follows_and_unfollows);
      const fol = b.filter((x) => x.keys[0] === 'FOLLOWER').reduce((s, x) => s + x.value, 0);
      const unf = b.filter((x) => x.keys[0] === 'NON_FOLLOWER').reduce((s, x) => s + x.value, 0);
      t.follows = addN(t.follows, b.length ? fol : valueOf(f.follows_and_unfollows));
      t.unfollows = addN(t.unfollows, b.length ? unf : null);
    }
  }
  t.net_followers = t.follows == null ? null : t.follows - (t.unfollows || 0);
  return t;
}

async function accountTop(get: Any, ig: string, days: number, now: number) {
  const warn = new Warnings(); const skip = new Set<string>();
  const w = windowsOf(days, now);
  const [p, cur, prev] = await Promise.all([
    get(ig, { fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website' }),
    totalsOf(get, ig, w.cur, warn, skip),
    totalsOf(get, ig, w.prev, warn, skip),
  ]);
  if (days > MAX_RANGE_DAYS) warn.note(`Em ${days} dias, alcance e contas com engajamento são a soma de janelas de 30 dias (a Meta não junta pessoas repetidas entre elas).`);
  return {
    profile: { id: String(p.id || ig), username: p.username || '', name: p.name || '', picture: p.profile_picture_url || null, followers: num(p.followers_count), follows: num(p.follows_count), media_count: num(p.media_count), biography: p.biography || '', website: p.website || '' },
    period: { days, cur: w.cur, prev: w.prev }, cur, prev, warnings: warn.list(),
  };
}

async function accountDaily(get: Any, ig: string, days: number, now: number) {
  const warn = new Warnings(); const skip = new Set<string>();
  const w = windowsOf(days, now).cur;
  const b = bucketsOf(w);
  const rows = await pool(b.list, 6, async (c) => {
    const base = { metric_type: 'total_value', period: 'day', since: c.since, until: c.until };
    const [m, f] = await Promise.all([
      insights(get, `${ig}/insights`, ['reach', 'views'], base, warn, 'Gráfico', skip),
      insights(get, `${ig}/insights`, ['follows_and_unfollows'], { ...base, breakdown: 'follow_type' }, warn, 'Gráfico', skip),
    ]);
    const br = breakdownOf(f.follows_and_unfollows);
    return {
      day: c.fromDay, reach: valueOf(m.reach), views: valueOf(m.views),
      gained: f.follows_and_unfollows ? br.filter((x) => x.keys[0] === 'FOLLOWER').reduce((s, x) => s + x.value, 0) : null,
      lost: f.follows_and_unfollows ? br.filter((x) => x.keys[0] === 'NON_FOLLOWER').reduce((s, x) => s + x.value, 0) : null,
    };
  });
  return { size: b.size, rows, warnings: warn.list() };
}

async function accountAudience(get: Any, ig: string) {
  const warn = new Warnings();
  const out: Record<string, { key: string; value: number }[]> = { city: [], age: [], gender: [] };
  for (const bd of ['city', 'age', 'gender']) {
    const tries: Record<string, string>[] = [{ timeframe: 'this_month' }, {}];
    let last = '';
    for (const extra of tries) {
      try {
        const r = await get(`${ig}/insights`, { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown: bd, ...extra });
        const item = (r && r.data || [])[0];
        out[bd] = breakdownOf(item).map((x) => ({ key: x.keys[0] || '', value: x.value })).sort((a, z) => z.value - a.value);
        last = '';
        break;
      } catch (e) {
        if (e instanceof GraphError && e.fatal) throw e;
        last = (e as Error).message;
      }
    }
    if (last) warn.note(`Público (${bd}): a Meta não devolveu os dados (${last})`);
  }
  return { audience: out, warnings: warn.list() };
}

// ── conteúdos ──
const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_type,media_url,thumbnail_url}';
const FEED_METRICS = ['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'follows', 'profile_visits'];
const REEL_METRICS = ['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'follows', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'];
export type MediaKind = 'REEL' | 'CAROUSEL' | 'IMAGE' | 'VIDEO';
export const kindOf = (m: Any): MediaKind => (m.media_product_type === 'REELS' ? 'REEL' : m.media_type === 'CAROUSEL_ALBUM' ? 'CAROUSEL' : m.media_type === 'VIDEO' ? 'VIDEO' : 'IMAGE');
const thumbOf = (m: Any): string | null => {
  if (m.media_type === 'VIDEO') return m.thumbnail_url || null;
  if (m.media_type === 'CAROUSEL_ALBUM') {
    const first = m.children && Array.isArray(m.children.data) ? m.children.data[0] : null;
    return m.media_url || (first ? (first.media_type === 'VIDEO' ? first.thumbnail_url : first.media_url) : null) || m.thumbnail_url || null;
  }
  return m.media_url || m.thumbnail_url || null;
};

async function mediaWithInsights(get: Any, m: Any, warn: Warnings, skip: Set<string>) {
  const kind = kindOf(m);
  const where = kind === 'REEL' || kind === 'VIDEO' ? 'Reels' : kind === 'CAROUSEL' ? 'Carrosséis' : 'Fotos';
  const ins = await insights(get, `${m.id}/insights`, kind === 'REEL' || kind === 'VIDEO' ? REEL_METRICS : FEED_METRICS, {}, warn, where, skip);
  const v = (k: string) => valueOf(ins[k]);
  return {
    id: String(m.id), kind, caption: m.caption || '', permalink: m.permalink || null, timestamp: m.timestamp || null, thumb: thumbOf(m),
    children: m.children && Array.isArray(m.children.data) ? m.children.data.map((c: Any) => ({ kind: c.media_type, thumb: c.media_type === 'VIDEO' ? c.thumbnail_url || null : c.media_url || null })) : [],
    metrics: {
      reach: v('reach'), views: v('views'), likes: v('likes') ?? num(m.like_count), comments: v('comments') ?? num(m.comments_count), saved: v('saved'), shares: v('shares'),
      total_interactions: v('total_interactions'), follows: v('follows'), profile_visits: v('profile_visits'),
      avg_watch_ms: v('ig_reels_avg_watch_time'), total_watch_ms: v('ig_reels_video_view_total_time'),
    },
  };
}

async function mediaList(get: Any, ig: string, days: number, now: number) {
  const warn = new Warnings(); const skip = new Set<string>();
  const w = windowsOf(days, now).cur;
  const list: Any[] = [];
  let after: string | undefined;
  let truncated = false;
  for (let page = 0; page < 10; page++) {
    const r = await get(`${ig}/media`, { fields: MEDIA_FIELDS, limit: 50, after });
    const data: Any[] = r && Array.isArray(r.data) ? r.data : [];
    let older = false;
    for (const m of data) {
      const t = Date.parse(m.timestamp || '');
      if (!Number.isFinite(t)) continue;
      if (t < w.since * 1000) { older = true; break; }
      if (t <= w.until * 1000) list.push(m);
    }
    if (list.length >= MAX_MEDIA) { truncated = true; list.length = MAX_MEDIA; break; }
    after = r && r.paging && r.paging.cursors && r.paging.next ? r.paging.cursors.after : undefined;
    if (older || !after) break;
  }
  if (truncated) warn.note(`Mostrando os ${MAX_MEDIA} conteúdos mais recentes do período.`);
  const items = await pool(list, 6, (m) => mediaWithInsights(get, m, warn, skip));
  return { since: w.since, until: w.until, items, truncated, warnings: warn.list() };
}

async function mediaDetail(get: Any, ig: string, id: string) {
  const warn = new Warnings();
  const m = await get(id, { fields: `${MEDIA_FIELDS},owner` });
  if (m.owner && m.owner.id && String(m.owner.id) !== String(ig)) throw new GraphError('Este conteúdo não é da conta do Instagram da loja', 400);
  const item = await mediaWithInsights(get, m, warn, new Set());
  return { item, warnings: warn.list() };
}

// ── entrada ──
export async function handle(authorization: string | null, body: Any, deps: Deps): Promise<Out> {
  const jwt = (authorization || '').replace(/^Bearer\s+/i, '').trim();
  const user = jwt ? await deps.getUser(jwt).catch(() => null) : null;
  if (!user) return { status: 401, json: { success: false, error: 'Entre com sua conta do sistema (login obrigatório)' } };
  if (!deps.token) return { status: 500, json: { success: false, error: 'Falta o secret IG_ACCESS_TOKEN na Edge Function' } };
  const ig = String(deps.igUserId || DEFAULT_IG_USER_ID);
  if (!/^\d{5,25}$/.test(ig)) return { status: 500, json: { success: false, error: 'IG_USER_ID inválido' } };
  const action = body && typeof body.action === 'string' ? body.action : '';
  const days = Number(body && body.days) || 30;
  if (!PERIODS.includes(days) && action !== 'media_detail') return { status: 400, json: { success: false, error: 'Período inválido (use 7, 14, 30 ou 90 dias)' } };
  const { get, calls } = makeGet(deps);
  const now = deps.now();
  try {
    let data: Record<string, unknown>;
    if (action === 'account') {
      const part = body.part || 'top';
      if (part === 'top') data = await accountTop(get, ig, days, now);
      else if (part === 'daily') data = await accountDaily(get, ig, days, now);
      else if (part === 'audience') data = await accountAudience(get, ig);
      else return { status: 400, json: { success: false, error: 'part inválida (top, daily ou audience)' } };
    } else if (action === 'media') {
      data = await mediaList(get, ig, days, now);
    } else if (action === 'media_detail') {
      const id = String(body.id || '');
      if (!/^\d{5,25}$/.test(id)) return { status: 400, json: { success: false, error: 'id inválido' } };
      data = await mediaDetail(get, ig, id);
    } else {
      return { status: 400, json: { success: false, error: 'action inválida (account, media ou media_detail)' } };
    }
    return { status: 200, json: { success: true, ...data, graph_calls: calls(), at: now } };
  } catch (e) {
    return { status: 502, json: { success: false, error: clean(e instanceof Error ? e.message : e) } };
  }
}
