// Instagram FASE 3 — contas da tela do ERP (src/lib/igAuto.ts). node scripts/tests/igAutoErp.test.ts
import assert from 'node:assert/strict';
import { automationMetrics, blankAutomation, funnelOf, hasText, matchWhatsapp, suggestAutoCode, validateAutomation, whenText, windowLeft, type Automation, type IgRun } from '../../src/lib/igAuto.ts';

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const T = Date.parse('2026-11-12T15:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const H = 3600000;
const auto = (o: Partial<Automation> = {}): Automation => ({ id: 'a1', ...blankAutomation(0, []), code: 'IG-A-COMENT', ...o } as Automation);
const run = (o: Partial<IgRun>): IgRun => ({ automation_id: 'a1', source_kind: 'comentario', status: 'enviado', reason: null, public_reply: true, dm_sent: true, dm_fallback: false, test: false, created_at: iso(T), igsid: '6600000000000001', ...o });

test('"✅ foi para o WhatsApp": mesmo código, até 3 h depois do envio; a conversa do WhatsApp liga uma pessoa só', () => {
  const convs = [
    { igsid: '1', wa_code: 'IG-A-COMENT', wa_sent_at: iso(T) },
    { igsid: '2', wa_code: 'IG-A-COMENT', wa_sent_at: iso(T + 10 * 60000) },
    { igsid: '3', wa_code: 'IG-DIRECT', wa_sent_at: iso(T) },
    { igsid: '4', wa_code: 'IG-A-COMENT', wa_sent_at: iso(T - 5 * H) },
    { igsid: '5', wa_code: null, wa_sent_at: null },
  ];
  const leads = [
    { chat_id: 'w1', code: 'IG-A-COMENT', first_message_at: iso(T + 12 * 60000) }, // vai para o 2 (o envio mais recente antes)
    { chat_id: 'w2', code: 'IG-A-COMENT', first_message_at: iso(T + 15 * 60000) }, // vai para o 1
    { chat_id: 'w3', code: 'IG-A-COMENT', first_message_at: iso(T + 20 * 60000) }, // ninguém sobrou (o 4 é de mais de 3 h)
    { chat_id: 'w4', code: 'IG-BIO', first_message_at: iso(T + 60000) },
  ];
  const m = matchWhatsapp(convs, leads);
  assert.deepEqual([...m.entries()].map(([k, v]) => [k, v.chat_id]).sort(), [['1', 'w2'], ['2', 'w1']]);
});
test('métricas: disparos, DMs, públicas, cliques (só link), conversas e vendas pelo código, CTR', () => {
  const runs = [run({}), run({ status: 'parcial', dm_sent: false }), run({ status: 'pulado', dm_sent: false, public_reply: false, test: true }), run({ status: 'falhou', dm_sent: false, public_reply: false }), run({ automation_id: 'outra' })];
  const convs = [{ code: 'IG-A-COMENT', firstAt: T, sales: 1, revenue: 499.9 }, { code: 'IG-A-COMENT', firstAt: T, sales: 0, revenue: 0 }, { code: 'IG-BIO', firstAt: T, sales: 1, revenue: 300 }];
  const m = automationMetrics(auto(), runs, new Map(), convs, null);
  assert.deepEqual([m.triggers, m.dms, m.publics, m.skipped, m.failed, m.tests, m.clicks, m.conversations, m.sales, m.revenue, m.ctr, m.convRate], [2, 1, 2, 1, 1, 1, null, 2, 1, 499.9, null, 2]);
  const l = automationMetrics(auto({ link_mode: 'link', link_id: 'L1' }), runs, new Map([['L1', 4]]), convs, 'IG-BIO');
  assert.deepEqual([l.clicks, l.ctr, l.conversations, l.revenue], [4, 4, 1, 300]);
});
test('funil do período', () => {
  const f = funnelOf({ comments: 30, dmsIn: 10, runs: [run({}), run({ dm_sent: false })], clicks: 7, convs: [{ code: 'x', firstAt: T, sales: 2, revenue: 1000 }, { code: 'y', firstAt: T, sales: 0, revenue: 0 }] });
  assert.deepEqual(f, { received: 40, comments: 30, dmsIn: 10, autoDms: 1, clicks: 7, conversations: 2, buyers: 1, sales: 2, revenue: 1000 });
});
test('textos do cartão, código sugerido, janela de 24 h e a automação nova (desligada, válida)', () => {
  assert.equal(whenText(auto()), 'Alguém comenta em qualquer post ou reel');
  assert.equal(whenText(auto({ media_scope: 'escolhidos', media_ids: ['1', '2'] })), 'Alguém comenta em 2 posts escolhidos');
  assert.equal(hasText(auto()), 'Qualquer palavra');
  assert.equal(hasText(auto({ keyword_mode: 'palavras', keywords: ['quero', ' preço '] })), '“quero”, “preço”');
  assert.equal(suggestAutoCode('Comentários → WhatsApp (cópia do ManyChat)'), 'IG-A-COMENTARIOS');
  assert.equal(suggestAutoCode('Story', ['IG-A-STORY']), 'IG-A-STORY-2');
  assert.equal(windowLeft({ last_customer_at: iso(T - 23 * H) }, T), H);
  assert.equal(windowLeft({ last_customer_at: iso(T - 25 * H) }, T), 0);
  assert.equal(windowLeft({ last_customer_at: null }, T), null);
  const b = blankAutomation(3, ['IG-A-NOVA']);
  assert.equal(b.active, false);
  assert.equal(b.code, 'IG-A-NOVA-2');
  assert.deepEqual(validateAutomation({ ...b, id: 'x' } as Automation), []);
});

let ok = 0;
for (const [n, f] of tests) { try { f(); ok++; console.log(`ok   ${n}`); } catch (e) { console.log(`FAIL ${n}\n     ${(e as Error).message.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; } }
console.log(`\n${ok}/${tests.length} testes passaram`);
