// Testes da 2.16.8 ("Pular espera" já clicado). Sem dependências: node extension/tests/skipwait.test.cjs
// - previsão (E.seqSkipForecast) com as regras do motor: fila + intervalo médio, limite por hora (volta quando o envio
//   mais antigo da hora completar 1 h), limite do dia (geral e o da régua), fora do horário, faixa da etapa, "Pausar tudo"
// - servidor (supabase-api.js de verdade sobre um banco em memória): seqSkipInfo (lugar na fila, contagens, último envio)
//   e o "Pular espera" gravado no banco (skip_wait + updated_at), que qualquer computador lê de volta (seqChatRuns)
// - nada muda no envio: o motor manda o próximo follow do mesmo jeito
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ctx = vm.createContext({ console, Intl, Date, Math, Promise, setTimeout, clearTimeout });
vm.runInContext(src('engine.js'), ctx, { filename: 'engine.js' });
const E = ctx.TspEngine;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const MIN = 60000;
const HOUR = 60 * MIN;
const at = (d, h, m, s = 0) => new Date(2026, 10, d, h, m, s).getTime(); // novembro de 2026 (10 = ter, 13 = sex)
// horário geral seg–sex 09:00–18:00; 30 por hora, 150 por dia, intervalo 45–120 s (média 82,5 s)
const SETTINGS = { max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120, paused_all: false, business_start: '09:00', business_end: '18:00', business_days: [1, 2, 3, 4, 5] };
const DEF = { start: { type: 'manual' }, steps: [{ id: 'w1', type: 'esperar', amount: 1, unit: 'dias', yes: [{ id: 'f', type: 'fim' }], no: [{ id: 's2', type: 'enviar', item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }] }] };
const fc = (o) => E.seqSkipForecast({ def: DEF, settings: SETTINGS, counts: { hour: 3, day: 20 }, ...o });

test('fila: 5º às 12:28 (último envio 12:27:30) → sai por volta de 12:34 (intervalo médio 82,5 s × 4 depois do próximo)', () => {
  const r = fc({ now: at(10, 12, 28), position: 5, lastSentAt: at(10, 12, 27, 30) });
  assert.deepStrictEqual([r.kind, r.position, r.text], ['fila', 5, 'na fila: 5º · sai por volta de 12:34']);
  assert.strictEqual(r.at, at(10, 12, 27, 30) + 82500 + 4 * 82500);
  // o próximo da fila, sem envio recente: na hora
  assert.strictEqual(fc({ now: at(10, 12, 28), position: 1 }).text, 'na fila: 1º · sai por volta de 12:28');
});

test('limite por hora: 30 envios na última hora (o mais antigo 12:00) → "limite por hora — volta às 13:00"', () => {
  const r = fc({ now: at(10, 12, 28), position: 1, counts: { hour: 30, day: 40 }, oldestHourAt: at(10, 12, 0) });
  assert.deepStrictEqual([r.kind, r.text, r.at], ['hora', 'limite por hora — volta às 13:00', at(10, 13, 0)]);
  // não cabe nesta hora (28 já foram, é o 5º da fila): espera a hora liberar
  const q = fc({ now: at(10, 12, 28), position: 5, counts: { hour: 28, day: 40 }, oldestHourAt: at(10, 12, 10) });
  assert.deepStrictEqual([q.kind, q.text], ['fila', 'na fila: 5º · sai por volta de 13:10']);
});

test('fora do horário: terça 19:10 → "amanhã 09:00"; sexta 19:10 → "seg 16/11 09:00"; faixa da etapa 14:00–18:00 às 12:28 → "hoje 14:00"', () => {
  assert.deepStrictEqual([fc({ now: at(10, 19, 10) }).kind, fc({ now: at(10, 19, 10) }).text], ['horario', 'fora do horário — amanhã 09:00']);
  assert.strictEqual(fc({ now: at(13, 19, 10) }).text, 'fora do horário — seg 16/11 09:00');
  assert.strictEqual(fc({ now: at(10, 12, 28), window: { start: '14:00', end: '18:00' } }).text, 'fora do horário — hoje 14:00');
});

test('limite do dia (geral: 150; ou o limite próprio da régua) → "limite do dia — volta amanhã 09:00"; "Pausar tudo" → pausado', () => {
  assert.deepStrictEqual([fc({ now: at(10, 15, 0), counts: { hour: 2, day: 150 } }).kind, fc({ now: at(10, 15, 0), counts: { hour: 2, day: 150 } }).text], ['dia', 'limite do dia — volta amanhã 09:00']);
  const own = { ...DEF, schedule: { mode: 'geral', daily_limit: 10 } };
  assert.strictEqual(E.seqSkipForecast({ def: own, settings: SETTINGS, now: at(10, 15, 0), counts: { hour: 2, day: 20 }, sentTodaySeq: 10 }).text, 'limite do dia — volta amanhã 09:00');
  assert.strictEqual(E.seqSkipForecast({ def: own, settings: SETTINGS, now: at(10, 15, 0), counts: { hour: 2, day: 20 }, sentTodaySeq: 9 }).kind, 'fila');
  assert.strictEqual(fc({ now: at(10, 12, 0), settings: { ...SETTINGS, paused_all: true } }).kind, 'pausado');
});

// ── servidor: banco em memória (GET/HEAD/POST/PATCH com eq, neq, in, is, gte, lte e or=(…)) ──
function fakeDb(seed) {
  const db = JSON.parse(JSON.stringify(seed));
  const tbl = (t) => db[t] || (db[t] = []);
  const unq = (v) => v.replace(/^"|"$/g, '');
  const inVals = (v) => { const m = /^\((.*)\)$/.exec(v); return m ? (m[1].match(/"(?:[^"\\]|\\.)*"|[^,]+/g) || []).map(unq) : []; };
  const one = (x, op, val) => {
    if (op === 'eq') return String(x) === val;
    if (op === 'neq') return String(x) !== val;
    if (op === 'is') return val === 'null' ? x == null : String(x) === val;
    if (op === 'in') return inVals(val).includes(String(x));
    if (op === 'gte') return x != null && String(x) >= val;
    if (op === 'lte') return x != null && String(x) <= val;
    return true;
  };
  const splitTop = (s) => { const out = []; let d = 0; let cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };
  const cond = (s) => {
    const g = /^(and|or)\((.*)\)$/.exec(s);
    if (g) { const parts = splitTop(g[2]).map(cond); return g[1] === 'and' ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r)); }
    const f = /^(\w+)\.(not\.)?(eq|neq|is|in|gte|lte)\.(.*)$/.exec(s);
    return f ? (r) => one(r[f[1]], f[3], f[4]) !== !!f[2] : () => true;
  };
  const res = (status, body, count) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)), headers: { get: (h) => (/content-range/i.test(h) ? `0-0/${count == null ? 0 : count}` : null) } });
  async function fetch(url, init = {}) {
    const u = new URL(url);
    const table = u.pathname.replace('/rest/v1/', '');
    const method = (init.method || 'GET').toUpperCase();
    const filters = [];
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
      if (k === 'or' || k === 'and') { filters.push(cond(`${k}${v}`)); continue; }
      const m = /^(not\.)?(eq|neq|is|in|gte|lte)\.(.*)$/.exec(v);
      if (m) filters.push((r) => one(r[k], m[2], m[3]) !== !!m[1]);
    }
    let rows = tbl(table).filter((r) => filters.every((f) => f(r)));
    const order = u.searchParams.get('order');
    if (order) { const [col, dir] = order.split(',')[0].split('.'); rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (dir === 'desc' ? -1 : 1)); }
    if (method === 'HEAD') return res(200, null, rows.length);
    if (method === 'GET') { const off = Number(u.searchParams.get('offset')) || 0; const lim = Number(u.searchParams.get('limit')); return res(200, rows.slice(off, lim ? off + lim : undefined)); }
    const body = init.body ? JSON.parse(init.body) : null;
    if (method === 'PATCH') { rows.forEach((r) => Object.assign(r, body)); return res(200, /return=representation/.test((init.headers && init.headers.Prefer) || '') ? rows : null); }
    if (method === 'POST') { const list = (Array.isArray(body) ? body : [body]).map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r })); tbl(table).push(...list); return res(201, list); }
    return res(400, { message: 'método' });
  }
  return { db, fetch };
}
function apiOn(fake) {
  const c = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch: fake.fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), c);
  vm.runInContext(src('supabase-api.js'), c);
  return c.WaApi;
}
const SEQ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = (ms) => new Date(ms).toISOString();

test('servidor: seqSkipInfo — 3º na fila (espera pulada ou prazo vencido, na ordem do motor), envios da hora/do dia, último envio e o mais antigo da hora', async () => {
  const t = Date.now();
  const run = (n, extra) => ({ id: id(n), automation_id: SEQ, chat_id: `55219000000${n}@c.us`, node: 'w1', status: 'ativo', skip_wait: false, due_at: null, version: 0, ...extra });
  const log = (ms, status = 'enviado', source = 'follow') => ({ id: crypto.randomUUID(), source, source_id: SEQ, status, created_at: iso(ms) });
  const fake = fakeDb({
    wa_sequence_runs: [run(1, { due_at: iso(t - HOUR) }), run(2, { skip_wait: true }), run(3, { due_at: iso(t + HOUR) }), run(4, { skip_wait: true }), run(5, { skip_wait: true, status: 'fim' })],
    wa_send_log: [log(t - 50 * MIN), log(t - 20 * MIN), log(t - 2 * MIN), log(t - 3 * HOUR), log(t - 10 * MIN, 'pulado'), log(t - 5 * MIN, 'enviado', 'manual')],
  });
  const info = JSON.parse(JSON.stringify(await apiOn(fake).seqSkipInfo({ runId: id(4), automationId: SEQ, hourSince: iso(t - HOUR), daySince: iso(t - 5 * HOUR) })));
  assert.deepStrictEqual([info.position, info.ready, info.counts], [3, 3, { hour: 3, day: 4 }]);
  assert.deepStrictEqual([info.lastSentAt, info.oldestHourAt, info.sentTodaySeq], [t - 2 * MIN, t - 50 * MIN, 4]);
});

test('servidor: "Pular espera" grava skip_wait (e a hora em updated_at) no banco; outro computador lê igual (seqChatRuns)', async () => {
  const chat = '5521900000099@c.us';
  const fake = fakeDb({ wa_automations: [{ id: SEQ, name: 'Régua', sequence: DEF, test_chat_id: null }], wa_sequence_runs: [{ id: id(9), automation_id: SEQ, chat_id: chat, node: 'w1', status: 'ativo', skip_wait: false, version: 0, created_at: iso(Date.now() - HOUR), updated_at: iso(Date.now() - HOUR) }], wa_automation_runs: [], wa_settings: [] });
  const t0 = Date.now();
  await apiOn(fake).seqRunAction({ id: id(9), action: 'pular' });
  const other = apiOn(fake); // "outro computador": outra instância, o mesmo banco
  const runs = JSON.parse(JSON.stringify(await other.seqChatRuns({ chatId: chat })));
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].skip_wait, true);
  assert.ok(Math.abs(Date.parse(runs[0].updated_at) - t0) < 5000, runs[0].updated_at);
});

test('nada muda no envio: com a espera pulada o motor segue pelo ❌ e manda o próximo follow, como antes', () => {
  const r = E.seqStep({ def: DEF, run: { node: 'w1', wait_started_at: at(10, 12, 0), skip_wait: true, branches: [] }, chat: { loaded: true, last: null }, replies: [], now: at(10, 12, 28) });
  assert.deepStrictEqual([r.status, r.sendNode, r.branches.map((b) => b.result).join()], ['run', 's2', 'nao']);
});

test('painel da conversa: sem o botão "Pular espera" quando já pulou; selo + previsão; ERP com o mesmo selo', () => {
  const c = src('content.js');
  assert.ok(/e\.node\.type === 'esperar' && !skipped\) btns\.append\(fbtn\('ed-mini cseq-skip', 'Pular espera'/.test(c));
  assert.ok(/⏩ Espera pulada\$\{when\} · na fila de envio/.test(c) && /E\.seqSkipForecast\(/.test(c) && /call\('seqSkipInfo'/.test(c));
  const erp = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'waAutomations.ts'), 'utf8');
  assert.ok(/SKIPPED_WAIT_TEXT = '⏩ pulou a espera'/.test(erp));
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
