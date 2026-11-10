// Aba "⚡ Automações" do ERP no Chrome REAL, sem npm install e sem o build do app:
//   node scripts/tests/waAutomationsChrome.test.ts          (dados de teste fixos, sem rede)
//   REAL=1 node scripts/tests/waAutomationsChrome.test.ts   (os DADOS REAIS, somente leitura: só GET/HEAD no Supabase)
// Empacota só a tela com o esbuild que já vem com o Vite e abre no Google Chrome instalado (headless, DevTools por
// pipe). Confere: cards (selo, como começa, horário, 4 números, funil), filtros, Etapas (caixas, ✅ ao lado,
// "👥 N pessoas aqui agora" abrindo a lista), Pessoas (telefone mascarado, próximo passo, atrasado em vermelho,
// ordenar), linha do tempo da pessoa (feito ✓ e previsto, "Abrir no WhatsApp"), Histórico (motivos e conversão),
// Envios, busca global, celular (uma coluna, tabela vira lista, sem rolagem lateral) e nenhum erro no console.
// Opções: CHROME_PATH=..., HEADFUL=1, SHOTS_DIR=<pasta para os prints>.
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..', '..');
const require = createRequire(path.join(PROJECT, 'package.json'));
const REAL = process.env.REAL === '1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const findChrome = () => [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .filter(Boolean).find((p) => fs.existsSync(p as string)) as string | undefined;

// ── dados de teste: a régua real (fixtures/reguaFollowup.json) ligada, a Avaliação desligada e um rascunho ──
const REGUA = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'reguaFollowup.json'), 'utf8'));
const W = (() => { const out: string[] = []; let l = REGUA.steps; for (let g = 0; g < 20 && l; g++) { const w = l.find((n: { type: string }) => n.type === 'esperar'); if (!w) break; out.push(w.id); l = w.no; } return out; })();
const F1 = '2f564cdb-5bc5-48c9-9681-6a32336d3f41';
function fixtures(now: number) {
  const iso = (ms: number) => new Date(ms).toISOString();
  const H = 3600000;
  const A1 = 'a1111111-1111-4111-8111-111111111111';
  const draft = JSON.parse(JSON.stringify(REGUA));
  draft.steps[0].no[0].item_id = '';
  const run = (id: string, chat: string, extra: Record<string, unknown>) => ({ id, automation_id: A1, chat_id: chat, contact_id: null, entry_key: `lbl:${id}`, node: W[0], status: 'ativo', outcome: null, wait_started_at: null, due_at: null, last_sent_at: null, skip_wait: false, branches: [], created_at: iso(now - H), ended_at: null, updated_at: iso(now - H), ...extra });
  return {
    wa_automations: [
      { id: A1, name: 'Régua de follow-up', active: true, kind: 'sequencia', position: 0, activated_at: iso(now - 48 * H), sequence: REGUA, trigger_type: 'sequencia' },
      { id: 'a2222222-2222-4222-8222-222222222222', name: 'Avaliação Google', active: false, kind: 'sequencia', position: 1, activated_at: null, trigger_type: 'sequencia',
        sequence: { start: { type: 'etiqueta', source: 'whatsapp', wa_label_id: '1' }, steps: [{ id: 'p5', type: 'pausa', unit: 'dias', amount: 5 }, { id: 'av', type: 'enviar', item_id: 'af21afb0-e488-4ab0-9af1-1e69999259e8' }, { id: 'fz', type: 'fim' }], schedule: { days: [1, 2, 3, 4], mode: 'personalizado', windows: [{ start: '19:00', end: '22:00' }] } } },
      { id: 'a3333333-3333-4333-8333-333333333333', name: 'Rascunho de régua', active: false, kind: 'sequencia', position: 2, activated_at: null, sequence: draft, trigger_type: 'sequencia' },
    ],
    wa_labels: [['f9a864ef-e036-498e-b106-d8f70ad95758', 'Follow Up 1'], ['29d65d49-92e5-4025-95eb-307165282306', 'Follow Up 2'], ['7383a110-8d09-474a-80d3-573a2c2d1998', 'Analisar conversa'], ['f95c8d90-6eac-4e2b-81e7-3eaca0da8af3', 'Lead Perdido']].map(([id, name]) => ({ id, name })),
    wa_items: [
      { id: F1, title: 'Follow Padrão 1', type: 'texto', body: 'Oi! Tudo bem?\nVi que você se interessou pelo relógio.\nPosso ajudar?', file_url: null },
      { id: '21119a80-55a6-4099-a797-23d325e5df6f', title: 'Follow Padrão 2', type: 'imagem', body: 'Olha esse modelo', file_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
    ],
    wa_contacts: [
      { id: 'c1', name: 'Ana Souza', phone: '5521987650001', chat_id: '5521987650001@c.us' },
      { id: 'c2', name: 'Bruno Lima', phone: '5521987650002', chat_id: null },
    ],
    wa_leads: [{ chat_id: '900000000003@lid', phone: '5521987650003' }],
    wa_sequence_runs: [
      run('r1', '5521987650001@c.us', { contact_id: 'c1', created_at: iso(now - 1 * H) }),
      run('r2', '5521987650002@c.us', { created_at: iso(now - 96 * H) }), // ❓ 3 h venceu há 4 dias: atrasado (a qualquer hora do dia)
      run('r3', '900000000003@lid', { node: W[1], skip_wait: true, created_at: iso(now - 5 * H), branches: [{ node: W[0], result: 'nao', at: now - 2 * H }] }), // extensão 2.16.8: "Pular espera" clicado
      run('r4', '5521987650004@c.us', { status: 'fim', outcome: 'respondeu', node: null, created_at: iso(now - 30 * H), ended_at: iso(now - 26 * H), updated_at: iso(now - 26 * H), branches: [{ node: W[0], result: 'nao', at: now - 27 * H }, { node: W[1], result: 'sim', at: now - 26 * H }] }),
      run('r5', '5521987650005@c.us', { status: 'saiu', outcome: 'manual', created_at: iso(now - 30 * H), ended_at: null, updated_at: iso(now - 20 * H) }),
    ],
    wa_send_log: [
      { id: 's1', created_at: iso(now - 2 * H), chat_id: '900000000003@lid', contact_id: null, item_id: F1, status: 'enviado', reason: null, source: 'follow', source_id: A1 },
      { id: 's2', created_at: iso(now - 27 * H), chat_id: '5521987650004@c.us', contact_id: null, item_id: F1, status: 'enviado', reason: null, source: 'follow', source_id: A1 },
      { id: 's3', created_at: iso(now - 25 * H), chat_id: '5521987650005@c.us', contact_id: null, item_id: F1, status: 'pulado', reason: 'Não enviar', source: 'follow', source_id: A1 },
    ],
  };
}

async function bundle(outDir: string) {
  const esbuild = require('esbuild');
  const sub = path.join(HERE, 'chrome', REAL ? 'realSupabase.ts' : 'fakeSupabase.ts');
  await esbuild.build({
    entryPoints: [path.join(HERE, 'chrome', 'automationsHarness.tsx')], bundle: true, outfile: path.join(outDir, 'app.js'), format: 'iife',
    jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx' }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
    absWorkingDir: PROJECT, nodePaths: [path.join(PROJECT, 'node_modules')], logLevel: 'error',
    plugins: [{ name: 'supabase', setup(b: { onResolve: (o: { filter: RegExp }, f: () => { path: string }) => void }) { b.onResolve({ filter: /^\.{1,2}\/(.*\/)?supabase(\.ts)?$/ }, () => ({ path: sub })); } }],
  });
}
function cdp(child: ChildProcess) {
  let seq = 0;
  let buf = '';
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const listeners: ((m: any) => void)[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  (child.stdio[4] as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id)!; pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result); } else listeners.forEach((fn) => fn(msg));
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<any>((resolve, reject) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const id = ++seq;
    pending.set(id, { resolve, reject });
    (child.stdio[3] as NodeJS.WritableStream).write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  return { send, on: (fn: (m: any) => void) => listeners.push(fn) }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); };

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('FAIL Google Chrome não encontrado (use CHROME_PATH=...)'); process.exitCode = 1; return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-erp-auto-'));
  await bundle(dir);
  let host = '';
  if (REAL) {
    const cfg: { self: { WA_CONFIG?: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string } } } = { self: {} };
    vm.runInNewContext(fs.readFileSync(path.join(PROJECT, 'extension', 'config.js'), 'utf8'), cfg);
    host = new URL(cfg.self.WA_CONFIG!.SUPABASE_URL).hostname;
    fs.writeFileSync(path.join(dir, 'db.js'), `window.__REAL = ${JSON.stringify({ url: cfg.self.WA_CONFIG!.SUPABASE_URL, key: cfg.self.WA_CONFIG!.SUPABASE_ANON_KEY })};`);
  } else fs.writeFileSync(path.join(dir, 'db.js'), `window.__DB = ${JSON.stringify(fixtures(Date.now()))};`);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ERP Automações</title>
<style>:root{--text-primary:#111;--text-secondary:#333;--text-muted:#666;--bg-card:#fff;--bg-inner:#f5f5f5;--bg-hover:#eee;--border-main:#ddd}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#fafafa}</style>
</head><body><div id="root"></div><script src="db.js"></script><script src="app.js"></script></body></html>`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-erp-auto-chrome-'));
  const child = spawn(chrome, [
    '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', '--disable-component-update',
    `--host-resolver-rules=MAP * ~NOTFOUND${REAL ? `, EXCLUDE ${host}` : ''}`, '--window-size=1366,900', '--lang=pt-BR', '--allow-file-access-from-files', ...(process.env.HEADFUL ? [] : ['--headless=new']), 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const c = cdp(child);
  const errors: string[] = [];
  const done = () => { try { child.kill(); } catch { /* já saiu */ } setTimeout(() => { for (const d of [profile, dir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* preso */ } } }, 1500); };
  const timer = setTimeout(() => { console.log('FAIL tempo esgotado'); done(); process.exit(1); }, 180000);
  try {
    const { targetInfos } = await c.send('Target.getTargets');
    const page = targetInfos.find((t: { type: string }) => t.type === 'page');
    const { sessionId } = await c.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const s = (m: string, p: Record<string, unknown> = {}) => c.send(m, p, sessionId);
    c.on((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: { value?: string; description?: string }) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    });
    await s('Runtime.enable');
    await s('Page.enable');
    await s('Page.navigate', { url: pathToFileURL(path.join(dir, 'index.html')).href });
    const ev = async (expr: string) => {
      const r = await s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr: string, ms = 15000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
    const shot = async (name: string, width = 1366) => { if (!process.env.SHOTS_DIR) return; await sleep(400); const m = await s('Page.getLayoutMetrics'); const h = Math.ceil(m.cssContentSize.height); const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(h, 7000), scale: 1 } }); fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.SHOTS_DIR, name), Buffer.from(data, 'base64')); };
    const H = `const txt = (e) => (e ? e.textContent.replace(/\\s+/g, ' ').trim() : '');
      const $$ = (q, r = document) => [...r.querySelectorAll(q)];
      const btn = (t, r = document) => $$('button', r).find((b) => txt(b) === t || txt(b).startsWith(t));
      const cards = () => $$('[data-testid="wa-auto-card"]');
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));`;
    const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { check(name, false, String((e as Error).message || e).split('\n')[0]); } };

    const listOk = await waitFor(`${H} return cards().length > 0 && !/Carregando/.test(txt(document.querySelector('[data-testid="wa-auto-updated"]')));`, 30000);
    if (!listOk) console.log('     página:', (await ev('return document.body.innerText.slice(0, 600);')).replace(/s+/g, ' '), '| erros:', errors.slice(0, 3).join(' | '));
    await shot(REAL ? 'real-lista.png' : 'lista.png');
    if (REAL) {
      const info = await ev(`${H} return cards().map((c) => txt(c).slice(0, 260));`);
      check('dados reais: a lista abre com as automações (selo, como começa, 4 números)', listOk && info.length > 0 && info.every((t: string) => /(LIGADA|DESLIGADA|RASCUNHO)/.test(t) && /Em andamento agora/.test(t)), JSON.stringify(info));
      console.log(info.map((t: string) => `     · ${t}`).join('\n'));
      const first = await ev(`${H} const i = cards().findIndex((c) => /LIGADA/.test(txt(c)) && !/DESLIGADA/.test(txt(c))); return i < 0 ? 0 : i;`);
      const active = await ev(`${H} const c = cards()[${first}]; const m = /(\\d+)\\s*Em andamento agora/.exec(txt(c)); return m ? Number(m[1]) : null;`);
      await ev(`${H} cards()[${first}].click(); return true;`);
      const stepsOk = await waitFor(`${H} return $$('[data-testid="wa-auto-step"]').length > 0 && !document.querySelector('[data-testid="wa-auto-steps"] .wa-skel');`);
      const stepTxt = await ev(`${H} return $$('[data-testid="wa-auto-step"]').map((x) => txt(x).slice(0, 120));`);
      check('dados reais: Etapas da automação ligada, com "👥 N pessoas aqui agora"', stepsOk && stepTxt.some((t: string) => /pessoas? aqui agora/.test(t)), JSON.stringify(stepTxt));
      console.log(stepTxt.map((t: string) => `     · ${t}`).join('\n'));
      await shot('real-etapas.png');
      await ev(`${H} btn('Pessoas').click(); return true;`);
      await waitFor(`${H} return !!document.querySelector('[data-testid="wa-auto-people"]');`);
      await sleep(800);
      const ppl = await ev(`${H} return { rows: $$('[data-testid="wa-auto-person-row"]').length, tab: txt(btn('Pessoas')), masked: $$('[data-testid="wa-auto-person-row"]').every((r) => /\\d{2} \\d\\*{4}-\\d{4}|\\*{4}\\d{4}|—/.test(txt(r.cells[1]))) };`);
      check('dados reais: Pessoas = "Em andamento agora" do card, telefones mascarados', ppl.rows === active && ppl.masked, JSON.stringify({ ...ppl, active }));
      await ev(`${H} btn('Histórico').click(); return true;`);
      check('dados reais: Histórico abre', await waitFor(`${H} const h = document.querySelector('[data-testid="wa-auto-history"]'); return !!h && !h.querySelector('.wa-skel');`));
      await ev(`${H} btn('Envios').click(); return true;`);
      check('dados reais: Envios abre', await waitFor(`${H} const h = document.querySelector('[data-testid="wa-auto-sends"]'); return !!h && !h.querySelector('.wa-skel');`));
      await shot('real-envios.png');
      const q = await ev(`return (window.__QUERIES || []).map((x) => x.method);`);
      check('dados reais: só leitura (todas as consultas GET/HEAD)', q.length > 0 && q.every((m: string) => m === 'GET' || m === 'HEAD'), JSON.stringify([...new Set(q)]));
    } else {
      const list = await ev(`${H} return cards().map((c) => txt(c));`);
      check('lista: 3 cards com selo LIGADA / DESLIGADA / RASCUNHO', listOk && list.length === 3 && /LIGADA/.test(list[0]) && !/DESLIGADA/.test(list[0]) && /DESLIGADA/.test(list[1]) && /RASCUNHO/.test(list[2]), JSON.stringify(list.map((t: string) => t.slice(0, 40))));
      check('card: como começa, vale desde, horário resumido', /Quando entra na etiqueta CRM Follow Up 1/.test(list[0]) && /Vale desde: \d\d\/\d\d às \d\d:\d\d/.test(list[0]) && /Seg–Sex 9h–18h · Sáb 9h–14h/.test(list[0])
        && /Quando entra na etiqueta do WhatsApp nº 1/.test(list[1]) && /Ainda não foi ligada/.test(list[1]) && /Seg–Qui 19h–22h/.test(list[1]), list[0].slice(0, 300));
      check('card: 4 números (3 em andamento · 1 respondeu · 0 fim · 1 outro motivo) e o funil (2 na ❓ 3 h, 1 na ❓ dia 1)',
        /3\s*Em andamento agora\s*1\s*Responderam ✅\s*0\s*Chegaram ao fim sem responder\s*1\s*Saíram por outro motivo/.test(list[0]) && /Esperando resposta \(até 3 h depois de entrar\)\s*2/.test(list[0]) && /Esperando resposta \(até 1 dia depois de entrar\)\s*1/.test(list[0]), list[0]);
      await step('filtros e busca pelo nome', async () => {
        await ev(`${H} btn('Ligadas').click(); return true;`); await sleep(150);
        const lig = await ev(`${H} return cards().length;`);
        await ev(`${H} btn('Desligadas').click(); return true;`); await sleep(150);
        const des = await ev(`${H} return cards().length;`);
        await ev(`${H} btn('Todas').click(); const i = document.querySelector('input[aria-label="Buscar automação pelo nome"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'avalia'); i.dispatchEvent(new Event('input', { bubbles: true })); return true;`); await sleep(150);
        const bus = await ev(`${H} return cards().map((c) => txt(c).slice(0, 16));`);
        await ev(`${H} const i = document.querySelector('input[aria-label="Buscar automação pelo nome"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return true;`); await sleep(150);
        check('filtros Ligadas (1) / Desligadas (2) e busca "avalia" → Avaliação Google', lig === 1 && des === 2 && bus.length === 1 && /Avaliação Google/.test(bus[0]), JSON.stringify({ lig, des, bus }));
      });
      await ev(`${H} cards()[0].click(); return true;`);
      const stepsOk = await waitFor(`${H} return $$('[data-testid="wa-auto-step"]').length > 0 && !document.querySelector('[data-testid="wa-auto-steps"] .wa-skel');`);
      const steps = await ev(`${H} return $$('[data-testid="wa-auto-step"]').map((x) => ({ kind: x.dataset.kind, t: txt(x) }));`);
      check('Etapas: 20 caixas na ordem do "se não responder" (7 ❓, 6 ✉, 6 🏷, ⏹)', stepsOk && steps.length === 20 && steps.filter((x: { kind: string }) => x.kind === 'esperar').length === 7 && steps.filter((x: { kind: string }) => x.kind === 'enviar').length === 6 && steps[19].kind === 'fim', JSON.stringify(steps.map((x: { kind: string }) => x.kind)));
      check('Etapas: ❓ "Espera resposta até 3 horas depois de entrar · 3 h desde a entrada" + ✅ ao lado; ✉ com a prévia (2 linhas, ver mais); 🏷 "(e tira as outras)"',
        /ESPERAR RESPOSTA\s*Espera resposta até 3 horas depois de entrar\s*3 h desde a entrada/.test(steps[0].t) && /Se responder: coloca Analisar conversa e termina/.test(steps[0].t)
        && /ENVIAR\s*Envia Follow Padrão 1\s*Oi! Tudo bem\? Vi que você se interessou pelo relógio\. ver mais/.test(steps[1].t) && /Coloca Follow Up 2 \(e tira as outras\)/.test(steps[2].t), `${steps[0].t} | ${steps[1].t} | ${steps[2].t}`);
      check('Etapas: "👥 2 pessoas aqui agora" na ❓ 3 h, "👥 1 pessoa aqui agora" na ❓ dia 1, "👥 0" nas outras', /👥 2 pessoas aqui agora/.test(steps[0].t) && /👥 1 pessoa aqui agora/.test(steps[3].t) && /👥 0 pessoas aqui agora/.test(steps[6].t));
      await step('Etapas: clicar no contador abre a lista', async () => {
        await ev(`${H} $$('[data-testid="wa-auto-step-count"]')[0].click(); return true;`); await sleep(200);
        const open = await ev(`${H} return txt($$('[data-testid="wa-auto-step"]')[0]);`);
        check('Etapas: clicar no 👥 abre as pessoas (nome, telefone mascarado, próximo envio; atrasado em vermelho)', /Ana Souza\s*21 9\*\*\*\*-0001/.test(open) && /Bruno Lima/.test(open) && /→ Recebe Follow Padrão 1/.test(open), open);
      });
      await shot('etapas.png');
      await ev(`${H} btn('Pessoas').click(); return true;`);
      await waitFor(`${H} return $$('[data-testid="wa-auto-person-row"]').length === 3;`);
      const ppl = await ev(`${H} return $$('[data-testid="wa-auto-person-row"]').map((r) => ({ t: txt(r), red: getComputedStyle(r.cells[4].querySelector('span') || r.cells[4]).color }));`);
      check('Pessoas: 3 em andamento, telefone mascarado, etapa, "há X h" e o próximo passo; o atrasado em vermelho e primeiro (ordem pelo próximo)',
        ppl.length === 3 && /Bruno Lima/.test(ppl[0].t) && /atrasado/.test(ppl[0].t) && ppl[0].red === 'rgb(239, 68, 68)' && /21 9\*\*\*\*-0003/.test(ppl.map((x: { t: string }) => x.t).join()) && /há 4 dias/.test(ppl[0].t) && ppl.every((x: { t: string }) => /Recebe Follow Padrão/.test(x.t)), JSON.stringify(ppl));
      // extensão 2.16.8: quem teve a espera pulada (skip_wait) leva o selo "⏩ pulou a espera"; os outros não
      const sk = await ev(`${H} return $$('[data-testid="wa-auto-person-row"]').map((r) => [/-0003/.test(txt(r)), (r.querySelector('[data-testid="wa-auto-skipped"]') || {}).textContent || '']);`);
      check('Pessoas: selo "⏩ pulou a espera" só na pessoa com a espera pulada', sk.filter((x: [boolean, string]) => x[1]).length === 1 && sk.every((x: [boolean, string]) => (x[1] === '⏩ pulou a espera') === x[0]), JSON.stringify(sk));
      await step('Pessoas: ordenar e filtrar', async () => {
        await ev(`${H} btn('Nome').click(); return true;`); await sleep(150);
        const byName = await ev(`${H} return $$('[data-testid="wa-auto-person-row"]').map((r) => txt(r.cells[0].firstChild));`); // só o nome (2.16.8: o selo fica embaixo)
        await ev(`${H} const s = document.querySelector('select[aria-label="Filtrar por etapa"]'); s.value = '${W[1]}'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`); await sleep(150);
        const f = await ev(`${H} return $$('[data-testid="wa-auto-person-row"]').length;`);
        await ev(`${H} const s = document.querySelector('select[aria-label="Filtrar por etapa"]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`); await sleep(150);
        check('Pessoas: ordenar por Nome (A→Z, sem nome por último) e filtro por etapa', byName.join() === 'Ana Souza,Bruno Lima,Sem nome' && f === 1, JSON.stringify({ byName, f }));
      });
      await step('linha do tempo da pessoa', async () => {
        await ev(`${H} $$('[data-testid="wa-auto-person-row"]').find((r) => /21 9\\*{4}-0003/.test(txt(r))).click(); return true;`);
        await waitFor(`${H} return $$('[data-testid="wa-auto-timeline"] li').length > 3;`);
        const tl = await ev(`${H} const d = document.querySelector('[data-testid="wa-auto-drawer"]'); return { done: $$('li[data-done="1"]', d).map(txt), next: $$('li[data-done="0"]', d).map(txt).slice(0, 3), link: (d.querySelector('a') || {}).href || '', skipped: !!d.querySelector('[data-testid="wa-auto-skipped"]') };`);
        check('linha do tempo: selo "⏩ pulou a espera" junto do "Agora:" (extensão 2.16.8)', tl.skipped === true, JSON.stringify(tl));
        check('linha do tempo: feito ✓ (entrou, ❌ 3 h, recebeu Follow Padrão 1) com data real; previsto em cinza; "Abrir no WhatsApp" com o telefone do @lid',
          tl.done.length === 3 && /Entrou na automação/.test(tl.done[0]) && /Não respondeu até 3 horas/.test(tl.done[1]) && /Recebeu Follow Padrão 1/.test(tl.done[2]) && /previsto/.test(tl.next.join()) && /Recebe Follow Padrão 2/.test(tl.next.join()) && tl.link === 'https://web.whatsapp.com/send?phone=5521987650003', JSON.stringify(tl));
        await shot('pessoa.png');
        await ev(`${H} btn('✕').click(); return true;`);
      });
      await step('Histórico', async () => {
        await ev(`${H} btn('Histórico').click(); return true;`);
        await waitFor(`${H} const h = document.querySelector('[data-testid="wa-auto-history"]'); return !!h && !h.querySelector('.wa-skel') && /Respondeu/.test(txt(h));`);
        const h = await ev(`${H} return txt(document.querySelector('[data-testid="wa-auto-history"]'));`);
        check('Histórico: encerrados com motivo traduzido (Respondeu ✅, Tirado manualmente) e "Depois do Follow Padrão 1: 1 de 2 enviados (50%)"',
          /Respondeu ✅/.test(h) && /Tirado manualmente/.test(h) && /Depois do Follow Padrão 1: 1 de 2 enviados \(50%\)/.test(h) && /Últimos 2 percursos/.test(h), h.slice(0, 500));
        await ev(`${H} const s = document.querySelector('select[aria-label="Filtrar por motivo"]'); s.value = 'manual'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`); await sleep(150);
        check('Histórico: filtro por motivo', /Últimos 1 percursos/.test(await ev(`${H} return txt(document.querySelector('[data-testid="wa-auto-history"]'));`)));
      });
      await step('Envios', async () => {
        await ev(`${H} btn('Envios').click(); return true;`);
        await waitFor(`${H} const h = document.querySelector('[data-testid="wa-auto-sends"]'); return !!h && !!h.querySelector('tbody tr');`);
        const e = await ev(`${H} return $$('[data-testid="wa-auto-sends"] tbody tr').map(txt);`);
        check('Envios: os 3 do log (mais novo primeiro), "Pulado · Não enviar"', e.length === 3 && /Enviado/.test(e[0]) && e.some((x: string) => /Pulado · Não enviar/.test(x)), JSON.stringify(e));
      });
      await step('busca global', async () => {
        await ev(`${H} const i = document.querySelector('input[aria-label="Buscar pessoa"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'ana'); i.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
        await waitFor(`${H} return /Ana Souza/.test(txt(document.querySelector('[data-testid="wa-auto-search"]')));`, 5000);
        const g = await ev(`${H} return txt(document.querySelector('[data-testid="wa-auto-search"]'));`);
        check('busca global: "ana" → Ana Souza na Régua de follow-up, etapa atual e próximo envio', /Ana Souza\s*21 9\*\*\*\*-0001/.test(g) && /Régua de follow-up\s*Esperando resposta \(até 3 h depois de entrar\)\s*→ Recebe Follow Padrão 1/.test(g), g);
      });
      await step('celular', async () => {
        await s('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await ev(`${H} btn('Pessoas').click(); return true;`); await sleep(500);
        const m = await ev(`${H} return { table: !!document.querySelector('[data-testid="wa-auto-people"] table'), list: $$('[data-testid="wa-auto-people"] button').filter((b) => /Recebe/.test(txt(b))).length, sw: document.documentElement.scrollWidth };`);
        await ev(`${H} btn('← Todas').click(); return true;`); await sleep(300);
        const cols = await ev(`${H} const r = cards().map((c) => c.getBoundingClientRect().left); return { lefts: [...new Set(r.map(Math.round))].length, sw: document.documentElement.scrollWidth };`);
        await shot('celular.png', 390);
        check('celular: cards em uma coluna, Pessoas vira lista, sem rolagem lateral', !m.table && m.list === 3 && cols.lefts === 1 && m.sw <= 390 && cols.sw <= 390, JSON.stringify({ m, cols }));
        await s('Emulation.clearDeviceMetricsOverride');
      });
      const q = await ev(`return (window.__QUERIES || []).map((x) => ({ t: x.table, f: x.filters.length }));`);
      const tables = [...new Set(q.map((x: { t: string }) => x.t))];
      const allowed = ['wa_automations', 'wa_sequence_runs', 'wa_contacts', 'wa_contact_labels', 'wa_labels', 'wa_items', 'wa_send_log', 'wa_native_label_seen', 'wa_leads'];
      check('só as tabelas permitidas e as grandes sempre com filtro', tables.every((t) => allowed.includes(t as string)) && q.filter((x: { t: string; f: number }) => /sequence_runs|send_log|contacts|leads|items/.test(x.t) && !x.f).length === 0, JSON.stringify(tables));
    }
    check('nenhum erro no console da página', errors.length === 0, errors.slice(0, 5).join(' | '));
  } catch (e) {
    check('teste rodou até o fim', false, String((e as Error).message || e));
  } finally {
    clearTimeout(timer);
    done();
  }
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} verificações passaram${REAL ? ' (dados reais, somente leitura)' : ''} (Chrome: ${chrome})`);
  if (ok !== results.length) process.exitCode = 1;
}
main();
