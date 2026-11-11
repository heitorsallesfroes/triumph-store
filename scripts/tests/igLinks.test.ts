// Testes do Instagram FASE 2 (links rastreáveis), sem dependências: node scripts/tests/igLinks.test.ts
// 1. src/lib/igLinks.ts: apelido/código, texto com o código, link do WhatsApp, código achado na mensagem,
//    validação do formulário, resultados por link/canal e "melhores links".
// 2. Edge function ig-link (supabase/functions/ig-link/link.ts): só link ativo, clique registrado com hash (nunca o
//    IP), mesmo IP em 30 s conta uma vez, sempre devolve um wa.me (mesmo com erro).
// 3. Rastreamento da página WhatsApp (src/lib/waTracking.ts): origem Instagram (orgânico) separada de Meta Ads e
//    Não rastreada; anúncio vale primeiro; vendas da conversa.
// 4. QR code (src/lib/qr.ts): Reed-Solomon e formato com os exemplos da norma; leitura de volta (decodificador
//    independente, com síndromes) de links de vários tamanhos.
import assert from 'node:assert/strict';
import {
  bestLinks, codeInText, linkResults, normalizeCode, prefilledText, publicUrl, slugify, suggestCode, summarizeUa, validateDraft, waUrl,
  type IgClick, type IgLink, type LinkConversation, type LinkDraft,
} from '../../src/lib/igLinks.ts';
import { open, summarizeUa as fnUa, prefilledText as fnText, waUrl as fnWa, type Deps } from '../../supabase/functions/ig-link/link.ts';
import { buildConversations, conversationsIn, originByDay, sourceText, trackSummary, type TrackInput } from '../../src/lib/waTracking.ts';
import { alignmentPositions, codewordsFor, formatBits, qrEncode, rsDivisor, rsRemainder, versionBits } from '../../src/lib/qr.ts';
import { decodeQr as decode } from './qrDecode.ts';

const tests: [string, () => unknown][] = [];
const test = (name: string, fn: () => unknown) => tests.push([name, fn]);
const sp = (s: string) => new Date(`${s}-03:00`).toISOString();

// ── 1. regras ──
test('apelido e código: slugify, código sugerido, normalizar', () => {
  assert.equal(slugify('Promo Black Friday!'), 'promo-black-friday');
  assert.equal(slugify('  Ação  Relâmpago -- '), 'acao-relampago');
  assert.equal(suggestCode('manychat-comentarios'), 'IG-MANYCHAT');
  assert.equal(suggestCode('stories'), 'IG-STORIES');
  assert.equal(suggestCode('reel-ultra-9'), 'IG-REEL-ULTRA-9');
  assert.equal(normalizeCode('[ig-bio]'), 'IG-BIO');
  assert.equal(normalizeCode('bio'), 'IG-BIO');
  assert.equal(normalizeCode('IG-'), null);
});

test('texto pré-preenchido com o código no fim e link wa.me da loja', () => {
  const t = prefilledText('Olá! Vim pelo Instagram 😊', 'IG-BIO');
  assert.equal(t, 'Olá! Vim pelo Instagram 😊 [IG-BIO]');
  assert.equal(waUrl(t), 'https://wa.me/5521980921808?text=Ol%C3%A1!%20Vim%20pelo%20Instagram%20%F0%9F%98%8A%20%5BIG-BIO%5D');
  assert.equal(publicUrl('bio'), 'https://triumph-store.vercel.app/l/bio');
  assert.equal(prefilledText('   ', 'IG-X1'), 'Olá! Vim pelo Instagram 😊 [IG-X1]');
  // a função ig-link monta igual
  assert.equal(fnWa(fnText('Olá! Vim pelo Instagram 😊', 'IG-BIO')), waUrl(t));
});

test('código achado na 1ª mensagem (com texto antes/depois, minúsculas, espaços)', () => {
  assert.equal(codeInText('Olá! Vim pelo Instagram 😊 [IG-BIO]'), 'IG-BIO');
  assert.equal(codeInText('oi [ ig-stories ] quero o relógio'), 'IG-STORIES');
  assert.equal(codeInText('IG-BIO sem colchetes'), null);
  assert.equal(codeInText('[IG-]'), null);
  assert.equal(codeInText(null), null);
});

const L = (id: string, slug: string, channel: IgLink['channel'], code: string): IgLink => ({ id, slug, channel, code, message: 'Olá! Vim pelo Instagram 😊', media_id: null, media_permalink: null, media_caption: null, note: null, active: true, created_at: sp('2026-11-01T10:00:00') });
const LINKS = [L('l1', 'bio', 'bio', 'IG-BIO'), L('l2', 'manychat-comentarios', 'comentarios', 'IG-COMENT'), L('l3', 'stories', 'stories', 'IG-STORIES'), L('l4', 'stories-promo', 'stories', 'IG-PROMO')];

test('validação do formulário: apelido/código únicos e no formato; post obrigatório para "Reel/post"', () => {
  const d: LinkDraft = { slug: 'bio', channel: 'bio', code: 'IG-BIO', message: 'Oi', media_id: null, media_permalink: null, media_caption: null, note: null, active: true };
  assert.deepEqual(validateDraft(d, LINKS, 'l1'), []);
  assert.equal(validateDraft(d, LINKS, null).length, 2);
  assert.match(validateDraft({ ...d, slug: 'Bio Nova' }, LINKS, 'l1')[0], /Apelido/);
  assert.match(validateDraft({ ...d, code: 'BIO' }, LINKS, 'l1')[0], /Código/);
  assert.match(validateDraft({ ...d, channel: 'post' }, LINKS, 'l1')[0], /escolha o post/);
  assert.match(validateDraft({ ...d, message: ' ' }, LINKS, 'l1')[0], /mensagem/);
});

test('resultados por link e por canal: cliques → conversas → vendas → R$, taxas e melhores links', () => {
  const w = { from: Date.parse(sp('2026-11-01T00:00:00')), to: Date.parse(sp('2026-11-07T23:59:59')) };
  const clicks: IgClick[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ link_id: 'l1', created_at: sp(`2026-11-0${1 + (i % 6)}T12:00:00`), device: 'Android', browser: 'Instagram' })),
    ...Array.from({ length: 4 }, () => ({ link_id: 'l3', created_at: sp('2026-11-03T12:00:00'), device: 'iPhone/iPad', browser: 'Instagram' })),
    { link_id: 'l4', created_at: sp('2026-11-03T12:00:00'), device: 'Android', browser: 'Instagram' },
    { link_id: 'l1', created_at: sp('2026-10-20T12:00:00'), device: 'Android', browser: 'Instagram' }, // fora
  ];
  const convs: LinkConversation[] = [
    { linkId: 'l1', code: 'IG-BIO', firstAt: Date.parse(sp('2026-11-02T13:00:00')), sales: 1, revenue: 1000 },
    { linkId: 'l1', code: 'IG-BIO', firstAt: Date.parse(sp('2026-11-03T13:00:00')), sales: 0, revenue: 0 },
    { linkId: null, code: 'IG-STORIES', firstAt: Date.parse(sp('2026-11-03T13:00:00')), sales: 2, revenue: 1500 }, // achado pelo código
    { linkId: 'l4', code: 'IG-PROMO', firstAt: Date.parse(sp('2026-11-04T13:00:00')), sales: 0, revenue: 0 },
    { linkId: null, code: 'IG-NAOEXISTE', firstAt: Date.parse(sp('2026-11-04T13:00:00')), sales: 1, revenue: 99 },
  ];
  const r = linkResults(LINKS, clicks, convs, w);
  const bio = r.links.find((x) => x.label === 'bio')!;
  assert.deepEqual([bio.clicks, bio.conversations, bio.buyers, bio.sales, bio.revenue], [10, 2, 1, 1, 1000]);
  assert.equal(bio.clickToConv, 0.2);
  assert.equal(bio.convToSale, 0.5);
  const st = r.links.find((x) => x.label === 'stories')!;
  assert.deepEqual([st.clicks, st.conversations, st.sales, st.revenue], [4, 1, 2, 1500]);
  const mc = r.links.find((x) => x.label === 'manychat-comentarios')!;
  assert.deepEqual([mc.clicks, mc.conversations, mc.clickToConv, mc.convToSale], [0, 0, null, null]);
  const ch = Object.fromEntries(r.channels.map((c) => [c.key, c]));
  assert.deepEqual([ch.stories.clicks, ch.stories.conversations, ch.stories.revenue], [5, 2, 1500]);
  assert.deepEqual(r.channels.map((c) => c.label), ['Bio', 'Comentários/ManyChat', 'Stories']);
  assert.deepEqual([r.total.clicks, r.total.conversations, r.total.sales, r.total.revenue], [15, 4, 3, 2500]);
  assert.deepEqual(bestLinks(r.links).map((x) => x.label), ['stories', 'bio', 'stories-promo']);
});

test('aparelho e navegador resumidos (iguais no ERP e na função)', () => {
  const ig = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0';
  const an = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  assert.deepEqual(summarizeUa(ig), { device: 'iPhone/iPad', browser: 'Instagram' });
  assert.deepEqual(summarizeUa(an), { device: 'Android', browser: 'Chrome' });
  assert.deepEqual(fnUa(ig), summarizeUa(ig));
  assert.deepEqual(fnUa(an), summarizeUa(an));
  assert.deepEqual(summarizeUa(''), { device: 'Outro', browser: 'Outro' });
});

// ── 2. edge function ig-link ──
function fakeDb(links: { id: string; slug: string; code: string; message: string; active: boolean }[], o: { failInsert?: boolean } = {}) {
  const clicks: { link_id: string; device: string; browser: string; ip_hash: string | null; at: number }[] = [];
  let now = Date.parse(sp('2026-11-11T10:00:00'));
  const deps: Deps = {
    findLink: async (slug) => links.find((l) => l.slug === slug) || null,
    recentClick: async (id, h, since) => clicks.some((c) => c.link_id === id && c.ip_hash === h && c.at >= Date.parse(since)),
    insertClick: async (row) => { if (o.failInsert) throw new Error('banco fora'); clicks.push({ ...row, at: now }); },
    hmac: async (t) => [...new TextEncoder().encode(`k|${t}`)].reduce((h, b) => ((h * 31 + b) >>> 0), 7).toString(16).padStart(8, '0').repeat(8),
    now: () => now,
  };
  return { deps, clicks, tick: (ms: number) => { now += ms; } };
}
const H = (ip: string, ua = 'Mozilla/5.0 (Linux; Android 14) Instagram 300') => ({ get: (k: string) => ({ 'x-forwarded-for': `${ip}, 10.0.0.1`, 'user-agent': ua } as Record<string, string>)[k] || null });

test('ig-link: link ativo → wa.me com o código, clique com hash (sem o IP); 30 s = 1 clique; depois conta de novo', async () => {
  const db = fakeDb([{ id: 'l1', slug: 'bio', code: 'IG-BIO', message: 'Olá! Vim pelo Instagram 😊', active: true }]);
  const r = await open({ slug: 'BIO' }, H('200.150.1.2'), db.deps);
  assert.equal(r.status, 200);
  assert.equal(r.json.url, waUrl('Olá! Vim pelo Instagram 😊 [IG-BIO]'));
  assert.equal(db.clicks.length, 1);
  assert.deepEqual([db.clicks[0].device, db.clicks[0].browser], ['Android', 'Instagram']);
  assert.match(String(db.clicks[0].ip_hash), /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(db.clicks).includes('200.150'), 'o IP não é guardado');
  await open({ slug: 'bio' }, H('200.150.1.2'), db.deps);
  assert.equal(db.clicks.length, 1, 'mesmo IP em menos de 30 s: um clique só');
  await open({ slug: 'bio' }, H('177.1.1.1'), db.deps);
  db.tick(31000);
  await open({ slug: 'bio' }, H('200.150.1.2'), db.deps);
  assert.equal(db.clicks.length, 3);
});

test('ig-link: apelido inválido, link desligado/inexistente ou banco fora → ainda leva ao WhatsApp', async () => {
  const db = fakeDb([{ id: 'l9', slug: 'velho', code: 'IG-VELHO', message: 'Oi', active: false }]);
  for (const slug of ['../x', 'velho', 'nao-existe']) {
    const r = await open({ slug }, H('1.2.3.4'), db.deps);
    assert.ok(r.status >= 400, slug);
    assert.match(String(r.json.url), /^https:\/\/wa\.me\/5521980921808\?text=/);
  }
  assert.equal(db.clicks.length, 0);
  const down = fakeDb([{ id: 'l1', slug: 'bio', code: 'IG-BIO', message: 'Oi', active: true }], { failInsert: true });
  const r = await open({ slug: 'bio' }, H('1.2.3.4'), down.deps);
  assert.equal(r.status, 200);
  assert.equal(r.json.counted, false);
  assert.match(String(r.json.url), /%5BIG-BIO%5D$/);
});

// ── 3. Rastreamento: origem Instagram ──
test('Rastreamento: Instagram (orgânico) separado de Meta Ads e Não rastreada; anúncio vale primeiro; vendas da conversa', () => {
  const input: TrackInput = {
    leads: [
      { chat_id: '5521900000001@c.us', phone: '5521900000001', first_message_at: sp('2026-11-03T10:00:00'), origin: 'organico', ad_id: null, ad_title: null },
      { chat_id: '5521900000002@c.us', phone: '5521900000002', first_message_at: sp('2026-11-03T11:00:00'), origin: 'anuncio', ad_id: '1', ad_title: 'Relógio A' },
      { chat_id: '5521900000003@c.us', phone: '5521900000003', first_message_at: sp('2026-11-03T12:00:00'), origin: 'organico', ad_id: null, ad_title: null },
      { chat_id: '80685306003593@lid', phone: '5521900000004', first_message_at: sp('2026-11-04T12:00:00'), origin: 'organico', ad_id: null, ad_title: null },
    ],
    attributions: [], sends: [], replies: [], names: [], conversions: [],
    sales: [{ id: 'v1', sale_date: '2026-11-05T15:00:00-03:00', created_at: sp('2026-11-05T15:00:00'), total_sale_price: 1200, customer_phone: '21900000001', customer_name: 'Ana', wa_chat_id: '5521900000001@c.us', origin: null } as never],
    igLeads: [
      { chat_id: '5521900000001@c.us', phone: '5521900000001', first_message_at: sp('2026-11-03T10:00:00'), code: 'IG-BIO', link_id: 'l1', channel: 'bio', slug: 'bio' },
      { chat_id: '5521900000002@c.us', phone: '5521900000002', first_message_at: sp('2026-11-03T11:00:00'), code: 'IG-STORIES', link_id: 'l3', channel: 'stories', slug: 'stories' }, // também anúncio
      { chat_id: '80685306003593@lid', phone: '5521900000004', first_message_at: sp('2026-11-04T12:00:00'), code: 'IG-COMENT', link_id: null, channel: 'comentarios', slug: 'manychat-comentarios' },
    ],
  };
  const model = buildConversations(input);
  const r = { from: Date.parse(sp('2026-11-01T00:00:00')), to: Date.parse(sp('2026-11-07T23:59:59')), fromDay: '2026-11-01', toDay: '2026-11-07', days: 7 };
  const all = conversationsIn(model, r, 'todas');
  const by = (p: string) => all.find((c) => c.phone === p)!;
  assert.equal(sourceText(by('5521900000001')), 'Instagram (orgânico) · Bio · bio');
  assert.equal(by('5521900000001').revenue, 1200);
  assert.equal(sourceText(by('5521900000002')), 'Meta Ads', 'anúncio vale primeiro');
  assert.equal(sourceText(by('5521900000003')), 'Não rastreada');
  assert.equal(sourceText(by('5521900000004')), 'Instagram (orgânico) · Comentários/ManyChat · manychat-comentarios', '@lid pelo telefone');
  assert.deepEqual(conversationsIn(model, r, 'instagram').map((c) => c.phone).sort(), ['5521900000001', '5521900000004']);
  assert.deepEqual(conversationsIn(model, r, 'nao_rastreada').map((c) => c.phone), ['5521900000003']);
  const s = trackSummary(all);
  assert.deepEqual([s.total, s.ad, s.ig, s.untracked, s.activeAd, s.activeIg, s.activeUntracked, s.leadsIg], [4, 1, 2, 1, 1, 2, 1, 2]);
  const d = originByDay(all, r).find((x) => x.day === '2026-11-03')!;
  assert.deepEqual([d.anuncio, d.instagram, d.nao_rastreada], [1, 1, 1]);
});

// ── 4. QR ──
test('QR: Reed-Solomon e bits de formato/versão iguais aos exemplos da norma', () => {
  // "HELLO WORLD" 1-M (exemplo clássico): 16 códigos de dados → 10 de correção
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsRemainder(data, rsDivisor(10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  assert.equal(formatBits(0).toString(2).padStart(15, '0'), '101010000010010'); // M, máscara 0
  assert.equal(formatBits(2).toString(2).padStart(15, '0'), '101111001111100'); // M, máscara 2
  assert.equal(versionBits(7).toString(2).padStart(18, '0'), '000111110010010100');
  const TABLE: Record<number, number[]> = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46] };
  Object.entries(TABLE).forEach(([v, pos]) => assert.deepEqual(alignmentPositions(Number(v)), pos, `versão ${v}`));
  assert.equal(codewordsFor([1, 2, 3], 1).length, 26);
});

test('QR: lê de volta links de vários tamanhos (versões 1 a 9), com a máscara escolhida', () => {
  const texts = ['IG', 'https://triumph-store.vercel.app/l/bio', 'https://triumph-store.vercel.app/l/manychat-comentarios', `https://triumph-store.vercel.app/l/${'a'.repeat(38)}?x=Olá😊`, 'x'.repeat(170)];
  const seen = new Set<number>();
  texts.forEach((t) => { const q = qrEncode(t); seen.add(q.version); assert.equal(decode(q), t, t.slice(0, 30)); });
  assert.ok(seen.size >= 4, [...seen].join());
  assert.equal(qrEncode('https://triumph-store.vercel.app/l/bio').size, 29); // versão 3
  assert.throws(() => qrEncode('x'.repeat(400)));
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
}
console.log(`\n${tests.length - fail}/${tests.length} ok`);
if (fail) process.exitCode = 1;
