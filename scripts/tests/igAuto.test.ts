// Instagram FASE 3 — testes do servidor com a Meta SIMULADA (nunca chama a Meta de verdade) e o banco em memória.
//   node scripts/tests/igAuto.test.ts
// webhook (verificação, assinatura válida/inválida, 200 sempre), eco, duplicados (mid e comment_id), antispam
// concorrente, janelas de 24 h e 7 dias, chave geral desligada não envia, modo teste só para a lista, fallback do
// botão para texto, renovação do token, Conectar (OAuth) e o Direct (resposta e "Mandar o WhatsApp").
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handleHook, processBody } from '../../supabase/functions/ig-webhook/hook.ts';
import { handleManage, redirectUriOf } from '../../supabase/functions/ig-manage/manage.ts';
import { parseWebhook } from '../../supabase/functions/_shared/igEngine.ts';
import { maybeRefresh } from '../../supabase/functions/_shared/igToken.ts';
import { fillName, keywordHit, linkOf, matches, parseSettings, validateAutomation, waUrl, type Automation } from '../../supabase/functions/_shared/igRules.ts';
import { metaError, validSignature } from '../../supabase/functions/_shared/igApi.ts';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const tests: [string, () => Promise<void> | void][] = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);

const SECRET = 'app-secret-de-teste';
const ME = '17841442995645189';
const ANA = '6600000000000001';
const BIA = '6600000000000002';
const TOKEN = 'IGAA-token-secreto-123';
const H = 3600 * 1000;
const DAY = 24 * H;
const T0 = Date.parse('2026-11-12T15:00:00.000Z');

// ── banco em memória (o mesmo contrato do igStore.ts) ──
function memStore(seed: Partial<Record<string, Any>> = {}) {
  const db: Any = { config: { ig_automations_enabled: 'true', ig_test_mode: 'false', ig_test_accounts: '[]', ig_dm_cooldown_hours: '24', ig_direct_dm: 'Olá, {nome}! Nosso WhatsApp:', ig_direct_phrase: 'Olá! Vim pelo Direct do Instagram 😊' },
    autos: [], links: [], messages: new Map(), comments: new Map(), convs: new Map(), runs: new Map(), quota: new Map(), logs: [], account: null, states: new Map(), kv: new Map([['cron_key', 'k123']]), now: T0, ...seed };
  let n = 0;
  const store: Any = {
    db,
    async settings() { return parseSettings(Object.entries(db.config).map(([key, value]) => ({ key, value: String(value) }))); },
    async automations() { return db.autos.filter((a: Automation) => a.active); },
    async linkOf(id: string) { const l = db.links.find((x: Any) => x.id === id); return l ? { slug: l.slug, code: l.code } : null; },
    async saveMessage(row: Any) { if (db.messages.has(row.mid)) return false; db.messages.set(row.mid, { ...row }); return true; },
    async saveComment(row: Any) { if (db.comments.has(row.comment_id)) return false; db.comments.set(row.comment_id, { ...row }); return true; },
    async hadMessagesBefore(igsid: string, mid: string) { return [...db.messages.values()].some((m: Any) => m.igsid === igsid && !m.from_me && m.mid !== mid); },
    async touchConversation(igsid: string, p: Any) {
      const cur = db.convs.get(igsid);
      if (!cur) { const c = { igsid, username: p.username || null, name: null, profile_at: null, origin: p.origin, first_at: p.at, last_at: p.at, last_text: p.text, last_from: p.from, last_customer_at: p.customer ? p.at : null }; db.convs.set(igsid, c); return { ...c }; }
      if (p.at >= cur.last_at) Object.assign(cur, { last_at: p.at, last_text: p.text, last_from: p.from });
      if (p.customer && (!cur.last_customer_at || p.at > cur.last_customer_at)) cur.last_customer_at = p.at;
      if (p.username && !cur.username) cur.username = p.username;
      return { ...cur };
    },
    async setProfile(igsid: string, p: Any) { const c = db.convs.get(igsid); if (c) Object.assign(c, { profile_at: new Date(db.now).toISOString() }, Object.fromEntries(Object.entries(p).filter(([, v]) => v))); },
    async claimRun(row: Any) { if ([...db.runs.values()].some((r: Any) => r.source_id === row.source_id)) return null; const id = `run${++n}`; db.runs.set(id, { id, status: 'processando', ...row }); return id; },
    async finishRun(id: string, patch: Any) { Object.assign(db.runs.get(id), patch); },
    // trava atômica: o mesmo efeito do "insert ... on conflict do update ... where" (sem await entre ler e gravar)
    async claimDm(igsid: string, hours: number) {
      await new Promise((r) => setTimeout(r, 1)); // as duas chamadas chegam "juntas"
      const last = db.quota.get(igsid);
      if (last != null && last > db.now - hours * H) return null;
      db.quota.set(igsid, db.now);
      return new Date(db.now).toISOString();
    },
    async releaseDm(igsid: string, at: string) { if (db.quota.get(igsid) === Date.parse(at)) db.quota.delete(igsid); },
    async markWaSent(igsid: string, at: string, code: string) { const c = db.convs.get(igsid); if (c) Object.assign(c, { wa_sent_at: at, wa_code: code }); },
    async log(level: string, message: string) { db.logs.push({ level, message }); },
    async account() { return db.account ? { ...db.account } : null; },
    async saveAccount(row: Any) { db.account = { ...row }; },
    async patchAccount(p: Any) { Object.assign(db.account, p); },
    async conversation(igsid: string) { const c = db.convs.get(igsid); return c ? { ...c } : null; },
    async newState(s: string) { db.states.set(s, db.now); },
    async useState(s: string, max: number, now: number) { const t = db.states.get(s); db.states.delete(s); return t != null && now - t <= max; },
    async kv(k: string) { return db.kv.get(k) || null; },
  };
  return store;
}

// ── a Meta SIMULADA ──
function fakeMeta(opts: { rejectButton?: boolean; rejectAll?: boolean; refreshFails?: boolean } = {}) {
  const calls: Any[] = [];
  let mid = 0;
  const res = (status: number, body: Any) => ({ ok: status < 300, status, json: async () => body });
  const fetch = async (url: string, init: Any = {}) => {
    const body = init.body ? (/^\{/.test(init.body) ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body))) : null;
    calls.push({ url, method: init.method || 'GET', body, auth: init.headers && init.headers.Authorization });
    if (url.startsWith('https://api.instagram.com/oauth/access_token')) return body.code === 'bom' ? res(200, { data: [{ access_token: 'curto-123', user_id: ME, permissions: 'instagram_business_basic,instagram_business_manage_messages' }] }) : res(400, { error_message: 'code inválido' });
    if (url.startsWith('https://graph.instagram.com/access_token')) return res(200, { access_token: TOKEN, token_type: 'bearer', expires_in: 5184000 });
    if (url.startsWith('https://graph.instagram.com/refresh_access_token')) return opts.refreshFails ? res(400, { error: { message: `token ${TOKEN} inválido` } }) : res(200, { access_token: 'IGAA-renovado-456', expires_in: 5184000 });
    if (/\/me\?fields=user_id/.test(url)) return res(200, { user_id: ME, username: 'store_triumph', name: 'Triumph Store', profile_picture_url: 'https://x/p.jpg', id: '999' });
    if (/\/me\/subscribed_apps/.test(url)) return res(200, { success: true });
    if (/\/me\/media/.test(url)) return res(200, { data: [{ id: '1801', caption: 'Promo', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://x/t.jpg', permalink: 'https://instagram.com/p/1', timestamp: '2026-11-10T10:00:00+0000' }] });
    if (/\/replies$/.test(url)) return opts.rejectAll ? res(400, { error: { message: 'bloqueado', code: 10 } }) : res(200, { id: `rep${++mid}` });
    if (/\/me\/messages$/.test(url)) {
      if (opts.rejectAll) return res(400, { error: { message: 'Fora da janela permitida', code: 10 } });
      if (body.message.attachment && opts.rejectButton) return res(400, { error: { message: 'Template não suportado', code: 100 } });
      return res(200, { recipient_id: ANA, message_id: `m_out_${++mid}` });
    }
    if (/graph\.instagram\.com\/v25\.0\/\d+\?fields=name/.test(url)) return res(200, { name: 'Ana Souza', username: 'ana.souza', profile_pic: 'https://x/ana.jpg' });
    return res(404, { error: { message: `não simulado: ${url}` } });
  };
  return { fetch, calls, sends: () => calls.filter((c) => /\/me\/messages$/.test(c.url)), replies: () => calls.filter((c) => /\/replies$/.test(c.url)) };
}

const auto = (over: Partial<Automation> = {}): Automation => ({
  id: 'a1', name: 'Comentários → WhatsApp', active: true, trigger: 'comentario', media_scope: 'todos', media_ids: [], keyword_mode: 'qualquer', keywords: [],
  public_replies: ['Te enviei no direct 🔥', 'Dá uma olhada no direct 👀'], dm_texts: ['Olá, {nome}! Vem pro WhatsApp'], button_title: 'WhatsApp Loja',
  link_mode: 'frase', wa_phrase: 'Olá! Vi o comentário no Instagram 🔥', link_id: null, code: 'IG-A-COMENT', position: 0, ...over,
});
const commentBody = (id: string, from = ANA, text = 'quero', time = T0 / 1000, media = '1801') => ({ object: 'instagram', entry: [{ id: ME, time, changes: [{ field: 'comments', value: { id, text, from: { id: from, username: from === ANA ? 'ana.souza' : 'bia' }, media: { id: media, media_product_type: 'REELS' } } }] }] });
const dmBody = (mid: string, from = ANA, text = 'oi', ts = T0, extra: Any = {}) => ({ object: 'instagram', entry: [{ id: ME, time: ts, messaging: [{ sender: { id: from }, recipient: { id: ME }, timestamp: ts, message: { mid, text, ...extra } }] }] });
const echoBody = (mid: string, to = ANA) => ({ object: 'instagram', entry: [{ id: ME, time: T0, messaging: [{ sender: { id: ME }, recipient: { id: to }, timestamp: T0, message: { mid, text: 'resposta minha', is_echo: true, app_id: '123' } }] }] });
const sign = (raw: string, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const hdr = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
const connected = () => ({ ig_user_id: ME, username: 'store_triumph', name: 'Triumph', picture_url: null, access_token: TOKEN, token_expires_at: new Date(T0 + 50 * DAY).toISOString(), refreshed_at: null, refresh_tried_at: null, refresh_error: null, scopes: null, connected_at: new Date(T0 - DAY).toISOString() });
function setup({ autos = [auto()], config = {}, meta = {} }: { autos?: Automation[]; config?: Record<string, string>; meta?: Any } = {}) {
  const store = memStore({ autos, account: connected() });
  Object.assign(store.db.config, config);
  const m = fakeMeta(meta);
  const deps = { fetch: m.fetch, now: () => store.db.now, rnd: () => 0 };
  return { store, m, go: (body: Any) => processBody(body, store, deps) };
}

// ── webhook: verificação e assinatura ──
test('GET: verificação da Meta (verify_token certo devolve o challenge; errado 403; sem o segredo 403)', async () => {
  const deps: Any = { verifyToken: 'meu-token', appSecret: SECRET, store: () => memStore(), fetch: async () => null, now: () => T0, rnd: Math.random, background: () => {} };
  const ok = await handleHook('GET', 'https://x/functions/v1/ig-webhook?hub.mode=subscribe&hub.verify_token=meu-token&hub.challenge=4242', hdr({}), new Uint8Array(), deps);
  assert.deepEqual([ok.status, ok.body], [200, '4242']);
  assert.equal((await handleHook('GET', 'https://x/?hub.mode=subscribe&hub.verify_token=outro&hub.challenge=1', hdr({}), new Uint8Array(), deps)).status, 403);
  assert.equal((await handleHook('GET', 'https://x/?hub.mode=subscribe&hub.verify_token=meu-token&hub.challenge=1', hdr({}), new Uint8Array(), { ...deps, verifyToken: '' })).status, 403);
});
test('POST: assinatura inválida → 401 e nada é gravado; válida → 200 na hora e grava em segundo plano', async () => {
  const store = memStore({ account: connected() });
  const bg: Promise<unknown>[] = [];
  const m = fakeMeta();
  const deps: Any = { verifyToken: 'v', appSecret: SECRET, store: () => store, fetch: m.fetch, now: () => T0, rnd: () => 0, background: (p: Promise<unknown>) => bg.push(p) };
  const raw = JSON.stringify(dmBody('mid.1'));
  const bytes = new TextEncoder().encode(raw);
  for (const sig of [null, 'sha256=00', sign(raw, 'outro-segredo'), sign(raw + ' ')]) {
    const r = await handleHook('POST', 'https://x/', hdr(sig ? { 'x-hub-signature-256': sig } : {}), bytes, deps);
    assert.equal(r.status, 401, String(sig));
  }
  assert.equal(bg.length, 0);
  assert.equal(store.db.messages.size, 0);
  const r = await handleHook('POST', 'https://x/', hdr({ 'x-hub-signature-256': sign(raw) }), bytes, deps);
  assert.deepEqual([r.status, r.body], [200, 'EVENT_RECEIVED']);
  await Promise.all(bg);
  assert.equal(store.db.messages.size, 1);
  // corpo estranho com assinatura válida: 200 (a Meta não pode ficar reenviando) + aviso no log
  const junk = new TextEncoder().encode('não é json');
  const r2 = await handleHook('POST', 'https://x/', hdr({ 'x-hub-signature-256': sign('não é json') }), junk, deps);
  await Promise.all(bg);
  assert.equal(r2.status, 200);
  assert.ok(store.db.logs.some((l: Any) => /não é JSON/.test(l.message)));
  // erro interno (banco caiu) com assinatura válida: ainda 200, e o erro vai para o log
  const broken = memStore({ account: connected() });
  broken.saveMessage = async () => { throw new Error('banco fora do ar'); };
  const bg2: Promise<unknown>[] = [];
  const r3 = await handleHook('POST', 'https://x/', hdr({ 'x-hub-signature-256': sign(raw) }), bytes, { ...deps, store: () => broken, background: (p: Promise<unknown>) => bg2.push(p) });
  await Promise.all(bg2);
  assert.equal(r3.status, 200);
  assert.ok(broken.db.logs.some((l: Any) => /banco fora do ar/.test(l.message)), JSON.stringify(broken.db.logs));
  assert.equal(await validSignature(SECRET, bytes, sign(raw).toUpperCase().replace('SHA256=', 'sha256=')), true, 'hex maiúsculo vale');
});
test('parse: DM, eco, resposta e menção a story, postback, comentário e comentário de live', () => {
  const evs = parseWebhook({ object: 'instagram', entry: [{ id: ME, time: T0, messaging: [
    { sender: { id: ANA }, recipient: { id: ME }, timestamp: T0, message: { mid: 'm1', text: 'oi' } },
    { sender: { id: ME }, recipient: { id: ANA }, timestamp: T0, message: { mid: 'm2', text: 'eco', is_echo: true } },
    { sender: { id: ANA }, recipient: { id: ME }, timestamp: T0, message: { mid: 'm3', text: 'lindo!', reply_to: { story: { id: '1', url: 'x' } } } },
    { sender: { id: BIA }, recipient: { id: ME }, timestamp: T0, message: { mid: 'm4', attachments: [{ type: 'story_mention', payload: { url: 'x' } }] } },
    { sender: { id: ANA }, recipient: { id: ME }, timestamp: T0, postback: { mid: 'm5', title: 'Quero', payload: 'X' } },
    { sender: { id: ANA }, recipient: { id: ME }, timestamp: T0, read: { mid: 'm1' } },
  ], changes: [{ field: 'comments', value: { id: 'c1', text: 'eu', from: { id: ANA, username: 'ana' }, media: { id: '1801' } } }, { field: 'live_comments', value: { id: 'c2', text: 'live', from: { id: BIA, username: 'bia' }, media: { id: '1900' } } }] }] });
  assert.deepEqual(evs.map((e: Any) => [e.type, e.mid || e.id, e.igsid, e.fromMe, e.kind || (e.live ? 'live' : 'post')]), [
    ['message', 'm1', ANA, false, 'dm'], ['message', 'm2', ANA, true, 'dm'], ['message', 'm3', ANA, false, 'story_reply'], ['message', 'm4', BIA, false, 'story_mention'], ['message', 'm5', ANA, false, 'postback'],
    ['comment', 'c1', ANA, false, 'post'], ['comment', 'c2', BIA, false, 'live'],
  ]);
});

// ── automações ──
test('comentário: resposta pública sorteada + DM privada (Private Reply ao comentário) com botão do WhatsApp e a frase', async () => {
  const { store, m, go } = setup();
  const r = await go(commentBody('c100'));
  assert.equal(r[0].status, 'enviado', JSON.stringify(r));
  assert.equal(m.replies().length, 1);
  assert.equal(m.replies()[0].body.message, 'Te enviei no direct 🔥');
  const s = m.sends()[0];
  assert.deepEqual(s.body.recipient, { comment_id: 'c100' });
  const b = s.body.message.attachment.payload;
  assert.equal(b.template_type, 'button');
  assert.equal(b.text, 'Olá, Ana! Vem pro WhatsApp', 'o nome veio da chamada de perfil');
  assert.deepEqual(b.buttons, [{ type: 'web_url', url: waUrl('Olá! Vi o comentário no Instagram 🔥'), title: 'WhatsApp Loja' }]);
  assert.equal(s.auth, `Bearer ${TOKEN}`, 'token só no cabeçalho, no servidor');
  const conv = store.db.convs.get(ANA);
  assert.deepEqual([conv.origin, conv.username, conv.name, conv.wa_code], ['comentario', 'ana.souza', 'Ana Souza', 'IG-A-COMENT']);
  const run = [...store.db.runs.values()][0];
  assert.deepEqual([run.status, run.public_reply, run.dm_sent, run.dm_fallback, run.source_id], ['enviado', true, true, false, 'c100']);
  assert.ok([...store.db.messages.values()].some((x: Any) => x.from_me && x.automation_id === 'a1'), 'a DM fica no histórico do Direct');
});
test('duplicados: o mesmo comment_id e o mesmo mid chegando de novo não gravam nem disparam de novo', async () => {
  const { store, m, go } = setup({ autos: [auto(), auto({ id: 'a2', trigger: 'dm_nova', public_replies: [], position: 1, code: 'IG-A-DM' })] });
  await go(commentBody('c200'));
  const again = await go(commentBody('c200'));
  assert.equal(again[0].status, 'duplicado');
  await go(dmBody('mid.200', BIA));
  const dup = await go(dmBody('mid.200', BIA));
  assert.equal(dup[0].status, 'duplicado');
  assert.equal(m.replies().length, 1);
  assert.equal(m.sends().length, 2, 'uma DM para o comentário e uma para a DM nova');
  assert.equal(store.db.runs.size, 2);
});
test('eco (is_echo) e mensagens/comentários da própria conta: gravados como "de mim" e NUNCA disparam', async () => {
  const { store, m, go } = setup({ autos: [auto({ trigger: 'dm_palavra', keyword_mode: 'palavras', keywords: ['resposta'], public_replies: [] }), auto({ id: 'a2', position: 1 })] });
  const r = await go(echoBody('mid.echo'));
  assert.equal(r[0].status, 'gravado');
  assert.equal(store.db.messages.get('mid.echo').from_me, true);
  const c = await go(commentBody('c300', ME, 'resposta minha'));
  assert.equal(c[0].status, 'gravado');
  assert.equal(store.db.comments.get('c300').from_me, true);
  assert.equal(m.sends().length + m.replies().length, 0);
  assert.equal(store.db.runs.size, 0);
});
test('antispam concorrente: dois eventos da mesma pessoa no mesmo segundo → só 1 DM (todas as automações somadas)', async () => {
  const { store, m, go } = setup({ autos: [auto({ public_replies: [] })] });
  const [a, b] = await Promise.all([go(commentBody('c400')), go(commentBody('c401'))]);
  const st = [a[0].status, b[0].status].sort();
  assert.deepEqual(st, ['enviado', 'pulado'], JSON.stringify([a, b]));
  assert.equal(m.sends().length, 1);
  assert.ok([...store.db.runs.values()].some((r: Any) => /antispam/.test(r.reason || '')));
  // outra automação (DM) da mesma pessoa dentro das 24 h: também barrada; depois de 24 h passa
  store.db.autos.push(auto({ id: 'a3', trigger: 'dm_nova', public_replies: [], position: 2, code: 'IG-A-DM' }));
  const d = await go(dmBody('mid.400'));
  assert.equal(d[0].status, 'pulado');
  store.db.now = T0 + 25 * H;
  const e = await go(commentBody('c402', ANA, 'quero', store.db.now / 1000));
  assert.equal(e[0].status, 'enviado');
  assert.equal(m.sends().length, 2);
});
test('janelas: comentário com mais de 7 dias não recebe DM (a resposta pública sai); DM fora das 24 h não recebe', async () => {
  const { store, m, go } = setup({ autos: [auto(), auto({ id: 'a2', trigger: 'dm_palavra', keyword_mode: 'palavras', keywords: ['preço'], public_replies: [], position: 1, code: 'IG-A-PRECO' })] });
  store.db.now = T0 + 8 * DAY;
  const r = await go(commentBody('c500'));
  assert.equal(r[0].status, 'parcial');
  assert.ok(/7 dias/.test(r[0].reason || ''));
  assert.equal(m.sends().length, 0);
  assert.equal(m.replies().length, 1);
  const d = await go(dmBody('mid.500', BIA, 'qual o preco?', T0)); // mensagem velha entregue agora
  assert.ok(/24 h/.test(d[0].reason || ''), JSON.stringify(d));
  assert.equal(m.sends().length, 0);
  store.db.now = T0 + 6 * DAY + 23 * H; // dentro dos 7 dias: sai
  const ok = await go(commentBody('c501'));
  assert.equal(ok[0].status, 'enviado');
});
test('chave geral DESLIGADA: grava tudo e NÃO manda nada (nem resposta pública)', async () => {
  const { store, m, go } = setup({ config: { ig_automations_enabled: 'false' } });
  const r = await go(commentBody('c600'));
  await go(dmBody('mid.600'));
  assert.equal(r[0].status, 'desligado');
  assert.equal(m.sends().length + m.replies().length, 0);
  assert.equal(store.db.comments.size, 1);
  assert.equal(store.db.messages.size, 1);
  assert.equal(store.db.runs.size, 0);
  // sem a chave no banco: desligado também
  assert.equal(parseSettings([]).enabled, false);
  assert.equal(parseSettings([]).testMode, true);
});
test('modo teste: só as contas da lista recebem (pelo IGSID ou pelo @); as outras ficam "pulado: modo teste"', async () => {
  const { store, m, go } = setup({ config: { ig_test_mode: 'true', ig_test_accounts: JSON.stringify([{ username: '@Bia' }, { igsid: '6600000000000003' }]) } });
  const a = await go(commentBody('c700', ANA));
  const b = await go(commentBody('c701', BIA));
  assert.equal(a[0].status, 'pulado');
  assert.equal(b[0].status, 'enviado');
  assert.equal(m.sends().length, 1);
  assert.deepEqual(m.sends()[0].body.recipient, { comment_id: 'c701' });
  const run = [...store.db.runs.values()].find((r: Any) => r.source_id === 'c700');
  assert.deepEqual([run.status, run.test, run.reason], ['pulado', true, 'modo teste: fora da lista de teste']);
});
test('fallback: a Meta recusou o botão → DM em texto com o link (e marca "fallback")', async () => {
  const { store, m, go } = setup({ meta: { rejectButton: true } });
  const r = await go(commentBody('c800'));
  assert.equal(r[0].status, 'enviado');
  const s = m.sends();
  assert.equal(s.length, 2);
  assert.ok(s[0].body.message.attachment);
  assert.equal(s[1].body.message.text, `Olá, Ana! Vem pro WhatsApp\n\n${waUrl('Olá! Vi o comentário no Instagram 🔥')}`);
  assert.equal([...store.db.runs.values()][0].dm_fallback, true);
});
test('a Meta recusou tudo → "falhou", a vez do antispam volta (próximo evento pode mandar) e o token não aparece no erro', async () => {
  const { store, m, go } = setup({ meta: { rejectAll: true } });
  const r = await go(commentBody('c900'));
  assert.equal(r[0].status, 'falhou');
  assert.equal(store.db.quota.has(ANA), false, 'antispam liberado');
  assert.ok(!JSON.stringify([...store.db.runs.values()]).includes(TOKEN));
  assert.equal(metaError({ error: { message: `token ${TOKEN} ruim access_token=abc` } }, 400, TOKEN), 'token *** ruim access_token=***');
  assert.ok(m.sends().length >= 1);
});
test('gatilhos: posts escolhidos, palavras-chave (sem acento/maiúscula), DM nova só na 1ª mensagem, story', async () => {
  assert.equal(keywordHit('Quero o PREÇO!!', ['preco']), true);
  assert.equal(keywordHit('aprecio', ['preco']), false, 'palavra inteira');
  assert.equal(keywordHit('manda o valor do relógio', ['valor do relogio']), true);
  const chosen = auto({ media_scope: 'escolhidos', media_ids: ['1801'] });
  assert.equal(matches(chosen, { kind: 'comentario', text: 'x', mediaId: '1801' }), true);
  assert.equal(matches(chosen, { kind: 'comentario', text: 'x', mediaId: '9999' }), false);
  const kw = auto({ keyword_mode: 'palavras', keywords: ['eu quero'] });
  assert.equal(matches(kw, { kind: 'comentario', text: 'EU QUERO!', mediaId: '1' }), true);
  assert.equal(matches(kw, { kind: 'comentario', text: 'quero', mediaId: '1' }), false);
  const { store, m, go } = setup({ autos: [auto({ id: 'n', trigger: 'dm_nova', public_replies: [], code: 'IG-A-NOVA' }), auto({ id: 's', trigger: 'story', public_replies: [], position: 1, code: 'IG-A-STORY' })] });
  await go(dmBody('mid.a', ANA, 'oi'));
  store.db.quota.clear();
  const second = await go(dmBody('mid.b', ANA, 'oi de novo'));
  assert.equal(second[0].status, 'sem automação', 'a 2ª mensagem não é "DM nova"');
  const st = await go(dmBody('mid.c', BIA, 'que lindo', T0, { reply_to: { story: { id: '1', url: 'x' } } }));
  assert.equal(st[0].automation, 's');
  assert.equal(m.sends().length, 2);
  assert.deepEqual(m.sends()[1].body.recipient, { id: BIA }, 'DM normal vai pelo IGSID');
});
test('link rastreável /l/... quando escolhido; {nome} some sem nome; validação do formulário', () => {
  assert.deepEqual(linkOf(auto({ link_mode: 'link', link_id: 'L' }), { slug: 'manychat-comentarios', code: 'IG-COMENT' }), { url: 'https://triumph-store.vercel.app/l/manychat-comentarios', code: 'IG-COMENT' });
  assert.equal(linkOf(auto(), null).url, waUrl('Olá! Vi o comentário no Instagram 🔥'));
  assert.equal(fillName('Olá, {nome}! Tudo bem?', null), 'Olá! Tudo bem?');
  assert.equal(fillName('Oi {nome}, tudo?', 'MARIA silva'), 'Oi Maria, tudo?');
  assert.equal(fillName('Oi {nome}', 'ana.souza_99'), 'Oi');
  assert.deepEqual(validateAutomation(auto()), []);
  assert.ok(validateAutomation(auto({ trigger: 'dm_nova' })).some((e) => /só existe para comentários/.test(e)));
  assert.ok(validateAutomation(auto({ code: 'IG-DIRECT' })).some((e) => /código/.test(e)));
  assert.ok(validateAutomation(auto({ keyword_mode: 'palavras', keywords: [' '] })).some((e) => /palavra-chave/.test(e)));
});

// ── token ──
test('renovação: só com menos de 20 dias, no máximo a cada 12 h; falhou → grava o erro (sem o token) e mantém o antigo', async () => {
  const store = memStore({ account: { ...connected(), token_expires_at: new Date(T0 + 30 * DAY).toISOString() } });
  const m = fakeMeta();
  assert.equal((await maybeRefresh(store, m.fetch, T0)).skipped, 'ainda falta muito');
  store.db.account.token_expires_at = new Date(T0 + 19 * DAY).toISOString();
  const r = await maybeRefresh(store, m.fetch, T0);
  assert.equal(r.refreshed, true);
  assert.equal(store.db.account.access_token, 'IGAA-renovado-456');
  assert.equal(store.db.account.token_expires_at, new Date(T0 + 60 * DAY).toISOString());
  const bad = memStore({ account: { ...connected(), token_expires_at: new Date(T0 + 5 * DAY).toISOString() } });
  const mf = fakeMeta({ refreshFails: true });
  const f = await maybeRefresh(bad, mf.fetch, T0);
  assert.equal(f.refreshed, false);
  assert.equal(bad.db.account.access_token, TOKEN);
  assert.ok(bad.db.account.refresh_error && !bad.db.account.refresh_error.includes(TOKEN), bad.db.account.refresh_error);
  assert.equal((await maybeRefresh(bad, mf.fetch, T0 + H)).skipped, 'tentou há pouco');
});

// ── ig-manage ──
function manageDeps(store: Any, m: Any, extra: Any = {}) {
  return { appId: '1234567890', appSecret: SECRET, verifyToken: 'v', supabaseUrl: 'https://proj.supabase.co', erpUrl: 'https://triumph-store.vercel.app', store, fetch: m.fetch, now: () => store.db.now, getUser: async (j: string) => (j === 'jwt-ok' ? { id: 'u1' } : null), randomHex: () => 'ab'.repeat(16), ...extra };
}
const POST = (store: Any, m: Any, body: Any, jwt = 'jwt-ok', extra: Any = {}, h: Record<string, string> = {}) => handleManage('POST', 'https://proj.supabase.co/functions/v1/ig-manage', hdr({ authorization: `Bearer ${jwt}`, ...h }), body, manageDeps(store, m, extra));
test('ig-manage: sem login → 401; status sem segredos mostra o que falta; nada do token na resposta', async () => {
  const store = memStore();
  const m = fakeMeta();
  assert.equal((await POST(store, m, { action: 'status' }, 'jwt-ruim')).status, 401);
  const s = await POST(store, m, { action: 'status' }, 'jwt-ok', { appId: '', appSecret: '', verifyToken: '' });
  assert.deepEqual([s.json!.connected, s.json!.secrets], [false, { IG_APP_ID: false, IG_APP_SECRET: false, IG_WEBHOOK_VERIFY_TOKEN: false }]);
  assert.equal(s.json!.redirect_uri, 'https://proj.supabase.co/functions/v1/ig-manage/oauth');
  assert.equal(s.json!.webhook_url, 'https://proj.supabase.co/functions/v1/ig-webhook');
  const c = await POST(store, m, { action: 'connect_url' }, 'jwt-ok', { appId: '' });
  assert.equal(c.status, 400);
  store.db.account = { ...connected(), token_expires_at: new Date(T0 + 5 * DAY).toISOString() };
  const s2 = await POST(store, m, { action: 'status' });
  assert.ok(!JSON.stringify(s2.json).includes('IGAA'), 'token nunca volta para o navegador');
  assert.equal(s2.json!.connected, true);
});
test('Conectar: connect_url (escopos certos + state) → volta com code → token de longa duração guardado e webhook assinado', async () => {
  const store = memStore();
  const m = fakeMeta();
  const c = await POST(store, m, { action: 'connect_url' });
  const url = new URL(String(c.json!.url));
  assert.equal(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize');
  assert.equal(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments');
  assert.equal(url.searchParams.get('redirect_uri'), redirectUriOf('https://proj.supabase.co'));
  const state = url.searchParams.get('state')!;
  const back = await handleManage('GET', `https://proj.supabase.co/functions/v1/ig-manage/oauth?code=bom&state=${state}`, hdr({}), null, manageDeps(store, m));
  assert.equal(back.status, 302);
  assert.equal(back.redirect, 'https://triumph-store.vercel.app/?pagina=instagram&aba=automacoes&ig=conectado');
  assert.deepEqual([store.db.account.ig_user_id, store.db.account.username, store.db.account.access_token], [ME, 'store_triumph', TOKEN]);
  assert.equal(store.db.account.token_expires_at, new Date(T0 + 5184000 * 1000).toISOString());
  assert.ok(m.calls.some((x: Any) => /subscribed_fields=messages,messaging_postbacks,comments,live_comments/.test(x.url)));
  const reuse = await handleManage('GET', `https://proj.supabase.co/functions/v1/ig-manage/oauth?code=bom&state=${state}`, hdr({}), null, manageDeps(store, m));
  assert.ok(/ig=erro/.test(reuse.redirect!), 'o state só vale uma vez');
  const status = await POST(store, m, { action: 'status' });
  assert.equal((status.json!.account as Any).username, 'store_triumph');
  assert.equal(status.json!.days_left, 60);
});
test('rotina diária (cron_refresh): só com a chave x-cron-key certa', async () => {
  const store = memStore({ account: { ...connected(), token_expires_at: new Date(T0 + 10 * DAY).toISOString() } });
  const m = fakeMeta();
  assert.equal((await POST(store, m, { action: 'cron_refresh' }, '', {}, { 'x-cron-key': 'errada' })).status, 401);
  const r = await POST(store, m, { action: 'cron_refresh' }, '', {}, { 'x-cron-key': 'k123' });
  assert.equal((r.json!.refresh as Any).refreshed, true);
});
test('Direct: responder e "Mandar o WhatsApp" só dentro das 24 h; marca o envio do link (IG-DIRECT)', async () => {
  const { store, go } = setup({ config: { ig_automations_enabled: 'false' } });
  await go(dmBody('mid.d1', ANA, 'oi, quero saber do relógio'));
  const m = fakeMeta();
  const rep = await POST(store, m, { action: 'reply', igsid: ANA, text: 'Oi Ana! Claro 😊' });
  assert.equal(rep.status, 200, JSON.stringify(rep.json));
  assert.deepEqual(m.sends()[0].body, { recipient: { id: ANA }, message: { text: 'Oi Ana! Claro 😊' } });
  const wa = await POST(store, m, { action: 'send_whatsapp', igsid: ANA });
  assert.equal(wa.status, 200);
  const btn = m.sends()[1].body.message.attachment.payload;
  assert.equal(btn.text, 'Olá, Ana! Nosso WhatsApp:');
  assert.equal(btn.buttons[0].url, waUrl('Olá! Vim pelo Direct do Instagram 😊'));
  assert.equal(store.db.convs.get(ANA).wa_code, 'IG-DIRECT');
  store.db.now = T0 + 25 * H;
  const late = await POST(store, m, { action: 'reply', igsid: ANA, text: 'oi' });
  assert.equal(late.status, 409);
  assert.ok(/24 h/.test(String(late.json!.error)));
  const media = await POST(store, m, { action: 'media' });
  assert.deepEqual((media.json!.items as Any[])[0], { id: '1801', caption: 'Promo', type: 'reel', thumb: 'https://x/t.jpg', permalink: 'https://instagram.com/p/1', timestamp: '2026-11-10T10:00:00+0000' });
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${String((e as Error).stack || e).split('\n').slice(0, 6).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
