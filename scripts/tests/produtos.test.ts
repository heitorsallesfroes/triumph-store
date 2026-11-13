// Tela de Produtos (src/lib/produtos.ts). Sem rede e sem banco: node scripts/tests/produtos.test.ts
// Confere: categoria (incl. "acessorio" antigo pelo nome), margem e cores (≥50 verde, 30–50 amarela, <30 vermelha),
// selo de estoque (0 vermelho, ≤2 amarelo), busca (modelo, cor, SKU, NCM), filtros (categoria, sem NCM, sem
// estoque, estoque baixo, inativos), ordem, cards do topo, validação (NCM, GTIN, SKU repetido), duplicar, edição em
// lote (categoria, NCM, preço valor/%, ativar/desativar), erro de coluna sem migration e filtros no endereço.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../../src/lib/produtos.ts';

let passou = 0;
const t = (nome: string, fn: () => void) => { try { fn(); passou++; console.log(`ok - ${nome}`); } catch (e) { console.error(`FALHOU - ${nome}`); throw e; } };
let seq = 0;
const prod = (o: Partial<P.Produto>): P.Produto => ({ id: `p${++seq}`, model: 'S11', color: 'Preto', category: 'smartwatch', sku: null, ncm: '85176277', cost: 100, price: 300, current_stock: 5, ...o });

t('categoria: smartwatch/pulseira/fone; "acessorio" antigo pelo nome; sem categoria = outros', () => {
  assert.equal(P.categoriaDe({ category: 'smartwatch', model: 'S11' }), 'smartwatch');
  assert.equal(P.categoriaDe({ category: 'pulseira', model: 'x' }), 'pulseira');
  assert.equal(P.categoriaDe({ category: 'acessorio', model: 'Pulseira Milanese', color: 'Rose' }), 'pulseira');
  assert.equal(P.categoriaDe({ category: 'acessorio', model: 'Fone Bluetooth i12' }), 'fone');
  assert.equal(P.categoriaDe({ category: 'acessorio', model: 'Película 41mm' }), 'acessorio');
  assert.equal(P.categoriaDe({ category: null, model: 'Carregador' }), 'acessorio');
  assert.equal(P.rotuloCategoria('acessorio'), 'Outros acessórios');
});

t('banco: category só smartwatch ou acessorio (cadastro e lote)', () => {
  assert.equal(P.categoriaBanco('smartwatch'), 'smartwatch');
  for (const c of ['pulseira', 'fone', 'acessorio', '', null, undefined]) assert.equal(P.categoriaBanco(c), 'acessorio', String(c));
  const f = { ...P.FORM_VAZIO, model: 'Pulseira Milanese', color: 'Rose' };
  for (const [c, esp] of [['smartwatch', 'smartwatch'], ['pulseira', 'acessorio'], ['fone', 'acessorio'], ['acessorio', 'acessorio']] as const) {
    assert.equal(P.paraBanco({ ...f, category: c }).base.category, esp, c);
  }
  // e a tela continua classificando pelo nome depois de gravar
  assert.equal(P.categoriaDe({ category: P.paraBanco({ ...f, category: 'pulseira' }).base.category, model: f.model, color: f.color }), 'pulseira');
});

t('margem sobre o preço, com cor: ≥ 50% verde, 30–50% amarela, < 30% vermelha', () => {
  assert.deepEqual(P.margem(100, 300), { valor: 200, pct: 66.7, cor: 'verde' });
  assert.equal(P.margem(100, 200).cor, 'verde', '50% exato é verde');
  assert.equal(P.margem(140, 200).cor, 'amarela', '30%');
  assert.equal(P.margem(141, 200).cor, 'vermelha', '29,5%');
  assert.deepEqual(P.margem(250, 200), { valor: -50, pct: -25, cor: 'vermelha' });
  assert.deepEqual(P.margem(10, 0), { valor: -10, pct: null, cor: 'nenhuma' }, 'sem preço não tem %');
  assert.equal(P.margem('99.9', '199.8').pct, 50);
});

t('selo de estoque: sem (≤ 0), baixo (1–2), ok (3+)', () => {
  assert.deepEqual([-1, 0, 1, 2, 3].map(P.seloEstoque), ['sem', 'sem', 'baixo', 'baixo', 'ok']);
});

t('busca: modelo, cor (sem acento), SKU, NCM com ou sem pontos; todas as palavras', () => {
  const p = prod({ model: 'Pulseira Aço', color: 'Dourado', sku: 'PUL-ACO-DOU', ncm: '91139000' });
  for (const b of ['pulseira', 'aco', 'dourado', 'pul-aco', 'PUL-ACO-DOU', '9113', '9113.90.00', 'aço dourado', '']) assert.ok(P.casaBusca(p, b), b);
  for (const b of ['prata', '8517', 'aço prata']) assert.ok(!P.casaBusca(p, b), b);
});

t('filtros: categoria + situação; inativos só na visão "Inativos"', () => {
  const lista = [
    prod({ model: 'A' }), prod({ model: 'B', ncm: null }), prod({ model: 'C', current_stock: 0 }), prod({ model: 'D', current_stock: 2 }),
    prod({ model: 'E', ativo: false }), prod({ model: 'F', category: 'acessorio', color: '', ncm: '' }), prod({ model: 'Pulseira G', category: 'acessorio' }),
  ];
  const nomes = (f: Partial<P.Filtros>) => P.aplicar(lista, { ...P.PADRAO, ...f }).map((p) => p.model);
  assert.deepEqual(nomes({}), ['A', 'B', 'C', 'D', 'F', 'Pulseira G']);
  assert.deepEqual(nomes({ cat: 'smartwatch' }), ['A', 'B', 'C', 'D']);
  assert.deepEqual(nomes({ cat: 'pulseira' }), ['Pulseira G']);
  assert.deepEqual(nomes({ cat: 'acessorio' }), ['F']);
  assert.deepEqual(nomes({ sit: 'sem-ncm' }), ['B', 'F']);
  assert.deepEqual(nomes({ sit: 'sem-estoque' }), ['C']);
  assert.deepEqual(nomes({ sit: 'estoque-baixo' }), ['D']);
  assert.deepEqual(nomes({ sit: 'inativos' }), ['E']);
  assert.deepEqual(nomes({ sit: 'sem-ncm', cat: 'smartwatch' }), ['B']);
  // sem a migration a coluna "ativo" não vem: conta como ativo
  assert.equal(P.ativo({}), true);
  assert.equal(P.ativo({ ativo: null }), true);
});

t('ordem: nome, preço, margem, estoque; clicar inverte; outra coluna começa no natural', () => {
  const l = [prod({ model: 'b', price: 100, cost: 80, current_stock: 9 }), prod({ model: 'A', price: 300, cost: 100, current_stock: 1 }), prod({ model: 'c', price: 200, cost: 60, current_stock: 4 })];
  const o = (ordem: P.Ordem, dir: 'asc' | 'desc') => P.ordenar(l, ordem, dir).map((p) => p.model);
  assert.deepEqual(o('nome', 'asc'), ['A', 'b', 'c']);
  assert.deepEqual(o('preco', 'desc'), ['A', 'c', 'b']);
  assert.deepEqual(o('margem', 'desc'), ['c', 'A', 'b']); // 70%, 66,7%, 20%
  assert.deepEqual(o('estoque', 'asc'), ['A', 'c', 'b']);
  assert.deepEqual(P.trocarOrdem(P.PADRAO, 'nome'), { ...P.PADRAO, dir: 'desc' });
  assert.deepEqual(P.trocarOrdem(P.PADRAO, 'preco'), { ...P.PADRAO, ordem: 'preco', dir: 'desc' });
});

t('cards do topo: ativos, unidades, valor a custo e a preço, sem NCM (inativos e estoque negativo fora)', () => {
  const r = P.resumo([prod({ current_stock: 2, cost: 100, price: 300 }), prod({ current_stock: 3, cost: 10.1, price: 20, ncm: '' }), prod({ current_stock: -4 }), prod({ ativo: false, current_stock: 50, ncm: null })]);
  assert.deepEqual(r, { ativos: 3, unidades: 5, valorCusto: 230.3, valorVenda: 660, semNcm: 1, inativos: 1 });
});

t('cadastro: validação de modelo, NCM (8 números), GTIN (dígito verificador), origem, unidade, preços e SKU repetido', () => {
  const ok: P.Form = { ...P.FORM_VAZIO, model: 'S11', ncm: '85176277', cost: '120,50', price: '299.90' };
  assert.deepEqual(P.validar(ok), []);
  assert.deepEqual(P.validar({ ...ok, ncm: '' }), [], 'sem NCM salva (a NF-e é que trava)');
  assert.deepEqual(P.validar({ ...ok, ncm: '8517.62.77' }), [], 'NCM com pontos');
  assert.ok(P.validar({ ...ok, ncm: '8517627' }).includes('NCM precisa ter 8 números.'));
  assert.ok(P.validar({ ...ok, ncm: '851762770' }).includes('NCM precisa ter 8 números.'));
  assert.ok(P.validar({ ...ok, model: '  ' }).includes('Informe o modelo.'));
  assert.deepEqual(P.validar({ ...ok, gtin: '7891000315507' }), []);
  assert.deepEqual(P.validar({ ...ok, gtin: 'sem gtin' }), []);
  assert.equal(P.validar({ ...ok, gtin: '7891000315508' }).length, 1);
  assert.equal(P.validar({ ...ok, origem: '9' }).length, 1);
  assert.equal(P.validar({ ...ok, unidade: '' }).length, 1);
  assert.equal(P.validar({ ...ok, price: 'abc' }).length, 1);
  const outros = [prod({ id: 'x1', sku: 'S11-PRETO' })];
  assert.deepEqual(P.validar({ ...ok, sku: 's11-preto ' }, outros), ['O SKU "s11-preto" já é de outro produto.']);
  assert.deepEqual(P.validar({ ...ok, sku: 'S11-PRETO' }, outros, 'x1'), [], 'o próprio produto pode manter o SKU');
  assert.deepEqual([P.numBR('1.234,50'), P.numBR('99,9'), P.numBR('120.00'), P.numBR(''), P.numBR('R$ 10,00')], [1234.5, 99.9, 120, 0, 10]);
});

t('gravar: dados limpos; fiscais separados (para gravar sem eles antes da migration); padrões 0 / Pc / SEM GTIN', () => {
  const { base, fiscal } = P.paraBanco({ ...P.FORM_VAZIO, model: ' S11 ', color: 'Preto ', sku: '', ncm: '8517.62.77', cost: '120,5', price: '299,9', gtin: '' });
  assert.deepEqual(base, { model: 'S11', color: 'Preto', category: 'smartwatch', supplier: '', sku: null, ncm: '85176277', cost: 120.5, price: 299.9 });
  assert.deepEqual(fiscal, { origem: 0, unidade: 'Pc', gtin: 'SEM GTIN' });
  const f = P.formDe(prod({ origem: null, unidade: null, gtin: null }));
  assert.deepEqual([f.origem, f.unidade, f.gtin], ['0', 'Pc', 'SEM GTIN']);
  assert.ok(P.faltaColuna({ code: 'PGRST204', message: "Could not find the 'ativo' column of 'products' in the schema cache" }));
  assert.ok(P.faltaColuna({ code: '42703', message: 'column products.origem does not exist' }));
  assert.ok(!P.faltaColuna({ code: '23505', message: 'duplicate key' }));
  assert.ok(!P.faltaColuna(null));
});

t('duplicar: copia tudo menos SKU, cor e estoque', () => {
  const d = P.duplicar(prod({ model: 'S11', color: 'Preto', sku: 'S11-PRETO', ncm: '85176277', cost: 100, price: 300, current_stock: 9, supplier: 'Forn', gtin: '7891000315507', origem: 2, unidade: 'Un' }));
  assert.deepEqual(d, { model: 'S11', color: '', category: 'smartwatch', supplier: 'Forn', sku: '', ncm: '85176277', origem: '2', unidade: 'Un', gtin: '7891000315507', cost: '100', price: '300' });
  assert.ok(!('current_stock' in d));
});

t('edição em lote: só o que muda; preço por valor ou %; confirmação com a quantidade', () => {
  const l = [prod({ id: 'a', price: 100, category: 'acessorio', model: 'Pulseira X', ncm: '91139000' }), prod({ id: 'b', price: 199.9 }), prod({ id: 'c', price: 0, ativo: false })];
  // pulseira/fone/outros gravam 'acessorio' (o banco só conhece smartwatch/acessorio)
  assert.deepEqual(P.alteracoesLote(l, { tipo: 'categoria', categoria: 'pulseira' }), [{ id: 'b', dados: { category: 'acessorio' } }, { id: 'c', dados: { category: 'acessorio' } }]);
  assert.deepEqual(P.alteracoesLote(l, { tipo: 'categoria', categoria: 'fone' }), P.alteracoesLote(l, { tipo: 'categoria', categoria: 'acessorio' }));
  assert.ok(P.alteracoesLote([prod({ id: 'z', category: 'pulseira' })], { tipo: 'categoria', categoria: 'pulseira' }).every((m) => m.dados.category === 'acessorio'), 'pulseira gravada por engano volta para acessorio');
  assert.deepEqual(P.alteracoesLote(l, { tipo: 'categoria', categoria: 'smartwatch' }).map((m) => m.id), ['a']);
  assert.deepEqual(P.alteracoesLote(l, { tipo: 'ncm', ncm: '91139000' }).map((m) => m.id), ['b', 'c']);
  assert.deepEqual(P.alteracoesLote(l, { tipo: 'preco', modo: 'pct', valor: 10 }), [{ id: 'a', dados: { price: 110 } }, { id: 'b', dados: { price: 219.89 } }]);
  assert.deepEqual(P.alteracoesLote(l, { tipo: 'preco', modo: 'pct', valor: -5 }).map((m) => m.dados.price), [95, 189.91]);
  assert.deepEqual(P.alteracoesLote(l, { tipo: 'preco', modo: 'valor', valor: 100 }).map((m) => m.id), ['b', 'c']);
  assert.deepEqual(P.alteracoesLote(l, { tipo: 'ativo', ativo: false }).map((m) => m.id), ['a', 'b']);
  assert.deepEqual(P.alteracoesLote(l, { tipo: 'ativo', ativo: true }), [{ id: 'c', dados: { ativo: true } }]);
  assert.equal(P.loteValido({ tipo: 'ncm', ncm: '123' }), 'NCM precisa ter 8 números.');
  assert.equal(P.loteValido({ tipo: 'preco', modo: 'pct', valor: -100 }), 'Valor inválido.');
  assert.equal(P.loteValido({ tipo: 'preco', modo: 'valor', valor: NaN }), 'Valor inválido.');
  assert.equal(P.loteValido({ tipo: 'preco', modo: 'pct', valor: -20 }), null);
  assert.equal(P.textoLote({ tipo: 'preco', modo: 'pct', valor: -5 }, 3), 'Baixar o preço de 3 produtos em 5%?');
  assert.equal(P.textoLote({ tipo: 'preco', modo: 'valor', valor: 299.9 }, 1), 'Mudar o preço de 1 produto para R$ 299,90?');
  assert.equal(P.textoLote({ tipo: 'ativo', ativo: false }, 2), 'Desativar 2 produtos?');
  assert.equal(P.textoLote({ tipo: 'categoria', categoria: 'fone' }, 4), 'Mudar a categoria de 4 produtos para Fones?');
});

t('filtros no endereço: só o diferente do padrão (pr_…); inválidos voltam ao padrão; os outros parâmetros ficam', () => {
  const href = 'https://erp.exemplo/?pagina=produtos#x';
  const f: P.Filtros = { cat: 'pulseira', sit: 'sem-ncm', busca: 'rosa gold', ordem: 'margem', dir: 'desc' };
  const h = P.hrefComFiltros(href, f);
  assert.equal(h, '/?pagina=produtos&pr_cat=pulseira&pr_sit=sem-ncm&pr_busca=rosa+gold&pr_ordem=margem&pr_dir=desc#x');
  assert.deepEqual(P.lerFiltros(h.split('#')[0].slice(1)), f);
  assert.equal(P.hrefComFiltros(href, P.PADRAO), '/?pagina=produtos#x');
  assert.deepEqual(P.lerFiltros('?pr_cat=xx&pr_sit=yy&pr_ordem=zz&pr_dir=q'), P.PADRAO);
  assert.equal(P.hrefSemFiltros(`https://erp.exemplo${h}`), '/?pagina=produtos#x');
});

t('Nova Venda esconde inativos na busca; a tela não apaga produto (desativa) e o Tiny fica recolhido no fim', () => {
  const sales = readFileSync(new URL('../../src/pages/Sales.tsx', import.meta.url), 'utf8');
  assert.match(sales, /const productsAtivos = products\.filter\(\(p\) => p\.ativo !== false\)/);
  assert.equal((sales.match(/products=\{productsAtivos\}/g) || []).length, 2, 'QuickAdd e UnifiedSearch');
  const tela = readFileSync(new URL('../../src/pages/Products.tsx', import.meta.url), 'utf8');
  assert.ok(!/\.delete\(\)/.test(tela), 'sem excluir produto nem itens de venda');
  assert.ok(tela.includes('Integração Tiny (temporária)'));
  assert.ok(tela.indexOf('Integração Tiny (temporária)') > tela.indexOf('<table'), 'bloco do Tiny depois da tabela');
  const mig = readFileSync(new URL('../../supabase/migrations/20261123120000_produtos_cadastro.sql', import.meta.url), 'utf8');
  for (const c of ['ativo boolean NOT NULL DEFAULT true', "unidade text NOT NULL DEFAULT 'Pc'", "gtin text NOT NULL DEFAULT 'SEM GTIN'", 'origem smallint NOT NULL DEFAULT 0']) assert.ok(mig.includes(c), c);
});

console.log(`\n${passou} testes de Produtos passaram`);
