// Testes da extensão 2.18.1 no ERP: nome da agenda (wa_contact_names) e telefone completo. node scripts/tests/waNames.test.ts
// - ordem do nome: agenda → CRM → perfil (~) → número; telefone completo formatado
// - índice pela conversa e pelo telefone (a mesma pessoa em @c.us e @lid); leitura sem a tabela = como antes
// - Rastreamento: o nome da agenda vem primeiro; só o perfil ganha "~"; Conversões: agenda primeiro
// - Automações: motivo "Saiu da etiqueta" no histórico
import assert from 'node:assert/strict';
import { agendaIndex, displayName, fullPhone, loadAgendaNames, nameSourceOf, type AgendaNameRow } from '../../src/lib/waNames.ts';
import { buildConversations, type TrackInput } from '../../src/lib/waTracking.ts';
import { conversionContact } from '../../src/lib/waConversions.ts';
import { OUTCOME_KEYS, outcomeText } from '../../src/lib/waAutomations.ts';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('ordem do nome: agenda → CRM → ~perfil → número', () => {
  const ph = fullPhone('5521987652818');
  assert.equal(displayName({ agenda: 'Motoboy João', crm: 'João Silva', profile: 'Jão', phoneLabel: ph }), 'Motoboy João');
  assert.equal(displayName({ agenda: null, crm: 'João Silva', profile: 'Jão', phoneLabel: ph }), 'João Silva');
  assert.equal(displayName({ agenda: '  ', crm: null, profile: 'Jão', phoneLabel: ph }), '~Jão');
  assert.equal(displayName({ agenda: '+55 21 98765-2818', crm: null, profile: null, phoneLabel: ph }), '(21) 98765-2818', 'número não é nome');
  assert.equal(displayName({ phoneLabel: '' }), 'Sem nome');
  assert.equal(nameSourceOf({ agenda: null, crm: null, profile: 'Jão' }), 'perfil');
});
test('telefone completo (nunca mascarado)', () => {
  assert.equal(fullPhone('5521987652818'), '(21) 98765-2818');
  assert.equal(fullPhone('21987652818'), '(21) 98765-2818');
  assert.equal(fullPhone('552132345678'), '(21) 3234-5678');
  assert.equal(fullPhone('447911123456'), '+447911123456');
  assert.equal(fullPhone(null), '');
});
test('índice: pela conversa e pelo telefone (@lid ↔ @c.us); agenda ganha do perfil', () => {
  const rows: AgendaNameRow[] = [
    { chat_id: '80685306003593@lid', phone: '5521987652818', agenda_name: null, profile_name: 'Jão' },
    { chat_id: '5521987652818@c.us', phone: '5521987652818', agenda_name: 'Motoboy João', profile_name: null },
  ];
  const idx = agendaIndex(rows);
  assert.deepEqual(idx.get('80685306003593@lid', null), { agenda: 'Motoboy João', profile: 'Jão' });
  assert.deepEqual(idx.get('80685306003593@lid', '21987652818'), { agenda: 'Motoboy João', profile: 'Jão' });
  assert.deepEqual(idx.get('5521911112222@c.us', null), { agenda: null, profile: null });
});
test('leitura: pela conversa e pelo telefone (com e sem 55); tabela ausente = nenhuma linha, sem erro', async () => {
  const asked: string[] = [];
  const db = [{ chat_id: '5521987652818@c.us', phone: '5521987652818', agenda_name: 'Motoboy João', profile_name: null }];
  const ok = { from: (t: string) => ({ select: () => ({ in: (c: string, v: string[]) => ({ limit: async () => { asked.push(`${t}.${c}=${v.join(',')}`); return { data: db.filter((r) => v.includes(String((r as Record<string, unknown>)[c]))), error: null }; } }) }) }) };
  const rows = await loadAgendaNames(ok, { chatIds: ['80685306003593@lid'], phones: ['21987652818'] });
  assert.deepEqual(rows.map((r) => r.agenda_name), ['Motoboy João']);
  assert.ok(asked.some((a) => a.includes('5521987652818')), 'procura também com o 55');
  const missing = { from: () => ({ select: () => ({ in: () => ({ limit: async () => ({ data: null, error: { message: 'relation "wa_contact_names" does not exist' } }) }) }) }) };
  assert.deepEqual(await loadAgendaNames(missing, { chatIds: ['1@c.us'] }), []);
});
test('Rastreamento: nome da agenda primeiro; sem agenda, os de antes; só o perfil → "~Perfil"; sem agenda (tabela) = igual antes', () => {
  const at = '2026-11-03T12:00:00.000Z';
  const base = (): TrackInput => ({
    leads: [{ chat_id: '5511911112222@c.us', phone: '5511911112222', first_message_at: at, origin: 'organico', ad_id: null, ad_title: null } as never,
      { chat_id: '777@lid', phone: '5511955556666', first_message_at: at, origin: 'organico', ad_id: null, ad_title: null } as never],
    attributions: [], sends: [], replies: [], sales: [], conversions: [],
    names: [{ chat_id: '5511911112222@c.us', name: 'Maria', source: 'aprendido' }],
  });
  const find = (inp: TrackInput, id: string) => buildConversations(inp).conversations.find((c) => c.chatIds.includes(id))!;
  let inp = base();
  assert.deepEqual([find(inp, '5511911112222@c.us').name, find(inp, '777@lid').name], ['Maria', '(11) 95555-6666'], 'sem a tabela: como antes');
  inp = { ...base(), agenda: [
    { chat_id: '5511911112222@c.us', phone: '5511911112222', agenda_name: 'Maria da Agenda', profile_name: 'Mari' },
    { chat_id: '777@lid', phone: '5511955556666', agenda_name: null, profile_name: 'Lu Perfil' },
  ] };
  const a = find(inp, '5511911112222@c.us');
  const l = find(inp, '777@lid');
  assert.deepEqual([a.name, a.nameSource], ['Maria da Agenda', 'agenda']);
  assert.deepEqual([l.name, l.nameSource], ['~Lu Perfil', 'perfil']);
  // pelo telefone: a linha gravada no @c.us vale para a conversa @lid da mesma pessoa
  inp = { ...base(), agenda: [{ chat_id: '5511955556666@c.us', phone: '5511955556666', agenda_name: 'Lu da Agenda', profile_name: null }] };
  assert.equal(find(inp, '777@lid').name, 'Lu da Agenda');
});
test('Conversões: nome da agenda primeiro (sem ela: o de antes)', () => {
  const src = { leadPhone: {}, attribution: {}, chatName: { '5511911112222@c.us': 'Maria' }, sales: {} };
  const r = { chat_id: '5511911112222@c.us', contact_name: null, sale_id: null };
  assert.equal(conversionContact(r, src).name, 'Maria');
  assert.equal(conversionContact(r, { ...src, agenda: { '5511911112222@c.us': 'Maria da Agenda' } }).name, 'Maria da Agenda');
});
test('Automações → Histórico: motivo "Saiu da etiqueta" (e no filtro)', () => {
  assert.equal(outcomeText('saiu_etiqueta'), 'Saiu da etiqueta');
  assert.ok(OUTCOME_KEYS.includes('saiu_etiqueta'));
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) {
    try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; }
  }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
