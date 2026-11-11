// Testes da 2.17.0 (Radar: conversas sem etiqueta CRM e sem automação há mais de 2 h). node extension/tests/radar.test.cjs
// - regra (engine.js radarPick): individual, 7 dias, última mensagem há mais de N h, sem etiqueta CRM (menos as que
//   contam como "sem destino"), sem percurso ativo, fora "Meu Numero Pessoal", etiquetas do WhatsApp que tiram do
//   radar, "Não precisa" (até mensagem nova) e "Lembrar em 1 h"; banco ilegível = ninguém
// - ponte radarChats (WA-JS falsa): sem grupo, arquivada, a minha própria e as de mais de 7 dias; só da memória
// - supabase-api (PostgREST falso): radarState só LÊ (contato por chat_id / telefone do @c.us / telefone do @lid;
//   etiquetas; régua ativa e inscrição sem saída, só de automação ligada); config e silenciados em system_config
// - content.js: popup, contador no ícone, Mais → Radar, a cada 5 min no horário geral
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const ectx = vm.createContext({ console, setTimeout, clearTimeout, Intl, Date, Math });
vm.runInContext(src('engine.js'), ectx, { filename: 'engine.js' });
const E = ectx.TspEngine;

const NOW = Date.parse('2026-11-11T15:00:00-03:00');
const S = Math.floor(NOW / 1000);
const H = 3600;
const FU = '11111111-1111-4111-8111-111111111111'; // Follow Up (CRM)
const NOVO = '22222222-2222-4222-8222-222222222222'; // "Novo" (conta como sem destino)
const chat = (n, o = {}) => ({ id: `55219000000${String(n).padStart(2, '0')}@c.us`, t: S - 3 * H, fromMe: false, preview: { kind: 'texto', text: 'oi' }, phone: `55219000000${String(n).padStart(2, '0')}`, name: `Cliente ${n}`, labels: [], ...o });

test('regra: só parada há mais de 2 h, nos 7 dias, sem etiqueta CRM e sem percurso ativo', () => {
  const chats = [
    chat(1), // entra
    chat(2, { t: S - 1 * H }), // parada há 1 h
    chat(3, { t: S - 8 * 86400 }), // fora dos 7 dias
    chat(4), // tem etiqueta CRM
    chat(5), // percurso ativo
    chat(6, { name: 'Meu Número Pessoal' }), // minha conversa de teste
    chat(7, { labels: ['9'] }), // etiqueta do WhatsApp (ex.: "Cliente") é destino (2.17.1)
    chat(8), // só etiqueta "Novo" (conta como sem destino) → entra
    chat(9, { id: '123@g.us' }), // grupo
    chat(10, { t: S - 26 * H, fromMe: true }), // entra (minha mensagem por último)
  ];
  const db = { [chat(4).id]: { crmLabelIds: [FU], active: false }, [chat(5).id]: { crmLabelIds: [], active: true }, [chat(8).id]: { crmLabelIds: [NOVO], active: false } };
  const out = plain(E.radarPick({ chats, db, config: { on: true, hours: 2, crmAsNone: [NOVO], waAsNone: [] }, snooze: {}, nowMs: NOW }));
  assert.deepStrictEqual(out.map((c) => c.name), ['Cliente 1', 'Cliente 8', 'Cliente 10']);
  assert.strictEqual(out[0].idleS, 3 * H);
  // sem "Novo" como sem destino, o 8 sai; tempo de 4 h: o 1 e o 8 (3 h) saem
  assert.deepStrictEqual(plain(E.radarPick({ chats, db, config: { on: true, hours: 2, crmAsNone: [], waAsNone: [] }, snooze: {}, nowMs: NOW })).map((c) => c.name), ['Cliente 1', 'Cliente 10']);
  assert.deepStrictEqual(plain(E.radarPick({ chats, db, config: { on: true, hours: 4, crmAsNone: [NOVO], waAsNone: [] }, snooze: {}, nowMs: NOW })).map((c) => c.name), ['Cliente 10']);
  // 2.17.1: etiqueta do WhatsApp marcada como "não conta" → o 7 entra de novo
  assert.deepStrictEqual(plain(E.radarPick({ chats, db, config: { on: true, hours: 2, crmAsNone: [NOVO], waAsNone: ['9'] }, snooze: {}, nowMs: NOW })).map((c) => c.name), ['Cliente 1', 'Cliente 7', 'Cliente 8', 'Cliente 10']);
  // 2.17.1: só daqui pra frente — ligado há 2,5 h: só entram as com a última mensagem depois disso (nenhuma das de 3 h/26 h)
  assert.deepStrictEqual(plain(E.radarPick({ chats, db, config: { on: true, since: new Date(NOW - 2.5 * H * 1000).toISOString(), hours: 2, crmAsNone: [NOVO], waAsNone: [] }, snooze: {}, nowMs: NOW })).map((c) => c.name), []);
  assert.deepStrictEqual(plain(E.radarPick({ chats, db, config: { on: true, since: new Date(NOW - 4 * H * 1000).toISOString(), hours: 2, crmAsNone: [NOVO], waAsNone: [] }, snooze: {}, nowMs: NOW })).map((c) => c.name), ['Cliente 1', 'Cliente 8']);
  // desligado / banco ilegível: ninguém
  assert.strictEqual(E.radarPick({ chats, db, config: { on: false }, snooze: {}, nowMs: NOW }).length, 0);
  assert.strictEqual(E.radarPick({ chats, db: null, config: { on: true, hours: 2 }, snooze: {}, nowMs: NOW }).length, 0);
});

test('"Não precisa" silencia até chegar mensagem nova; "Lembrar em 1 h" volta depois da hora', () => {
  const c = chat(1);
  const cfg = { on: true, hours: 2, crmAsNone: [], waAsNone: [] };
  const pick = (snooze, chats = [c], nowMs = NOW) => plain(E.radarPick({ chats, db: {}, config: cfg, snooze, nowMs })).length;
  assert.strictEqual(pick({ [c.id]: { mode: 'none', lastT: c.t } }), 0);
  assert.strictEqual(pick({ [c.id]: { mode: 'none', lastT: c.t } }, [{ ...c, t: c.t + 60 }]), 1, 'mensagem nova: volta');
  const until = new Date(NOW + 30 * 60000).toISOString();
  assert.strictEqual(pick({ [c.id]: { mode: 'remind', until } }), 0);
  assert.strictEqual(pick({ [c.id]: { mode: 'remind', until } }, [c], NOW + 31 * 60000), 1, 'passou a hora: volta');
  assert.strictEqual(E.radarAgo(3 * H + 20 * 60), 'há 3 h 20 min');
  assert.strictEqual(E.radarAgo(26 * H), 'há 1 dia 2 h');
  assert.strictEqual(E.radarAgo(45 * 60), 'há 45 min');
});

// ── ponte com WA-JS falsa ──
function bridge() {
  let queried = 0;
  const ME = '5521987654321';
  const msg = (fromMe, t, body) => ({ id: { fromMe, _serialized: `${fromMe}_x_${t}` }, t, type: 'chat', body });
  const mk = (id, { msgs, ...o } = {}) => ({ id: { _serialized: id }, t: S - 3 * H, labels: [], formattedTitle: null, contact: null, ...o, msgs: { getModelsArray: () => msgs || [msg(false, S - 3 * H, 'Quanto custa o Raptor?')] } });
  const chats = [
    mk('5521900000001@c.us', { formattedTitle: 'Ana Agenda', labels: ['3'] }),
    mk('80685306003593@lid', { msgs: [msg(true, S - 5 * H, 'Segue o link')], t: S - 5 * H }),
    mk('123@g.us', { isGroup: true }),
    mk('5521900000003@c.us', { archive: true }),
    mk(`${ME}@c.us`),
    mk('5521900000004@c.us', { t: S - 9 * 86400, msgs: [] }),
  ];
  const W = {
    WidFactory: { createWid: (id) => ({ _serialized: id, toString: () => id }) },
    lidPnCache: { getCurrentLid: () => null, getPhoneNumber: (w) => (w._serialized === '80685306003593@lid' ? { _serialized: '5521911112222@c.us' } : null) },
    ApiContact: { getCurrentLid: () => null },
    ContactStore: { get: (w) => ({ '5521911112222@c.us': { name: 'Bruno Agenda' } })[typeof w === 'string' ? w : w && w._serialized] || null },
  };
  const wpp = {
    isReady: true, isFullReady: true, webpack: { isReady: true, isFullReady: true }, whatsapp: W, on: () => {},
    conn: { getMyUserId: () => ({ user: ME, _serialized: `${ME}@c.us` }) },
    chat: { list: async () => chats, get: (id) => chats.find((c) => c.id._serialized === id) || null },
    labels: { getAllLabels: async () => [] },
    contact: { getPnLidEntry: async () => { queried++; return null; }, queryExists: async () => { queried++; return null; } },
  };
  let listener = null;
  const replies = [];
  const win = { console, setTimeout, clearTimeout, Intl, URL, Promise, Blob, WPP: wpp, location: { origin: 'x' }, addEventListener: (t, fn) => { if (t === 'message') listener = fn; }, postMessage: (m) => replies.push(m) };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(src('rich-parts.js'), ctx);
  vm.runInContext(src('wa-bridge.js'), ctx);
  const me = vm.runInContext('window', ctx);
  let n = 0;
  const request = (type, payload) => new Promise((resolve) => {
    const id = `t${++n}`;
    listener({ source: me, data: { source: 'tsp-wajs-content', id, type, payload } });
    const until = Date.now() + 5000;
    const wait = () => { const r = replies.find((x) => x.id === id); if (r) resolve(r); else if (Date.now() > until) resolve({ ok: false }); else setTimeout(wait, 5); };
    wait();
  });
  return { request, queried: () => queried };
}

test('ponte radarChats: individuais dos 7 dias, sem grupo/arquivada/minha; nome da agenda, telefone do @lid pela memória', async () => {
  const b = bridge();
  const r = await b.request('radarChats', { now: S });
  assert.ok(r.ok, JSON.stringify(r));
  const list = plain(r.data.chats);
  assert.deepStrictEqual(list.map((c) => c.id), ['5521900000001@c.us', '80685306003593@lid']);
  assert.deepStrictEqual([list[0].name, list[0].phone, list[0].fromMe, list[0].preview.text, list[0].labels], ['Ana Agenda', '5521900000001', false, 'Quanto custa o Raptor?', ['3']]);
  assert.deepStrictEqual([list[1].name, list[1].phone, list[1].fromMe], ['Bruno Agenda', '5521911112222', true]);
  assert.strictEqual(b.queried(), 0, 'nada de consulta ao servidor');
});

// ── PostgREST falso ──
function db(seed) {
  const T = { wa_contacts: [], wa_contact_labels: [], wa_automations: [], wa_automation_enrollments: [], wa_sequence_runs: [], system_config: [], ...seed };
  const filterOf = (k, v) => {
    if (v.startsWith('eq.')) { const x = v.slice(3); return (r) => String(r[k]) === x; }
    if (v.startsWith('in.(')) { const s = new Set(v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, ''))); return (r) => s.has(String(r[k])); }
    if (v === 'is.null') return (r) => r[k] == null;
    return () => true;
  };
  const writes = [];
  const handle = (method, url, body) => {
    const [table, qs] = url.split('?');
    const rows = T[table] || (T[table] = []);
    const params = (qs || '').split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; });
    const filters = []; let limit = Infinity; let conflict = null;
    params.forEach(([k, v]) => { if (k === 'select' || k === 'order' || k === 'offset') return; if (k === 'limit') limit = Number(v); else if (k === 'on_conflict') conflict = v.split(','); else filters.push(filterOf(k, v)); });
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (method === 'GET') return hit.slice(0, limit).map((r) => ({ ...r }));
    writes.push({ method, table });
    if (method === 'POST') {
      return (Array.isArray(body) ? body : [body]).map((b) => {
        const dup = conflict && rows.find((r) => conflict.every((c) => String(r[c]) === String(b[c])));
        if (dup) { Object.assign(dup, b); return { ...dup }; }
        rows.push({ ...b }); return { ...b };
      });
    }
    return [];
  };
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(String(url).replace('https://x.supabase.co/rest/v1/', ''));
    const out = handle(String(init.method || 'GET').toUpperCase(), p, init.body ? JSON.parse(init.body) : undefined);
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(out) };
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  const api = new Proxy(ctx.WaApi, { get: (t, k) => (typeof t[k] !== 'function' ? t[k] : (...a) => { const r = t[k](...a); return r && typeof r.then === 'function' ? r.then(plain) : plain(r); }) });
  return { api, T, writes };
}
const AUTO_ON = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTO_OFF = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('radarState: só lê; contato por chat_id, telefone do @c.us e do @lid; etiquetas; régua/inscrição só de automação ligada', async () => {
  const { api, writes } = db({
    wa_contacts: [
      { id: 'c1', name: 'Ana', phone: '5521900000001', chat_id: null, trigger_label_source: null },
      { id: 'c2', name: 'Bruno', phone: '5521911112222', chat_id: null },
      { id: 'c3', name: 'Caio', phone: null, chat_id: '5521900000003@c.us' },
      { id: 'c4', name: 'Duda', phone: '5521900000004', chat_id: null },
      { id: 'c5', name: 'Eva', phone: '5521900000005', chat_id: null },
    ],
    wa_contact_labels: [{ contact_id: 'c1', label_id: FU }],
    wa_automations: [{ id: AUTO_ON, active: true, trigger_label_source: 'crm', sequence: null }, { id: AUTO_OFF, active: false, trigger_label_source: 'crm', sequence: null }],
    wa_sequence_runs: [{ automation_id: AUTO_ON, chat_id: '5521900000003@c.us', contact_id: 'c3', status: 'ativo' }],
    wa_automation_enrollments: [{ automation_id: AUTO_ON, contact_id: 'c4', chat_id: null, removed_at: null }, { automation_id: AUTO_OFF, contact_id: 'c5', chat_id: null, removed_at: null }],
  });
  const r = await api.radarState({ chats: [
    { chatId: '5521900000001@c.us', phone: '5521900000001' }, { chatId: '80685306003593@lid', phone: '5521911112222' },
    { chatId: '5521900000003@c.us' }, { chatId: '5521900000004@c.us' }, { chatId: '5521900000005@c.us' }, { chatId: '5521900000006@c.us' }, { chatId: 'lixo' },
  ] });
  assert.deepStrictEqual(r['5521900000001@c.us'], { contactId: 'c1', crmLabelIds: [FU], active: false });
  assert.deepStrictEqual(r['80685306003593@lid'], { contactId: 'c2', crmLabelIds: [], active: false }, 'o @lid acha o contato pelo telefone');
  assert.strictEqual(r['5521900000003@c.us'].active, true, 'régua ativa');
  assert.strictEqual(r['5521900000004@c.us'].active, true, 'inscrição sem saída em automação ligada');
  assert.strictEqual(r['5521900000005@c.us'].active, false, 'automação desligada não conta');
  assert.deepStrictEqual(r['5521900000006@c.us'], { contactId: null, crmLabelIds: [], active: false });
  assert.ok(!('lixo' in r));
  assert.deepStrictEqual(writes, [], 'nada gravado');
});

test('config e silenciados em system_config (wa_radar_config / wa_radar_snooze), valores conferidos', async () => {
  const { api, T } = db({});
  const t0 = Date.now();
  const c0 = await api.radarConfig();
  assert.deepStrictEqual({ ...c0, since: null }, { on: true, since: null, hours: 2, crmAsNone: [], waAsNone: [] }, 'padrão: ligado, 2 h');
  assert.ok(Date.parse(c0.since) >= t0 - 1000, 'sem data de início: começa agora (e fica gravada)');
  assert.strictEqual((await api.radarConfig()).since, c0.since, 'a data não muda a cada leitura');
  const c = await api.setRadarConfig({ config: { on: false, hours: 3, crmAsNone: [NOVO, 'x'], waAsNone: ['9', '<script>'], since: '2020-01-01T00:00:00Z' } });
  assert.deepStrictEqual(c, { on: false, since: null, hours: 3, crmAsNone: [NOVO], waAsNone: ['9'] });
  assert.deepStrictEqual(await api.radarConfig(), c, 'desligado: sem data');
  await new Promise((r) => setTimeout(r, 5));
  const on = await api.setRadarConfig({ config: { on: true, hours: 999 } });
  assert.strictEqual(on.hours, 2, 'tempo fora do limite volta ao padrão');
  assert.ok(Date.parse(on.since) > Date.parse(c0.since), 'religar = nova data');
  assert.strictEqual((await api.setRadarConfig({ config: { on: true, hours: 4 } })).since, on.since, 'salvar ligado mantém a data');
  let s = await api.setRadarSnooze({ chatId: '5521900000001@c.us', mode: 'none', lastT: 1762880000 });
  assert.deepStrictEqual([s['5521900000001@c.us'].mode, s['5521900000001@c.us'].lastT], ['none', 1762880000]);
  s = await api.setRadarSnooze({ chatId: '5521900000002@c.us', mode: 'remind', minutes: 60 });
  const until = Date.parse(s['5521900000002@c.us'].until);
  assert.ok(Math.abs(until - (Date.now() + 3600000)) < 5000, 'lembrar em 1 h');
  assert.deepStrictEqual(Object.keys(await api.radarSnooze()).sort(), ['5521900000001@c.us', '5521900000002@c.us']);
  assert.deepStrictEqual(T.system_config.map((r) => r.key).sort(), ['wa_radar_config', 'wa_radar_snooze']);
  await assert.rejects(() => api.setRadarSnooze({ chatId: 'x', mode: 'none', lastT: 1 }), /Conversa inválida/);
  s = await api.setRadarSnooze({ chatId: '5521900000001@c.us', mode: 'clear' });
  assert.deepStrictEqual(Object.keys(s), ['5521900000002@c.us']);
  // 2.17.1: "Não precisa para todas" numa gravação só
  s = await api.setRadarSnoozeMany({ items: [{ chatId: '5521900000003@c.us', lastT: 10 }, { chatId: '80685306003593@lid', lastT: 20 }, { chatId: 'x', lastT: 1 }] });
  assert.deepStrictEqual([s['5521900000003@c.us'].mode, s['5521900000003@c.us'].lastT, s['80685306003593@lid'].lastT, 'x' in s], ['none', 10, 20, false]);
  await assert.rejects(() => api.setRadarSnoozeMany({ items: [] }), /Lista inválida/);
});

// 2.16.x → 2.17.1: config gravada pela 2.17.0 (sem data e com waExclude) passa a começar agora
test('atualização da 2.17.0: sem data de início → começa no momento da atualização; waExclude antigo é ignorado', async () => {
  const { api } = db({ system_config: [{ key: 'wa_radar_config', value: JSON.stringify({ on: true, hours: 2, crmAsNone: [], waExclude: ['9'] }) }] });
  const t0 = Date.now();
  const c = await api.radarConfig();
  assert.ok(Date.parse(c.since) >= t0 - 1000);
  assert.deepStrictEqual(c.waAsNone, []);
  assert.ok(!('waExclude' in c));
});

test('painel: a cada 5 min no horário geral, popup, contador no ícone, Mais → Radar, abre na aba Etiquetas', () => {
  const c = src('content.js');
  assert.ok(c.includes('const RADAR_EVERY_MS = 5 * 60 * 1000;'));
  assert.ok(c.includes('E.isBusinessTime(Date.now(), s)'), 'só no horário geral');
  assert.ok(c.includes("toggleBtn.append(radarBadge);"), 'bolinha no ícone');
  assert.ok(c.includes("`⚠ ${n} conversa${n === 1 ? '' : 's'} sem destino há mais de ${radarHoursTxt()}`"));
  assert.ok(c.includes("onOpened: () => { setOpen(true); setSection('etiquetas'); }"));
  assert.ok(c.includes("mk('Não precisa'") && c.includes("mk('Lembrar em 1 h'"));
  assert.ok(c.includes("pmenuEl.insertBefore(radarMenuBtn, pmenuEl.querySelector('.pmaint'));"));
  assert.ok(!/RADAR_DISMISS_KEY\]: [^\n]*preview/.test(c), 'resumo da mensagem não vai para o chrome.storage');
  assert.ok(src('background.js').includes('radarState:') && src('background.js').includes('setRadarSnooze:'));
  assert.ok(c.includes("const b = el('button', 'btn rr-all', 'Não precisa para todas');") && c.includes('Confirmar: silenciar as'), 'para todas, com confirmação');
  assert.ok(c.includes('radarPopup.append(top, radarAllBtn(), list);') && c.includes('allWrap.append(radarAllBtn())'), 'no popup e na seção');
  assert.ok(c.includes('Ligado desde'));
  assert.ok(src('background.js').includes('setRadarSnoozeMany:'));
  assert.ok(/^2\.(17\.[1-9]\d*|(1[8-9]|[2-9]\d)\.\d+)$/.test(JSON.parse(src('manifest.json')).version), 'versão 2.17.1 ou depois');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e && e.message ? e.message : e}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} testes passaram`);
  if (failed) process.exitCode = 1;
})();
