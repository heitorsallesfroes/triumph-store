// 2.18.3 — links rastreáveis do Instagram SEM o código visível: a FRASE do link liga a conversa.
//   node scripts/tests/igPhrase.test.ts
// - a regra (src/lib/igLinks.ts): normalização, frase com pequenas edições/texto a mais, empate, frase curta
// - frases parecidas demais (validação do formulário) e as 3 frases iniciais
// - a ponte da extensão (extension/wa-bridge.js, bloco "igMatch") dá o MESMO resultado que o ERP (casos + sorteio)
// - resultados por link: conversas ligadas por frase / horário / código
// - migration 20261117120000 (idempotente, não apaga) e a página /l/ (sem código nem emoji na frase padrão)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  DEFAULT_MESSAGE, PHRASE_MIN, hasEmoji, linkResults, matchOf, matchPhrase, normPhrase, phraseDistance, phrasesTooSimilar, validateDraft,
  type IgLink, type LinkConversation, type LinkDraft,
} from '../../src/lib/igLinks.ts';

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const BIO = 'Olá! Vi o perfil de vocês no Instagram e quero saber mais';
const STORIES = 'Oi! Vi o story de vocês e fiquei interessado(a)';
const COMENT = 'Olá! Comentei no post de vocês e quero saber mais';
const AUTO = 'Olá! Vi o comentário no Instagram e quero saber da promoção 🔥';
const DIRECT = 'Olá! Vim pelo Direct do Instagram e quero atendimento 😊';
const ALL = [BIO, STORIES, COMENT, AUTO, DIRECT];

test('normalização: sem acento, maiúscula, pontuação, emoji nem espaço a mais', () => {
  assert.equal(normPhrase('  OLÁ!!  Vi o story 😊 de   vocês… (a) '), 'ola vi o story de voces a');
  assert.equal(normPhrase('Olá � tudo'), 'ola tudo');
  assert.equal(normPhrase(null), '');
});
test('reconhece a frase igual, com pequenas edições ou com texto a mais; não reconhece outra mensagem', () => {
  const ok: [string, string][] = [
    [BIO, BIO], ['ola vi o perfil de voces no instagram e quero saber mais', BIO], ['Olá! Vi o perfil de vcs no Insta e quero saber mais', BIO],
    ['Olá! Vi o perfil de vocês no Instagram e quero saber mais 😊', BIO], ['Bom dia. Olá! Vi o perfil de vocês no Instagram e quero saber mais do iPhone 15', BIO],
    ['oi vi o story de vcs e fiquei interessada', STORIES], ['Olá! Comentei no post de vocês e quero saber mais!!!', COMENT],
    ['Olá! Vi o comentário no Instagram e quero saber da promoção �', AUTO], ['ola vim pelo direct do instagram e quero atendimento', DIRECT],
  ];
  for (const [msg, want] of ok) assert.equal(matchPhrase(msg, ALL), ALL.indexOf(want), msg);
  for (const msg of ['Oi', 'Quanto custa o iPhone 15 Pro?', 'Olá! Vi o Instagram de vocês', 'quero saber mais', 'Olá! Vi o story', '']) assert.equal(matchPhrase(msg, ALL), -1, msg);
});
test('empate entre duas frases → nenhuma; frase curta demais não entra; distância conta só o pedaço que bate', () => {
  assert.equal(matchPhrase('Quero saber do iPhone 15 Pro Maz', ['Quero saber do iPhone 15 Pro Max', 'Quero saber do iPhone 15 Pro Mac']), -1);
  assert.equal(matchPhrase('Quero saber do iPhone 15 Pro Max', ['Quero saber do iPhone 15 Pro Max', 'Quero saber do iPhone 15 Pro Mac']), 0, 'a igual ganha');
  assert.equal(matchPhrase('Oi tudo bem', ['Oi tudo']), -1, `frase com menos de ${PHRASE_MIN} letras não liga`);
  assert.equal(phraseDistance('abc', 'xxabcxx'), 0);
  assert.equal(phraseDistance('abc', 'xxabdxx'), 1);
  assert.equal(phraseDistance('abcd', ''), 4);
});
test('frases parecidas demais × diferentes; as 3 frases iniciais e as das automações não se confundem', () => {
  assert.ok(phrasesTooSimilar(BIO, BIO));
  assert.ok(phrasesTooSimilar(BIO, 'ola vi o perfil de vcs no instagram e quero saber mais!'));
  assert.ok(phrasesTooSimilar('Olá! Vi o Instagram de vocês e quero saber mais', 'Olá! Vim pelo Instagram 😊'), 'a antiga dentro da nova (quase)');
  for (let i = 0; i < ALL.length; i++) for (let j = i + 1; j < ALL.length; j++) assert.ok(!phrasesTooSimilar(ALL[i], ALL[j]), `${ALL[i]} × ${ALL[j]}`);
  assert.ok(!hasEmoji(BIO) && !hasEmoji(STORIES) && !hasEmoji(COMENT) && !hasEmoji(DEFAULT_MESSAGE));
  assert.ok(hasEmoji('Oi 😊') && hasEmoji('Oi 🔥'));
});
const L = (id: string, slug: string, code: string, message: string, active = true): IgLink => ({ id, slug, channel: 'bio', code, message, media_id: null, media_permalink: null, media_caption: null, note: null, active, created_at: '2026-11-01T13:00:00.000Z' });
const LINKS = [L('l1', 'bio', 'IG-BIO', BIO), L('l2', 'stories', 'IG-STORIES', STORIES), L('l3', 'velho', 'IG-VELHO', 'Olá! Vi o reel de vocês e quero saber mais', false)];
test('formulário: frase única entre os links ATIVOS (link desligado não conta; desligar libera)', () => {
  const d: LinkDraft = { slug: 'nova', channel: 'outro', code: 'IG-NOVA', message: 'ola vi o perfil de vcs no instagram e quero saber mais', media_id: null, media_permalink: null, media_caption: null, note: null, active: true };
  assert.match(validateDraft(d, LINKS).join(' '), /parecida demais com a do link "bio"/);
  assert.deepEqual(validateDraft({ ...d, active: false }, LINKS), [], 'link desligado pode repetir');
  assert.deepEqual(validateDraft({ ...d, message: 'Olá! Vi o reel de vocês e quero saber mais' }, LINKS), [], 'igual à de um link desligado: pode');
  assert.deepEqual(validateDraft({ ...d, slug: 'bio', code: 'IG-BIO', message: BIO }, LINKS, 'l1'), [], 'o próprio link não conta');
});

// ── a ponte da extensão: o bloco "igMatch" de wa-bridge.js dá o MESMO resultado ──
const bridgeSrc = fs.readFileSync(new URL('../../extension/wa-bridge.js', import.meta.url), 'utf8');
const block = bridgeSrc.slice(bridgeSrc.indexOf('// ── igMatch: início'), bridgeSrc.indexOf('// ── igMatch: fim'));
const ext = vm.runInNewContext(`${block}\n;({ igNorm, igDistance, igMatchPhrase, igTolerance })`) as { igNorm: (s: string) => string; igDistance: (p: string, t: string) => number; igMatchPhrase: (t: string, p: string[]) => number };
test('a ponte da extensão usa a MESMA regra (casos fixos + 400 mensagens sorteadas com edições)', () => {
  assert.ok(block.length > 500, 'achei o bloco igMatch na ponte');
  const cases = ['Olá! Vi o perfil de vcs no Insta e quero saber mais', 'Oi', 'Olá! Vi o story', 'Quero saber do iPhone 15 Pro Maz', STORIES.toUpperCase(), `${AUTO} �`];
  for (const c of cases) { assert.equal(ext.igNorm(c), normPhrase(c)); assert.equal(ext.igMatchPhrase(c, ALL), matchPhrase(c, ALL), c); }
  let seed = 7;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  const letters = 'abcdefghijklmnopqrstuvwxyz áéç!?😊';
  for (let k = 0; k < 400; k++) {
    let s = ALL[rnd(ALL.length)];
    for (let e = rnd(12); e > 0; e--) { const i = rnd(s.length + 1); const op = rnd(3); s = op === 0 ? s.slice(0, i) + s.slice(i + 1) : op === 1 ? s.slice(0, i) + letters[rnd(letters.length)] + s.slice(i) : s.slice(0, i) + letters[rnd(letters.length)] + s.slice(i + 1); }
    if (rnd(3) === 0) s = `Bom dia! ${s} quero o modelo preto`;
    assert.equal(ext.igMatchPhrase(s, ALL), matchPhrase(s, ALL), s);
    assert.equal(ext.igDistance(normPhrase(ALL[0]), normPhrase(s)), phraseDistance(normPhrase(ALL[0]), normPhrase(s)));
  }
});

test('resultados por link: conversas ligadas por frase / horário / código (linha antiga sem o campo = código)', () => {
  const at = Date.parse('2026-11-05T15:00:00.000Z');
  const convs: LinkConversation[] = [
    { linkId: 'l1', code: 'IG-BIO', firstAt: at, sales: 1, revenue: 100, match: 'frase' }, { linkId: 'l1', code: 'IG-BIO', firstAt: at, sales: 0, revenue: 0, match: 'frase' },
    { linkId: 'l1', code: 'IG-BIO', firstAt: at, sales: 0, revenue: 0, match: 'horario' }, { linkId: null, code: 'IG-BIO', firstAt: at, sales: 0, revenue: 0 },
    { linkId: 'l2', code: 'IG-STORIES', firstAt: at, sales: 0, revenue: 0, match: 'codigo' },
  ];
  const r = linkResults(LINKS, [], convs, { from: at - 1000, to: at + 1000 });
  const bio = r.links.find((x) => x.key === 'l1')!;
  assert.deepEqual([bio.conversations, bio.byMatch], [4, { frase: 2, horario: 1, codigo: 1 }]);
  assert.deepEqual(r.total.byMatch, { frase: 2, horario: 1, codigo: 2 });
  assert.deepEqual(r.channels[0].byMatch, { frase: 2, horario: 1, codigo: 2 });
  assert.deepEqual([matchOf('frase'), matchOf('horario'), matchOf(null), matchOf('x')], ['frase', 'horario', 'codigo', 'codigo']);
});

test('migration 20261117120000: idempotente, não apaga, as 3 frases novas só onde ainda é a antiga', () => {
  const sql = fs.readFileSync(new URL('../../supabase/migrations/20261117120000_ig_link_phrases.sql', import.meta.url), 'utf8');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.ok(!/\b(delete|drop\s+table|truncate)\b/i.test(code), 'nada apagado');
  assert.match(code, /add column if not exists match/);
  assert.match(code, /if not exists \(select 1 from pg_constraint where conname = 'ig_link_leads_match_check'\)/);
  assert.match(code, /where match is null/);
  for (const [slug, phrase] of [['bio', BIO], ['stories', STORIES], ['manychat-comentarios', COMENT]]) {
    assert.ok(code.includes(`set message = '${phrase}'`) && code.includes(`where slug = '${slug}' and message = 'Olá! Vim pelo Instagram 😊'`), slug);
  }
  assert.ok(code.includes(`set default '${DEFAULT_MESSAGE}'`));
});
test('página /l/ e função ig-link: frase padrão sem código e sem emoji', () => {
  const html = fs.readFileSync(new URL('../../public/l/index.html', import.meta.url), 'utf8');
  const href = /id="go" href="([^"]+)"/.exec(html)![1];
  assert.equal(decodeURIComponent(href.split('text=')[1]), DEFAULT_MESSAGE);
  const fn = fs.readFileSync(new URL('../../supabase/functions/ig-link/link.ts', import.meta.url), 'utf8');
  assert.ok(fn.includes(`DEFAULT_MESSAGE = '${DEFAULT_MESSAGE}'`));
  assert.ok(!/\[\$\{code\}\]|\[\$\{link\.code\}\]/.test(fn), 'o código não vai mais na mensagem');
});

let ok = 0;
for (const [n, f] of tests) { try { f(); ok++; console.log(`ok   ${n}`); } catch (e) { console.log(`FAIL ${n}\n     ${(e as Error).message.split('\n').slice(0, 8).join('\n     ')}`); process.exitCode = 1; } }
console.log(`\n${ok}/${tests.length} testes passaram`);
