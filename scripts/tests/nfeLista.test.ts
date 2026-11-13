// Lista de Notas fiscais (src/lib/nfeLista.ts) e selo do Histórico (src/lib/nfeRegras.ts). Sem rede e sem banco:
//   node scripts/tests/nfeLista.test.ts
// Confere: período pela data de emissão no horário do RJ (hoje, ontem, 7 dias, este mês, mês passado, datas),
// abas com contador, filtro de ambiente, busca (cliente sem acento, CPF, nº, chave), ordem por coluna, rodapé sem
// canceladas/rejeitadas no valor, páginas de 100, filtros no endereço (F5) e selo da venda.
import assert from 'node:assert/strict';
import * as L from '../../src/lib/nfeLista.ts';
import * as R from '../../src/lib/nfeRegras.ts';

let passou = 0;
const t = (nome: string, fn: () => void) => { try { fn(); passou++; console.log(`ok - ${nome}`); } catch (e) { console.error(`FALHOU - ${nome}`); throw e; } };

// 13/11/2026 00:30 no RJ = 03:30Z
const AGORA = new Date('2026-11-13T03:30:00Z');
let seq = 0;
const nota = (o: Partial<L.NotaLista>): L.NotaLista => ({ id: `n${++seq}`, ambiente: 1, serie: 2, numero: seq, status: 'autorizada', cliente: 'Cliente', valor: 100, criado_em: '2026-11-10T15:00:00.000Z', ...o });

t('período: dias no horário do RJ, [de, ate) com -03:00', () => {
  const f = (periodo: L.Periodo, de = '', ate = '') => L.intervalo({ periodo, de, ate }, AGORA);
  assert.equal(L.hojeRJ(AGORA), '2026-11-13', '00:30 no RJ ainda é dia 13 (em UTC já é 03:30 do dia 13; às 02:00Z ainda seria 12)');
  assert.equal(L.hojeRJ(new Date('2026-11-13T02:00:00Z')), '2026-11-12');
  assert.deepEqual(f('hoje'), { de: '2026-11-13T00:00:00-03:00', ate: '2026-11-14T00:00:00-03:00', dias: ['2026-11-13', '2026-11-13'] });
  assert.deepEqual(f('ontem').dias, ['2026-11-12', '2026-11-12']);
  assert.deepEqual(f('7dias').dias, ['2026-11-07', '2026-11-13']);
  assert.deepEqual(f('mes'), { de: '2026-11-01T00:00:00-03:00', ate: '2026-12-01T00:00:00-03:00', dias: ['2026-11-01', '2026-11-30'] });
  assert.deepEqual(f('mes-passado').dias, ['2026-10-01', '2026-10-31']);
  assert.deepEqual(L.intervalo({ periodo: 'mes-passado', de: '', ate: '' }, new Date('2027-01-05T12:00:00Z')).dias, ['2026-12-01', '2026-12-31']);
  assert.deepEqual(f('datas', '2026-10-20', '2026-10-05').dias, ['2026-10-05', '2026-10-20'], 'datas trocadas: ordena');
  assert.equal(f('datas', '2026-10-05', '2026-10-20').ate, '2026-10-21T00:00:00-03:00', 'o dia final entra inteiro');
  assert.deepEqual(f('datas', '2026-10-05', '').dias, ['2026-11-01', '2026-11-30'], 'datas incompletas: este mês');
});

t('abas com contador, ambiente e rodapé (valor sem canceladas nem rejeitadas)', () => {
  const ns = [
    nota({ status: 'autorizada', valor: 100 }), nota({ status: 'autorizada', valor: 50.5 }), nota({ status: 'pendente', valor: 10 }),
    nota({ status: 'emitindo', valor: 1 }), nota({ status: 'rejeitada', valor: 999 }), nota({ status: 'cancelada', valor: 777 }),
    nota({ status: 'autorizada', valor: 300, ambiente: 2 }),
  ];
  const r = L.aplicar(ns, { ...L.PADRAO });
  assert.deepEqual(r.contadores, { todas: 6, pendentes: 2, autorizadas: 2, rejeitadas: 1, canceladas: 1 }, 'padrão: só notas reais');
  assert.equal(r.quantidade, 6); assert.equal(r.valor, 161.5);
  const tst = L.aplicar(ns, { ...L.PADRAO, amb: 'testes' });
  assert.equal(tst.quantidade, 1); assert.equal(tst.valor, 300);
  assert.equal(L.aplicar(ns, { ...L.PADRAO, amb: 'todas' }).contadores.todas, 7);
  const canc = L.aplicar(ns, { ...L.PADRAO, aba: 'canceladas' });
  assert.equal(canc.quantidade, 1); assert.equal(canc.valor, 0);
  assert.equal(canc.contadores.todas, 6, 'contadores não mudam com a aba');
  assert.equal(L.aplicar(ns, { ...L.PADRAO, aba: 'pendentes' }).quantidade, 2, 'emitindo conta como pendente');
});

t('busca: cliente sem acento, CPF com ou sem pontos, nº exato, parte da chave', () => {
  const ns = [
    nota({ cliente: 'João da Silva', doc: '52998224725', numero: 12, chave: '33261149923481000104550020000000121234567890' }),
    nota({ cliente: 'Maria Souza', doc: '11144477735', numero: 120, chave: '33261149923481000104550020000001201234567891' }),
  ];
  const b = (busca: string) => L.base(ns, { amb: 'todas', busca }).map((n) => n.cliente);
  assert.deepEqual(b('joao'), ['João da Silva']);
  assert.deepEqual(b('SOUZA'), ['Maria Souza']);
  assert.deepEqual(b('529.982.247-25'), ['João da Silva']);
  assert.deepEqual(b('11144'), ['Maria Souza']);
  assert.deepEqual(b('12'), ['João da Silva'], 'número exato: 12 não pega o 120');
  assert.deepEqual(b('0000001201234'), ['Maria Souza'], 'parte da chave');
  assert.deepEqual(b('nota 12'), [], 'texto que não é cliente nem número');
  assert.deepEqual(b(''), ['João da Silva', 'Maria Souza']);
});

t('ordem: clicar em Nº, Data, Cliente e Valor; mesma coluna inverte', () => {
  const ns = [
    nota({ numero: 3, cliente: 'Bruno', valor: 30, criado_em: '2026-11-03T10:00:00Z' }),
    nota({ numero: 1, cliente: 'Álvaro', valor: 300, criado_em: '2026-11-01T10:00:00Z' }),
    nota({ numero: 2, cliente: 'Carla', valor: 3, criado_em: '2026-11-02T10:00:00Z' }),
  ];
  const nums = (f: L.Filtros) => L.aplicar(ns, f).lista.map((n) => n.numero);
  assert.deepEqual(nums(L.PADRAO), [3, 2, 1], 'padrão: data de emissão, mais nova primeiro');
  let f = L.trocarOrdem(L.PADRAO, 'numero');
  assert.equal(f.dir, 'desc'); assert.deepEqual(nums(f), [3, 2, 1]);
  f = L.trocarOrdem(f, 'numero'); assert.deepEqual(nums(f), [1, 2, 3]);
  f = L.trocarOrdem(f, 'cliente'); assert.equal(f.dir, 'asc'); assert.deepEqual(nums(f), [1, 3, 2], 'Álvaro, Bruno, Carla (acento não atrapalha)');
  f = L.trocarOrdem(f, 'valor'); assert.deepEqual(nums(f), [1, 3, 2], 'maior valor primeiro');
  f = L.trocarOrdem(f, 'valor'); assert.deepEqual(nums(f), [2, 3, 1]);
  f = L.trocarOrdem({ ...f, pagina: 3 }, 'data'); assert.equal(f.pagina, 1, 'trocar a ordem volta para a página 1');
});

t('páginas de 100', () => {
  const ns = Array.from({ length: 250 }, (_, k) => nota({ numero: k + 1, criado_em: new Date(Date.UTC(2026, 10, 1) + k * 60e3).toISOString() }));
  const p1 = L.aplicar(ns, L.PADRAO);
  assert.equal(p1.paginas, 3); assert.equal(p1.daPagina.length, 100); assert.equal(p1.daPagina[0].numero, 250);
  const p3 = L.aplicar(ns, { ...L.PADRAO, pagina: 3 });
  assert.equal(p3.daPagina.length, 50); assert.equal(p3.quantidade, 250);
  assert.equal(L.aplicar(ns, { ...L.PADRAO, pagina: 99 }).pagina, 3, 'página além do fim vai para a última');
});

t('filtros no endereço: só o que muda do padrão, com prefixo nf_; F5 lê de volta; sair tira', () => {
  const base = 'https://erp.exemplo.com/?pagina=notas-fiscais#x';
  assert.equal(L.hrefComFiltros(base, L.PADRAO), '/?pagina=notas-fiscais#x');
  const f: L.Filtros = { ...L.PADRAO, aba: 'canceladas', amb: 'testes', periodo: 'datas', de: '2026-10-01', ate: '2026-10-31', busca: 'joão', ordem: 'valor', dir: 'asc', pagina: 2 };
  const href = L.hrefComFiltros(base, f);
  assert.match(href, /^\/\?pagina=notas-fiscais&nf_aba=canceladas&nf_amb=testes&nf_periodo=datas&nf_de=2026-10-01&nf_ate=2026-10-31&nf_busca=jo%C3%A3o&nf_ordem=valor&nf_dir=asc&nf_pag=2#x$/);
  assert.deepEqual(L.lerFiltros(new URL(`https://x${href}`).search), f);
  assert.equal(L.hrefSemFiltros(`https://x${href}`), '/?pagina=notas-fiscais#x');
  // datas só valem no período "Escolher datas"; lixo no endereço vira o padrão
  assert.doesNotMatch(L.hrefComFiltros(base, { ...L.PADRAO, de: '2026-10-01' }), /nf_de/);
  assert.deepEqual(L.lerFiltros('?nf_aba=xpto&nf_amb=1&nf_periodo=ano&nf_de=ontem&nf_pag=-4&nf_dir=x'), L.PADRAO);
});

t('selo do Histórico: real antes de teste; rejeitada só se não houver outra', () => {
  assert.equal(R.seloDaVenda([]), null);
  assert.deepEqual(R.seloDaVenda([{ ambiente: 1, numero: 12, status: 'autorizada' }]), { texto: 'NF-e nº 12 autorizada', cor: 'verde', teste: false });
  assert.deepEqual(R.seloDaVenda([{ ambiente: 2, numero: 1, status: 'autorizada' }]), { texto: 'NF-e nº 1 teste autorizada', cor: 'verde', teste: true });
  assert.equal(R.seloDaVenda([{ ambiente: 2, numero: 1, status: 'autorizada' }, { ambiente: 1, numero: 7, status: 'cancelada' }])?.texto, 'NF-e nº 7 cancelada');
  assert.equal(R.seloDaVenda([{ ambiente: 1, numero: 7, status: 'rejeitada' }, { ambiente: 2, numero: 1, status: 'autorizada' }])?.texto, 'NF-e nº 1 teste autorizada');
  assert.deepEqual(R.seloDaVenda([{ ambiente: 1, numero: 8, status: 'emitindo' }]), { texto: 'NF-e nº 8 pendente', cor: 'amarelo', teste: false });
  assert.equal(R.seloDaVenda([{ ambiente: 1, numero: 9, status: 'rejeitada' }])?.cor, 'vermelho');
  assert.equal(R.seloDaVenda([{ ambiente: 1, numero: 3, status: 'cancelada' }])?.cor, 'cinza');
  const por = R.selosPorVenda([{ venda_id: 'a', ambiente: 1, numero: 1, status: 'autorizada' }, { venda_id: null, ambiente: 1, numero: 2, status: 'autorizada' }]);
  assert.deepEqual(Object.keys(por), ['a']);
});

console.log(`\n${passou} testes da lista de notas passaram`);
