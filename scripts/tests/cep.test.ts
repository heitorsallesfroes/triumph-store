// Testes da limpeza do CEP (src/lib/cep.ts). Sem dependências: node scripts/tests/cep.test.ts
import assert from 'node:assert/strict';
import { cleanCep, formatCep } from '../../src/lib/cep.ts';

// colar em qualquer formato vira só os 8 números
for (const v of ['24.030-330', '24030-330', '24030330', ' 24 030 330 ', '24.030.330', 'CEP: 24030-330']) {
  assert.equal(cleanCep(v), '24030330', v);
  assert.equal(formatCep(v), '24030-330', v);
}
// o bug: maxLength=8 cortava "24.030-330" em "24.030-3" → "240303"; agora nada é cortado antes da limpeza
assert.notEqual(cleanCep('24.030-330'), '240303');
// mais de 8 dígitos: fica com os 8 primeiros
assert.equal(cleanCep('240303301234'), '24030330');
// digitando aos poucos (o traço aparece depois do 5º dígito; apagar o traço não trava)
assert.deepEqual(['2', '24030', '240303', '24030-', '24030-3'].map(formatCep), ['2', '24030', '24030-3', '24030', '24030-3']);
// vazio / nulo
assert.equal(cleanCep(null), '');
assert.equal(formatCep(undefined), '');
console.log('ok   cep: limpeza e formato (8 testes)');
