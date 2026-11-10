// Testes da 2.16.12 (contato duplicado "só pelo nome" e nome longo da agenda). node extension/tests/dupmerge.test.cjs
// supabase-api.js com um PostgREST falso em memória:
// - caso 1: conversa @lid com contato antigo (telefone + chat_id = esse @lid, Follow Up 1) e o nome da agenda
//   "Cliente Ana Maria S11 ...": o painel acha o contato PELO chat_id (não "só pelo nome") e a etiqueta Cliente vai
//   para ELE — nenhum contato novo
// - caso 2: nome da agenda com mais de 100 letras (e 150): não dá "Identificação inválida"; corta em 100
// - ordem: chat_id → telefone (do @c.us ou do @lid pelo cache) → nome; nunca cria se já existe pelo chat_id/telefone
// - junção dos duplicados (mesmo chat_id ou telefone) no mais antigo: etiquetas sem duplicar (data mais antiga),
//   nota, nome da agenda, percursos de automação, inscrições; apaga o duplicado; contatos sem par não mudam
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const EXT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const LID_ANA = '178352000000001@lid';
const LID_ALE = '159979000000001@lid';
const FU1 = '11111111-1111-4111-8111-111111111111'; // Follow Up 1
const CLI = '22222222-2222-4222-8222-222222222222'; // Cliente
const ANA_AGENDA = 'Cliente Ana Maria S11 Mini Rose Gold / Santa Rosa Niterói / Flashway Empresa 09/11/2026';
const ALE_AGENDA = `Alessandro ${'Cliente fiel do relógio Ultra 9 Preto, Copacabana, indicou a irmã e o primo '.repeat(2)}`.trim(); // > 100

// ── PostgREST falso ──
function db(seed) {
  const T = { wa_contacts: [], wa_contact_labels: [], wa_automation_runs: [], wa_automation_enrollments: [], wa_sequence_runs: [], wa_campaign_targets: [], wa_send_log: [], wa_labels: [], ...seed };
  let n = 0;
  const parseVal = (v) => (v === 'null' ? null : v);
  const filterOf = (k, v) => {
    if (v.startsWith('eq.')) { const x = v.slice(3); return (r) => String(r[k]) === x; }
    if (v.startsWith('neq.')) { const x = v.slice(4); return (r) => String(r[k]) !== x; }
    if (v.startsWith('in.(')) { const s = new Set(v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, ''))); return (r) => s.has(String(r[k])); }
    if (v === 'is.null') return (r) => r[k] == null;
    if (v === 'not.is.null') return (r) => r[k] != null;
    return () => true;
  };
  const handle = (method, url, body) => {
    const [table, qs] = url.split('?');
    const rows = T[table] || (T[table] = []);
    const params = (qs || '').split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; });
    const filters = []; let order = null; let limit = Infinity; let offset = 0; let conflict = null;
    params.forEach(([k, v]) => {
      if (k === 'select') return;
      if (k === 'order') order = v; else if (k === 'limit') limit = Number(v); else if (k === 'offset') offset = Number(v); else if (k === 'on_conflict') conflict = v.split(',');
      else filters.push(filterOf(k, v));
    });
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (method === 'GET') {
      let out = [...hit];
      if (order) { const [c, dir] = order.split(',')[0].split('.'); out.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (dir === 'desc' ? -1 : 1)); }
      return out.slice(offset, offset + limit).map((r) => ({ ...r }));
    }
    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      return list.map((b) => {
        const dup = conflict && rows.find((r) => conflict.every((c) => String(r[c]) === String(b[c])));
        if (dup) { if (table === 'wa_contacts') Object.assign(dup, b); return { ...dup }; }
        if (table === 'wa_contacts' && rows.some((r) => r.key === b.key)) throw Object.assign(new Error('409'), { status: 409 });
        const row = { ...(table === 'wa_contacts' ? { id: `new-${++n}`, created_at: `2026-11-10T12:00:0${n}Z`, chat_id: null, notes: null } : { created_at: '2026-11-10T12:00:00Z' }), ...b };
        rows.push(row); return { ...row };
      });
    }
    if (method === 'PATCH') {
      if (table === 'wa_contacts' && body.key && rows.some((r) => r.key === body.key && !hit.includes(r))) throw Object.assign(new Error('409 key'), { status: 409 });
      hit.forEach((r) => Object.assign(r, body)); return hit.map((r) => ({ ...r }));
    }
    if (method === 'DELETE') {
      T[table] = rows.filter((r) => !hit.includes(r));
      if (table === 'wa_contacts') {
        const gone = new Set(hit.map((r) => r.id));
        ['wa_contact_labels', 'wa_automation_enrollments'].forEach((t) => { T[t] = T[t].filter((r) => !gone.has(r.contact_id)); }); // on delete cascade
        ['wa_automation_runs', 'wa_sequence_runs', 'wa_campaign_targets'].forEach((t) => T[t].forEach((r) => { if (gone.has(r.contact_id)) r.contact_id = null; })); // set null
      }
      return [];
    }
    return [];
  };
  const calls = [];
  const fetch = async (url, init = {}) => {
    const p = decodeURIComponent(String(url).replace('https://x.supabase.co/rest/v1/', ''));
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: p, body });
    try {
      const out = handle(method, p, body);
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(out) };
    } catch (e) {
      return { ok: false, status: e.status || 400, headers: { get: () => null }, text: async () => JSON.stringify({ message: e.message }) };
    }
  };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Intl, URL, Promise, fetch, WA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } });
  vm.runInContext(src('rich-parts.js'), ctx, { filename: 'rich-parts.js' });
  vm.runInContext(src('supabase-api.js'), ctx, { filename: 'supabase-api.js' });
  // resultados como objetos deste processo (o vm usa outro Array/Object)
  const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const api = new Proxy(ctx.WaApi, { get: (t, k) => (typeof t[k] !== 'function' ? t[k] : (...a) => { const r = t[k](...a); return r && typeof r.then === 'function' ? r.then(plain) : plain(r); }) });
  return { api, T, calls };
}
// como o painel monta a identidade de uma conversa sem telefone visível (content.js makeIdentity, nome cortado em 100)
const byName = (title, extra = {}) => { const nm = title.trim().replace(/\s+/g, ' ').slice(0, 100); return { key: `nome:${nm.toLowerCase()}`, phone: null, name: nm, ...extra }; };

test('caso 1 (Ana Maria @lid): acha o contato antigo PELO chat_id, a etiqueta Cliente vai para ele e nenhum contato novo', async () => {
  const { api, T } = db({
    wa_contacts: [{ id: 'ana', key: 'tel:5521986611992', name: 'Ana Maria', phone: '5521986611992', chat_id: LID_ANA, notes: null, created_at: '2026-11-01T10:00:00Z' }],
    wa_contact_labels: [{ contact_id: 'ana', label_id: FU1, created_at: '2026-11-02T10:00:00Z' }],
  });
  const id = byName(ANA_AGENDA, { chatId: LID_ANA });
  const m = await api.contactLabelsMatch(id);
  assert.deepStrictEqual([m.by, m.ids], ['chat', [FU1]], 'reconhecido pela conversa, não "só pelo nome"');
  const after = await api.setContactLabel({ identity: id, labelId: CLI, on: true });
  assert.deepStrictEqual([...after].sort(), [FU1, CLI].sort());
  assert.strictEqual(T.wa_contacts.length, 1, 'não criou outro contato');
  assert.deepStrictEqual(T.wa_contact_labels.map((l) => l.contact_id), ['ana', 'ana']);
});

test('caso 1 sem o chat_id gravado: acha pelo telefone do @lid (cache do WhatsApp) e grava o chat_id nele', async () => {
  const { api, T } = db({ wa_contacts: [{ id: 'ana', key: 'tel:5521986611992', name: 'Ana Maria', phone: '5521986611992', chat_id: null, notes: null, created_at: '2026-11-01T10:00:00Z' }] });
  const id = byName(ANA_AGENDA, { chatId: LID_ANA, phone: '5521986611992' });
  assert.strictEqual((await api.contactLabelsMatch(id)).by, 'phone');
  await api.setContactLabel({ identity: id, labelId: CLI, on: true });
  assert.strictEqual(T.wa_contacts.length, 1);
  assert.strictEqual(T.wa_contacts[0].chat_id, LID_ANA);
  assert.strictEqual(T.wa_contacts[0].key, 'tel:5521986611992', 'o nome nunca vira a chave');
});

test('caso 2 (Alessandro, nome > 100): não recusa a identificação; acha pelo chat_id; nome cortado em 100', async () => {
  assert.ok(ALE_AGENDA.length > 100);
  const { api, T } = db({
    wa_contacts: [{ id: 'ale', key: 'tel:5521981659300', name: 'Alessandro', phone: '5521981659300', chat_id: LID_ALE, notes: null, created_at: '2026-11-01T10:00:00Z' }],
    wa_contact_labels: [{ contact_id: 'ale', label_id: FU1, created_at: '2026-11-02T10:00:00Z' }],
  });
  const m = await api.contactLabelsMatch(byName(ALE_AGENDA, { chatId: LID_ALE }));
  assert.deepStrictEqual([m.by, m.ids], ['chat', [FU1]]);
  // o corte em 100 pode cair num espaço: a chave com o espaço no fim também vale
  const raw = ALE_AGENDA.slice(0, 100);
  const sp = { key: `nome:${raw.toLowerCase()}`, phone: null, name: raw };
  assert.deepStrictEqual((await api.contactLabelsMatch({ ...sp, chatId: LID_ALE })).ids, [FU1]);
  assert.strictEqual(T.wa_contacts.length, 1);
});

test('nome com 150 letras e sem chat_id/telefone: aceita, corta em 100 ao salvar e ao comparar (sem duplicar)', async () => {
  const long = `Maria ${'x'.repeat(144)}`; assert.strictEqual(long.length, 150);
  const { api, T } = db({});
  const full = { key: `nome:${long.toLowerCase()}`, phone: null, name: long }; // chave/nome inteiros (sem o corte do painel)
  await api.setContactLabel({ identity: full, labelId: CLI, on: true });
  assert.strictEqual(T.wa_contacts.length, 1);
  assert.strictEqual(T.wa_contacts[0].name.length, 100);
  assert.strictEqual(T.wa_contacts[0].key, `nome:${long.slice(0, 100).toLowerCase()}`);
  await api.setContactLabel({ identity: byName(long), labelId: FU1, on: true }); // a mesma pessoa, cortada pelo painel
  assert.strictEqual(T.wa_contacts.length, 1, 'mesma chave cortada');
  assert.strictEqual((await api.contactLabelsMatch(full)).by, 'name');
  await assert.rejects(api.contactLabelsMatch({ key: 'nome:outra pessoa', phone: null, name: 'Maria' }), /Identificação inválida/);
});

test('ordem: chat_id → telefone → nome (chat_id de outra pessoa pelo telefone não vale)', async () => {
  const { api } = db({ wa_contacts: [
    { id: 'byname', key: 'nome:joão', name: 'João', phone: null, chat_id: null, created_at: '2026-11-01T09:00:00Z' },
    { id: 'byphone', key: 'tel:5521900000001', name: 'João S', phone: '5521900000001', chat_id: null, created_at: '2026-11-01T10:00:00Z' },
    { id: 'other', key: 'tel:5521900000009', name: 'Outro', phone: '5521900000009', chat_id: '5521900000001@c.us', created_at: '2026-11-01T11:00:00Z' },
  ] });
  // @c.us: o telefone sai do próprio chat_id; o contato com esse chat_id tem OUTRO telefone → não vale
  const r = await api.contactLabelsMatch(byName('João', { chatId: '5521900000001@c.us' }));
  assert.strictEqual(r.by, 'phone');
  assert.strictEqual((await api.contactLabelsMatch(byName('João'))).by, 'name');
});

test('junção: mesmo chat_id/telefone vão para o mais antigo (etiquetas sem duplicar, data mais antiga, nota, nome da agenda, percursos, inscrições)', async () => {
  const { api, T } = db({
    wa_contacts: [
      { id: 'ana', key: 'tel:5521986611992', name: 'Ana', phone: '5521986611992', chat_id: LID_ANA, notes: 'gosta de rosa', created_at: '2026-11-01T10:00:00Z' },
      { id: 'anaDup', key: `nome:${ANA_AGENDA.toLowerCase()}`, name: ANA_AGENDA, phone: null, chat_id: LID_ANA, notes: 'pagou no pix', created_at: '2026-11-10T10:00:00Z' },
      { id: 'b1', key: 'tel:5521977770000', name: 'Bruno', phone: '5521977770000', chat_id: '5521977770000@c.us', notes: null, created_at: '2026-11-03T10:00:00Z' },
      { id: 'b2', key: 'nome:bruno', name: 'Bruno', phone: null, chat_id: '5521977770000@c.us', notes: null, created_at: '2026-11-04T10:00:00Z' },
      { id: 'solo', key: 'tel:5521911112222', name: 'Sozinho', phone: '5521911112222', chat_id: null, notes: null, created_at: '2026-11-02T10:00:00Z' },
    ],
    wa_contact_labels: [
      { contact_id: 'ana', label_id: FU1, created_at: '2026-11-05T10:00:00Z' },
      { contact_id: 'anaDup', label_id: FU1, created_at: '2026-11-04T10:00:00Z' }, // mais antiga: vale esta data
      { contact_id: 'anaDup', label_id: CLI, created_at: '2026-11-10T10:00:00Z' },
      { contact_id: 'solo', label_id: CLI, created_at: '2026-11-02T10:00:00Z' },
    ],
    wa_automation_runs: [
      { id: 'r1', automation_id: 'A1', contact_id: 'anaDup', run_key: 'k1' },
      { id: 'r2', automation_id: 'A1', contact_id: 'ana', run_key: 'k2' },
      { id: 'r3', automation_id: 'A1', contact_id: 'anaDup', run_key: 'k2' }, // igual ao do mais antigo: não move
    ],
    wa_automation_enrollments: [
      { id: 'e1', automation_id: 'A2', contact_id: 'anaDup', removed_at: null },
      { id: 'e2', automation_id: 'A3', contact_id: 'ana', removed_at: null },
      { id: 'e3', automation_id: 'A3', contact_id: 'anaDup', removed_at: null }, // já inscrito: não duplica
    ],
    wa_sequence_runs: [{ id: 's1', contact_id: 'b2', chat_id: '5521977770000@c.us' }],
  });
  const soloBefore = JSON.stringify(T.wa_contacts.find((c) => c.id === 'solo'));
  const r = await api.mergeDuplicateContacts();
  assert.deepStrictEqual([r.merged, r.groups, r.errors.length], [2, 2, 0]);
  assert.deepStrictEqual(T.wa_contacts.map((c) => c.id).sort(), ['ana', 'b1', 'solo']);
  const ana = T.wa_contacts.find((c) => c.id === 'ana');
  assert.strictEqual(ana.name, ANA_AGENDA.slice(0, 100), 'nome da agenda');
  assert.strictEqual(ana.phone, '5521986611992'); assert.strictEqual(ana.key, 'tel:5521986611992'); assert.strictEqual(ana.chat_id, LID_ANA);
  assert.strictEqual(ana.notes, 'gosta de rosa\npagou no pix');
  const labs = T.wa_contact_labels.filter((l) => l.contact_id === 'ana');
  assert.deepStrictEqual(labs.map((l) => l.label_id).sort(), [FU1, CLI].sort(), 'etiquetas sem duplicar');
  assert.strictEqual(labs.find((l) => l.label_id === FU1).created_at, '2026-11-04T10:00:00Z', 'data de entrada mais antiga');
  assert.deepStrictEqual(T.wa_automation_runs.map((x) => [x.id, x.contact_id]), [['r1', 'ana'], ['r2', 'ana'], ['r3', null]]);
  assert.deepStrictEqual(T.wa_automation_enrollments.map((x) => [x.id, x.contact_id]).sort(), [['e1', 'ana'], ['e2', 'ana']]);
  assert.deepStrictEqual(T.wa_sequence_runs.map((x) => x.contact_id), ['b1']);
  assert.strictEqual(JSON.stringify(T.wa_contacts.find((c) => c.id === 'solo')), soloBefore, 'contato sem par não muda');
  assert.deepStrictEqual(T.wa_contact_labels.filter((l) => l.contact_id === 'solo').length, 1);
  // de novo: nada para juntar
  assert.strictEqual((await api.mergeDuplicateContacts()).merged, 0);
});

test('junção: o mais antigo sem telefone ganha o telefone do duplicado (e a chave tel:)', async () => {
  const { api, T } = db({ wa_contacts: [
    { id: 'old', key: 'nome:carla', name: 'Carla', phone: null, chat_id: '7700001@lid', notes: null, created_at: '2026-10-01T10:00:00Z' },
    { id: 'new', key: 'tel:5521955554444', name: 'Carla Souza', phone: '5521955554444', chat_id: '7700001@lid', notes: null, created_at: '2026-11-01T10:00:00Z' },
  ] });
  await api.mergeDuplicateContacts();
  assert.deepStrictEqual(T.wa_contacts.map((c) => [c.id, c.key, c.phone, c.name]), [['old', 'tel:5521955554444', '5521955554444', 'Carla']]);
});

test('agrupamento puro: chat_id OU telefone ligam (transitivo); sem par fica de fora', () => {
  const { api } = db({});
  const g = api.groupDuplicates([
    { id: 'a', phone: '5521900000001', chat_id: null, created_at: '2026-01-02' },
    { id: 'b', phone: null, chat_id: 'x@lid', created_at: '2026-01-01' },
    { id: 'c', phone: '5521900000001', chat_id: 'x@lid', created_at: '2026-01-03' },
    { id: 'd', phone: '5521900000002', chat_id: null, created_at: '2026-01-01' },
  ]);
  assert.strictEqual(g.length, 1);
  assert.deepStrictEqual([g[0].keep.id, g[0].dups.map((x) => x.id)], ['b', ['a', 'c']]);
});

test('content.js: manda chat_id e o telefone do @lid; "só pelo nome" só quando não achou pela conversa/telefone; Manutenção', () => {
  const c = src('content.js');
  assert.match(c, /call\('contactLabelsMatch', \{ identity: identityPayload\(identity\) \}\)/);
  assert.match(c, /waRequest\('chatPhone', \{ chatId \}/);
  assert.match(c, /state\.convMatch !== 'chat' && state\.convMatch !== 'phone'/);
  assert.match(c, /Juntar contatos duplicados/);
  assert.match(c, /setTimeout\(\(\) => runMergeDuplicates\(false\), 6000\)/);
  const bg = src('background.js');
  assert.match(bg, /contactLabelsMatch: \(m\) => WaApi\.contactLabelsMatch\(m\.identity\)/);
  assert.match(bg, /mergeDuplicateContacts: \(\) => WaApi\.mergeDuplicateContacts\(\)/);
  assert.strictEqual(JSON.parse(src('manifest.json')).version, '2.16.12');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} testes passaram`);
  if (failed) process.exitCode = 1;
})();
