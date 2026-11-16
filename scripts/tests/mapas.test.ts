// Testes das regras dos mapas mentais (Gestão › Anotações › Pensamentos, src/lib/mapas.ts), sem banco.
// Sem dependências: node scripts/tests/mapas.test.ts
// - árvore: filho, irmão, apagar com o que tem embaixo, cores por ramo, lados equilibrados
// - mover nó: muda de pai, não entra em si mesmo, vira/deixa de ser ramo principal
// - layout: nenhuma ideia por cima da outra (árvores aleatórias), recolher esconde, filhos à frente do pai
// - navegação por setas, exportar lista com recuo, ler dados ruins do banco, duplicar
import assert from 'node:assert/strict';
import {
  PALETA, addChild, addSibling, alternarRecolher, caminho, contarIdeias, corDe, duplicarDados, ehAncestral, ideiaNoPonto, layout,
  moveNode, normalizar, novoMapa, paraTexto, quebrarLinhas, removeNode, setNode, sobrepoe, subarvore, vizinho,
  type MapaDados,
} from '../../src/lib/mapas.ts';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const gidFactory = () => { let i = 0; return () => `n${++i}`; };

// central "C" com A (dir), B (esq), A1, A2 dentro de A e A1a dentro de A1
function exemplo(): { m: MapaDados; ids: Record<string, string> } {
  const g = gidFactory();
  let m = novoMapa('C', g);
  const ids: Record<string, string> = { C: m.root };
  const add = (nome: string, pai: string) => { const r = addChild(m, ids[pai], nome, g); m = r.mapa; ids[nome] = r.id; };
  add('A', 'C'); add('B', 'C'); add('A1', 'A'); add('A2', 'A'); add('A1a', 'A1');
  return { m, ids };
}

test('árvore: filho, irmão e cores por ramo (filhos herdam)', () => {
  const { m, ids } = exemplo();
  assert.equal(contarIdeias(m), 6);
  assert.deepEqual(m.nodes[ids.C].children, [ids.A, ids.B]);
  assert.deepEqual(m.nodes[ids.A].children, [ids.A1, ids.A2]);
  assert.equal(m.nodes[ids.A1a].parent, ids.A1);
  assert.equal(m.nodes[ids.A].side, 'R');
  assert.equal(m.nodes[ids.B].side, 'L', 'segundo ramo vai para o lado com menos ideias');
  assert.notEqual(corDe(m, ids.A), corDe(m, ids.B), 'ramos principais com cores diferentes');
  assert.equal(corDe(m, ids.A1a), corDe(m, ids.A), 'neto herda a cor do ramo');
  assert.equal(corDe(m, ids.C), null);
  // cor escolhida vale para a ideia e o que estiver embaixo
  const m2 = setNode(m, ids.A1, { cor: '#000000' });
  assert.equal(corDe(m2, ids.A1a), '#000000');
  assert.equal(corDe(m2, ids.A2), corDe(m, ids.A));
  // texto vazio continua texto (enquanto digita); outros campos vazios somem
  const m3 = setNode(m, ids.A2, { text: '', icon: '⭐', note: '' });
  assert.equal(m3.nodes[ids.A2].text, '');
  assert.equal(m3.nodes[ids.A2].icon, '⭐');
  assert.ok(!('note' in m3.nodes[ids.A2]));
  assert.ok(!('icon' in setNode(m3, ids.A2, { icon: undefined }).nodes[ids.A2]));
  // irmão entra logo depois
  const s = addSibling(m, ids.A1, 'A1.5', gidFactory());
  assert.deepEqual(s.mapa.nodes[ids.A].children, [ids.A1, s.id, ids.A2]);
  // irmão da central = filho da central
  const s2 = addSibling(m, ids.C, 'D', () => 'zz');
  assert.equal(s2.mapa.nodes.zz.parent, ids.C);
  // irmão de ramo principal fica do mesmo lado
  const s3 = addSibling(m, ids.B, 'B2', () => 'b2');
  assert.equal(s3.mapa.nodes.b2.side, 'L');
  // original intacto (histórico)
  assert.equal(m.nodes[ids.A].children.length, 2);
});

test('árvore: apagar leva junto o que está embaixo; central não apaga', () => {
  const { m, ids } = exemplo();
  const m2 = removeNode(m, ids.A1);
  assert.equal(contarIdeias(m2), 4);
  assert.ok(!m2.nodes[ids.A1] && !m2.nodes[ids.A1a]);
  assert.deepEqual(m2.nodes[ids.A].children, [ids.A2]);
  assert.equal(removeNode(m, ids.C), m);
  assert.deepEqual(subarvore(m, ids.A).sort(), [ids.A, ids.A1, ids.A1a, ids.A2].sort());
  assert.ok(m.nodes[ids.A1a], 'original intacto para desfazer');
});

test('mover nó: muda de pai, mas não para dentro de si mesmo nem a central', () => {
  const { m, ids } = exemplo();
  const m2 = moveNode(m, ids.A1, ids.B);
  assert.equal(m2.nodes[ids.A1].parent, ids.B);
  assert.deepEqual(m2.nodes[ids.A].children, [ids.A2]);
  assert.deepEqual(m2.nodes[ids.B].children, [ids.A1]);
  assert.equal(corDe(m2, ids.A1a), corDe(m, ids.B), 'passa a herdar a cor do novo ramo');
  assert.equal(moveNode(m, ids.A, ids.A1a), m, 'não entra no próprio neto');
  assert.equal(moveNode(m, ids.A, ids.A), m, 'não entra em si mesmo');
  assert.equal(moveNode(m, ids.C, ids.A), m, 'central não se move');
  assert.ok(ehAncestral(m, ids.A, ids.A1a) && !ehAncestral(m, ids.B, ids.A1a));
  // vira ramo principal: ganha lado e cor própria; deixa de ser: perde
  const m3 = moveNode(m, ids.A1, ids.C, undefined, 'L');
  assert.equal(m3.nodes[ids.A1].side, 'L');
  assert.ok(PALETA.includes(m3.nodes[ids.A1].ramo as (typeof PALETA)[number]));
  assert.notEqual(m3.nodes[ids.A1].ramo, m3.nodes[ids.A].ramo);
  const m4 = moveNode(m, ids.B, ids.A2);
  assert.equal(m4.nodes[ids.B].side, undefined);
  assert.equal(m4.nodes[ids.B].ramo, undefined);
  assert.equal(corDe(m4, ids.B), corDe(m, ids.A));
  // trocar de lado sem mudar de pai
  const m5 = moveNode(m, ids.A, ids.C, undefined, 'L');
  assert.equal(m5.nodes[ids.A].side, 'L');
  // mover para dentro de um recolhido abre ele
  const m6 = moveNode(setNode(m, ids.A2, { collapsed: true }), ids.B, ids.A2);
  assert.ok(!m6.nodes[ids.A2].collapsed);
});

// árvore aleatória determinística
function aleatorio(seed: number, total: number): MapaDados {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const g = gidFactory();
  let m = novoMapa('Central', g);
  const ids = [m.root];
  const textos = ['a', 'ideia média', 'uma ideia com um texto bem mais comprido que quebra em várias linhas no mapa', '🚀 foguete', 'x\ny\nz'];
  for (let i = 0; i < total; i++) {
    const pai = ids[Math.floor(rnd() * ids.length)];
    const r = addChild(m, pai, textos[Math.floor(rnd() * textos.length)], g);
    m = r.mapa;
    ids.push(r.id);
    if (rnd() < 0.1) m = setNode(m, r.id, { note: 'n', done: true, icon: '⭐' });
  }
  return m;
}

test('layout: nenhuma ideia por cima da outra (árvores aleatórias)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = aleatorio(seed, 5 + seed * 2);
    const lay = layout(m);
    const cs = Object.values(lay.caixas);
    assert.equal(cs.length, contarIdeias(m), 'todas visíveis');
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) assert.ok(!sobrepoe(cs[i], cs[j]), `seed ${seed}: ${cs[i].id} × ${cs[j].id}`);
    }
    for (const c of cs) {
      if (!c.pai) continue;
      const p = lay.caixas[c.pai];
      if (c.lado === 'R') assert.ok(c.x >= p.x + p.w, 'filho à direita do pai');
      else assert.ok(c.x + c.w <= p.x, 'filho à esquerda do pai');
      assert.match(caminho(p, c), /^M[-\d.]+,[-\d.]+ C/);
    }
  }
});

test('layout: central no meio, ramos dos dois lados, recolher esconde e abre sem sobrepor', () => {
  const { m, ids } = exemplo();
  const lay = layout(m);
  const c = lay.caixas[ids.C];
  assert.equal(c.x + c.w / 2, 0);
  assert.equal(c.y + c.h / 2, 0);
  assert.ok(lay.caixas[ids.A].x > 0 && lay.caixas[ids.B].x + lay.caixas[ids.B].w < 0);
  const rec = alternarRecolher(m, ids.A);
  const lay2 = layout(rec);
  assert.ok(lay2.caixas[ids.A] && !lay2.caixas[ids.A1] && !lay2.caixas[ids.A1a]);
  assert.equal(alternarRecolher(m, ids.A2), m, 'sem filhos não recolhe');
  assert.equal(alternarRecolher(m, ids.C), m, 'central não recolhe');
  assert.ok(lay.bounds.minX < 0 && lay.bounds.maxX > 0);
  // texto longo quebra em linhas e a caixa cresce
  const longo = setNode(m, ids.A2, { text: 'um texto bem comprido que precisa quebrar em mais de uma linha' });
  assert.ok(layout(longo).caixas[ids.A2].linhas.length > 1);
  assert.ok(layout(longo).caixas[ids.A2].h > lay.caixas[ids.A2].h);
});

test('quebrar linhas: palavras inteiras, palavra gigante corta, \\n respeitado', () => {
  assert.deepEqual(quebrarLinhas('abc def ghi', 7), ['abc def', 'ghi']);
  assert.deepEqual(quebrarLinhas('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(quebrarLinhas('a\nb', 10), ['a', 'b']);
  assert.deepEqual(quebrarLinhas('', 10), ['']);
});

test('setas: para fora = filho, para dentro = pai, cima/baixo no mesmo nível', () => {
  const { m, ids } = exemplo();
  const lay = layout(m);
  assert.equal(vizinho(m, lay, ids.C, 'right'), ids.A);
  assert.equal(vizinho(m, lay, ids.C, 'left'), ids.B);
  assert.equal(vizinho(m, lay, ids.A, 'left'), ids.C);
  assert.equal(vizinho(m, lay, ids.B, 'right'), ids.C);
  assert.equal(vizinho(m, lay, ids.A1, 'down'), ids.A2);
  assert.equal(vizinho(m, lay, ids.A2, 'up'), ids.A1);
  assert.equal(vizinho(m, lay, ids.A1, 'up'), null);
  assert.equal(vizinho(m, lay, ids.A1, 'right'), ids.A1a);
  assert.equal(vizinho(m, lay, ids.A2, 'right'), null);
  assert.equal(vizinho(m, lay, ids.C, 'up'), null);
});

test('arrastar: acha a ideia sob o ponto, ignorando as que estão sendo arrastadas', () => {
  const { m, ids } = exemplo();
  const lay = layout(m);
  const a = lay.caixas[ids.A];
  assert.equal(ideiaNoPonto(lay, a.x + 5, a.y + 5), ids.A);
  assert.equal(ideiaNoPonto(lay, a.x + 5, a.y + 5, new Set([ids.A])), null);
  assert.equal(ideiaNoPonto(lay, 99999, 99999), null);
});

test('exportar lista: tópicos com recuo, feito, ícone e nota', () => {
  const ex = exemplo();
  const { ids } = ex;
  let { m } = ex;
  m = setNode(m, ids.A1, { done: true, icon: '⭐', note: 'linha 1\nlinha 2' });
  m = setNode(m, ids.B, { text: 'B\ncom quebra' });
  assert.equal(paraTexto(m), [
    'C',
    '- A',
    '  - ✓ ⭐ A1',
    '    (nota: linha 1 / linha 2)',
    '    - A1a',
    '  - A2',
    '- B com quebra',
  ].join('\n'));
  assert.equal(paraTexto(novoMapa('Só a central')), 'Só a central');
});

test('dados do banco: lixo vira mapa novo, nós soltos somem, ciclo não trava', () => {
  for (const ruim of [null, 'x', {}, { root: 'a', nodes: {} }, { root: 1, nodes: { 1: {} } }]) {
    const n = normalizar(ruim);
    assert.equal(contarIdeias(n), 1);
  }
  const n = normalizar({
    v: 1, root: 'r', nodes: {
      r: { text: 'R', children: ['a', 'a', 'x', 5], collapsed: true },
      a: { text: 'A', children: ['b', 'r'], side: 'L', cor: '#123456', done: 'sim' },
      b: { text: 'B', children: [], side: 'R', ramo: '#fff' },
      solto: { text: 'perdido', children: [] },
    },
  });
  assert.deepEqual(Object.keys(n.nodes).sort(), ['a', 'b', 'r']);
  assert.deepEqual(n.nodes.r.children, ['a']);
  assert.deepEqual(n.nodes.a.children, ['b']);
  assert.equal(n.nodes.a.side, 'L');
  assert.ok(n.nodes.a.ramo, 'ramo principal ganha cor automática');
  assert.equal(n.nodes.a.done, undefined);
  assert.equal(n.nodes.b.side, undefined, 'só ramo principal tem lado');
  assert.equal(n.nodes.r.collapsed, undefined);
  // ida e volta pelo JSON
  const { m } = exemplo();
  assert.deepEqual(normalizar(JSON.parse(JSON.stringify(m))), m);
});

test('duplicar: ids novos, mesma forma', () => {
  const { m } = exemplo();
  let i = 0;
  const d = duplicarDados(m, () => `d${++i}`);
  assert.equal(contarIdeias(d), contarIdeias(m));
  assert.ok(Object.keys(d.nodes).every((k) => k.startsWith('d')));
  assert.equal(paraTexto(d), paraTexto(m));
  assert.equal(d.nodes[d.root].parent, null);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}\n${(e as Error).message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} ok`);
if (failed) process.exit(1);
