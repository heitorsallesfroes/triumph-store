// 🎨 Cores das telas de nota fiscal (NfeModal, NfeCancelar e página Notas fiscais) nos dois temas.
// As classes green-100/200, red-200, yellow-200 e bg-gray-900/40 não são trocadas pelo tema claro (ficavam
// verde-claro sobre verde-claro); estas trocam. Contraste conferido (WCAG AA ≥ 4,5:1) em scripts/tests/nfeCores.test.ts.
// Uso: <style>{NFE_CSS}</style> uma vez na tela, e as classes nfe-* nos elementos.
export const NFE_CORES = {
  escuro: {
    ok: { fundo: 'rgba(34,197,94,.12)', borda: 'rgba(34,197,94,.5)', texto: '#bbf7d0', sub: '#d1fae5', forte: '#4ade80' },
    aviso: { fundo: 'rgba(234,179,8,.12)', borda: 'rgba(234,179,8,.5)', texto: '#fde68a', sub: '#fef3c7', forte: '#facc15' },
    erro: { fundo: 'rgba(239,68,68,.12)', borda: 'rgba(239,68,68,.5)', texto: '#fecaca', sub: '#fee2e2', forte: '#f87171' },
    aux: '#aaaaaa',
    bloco: 'rgba(17,24,39,.4)',
  },
  claro: {
    ok: { fundo: '#f0fdf4', borda: '#22c55e', texto: '#14532d', sub: '#166534', forte: '#15803d' },
    aviso: { fundo: '#fffbeb', borda: '#f59e0b', texto: '#78350f', sub: '#92400e', forte: '#92400e' },
    erro: { fundo: '#fef2f2', borda: '#ef4444', texto: '#7f1d1d', sub: '#991b1b', forte: '#b91c1c' },
    aux: '#4b5563',
    bloco: '#f9fafb',
  },
} as const;

// selos de situação (lista de notas e "TESTE")
export const NFE_SELOS = {
  escuro: {
    ok: ['rgba(34,197,94,.15)', 'rgba(34,197,94,.4)', '#86efac'], aviso: ['rgba(234,179,8,.15)', 'rgba(234,179,8,.4)', '#fde047'],
    erro: ['rgba(239,68,68,.15)', 'rgba(239,68,68,.4)', '#fca5a5'], neutro: ['rgba(107,114,128,.2)', 'rgba(107,114,128,.4)', '#d1d5db'],
  },
  claro: {
    ok: ['#dcfce7', '#86efac', '#14532d'], aviso: ['#fef3c7', '#fcd34d', '#78350f'],
    erro: ['#fee2e2', '#fca5a5', '#7f1d1d'], neutro: ['#f3f4f6', '#d1d5db', '#374151'],
  },
} as const;

const tipos = ['ok', 'aviso', 'erro'] as const;
const regras = (pre: string, t: (typeof NFE_CORES)['escuro' | 'claro'], s: (typeof NFE_SELOS)['escuro' | 'claro']) => [
  ...tipos.flatMap((k) => [
    `${pre}.nfe-${k}{background:${t[k].fundo};border-color:${t[k].borda}!important;color:${t[k].texto}}`,
    `${pre}.nfe-${k} .nfe-sub{color:${t[k].sub}}`,
    `${pre}.nfe-${k}-t{color:${t[k].forte}}`,
  ]),
  `${pre}.nfe-aux{color:${t.aux}}`,
  `${pre}.nfe-bloco{background:${t.bloco}${pre ? ';box-shadow:inset 0 0 0 1px #d1d5db' : ''}}`,
  ...(Object.keys(s) as (keyof typeof s)[]).map((k) => `${pre}.nfe-selo-${k}{background:${s[k][0]};border-color:${s[k][1]}!important;color:${s[k][2]}}`),
].join('\n');

export const NFE_CSS = `${regras('', NFE_CORES.escuro, NFE_SELOS.escuro)}\n${regras('html.light ', NFE_CORES.claro, NFE_SELOS.claro)}`;
