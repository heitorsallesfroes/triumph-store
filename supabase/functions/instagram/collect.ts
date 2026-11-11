// Edge Function "instagram" — HISTÓRICO PRÓPRIO (SÓ LEITURA na Meta: só GET; nada é publicado ou enviado).
// Os insights de STORY somem 24 h depois e a Meta só devolve totais da conta em blocos de 30 dias; aqui a função
// guarda o que lê para montar séries históricas no ERP. Chamada pela rotina do banco (pg_cron, cabeçalho x-cron-key
// = a chave guardada em ig_collect_keys) ou por um usuário logado no ERP.
//   collect_stories (a cada 1 h): stories ativos + insights → ig_stories (cada leitura atualiza a linha; a que fica é a
//                                 ÚLTIMA antes de o story expirar; métrica que falhar não apaga o valor de antes)
//   collect_daily   (1x por dia): o dia de ontem da conta (seguidores, alcance, views, contas engajadas, interações,
//                                 visitas ao perfil, toques no link da bio, ganhos/perdidos) → ig_daily_account, e
//                                 completa os dias que faltarem dos últimos 30; posts/reels dos últimos 30 dias →
//                                 ig_daily_media (uma foto por post por dia)
// Métrica recusada pela Meta: pulada e registrada como aviso (ig_collect_log); o resto continua.
import { ACCOUNT_METRICS, DEFAULT_IG_USER_ID, GraphError, Warnings, breakdownOf, clean, insights, makeGet, mediaList, num, valueOf, type Deps } from './ig.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const DAY = 86400000;
const SP_OFFSET = 3 * 3600000;
export const spDay = (ms: number) => new Date(ms - SP_OFFSET).toISOString().slice(0, 10);
const startOfSpDay = (day: string) => Date.parse(`${day}T00:00:00-03:00`);
export const STORY_METRICS = ['views', 'reach', 'replies', 'shares', 'total_interactions', 'follows', 'profile_visits', 'navigation'];
export const BACKFILL_DAYS = 30;

export interface StoryRow {
  id: string; media_type: string | null; thumb: string | null; permalink: string | null; posted_at: string; expires_at: string; last_read_at: string;
  views?: number; reach?: number; replies?: number; shares?: number; total_interactions?: number; follows?: number; profile_visits?: number;
  navigation?: number; taps_forward?: number; taps_back?: number; exits?: number; swipe_forward?: number;
}
export interface DailyAccountRow { day: string; followers: number | null; reach: number | null; views: number | null; accounts_engaged: number | null; total_interactions: number | null; profile_views: number | null; profile_links_taps: number | null; gained: number | null; lost: number | null; collected_at: string }
export interface DailyMediaRow { day: string; media_id: string; kind: string; posted_at: string | null; caption: string | null; thumb: string | null; permalink: string | null; views: number | null; reach: number | null; likes: number | null; comments: number | null; saved: number | null; shares: number | null; total_interactions: number | null; collected_at: string }
export interface HistStore {
  cronKey(): Promise<string | null>;
  upsertStories(rows: StoryRow[]): Promise<void>;
  upsertDailyAccount(rows: DailyAccountRow[]): Promise<void>;
  upsertDailyMedia(rows: DailyMediaRow[]): Promise<void>;
  accountDays(fromDay: string, toDay: string): Promise<string[]>;
  log(row: { kind: 'stories' | 'diario'; ok: boolean; message: string; warnings: string[] }): Promise<void>;
}
export interface CollectDeps extends Deps { store: HistStore }

// ── stories ativos (a cada 1 h) ──
export async function collectStories(get: Any, ig: string, now: number, store: HistStore) {
  const warn = new Warnings(); const skip = new Set<string>();
  const r = await get(`${ig}/stories`, { fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp', limit: 100 });
  const list: Any[] = r && Array.isArray(r.data) ? r.data : [];
  const rows: StoryRow[] = [];
  for (const s of list) {
    const t = Date.parse(s.timestamp || '');
    if (!s.id || !Number.isFinite(t)) continue;
    const ins = await insights(get, `${s.id}/insights`, STORY_METRICS.filter((m) => m !== 'navigation'), {}, warn, 'Stories', skip);
    const nav = await insights(get, `${s.id}/insights`, ['navigation'], { breakdown: 'story_navigation_action_type' }, warn, 'Stories', skip);
    const row: StoryRow = {
      id: String(s.id), media_type: s.media_type || null, thumb: s.media_type === 'VIDEO' ? s.thumbnail_url || null : s.media_url || s.thumbnail_url || null,
      permalink: s.permalink || null, posted_at: new Date(t).toISOString(), expires_at: new Date(t + DAY).toISOString(), last_read_at: new Date(now).toISOString(),
    };
    // só as métricas que vieram (uma que falhar agora não apaga a leitura anterior)
    for (const m of STORY_METRICS) { if (m === 'navigation') continue; const v = valueOf(ins[m]); if (v != null) (row as Any)[m] = v; }
    if (nav.navigation) {
      const b = breakdownOf(nav.navigation);
      const pickB = (k: string) => { const x = b.find((y) => y.keys[0] === k); return x ? x.value : undefined; };
      const total = valueOf(nav.navigation);
      if (total != null) row.navigation = total;
      const map: [keyof StoryRow, string][] = [['taps_forward', 'TAP_FORWARD'], ['taps_back', 'TAP_BACK'], ['exits', 'TAP_EXIT'], ['swipe_forward', 'SWIPE_FORWARD']];
      map.forEach(([col, key]) => { const v = pickB(key); if (v != null) (row as Any)[col] = v; });
    }
    rows.push(row);
  }
  if (rows.length) await store.upsertStories(rows);
  return { stories: rows.length, warnings: warn.list() };
}

// ── um dia da conta (totais do dia, horário de São Paulo) ──
async function accountDay(get: Any, ig: string, day: string, warn: Warnings, skip: Set<string>) {
  const since = Math.floor(startOfSpDay(day) / 1000);
  const base = { metric_type: 'total_value', period: 'day', since, until: since + 86400 };
  const [m, f] = await Promise.all([
    insights(get, `${ig}/insights`, ACCOUNT_METRICS, base, warn, 'Conta', skip),
    insights(get, `${ig}/insights`, ['follows_and_unfollows'], { ...base, breakdown: 'follow_type' }, warn, 'Conta', skip),
  ]);
  const b = breakdownOf(f.follows_and_unfollows);
  return {
    reach: valueOf(m.reach), views: valueOf(m.views), accounts_engaged: valueOf(m.accounts_engaged), total_interactions: valueOf(m.total_interactions),
    profile_views: valueOf(m.profile_views), profile_links_taps: valueOf(m.profile_links_taps) ?? valueOf(m.website_clicks),
    gained: f.follows_and_unfollows ? b.filter((x) => x.keys[0] === 'FOLLOWER').reduce((s, x) => s + x.value, 0) : null,
    lost: f.follows_and_unfollows ? b.filter((x) => x.keys[0] === 'NON_FOLLOWER').reduce((s, x) => s + x.value, 0) : null,
  };
}

// ── foto do dia (1x por dia, de madrugada): ontem + os dias que faltam dos últimos 30 + posts dos últimos 30 dias ──
export async function collectDaily(get: Any, ig: string, now: number, store: HistStore) {
  const warn = new Warnings(); const skip = new Set<string>();
  const today = spDay(now);
  const yesterday = spDay(startOfSpDay(today) - 1);
  const first = spDay(startOfSpDay(today) - BACKFILL_DAYS * DAY);
  const have = new Set(await store.accountDays(first, yesterday));
  const days: string[] = [];
  for (let t = startOfSpDay(first); t < startOfSpDay(today); t += DAY) { const d = spDay(t + 3600000); if (d === yesterday || !have.has(d)) days.push(d); }
  const p = await get(ig, { fields: 'followers_count' });
  const followers = num(p && p.followers_count);
  const at = new Date(now).toISOString();
  const rows: DailyAccountRow[] = [];
  for (const d of days) {
    const v = await accountDay(get, ig, d, warn, skip);
    // seguidores: o número de agora vale para o fim de ontem; os dias completados depois ficam sem (o ERP refaz pela
    // soma de ganhos/perdidos)
    rows.push({ day: d, followers: d === yesterday ? followers : null, ...v, collected_at: at });
  }
  if (rows.length) await store.upsertDailyAccount(rows);
  const media = await mediaList(get, ig, 30, now);
  media.warnings.forEach((w: string) => warn.note(w));
  const mrows: DailyMediaRow[] = media.items.map((m: Any) => ({
    day: yesterday, media_id: m.id, kind: m.kind, posted_at: m.timestamp ? new Date(Date.parse(m.timestamp)).toISOString() : null, caption: m.caption ? String(m.caption).slice(0, 300) : null,
    thumb: m.thumb, permalink: m.permalink, views: m.metrics.views, reach: m.metrics.reach, likes: m.metrics.likes, comments: m.metrics.comments, saved: m.metrics.saved,
    shares: m.metrics.shares, total_interactions: m.metrics.total_interactions, collected_at: at,
  }));
  if (mrows.length) await store.upsertDailyMedia(mrows);
  return { days: rows.length, media: mrows.length, day: yesterday, warnings: warn.list() };
}

// ── entrada (index.ts manda para cá as ações collect_*) ──
export async function handleCollect(authorization: string | null, cronHeader: string | null, body: Any, deps: CollectDeps): Promise<{ status: number; json: Record<string, unknown> }> {
  const action = body && typeof body.action === 'string' ? body.action : '';
  if (action !== 'collect_stories' && action !== 'collect_daily') return { status: 400, json: { success: false, error: 'action inválida' } };
  let allowed = false;
  const key = await deps.store.cronKey().catch(() => null);
  if (key && cronHeader && cronHeader === key) allowed = true;
  if (!allowed) {
    const jwt = (authorization || '').replace(/^Bearer\s+/i, '').trim();
    allowed = !!(jwt && await deps.getUser(jwt).catch(() => null));
  }
  if (!allowed) return { status: 401, json: { success: false, error: 'Login do ERP ou chave da rotina obrigatórios' } };
  if (!deps.token) return { status: 500, json: { success: false, error: 'Falta o secret IG_ACCESS_TOKEN na Edge Function' } };
  const ig = String(deps.igUserId || DEFAULT_IG_USER_ID);
  const { get, calls } = makeGet(deps);
  const kind = action === 'collect_stories' ? 'stories' : 'diario';
  try {
    const out = action === 'collect_stories' ? await collectStories(get, ig, deps.now(), deps.store) : await collectDaily(get, ig, deps.now(), deps.store);
    const msg = action === 'collect_stories' ? `${(out as Any).stories} stories lidos` : `${(out as Any).days} dia(s) da conta e ${(out as Any).media} posts guardados`;
    await deps.store.log({ kind, ok: true, message: msg, warnings: out.warnings }).catch(() => {});
    return { status: 200, json: { success: true, ...out, graph_calls: calls() } };
  } catch (e) {
    const m = clean(e instanceof Error ? e.message : e);
    await deps.store.log({ kind, ok: false, message: m, warnings: [] }).catch(() => {});
    return { status: e instanceof GraphError ? 502 : 500, json: { success: false, error: m } };
  }
}
