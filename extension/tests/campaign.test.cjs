// Testes da 2.14.0 (disparos mais completos e mais seguros): node extension/tests/campaign.test.cjs
// - velocidade: modelos, limite duro (20 s, 60/hora, 400/dia), aviso acima do Normal, pausa a cada N, intervalo,
//   horário próprio, previsão ("termina em cerca de…")
// - soma com automações: o motor passa ao disparo as contagens de TODOS os envios automáticos
// - variações alternando / porcentagem / aleatória, {a|b} por envio, troca só do texto
// - servidor: público por etiqueta do WhatsApp (conversa não carregada, @lid com telefone, "Não enviar" do
//   WhatsApp, filtros CRM e WhatsApp), validação, ações do WhatsApp depois de enviar, próximo alvo com o que já
//   foi enviado, resultado por variação, sem a migration = como antes
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ctx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(src('engine.js'), ctx, { filename: 'engine.js' });
const E = ctx.TspEngine;
const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const MIN = 60000;
const at = (s) => new Date(s).getTime();
const GERAL = { business_start: '09:00', business_end: '19:00', business_days: [1, 2, 3, 4, 5, 6], max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, paused_all: false };
const MON = '2026-11-09';

// ── velocidade ──
test('modelos: Bem seguro 90–180 s, 20/h, 100/dia, pausa de 10 min a cada 15; Normal 45–120, 30/h, 150/dia, 5 min a cada 20; sem velocidade = Normal', () => {
  assert.deepStrictEqual(plain(E.campaignSpeed({ preset: 'seguro' })), { preset: 'seguro', min_s: 90, max_s: 180, per_hour: 20, per_day: 100, pause_every: 15, pause_min: 10, schedule: null });
  assert.deepStrictEqual(plain(E.campaignSpeed({ preset: 'normal' })), { preset: 'normal', min_s: 45, max_s: 120, per_hour: 30, per_day: 150, pause_every: 20, pause_min: 5, schedule: null });
  assert.strictEqual(E.campaignSpeed(null).preset, 'normal');
});
test('limite duro: personalizado mais rápido que 20 s / 60 por hora / 400 por dia vira o limite; acima do Normal = aviso amarelo', () => {
  const sp = plain(E.campaignSpeed({ preset: 'personalizado', min_s: 5, max_s: 10, per_hour: 500, per_day: 9999, pause_every: 0 }));
  assert.deepStrictEqual([sp.min_s, sp.max_s, sp.per_hour, sp.per_day, sp.pause_every, sp.pause_min], [20, 20, 60, 400, 0, 0]);
  assert.deepStrictEqual(plain(E.campaignSpeedClamped({ preset: 'personalizado', min_s: 5, per_hour: 500, per_day: 9999 })), ['intervalo mínimo de 20 s', 'no máximo 60 por hora', 'no máximo 400 por dia']);
  assert.strictEqual(E.campaignSpeedRisk({ preset: 'normal' }), false);
  assert.strictEqual(E.campaignSpeedRisk({ preset: 'seguro' }), false);
  assert.strictEqual(E.campaignSpeedRisk({ preset: 'personalizado', min_s: 30, max_s: 120, per_hour: 30, per_day: 150 }), true);
  assert.strictEqual(E.campaignSpeedRisk({ preset: 'personalizado', min_s: 60, max_s: 150, per_hour: 40, per_day: 150 }), true);
});
test('pausa a cada N: Bem seguro, 15 enviados e o último há 5 min → espera até 10 min; há 11 min → pode; 16 enviados → não pausa', () => {
  const now = at(`${MON}T10:00`);
  const base = { speed: { preset: 'seguro' }, counts: { hour: 0, day: 0 }, now, settings: GERAL };
  const g1 = plain(E.campaignGate({ ...base, sent: 15, lastSentAt: now - 5 * MIN }));
  assert.deepStrictEqual([g1.ok, g1.reason, g1.until], [false, 'pausa de 10 min a cada 15 envios', now + 5 * MIN]);
  assert.strictEqual(E.campaignGate({ ...base, sent: 15, lastSentAt: now - 11 * MIN }).ok, true);
  assert.strictEqual(E.campaignGate({ ...base, sent: 16, lastSentAt: now - 2 * MIN }).ok, true);
  // intervalo sorteado do disparo
  const g2 = plain(E.campaignGate({ ...base, sent: 3, lastSentAt: now - 60000, nextAt: now + 30000 }));
  assert.deepStrictEqual([g2.ok, g2.reason], [false, 'intervalo do disparo']);
  for (let i = 0; i < 50; i++) { const ms = E.campaignGapMs({ preset: 'seguro' }); assert.ok(ms >= 90000 && ms <= 180000, String(ms)); }
  assert.ok(E.campaignGapMs({ preset: 'personalizado', min_s: 1, max_s: 1 }) === 20000);
});
test('soma com automações: o limite por hora/dia do disparo conta TODOS os envios automáticos (disparo + automações); e o geral também', () => {
  const now = at(`${MON}T10:00`);
  // Bem seguro: 20/hora. 12 do disparo + 8 de automações = 20 → para
  const g = plain(E.campaignGate({ speed: { preset: 'seguro' }, counts: { hour: 20, day: 20 }, now, settings: GERAL }));
  assert.deepStrictEqual([g.ok, g.reason], [false, 'limite por hora (disparo + automações)']);
  assert.strictEqual(E.campaignGate({ speed: { preset: 'seguro' }, counts: { hour: 19, day: 19 }, now, settings: GERAL }).ok, true);
  assert.strictEqual(E.campaignGate({ speed: { preset: 'seguro' }, counts: { hour: 1, day: 100 }, now, settings: GERAL }).reason, 'limite do dia (disparo + automações)');
  // personalizado 60/h, mas o geral é 30/h: o menor vale
  assert.strictEqual(E.campaignGate({ speed: { preset: 'personalizado', min_s: 20, max_s: 30, per_hour: 60, per_day: 400 }, counts: { hour: 30, day: 30 }, now, settings: GERAL }).ok, false);
});
test('horário: sem horário próprio usa o geral (domingo não); com dias e horário próprios manda no domingo e espera a faixa', () => {
  const sun = at('2026-11-15T10:00');
  assert.strictEqual(E.campaignGate({ speed: { preset: 'normal' }, now: sun, settings: GERAL }).reason, 'fora do horário do disparo');
  const own = { preset: 'personalizado', min_s: 60, max_s: 90, per_hour: 20, per_day: 100, pause_every: 0, schedule: { mode: 'personalizado', days: [0], windows: [{ start: '09:00', end: '12:00' }] } };
  assert.strictEqual(E.campaignGate({ speed: own, now: sun, settings: GERAL }).ok, true);
  const g = plain(E.campaignGate({ speed: own, now: at('2026-11-15T13:00'), settings: GERAL }));
  assert.deepStrictEqual([g.ok, g.until], [false, at('2026-11-22T09:00')]);
});
test('previsão: 30 contatos no Bem seguro (20/hora, 135 s em média, pausa de 10 min a cada 15) a partir de segunda 09:00', () => {
  const start = at(`${MON}T09:00`);
  const fc = plain(E.campaignForecast(30, { preset: 'seguro' }, GERAL, start));
  // 20 na 1ª hora (09:00–09:52 + pausa), os outros 10 depois de 10:00
  assert.ok(fc.endAt > at(`${MON}T10:00`) && fc.endAt < at(`${MON}T11:00`), new Date(fc.endAt).toString());
  assert.match(E.forecastText(30, fc, start), /^30 contatos · termina em cerca de \d+ h \(hoje às 1\d:\d\d\)$/);
  // 250 no Normal (150/dia): termina no dia seguinte
  const fc2 = E.campaignForecast(250, { preset: 'normal' }, GERAL, start);
  assert.match(E.forecastText(250, fc2, start), /\(amanhã às \d\d:\d\d\)$/);
  assert.strictEqual(E.forecastText(0, null, start), '0 contatos · nada para enviar');
});

// ── variações e {a|b} ──
test('variações alternando (1ª, 2ª, 1ª, 2ª…), por porcentagem (75/25 exato e intercalado) e aleatória', () => {
  const v = { mode: 'alternada', list: [{ text: 'B' }] };
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((i) => E.pickVariant(i, v)), [0, 1, 0, 1, 0]);
  const three = { mode: 'alternada', list: [{ text: 'B' }, { text: 'C' }] };
  assert.deepStrictEqual([0, 1, 2, 3].map((i) => E.pickVariant(i, three)), [0, 1, 2, 0]);
  const pct = { mode: 'porcentagem', list: [{ text: 'B' }], weights: [75, 25] };
  const seq = Array.from({ length: 8 }, (_, i) => E.pickVariant(i, pct));
  assert.deepStrictEqual([seq.filter((x) => x === 0).length, seq.filter((x) => x === 1).length], [6, 2]);
  assert.ok(seq.slice(0, 4).includes(1), JSON.stringify(seq)); // intercalado, não 6 seguidas
  assert.strictEqual(E.pickVariant(5, { mode: 'aleatoria', list: [{ text: 'B' }] }, () => 0.99), 1);
  assert.strictEqual(E.pickVariant(5, null), 0);
});
test('variação troca só o texto (as outras partes ficam); sem texto, entra um texto antes', () => {
  const parts = [{ type: 'imagem', file_url: 'x.jpg', body: 'legenda' }, { type: 'texto', body: 'Original {nome}' }];
  const v = { mode: 'alternada', list: [{ text: 'Nova {nome}' }] };
  assert.deepStrictEqual(plain(E.variantParts(parts, v, 1)), [{ type: 'imagem', file_url: 'x.jpg', body: 'legenda' }, { type: 'texto', body: 'Nova {nome}' }]);
  assert.deepStrictEqual(plain(E.variantParts(parts, v, 0)), plain(parts));
  assert.strictEqual(E.variantParts([{ type: 'audio' }], v, 1)[0].body, 'Nova {nome}');
});
test('{Oi|Olá|Oiii} escolhe uma por envio; {nome} e {, nome} ficam; sem "|" não mexe', () => {
  assert.strictEqual(E.spinText('{Oi|Olá|Oiii} {nome}!', () => 0), 'Oi {nome}!');
  assert.strictEqual(E.spinText('{Oi|Olá|Oiii} {nome}!', () => 0.5), 'Olá {nome}!');
  assert.strictEqual(E.spinText('{Oi|Olá|Oiii}{, nome}!', () => 0.99), 'Oiii{, nome}!');
  assert.strictEqual(E.spinText('{a|b} e {c|d}', () => 0.6), 'b e d');
  assert.strictEqual(E.spinText('Sem sorteio {nome}'), 'Sem sorteio {nome}');
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(E.spinText('{Oi|Olá}'));
  assert.deepStrictEqual([...seen].sort(), ['Oi', 'Olá']);
  assert.deepStrictEqual(plain(E.spinParts([{ type: 'texto', body: '{x|y}' }, { type: 'imagem' }], () => 0)), [{ type: 'texto', body: 'x' }, { type: 'imagem' }]);
});
test('"Todas menos a que vou colocar": nunca "Não enviar" nem a que vai colocar', () => {
  assert.deepStrictEqual(plain(E.removeAllExcept(['1', '2', '3', '9'], ['2'], (id) => id === '9')), ['1', '3']);
});

// ── motor: o disparo recebe as contagens de todos os envios automáticos ──
test('motor: o ciclo passa ao disparo as contagens somadas (automações + disparo) e o horário; sem horário próprio fora do geral nem pergunta', async () => {
  const now = { t: at(`${MON}T10:00`) };
  const seen = [];
  const api = async (type) => {
    if (type === 'getEngineSettings') return { available: true, settings: GERAL, campaigns: true, campaignsV2: true, campaignsV214: true, automations: false };
    if (type === 'claimLease') return { held: true, lease_until: new Date(now.t + 5 * MIN).toISOString(), settings: GERAL };
    if (type === 'engineActivity') return { schedules: false, campaigns: true, campaignsCustom: false, automations: null, flows: false };
    if (type === 'sendCounts') return { hour: 7, day: 40 };
    return null;
  };
  const m = E.createMotor({
    api, now: () => now.t, setWake: () => 0, clearWake: () => {},
    wa: { ready: async () => true },
    campaignJob: async (a, c) => { seen.push(plain(c)); return null; },
  });
  m.state.workAt = 0;
  await m.tick();
  assert.deepStrictEqual([seen.length, seen[0].counts, seen[0].outside, seen[0].settings.max_per_hour], [1, { hour: 7, day: 40 }, false, 30]);
  now.t = at('2026-11-15T10:00'); // domingo: fora do horário geral, nenhum disparo com horário próprio
  m.state.workAt = 0; m.state.activityAt = 0;
  await m.tick();
  assert.strictEqual(seen.length, 1);
});

// ── servidor (banco falso em memória) ──
function db0() {
  return {
    wa_labels: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Não enviar' }, { id: '22222222-2222-4222-8222-222222222222', name: 'Clientes' }],
    wa_contacts: [{ id: 'c0000000-0000-4000-8000-000000000001', name: 'Ana CRM', phone: '5521911110000', chat_id: '5521911110000@c.us' }],
    wa_contact_labels: [{ contact_id: 'c0000000-0000-4000-8000-000000000001', label_id: '22222222-2222-4222-8222-222222222222', created_at: '2026-11-01T00:00:00Z' }],
    wa_campaigns: [], wa_campaign_targets: [], wa_send_log: [], wa_replies: [], sales: [], wa_settings: [{ id: 1 }],
  };
}
function server({ noV214 = false, db = db0() } = {}) {
  const calls = [];
  const res = (status, body, count) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: (h) => (h === 'content-range' ? `0-0/${count == null ? 0 : count}` : null) } });
  const vals = (v) => v.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const table = decodeURIComponent(u.pathname.replace('/rest/v1/', ''));
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, table, q: u.search, body });
    const sel = u.searchParams.get('select') || '';
    if (noV214 && /\b(speed|audience|variants|variant)\b/.test(sel)) return res(400, { message: `column ${table}.${sel} does not exist` });
    if (!db[table]) db[table] = [];
    const filters = [];
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'or'].includes(k)) continue;
      const m = /^(eq|neq|in|is|gte|lte|not\.is)\.(.*)$/.exec(v);
      if (m) filters.push([k, m[1], m[2]]);
    }
    const match = (r) => filters.every(([k, op, val]) => {
      const x = r[k];
      if (op === 'eq') return String(x) === val;
      if (op === 'neq') return String(x) !== val;
      if (op === 'in') return vals(val).includes(String(x));
      if (op === 'is') return val === 'null' ? x == null : true;
      if (op === 'not.is') return x != null;
      if (op === 'gte') return String(x) >= val;
      if (op === 'lte') return String(x) <= val;
      return true;
    });
    let rows = db[table].filter(match);
    if (method === 'HEAD') return res(200, null, rows.length);
    if (method === 'GET') {
      const ord = u.searchParams.get('order');
      if (ord && !/^id./.test(ord)) { const [col, dir] = ord.split(',')[0].split('.'); rows = rows.slice().sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : String(a[col] ?? '') > String(b[col] ?? '') ? 1 : 0) * (dir === 'desc' ? -1 : 1)); }
      const off = Number(u.searchParams.get('offset')) || 0;
      const lim = Number(u.searchParams.get('limit')) || 100000;
      return res(200, rows.slice(off, off + lim));
    }
    if (method === 'POST') {
      const list = (Array.isArray(body) ? body : [body]).map((r) => ({ id: require('crypto').randomUUID(), created_at: new Date().toISOString(), ...r }));
      db[table].push(...list);
      return res(201, list);
    }
    if (method === 'PATCH') { rows.forEach((r) => Object.assign(r, body)); return res(200, rows); }
    if (method === 'DELETE') { db[table] = db[table].filter((r) => !match(r)); return res(200, rows); }
    return res(200, []);
  };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return { a: c.WaApi, db, calls };
}
const WA_LABEL = '7';
const campaignIn = (extra = {}) => ({ name: 'Promo WhatsApp', audience: { source: 'whatsapp', wa_label_id: WA_LABEL }, parts: [{ type: 'texto', body: '{Oi|Olá} {nome}!' }], after_actions: [], filters: [], ...extra });
// o que o painel leu do WhatsApp: Ana (carregada, já no CRM), Bia (@lid, NÃO carregada, com telefone), Caio (Não enviar
// do WhatsApp), Davi (@lid sem telefone), Eva (arquivada/não carregada) e Ana de novo (repetida)
const WA = {
  audience: [
    { id: '5521911110000@c.us', name: 'Ana' }, { id: '123456789012345@lid', phone: '5521922220000', name: 'Bia' },
    { id: '5521933330000@c.us', name: 'Caio' }, { id: '999999999999999@lid', name: 'Davi' }, { id: '5521955550000@c.us', name: null, phone: '5521955550000' },
    { id: '5521911110000@c.us', name: 'Ana' },
  ],
  sets: { 8: ['123456789012345@lid', '5521922220000@c.us'] },
  noSend: ['5521933330000@c.us'],
  names: { 8: 'VIP' },
};
test('servidor: público por etiqueta do WhatsApp — TODAS as conversas (não carregada, @lid com telefone vira número), "Não enviar" do WhatsApp fora, sem telefone fora, repetida uma vez só', async () => {
  const { a, db } = server();
  const { id } = await a.saveCampaign({ campaign: campaignIn({ speed: { preset: 'seguro' }, variants: { mode: 'alternada', list: [{ text: 'Variação B {nome}' }] } }) });
  const row = db.wa_campaigns.find((x) => x.id === id);
  assert.deepStrictEqual([row.label_id, plain(row.audience), plain(row.speed), plain(row.variants), row.skip_recent_days], [null, { source: 'whatsapp', wa_label_id: '7' }, { preset: 'seguro' }, { mode: 'alternada', list: [{ text: 'Variação B {nome}' }] }, 0]);
  await assert.rejects(a.startCampaign({ id }), /Abra o WhatsApp Web/);
  const r = await a.startCampaign({ id, wa: WA });
  assert.deepStrictEqual([r.total, r.willSend], [5, 3]);
  const t = db.wa_campaign_targets.map((x) => [x.name, x.chat_id, x.status, x.reason, x.contact_id]);
  assert.deepStrictEqual(t, [
    ['Ana', '5521911110000@c.us', 'pendente', null, 'c0000000-0000-4000-8000-000000000001'],
    ['Bia', '5521922220000@c.us', 'pendente', null, null],
    ['Caio', '5521933330000@c.us', 'pulado', 'Não enviar', null],
    ['Davi', null, 'pulado', 'sem telefone', null],
    ['5521955550000', '5521955550000@c.us', 'pendente', null, null],
  ]);
});
test('servidor: filtros CRM e WhatsApp ("também tem" / "NÃO tem") no público do WhatsApp; "Não enviar" do CRM também vale', async () => {
  const { a, db } = server();
  const c = campaignIn({ filters: [{ type: 'nao_tem_etiqueta', source: 'whatsapp', wa_label_id: '8' }] });
  const pv = await a.simulateCampaign({ campaign: c, wa: WA });
  assert.deepStrictEqual(plain(pv.targets.filter((x) => x.status === 'pendente').map((x) => x.name)), ['Ana', '5521955550000']);
  assert.strictEqual(pv.targets.find((x) => x.name === 'Bia').reason, 'tem a etiqueta VIP');
  const pv2 = await a.simulateCampaign({ campaign: campaignIn({ filters: [{ type: 'tem_etiqueta', label_id: '22222222-2222-4222-8222-222222222222' }] }), wa: WA });
  assert.deepStrictEqual(plain(pv2.targets.filter((x) => x.status === 'pendente').map((x) => x.name)), ['Ana']);
  db.wa_contact_labels.push({ contact_id: 'c0000000-0000-4000-8000-000000000001', label_id: '11111111-1111-4111-8111-111111111111', created_at: '2026-11-02T00:00:00Z' });
  const pv3 = await a.simulateCampaign({ campaign: campaignIn(), wa: WA });
  assert.strictEqual(pv3.targets.find((x) => x.name === 'Ana').reason, 'Não enviar');
});
test('servidor: depois de enviar com etiqueta do WhatsApp ("Todas menos a que vou colocar") e CRM; velocidade fora do limite duro e variações erradas são recusadas', async () => {
  const { a, db } = server();
  const { id } = await a.saveCampaign({ campaign: campaignIn({ after_actions: [{ type: 'adicionar_etiqueta_wa', wa_label_id: '5' }, { type: 'remover_etiqueta_wa', wa_label_id: '__todas__' }, { type: 'remover_etiqueta', label_id: '__todas__' }] }) });
  assert.deepStrictEqual(plain(db.wa_campaigns.find((x) => x.id === id).after_actions), [{ type: 'adicionar_etiqueta_wa', wa_label_id: '5' }, { type: 'remover_etiqueta_wa', wa_label_id: '__todas__' }, { type: 'remover_etiqueta', label_id: '__todas__' }]);
  const sp = (x) => campaignIn({ speed: { preset: 'personalizado', min_s: 30, max_s: 60, per_hour: 30, per_day: 100, pause_every: 10, pause_min: 5, ...x } });
  await assert.rejects(a.saveCampaign({ campaign: sp({ min_s: 10 }) }), /pelo menos 20 s/);
  await assert.rejects(a.saveCampaign({ campaign: sp({ per_hour: 61 }) }), /no máximo 60 por hora/);
  await assert.rejects(a.saveCampaign({ campaign: sp({ per_day: 401 }) }), /no máximo 400 por dia/);
  await assert.rejects(a.saveCampaign({ campaign: sp({ max_s: 25 }) }), /maior ou igual ao mínimo/);
  const ok = await a.saveCampaign({ campaign: sp({ schedule: { mode: 'personalizado', days: [0, 6], windows: [{ start: '10:00', end: '14:00' }] } }) });
  assert.deepStrictEqual(plain(db.wa_campaigns.find((x) => x.id === ok.id).speed), { preset: 'personalizado', min_s: 30, max_s: 60, per_hour: 30, per_day: 100, pause_every: 10, pause_min: 5, schedule: { mode: 'personalizado', days: [0, 6], windows: [{ start: '10:00', end: '14:00' }] } });
  await assert.rejects(a.saveCampaign({ campaign: campaignIn({ variants: { mode: 'porcentagem', list: [{ text: 'B' }], weights: [0, 0] } }) }), /soma das porcentagens/);
  await assert.rejects(a.saveCampaign({ campaign: campaignIn({ variants: { mode: 'alternada', list: [{ text: '  ' }] } }) }), /Variação 2: escreva o texto/);
  await assert.rejects(a.saveCampaign({ campaign: campaignIn({ after_actions: [{ type: 'mover', label_id: '22222222-2222-4222-8222-222222222222' }] }) }), /"mover" só com público por etiqueta CRM/);
});
test('servidor: próximo alvo vem com quantos o disparo já enviou e quando foi o último (para pausa a cada N e o intervalo)', async () => {
  const { a, db } = server();
  const { id } = await a.saveCampaign({ campaign: campaignIn() });
  await a.startCampaign({ id, wa: WA });
  const [t1] = db.wa_campaign_targets;
  Object.assign(t1, { status: 'enviado', sent_at: '2026-11-09T13:00:00.000Z' });
  const r = await a.nextCampaignTarget();
  assert.deepStrictEqual([r.all.length, r.all[0].sent, r.all[0].lastSentAt, r.all[0].target.name], [1, 1, Date.parse('2026-11-09T13:00:00.000Z'), 'Bia']);
});
test('servidor: variação gravada no log de envio e o resultado por variação (enviadas, responderam %, vendas em até 7 dias)', async () => {
  const { a, db } = server();
  const CID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await a.logSend({ source: 'disparo', source_id: CID, contact_id: null, chat_id: '5521911110000@c.us', item_id: null, status: 'enviado', variant: 0 });
  await a.logSend({ source: 'disparo', source_id: CID, contact_id: null, chat_id: '5521922220000@c.us', item_id: null, status: 'enviado', variant: 1 });
  await a.logSend({ source: 'disparo', source_id: CID, contact_id: null, chat_id: '5521955550000@c.us', item_id: null, status: 'enviado', variant: 0 });
  assert.deepStrictEqual(db.wa_send_log.map((x) => x.variant), [0, 1, 0]);
  db.wa_replies.push({ send_log_id: db.wa_send_log[1].id });
  db.sales.push({ id: 's1', wa_chat_id: '5521922220000@c.us', created_at: new Date(Date.now() + 3600000).toISOString(), total_sale_price: 199.9, status: 'concluido' });
  const st = await a.campaignVariantStats({ id: CID });
  assert.deepStrictEqual(plain(st.rows).map((x) => [x.variant, x.sent, x.replied, x.sales, x.revenue]), [[0, 2, 0, 0, 0], [1, 1, 1, 1, 199.9]]);
});
test('servidor sem a migration: público do WhatsApp / velocidade / variações pedem para atualizar o banco; o disparo CRM de antes continua', async () => {
  const { a, db } = server({ noV214: true });
  await assert.rejects(a.saveCampaign({ campaign: campaignIn() }), /Atualize o banco/);
  await assert.rejects(a.saveCampaign({ campaign: { name: 'x', label_id: '22222222-2222-4222-8222-222222222222', parts: [{ type: 'texto', body: 'oi' }], speed: { preset: 'seguro' } } }), /Atualize o banco/);
  const { id } = await a.saveCampaign({ campaign: { name: 'CRM', label_id: '22222222-2222-4222-8222-222222222222', parts: [{ type: 'texto', body: 'oi' }], after_actions: [], filters: [] } });
  const row = db.wa_campaigns.find((x) => x.id === id);
  assert.ok(!('speed' in row) && row.skip_recent_days === 0);
  await a.logSend({ source: 'disparo', source_id: id, contact_id: null, chat_id: '5521911110000@c.us', item_id: null, status: 'enviado', variant: 1 });
  assert.ok(!('variant' in db.wa_send_log[0]));
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
