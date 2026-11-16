// Contraste das cores das telas de nota fiscal (src/components/nfeCores.ts) nos dois temas: WCAG AA (≥ 4,5:1).
// Sem dependências: node scripts/tests/nfeCores.test.ts
import assert from 'node:assert/strict';
import { NFE_CORES, NFE_CSS, NFE_SELOS } from '../../src/components/nfeCores.ts';

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
// cor (hex ou rgba) sobre um fundo opaco
function cor(c: string, base: RGB): RGB {
  const m = c.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (!m) return hex(c);
  const a = Number(m[4]);
  return [1, 2, 3].map((i, j) => Number(m[i]) * a + base[j] * (1 - a)) as RGB;
}
const lum = ([r, g, b]: RGB) => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contraste = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// fundos onde as telas aparecem: modal/cartões (bg-gray-800) e página
const BASES = { escuro: ['#1f2937', '#111827'], claro: ['#ffffff', '#f5f5f5'] } as const;

let n = 0;
for (const tema of ['escuro', 'claro'] as const) {
  const t = NFE_CORES[tema];
  for (const b of BASES[tema]) {
    const base = hex(b);
    for (const k of ['ok', 'aviso', 'erro'] as const) {
      const fundo = cor(t[k].fundo, base);
      for (const campo of ['texto', 'sub'] as const) {
        const c = contraste(hex(t[k][campo]), fundo);
        assert.ok(c >= 4.5, `${tema}/${b} faixa ${k}.${campo}: ${c.toFixed(2)}`); n++;
      }
      const c = contraste(hex(t[k].forte), base);
      assert.ok(c >= 4.5, `${tema}/${b} texto ${k}: ${c.toFixed(2)}`); n++;
    }
    const bloco = cor(t.bloco, base);
    for (const fg of [t.aux, tema === 'claro' ? '#4b5563' : '#cccccc']) {   // auxiliar e rótulo (text-gray-400 do tema)
      const c = contraste(hex(fg), bloco);
      assert.ok(c >= 4.5, `${tema}/${b} cinza sobre bloco: ${c.toFixed(2)}`); n++;
    }
    assert.ok(contraste(hex(t.aux), base) >= 4.5, `${tema}/${b} auxiliar`); n++;
    for (const [k, [f, , txt]] of Object.entries(NFE_SELOS[tema])) {
      const c = contraste(hex(txt), cor(f, base));
      assert.ok(c >= 4.5, `${tema}/${b} selo ${k}: ${c.toFixed(2)}`); n++;
    }
  }
}
// o CSS tem as duas versões
assert.match(NFE_CSS, /^\.nfe-ok\{/m);
assert.match(NFE_CSS, /^html\.light \.nfe-ok\{/m);
assert.match(NFE_CSS, /html\.light \.nfe-bloco\{[^}]*box-shadow/);
console.log(`ok   ${n} combinações com contraste ≥ 4,5:1\n\n1/1 ok`);
