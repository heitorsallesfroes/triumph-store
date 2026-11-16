// 🧠 Gestão › Anotações › Pensamentos: regras puras dos mapas mentais (árvore, mover, layout, navegação, exportar).
// Sem React e sem banco — testadas em scripts/tests/mapas.test.ts. A tela fica em src/pages/AnotacoesPensamentos.tsx.
// Os dados vão inteiros para erp_mapas.dados (jsonb): { v: 1, root, nodes: { id: MNode } }.

export type Lado = 'L' | 'R';
export interface MNode {
  id: string;
  text: string;
  parent: string | null;
  children: string[];
  side?: Lado;        // só nos filhos da ideia central: de que lado ficam
  ramo?: string;      // cor automática do ramo principal (só nos filhos da ideia central)
  cor?: string;       // cor escolhida pela pessoa (vale para a ideia e para o que estiver embaixo)
  icon?: string;
  done?: boolean;
  note?: string;
  collapsed?: boolean;
  tarefa?: boolean;   // já virou tarefa
}
export interface MapaDados { v: 1; root: string; nodes: Record<string, MNode> }

export const PALETA = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#ec4899'] as const;
export const ICONES = ['⭐', '❗', '❓', '💡', '✅', '🔥', '🎯', '💰', '📅', '📌', '🚀', '⚠️', '❤️', '👍', '👎', '🛒', '📞', '🧩'] as const;
export const PLACEHOLDER = 'Nova ideia';

let seq = 0;
export const novoId = () => Math.random().toString(36).slice(2, 9) + (seq++).toString(36);
type Gid = () => string;

export function novoMapa(texto = 'Ideia central', gid: Gid = novoId): MapaDados {
  const id = gid();
  return { v: 1, root: id, nodes: { [id]: { id, text: texto, parent: null, children: [] } } };
}

// cópia com cada nó novo (o histórico guarda versões antigas intactas)
export function copiar(m: MapaDados): MapaDados {
  const nodes: Record<string, MNode> = {};
  for (const [k, n] of Object.entries(m.nodes)) nodes[k] = { ...n, children: [...n.children] };
  return { v: 1, root: m.root, nodes };
}

export const contarIdeias = (m: MapaDados) => Object.keys(m.nodes).length;

export function subarvore(m: MapaDados, id: string): string[] {
  const out: string[] = [];
  const pilha = [id];
  while (pilha.length) {
    const x = pilha.pop()!;
    const n = m.nodes[x];
    if (!n) continue;
    out.push(x);
    pilha.push(...n.children);
  }
  return out;
}

// a é ancestral de b (ou o próprio b)?
export function ehAncestral(m: MapaDados, a: string, b: string): boolean {
  let x: string | null = b;
  for (let guard = 0; x && guard < 100000; guard++) {
    if (x === a) return true;
    x = m.nodes[x]?.parent ?? null;
  }
  return false;
}

export function profundidade(m: MapaDados, id: string): number {
  let d = 0;
  let x = m.nodes[id]?.parent ?? null;
  while (x) { d++; x = m.nodes[x]?.parent ?? null; }
  return d;
}

// lado com menos ideias recebe o próximo ramo principal (empate = direita)
function ladoLivre(m: MapaDados): Lado {
  let r = 0;
  let l = 0;
  for (const c of m.nodes[m.root].children) {
    const t = subarvore(m, c).length;
    if (m.nodes[c].side === 'L') l += t; else r += t;
  }
  return l < r ? 'L' : 'R';
}
function corLivre(m: MapaDados): string {
  const usadas = new Set(m.nodes[m.root].children.map((c) => m.nodes[c].ramo));
  return PALETA.find((c) => !usadas.has(c)) ?? PALETA[m.nodes[m.root].children.length % PALETA.length];
}
// vira (ou deixa de ser) ramo principal: ganha/perde lado e cor automática
function ajustarRamo(m: MapaDados, id: string, lado?: Lado) {
  const n = m.nodes[id];
  if (n.parent === m.root) {
    n.side = lado ?? n.side ?? ladoLivre(m);
    if (!n.ramo) n.ramo = corLivre(m);
  } else {
    delete n.side;
    delete n.ramo;
  }
}

export function addChild(m0: MapaDados, parentId: string, text = '', gid: Gid = novoId, lado?: Lado): { mapa: MapaDados; id: string } {
  if (!m0.nodes[parentId]) return { mapa: m0, id: parentId };
  const m = copiar(m0);
  const id = gid();
  const p = m.nodes[parentId];
  delete p.collapsed;
  m.nodes[id] = { id, text, parent: parentId, children: [] };
  if (parentId === m.root) ajustarRamo(m, id, lado);
  p.children.push(id);
  return { mapa: m, id };
}

export function addSibling(m0: MapaDados, id: string, text = '', gid: Gid = novoId): { mapa: MapaDados; id: string } {
  const n = m0.nodes[id];
  if (!n) return { mapa: m0, id };
  if (!n.parent) return addChild(m0, id, text, gid);
  const m = copiar(m0);
  const nid = gid();
  const p = m.nodes[n.parent];
  m.nodes[nid] = { id: nid, text, parent: n.parent, children: [] };
  p.children.splice(p.children.indexOf(id) + 1, 0, nid);
  if (n.parent === m.root) ajustarRamo(m, nid, n.side);
  return { mapa: m, id: nid };
}

// apaga a ideia com tudo que estiver embaixo (a central não pode ser apagada)
export function removeNode(m0: MapaDados, id: string): MapaDados {
  const n = m0.nodes[id];
  if (!n || !n.parent) return m0;
  const m = copiar(m0);
  const p = m.nodes[n.parent];
  p.children = p.children.filter((c) => c !== id);
  for (const x of subarvore(m0, id)) delete m.nodes[x];
  return m;
}

// muda de pai. Não deixa mover a central nem jogar uma ideia dentro dela mesma/dos próprios filhos.
export function moveNode(m0: MapaDados, id: string, novoPai: string, index?: number, lado?: Lado): MapaDados {
  const n = m0.nodes[id];
  if (!n || !n.parent || !m0.nodes[novoPai] || ehAncestral(m0, id, novoPai)) return m0;
  if (n.parent === novoPai && index === undefined && (lado === undefined || lado === n.side)) return m0;
  const m = copiar(m0);
  const antigo = m.nodes[n.parent];
  antigo.children = antigo.children.filter((c) => c !== id);
  const p = m.nodes[novoPai];
  const i = index === undefined ? p.children.length : Math.max(0, Math.min(index, p.children.length));
  p.children.splice(i, 0, id);
  delete p.collapsed;
  m.nodes[id].parent = novoPai;
  ajustarRamo(m, id, lado);
  return m;
}

export function setNode(m0: MapaDados, id: string, patch: Partial<Pick<MNode, 'text' | 'cor' | 'icon' | 'done' | 'note' | 'collapsed' | 'tarefa'>>): MapaDados {
  if (!m0.nodes[id]) return m0;
  const m = copiar(m0);
  const n = m.nodes[id];
  for (const [k, v] of Object.entries(patch) as [keyof typeof patch, unknown][]) {
    if (k === 'text') n.text = typeof v === 'string' ? v : '';
    else if (v === undefined || v === null || v === '' || v === false) delete n[k];
    else (n as unknown as Record<string, unknown>)[k] = v;
  }
  return m;
}

export function alternarRecolher(m: MapaDados, id: string): MapaDados {
  const n = m.nodes[id];
  if (!n || !n.children.length || !n.parent) return m;
  return setNode(m, id, { collapsed: !n.collapsed });
}

// cor efetiva: a escolhida, senão a do ramo principal (os filhos herdam). A central não tem cor de ramo.
export function corDe(m: MapaDados, id: string): string | null {
  let x: string | null = id;
  while (x && x !== m.root) {
    const n: MNode | undefined = m.nodes[x];
    if (!n) return null;
    if (n.cor) return n.cor;
    if (n.parent === m.root) return n.ramo ?? PALETA[0];
    x = n.parent;
  }
  return null;
}

// cópia com ids novos (duplicar mapa)
export function duplicarDados(m: MapaDados, gid: Gid = novoId): MapaDados {
  const novo = new Map<string, string>();
  for (const k of Object.keys(m.nodes)) novo.set(k, gid());
  const nodes: Record<string, MNode> = {};
  for (const n of Object.values(m.nodes)) {
    const id = novo.get(n.id)!;
    nodes[id] = { ...n, id, parent: n.parent ? novo.get(n.parent)! : null, children: n.children.map((c) => novo.get(c)!) };
  }
  return { v: 1, root: novo.get(m.root)!, nodes };
}

// lê o jsonb do banco com tolerância: descarta lixo, conserta pais/filhos, nó sem pai some
export function normalizar(raw: unknown): MapaDados {
  const r = raw as Partial<MapaDados> | null;
  if (!r || typeof r !== 'object' || typeof r.root !== 'string' || !r.nodes || typeof r.nodes !== 'object' || !(r.root in r.nodes)) return novoMapa();
  const src = r.nodes as Record<string, Partial<MNode>>;
  const nodes: Record<string, MNode> = {};
  const visto = new Set<string>();
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const visitar = (id: string, parent: string | null) => {
    const s = src[id];
    if (!s || typeof s !== 'object' || visto.has(id)) return;
    visto.add(id);
    const n: MNode = { id, text: typeof s.text === 'string' ? s.text : '', parent, children: [] };
    if (s.side === 'L' || s.side === 'R') n.side = s.side;
    for (const k of ['ramo', 'cor', 'icon', 'note'] as const) { const v = str(s[k]); if (v) n[k] = v; }
    for (const k of ['done', 'collapsed', 'tarefa'] as const) if (s[k] === true) n[k] = true;
    nodes[id] = n;
    for (const c of Array.isArray(s.children) ? s.children : []) {
      if (typeof c !== 'string') continue;
      visitar(c, id);
      if (nodes[c]?.parent === id && !n.children.includes(c)) n.children.push(c);
    }
  };
  visitar(r.root, null);
  const m: MapaDados = { v: 1, root: r.root, nodes };
  delete nodes[r.root].collapsed;
  for (const c of nodes[r.root].children) ajustarRamo(m, c);
  for (const n of Object.values(nodes)) if (n.parent !== r.root) { delete n.side; delete n.ramo; }
  return m;
}

// ── medidas e layout ────────────────────────────────────────────────────────
export const LAYOUT = { hgap: 46, vgap: 12 };
const ESTILO = {
  raiz: { font: 17, charW: 9.6, line: 24, padX: 20, padY: 12, maxU: 22, minW: 110 },
  ideia: { font: 14, charW: 7.9, line: 20, padX: 12, padY: 7, maxU: 28, minW: 56 },
};
export const ICONE_W = 18;   // ✓ antes do texto
export const NOTA_W = 20;    // 📝 depois do texto

// emoji e caracteres largos contam quase o dobro
const unidades = (s: string) => Array.from(s).reduce((t, ch) => t + ((ch.codePointAt(0) ?? 0) > 0x2000 ? (/\p{Mn}|‍|️/u.test(ch) ? 0 : 1.8) : 1), 0);

export function quebrarLinhas(texto: string, maxU: number): string[] {
  const out: string[] = [];
  for (const par of texto.split('\n')) {
    let linha = '';
    for (const palavra0 of par.split(/ +/)) {
      let palavra = palavra0;
      // palavra maior que a linha: corta em pedaços
      while (unidades(palavra) > maxU) {
        if (linha) { out.push(linha); linha = ''; }
        const cs = Array.from(palavra);
        let corte = 0;
        let u = 0;
        while (corte < cs.length && u + unidades(cs[corte]) <= maxU) { u += unidades(cs[corte]); corte++; }
        out.push(cs.slice(0, Math.max(1, corte)).join(''));
        palavra = cs.slice(Math.max(1, corte)).join('');
      }
      const tent = linha ? `${linha} ${palavra}` : palavra;
      if (unidades(tent) <= maxU) linha = tent;
      else { out.push(linha); linha = palavra; }
    }
    out.push(linha);
  }
  return out.length ? out : [''];
}

export interface Medida { w: number; h: number; linhas: string[]; font: number; line: number; padX: number; padY: number; extraEsq: number }
export function medir(n: MNode, raiz: boolean): Medida {
  const e = raiz ? ESTILO.raiz : ESTILO.ideia;
  const label = (n.icon ? `${n.icon} ` : '') + (n.text.trim() ? n.text : PLACEHOLDER);
  const linhas = quebrarLinhas(label, e.maxU);
  const extraEsq = n.done ? ICONE_W : 0;
  const extra = extraEsq + (n.note ? NOTA_W : 0);
  const textoW = Math.max(...linhas.map(unidades)) * e.charW;
  return {
    w: Math.round(Math.max(e.minW, textoW + extra + e.padX * 2)),
    h: linhas.length * e.line + e.padY * 2,
    linhas, font: e.font, line: e.line, padX: e.padX, padY: e.padY, extraEsq,
  };
}

export interface Caixa extends Medida { id: string; x: number; y: number; lado: 'L' | 'R' | 'C'; prof: number; pai: string | null; cor: string | null }
export interface Layout { caixas: Record<string, Caixa>; ordem: string[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }

// árvore horizontal para os dois lados: cada ideia ocupa uma "faixa" vertical própria, do tamanho dela ou dos
// filhos (o que for maior); faixas de irmãos não se cruzam e cada nível fica à frente do pai → nada se sobrepõe.
export function layout(m: MapaDados): Layout {
  const caixas: Record<string, Caixa> = {};
  const ordem: string[] = [];
  const med = new Map<string, Medida>();
  const medida = (id: string) => { let x = med.get(id); if (!x) { x = medir(m.nodes[id], id === m.root); med.set(id, x); } return x; };
  const visiveis = (id: string) => (m.nodes[id].collapsed ? [] : m.nodes[id].children.filter((c) => m.nodes[c]));
  const faixas = new Map<string, number>();
  const faixa = (id: string): number => {
    const f = faixas.get(id);
    if (f !== undefined) return f;
    const cs = visiveis(id);
    const soma = cs.reduce((t, c) => t + faixa(c), 0) + LAYOUT.vgap * Math.max(0, cs.length - 1);
    const v = Math.max(medida(id).h, soma);
    faixas.set(id, v);
    return v;
  };
  const colocarFilhos = (ids: string[], borda: number, cy: number, lado: Lado, prof: number, pai: string) => {
    const total = ids.reduce((t, c) => t + faixa(c), 0) + LAYOUT.vgap * Math.max(0, ids.length - 1);
    let y = cy - total / 2;
    for (const c of ids) {
      const f = faixa(c);
      colocar(c, borda, y + f / 2, lado, prof, pai);
      y += f + LAYOUT.vgap;
    }
  };
  const colocar = (id: string, borda: number, cy: number, lado: Lado, prof: number, pai: string) => {
    const md = medida(id);
    const x = lado === 'R' ? borda : borda - md.w;
    caixas[id] = { ...md, id, x, y: cy - md.h / 2, lado, prof, pai, cor: corDe(m, id) };
    ordem.push(id);
    colocarFilhos(visiveis(id), lado === 'R' ? x + md.w + LAYOUT.hgap : x - LAYOUT.hgap, cy, lado, prof + 1, id);
  };

  const r = medida(m.root);
  caixas[m.root] = { ...r, id: m.root, x: -r.w / 2, y: -r.h / 2, lado: 'C', prof: 0, pai: null, cor: null };
  ordem.push(m.root);
  const filhos = m.nodes[m.root].children.filter((c) => m.nodes[c]);
  colocarFilhos(filhos.filter((c) => m.nodes[c].side !== 'L'), r.w / 2 + LAYOUT.hgap, 0, 'R', 1, m.root);
  colocarFilhos(filhos.filter((c) => m.nodes[c].side === 'L'), -r.w / 2 - LAYOUT.hgap, 0, 'L', 1, m.root);

  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const c of Object.values(caixas)) {
    bounds.minX = Math.min(bounds.minX, c.x); bounds.minY = Math.min(bounds.minY, c.y);
    bounds.maxX = Math.max(bounds.maxX, c.x + c.w); bounds.maxY = Math.max(bounds.maxY, c.y + c.h);
  }
  return { caixas, ordem, bounds };
}

// linha curva do pai até o filho
export function caminho(p: Caixa, c: Caixa): string {
  const dir = c.lado === 'L' ? -1 : 1;
  const sx = p.lado === 'C' ? p.x + p.w / 2 + (dir * p.w) / 2 - dir * 6 : dir > 0 ? p.x + p.w : p.x;
  const sy = p.y + p.h / 2;
  const ex = dir > 0 ? c.x : c.x + c.w;
  const ey = c.y + c.h / 2;
  const mx = (sx + ex) / 2;
  return `M${r1(sx)},${r1(sy)} C${r1(mx)},${r1(sy)} ${r1(mx)},${r1(ey)} ${r1(ex)},${r1(ey)}`;
}
const r1 = (v: number) => Math.round(v * 10) / 10;

export function sobrepoe(a: Pick<Caixa, 'x' | 'y' | 'w' | 'h'>, b: Pick<Caixa, 'x' | 'y' | 'w' | 'h'>): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// ideia sob o ponto (arrastar e soltar), ignorando as que estão em "fora"
export function ideiaNoPonto(lay: Layout, x: number, y: number, fora: Set<string> = new Set()): string | null {
  for (let i = lay.ordem.length - 1; i >= 0; i--) {
    const c = lay.caixas[lay.ordem[i]];
    if (!fora.has(c.id) && x >= c.x - 4 && x <= c.x + c.w + 4 && y >= c.y - 4 && y <= c.y + c.h + 4) return c.id;
  }
  return null;
}

// setas do teclado: para fora = primeiro filho; para dentro = pai; cima/baixo = ideia mais próxima no mesmo nível
export type Direcao = 'up' | 'down' | 'left' | 'right';
export function vizinho(m: MapaDados, lay: Layout, id: string, dir: Direcao): string | null {
  const c = lay.caixas[id];
  if (!c) return null;
  if (dir === 'left' || dir === 'right') {
    const lado: Lado = dir === 'right' ? 'R' : 'L';
    const filhosVis = (m.nodes[id].collapsed ? [] : m.nodes[id].children).filter((f) => lay.caixas[f]);
    if (c.lado === 'C') return filhosVis.find((f) => lay.caixas[f].lado === lado) ?? null;
    if (c.lado === lado) {
      if (!filhosVis.length) return null;
      // o filho mais perto da altura do pai
      return filhosVis.reduce((best, f) => (Math.abs(centroY(lay.caixas[f]) - centroY(c)) < Math.abs(centroY(lay.caixas[best]) - centroY(c)) ? f : best));
    }
    return c.pai;
  }
  if (c.lado === 'C') return null;
  const cy = centroY(c);
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of Object.values(lay.caixas)) {
    if (o.id === id || o.lado !== c.lado || o.prof !== c.prof) continue;
    const d = centroY(o) - cy;
    if ((dir === 'up' ? d < 0 : d > 0) && Math.abs(d) < bestD) { bestD = Math.abs(d); best = o.id; }
  }
  return best;
}
const centroY = (c: Caixa) => c.y + c.h / 2;

// lista em tópicos com recuo (para copiar)
export function paraTexto(m: MapaDados): string {
  const linha = (n: MNode) => `${n.done ? '✓ ' : ''}${n.icon ? `${n.icon} ` : ''}${(n.text.trim() || PLACEHOLDER).replace(/\s*\n\s*/g, ' ')}`;
  const out: string[] = [linha(m.nodes[m.root])];
  const notaDe = (n: MNode, recuo: string) => { if (n.note?.trim()) out.push(`${recuo}  (nota: ${n.note.trim().replace(/\s*\n\s*/g, ' / ')})`); };
  notaDe(m.nodes[m.root], '');
  const ir = (id: string, prof: number) => {
    const n = m.nodes[id];
    if (!n) return;
    const recuo = '  '.repeat(prof - 1);
    out.push(`${recuo}- ${linha(n)}`);
    notaDe(n, recuo);
    for (const c of n.children) ir(c, prof + 1);
  };
  for (const c of m.nodes[m.root].children) ir(c, 1);
  return out.join('\n');
}
