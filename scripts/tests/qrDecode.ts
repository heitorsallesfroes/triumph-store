// Decodificador de QR code INDEPENDENTE do gerador (src/lib/qr.ts), só para os testes: lê o formato (as duas cópias),
// tira a máscara, lê em zigue-zague, separa os blocos, confere as síndromes do Reed-Solomon e lê o modo byte.
// Usado em igLinks.test.ts e no Chrome real (igTrackingChrome.test.ts, com o QR desenhado na página). Versões 1 a 9, nível M.
import assert from 'node:assert/strict';

const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46] };
const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22]; const NB = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5];
const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292];
function gexp() { const e: number[] = []; let x = 1; for (let i = 0; i < 255; i++) { e.push(x); x <<= 1; if (x & 0x100) x ^= 0x11d; } return e; }
const EXP = gexp(); const LOG: number[] = []; EXP.forEach((v, i) => { LOG[v] = i; });
const gmul = (a: number, b: number) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);
export function decodeQr(q: { size: number; modules: boolean[][] }): string {
  const n = q.size; const v = (n - 17) / 4; const m = q.modules;
  // finder nos 3 cantos
  const finderOk = (x0: number, y0: number) => [0, 6].every((k) => m[y0][x0 + k] && m[y0 + k][x0]) && m[y0 + 3][x0 + 3] && !m[y0 + 1][x0 + 1];
  assert.ok(finderOk(0, 0) && finderOk(n - 7, 0) && finderOk(0, n - 7), 'localizadores');
  // formato (as duas cópias iguais) → nível M e a máscara
  let f1 = 0; for (let i = 0; i <= 5; i++) f1 |= (m[i][8] ? 1 : 0) << i; f1 |= (m[7][8] ? 1 : 0) << 6; f1 |= (m[8][8] ? 1 : 0) << 7; f1 |= (m[8][7] ? 1 : 0) << 8; for (let i = 9; i < 15; i++) f1 |= (m[8][14 - i] ? 1 : 0) << i;
  let f2 = 0; for (let i = 0; i < 8; i++) f2 |= (m[8][n - 1 - i] ? 1 : 0) << i; for (let i = 8; i < 15; i++) f2 |= (m[n - 15 + i][8] ? 1 : 0) << i;
  assert.equal(f1, f2, 'as duas cópias do formato');
  const fmt = (f1 ^ 0x5412) >>> 10;
  assert.equal(fmt >>> 3, 0, 'nível M');
  const mask = fmt & 7;
  const isF = (x: number, y: number) => (x < 9 && y < 9) || (x >= n - 8 && y < 9) || (x < 9 && y >= n - 8) || x === 6 || y === 6
    || (v >= 7 && ((x >= n - 11 && x < n - 8 && y < 6) || (y >= n - 11 && y < n - 8 && x < 6)))
    || ALIGN[v].some((ax) => ALIGN[v].some((ay) => !((ax === 6 && ay === 6) || (ax === 6 && ay === ALIGN[v].at(-1)) || (ay === 6 && ax === ALIGN[v].at(-1))) && Math.abs(x - ax) <= 2 && Math.abs(y - ay) <= 2));
  const MASKS = [(x: number, y: number) => (x + y) % 2 === 0, (_: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const bits: number[] = [];
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < n; i++) {
      const y = upward ? n - 1 - i : i;
      for (const x of [col, col - 1]) if (!isF(x, y)) bits.push((m[y][x] ? 1 : 0) ^ (MASKS[mask](x, y) ? 1 : 0));
    }
    upward = !upward;
  }
  const cws: number[] = []; for (let i = 0; i + 8 <= bits.length && cws.length < TOTAL[v]; i += 8) cws.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  assert.equal(cws.length, TOTAL[v]);
  // separa os blocos (curtos primeiro) e confere as síndromes
  const nb = NB[v]; const ec = ECC[v]; const shortLen = Math.floor(TOTAL[v] / nb); const nShort = nb - (TOTAL[v] % nb);
  const lens = Array.from({ length: nb }, (_, i) => shortLen - ec + (i < nShort ? 0 : 1));
  const blocks: number[][] = lens.map(() => []);
  let k = 0;
  for (let i = 0; i < Math.max(...lens); i++) for (let b = 0; b < nb; b++) if (i < lens[b]) blocks[b].push(cws[k++]);
  for (let i = 0; i < ec; i++) for (let b = 0; b < nb; b++) blocks[b].push(cws[k++]);
  const data: number[] = [];
  blocks.forEach((blk, b) => {
    for (let s = 0; s < ec; s++) { let acc = 0; for (const c of blk) acc = gmul(acc, EXP[s]) ^ c; assert.equal(acc, 0, `síndrome ${s} do bloco ${b}`); }
    data.push(...blk.slice(0, lens[b]));
  });
  const db: number[] = []; data.forEach((c) => { for (let i = 7; i >= 0; i--) db.push((c >>> i) & 1); });
  const rd = (p: number, len: number) => db.slice(p, p + len).reduce((a, b) => (a << 1) | b, 0);
  assert.equal(rd(0, 4), 0b0100, 'modo byte');
  const len = rd(4, 8);
  const bytes = Array.from({ length: len }, (_, i) => rd(12 + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(bytes));
}


// QR a partir do SVG desenhado (path "M{x} {y}h1v1h-1z", com a margem de 4 módulos)
export function modulesFromSvg(svg: string): { size: number; modules: boolean[][] } {
  const vb = /viewBox="0 0 (\d+) \d+"/.exec(svg);
  if (!vb) throw new Error('SVG sem viewBox');
  const size = Number(vb[1]) - 8;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  for (const m of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) modules[Number(m[2]) - 4][Number(m[1]) - 4] = true;
  return { size, modules };
}
