// Motor único de envios automáticos (2.0.0): agendados + follows (régua) + disparos.
// Roda no mesmo mundo do content.js (carregado antes dele). Não faz rede nem mexe na página:
// recebe tudo por "deps" (background, ponte do WhatsApp, envio em sequência), por isso dá para
// testar em node. Nunca escreve no console. Textos de mensagens e números de telefone nunca saem
// daqui para o Diagnóstico (o Diagnóstico só lê role/available).
//
// Regras (valem para TODOS os envios automáticos, somados):
//   - só a aba que tem a "trava" (wa_settings.runner_id + lease_until) executa;
//   - nada roda com "Pausar tudo", fora do horário comercial, com o WhatsApp não pronto,
//     ou para contato com a etiqueta CRM "Não enviar";
//   - limites por hora e por dia contam wa_send_log (tudo menos 'pulado');
//   - entre dois contatos, intervalo aleatório entre min_interval_s e max_interval_s;
//   - uma sequência por vez; cada envio é reservado no banco antes;
//   - erro durante o envio ('sending'/sem resposta) = falhou e nunca reenvia.
(function (root) {
  const MIN_MS = 60 * 1000;
  const DAY_MS = 24 * 3600 * 1000;
  const MAX_DAYS_SCAN = 400;
  const DAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const NO_SEND_NAME = 'Não enviar';

  const DEFAULT_SETTINGS = {
    paused_all: false, max_per_hour: 30, max_per_day: 150, min_interval_s: 45, max_interval_s: 120,
    business_start: '09:00', business_end: '19:00', business_days: [1, 2, 3, 4, 5, 6],
  };

  // ── Tempo útil ───────────────────────────────────────────────────────────

  // '09:00' / '09:00:00' → minutos desde a meia-noite (null se inválido)
  function parseHM(v) {
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
    return h * 60 + mi;
  }

  function normSettings(s) {
    const src = { ...DEFAULT_SETTINGS, ...(s || {}) };
    let start = parseHM(src.business_start);
    let end = parseHM(src.business_end);
    if (start == null) start = 9 * 60;
    if (end == null) end = 19 * 60;
    const days = Array.isArray(src.business_days) ? src.business_days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    let min = Number(src.min_interval_s) || 45;
    let max = Number(src.max_interval_s) || 120;
    if (min > max) [min, max] = [max, min];
    return {
      paused: src.paused_all === true,
      maxHour: Math.max(1, Number(src.max_per_hour) || 30),
      maxDay: Math.max(1, Number(src.max_per_day) || 150),
      minGapS: min,
      maxGapS: max,
      startMin: start,
      endMin: end,
      days: new Set(days),
      raw: src,
    };
  }

  const ns = (s) => (s && s.days instanceof Set ? s : normSettings(s));
  const atMinute = (y, m, d, minutes) => new Date(y, m, d, Math.floor(minutes / 60), minutes % 60, 0, 0).getTime();

  // Janela de trabalho do dia que contém ms: [início, fim] em ms (null se o dia não é permitido)
  function windowOfDay(ms, s) {
    const d = new Date(ms);
    if (!s.days.has(d.getDay()) || s.endMin <= s.startMin) return null;
    const y = d.getFullYear(); const mo = d.getMonth(); const da = d.getDate();
    return [atMinute(y, mo, da, s.startMin), atMinute(y, mo, da, s.endMin)];
  }
  const nextMidnight = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };
  const midnightOf = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

  // Milissegundos de horário comercial entre from e to
  function businessMsBetween(from, to, settings) {
    const s = ns(settings);
    if (!(to > from)) return 0;
    let total = 0;
    let day = midnightOf(from);
    for (let i = 0; day < to && i < MAX_DAYS_SCAN; i++) {
      const w = windowOfDay(day, s);
      if (w) total += Math.max(0, Math.min(w[1], to) - Math.max(w[0], from));
      day = nextMidnight(day);
    }
    return total;
  }

  function isBusinessTime(ms, settings) {
    const w = windowOfDay(ms, ns(settings));
    return !!w && ms >= w[0] && ms < w[1];
  }

  // Momento em que se completam needMs de horário comercial a partir de from (null se nunca)
  function addBusinessMs(from, needMs, settings) {
    const s = ns(settings);
    let left = Math.max(0, needMs);
    let day = midnightOf(from);
    for (let i = 0; i < MAX_DAYS_SCAN; i++) {
      const w = windowOfDay(day, s);
      if (w) {
        const a = Math.max(w[0], from);
        if (w[1] > a) {
          if (w[1] - a >= left) return a + left;
          left -= w[1] - a;
        }
      }
      day = nextMidnight(day);
    }
    return null;
  }

  // Próximo início de expediente a partir de ms (ms se já estiver dentro)
  function nextBusinessStart(ms, settings) {
    const s = ns(settings);
    if (isBusinessTime(ms, s)) return ms;
    let day = midnightOf(ms);
    for (let i = 0; i < MAX_DAYS_SCAN; i++) {
      const w = windowOfDay(day, s);
      if (w && w[0] >= ms) return w[0];
      day = nextMidnight(day);
    }
    return null;
  }

  // ── Textos curtos para a tela ────────────────────────────────────────────

  const two = (n) => String(n).padStart(2, '0');
  const hm = (minutes) => `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;

  function formatWait(minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h${two(r)}` : `${h}h`;
  }

  function formatDays(days) {
    const list = [...new Set((days || []).map(Number))].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
    if (!list.length) return 'nenhum dia';
    if (list.length === 7) return 'todos os dias';
    const contiguous = list.every((d, i) => i === 0 || d === list[i - 1] + 1);
    if (contiguous && list.length >= 3) return `${DAY_NAMES[list[0]]}–${DAY_NAMES[list[list.length - 1]]}`;
    return list.map((d) => DAY_NAMES[d]).join(', ');
  }

  function scheduleText(settings) {
    const s = ns(settings);
    return `só ${hm(s.startMin)}–${hm(s.endMin)}, ${formatDays([...s.days])}`;
  }

  function waitText(flow, settings) {
    return `${formatWait(flow.wait_minutes)} sem resposta, ${scheduleText(settings)}, com o WhatsApp Web aberto`;
  }

  function formatLeft(ms) {
    const m = Math.max(0, Math.ceil(ms / MIN_MS));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h${two(m % 60)}`;
    return `${Math.floor(h / 24)} dias`;
  }

  // ── Contato, conversa e mensagem ─────────────────────────────────────────

  // 2.1.0: nome do CRM pelo {nome} inteligente (lista de nomes comuns; ver smartFirstName)
  function firstNameOf(name) {
    return smartFirstName({ crmName: name });
  }

  const CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
  function chatIdOfContact(c) {
    if (c && typeof c.chat_id === 'string' && CHAT_RE.test(c.chat_id)) return c.chat_id;
    if (c && typeof c.phone === 'string' && /^\d{8,15}$/.test(c.phone)) return `${c.phone}@c.us`;
    return null;
  }

  const normKw = (k) => String(k || '').trim().toLowerCase();

  // Variantes em ordem; primeira que bater. Sem nenhuma: item padrão. Sem item: null.
  function pickVariant(flow, contactLabelIds, adMatched) {
    const labels = new Set(contactLabelIds || []);
    const ads = new Set([...(adMatched || [])].map(normKw));
    const variants = [...(flow.variants || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v.item_id) continue;
      if (v.condition === 'etiqueta' && v.label_id && labels.has(v.label_id)) return { itemId: v.item_id, kind: 'etiqueta', index: i, variant: v };
      if (v.condition === 'anuncio' && normKw(v.ad_keyword) && ads.has(normKw(v.ad_keyword))) return { itemId: v.item_id, kind: 'anuncio', index: i, variant: v };
    }
    if (flow.item_id) return { itemId: flow.item_id, kind: 'padrao', index: -1, variant: null };
    return null;
  }

  // Decide o que fazer com um contato numa régua agora.
  // action: 'send' | 'wait' | 'reply' | 'none' | 'skip'
  function evaluateFollow({ flow, contact, contactLabelIds, chat, settings, now, noSendLabelId }) {
    const labels = contactLabelIds || [];
    if (noSendLabelId && labels.includes(noSendLabelId)) return { action: 'skip', reason: 'Não enviar' };
    const chatId = chatIdOfContact(contact);
    if (!chatId) return { action: 'skip', reason: 'sem telefone' };
    if (!chat || !chat.loaded) return { action: 'skip', reason: 'conversa não carregada', chatId };
    if (!chat.last || !Number(chat.last.t)) return { action: 'skip', reason: 'conversa sem mensagens carregadas', chatId };
    if (!chat.last.fromMe) {
      if (flow.reply_label_id) return { action: 'reply', reason: 'respondeu', chatId, toLabelId: flow.reply_label_id };
      return { action: 'none', reason: 'cliente respondeu', chatId };
    }
    const lastMs = Number(chat.last.t) * 1000;
    const maxAge = (Number(flow.ignore_older_days) || 15) * DAY_MS;
    if (now - lastMs > maxAge) return { action: 'skip', reason: 'conversa parada', chatId };
    const needMs = (Number(flow.wait_minutes) || 0) * MIN_MS;
    const spent = businessMsBetween(lastMs, now, settings);
    if (spent < needMs) {
      const dueAt = addBusinessMs(lastMs, needMs, settings);
      return { action: 'wait', reason: 'aguardando', chatId, dueAt, leftMs: dueAt == null ? null : Math.max(0, dueAt - now) };
    }
    const pick = pickVariant(flow, labels, chat.ad || []);
    if (!pick) return { action: 'skip', reason: 'sem mensagem', chatId };
    return { action: 'send', reason: '', chatId, itemId: pick.itemId, variant: pick };
  }

  // ── {nome} inteligente (2.1.0) ───────────────────────────────────────────
  // Nome do CRM; senão a primeira palavra do nome do WhatsApp. Nos dois casos, só se a palavra
  // estiver na lista de nomes brasileiros comuns (data/nomes-br.js), comparando sem acento e sem
  // maiúsculas: o nome do CRM também vem do WhatsApp ("Loja", "Fé em Deus" e emoji são recusados).

  const stripAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nameSet = () => (root.TSP_NOMES_BR instanceof Set ? root.TSP_NOMES_BR : null);

  function firstWordOf(name) {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n) return '';
    const w = n.split(/\s+/)[0].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    return /^\p{L}[\p{L}'-]{1,29}$/u.test(w) ? w : '';
  }

  function isCommonName(word) {
    const list = nameSet();
    return !!list && !!word && list.has(stripAccents(word).toLowerCase());
  }

  const capName = (w) => { const l = w.toLowerCase(); return l.charAt(0).toUpperCase() + l.slice(1); };

  function smartFirstName({ crmName, waName } = {}) {
    for (const src of [crmName, waName]) {
      const w = firstWordOf(src);
      if (w && isCommonName(w)) return capName(w);
    }
    return '';
  }

  // {nome} → nome (vazio sem nome). {, nome} / {Oi nome!} → o trecho inteiro só se houver nome.
  // 2.8.3: sem nome, some também a vírgula/espaço que sobra ("Olá, {nome}!!" → "Olá!!"; "{nome}, tudo bem?" →
  // "Tudo bem?"). {saudacao} → texto do período (manhã/tarde/noite, fuso de São Paulo).
  const NAME_VAR = /\{([^{}]*?)\bnome\b([^{}]*?)\}/gi;
  const GREET_VAR = /\{sauda(?:c|ç)(?:a|ã)o\}/gi;
  const GREET_DEFAULT = { manha: 'Bommmm dia', tarde: 'Uma ótima tarde', noite: 'Uma ótima noite' };
  let greetCfg = { ...GREET_DEFAULT };
  function setGreetings(cfg) {
    const v = cfg || {};
    greetCfg = { manha: v.manha || GREET_DEFAULT.manha, tarde: v.tarde || GREET_DEFAULT.tarde, noite: v.noite || GREET_DEFAULT.noite };
    return greetCfg;
  }
  function spHour(at) {
    const d = at instanceof Date ? at : new Date(at == null ? Date.now() : at);
    try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(d)) % 24; } catch { return d.getHours(); }
  }
  // manhã 5h–11h59, tarde 12h–17h59, noite 18h–4h59
  const greetingPeriod = (at) => { const h = spHour(at); return h >= 5 && h < 12 ? 'manha' : h >= 12 && h < 18 ? 'tarde' : 'noite'; };
  const greetingFor = (at, cfg) => { const c = cfg || greetCfg; return c[greetingPeriod(at)] || GREET_DEFAULT[greetingPeriod(at)]; };
  function fillName(text, name, { at = null, greetings = null } = {}) {
    let out = String(text == null ? '' : text).replace(GREET_VAR, () => greetingFor(at, greetings));
    if (name) return out.replace(NAME_VAR, (m, pre, suf) => `${pre}${name}${suf}`);
    if (!NAME_VAR.test(out)) return out;
    NAME_VAR.lastIndex = 0;
    out = out.replace(NAME_VAR, '\u0000')
      .replace(/,[ \t]*\u0000[ \t]*,/g, ',')
      .replace(/[ \t]*,?[ \t]*\u0000[ \t]*(?=[!?.;:]|$)/gm, '')
      .replace(/^([ \t]*)\u0000[ \t]*[,;:]?[ \t]*(\S)/gm, (m, sp, c) => sp + c.toUpperCase())
      .replace(/[ \t]*,?[ \t]*\u0000/g, '')
      .replace(/[ \t]{2,}/g, ' ');
    return out;
  }

  // 2.8.3: aprender o nome da SUA mensagem: cumprimento + nome ("Olá, Fernanda!!", "Oi Fernanda", "Bom dia, Fernanda").
  // Só a 1ª palavra depois do cumprimento, com maiúscula, só letras, 2–20; palavras que não são nome ficam de fora.
  // 2.9.1: o nome vem DIRETO depois do cumprimento (só vírgula/espaço no meio: "Olá!! Bommmm" não conta) e
  // depois dele só fim do texto ou pontuação (! , . ?), com ou sem espaço antes ("Bommmm dia" não é nome).
  const LEARN_RE = /^\s*(?:ol[áa]+|oi+e?|bo[mn]+\s+dia|boa\s+tarde|boa\s+noite|opa|e\s+a[íi])[ \t]*,?[ \t]*(?<=[ \t,])([^\s,!?.;:]+)(?=$|[ \t]*[!,.?])/iu;
  const NOT_NAMES = new Set(['tudo', 'todos', 'todas', 'pessoal', 'amigo', 'amiga', 'querido', 'querida', 'cliente', 'bem', 'bom', 'boa', 'uma', 'um', 'td',
    'otima', 'otimo', 'excelente', 'feliz', 'dia', 'tarde', 'noite']);
  const normWord = (w) => stripAccents(w).toLowerCase();
  // palavras dos 3 textos da {saudacao} (wa_greetings) também nunca são nome
  const greetWords = (cfg) => new Set(Object.values(cfg || {}).flatMap((t) => String(t || '').split(/[^\p{L}]+/u)).filter(Boolean).map(normWord));
  function learnNameFrom(text, { greetings = null } = {}) {
    const s = String(text || '').slice(0, 200);
    const m = LEARN_RE.exec(s);
    if (!m) return null;
    const word = m[1];
    if (!/^\p{Lu}\p{L}{1,19}$/u.test(word)) return null;
    const w = normWord(word);
    if (NOT_NAMES.has(w) || /^bo[ma]/.test(w)) return null;
    if (greetWords(greetings || greetCfg).has(w)) return null;
    return capName(word);
  }
  const hasNameVar = (text) => /\{[^{}]*?\bnome\b[^{}]*?\}/i.test(String(text || ''));

  // ── 2.12.1: leituras/gravações do painel com 3 tentativas e o motivo real do erro ──
  // Não repete o que nunca vai dar certo: extensão atualizada (aba velha), dado inválido, banco sem a migration.
  const RETRY_NEVER = /Recarregue o WhatsApp|context invalidated|inv[áa]lid|Atualize o banco/i;
  async function withRetry(fn, { tries = 3, waitMs = 700, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    let last = null;
    for (let i = 0; i < tries; i++) {
      try { return await fn(i); } catch (e) {
        last = e;
        if (RETRY_NEVER.test(String(e && e.message))) break;
        if (i < tries - 1) await sleep(waitMs * (i + 1));
      }
    }
    throw last;
  }
  // Mensagem técnica (do background / Supabase) → explicação curta em português
  function errorReason(msg) {
    const m = String(msg == null ? '' : msg).trim();
    const code = Number((m.match(/^Supabase (\d{3})/) || [])[1]) || 0;
    if (/Recarregue o WhatsApp|context invalidated/i.test(m)) return 'A extensão foi atualizada e esta aba ficou com a versão antiga: recarregue o WhatsApp (F5).';
    if (/Sem resposta da extensão|message port closed|Receiving end does not exist|Could not establish connection/i.test(m)) return 'A extensão não respondeu (o serviço dela estava reiniciando).';
    if (!code && /Failed to fetch|NetworkError|network|ERR_/i.test(m)) return 'Sem conexão com o Supabase (internet caiu ou o Supabase está fora do ar).';
    if (code === 401 || /\bJWT\b|jwt expired/i.test(m)) return 'Sessão expirada ou sem permissão no Supabase (401). Se continuar, entre de novo na conta da extensão.';
    if (code === 403) return 'Sem permissão para ler estes dados no Supabase (403).';
    if (code >= 500 || /57014|timeout|tempo esgotado/i.test(m)) return `O Supabase deu erro ou demorou demais${code ? ` (${code})` : ''}.`;
    if (/Identificação inválida|Telefone inválido|Conversa inválida/.test(m)) return `Não consegui identificar esta conversa (${m}).`;
    if (code) return `Consulta recusada pelo Supabase (${code}).`;
    return m || 'erro desconhecido';
  }
  // Aprender o nome da SUA mensagem sem perder: o que não gravou (rede, extensão reiniciando) fica guardado e
  // tenta de novo (8 s, 16 s, 32 s… até 5 min). Antes da 2.12.1 a fila da ponte era esvaziada e uma falha
  // de gravação perdia o nome para sempre.
  const LEARN_CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
  function createNameLearner({ save, learn = learnNameFrom, blocked = () => false, now = () => Date.now(), maxPending = 100 } = {}) {
    const pending = new Map(); // chatId → { name, tries, next }
    const errors = new Map(); // chatId → { name, reason, detail, tries }
    return {
      push(msgs) {
        let added = 0;
        (msgs || []).forEach((x) => {
          const n = x && learn(x.head);
          if (!n || !LEARN_CHAT_RE.test(String(x.chatId || '')) || blocked(x.chatId)) return;
          pending.delete(x.chatId); // a mais nova vale
          pending.set(x.chatId, { name: n, tries: 0, next: 0 });
          errors.delete(x.chatId);
          added++;
        });
        while (pending.size > maxPending) pending.delete(pending.keys().next().value);
        return added;
      },
      async flush({ force = false, only = null } = {}) {
        const done = [];
        for (const [chatId, p] of [...pending]) {
          if (only && chatId !== only) continue;
          if (!force && p.next > now()) continue;
          try {
            const result = await save(chatId, p.name);
            if (pending.get(chatId) === p) pending.delete(chatId);
            errors.delete(chatId);
            done.push({ chatId, name: p.name, result });
          } catch (e) {
            const detail = String((e && e.message) || e);
            p.tries++;
            p.next = now() + Math.min(5 * 60 * 1000, 4000 * 2 ** p.tries);
            errors.set(chatId, { name: p.name, reason: errorReason(detail), detail, tries: p.tries });
            if (RETRY_NEVER.test(detail) && !/Recarregue o WhatsApp|context invalidated/i.test(detail)) pending.delete(chatId);
          }
        }
        return done;
      },
      error: (chatId) => errors.get(chatId) || null,
      pending: (chatId) => pending.get(chatId) || null,
      size: () => pending.size,
    };
  }

  // ── 2.10.2: painel personalizável (só visual; guardado no storage local, por computador) ──
  // tabs: abas na barra (as outras vão para "Mais"; Mensagens nunca some). filters: chips além de "Tudo".
  // convBtns: botões da conversa. density: confortavel | compacta. collapsed: blocos do topo recolhidos.
  // topH: altura máxima do topo em px (null = padrão, sem limite).
  const PANEL_TABS = ['midias', 'etiquetas', 'vendas', 'conversoes', 'quadro', 'agendados', 'disparos', 'follows'];
  const PANEL_FILTERS = ['mais_usadas', 'texto', 'audio', 'imagem', 'video', 'documento', 'localizacao', 'produto', 'catalogo', 'contato', 'pix'];
  const PANEL_BLOCKS = ['conv', 'etiquetas', 'nome', 'busca'];
  const PANEL_CONV_BTNS = ['venda', 'compra', 'automacao', 'proxima']; // 2.10.3: + Próxima conversa
  const PANEL_HDR_BTNS = ['venda', 'compra', 'agendar', 'etiqueta']; // 2.12.1: atalhos no cabeçalho da conversa
  function defaultPanelPrefs() {
    return {
      tabs: { midias: true, etiquetas: true, vendas: true, conversoes: true, quadro: false, agendados: false, disparos: false, follows: false },
      filters: ['mais_usadas', 'texto', 'audio', 'imagem', 'video'],
      convBtns: { venda: true, compra: true, automacao: true, proxima: true },
      hdr: { on: true, venda: true, compra: true, agendar: true, etiqueta: true }, // 2.12.1
      hdrHidePanel: false, // 2.12.1: com os atalhos ligados, esconder do painel Venda / Compra / Automação
      density: 'confortavel',
      keepListPos: true, // 2.10.3: manter a posição da lista de conversas ao enviar
      collapsed: { conv: false, etiquetas: false, nome: false, busca: false },
      topH: null,
    };
  }
  function normPanelPrefs(raw) {
    const d = defaultPanelPrefs();
    const r = raw && typeof raw === 'object' ? raw : {};
    const bools = (src, keys, base) => keys.reduce((o, k) => { o[k] = src && typeof src[k] === 'boolean' ? src[k] : base[k]; return o; }, {});
    const filters = Array.isArray(r.filters) ? [...new Set(r.filters.filter((f) => PANEL_FILTERS.includes(f)))] : d.filters;
    const h = Number(r.topH);
    return {
      tabs: bools(r.tabs, PANEL_TABS, d.tabs),
      filters: PANEL_FILTERS.filter((f) => filters.includes(f)), // sempre na ordem dos chips
      convBtns: bools(r.convBtns, PANEL_CONV_BTNS, d.convBtns),
      hdr: bools(r.hdr, ['on', ...PANEL_HDR_BTNS], d.hdr),
      hdrHidePanel: typeof r.hdrHidePanel === 'boolean' ? r.hdrHidePanel : d.hdrHidePanel,
      density: r.density === 'compacta' ? 'compacta' : 'confortavel',
      keepListPos: typeof r.keepListPos === 'boolean' ? r.keepListPos : d.keepListPos,
      collapsed: bools(r.collapsed, PANEL_BLOCKS, d.collapsed),
      topH: r.topH != null && Number.isFinite(h) ? Math.round(Math.min(2000, Math.max(48, h))) : null,
    };
  }
  // ── 2.10.5: ligar a Compra do 📈 à venda do ERP ──
  // Mesma normalização de telefone do painel do ERP: 10/11 dígitos ganham o 55; 12/13 começando com 55 ficam.
  function normBrPhone(raw) {
    const d = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) return `55${d}`;
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
    return null;
  }
  const spDayOf = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
  const saleDayOf = (s) => { const t = Date.parse(s && s.sale_date); return Number.isFinite(t) ? spDayOf(t) : String((s && s.sale_date) || '').slice(0, 10); };
  // byPhone: vendas dos últimos 7 dias com o telefone desta conversa (ou já desta conversa pelo 💰).
  // byValue (só sem byPhone): vendas dos últimos 3 dias sem telefone ou com telefone diferente, com valor ±10%.
  // Nunca: canceladas/reembolsadas, ligadas a outra conversa (wa_chat_id) ou a outra compra (taken).
  function matchSalesForPurchase({ sales, chatId, phone, value, now = Date.now(), taken = [] }) {
    const target = normBrPhone(phone);
    const takenSet = new Set(taken || []);
    const v = Number(value);
    const from7 = spDayOf(now - 7 * 86400000);
    const from3 = spDayOf(now - 3 * 86400000);
    const ok = (s) => s && s.id && !['cancelado', 'reembolsado'].includes(s.status) && !takenSet.has(s.id) && (!s.wa_chat_id || s.wa_chat_id === chatId);
    const newest = (a, b) => String(b.sale_date || '').localeCompare(String(a.sale_date || ''));
    const list = Array.isArray(sales) ? sales : [];
    const byPhone = list.filter((s) => ok(s) && saleDayOf(s) >= from7
      && ((target && normBrPhone(s.customer_phone) === target) || (chatId && s.wa_chat_id === chatId))).sort(newest);
    const byValue = byPhone.length || !(v > 0) ? [] : list.filter((s) => ok(s) && !s.wa_chat_id && saleDayOf(s) >= from3
      && (!target || normBrPhone(s.customer_phone) !== target)
      && Math.abs((Number(s.total_sale_price) || 0) - v) <= v * 0.1 + 0.005)
      .sort((a, b) => Math.abs((Number(a.total_sale_price) || 0) - v) - Math.abs((Number(b.total_sale_price) || 0) - v) || newest(a, b))
      .slice(0, 10);
    return { byPhone, byValue };
  }
  // telefone que a ligação grava na venda sem telefone: "(11) 93333-4444" (o ERP normaliza do mesmo jeito)
  function salePhoneOf(raw) {
    const n = normBrPhone(raw);
    if (!n) return null;
    const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(n);
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
  }

  // ── 2.10.4: prévia — tirar partes (e fotos do álbum) só deste envio ──
  // skip: índices das partes tiradas; skipFiles: { [parte]: [índices das fotos tiradas] }. A mensagem salva não
  // muda. Álbum com 1 foto sobrando vira imagem/vídeo normal; com 0, a parte sai. O "esperar" e o "digitando"
  // das partes tiradas não contam no tempo total.
  function previewSendPlan(parts, skip = [], skipFiles = {}) {
    const off = new Set(skip || []);
    const out = [];
    (parts || []).forEach((p, i) => {
      if (!p || off.has(i)) return;
      if (Array.isArray(p.files) && p.files.length > 1) {
        const gone = new Set((skipFiles && skipFiles[i]) || []);
        const before = !!(p.caption_before || (p.files[0] && p.files[0].caption_before));
        const files = p.files.filter((_, k) => !gone.has(k)).map((f) => { const c = { ...f }; delete c.caption_before; return c; });
        if (!files.length) return;
        const first = files[0];
        if (files.length === 1) {
          const single = { ...p, type: first.kind === 'video' ? 'video' : 'imagem', file_url: first.file_url, file_name: first.file_name, file_size: first.file_size ?? null };
          delete single.files;
          delete single.caption_before;
          out.push(single);
          return;
        }
        if (before) files[0].caption_before = true;
        out.push({ ...p, files, file_url: first.file_url, file_name: first.file_name, file_size: first.file_size ?? null });
        return;
      }
      out.push(p);
    });
    const seconds = out.reduce((s, p) => s + (Number(p.wait_seconds) || 0) + (Number.isInteger(p.typing_seconds) ? p.typing_seconds : 0), 0);
    return { parts: out, seconds, empty: out.length === 0 };
  }
  // etiquetas "Ao enviar" (CRM e WhatsApp): quando as partes escolhidas saíram e pelo menos uma foi enviada
  const sendLabelsApply = (res) => !!res && res.status === 'ok' && (Number(res.sent) || 0) > 0;

  // ── 2.10.3: manter a posição da lista de conversas ao enviar ──
  // Depois de um envio SEU (até 2 s), se a lista pulou para o topo sem você mexer nela, volta para onde você
  // estava + 1 linha (a conversa que recebeu a mensagem subiu para o topo e as de cima desceram uma linha:
  // assim as mesmas conversas continuam na tela). Você rolou ou clicou na lista depois do envio: não mexe.
  const LIST_KEEP_MS = 2000;
  function listShouldRestore({ enabled, now, armAt, userAt, scrollTop, saved, restores }) {
    if (!enabled || !armAt || now - armAt > LIST_KEEP_MS) return false;
    if (userAt >= armAt) return false;
    if (saved == null || saved <= 8 || scrollTop > 8) return false;
    return (restores || 0) < 3;
  }
  const listRestoreTarget = ({ saved, rowH, scrollHeight, clientHeight }) =>
    Math.round(Math.max(0, Math.min(Math.max(0, (scrollHeight || 0) - (clientHeight || 0)), (saved || 0) + Math.min(120, Math.max(40, Number(rowH) || 72)))));

  // altura do topo ao arrastar a divisória: entre 48 px e o que deixa ~160 px para a lista
  const clampTopH = (h, panelH) => Math.round(Math.max(48, Math.min(Math.max(48, (Number(panelH) || 0) - 160), Number(h) || 0)));

  // ── 2.10.0: painel de resultados — o que gravar a partir das mensagens das conversas ──
  // events: { chatId, fromMe, t (s), first?, ad?, phone?, scan? } (da ponte). isExt(chatId, t): mensagem
  // enviada pela extensão nesta aba (já registrada de outro jeito). Devolve:
  //   leads   : 1ª mensagem do cliente numa conversa sem mensagens antes
  //   manual  : o que você digitou, uma vez por "vez de falar" da loja (o cliente falou depois do nosso
  //             último envio, ou 30 min sem a loja falar, ou a 1ª vez que vemos a conversa)
  //   replies : 1ª mensagem do cliente depois de uma mensagem nossa (as seguintes, até a loja falar de
  //             novo, não contam; o banco ainda confere com o último envio registrado)
  //   activity: 2.12.2 — por conversa, a hora da última mensagem (t) e a da última com sinal de compra
  //             (buy, ou null); a varredura da abertura não entra
  const TURN_GAP_S = 30 * 60;
  function convTracker() {
    const lastOur = new Map();
    const lastCust = new Map();
    const replied = new Map();
    return {
      ingest(events, isExt = () => false) {
        const out = { leads: [], manual: [], replies: [], activity: [] };
        const act = new Map();
        [...(events || [])].filter((e) => e && typeof e.chatId === 'string' && Number.isFinite(Number(e.t)))
          .sort((a, b) => a.t - b.t).forEach((e) => {
            const chat = e.chatId;
            if (!e.fromMe && e.first) out.leads.push({ chatId: chat, phone: e.phone || null, t: e.t, ad: e.ad || null });
            if (e.scan) return; // varredura da abertura: só o lead
            const a = act.get(chat) || { chatId: chat, t: e.t, buy: null };
            a.t = Math.max(a.t, e.t);
            if (e.buy === true) a.buy = Math.max(a.buy ?? 0, e.t);
            act.set(chat, a);
            if (e.fromMe) {
              const prev = lastOur.get(chat);
              const cust = lastCust.get(chat);
              const newTurn = prev === undefined || (cust !== undefined && cust > prev) || e.t - prev > TURN_GAP_S;
              if (newTurn && !isExt(chat, e.t)) out.manual.push({ chatId: chat, t: e.t });
              lastOur.set(chat, Math.max(prev ?? 0, e.t));
              return;
            }
            lastCust.set(chat, e.t);
            const our = lastOur.has(chat) ? lastOur.get(chat) : -Infinity;
            const rep = replied.get(chat);
            if (rep === undefined || rep < our) {
              out.replies.push({ chatId: chat, t: e.t, phone: e.phone || null });
              replied.set(chat, e.t);
            }
          });
        out.activity = [...act.values()];
        return out;
      },
    };
  }

  // ── Automações (2.1.0): QUANDO → SE → ENTÃO ─────────────────────────────

  // 2.3.0: 'venda_registrada' = venda registrada pela conversa (migration 20261103170000)
  const TRIGGER_TYPES = ['sem_resposta', 'entrou_etiqueta', 'respondeu', 'dia_hora', 'venda_registrada'];
  const FUTURE_TRIGGERS = [];

  const dateKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
  const linkOf = (contact, labelId) => (contact.links || []).find((l) => l.label_id === labelId) || null;

  // 2.5.0: gatilho com etiqueta do WhatsApp (nativa) em vez da etiqueta CRM
  const isWaTrigger = (a) => !!a && a.trigger_label_source === 'whatsapp';
  const WA_LABEL_ACTIONS = ['adicionar_etiqueta_wa', 'remover_etiqueta_wa'];

  function automationNeedsChat(a) {
    return a.trigger_type === 'sem_resposta' || a.trigger_type === 'respondeu'
      || (a.conditions || []).some((c) => c.type === 'anuncio' || c.type === 'parada_max_dias')
      || (a.actions || []).some((x) => x.type === 'enviar' || WA_LABEL_ACTIONS.includes(x.type) || (x.type === 'mover' && isWaTrigger(a)));
  }

  // 2.5.0: como o contato está na automação (null = não está).
  //   inscricao: "Adicionar à automação" na conversa — conta a partir de enrolled_at (vale mais que a etiqueta)
  //   whatsapp : etiqueta nativa — "entrou em" = primeira vez que a extensão viu a conversa nela (first_seen_at)
  //   crm      : etiqueta CRM — "entrou em" = created_at da ligação contato↔etiqueta
  // key identifica ESTA entrada (run_key): sair e entrar de novo gera outra key.
  function automationEntry(a, contact, { ignoreEnrollment = false } = {}) {
    const enrolled = !ignoreEnrollment && contact.enrolled ? contact.enrolled[a.id] : null;
    if (enrolled) {
      const t = Date.parse(enrolled);
      return { via: 'inscricao', at: Number.isFinite(t) ? t : null, key: `insc@${Number.isFinite(t) ? t : 0}` };
    }
    if (isWaTrigger(a)) {
      const seen = a.trigger_wa_label_id && contact.waSeen ? contact.waSeen[a.trigger_wa_label_id] : null;
      if (!seen) return null;
      const t = Date.parse(seen);
      return { via: 'whatsapp', at: Number.isFinite(t) ? t : null, key: `wa${a.trigger_wa_label_id}@${Number.isFinite(t) ? t : 0}` };
    }
    if (!a.trigger_label_id || !(contact.labelIds || []).includes(a.trigger_label_id)) return null;
    const link = linkOf(contact, a.trigger_label_id);
    const t = link && link.created_at ? Date.parse(link.created_at) : null;
    return { via: 'crm', at: Number.isFinite(t) ? t : null, key: `${a.trigger_label_id}@${Number.isFinite(t) ? t : 0}` };
  }
  // "Tirar desta automação" grava esta run_key: a entrada atual não roda mais (entrar de novo vale)
  const leaveKey = (entryKey) => `fora@${entryKey}`;

  // Palavras de anúncio que a ponte precisa procurar (condições + variantes)
  function automationKeywords(a) {
    const out = [];
    (a.conditions || []).forEach((c) => { if (c.type === 'anuncio') out.push(normKw(c.keyword)); });
    (a.actions || []).forEach((x) => { if (x.type === 'enviar') (x.variants || []).forEach((v) => { if (v.when === 'anuncio') out.push(normKw(v.keyword)); }); });
    return [...new Set(out.filter(Boolean))];
  }

  function resolveSendItem(action, labels, ads) {
    const has = new Set(labels || []);
    const ad = new Set([...(ads || [])].map(normKw));
    for (const v of action.variants || []) {
      if (v.when === 'etiqueta' && v.label_id && has.has(v.label_id) && v.item_id) return { itemId: v.item_id, kind: 'etiqueta', variant: v };
      if (v.when === 'anuncio' && normKw(v.keyword) && ad.has(normKw(v.keyword)) && v.item_id) return { itemId: v.item_id, kind: 'anuncio', variant: v };
    }
    return action.item_id ? { itemId: action.item_id, kind: 'padrao', variant: null } : null;
  }

  // Próximo dia/hora de um gatilho dia_hora a partir de now (ms) — null se não houver dias
  function nextScheduleAt(a, now) {
    const t = parseHM(a.schedule_time);
    const days = new Set(a.schedule_days || []);
    if (t == null || !days.size) return null;
    let day = midnightOf(now);
    for (let i = 0; i < 8; i++) {
      const d = new Date(day);
      const at = atMinute(d.getFullYear(), d.getMonth(), d.getDate(), t);
      if (days.has(d.getDay()) && at > now) return at;
      day = nextMidnight(day);
    }
    return null;
  }

  // Decide o que fazer com uma automação para um contato agora.
  // action: 'run' (com runKey e plan) | 'wait' (dueAt) | 'none' | 'skip' | 'done' (já rodou)
  function evaluateAutomation({ automation: a, contact, chat, settings, now, noSendLabelId, ranKeys }) {
    const labels = contact.labelIds || [];
    const saleTrigger = a.trigger_type === 'venda_registrada';
    if (saleTrigger && !contact.sale_id) return { action: 'skip', reason: 'sem venda registrada' };
    if (saleTrigger && a.trigger_label_id && !labels.includes(a.trigger_label_id)) return { action: 'skip', reason: 'fora da etiqueta do gatilho' };
    const entry = saleTrigger ? null : automationEntry(a, contact);
    if (!saleTrigger && !entry) return { action: 'skip', reason: 'fora da etiqueta do gatilho' };
    // 2.8.8: modo teste (só a conversa escolhida) e "só daqui pra frente" (a partir da ativação/edição)
    if (a.test_chat_id && chatIdOfContact(contact) !== a.test_chat_id) return { action: 'skip', reason: 'em teste: só a conversa escolhida' };
    const activatedAt = a.activated_at ? Date.parse(a.activated_at) : NaN;
    if (Number.isFinite(activatedAt)) {
      if (saleTrigger) {
        const saleAt = Date.parse(contact.sale_at || '');
        if (!Number.isFinite(saleAt) || saleAt < activatedAt) return { action: 'skip', reason: 'venda anterior à ativação' };
      } else if (!a.include_existing && a.trigger_type !== 'dia_hora' && entry.via !== 'inscricao' && (!Number.isFinite(entry.at) || entry.at < activatedAt)) {
        return { action: 'skip', reason: 'já estava na etiqueta antes de ativar' };
      }
    }
    if (entry && ranKeys && ranKeys.has(`${a.id}:${contact.id}:${leaveKey(entry.key)}`)) return { action: 'done', reason: 'tirado da automação', entry };
    if (noSendLabelId && labels.includes(noSendLabelId)) return { action: 'skip', reason: 'Não enviar' };
    const needsChat = automationNeedsChat(a);
    const chatId = chatIdOfContact(contact);
    if (needsChat && !chatId) return { action: 'skip', reason: 'sem telefone' };
    if (needsChat && (!chat || !chat.loaded)) return { action: 'skip', reason: 'conversa não carregada', chatId };
    const last = chat && chat.last && Number(chat.last.t) ? chat.last : null;
    const enteredAt = entry ? entry.at : null;
    const labelKey = entry ? entry.key : '';
    // Inscrição manual: conta a partir de AGORA (enrolled_at), nunca do que aconteceu antes
    const manual = !!entry && entry.via === 'inscricao' && Number.isFinite(enteredAt);
    let runKey;
    if (a.trigger_type === 'sem_resposta') {
      if (!last) return { action: 'skip', reason: 'conversa sem mensagens carregadas', chatId };
      if (!last.fromMe) return { action: 'none', reason: 'cliente respondeu', chatId };
      const lastMs = Number(last.t) * 1000;
      if (now - lastMs > (Number(a.ignore_older_days) || 15) * DAY_MS) return { action: 'skip', reason: 'conversa parada', chatId };
      const need = (Number(a.wait_minutes) || 0) * MIN_MS;
      const fromMs = manual ? Math.max(lastMs, enteredAt) : lastMs;
      if (businessMsBetween(fromMs, now, settings) < need) {
        const dueAt = addBusinessMs(fromMs, need, settings);
        return { action: 'wait', reason: 'aguardando', chatId, dueAt, leftMs: dueAt == null ? null : Math.max(0, dueAt - now), entry };
      }
      runKey = labelKey;
    } else if (a.trigger_type === 'entrou_etiqueta') {
      if (!Number.isFinite(enteredAt)) return { action: 'skip', reason: 'sem data de entrada na etiqueta', chatId };
      const dueAt = enteredAt + (Number(a.wait_minutes) || 0) * MIN_MS;
      if (now < dueAt) return { action: 'wait', reason: 'aguardando', chatId, dueAt, leftMs: dueAt - now, entry };
      runKey = labelKey;
    } else if (a.trigger_type === 'respondeu') {
      if (!last) return { action: 'skip', reason: 'conversa sem mensagens carregadas', chatId };
      if (last.fromMe) return { action: 'none', reason: 'ainda não respondeu', chatId };
      if (manual && Number(last.t) * 1000 < enteredAt) return { action: 'none', reason: 'ainda não respondeu', chatId };
      runKey = labelKey;
    } else if (saleTrigger) {
      // 2.11.0: "X dias depois da venda" (tempo corrido desde o registro); sem espera = na hora
      const waitMs = (Number(a.wait_minutes) || 0) * MIN_MS;
      const saleAt = Date.parse(contact.sale_at || '');
      if (waitMs > 0 && Number.isFinite(saleAt) && now < saleAt + waitMs) return { action: 'wait', reason: 'aguardando', chatId, dueAt: saleAt + waitMs, leftMs: saleAt + waitMs - now, entry };
      runKey = `venda@${contact.sale_id}`; // uma vez por venda
    } else if (a.trigger_type === 'dia_hora') {
      const t = parseHM(a.schedule_time);
      const d = new Date(now);
      const todayAt = t == null ? null : atMinute(d.getFullYear(), d.getMonth(), d.getDate(), t);
      const fromAct = Number.isFinite(activatedAt) ? activatedAt : 0; // 2.8.8: o dia/hora de antes da ativação não conta
      if (todayAt == null || !(a.schedule_days || []).includes(d.getDay()) || now < todayAt || (manual && todayAt < enteredAt) || todayAt < fromAct) {
        const dueAt = nextScheduleAt(a, Math.max(now, manual ? enteredAt : 0, fromAct));
        return { action: 'wait', reason: 'aguardando o dia/hora', chatId, dueAt, leftMs: dueAt == null ? null : dueAt - now, entry };
      }
      runKey = `dia@${dateKey(now)}`;
    } else {
      return { action: 'skip', reason: 'gatilho desativado' };
    }
    if (ranKeys && ranKeys.has(`${a.id}:${contact.id}:${runKey}`)) return { action: 'done', reason: 'já rodou', chatId, runKey, entry };
    for (const c of a.conditions || []) {
      let okC = true;
      if (c.type === 'tem_etiqueta') okC = labels.includes(c.label_id);
      else if (c.type === 'nao_tem_etiqueta') okC = !labels.includes(c.label_id);
      else if (c.type === 'anuncio') okC = !!chat && (chat.ad || []).map(normKw).includes(normKw(c.keyword));
      else if (c.type === 'parada_max_dias') okC = !!last && now - Number(last.t) * 1000 <= (Number(c.days) || 0) * DAY_MS;
      if (!okC) return { action: 'skip', reason: 'condição não bateu', chatId, condition: c };
    }
    const plan = [];
    for (const x of a.actions || []) {
      if (x.type === 'parar') break;
      if (x.type === 'enviar') {
        const pick = resolveSendItem(x, labels, chat ? chat.ad : []);
        if (!pick) return { action: 'skip', reason: 'sem mensagem', chatId };
        plan.push({ type: 'enviar', itemId: pick.itemId, pick });
      } else if (WA_LABEL_ACTIONS.includes(x.type)) plan.push({ type: x.type, wa_label_id: x.wa_label_id });
      else plan.push({ type: x.type, label_id: x.label_id });
    }
    if (!plan.length) return { action: 'skip', reason: 'nenhuma ação', chatId };
    return { action: 'run', reason: '', chatId, runKey, plan, entry };
  }

  // Frase-resumo "QUANDO … → SE … → ENTÃO …"
  function waitPhrase(minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    if (m >= 1440 && m % 1440 === 0) { const d = m / 1440; return `${d} dia${d === 1 ? '' : 's'}`; }
    return formatWait(m);
  }

  function automationSummary(a, { labelName = (id) => id, waLabelName = (id) => id, itemTitle = (id) => id, settings } = {}) {
    const lab = (id) => `"${id ? labelName(id) : '?'}"`;
    const wlab = (id) => `do WhatsApp "${id ? waLabelName(id) : '?'}"`;
    const trig = isWaTrigger(a) && a.trigger_type !== 'venda_registrada' ? wlab(a.trigger_wa_label_id) : lab(a.trigger_label_id);
    let quando;
    if (a.trigger_type === 'sem_resposta') quando = `Quando o contato da etiqueta ${trig} fica ${formatWait(a.wait_minutes)} úteis sem responder (${scheduleText(settings)})`;
    else if (a.trigger_type === 'entrou_etiqueta') quando = `Quando faz ${waitPhrase(a.wait_minutes)} que o contato entrou na etiqueta ${trig}`;
    else if (a.trigger_type === 'respondeu') quando = `Quando o contato da etiqueta ${trig} responde`;
    else if (a.trigger_type === 'venda_registrada') quando = `Quando uma venda for registrada pela conversa${Number(a.wait_minutes) > 0 ? `, ${waitPhrase(a.wait_minutes)} depois` : ''}${a.trigger_label_id ? ` (só quem está na etiqueta ${lab(a.trigger_label_id)})` : ''}`;
    else if (a.trigger_type === 'dia_hora') quando = `Toda ${formatDays(a.schedule_days || [])} às ${String(a.schedule_time || '').slice(0, 5) || '?'}, para quem está na etiqueta ${trig}`;
    else quando = 'Quando (gatilho não escolhido)';
    const conds = (a.conditions || []).map((c) => {
      if (c.type === 'tem_etiqueta') return `tem a etiqueta ${lab(c.label_id)}`;
      if (c.type === 'nao_tem_etiqueta') return `não tem a etiqueta ${lab(c.label_id)}`;
      if (c.type === 'anuncio') return `veio do anúncio com "${c.keyword || '?'}"`;
      if (c.type === 'parada_max_dias') return `a conversa está parada há no máximo ${c.days} dia${Number(c.days) === 1 ? '' : 's'}`;
      return '?';
    });
    const se = conds.length ? `Se ${conds.join(' e ')}` : 'Sem condições';
    const acts = [];
    for (const x of a.actions || []) {
      if (x.type === 'parar') { acts.push('para'); break; }
      if (x.type === 'enviar') {
        const vs = (x.variants || []).map((v) => (v.when === 'etiqueta' ? `se tem ${lab(v.label_id)}: "${itemTitle(v.item_id)}"` : `se veio do anúncio com "${v.keyword}": "${itemTitle(v.item_id)}"`));
        const base = x.item_id ? `"${itemTitle(x.item_id)}"` : '(nada se nenhuma variante bater)';
        acts.push(`envia ${base}${vs.length ? ` (${vs.join('; ')})` : ''}`);
      } else if (x.type === 'adicionar_etiqueta') acts.push(`adiciona a etiqueta ${lab(x.label_id)}`);
      else if (x.type === 'remover_etiqueta') acts.push(`tira a etiqueta ${lab(x.label_id)}`);
      else if (x.type === 'mover') acts.push(`move para ${lab(x.label_id)}${isWaTrigger(a) ? ` (tira a etiqueta ${trig})` : ''}`);
      else if (x.type === 'adicionar_etiqueta_wa') acts.push(`adiciona a etiqueta ${wlab(x.wa_label_id)}`);
      else if (x.type === 'remover_etiqueta_wa') acts.push(`tira a etiqueta ${wlab(x.wa_label_id)}`);
    }
    const entao = acts.length ? `Então ${acts.join(', depois ')}` : 'Então (nenhuma ação)';
    return { quando, se, entao, text: `${quando} → ${se} → ${entao}` };
  }

  // Modelos prontos: só preenchem o editor (etiquetas pelo nome; o editor oferece "criar agora")
  const AUTOMATION_TEMPLATES = [
    { key: 'follow_venda', title: 'Follow de venda', name: 'Follow de venda', trigger_type: 'sem_resposta', trigger_label: 'Follow 1', wait_minutes: 120,
      actions: [{ type: 'enviar', hint: 'a mensagem de follow' }, { type: 'mover', label: 'Follow 2' }] },
    { key: 'avaliacao', title: 'Pedido de avaliação', name: 'Pedido de avaliação', trigger_type: 'entrou_etiqueta', trigger_label: 'Cliente', wait_minutes: 15 * 1440,
      actions: [{ type: 'enviar', hint: 'a mensagem com o link de avaliação do Google' }, { type: 'mover', label: 'Avaliação pedida' }] },
    { key: 'recompra', title: 'Recompra', name: 'Recompra', trigger_type: 'entrou_etiqueta', trigger_label: 'Cliente', wait_minutes: 60 * 1440,
      actions: [{ type: 'enviar', hint: 'a oferta de recompra' }, { type: 'adicionar_etiqueta', label: 'Recompra enviada' }] },
    { key: 'garantia', title: 'Garantia vencendo', name: 'Garantia vencendo', trigger_type: 'entrou_etiqueta', trigger_label: 'Cliente', wait_minutes: 335 * 1440,
      actions: [{ type: 'enviar', hint: 'o aviso de garantia' }, { type: 'adicionar_etiqueta', label: 'Garantia avisada' }] },
    // 2.2.0: o "remover" segue a etiqueta do gatilho (followsTrigger)
    { key: 'respondeu_regua', title: 'Respondeu → tirar da régua', name: 'Respondeu → tirar da régua', trigger_type: 'respondeu', trigger_label: 'Follow 1',
      help: 'Quem respondeu sai da régua e aparece na coluna Responder do Quadro para você decidir o próximo passo.',
      actions: [{ type: 'remover_etiqueta', followsTrigger: true }, { type: 'adicionar_etiqueta', label: 'Responder' }] },
  ];

  // ── 2.12.0: SEQUÊNCIA com caminhos "Respondeu / Não respondeu" ──
  // def = { start, business, steps: [passo] } — passos (lista de cima para baixo):
  //   { id, type: 'enviar', item_id }
  //   { id, type: 'etiqueta', op: 'colocar'|'tirar', source: 'crm'|'whatsapp', label_id | wa_label_id, remove_others? (colocar: tira todas as outras) }
  //   { id, type: 'esperar', amount, unit: 'minutos'|'horas'|'dias', after_mine?, yes: [passos], no: [passos] }
  //   { id, type: 'fim' } | { id, type: 'ir', to: id }   (fim da lista = Fim)
  // start = { type: 'lead'|'etiqueta'|'venda'|'manual', origin: 'todos'|'anuncio'|'organico', source, label_id, wa_label_id }
  const SEQ_MAX_DEPTH = 5;
  const SEQ_UNIT_MIN = { minutos: 1, horas: 60, dias: 1440 };
  function seqIndex(def) {
    const map = new Map();
    const walk = (list, depth, parent) => (list || []).forEach((n, i) => {
      if (!n || !n.id) return;
      map.set(n.id, { node: n, list, i, depth, parent });
      if (n.type === 'esperar') { walk(n.yes, depth + 1, { id: n.id, branch: 'yes' }); walk(n.no, depth + 1, { id: n.id, branch: 'no' }); }
    });
    walk(def && def.steps, 1, null);
    return map;
  }
  const seqNextOf = (idx, id) => { const e = idx.get(id); const n = e && e.list[e.i + 1]; return n ? n.id : null; };
  const seqFirstOf = (list) => (list && list[0] ? list[0].id : null);
  const seqOutcome = (branches) => { const b = (branches || [])[branches.length - 1]; return b ? (b.result === 'sim' ? 'respondeu' : 'nao_respondeu') : 'fim'; };
  // Respondeu = mensagem do cliente depois do último envio nosso desta sequência (ou do começo da espera)
  function seqReplied(ref, chat, replies) {
    if (chat && chat.last && !chat.last.fromMe && Number(chat.last.t) * 1000 > ref) return true;
    return (replies || []).some((t) => Number(t) > ref);
  }
  // Decide o que fazer agora com UMA conversa na sequência. Não envia nem grava nada.
  // run = { node, wait_started_at (ms), last_sent_at (ms), skip_wait, branches }
  // → { status: 'run' (mandar send.itemId e ir para node) | 'progress' (só gravar node/espera/etiquetas) | 'wait' | 'end',
  //     node, waitStart, ops: [etiquetas], send, branches (novas), outcome, dueAt, reason }
  function seqStep({ def, run, chat, replies, now, settings }) {
    const idx = seqIndex(def);
    const ops = [];
    const branches = [];
    let id = run.node || seqFirstOf(def.steps);
    let skip = !!run.skip_wait;
    const waitStart = Number(run.wait_started_at) || null;
    const lastSent = Number(run.last_sent_at) || null;
    const all = [...(run.branches || [])];
    const end = (reason) => ({ status: 'end', node: null, ops, branches, outcome: seqOutcome([...all, ...branches]), reason });
    for (let guard = 0; guard < 100; guard++) {
      if (!id) return end('fim');
      const e = idx.get(id);
      if (!e) return end('passo não existe mais');
      const n = e.node;
      if (n.type === 'fim') return end('fim');
      if (n.type === 'ir') { id = n.to; continue; }
      if (n.type === 'etiqueta') { ops.push({ op: n.op, source: n.source, label_id: n.label_id || null, wa_label_id: n.wa_label_id || null, remove_others: !!n.remove_others }); id = seqNextOf(idx, id); continue; }
      if (n.type === 'enviar') return { status: 'run', node: seqNextOf(idx, id), sendNode: id, send: { itemId: n.item_id || null }, ops, branches, waitStart: null };
      if (n.type === 'esperar') {
        // chegou agora na espera: grava o começo (a decisão vem no próximo ciclo)
        if (run.node !== id || !waitStart) return { status: 'progress', node: id, waitStart: now, ops, branches };
        if (!chat || !chat.loaded) return { status: 'wait', node: id, ops, branches, reason: 'conversa não carregada' };
        const ref = lastSent && lastSent <= waitStart ? lastSent : waitStart;
        if (!skip && seqReplied(ref, chat, replies)) {
          branches.push({ node: id, result: 'sim', at: now });
          id = seqFirstOf(n.yes);
          skip = false;
          if (!id) return end('respondeu');
          continue;
        }
        const lastMine = chat.last && chat.last.fromMe ? Number(chat.last.t) * 1000 : 0;
        const mine = Math.max(lastMine > waitStart ? lastMine : 0, lastSent && lastSent > waitStart ? lastSent : 0);
        const need = Math.max(1, Number(n.amount) || 0) * (SEQ_UNIT_MIN[n.unit] || 60) * MIN_MS;
        let timedOut = skip;
        let dueAt = null;
        if (!timedOut) {
          if (n.after_mine && !mine) return { status: 'wait', node: id, ops, branches, reason: 'esperando a sua mensagem', dueAt: null };
          const from = Math.max(waitStart, mine);
          if (def.business) {
            timedOut = businessMsBetween(from, now, settings) >= need;
            dueAt = addBusinessMs(from, need, settings);
          } else {
            timedOut = now - from >= need;
            dueAt = from + need;
          }
        }
        if (!timedOut) return { status: 'wait', node: id, ops, branches, dueAt, reason: 'esperando resposta' };
        branches.push({ node: id, result: 'nao', at: now });
        id = seqFirstOf(n.no);
        skip = false;
        if (!id) return end('não respondeu');
        continue;
      }
      id = seqNextOf(idx, id); // tipo desconhecido: pula
    }
    return end('laço sem espera');
  }
  // Quem entra: a chave da entrada (um percurso por entrada; entrar de novo = outro percurso)
  function seqStartMatches(start, lead) {
    const o = (start && start.origin) || 'todos';
    return o === 'todos' || (o === 'anuncio' ? lead.origin === 'anuncio' : lead.origin !== 'anuncio');
  }
  // Validação (diz em qual passo): [{ node, msg }]
  function seqValidate(def) {
    const out = [];
    const st = (def && def.start) || {};
    if (!['lead', 'etiqueta', 'venda', 'manual'].includes(st.type)) out.push({ node: 'start', msg: 'Escolha quem entra na sequência.' });
    if (st.type === 'etiqueta' && !(st.source === 'whatsapp' ? st.wa_label_id : st.label_id)) out.push({ node: 'start', msg: 'Escolha a etiqueta de quem entra.' });
    const idx = seqIndex(def);
    if (!(def && def.steps && def.steps.length)) out.push({ node: 'start', msg: 'Adicione pelo menos um passo.' });
    let sends = 0;
    idx.forEach(({ node: n, depth }) => {
      if (n.type === 'enviar') { sends++; if (!n.item_id) out.push({ node: n.id, msg: 'Escolha ou crie a mensagem.' }); }
      if (n.type === 'etiqueta' && !(n.source === 'whatsapp' ? n.wa_label_id : n.label_id)) out.push({ node: n.id, msg: 'Escolha a etiqueta.' });
      if (n.type === 'esperar') {
        if (!(Number(n.amount) >= 1)) out.push({ node: n.id, msg: 'Escolha quanto tempo esperar.' });
        if (depth > SEQ_MAX_DEPTH) out.push({ node: n.id, msg: `No máximo ${SEQ_MAX_DEPTH} esperas uma dentro da outra.` });
      }
      if (n.type === 'ir') {
        if (!n.to || !idx.has(n.to)) out.push({ node: n.id, msg: 'Escolha para onde continuar.' });
        else {
          // "Continuar para…" precisa passar por uma espera antes de voltar ao mesmo lugar
          let cur = n.to;
          const seen = new Set();
          let loop = false;
          for (let g = 0; g < 200 && cur; g++) {
            const e = idx.get(cur);
            if (!e || e.node.type === 'esperar' || e.node.type === 'fim') break;
            if (seen.has(cur)) { loop = true; break; }
            seen.add(cur);
            cur = e.node.type === 'ir' ? e.node.to : seqNextOf(idx, cur);
          }
          if (loop) out.push({ node: n.id, msg: 'Esse "Continuar para…" volta sem passar por uma espera (ficaria em laço).' });
        }
      }
    });
    if (def && def.steps && def.steps.length && !sends && ![...idx.values()].some((e) => e.node.type === 'etiqueta')) out.push({ node: 'start', msg: 'A sequência não faz nada: adicione uma mensagem ou etiqueta.' });
    return out;
  }
  // Texto do passo atual de uma conversa ("esperando resposta (faltam 1h20)")
  function seqDescribe(def, run, now, { itemTitle = (id) => id } = {}) {
    if (!run) return '';
    if (run.status && run.status !== 'ativo') return run.outcome === 'respondeu' ? 'saiu: respondeu' : run.outcome === 'nao_respondeu' ? 'saiu: não respondeu' : 'saiu';
    const idx = seqIndex(def);
    const e = idx.get(run.node || seqFirstOf(def.steps));
    if (!e) return 'terminando';
    const n = e.node;
    if (n.type === 'esperar') {
      const due = Number(run.due_at) || null;
      if (n.after_mine && !due) return 'esperando a sua mensagem';
      return due ? `esperando resposta (faltam ${formatLeft(Math.max(0, due - now))})` : 'esperando resposta';
    }
    if (n.type === 'enviar') return `vai mandar “${itemTitle(n.item_id)}”`;
    if (n.type === 'etiqueta') return 'vai mexer nas etiquetas';
    return 'continuando';
  }
  // Nome curto de cada passo (lista de automações: "quantos estão em cada passo")
  function seqNodeLabel(def, id, { itemTitle = (x) => x } = {}) {
    const e = seqIndex(def).get(id);
    if (!e) return 'passo removido';
    const n = e.node;
    if (n.type === 'esperar') return `Esperando resposta (${n.amount} ${n.unit === 'minutos' ? 'min' : n.unit === 'horas' ? 'h' : n.amount === 1 ? 'dia' : 'dias'})`;
    if (n.type === 'enviar') return `Antes de mandar “${itemTitle(n.item_id)}”`;
    return n.type;
  }
  let seqCounter = 0;
  const seqId = () => `n${Date.now().toString(36)}${(seqCounter++).toString(36)}`;
  // Modelos prontos: em branco e "Follow-up de lead novo" (etiquetas como "new:Nome")
  function seqTemplate(kind) {
    if (kind === 'lead_followup') {
      const tag = () => ({ id: seqId(), type: 'etiqueta', op: 'colocar', source: 'crm', label_id: 'new:Em atendimento' });
      return {
        start: { type: 'lead', origin: 'todos' }, business: true,
        steps: [{ id: seqId(), type: 'esperar', amount: 2, unit: 'horas', after_mine: true, yes: [tag()], no: [
          { id: seqId(), type: 'enviar', item_id: '', hint: 'Follow 1' },
          { id: seqId(), type: 'esperar', amount: 1, unit: 'dias', yes: [tag()], no: [
            { id: seqId(), type: 'enviar', item_id: '', hint: 'Follow 2' },
            { id: seqId(), type: 'esperar', amount: 2, unit: 'dias', yes: [tag()], no: [
              { id: seqId(), type: 'enviar', item_id: '', hint: 'Follow 3' },
            ] },
          ] },
        ] }],
      };
    }
    return { start: { type: 'lead', origin: 'todos' }, business: true, steps: [{ id: seqId(), type: 'enviar', item_id: '' }, { id: seqId(), type: 'esperar', amount: 1, unit: 'dias', yes: [], no: [] }] };
  }

  // ── 2.11.0: modelos com passo a passo (Quem → Quando → O quê) ──
  // Cada modelo vira uma ou mais automações do editor avançado (as mesmas regras de segurança de sempre).
  // Etiquetas podem vir como "new:Nome" (criadas ao ligar).
  const WIZARDS = [
    { key: 'posvenda', title: 'Pós-venda: pedir avaliação', help: 'Quando uma venda for registrada pela conversa (💰), espera alguns dias e manda a mensagem (ex.: link de avaliação do Google).',
      who: 'venda', unit: 'dias', amount: 7, stages: 1 },
    { key: 'followup', title: 'Follow-up em etapas', help: 'Quem entra em "Follow Up 1" e não responde no tempo combinado recebe a mensagem e vai para "Follow Up 2", e assim por diante (até 4 etapas). Se responder, para.',
      who: 'etiqueta', label: 'Follow Up 1', unit: 'dias', amount: 1, stages: 2, maxStages: 4 },
    { key: 'lead', title: 'Lead novo sem resposta', help: 'Lead novo (de anúncio ou não) na etiqueta escolhida que não respondeu à sua mensagem em algumas horas recebe outra mensagem.',
      who: 'etiqueta', label: 'Lead novo', waLabel: 'Novo cliente', unit: 'horas', amount: 3, stages: 1 },
    { key: 'sumido', title: 'Cliente sumido', help: 'Conversa parada há alguns dias (você falou por último e o cliente não respondeu), com a etiqueta escolhida, recebe uma mensagem.',
      who: 'etiqueta', label: 'Cliente', unit: 'dias', amount: 15, stages: 1 },
  ];
  // minutos de expediente num dia (o "sem responder" conta só o horário comercial)
  function businessMinutesPerDay(settings) {
    const s = ns(settings);
    return Math.max(60, s.endMin - s.startMin);
  }
  // "1 dia", "3 horas" → minutos. useful: dia = um dia de expediente (horário comercial)
  function wizardMinutes(amount, unit, { useful = false, settings } = {}) {
    const n = Math.max(1, Math.floor(Number(amount) || 0));
    if (unit === 'horas') return n * 60;
    return n * (useful ? businessMinutesPerDay(settings) : 1440);
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function wizardWhen(w) {
    const n = Math.max(1, Math.floor(Number(w.amount) || 0));
    return w.unit === 'horas' ? plural(n, 'hora', 'horas') : plural(n, w.useful ? 'dia útil' : 'dia', w.useful ? 'dias úteis' : 'dias');
  }
  // w: { name, trigger: { source: 'crm'|'whatsapp', id }, amount, unit, stages: [{ itemId, labelId }], itemId, moveTo, testChatId }
  function wizardToAutomations(kind, w, { settings } = {}) {
    const name = String(w.name || '').trim() || (WIZARDS.find((x) => x.key === kind) || {}).title || 'Automação';
    const base = { active: false, conditions: [], schedule_days: null, schedule_time: null, ignore_older_days: 15, test_chat_id: w.testChatId || null };
    const trig = w.trigger || {};
    const trigFields = trig.source === 'whatsapp'
      ? { trigger_label_source: 'whatsapp', trigger_wa_label_id: trig.id || null, trigger_label_id: null }
      : { trigger_label_source: 'crm', trigger_wa_label_id: null, trigger_label_id: trig.id || null };
    const moveAfter = (to) => (to ? [{ type: 'mover', label_id: to }] : []);
    if (kind === 'posvenda') {
      return [{ ...base, name: name.slice(0, 60), trigger_type: 'venda_registrada', trigger_label_source: 'crm', trigger_wa_label_id: null,
        trigger_label_id: trig.source === 'crm' && trig.id ? trig.id : null, wait_minutes: wizardMinutes(w.amount, w.unit),
        actions: [{ type: 'enviar', item_id: w.itemId || null, variants: [] }, ...(w.moveTo ? [{ type: 'adicionar_etiqueta', label_id: w.moveTo }] : [])] }];
    }
    const wait = wizardMinutes(w.amount, w.unit, { useful: true, settings });
    // conversas paradas há mais que isso não contam: a espera em dias corridos + 15
    const older = Math.min(365, Math.max(15, Math.ceil(wait / businessMinutesPerDay(settings)) * 2 + 15));
    if (kind === 'followup') {
      const stages = (w.stages || []).slice(0, 4);
      return stages.map((st, k) => {
        const label = k === 0 ? trigFields : { trigger_label_source: 'crm', trigger_wa_label_id: null, trigger_label_id: st.labelId || null };
        const next = stages[k + 1];
        const after = next ? [{ type: 'mover', label_id: next.labelId || null }] : w.moveTo ? [{ type: 'mover', label_id: w.moveTo }]
          : (label.trigger_label_source === 'whatsapp' ? [{ type: 'remover_etiqueta_wa', wa_label_id: label.trigger_wa_label_id }] : [{ type: 'remover_etiqueta', label_id: label.trigger_label_id }]);
        return { ...base, ...label, name: `${name} · etapa ${k + 1}`.slice(0, 60), trigger_type: 'sem_resposta', wait_minutes: wait, ignore_older_days: older,
          actions: [{ type: 'enviar', item_id: st.itemId || null, variants: [] }, ...after] };
      });
    }
    // lead / sumido: sem resposta há X → manda (e move, se escolher)
    const trigger = { ...trigFields };
    return [{ ...base, ...trigger, name: name.slice(0, 60), trigger_type: 'sem_resposta', wait_minutes: wait, ignore_older_days: older,
      actions: [{ type: 'enviar', item_id: w.itemId || null, variants: [] }, ...moveAfter(w.moveTo)] }];
  }
  // Frase-resumo do passo a passo
  function wizardSentence(kind, w, { labelName = (id) => id, waLabelName = (id) => id, itemTitle = (id) => id } = {}) {
    const q = (s) => `“${s}”`;
    const lab = (id) => q(id ? labelName(id) : '?');
    const who = w.trigger && w.trigger.id ? (w.trigger.source === 'whatsapp' ? `${q(waLabelName(w.trigger.id))} (etiqueta do WhatsApp)` : lab(w.trigger.id)) : '?';
    const msg = (id) => (id ? q(itemTitle(id)) : 'a mensagem (escolha no passo 3)');
    const when = wizardWhen({ ...w, useful: kind !== 'posvenda' });
    if (kind === 'posvenda') {
      return `Quando uma venda for registrada pela conversa${w.trigger && w.trigger.id ? ` (só quem está em ${lab(w.trigger.id)})` : ''}, ${when} depois manda ${msg(w.itemId)}${w.moveTo ? ` e coloca em ${lab(w.moveTo)}` : ''}.`;
    }
    if (kind === 'followup') {
      const stages = (w.stages || []).slice(0, 4);
      const parts = stages.map((st, k) => {
        const from = k === 0 ? who : lab(st.labelId);
        const to = stages[k + 1] ? ` e vai para ${lab(stages[k + 1].labelId)}` : w.moveTo ? ` e vai para ${lab(w.moveTo)}` : ' e sai do follow-up';
        return `quem está em ${from} e não responde em ${when} recebe ${msg(st.itemId)}${to}`;
      });
      return `${parts.map((p, k) => (k ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('; ')}. Se o cliente responder, para.`;
    }
    const intro = kind === 'sumido' ? `Quem está em ${who} e está há ${when} sem responder à sua última mensagem` : `Lead em ${who} que não respondeu à sua mensagem em ${when}`;
    return `${intro} recebe ${msg(w.itemId)}${w.moveTo ? ` e vai para ${lab(w.moveTo)}` : ''}. Só uma vez por entrada na etiqueta.`;
  }

  // ── 2.11.0: validação do editor avançado antes de salvar (diz ONDE está o problema) ──
  // where: 'name' | 'trigger' | 'wait' | 'days' | 'time' | 'test' | 'cond:i' | 'action:i' | 'variant:i:j'
  function validateAutomationDraft(a, { testOn = false } = {}) {
    const out = [];
    const add = (where, msg) => out.push({ where, msg });
    const empty = (v) => v == null || v === '';
    if (!String(a.name || '').trim()) add('name', 'Dê um nome para a automação.');
    if (!TRIGGER_TYPES.includes(a.trigger_type)) add('trigger', 'Escolha quando a automação roda.');
    const sale = a.trigger_type === 'venda_registrada';
    if (!sale) {
      if (a.trigger_label_source === 'whatsapp' ? empty(a.trigger_wa_label_id) : empty(a.trigger_label_id)) add('trigger', 'Escolha a etiqueta do gatilho.');
    }
    if ((a.trigger_type === 'sem_resposta' || a.trigger_type === 'entrou_etiqueta') && !(Number(a.wait_minutes) >= 1)) add('wait', 'Escolha depois de quanto tempo.');
    if (a.trigger_type === 'dia_hora') {
      if (!(a.schedule_days || []).length) add('days', 'Escolha pelo menos um dia da semana.');
      if (parseHM(a.schedule_time) == null) add('time', 'Escolha a hora.');
    }
    if (testOn && empty(a.test_chat_id)) add('test', 'Escolha a conversa de teste.');
    (a.conditions || []).forEach((c, i) => {
      if ((c.type === 'tem_etiqueta' || c.type === 'nao_tem_etiqueta') && empty(c.label_id)) add(`cond:${i}`, `Condição ${i + 1}: escolha a etiqueta.`);
      if (c.type === 'anuncio' && !String(c.keyword || '').trim()) add(`cond:${i}`, `Condição ${i + 1}: escreva a palavra do anúncio.`);
      if (c.type === 'parada_max_dias' && !(Number(c.days) >= 1)) add(`cond:${i}`, `Condição ${i + 1}: escolha os dias.`);
    });
    const acts = a.actions || [];
    if (!acts.some((x) => x.type !== 'parar')) add('action:0', 'Escolha pelo menos uma ação.');
    acts.forEach((x, i) => {
      const n = `Ação ${i + 1}`;
      if (x.type === 'enviar') {
        const vs = x.variants || [];
        if (empty(x.item_id) && !vs.length) add(`action:${i}`, `${n}: escolha a mensagem (ou crie uma aqui).`);
        vs.forEach((v, j) => {
          if (empty(v.item_id)) add(`variant:${i}:${j}`, `${n}, variante ${j + 1}: escolha a mensagem.`);
          if (v.when === 'etiqueta' && empty(v.label_id)) add(`variant:${i}:${j}`, `${n}, variante ${j + 1}: escolha a etiqueta.`);
          if (v.when === 'anuncio' && !String(v.keyword || '').trim()) add(`variant:${i}:${j}`, `${n}, variante ${j + 1}: escreva a palavra do anúncio.`);
        });
      } else if (WA_LABEL_ACTIONS.includes(x.type)) {
        if (empty(x.wa_label_id)) add(`action:${i}`, `${n}: escolha a etiqueta do WhatsApp.`);
      } else if (x.type !== 'parar') {
        if (empty(x.label_id)) add(`action:${i}`, `${n}: escolha a etiqueta.`);
        else if (x.type === 'mover' && !sale && a.trigger_label_source !== 'whatsapp' && x.label_id === a.trigger_label_id) add(`action:${i}`, `${n}: mover para uma etiqueta diferente da do gatilho.`);
        else if (x.type === 'mover' && sale && empty(a.trigger_label_id)) add(`action:${i}`, `${n}: sem etiqueta no gatilho, use "Adicionar etiqueta".`);
      }
    });
    return out;
  }

  // ── Limites ──────────────────────────────────────────────────────────────

  function limitCheck(counts, settings) {
    const s = ns(settings);
    if ((counts.hour || 0) >= s.maxHour) return { ok: false, reason: 'limite por hora' };
    if ((counts.day || 0) >= s.maxDay) return { ok: false, reason: 'limite do dia' };
    return { ok: true, reason: '' };
  }

  function randomGapMs(settings, rnd = Math.random) {
    const s = ns(settings);
    const r = Math.min(1, Math.max(0, Number(rnd()) || 0));
    return Math.round((s.minGapS + r * (s.maxGapS - s.minGapS)) * 1000);
  }

  // Tempo estimado para n envios só com os limites e o intervalo médio (horas de expediente e dias)
  function estimateDuration(n, settings) {
    const s = ns(settings);
    const total = Math.max(0, Math.floor(n));
    const avgGap = (s.minGapS + s.maxGapS) / 2;
    const perHour = Math.max(1, Math.min(s.maxHour, Math.floor(3600 / avgGap)));
    const dayHours = Math.max(0, (s.endMin - s.startMin) / 60);
    const perDay = Math.max(1, Math.min(s.maxDay, Math.floor(perHour * dayHours)));
    const hours = total / perHour;
    const days = Math.ceil(total / perDay);
    return { perHour, perDay, hours, days: total ? days : 0 };
  }

  function estimateText(n, settings) {
    const e = estimateDuration(n, settings);
    if (!n) return 'nada para enviar';
    const h = e.hours < 1 ? `${Math.max(1, Math.round(e.hours * 60))} min` : `${e.hours.toFixed(1).replace('.', ',')} h`;
    return `cerca de ${h} de expediente${e.days > 1 ? ` (${e.days} dias úteis)` : ''}`;
  }

  // ── Motor ────────────────────────────────────────────────────────────────

  // 2.4.1 (desempenho): o relógio local bate a cada 10 s, mas só consulta o banco quando vence um prazo:
  //  - trava: a dona renova a cada 60 s; as outras abas só tentam pegar a cada 2 min;
  //  - "tem algo ativo?" (agendados, disparos, automações): 1 verificação leve a cada 2 min;
  //  - com algo ativo: procura trabalho no máximo a cada 60 s; contagens de envio a cada 5 min.
  const TICK_MS = 10 * 1000;
  const LEASE_MS = 60 * 1000;
  const LEASE_TTL_S = 150;
  const ACTIVITY_MS = 2 * 60 * 1000;
  const WORK_MS = 60 * 1000;
  const COUNTS_MS = 5 * 60 * 1000;
  const FOLLOW_EVAL_MS = 60 * 1000;
  const PROBE_MS = 5 * 60 * 1000;
  const FIRST_MS = 5 * 1000;
  const SCHED_MAX_LATE_MS = 24 * 3600 * 1000;
  const RETRY_AFTER_FAIL_MS = 30 * 60 * 1000;
  const NATIVE_SWEEP_MS = 10 * 60 * 1000; // 2.5.0: varredura das etiquetas nativas usadas por automações ativas
  const SKIP_REASON = {
    invalid_chat: 'conversa não carregada', not_ready: 'WhatsApp não estava pronto', empty: 'mensagem vazia',
    download: 'arquivo não baixou', no_whatsapp: 'número sem WhatsApp', item_not_found: 'mensagem salva não existe mais',
  };

  function createMotor(deps) {
    const now = () => (deps.now ? deps.now() : Date.now());
    const rnd = () => (deps.random ? deps.random() : Math.random());
    const runnerId = deps.runnerId || `r${Math.floor(rnd() * 1e9).toString(36)}${now().toString(36)}`;
    const st = {
      runnerId,
      available: null,         // tabelas da D1 (wa_settings, wa_flows, wa_send_log)
      campaignsAvailable: null, // tabelas da D2
      settings: null,
      role: null,              // 'este' | 'outro' | 'pausado' | null
      leaseUntil: 0,
      waiting: '',             // por que não enviou agora (texto curto, sem dados)
      counts: { hour: 0, day: 0 },
      nextAllowedAt: 0,
      lastEvalAt: 0,
      queue: [],               // follows elegíveis (memória)
      flows: [],
      automationsAvailable: null, // tabelas da 2.1.0 (wa_automations, wa_automation_runs)
      automations: [],
      noSendLabelId: null,
      current: null,           // { source } enquanto envia
      probeAt: 0,
      // 2.4.1: prazos das consultas (ms) e o que está ativo
      leaseAt: 0,              // última renovação da nossa trava
      claimAt: 0,              // última tentativa de pegar a trava (sem tê-la)
      activityAt: 0,           // última verificação "tem algo ativo?"
      workAt: 0,               // próxima busca de trabalho permitida
      countsAt: 0,             // última contagem de envios no banco
      active: null,            // { schedules, campaigns, automations: [...], flows }
      activeAutomations: [],
      // 2.5.0: etiqueta do WhatsApp no gatilho + inscrição manual (migration 20261104120000)
      automationsV25: false,
      activeEnrollments: [],   // inscrições ativas nas automações ativas (vêm com a verificação de atividade)
      sweepAt: 0,              // última varredura das etiquetas nativas
      sweepIds: '',            // etiquetas nativas varridas da última vez
    };
    const failedRecently = new Map(); // `${flowId}:${contactId}` → até quando não tentar
    let busy = false;
    let timers = [];

    const changed = () => { try { if (deps.onChange) deps.onChange(); } catch { /* tela */ } };
    const api = (type, payload) => deps.api(type, payload || {});

    async function loadSettings() {
      let s = null;
      try { s = await api('getEngineSettings'); } catch { s = null; }
      if (!s || s.available === false || !s.settings || typeof s.settings.max_per_hour !== 'number') {
        st.available = false;
        st.settings = null;
        st.probeAt = now();
        return false;
      }
      st.available = true;
      st.settings = s.settings;
      st.campaignsAvailable = s.campaigns === true;
      st.campaignsV2 = s.campaignsV2 === true; // 2.2.0: mensagem exclusiva, filtros e ações depois de enviar
      st.automationsAvailable = s.automations === true;
      st.salesOrigin = s.salesOrigin === true; // 2.3.0: colunas de origem da venda + gatilho "venda registrada"
      st.automationsV25 = s.automationsV25 === true; // 2.5.0: etiqueta do WhatsApp no gatilho + inscrição manual
      st.sequencesAvailable = s.sequences === true; // 2.12.0: sequências (respondeu / não respondeu)
      return true;
    }

    async function ensureNoSendLabel() {
      if (st.noSendLabelId) return st.noSendLabelId;
      try {
        const r = await api('ensureNoSendLabel');
        st.noSendLabelId = r && r.id ? r.id : null;
        if (r && r.created && deps.onLabelsChanged) deps.onLabelsChanged();
      } catch { /* tenta de novo no próximo ciclo */ }
      return st.noSendLabelId;
    }

    async function waReady() {
      try { return !!(await deps.wa.ready()); } catch { return false; }
    }

    // Pega ou renova a trava. Só tenta com o WhatsApp pronto nesta aba.
    // st.leaseUntil só guarda a NOSSA trava; role = quem executa (o "pausado" vem das configurações)
    const pausedNow = () => !!(st.settings && st.settings.paused_all);
    async function ensureLease({ force = false } = {}) {
      if (st.available !== true) return false;
      const holding = st.leaseUntil > now();
      // 2.4.1: renovada há menos de 60 s: não precisa pedir de novo
      if (!force && holding && now() - st.leaseAt < LEASE_MS) return true;
      // Sem a trava: só tenta pegar a cada 2 min (as outras abas não consultam mais nada)
      if (!force && !holding && st.claimAt && now() - st.claimAt < ACTIVITY_MS) return false;
      // Sem o WhatsApp pronto nesta aba: não pega nem renova (outra aba pronta assume quando vencer)
      if (!(await waReady())) {
        if (!holding) st.role = pausedNow() ? 'pausado' : null;
        return holding;
      }
      st.claimAt = now();
      let r = null;
      try { r = await api('claimLease', { runnerId, ttlS: LEASE_TTL_S }); } catch { r = null; }
      if (r && r.held) {
        st.leaseUntil = Date.parse(r.lease_until) || now() + LEASE_TTL_S * 1000;
        st.leaseAt = now();
        if (!holding) st.activityAt = 0; // acabou de pegar: confere logo o que está ativo
        // A renovação já traz as configurações (sem outra consulta)
        if (r.settings && typeof r.settings.max_per_hour === 'number') st.settings = r.settings;
        st.role = pausedNow() ? 'pausado' : 'este';
        return true;
      }
      if (r) st.leaseUntil = 0; // outra aba/PC tem a trava
      st.role = pausedNow() ? 'pausado' : r ? 'outro' : (holding ? 'este' : null);
      return r ? false : holding;
    }

    // 2.4.1: "tem algo ativo?" — agendados vencendo, disparos rodando/começando, automações (ou réguas) ativas
    async function refreshActivity() {
      st.activityAt = now();
      let a = null;
      try { a = await api('engineActivity', { automations: st.automationsAvailable === true, campaigns: st.campaignsAvailable === true }); } catch { a = null; }
      if (!a) return st.active; // erro: mantém o que sabia
      const list = Array.isArray(a.automations) ? a.automations : [];
      const enr = Array.isArray(a.enrollments) ? a.enrollments : [];
      if (JSON.stringify(list) !== JSON.stringify(st.activeAutomations) || JSON.stringify(enr) !== JSON.stringify(st.activeEnrollments)) st.lastEvalAt = 0;
      st.activeAutomations = list;
      st.activeEnrollments = enr;
      st.active = { schedules: !!a.schedules, campaigns: !!a.campaigns, automations: list.length > 0, flows: !!a.flows };
      return st.active;
    }
    const anyActive = () => !!(st.active && (st.active.schedules || st.active.campaigns || st.active.automations || st.active.flows));

    // 2.5.0: registra a "primeira vez que viu" cada conversa nas etiquetas nativas usadas por automações
    // ativas. Eventos: fila local da ponte (sem banco se nada mudou). Varredura: a cada 10 min (ou quando
    // muda a lista de etiquetas), lendo só o que o WhatsApp Web já tem na memória (sem ler mensagens).
    const nativeTriggerIds = () => [...new Set(st.activeAutomations
      .filter((a) => isWaTrigger(a) && a.trigger_type !== 'venda_registrada' && a.trigger_wa_label_id).map((a) => String(a.trigger_wa_label_id)))].sort();
    async function trackNativeLabels() {
      if (!deps.wa || typeof deps.wa.labelEvents !== 'function') return;
      let got = null;
      try { got = await deps.wa.labelEvents(); } catch { got = null; } // esvazia a fila da ponte sempre (só memória)
      const ids = st.automationsV25 ? nativeTriggerIds() : [];
      if (!ids.length) return;
      const events = [];
      ((got && Array.isArray(got.events)) ? got.events : []).forEach((e) => {
        (e.labelIds || []).forEach((l) => { if (ids.includes(String(l))) events.push({ chatId: e.chatId, name: e.name || null, labelId: String(l), type: e.type, at: e.t }); });
      });
      if (events.length) {
        try { await api('nativeLabelEvents', { events: events.slice(-200) }); } catch { /* a varredura corrige */ }
        st.lastEvalAt = 0;
      }
      const key = ids.join(',');
      if (key === st.sweepIds && now() - st.sweepAt < NATIVE_SWEEP_MS) return;
      if (typeof deps.wa.labelChatIds !== 'function') return;
      st.sweepAt = now();
      st.sweepIds = key;
      for (const labelId of ids) {
        let r = null;
        try { r = await deps.wa.labelChatIds({ labelId }); } catch { r = null; }
        if (!r || !Array.isArray(r.chats)) continue; // WhatsApp não respondeu: não marca ninguém como "saiu"
        // Lista vazia com a etiqueta mostrando conversas = WhatsApp ainda carregando: só acrescenta
        const complete = r.chats.length > 0 || Number(r.count) === 0;
        try { await api('nativeLabelSweep', { labelId, chats: r.chats.slice(0, 5000), complete }); } catch { /* próxima varredura */ }
      }
      st.lastEvalAt = 0;
    }

    async function refreshCounts() {
      const t = now();
      st.countsAt = t;
      try {
        const c = await api('sendCounts', { hourSince: new Date(t - 3600 * 1000).toISOString(), daySince: new Date(midnightOf(t)).toISOString() });
        if (c && Number.isFinite(c.hour) && Number.isFinite(c.day)) st.counts = { hour: c.hour, day: c.day };
      } catch { /* mantém os últimos */ }
      return st.counts;
    }

    async function logStart(entry) {
      try { const r = await api('logSend', { ...entry, status: 'enviando' }); return r && r.id; } catch { return null; }
    }
    async function logFinish(id, status, reason = null) {
      if (!id) return;
      try { await api('finishSendLog', { id, status, reason }); } catch { /* histórico */ }
    }
    async function logSkip(entry, reason) {
      try { await api('logSend', { ...entry, status: 'pulado', reason }); } catch { /* histórico */ }
    }

    function afterAttempt() {
      st.nextAllowedAt = now() + randomGapMs(st.settings, rnd);
      st.counts = { hour: st.counts.hour + 1, day: st.counts.day + 1 };
    }

    // Resultado de runSequence → status do log
    function outcome(res) {
      if (res.status === 'ok') return { status: 'enviado', reason: null, retry: false };
      if (res.status === 'stopped') return res.sent ? { status: 'falhou', reason: 'parado no meio', retry: false } : { status: 'pulado', reason: 'parado por você', retry: true };
      if (res.stage === 'before-send' && !res.sent) return { status: 'falhou', reason: SKIP_REASON[res.code] || 'não saiu', retry: true };
      return { status: 'falhou', reason: 'envio não confirmado', retry: false };
    }

    // ── Agendados ──

    async function scheduleJob() {
      let due;
      try { due = await api('dueSchedules'); } catch { return null; }
      if (!Array.isArray(due) || !due.length) return null;
      for (const row of due) {
        if (now() - Date.parse(row.send_at) > SCHED_MAX_LATE_MS) {
          try { await api('finishSchedule', { id: row.id, status: 'expirada' }); } catch { /* próximo ciclo */ }
          continue;
        }
        return { kind: 'agendado', row };
      }
      return null;
    }

    async function runScheduleJob({ row }) {
      const entry = { source: 'agendado', source_id: row.id, chat_id: row.chat_id, item_id: row.item_id || null, contact_id: null };
      let blocked = null;
      try { blocked = await api('chatContact', { chatId: row.chat_id, labelId: st.noSendLabelId }); } catch { blocked = null; }
      if (blocked && blocked.contactId) entry.contact_id = blocked.contactId;
      if (blocked && blocked.hasLabel) {
        // Reserva e marca como falhou (sem enviar): "falhou" só sai de "enviando"
        let held = null;
        try { held = await api('claimSchedule', { id: row.id }); } catch { held = null; }
        if (held) {
          try { await api('finishSchedule', { id: row.id, status: 'falhou', error_code: 'no_send' }); } catch { /* ok */ }
          await logSkip(entry, 'Não enviar');
        }
        return;
      }
      let claimed = null;
      try { claimed = await api('claimSchedule', { id: row.id }); } catch { claimed = null; }
      if (!claimed) return; // outra aba pegou
      const logId = await logStart(entry);
      st.current = { source: 'agendado' };
      changed();
      let res;
      try { res = await deps.runScheduled(claimed); } finally { st.current = null; }
      res = res || { status: 'failed', stage: 'sending' };
      const out = res.status === 'expired' ? { status: 'pulado', reason: 'expirado' } : res.status === 'missing' ? { status: 'falhou', reason: SKIP_REASON.item_not_found } : outcome(res);
      await logFinish(logId, out.status, out.reason);
      if (out.status !== 'pulado') afterAttempt();
    }

    // ── Follows ──

    // Réguas mudaram (salvar, ligar/desligar, excluir): reavalia no próximo ciclo
    async function loadFlows() {
      try {
        const r = await api('fetchFlows');
        const next = Array.isArray(r) ? r : [];
        if (JSON.stringify(next) !== JSON.stringify(st.flows)) st.lastEvalAt = 0;
        st.flows = next;
      } catch { /* mantém */ }
      return st.flows;
    }

    // Avalia todas as réguas ativas. write=false: só lê (Simular/Testar).
    async function evaluate() {
      const flows = st.flows.filter((f) => f.active).sort((a, b) => (a.position || 0) - (b.position || 0));
      if (!flows.length) return [];
      const labelIds = [...new Set(flows.map((f) => f.label_id))];
      const contacts = await api('flowCandidates', { labelIds });
      const list = Array.isArray(contacts) ? contacts : [];
      const chatIds = [...new Set(list.map(chatIdOfContact).filter(Boolean))];
      const keywords = [...new Set(flows.flatMap((f) => (f.variants || []).filter((v) => v.condition === 'anuncio').map((v) => normKw(v.ad_keyword))).filter(Boolean))];
      const chats = {};
      for (let i = 0; i < chatIds.length; i += 500) {
        let r = null;
        try { r = await deps.wa.chatsInfo({ chatIds: chatIds.slice(i, i + 500), keywords }); } catch { r = null; }
        Object.assign(chats, (r && r.chats) || {});
      }
      const t = now();
      const rows = [];
      flows.forEach((flow) => {
        list.filter((c) => (c.labelIds || []).includes(flow.label_id)).forEach((contact) => {
          const chatId = chatIdOfContact(contact);
          const ev = evaluateFollow({ flow, contact, contactLabelIds: contact.labelIds, chat: chatId ? chats[chatId] : null, settings: st.settings, now: t, noSendLabelId: st.noSendLabelId });
          rows.push({ flow, contact, ev });
        });
      });
      return rows;
    }

    async function refreshFollowQueue() {
      await loadFlows();
      st.lastEvalAt = now();
      let rows;
      try { rows = await evaluate(); } catch { return; }
      // Quem respondeu: troca de etiqueta (sem envio, não conta nos limites)
      for (const r of rows.filter((x) => x.ev.action === 'reply')) {
        let moved = null;
        try { moved = await api('followMove', { contactId: r.contact.id, fromLabelId: r.flow.label_id, toLabelId: r.ev.toLabelId }); } catch { moved = null; }
        if (moved && moved.moved) await logSkip({ source: 'follow', source_id: r.flow.id, contact_id: r.contact.id, chat_id: r.ev.chatId, item_id: null }, 'respondeu');
      }
      const seen = new Set();
      const t = now();
      st.queue = rows.filter((r) => {
        if (r.ev.action !== 'send') return false;
        if (seen.has(r.contact.id)) return false; // um envio por contato por ciclo
        const until = failedRecently.get(`${r.flow.id}:${r.contact.id}`);
        if (until && until > t) return false;
        seen.add(r.contact.id);
        return true;
      });
    }

    async function followJob() {
      // Reavalia as réguas no máximo a cada 60 s; entre uma e outra, usa a fila já montada
      if (now() - st.lastEvalAt >= FOLLOW_EVAL_MS) await refreshFollowQueue();
      while (st.queue.length) {
        const r = st.queue.shift();
        // Confere de novo, com dados frescos, antes de reservar
        let labels = null;
        try { labels = await api('contactLabelIds', { contactId: r.contact.id }); } catch { labels = null; }
        if (!Array.isArray(labels) || !labels.includes(r.flow.label_id)) continue;
        let info = null;
        const keywords = (r.flow.variants || []).filter((v) => v.condition === 'anuncio').map((v) => normKw(v.ad_keyword)).filter(Boolean);
        try { info = await deps.wa.chatsInfo({ chatIds: [r.ev.chatId], keywords }); } catch { info = null; }
        const contact = { ...r.contact, labelIds: labels };
        const ev = evaluateFollow({ flow: r.flow, contact, contactLabelIds: labels, chat: info && info.chats ? info.chats[r.ev.chatId] : null, settings: st.settings, now: now(), noSendLabelId: st.noSendLabelId });
        if (ev.action !== 'send') continue;
        return { kind: 'follow', flow: r.flow, contact, ev };
      }
      return null;
    }

    async function runFollowJob({ flow, contact, ev }) {
      const entry = { source: 'follow', source_id: flow.id, contact_id: contact.id, chat_id: ev.chatId, item_id: ev.itemId };
      const item = await deps.itemById(ev.itemId);
      if (!item) {
        failedRecently.set(`${flow.id}:${contact.id}`, now() + RETRY_AFTER_FAIL_MS);
        await logSkip(entry, 'sem mensagem');
        return;
      }
      // Reserva: tirar a etiqueta da régua. Só uma aba consegue (quem apagar a linha).
      let reserved = null;
      try { reserved = await api('followReserve', { contactId: contact.id, labelId: flow.label_id }); } catch { reserved = null; }
      if (!reserved || !reserved.reserved) return;
      const logId = await logStart(entry);
      st.current = { source: 'follow' };
      changed();
      let res;
      try {
        res = await deps.sendParts({ parts: deps.partsOf(item), chatId: ev.chatId, firstName: deps.nameFor ? await deps.nameFor(ev.chatId, firstNameOf(contact.name)) : firstNameOf(contact.name), label: 'Follow' });
      } catch {
        res = { status: 'failed', stage: 'sending', sent: 0 };
      } finally {
        st.current = null;
      }
      const out = outcome(res);
      if (out.status === 'enviado') {
        if (flow.next_label_id) { try { await api('followAdd', { contactId: contact.id, labelId: flow.next_label_id }); } catch { /* fica só sem a etiqueta */ } }
        if (deps.onItemUsed) deps.onItemUsed(item);
      } else if (out.retry) {
        // Nada saiu: volta para a régua e não tenta este contato por 30 min
        try { await api('followAdd', { contactId: contact.id, labelId: flow.label_id }); } catch { /* ok */ }
        failedRecently.set(`${flow.id}:${contact.id}`, now() + RETRY_AFTER_FAIL_MS);
      }
      await logFinish(logId, out.status, out.reason);
      if (out.status !== 'pulado') afterAttempt();
      if (deps.onLabelsChanged) deps.onLabelsChanged();
    }

    // ── Automações (2.1.0): substituem as réguas quando a migration 20261103150000 existe ──

    async function loadAutomations() {
      try {
        const r = await api('fetchAutomations');
        const next = Array.isArray(r) ? r : [];
        if (JSON.stringify(next) !== JSON.stringify(st.automations)) st.lastEvalAt = 0;
        st.automations = next;
      } catch { /* mantém */ }
      return st.automations;
    }

    // Avalia as automações ativas para os contatos das etiquetas dos gatilhos (só leitura)
    async function evaluateAutomations(source) {
      const list = (Array.isArray(source) ? source : st.automations).filter((a) => a.active && a.kind !== 'sequencia').sort((a, b) => (a.position || 0) - (b.position || 0));
      if (!list.length) return [];
      const labelList = list.filter((a) => a.trigger_type !== 'venda_registrada');
      const saleList = list.filter((a) => a.trigger_type === 'venda_registrada');
      const labelIds = [...new Set(labelList.filter((a) => !isWaTrigger(a)).map((a) => a.trigger_label_id).filter(Boolean))];
      const contacts = labelIds.length ? await api('flowCandidates', { labelIds }) : [];
      const people = Array.isArray(contacts) ? contacts : [];
      // 2.5.0: quem está nas etiquetas nativas dos gatilhos e quem foi inscrito à mão
      if (st.automationsV25) {
        const merge = (more) => (Array.isArray(more) ? more : []).forEach((c) => {
          const have = people.find((p) => p.id === c.id);
          if (!have) { people.push(c); return; }
          have.waSeen = { ...(have.waSeen || {}), ...(c.waSeen || {}) };
          have.enrolled = { ...(have.enrolled || {}), ...(c.enrolled || {}) };
          have.enrollmentIds = { ...(have.enrollmentIds || {}), ...(c.enrollmentIds || {}) };
          if (!have.chat_id && c.chat_id) have.chat_id = c.chat_id;
        });
        const waIds = [...new Set(labelList.filter((a) => isWaTrigger(a) && a.trigger_wa_label_id).map((a) => String(a.trigger_wa_label_id)))];
        if (waIds.length) { try { merge(await api('nativeLabelCandidates', { waLabelIds: waIds })); } catch { /* sem a lista, só os outros */ } }
        const ids = new Set(labelList.map((a) => a.id));
        let enr = Array.isArray(source) ? st.activeEnrollments : null;
        if (!enr) { try { enr = await api('activeEnrollments', { automationIds: [...ids] }); } catch { enr = []; } }
        enr = (Array.isArray(enr) ? enr : []).filter((e) => ids.has(e.automation_id));
        if (enr.length) { try { merge(await api('enrollmentCandidates', { enrollments: enr })); } catch { /* próximo ciclo */ } }
      }
      // 2.3.0: "venda registrada": um candidato por venda registrada pela conversa (últimos 2 dias)
      let buyers = [];
      // 2.11.0: com "X dias depois da venda", busca vendas de até X + 2 dias (no máximo 90)
      const saleDays = Math.min(90, 2 + Math.max(0, ...saleList.map((a) => Math.ceil((Number(a.wait_minutes) || 0) / 1440))));
      if (saleList.length) { try { buyers = await api('saleTriggerCandidates', { sinceDays: saleDays }); } catch { buyers = []; } }
      if (!Array.isArray(buyers)) buyers = [];
      if (!people.length && !buyers.length) return [];
      let ran = [];
      // 2.4.1: só as execuções destes contatos (filtro no banco)
      const contactIds = [...new Set([...people, ...buyers].map((c) => c.id).filter(Boolean))];
      try { ran = await api('automationRuns', { automationIds: list.map((a) => a.id), contactIds }); } catch { ran = null; }
      if (!Array.isArray(ran)) return []; // sem saber o que já rodou, não executa nada
      const ranKeys = new Set(ran);
      const chatIds = [...new Set([...people, ...buyers].map(chatIdOfContact).filter(Boolean))];
      const keywords = [...new Set(list.flatMap(automationKeywords))].slice(0, 20);
      const chats = {};
      if (list.some(automationNeedsChat)) {
        for (let i = 0; i < chatIds.length; i += 500) {
          let r = null;
          try { r = await deps.wa.chatsInfo({ chatIds: chatIds.slice(i, i + 500), keywords }); } catch { r = null; }
          Object.assign(chats, (r && r.chats) || {});
        }
      }
      const t = now();
      const rows = [];
      saleList.forEach((automation) => {
        buyers.forEach((contact) => {
          const chatId = chatIdOfContact(contact);
          const ev = evaluateAutomation({ automation, contact, chat: chatId ? chats[chatId] : null, settings: st.settings, now: t, noSendLabelId: st.noSendLabelId, ranKeys });
          rows.push({ automation, contact, ev });
        });
      });
      labelList.forEach((automation) => {
        people.filter((c) => !!automationEntry(automation, c)).forEach((contact) => {
          const chatId = chatIdOfContact(contact);
          const ev = evaluateAutomation({ automation, contact, chat: chatId ? chats[chatId] : null, settings: st.settings, now: t, noSendLabelId: st.noSendLabelId, ranKeys });
          rows.push({ automation, contact, ev });
        });
      });
      return rows;
    }

    async function refreshAutomationQueue() {
      // 2.4.1: a lista de automações ativas já vem da verificação de atividade (sem consulta extra)
      st.lastEvalAt = now();
      let rows;
      try { rows = await evaluateAutomations(st.activeAutomations); } catch { return; }
      const t = now();
      const sending = new Set();
      st.queue = rows.filter((r) => {
        if (r.ev.action !== 'run') return false;
        const until = failedRecently.get(`${r.automation.id}:${r.contact.id}`);
        if (until && until > t) return false;
        if (r.ev.plan.some((p) => p.type === 'enviar')) {
          if (sending.has(r.contact.id)) return false; // um envio por contato por ciclo
          sending.add(r.contact.id);
        }
        return true;
      });
    }

    async function automationJob() {
      if (now() - st.lastEvalAt >= FOLLOW_EVAL_MS) await refreshAutomationQueue();
      while (st.queue.length) {
        const r = st.queue.shift();
        // Confere de novo, com dados frescos, antes de reservar
        let labels = null;
        try { labels = await api('contactLabelIds', { contactId: r.contact.id }); } catch { labels = null; }
        if (!Array.isArray(labels)) continue;
        const contact = { ...r.contact, labelIds: labels };
        let chat = null;
        if (automationNeedsChat(r.automation) && r.ev.chatId) {
          let info = null;
          try { info = await deps.wa.chatsInfo({ chatIds: [r.ev.chatId], keywords: automationKeywords(r.automation) }); } catch { info = null; }
          chat = info && info.chats ? info.chats[r.ev.chatId] : null;
        }
        const ev = evaluateAutomation({ automation: r.automation, contact, chat, settings: st.settings, now: now(), noSendLabelId: st.noSendLabelId, ranKeys: null });
        if (ev.action !== 'run' || ev.runKey !== r.ev.runKey) continue;
        return { kind: 'automacao', automation: r.automation, contact, ev };
      }
      return null;
    }

    // ── 2.12.0: sequências ("Respondeu / Não respondeu") ──
    // A cada FOLLOW_EVAL_MS (só a aba com a trava): cria o percurso de quem entrou (só daqui pra frente),
    // decide cada conversa (seqStep) e grava o que não manda nada na hora (espera, caminhos, etiquetas, fim).
    // Envio: um por ciclo, pelo mesmo caminho das automações (limites, intervalo, horário, Não enviar, log).
    const seqActive = () => (st.activeAutomations || []).filter((a) => a.kind === 'sequencia' && a.sequence && a.active);
    const seqKnown = new Set(); // entradas já criadas nesta aba (não manda de novo a cada ciclo)
    const msOf = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };
    function seqRunState(r) {
      return { node: r.node, wait_started_at: msOf(r.wait_started_at), last_sent_at: msOf(r.last_sent_at), skip_wait: !!r.skip_wait, branches: r.branches || [], due_at: msOf(r.due_at) };
    }
    async function seqEnter(seqs) {
      const items = [];
      const add = (a, chatId, key, contactId) => {
        if (!chatId || (a.test_chat_id && chatId !== a.test_chat_id)) return;
        const k = `${a.id}|${chatId}|${key}`;
        if (seqKnown.has(k)) return;
        items.push({ automation_id: a.id, chat_id: chatId, entry_key: key, contact_id: contactId || null, node: seqIndexFirst(a.sequence) });
        seqKnown.add(k);
      };
      const since = (a) => msOf(a.activated_at); // só daqui pra frente (sem ativação: ninguém entra)
      const leadSeqs = seqs.filter((a) => a.sequence.start.type === 'lead' && since(a));
      if (leadSeqs.length) {
        let leads = [];
        try { leads = await api('seqLeads', { since: new Date(Math.min(...leadSeqs.map(since))).toISOString() }); } catch { leads = []; }
        leadSeqs.forEach((a) => (leads || []).forEach((l) => { if (msOf(l.first_message_at) >= since(a) && seqStartMatches(a.sequence.start, l)) add(a, l.chat_id, 'lead'); }));
      }
      const labelSeqs = seqs.filter((a) => a.sequence.start.type === 'etiqueta' && since(a));
      if (labelSeqs.length) {
        const crm = [...new Set(labelSeqs.filter((a) => a.sequence.start.source !== 'whatsapp').map((a) => a.sequence.start.label_id).filter(Boolean))];
        const wa = [...new Set(labelSeqs.filter((a) => a.sequence.start.source === 'whatsapp').map((a) => String(a.sequence.start.wa_label_id)).filter(Boolean))];
        let people = [];
        try { if (crm.length) people = people.concat(await api('flowCandidates', { labelIds: crm }) || []); } catch { /* próximo ciclo */ }
        try { if (wa.length && st.automationsV25) people = people.concat(await api('nativeLabelCandidates', { waLabelIds: wa }) || []); } catch { /* próximo ciclo */ }
        labelSeqs.forEach((a) => {
          const st0 = a.sequence.start;
          const fake = { trigger_label_source: st0.source === 'whatsapp' ? 'whatsapp' : 'crm', trigger_label_id: st0.label_id || null, trigger_wa_label_id: st0.wa_label_id || null };
          people.forEach((c) => {
            const entry = automationEntry(fake, c, { ignoreEnrollment: true });
            if (!entry || !Number.isFinite(entry.at)) return;
            if (!a.include_existing && entry.at < since(a)) return;
            add(a, chatIdOfContact(c), `lbl:${entry.key}`.slice(0, 120), c.id);
          });
        });
      }
      const saleSeqs = seqs.filter((a) => a.sequence.start.type === 'venda' && since(a));
      if (saleSeqs.length) {
        let buyers = [];
        try { buyers = await api('saleTriggerCandidates', { sinceDays: 2 }) || []; } catch { buyers = []; }
        saleSeqs.forEach((a) => buyers.forEach((c) => {
          if (msOf(c.sale_at) < since(a)) return;
          if (a.sequence.start.label_id && !(c.labelIds || []).includes(a.sequence.start.label_id)) return;
          add(a, chatIdOfContact(c), `venda@${c.sale_id}`, c.id);
        }));
      }
      const manualSeqs = seqs.filter((a) => a.sequence.start.type === 'manual');
      if (manualSeqs.length && st.automationsV25) {
        let enr = [];
        try { enr = await api('activeEnrollments', { automationIds: manualSeqs.map((a) => a.id) }) || []; } catch { enr = []; }
        const byId = new Map(manualSeqs.map((a) => [a.id, a]));
        enr.forEach((e) => { const a = byId.get(e.automation_id); if (a && e.chat_id) add(a, e.chat_id, `insc@${msOf(e.enrolled_at) || 0}`, e.contact_id); });
      }
      for (let i = 0; i < items.length; i += 500) {
        try { await api('seqCreateRuns', { items: items.slice(i, i + 500) }); } catch { items.slice(i, i + 500).forEach((it) => seqKnown.delete(`${it.automation_id}|${it.chat_id}|${it.entry_key}`)); }
      }
    }
    const seqIndexFirst = (def) => (def && def.steps && def.steps[0] ? def.steps[0].id : null);
    async function seqPatch(run, patch) {
      let r = null;
      try { r = await api('seqUpdateRun', { id: run.id, version: run.version, patch }); } catch { r = null; }
      return r && r.ok ? r.run : null;
    }
    // etiquetas da sequência (CRM pelo banco, cria o contato se preciso; WhatsApp pela ponte)
    async function seqLabelOps(run, ops) {
      for (const op of ops || []) {
        try {
          if (op.source === 'whatsapp') {
            if (op.op === 'tirar') { await setWaLabel(run.chat_id, { remove: op.wa_label_id }); continue; }
            await setWaLabel(run.chat_id, { add: op.wa_label_id });
            if (op.remove_others && deps.wa.chatLabels) {
              const cur = await deps.wa.chatLabels({ chatId: run.chat_id });
              const ids = ((cur && cur.labelIds) || []).map(String).filter((id) => id !== String(op.wa_label_id));
              for (const id of ids) await setWaLabel(run.chat_id, { remove: id });
            }
            continue;
          }
          const name = run.contact && run.contact.name;
          if (op.op === 'tirar') { await api('saleContactLabels', { chatId: run.chat_id, name, removeLabelIds: [op.label_id] }); continue; }
          const r = await api('saleContactLabels', { chatId: run.chat_id, name, addLabelId: op.label_id, removeLabelIds: [] });
          if (op.remove_others && r && Array.isArray(r.labelIds)) {
            const others = r.labelIds.filter((l) => l !== op.label_id && l !== st.noSendLabelId);
            if (others.length) await api('saleContactLabels', { chatId: run.chat_id, name, removeLabelIds: others });
          }
        } catch { /* segue: etiqueta não impede o resto */ }
      }
      if ((ops || []).length && deps.onLabelsChanged) deps.onLabelsChanged();
    }
    async function refreshSequences() {
      st.seqEvalAt = now();
      st.seqQueue = [];
      const seqs = seqActive();
      if (!seqs.length || !st.sequencesAvailable) return;
      await seqEnter(seqs);
      let runs = null;
      try { runs = await api('seqRuns', { automationIds: seqs.map((a) => a.id) }); } catch { runs = null; }
      if (!Array.isArray(runs) || !runs.length) return;
      const byId = new Map(seqs.map((a) => [a.id, a]));
      const chatIds = [...new Set(runs.map((r) => r.chat_id))];
      const chats = {};
      for (let i = 0; i < chatIds.length; i += 500) {
        let r = null;
        try { r = await deps.wa.chatsInfo({ chatIds: chatIds.slice(i, i + 500), keywords: [] }); } catch { r = null; }
        Object.assign(chats, (r && r.chats) || {});
      }
      const starts = runs.map((r) => msOf(r.wait_started_at) || msOf(r.last_sent_at)).filter(Boolean);
      let replies = {};
      if (starts.length) { try { replies = await api('seqReplies', { chatIds, since: new Date(Math.min(...starts) - 60 * 1000).toISOString() }) || {}; } catch { replies = {}; } }
      const t = now();
      for (const r of runs) {
        const a = byId.get(r.automation_id);
        if (!a) continue;
        if (a.test_chat_id && r.chat_id !== a.test_chat_id) continue; // modo teste: só a conversa escolhida
        // nunca para quem tem "Não enviar": sai da sequência
        if (st.noSendLabelId && r.contact && (r.contact.labelIds || []).includes(st.noSendLabelId)) { await seqPatch(r, { status: 'saiu', outcome: 'nao_enviar' }); continue; }
        const res = seqStep({ def: a.sequence, run: seqRunState(r), chat: chats[r.chat_id] || null, replies: replies[r.chat_id] || [], now: t, settings: st.settings });
        if (res.status === 'wait') {
          const due = res.dueAt || null;
          if ((due || null) !== (msOf(r.due_at) || null) && Math.abs((due || 0) - (msOf(r.due_at) || 0)) > 60 * 1000) await seqPatch(r, { due_at: due });
          continue;
        }
        if (res.status === 'run') {
          const until = failedRecently.get(`seq:${r.id}`);
          if (!(until && until > t)) st.seqQueue.push({ automation: a, run: r, res });
          continue;
        }
        // espera nova, caminho tomado sem envio, etiquetas ou fim: grava já (nada sai)
        const patch = { branches: [...(r.branches || []), ...res.branches], skip_wait: false };
        if (res.status === 'progress') Object.assign(patch, { node: res.node, wait_started_at: res.waitStart, due_at: null });
        else Object.assign(patch, { status: 'fim', outcome: res.outcome, node: null, due_at: null });
        const saved = await seqPatch(r, patch);
        if (saved) await seqLabelOps(r, res.ops);
      }
    }
    async function sequenceJob() {
      if (!st.seqEvalAt || now() - st.seqEvalAt >= FOLLOW_EVAL_MS) await refreshSequences();
      const job = (st.seqQueue || []).shift();
      return job ? { kind: 'sequencia', ...job } : null;
    }
    async function runSequenceJob({ automation, run, res }) {
      const def = automation.sequence;
      const t = now();
      const nextIsWait = res.node && (seqIndex(def).get(res.node) || {}).node && seqIndex(def).get(res.node).node.type === 'esperar';
      const branches = [...(run.branches || []), ...res.branches];
      // trava: avança o percurso ANTES de mandar (só uma aba/PC consegue esta versão)
      const claimed = await seqPatch(run, { node: res.node, wait_started_at: nextIsWait ? t : null, due_at: null, skip_wait: false, branches, last_sent_at: t,
        ...(res.node ? {} : { status: 'fim', outcome: seqOutcome(branches) }) });
      if (!claimed) return;
      await seqLabelOps(run, res.ops);
      const entry = { source: 'follow', source_id: automation.id, contact_id: run.contact ? run.contact.id : null, chat_id: run.chat_id, item_id: res.send.itemId };
      const item = res.send.itemId ? await deps.itemById(res.send.itemId) : null;
      if (!item) { await logSkip(entry, 'sem mensagem'); if (res.node) await seqPatch(claimed, { status: 'fim', outcome: 'sem_mensagem' }); return; }
      const logId = await logStart(entry);
      st.current = { source: 'automacao' };
      changed();
      let sendRes;
      try {
        const nm = run.contact ? run.contact.name : null;
        sendRes = await deps.sendParts({ parts: deps.partsOf(item), chatId: run.chat_id, firstName: deps.nameFor ? await deps.nameFor(run.chat_id, smartFirstName({ crmName: nm })) : smartFirstName({ crmName: nm }), label: 'Automação' });
      } catch {
        sendRes = { status: 'failed', stage: 'sending', sent: 0 };
      } finally {
        st.current = null;
      }
      const out = outcome(sendRes);
      await logFinish(logId, out.status, out.reason);
      if (out.status !== 'pulado') afterAttempt();
      if (out.status !== 'enviado') {
        // nada saiu: volta para o passo do envio e tenta mais tarde
        if (out.retry && !(sendRes && sendRes.sent)) {
          await seqPatch(claimed, { node: res.sendNode, status: 'ativo', outcome: null, wait_started_at: msOf(run.wait_started_at), last_sent_at: msOf(run.last_sent_at), branches: run.branches || [] });
          failedRecently.set(`seq:${run.id}`, now() + RETRY_AFTER_FAIL_MS);
        }
        return;
      }
      if (deps.onItemUsed) deps.onItemUsed(item);
      if (deps.onItemSent) { try { await deps.onItemSent(item, { contactId: run.contact ? run.contact.id : null, chatId: run.chat_id }); } catch { /* etiqueta do item */ } }
    }

    // 2.5.0: põe/tira UMA etiqueta nativa que já existe (a ponte recusa etiqueta desconhecida)
    async function setWaLabel(chatId, { add = null, remove = null }) {
      if (!chatId || !deps.wa || typeof deps.wa.setChatLabels !== 'function') return false;
      try {
        const r = await deps.wa.setChatLabels({ chatId, add: add ? [String(add)] : [], remove: remove ? [String(remove)] : [] });
        return !!(r && r.confirmed);
      } catch { return false; }
    }

    async function runAutomationJob({ automation, contact, ev }) {
      let res0 = null;
      try { res0 = await api('automationReserve', { automationId: automation.id, contactId: contact.id, runKey: ev.runKey }); } catch { res0 = null; }
      if (!res0 || !res0.reserved) return; // outra aba já rodou (ou está rodando)
      const runId = res0.id;
      const trigger = automation.trigger_label_id;
      let sent = 0;
      for (const step of ev.plan) {
        if (step.type === 'enviar') {
          const entry = { source: 'follow', source_id: automation.id, contact_id: contact.id, chat_id: ev.chatId, item_id: step.itemId };
          const item = await deps.itemById(step.itemId);
          if (!item) {
            await logSkip(entry, 'sem mensagem');
            if (!sent) { try { await api('automationUnreserve', { id: runId }); } catch { /* ok */ } }
            failedRecently.set(`${automation.id}:${contact.id}`, now() + RETRY_AFTER_FAIL_MS);
            break;
          }
          const logId = await logStart(entry);
          st.current = { source: 'automacao' };
          changed();
          let res;
          try {
            res = await deps.sendParts({ parts: deps.partsOf(item), chatId: ev.chatId, firstName: deps.nameFor ? await deps.nameFor(ev.chatId, smartFirstName({ crmName: contact.name })) : smartFirstName({ crmName: contact.name }), label: 'Automação' });
          } catch {
            res = { status: 'failed', stage: 'sending', sent: 0 };
          } finally {
            st.current = null;
          }
          const out = outcome(res);
          await logFinish(logId, out.status, out.reason);
          if (out.status !== 'pulado') afterAttempt();
          if (out.status !== 'enviado') {
            // Falhou: as ações seguintes não rodam. Nada saiu (e nada antes) → libera para tentar mais tarde.
            if (out.retry && !sent) { try { await api('automationUnreserve', { id: runId }); } catch { /* ok */ } }
            if (out.retry) failedRecently.set(`${automation.id}:${contact.id}`, now() + RETRY_AFTER_FAIL_MS);
            break;
          }
          sent++;
          if (deps.onItemUsed) deps.onItemUsed(item);
          if (deps.onItemSent) { try { await deps.onItemSent(item, { contactId: contact.id, chatId: ev.chatId }); } catch { /* etiqueta do item */ } }
        } else if (step.type === 'adicionar_etiqueta') {
          try { await api('followAdd', { contactId: contact.id, labelId: step.label_id }); } catch { /* segue */ }
        } else if (step.type === 'remover_etiqueta') {
          try { await api('followReserve', { contactId: contact.id, labelId: step.label_id }); } catch { /* segue */ }
        } else if (step.type === 'mover') {
          try {
            // 2.5.0: gatilho do WhatsApp: tira a etiqueta nativa do gatilho (pela ponte) e põe a CRM
            if (isWaTrigger(automation)) await setWaLabel(ev.chatId, { remove: automation.trigger_wa_label_id });
            else await api('followReserve', { contactId: contact.id, labelId: trigger });
            await api('followAdd', { contactId: contact.id, labelId: step.label_id });
          } catch { /* segue */ }
        } else if (step.type === 'adicionar_etiqueta_wa') {
          await setWaLabel(ev.chatId, { add: step.wa_label_id });
        } else if (step.type === 'remover_etiqueta_wa') {
          await setWaLabel(ev.chatId, { remove: step.wa_label_id });
        }
      }
      if (!ev.plan.some((p) => p.type === 'enviar')) {
        await logSkip({ source: 'follow', source_id: automation.id, contact_id: contact.id, chat_id: ev.chatId || null, item_id: null },
          automation.trigger_type === 'respondeu' ? 'respondeu' : 'etiquetas atualizadas');
      }
      if (deps.onLabelsChanged) deps.onLabelsChanged();
    }

    // ── Ciclo ──

    async function step() {
      if (st.available === false && now() - st.probeAt < PROBE_MS) {
        if (deps.legacyTick) await deps.legacyTick();
        return;
      }
      // 2.4.1: configurações só na 1ª vez (depois vêm junto com a renovação da trava)
      if (st.available !== true || !st.settings) {
        if (!(await loadSettings())) {
          if (deps.legacyTick) await deps.legacyTick();
          return;
        }
      }
      // Só a aba com a trava continua; as outras não consultam mais nada (tentam a trava a cada 2 min)
      const holding = await ensureLease();
      if (!holding) {
        if (st.settings.paused_all) { st.role = 'pausado'; st.waiting = 'pausado'; return; }
        st.waiting = st.role === 'outro' ? 'outro computador executa' : 'WhatsApp não pronto';
        return;
      }
      await ensureNoSendLabel();
      if (st.settings.paused_all) { st.role = 'pausado'; st.waiting = 'pausado'; return; }
      st.role = 'este';
      await trackNativeLabels();
      // 2.6.0: trabalho leve só da aba com a trava (ex.: "Contato" automático de lead novo de anúncio)
      if (deps.leaseWork) { try { await deps.leaseWork(); } catch { /* próximo ciclo */ } }
      if (deps.isManualBusy && deps.isManualBusy()) { st.waiting = 'envio manual em andamento'; return; }
      if (!isBusinessTime(now(), st.settings)) { st.waiting = 'fora do horário'; return; }
      // Tem algo ativo? (1 verificação leve a cada 2 min; sem nada ativo, não faz mais nada)
      if (!st.active || now() - st.activityAt >= ACTIVITY_MS) await refreshActivity();
      if (!anyActive()) { st.waiting = 'nada ativo'; return; }
      if (now() < st.nextAllowedAt) { st.waiting = 'intervalo entre contatos'; return; }
      // Com algo ativo: no máximo uma busca de trabalho a cada 60 s (depois de um envio, segue direto)
      if (now() < st.workAt) return;
      if (!(await waReady())) { st.waiting = 'WhatsApp não pronto'; return; }
      if (!st.countsAt || now() - st.countsAt >= COUNTS_MS) await refreshCounts();
      const lim = limitCheck(st.counts, st.settings);
      if (!lim.ok) { st.waiting = lim.reason; return; }
      st.waiting = '';
      st.workAt = now() + WORK_MS;
      // Ordem: agendados (hora marcada) → disparos → follows. Só procura o que está ativo.
      let job = st.active.schedules ? await scheduleJob() : null;
      if (!job && st.campaignsAvailable && st.active.campaigns && deps.campaignJob) job = await deps.campaignJob(api);
      if (!job) {
        if (st.automationsAvailable) job = st.active.automations ? await automationJob() : null;
        else job = st.active.flows ? await followJob() : null;
      }
      if (!job && st.sequencesAvailable && seqActive().length) job = await sequenceJob(); // 2.12.0
      if (!job) return false;
      st.workAt = 0; // achou trabalho: o próximo ciclo pode procurar de novo (o intervalo entre envios continua valendo)
      // A trava ainda é nossa? (renova antes de enviar)
      if (!(await ensureLease({ force: st.leaseUntil - now() < 45 * 1000 }))) return false;
      if (st.settings.paused_all) return false;
      if (job.kind === 'agendado') await runScheduleJob(job);
      else if (job.kind === 'follow') await runFollowJob(job);
      else if (job.kind === 'automacao') await runAutomationJob(job);
      else if (job.kind === 'sequencia') await runSequenceJob(job);
      else if (deps.runCampaignJob) {
        st.current = { source: 'disparo' };
        changed();
        let r;
        try { r = await deps.runCampaignJob(job, { logStart, logFinish, logSkip, outcome, noSendLabelId: st.noSendLabelId }); } finally { st.current = null; }
        if (r && r.attempted) afterAttempt();
      }
      return true;
    }

    // Depois de um envio, acorda assim que o intervalo acabar (sem esperar o próximo ciclo de 10 s);
    // depois de um pulo, logo em seguida. Só um despertador por vez.
    let wakeTimer = null;
    let running = false;
    const setWake = deps.setWake || ((fn, ms) => setTimeout(fn, ms));
    const clearWake = deps.clearWake || ((t) => clearTimeout(t));
    function wakeAt(ms) {
      if (!running) return;
      if (wakeTimer) clearWake(wakeTimer);
      wakeTimer = setWake(() => { wakeTimer = null; tick(); }, Math.max(200, ms - now()));
    }

    async function tick() {
      if (busy) return;
      busy = true;
      let didJob = false;
      try { didJob = await step(); } catch { /* próximo ciclo */ } finally { busy = false; changed(); }
      if (didJob && st.role === 'este') wakeAt(Math.max(st.nextAllowedAt, now()) + 100);
    }

    // Renovação forçada da trava (a renovação normal acontece no próprio ciclo, a cada 60 s)
    async function leaseTick() {
      if (busy || st.available !== true) return;
      try { await ensureLease({ force: true }); } catch { /* próximo */ }
      changed();
    }

    // Algo foi criado/ativado neste painel (agendado, disparo, automação): confere já no próximo ciclo
    function poke() {
      st.activityAt = 0;
      st.workAt = 0;
    }

    function start() {
      running = true;
      const set = deps.setTimer || ((fn, ms, repeat) => (repeat ? setInterval(fn, ms) : setTimeout(fn, ms)));
      timers.push(set(() => tick(), FIRST_MS, false));
      timers.push(set(() => tick(), TICK_MS, true));
    }

    function stop() {
      running = false;
      if (wakeTimer) { clearWake(wakeTimer); wakeTimer = null; }
      const clear = deps.clearTimer || ((t) => { clearTimeout(t); clearInterval(t); });
      timers.forEach((t) => clear(t));
      timers = [];
    }

    async function setPaused(paused) {
      const r = await api('updateEngineSettings', { patch: { paused_all: !!paused } });
      if (r && r.settings) st.settings = r.settings;
      st.role = paused ? 'pausado' : st.leaseUntil > now() ? 'este' : st.role === 'pausado' ? null : st.role;
      if (paused && deps.stopRunning) deps.stopRunning();
      changed();
      return st.settings;
    }

    async function saveSettings(patch) {
      const r = await api('updateEngineSettings', { patch });
      if (r && r.settings) st.settings = r.settings;
      changed();
      return st.settings;
    }

    // Simular: nada é enviado nem gravado
    // 2.11.0: por automação ativa, quantos estão esperando (wait) e prontos para rodar agora (run). Só leitura.
    async function queueCounts() {
      await loadSettings();
      if (!st.available || !st.automationsAvailable) return {};
      await loadAutomations();
      const rows = await evaluateAutomations();
      const out = {};
      rows.forEach((r) => {
        if (!r.automation) return;
        const o = out[r.automation.id] || (out[r.automation.id] = { waiting: 0, ready: 0 });
        if (r.ev.action === 'wait') o.waiting++;
        else if (r.ev.action === 'run') o.ready++;
      });
      return out;
    }

    async function simulate(limit = 200) {
      await loadSettings();
      if (!st.available) return { available: false, rows: [] };
      if (st.automationsAvailable) {
        await loadAutomations();
        const rows = await evaluateAutomations();
        return { available: true, automations: true, rows: rows.slice(0, limit), total: rows.length };
      }
      await loadFlows();
      const rows = await evaluate();
      return { available: true, rows: rows.slice(0, limit), total: rows.length };
    }

    return {
      state: st, runnerId, start, stop, tick, leaseTick, poke, refreshActivity, setPaused, saveSettings, simulate, queueCounts, loadSettings, loadFlows,
      // 2.12.0 (só testes): um ciclo das sequências (entrada, decisão, gravação e os envios da fila), sem o laço do motor
      _sequencesOnce: async () => { await refreshSequences(); const done = []; while ((st.seqQueue || []).length) { const j = st.seqQueue.shift(); await runSequenceJob(j); done.push(j); } return done; },
      refreshCounts, evaluate, ensureNoSendLabel, loadAutomations, evaluateAutomations,
      setWaLabel, // 2.7.1: a mensagem rápida usa a mesma troca de etiqueta do WhatsApp das automações
    };
  }

  root.TspEngine = {
    DEFAULT_SETTINGS, NO_SEND_NAME, DAY_NAMES,
    parseHM, normSettings, businessMsBetween, isBusinessTime, addBusinessMs, nextBusinessStart,
    formatWait, formatDays, scheduleText, waitText, formatLeft, hm,
    firstNameOf, chatIdOfContact, pickVariant, evaluateFollow,
    smartFirstName, fillName, hasNameVar, firstWordOf, isCommonName, stripAccents,
    setGreetings, greetingFor, greetingPeriod, learnNameFrom, GREET_DEFAULT, convTracker,
    withRetry, errorReason, createNameLearner, PANEL_HDR_BTNS, // 2.12.1
    defaultPanelPrefs, normPanelPrefs, clampTopH, listShouldRestore, listRestoreTarget, LIST_KEEP_MS, previewSendPlan, sendLabelsApply,
    normBrPhone, matchSalesForPurchase, salePhoneOf, PANEL_TABS, PANEL_FILTERS, PANEL_BLOCKS, PANEL_CONV_BTNS,
    TRIGGER_TYPES, FUTURE_TRIGGERS, evaluateAutomation, automationSummary, automationNeedsChat, automationKeywords,
    automationEntry, leaveKey, isWaTrigger, WA_LABEL_ACTIONS,
    resolveSendItem, nextScheduleAt, AUTOMATION_TEMPLATES, waitPhrase,
    WIZARDS, wizardToAutomations, wizardSentence, wizardMinutes, businessMinutesPerDay, validateAutomationDraft,
    seqIndex, seqStep, seqValidate, seqDescribe, seqNodeLabel, seqTemplate, seqId, seqStartMatches, seqOutcome, SEQ_MAX_DEPTH,
    limitCheck, randomGapMs, estimateDuration, estimateText,
    createMotor,
  };
})(globalThis);
