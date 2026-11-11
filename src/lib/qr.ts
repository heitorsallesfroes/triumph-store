// QR code (ISO/IEC 18004) para os links rastreáveis do Instagram, sem biblioteca: modo byte (UTF-8), correção M,
// versões 1 a 9 (até ~180 bytes; os links /l/<apelido> têm ~50). Escolhe a máscara com menor penalidade.
// Conferido em scripts/tests/igLinks.test.ts (Reed-Solomon e formato com os exemplos da norma + leitura de volta).

const ECC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22]; // códigos de correção por bloco (nível M), versão 1..9
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5]; // nº de blocos (nível M)
const MAX_VERSION = 9;

// ── GF(256) e Reed-Solomon ──
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
export function rsDivisor(degree: number): number[] {
  const r: number[] = new Array(degree - 1).fill(0).concat([1]);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}
export function rsRemainder(data: number[], divisor: number[]): number[] {
  const r: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (r.shift() as number);
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, factor); });
  }
  return r;
}

export const rawModules = (ver: number) => {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const a = Math.floor(ver / 7) + 2; n -= (25 * a - 10) * a - 55; if (ver >= 7) n -= 36; }
  return n;
};
const dataCodewords = (ver: number) => Math.floor(rawModules(ver) / 8) - ECC_M[ver] * BLOCKS_M[ver];

// bits do formato (nível M = 00) com a máscara
export function formatBits(mask: number): number {
  const data = (0 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}
export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// dados → códigos (com os blocos de correção intercalados)
export function codewordsFor(bytes: number[], ver: number): number[] {
  const cap = dataCodewords(ver);
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
  const nb = BLOCKS_M[ver]; const ecc = ECC_M[ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const shortBlocks = nb - (raw % nb);
  const shortLen = Math.floor(raw / nb);
  const div = rsDivisor(ecc);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen - ecc + (i < shortBlocks ? 0 : 1);
    const d = data.slice(k, k + len);
    k += len;
    const e = rsRemainder(d, div);
    if (i < shortBlocks) d.push(0);
    blocks.push(d.concat(e));
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecc || j >= shortBlocks) out.push(b[i]); });
  return out;
}

const maskFn = [
  (x: number, y: number) => (x + y) % 2 === 0, (_x: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
  (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export interface Qr { version: number; size: number; mask: number; modules: boolean[][] }

function build(cw: number[], ver: number, mask: number): Qr {
  const size = ver * 4 + 17;
  const m: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)); const x = cx + dx; const y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = alignmentPositions(ver);
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const fb = formatBits(mask);
  const bit = (v: number, i: number) => ((v >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(fb, i));
  set(8, 7, bit(fb, 6)); set(8, 8, bit(fb, 7)); set(7, 8, bit(fb, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fb, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fb, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fb, i));
  set(8, size - 8, true);
  if (ver >= 7) {
    const vb = versionBits(ver);
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3); const b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); }
  }
  // dados em zigue-zague (colunas de 2, de baixo para cima e de cima para baixo, pulando a coluna 6)
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const up = ((right + 1) & 2) === 0;
      const y = up ? size - 1 - v : v;
      if (!fn[y][x] && k < cw.length * 8) { m[y][x] = bit(cw[k >>> 3], 7 - (k & 7)); k++; }
    }
  }
  const f = maskFn[mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && f(x, y)) m[y][x] = !m[y][x];
  return { version: ver, size, mask, modules: m };
}

// penalidade (regras N1 a N4 da norma, simplificadas no padrão de localizador)
export function penalty(q: Qr): number {
  const { size, modules: m } = q;
  let p = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else { if (run >= 5) p += 3 + run - 5; run = 1; }
    }
    for (let i = 0; i + 7 <= size; i++) {
      const pat = [1, 0, 1, 1, 1, 0, 1].every((b, k) => get(i + k) === !!b);
      if (!pat) continue;
      const lightBefore = [1, 2, 3, 4].every((k) => i - k < 0 || !get(i - k));
      const lightAfter = [0, 1, 2, 3].every((k) => i + 7 + k >= size || !get(i + 7 + k));
      if (lightBefore || lightAfter) p += 40;
    }
  };
  for (let y = 0; y < size; y++) line((i) => m[y][i]);
  for (let x = 0; x < size; x++) line((i) => m[i][x]);
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  const dark = m.reduce((a, r) => a + r.filter(Boolean).length, 0);
  p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return p;
}

export function qrEncode(text: string): Qr {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= MAX_VERSION && 4 + 8 + bytes.length * 8 > dataCodewords(ver) * 8) ver++;
  if (ver > MAX_VERSION) throw new Error('Texto longo demais para o QR code');
  const cw = codewordsFor(bytes, ver);
  let best: Qr | null = null; let bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) { const q = build(cw, ver, mask); const p = penalty(q); if (p < bestP) { best = q; bestP = p; } }
  return best as Qr;
}

// SVG (quadradinhos escuros num fundo branco, com a margem de 4 módulos da norma)
export function qrSvg(q: Qr, px = 4): string {
  const n = q.size + 8;
  let d = '';
  q.modules.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * px}" height="${n * px}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
