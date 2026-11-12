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
    // 2.14.3: horário por dia da semana (7 linhas, dom=0…sáb=6; linha vazia = fechado). Sem ele: dias + uma faixa.
    let week = weekFromJson(src.business_week);
    if (!week || !week.some((w) => w.length)) week = [0, 1, 2, 3, 4, 5, 6].map((d) => (days.includes(d) && end > start ? [[start, end]] : []));
    const open = week.map((w, d) => (w.length ? d : null)).filter((d) => d != null);
    const flat = week.flat();
    if (flat.length) { start = Math.min(...flat.map((w) => w[0])); end = Math.max(...flat.map((w) => w[1])); }
    return {
      week,
      paused: src.paused_all === true,
      maxHour: Math.max(1, Number(src.max_per_hour) || 30),
      maxDay: Math.max(1, Number(src.max_per_day) || 150),
      minGapS: min,
      maxGapS: max,
      startMin: start,
      endMin: end,
      days: new Set(open),
      raw: src,
    };
  }

  const ns = (s) => (s && s.days instanceof Set ? s : normSettings(s));
  const atMinute = (y, m, d, minutes) => new Date(y, m, d, Math.floor(minutes / 60), minutes % 60, 0, 0).getTime();

  // 7 linhas de faixas em JSON ([{ start, end }]) → minutos [[ini, fim]], ordenadas (null se não for uma semana)
  function weekFromJson(w) {
    if (!Array.isArray(w) || w.length !== 7) return null;
    return w.map((ws) => (Array.isArray(ws) ? ws : []).map((x) => [parseHM(x && x.start), parseHM(x && x.end)])
      .filter(([a, b]) => a != null && b != null && b > a).sort((x, y) => x[0] - y[0]));
  }
  // Faixas do dia que contém ms, em ms (2.14.3: um dia pode ter mais de uma; vazio = fechado)
  function windowsOfDay(ms, s) {
    const d = new Date(ms);
    const y = d.getFullYear(); const mo = d.getMonth(); const da = d.getDate();
    return (s.week[d.getDay()] || []).map(([a, b]) => [atMinute(y, mo, da, a), atMinute(y, mo, da, b)]);
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
      for (const w of windowsOfDay(day, s)) total += Math.max(0, Math.min(w[1], to) - Math.max(w[0], from));
      day = nextMidnight(day);
    }
    return total;
  }

  function isBusinessTime(ms, settings) {
    return windowsOfDay(ms, ns(settings)).some((w) => ms >= w[0] && ms < w[1]);
  }

  // Momento em que se completam needMs de horário comercial a partir de from (null se nunca)
  function addBusinessMs(from, needMs, settings) {
    const s = ns(settings);
    let left = Math.max(0, needMs);
    let day = midnightOf(from);
    for (let i = 0; i < MAX_DAYS_SCAN; i++) {
      for (const w of windowsOfDay(day, s)) {
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
      for (const w of windowsOfDay(day, s)) if (w[0] >= ms) return w[0];
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

  // 2.14.3: resumo curto da semana: dias seguidos com as mesmas faixas viram "Seg–Sex"; fechado não aparece
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DAY_CAP = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  function weekSummary(week) {
    const key = (d) => (week[d] || []).map(([a, b]) => `${hm(a)}–${hm(b)}`).join(' e ');
    const groups = [];
    WEEK_ORDER.forEach((d) => {
      const k = key(d);
      const g = groups[groups.length - 1];
      if (g && g.k === k) g.days.push(d); else groups.push({ k, days: [d] });
    });
    const open = groups.filter((g) => g.k);
    if (!open.length) return 'nenhum dia';
    if (open.length === 1 && open[0].days.length === 7) return `Todos os dias ${open[0].k}`;
    return open.map((g) => `${g.days.length > 2 ? `${DAY_CAP[g.days[0]]}–${DAY_CAP[g.days[g.days.length - 1]]}` : g.days.map((d) => DAY_CAP[d]).join(', ')} ${g.k}`).join(' · ');
  }
  function scheduleText(settings) {
    return weekSummary(ns(settings).week);
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
    if (now - lastMs < needMs) { // 2.14.2: tempo corrido
      const dueAt = lastMs + needMs;
      return { action: 'wait', reason: 'aguardando', chatId, dueAt, leftMs: Math.max(0, dueAt - now) };
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
  // 2.18.1: nome salvo na AGENDA (e o do perfil) de cada conversa → banco (wa_contact_names), para o ERP mostrar.
  // read({ chatIds? }) = ponte (só a memória do WhatsApp Web, sem consultar servidor); save(items) = banco.
  // Só grava o que mudou desde a última gravação (assinatura por conversa). Ao abrir a conversa: chat(id);
  // lista carregada e varredura leve: sweep() (no máximo 1 a cada sweepMs; sweep(true) força).
  // Sem a tabela (save devolve { available: false }): para de tentar.
  function createAgendaSync({ read, save, now = () => Date.now(), sweepMs = 30 * 60 * 1000, batch = 200 } = {}) {
    const sent = new Map();
    let sweepAt = 0;
    let off = false;
    let busy = false;
    const sig = (x) => `${x.contactName || ''}|${x.pushname || ''}|${x.phone || ''}`;
    const okItem = (x) => !!x && LEARN_CHAT_RE.test(x.chatId || '') && !!(x.contactName || x.pushname);
    async function push(items) {
      const fresh = (Array.isArray(items) ? items : []).filter((x) => okItem(x) && sent.get(x.chatId) !== sig(x));
      let n = 0;
      for (let i = 0; i < fresh.length && !off; i += batch) {
        const part = fresh.slice(i, i + batch).map((x) => ({ chatId: x.chatId, phone: x.phone || null, contactName: x.contactName || null, pushname: x.pushname || null }));
        const r = await save(part);
        if (r && r.available === false) { off = true; break; }
        part.forEach((x) => sent.set(x.chatId, sig(x)));
        n += part.length;
      }
      return n;
    }
    return {
      async chat(chatId) {
        if (off || !LEARN_CHAT_RE.test(chatId || '')) return 0;
        try { const r = await read({ chatIds: [chatId] }); return await push(r && r.items); } catch { return 0; }
      },
      async sweep(force = false) {
        if (off || busy || (!force && sweepAt && now() - sweepAt < sweepMs)) return 0;
        busy = true;
        try {
          const r = await read({});
          if (!r || !Array.isArray(r.items)) return 0; // ponte ainda não pronta: tenta no próximo tique
          sweepAt = now();
          return await push(r.items);
        } catch { return 0; } finally { busy = false; }
      },
      isOff: () => off,
      size: () => sent.size,
    };
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
      keepDeleted: true, // 2.15.0: guardar (só neste computador) as mensagens recebidas para ver as apagadas/editadas
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
      keepDeleted: typeof r.keepDeleted === 'boolean' ? r.keepDeleted : d.keepDeleted,
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
  // 2.16.9: a janela vai do COMEÇO do envio até 3 s depois da ÚLTIMA parte que saiu (holding = envio da extensão em
  // andamento; holdUntil = fim da janela). Com mídia (upload) e várias partes o pulo vinha depois dos 2 s de antes.
  // Sem holdUntil (jeito antigo): armAt + LIST_KEEP_MS.
  const LIST_KEEP_MS = 3000;
  // topIsOther (2.16.9): no topo da lista ficou OUTRA conversa, não a aberta para a qual você mandou (mensagem de
  // cliente chegando no meio do envio) → não volta. A conversa aberta fora da lista (lista filtrada) não conta.
  function listShouldRestore({ enabled, now, armAt, userAt, scrollTop, saved, restores, holding = false, holdUntil = null, topIsOther = false }) {
    if (!enabled || !armAt || topIsOther) return false;
    const until = Number.isFinite(Number(holdUntil)) && holdUntil != null ? Number(holdUntil) : armAt + LIST_KEEP_MS;
    if (!holding && now > until) return false;
    if (userAt >= armAt) return false;
    if (saved == null || saved <= 8 || scrollTop > 8) return false;
    return (restores || 0) < 3;
  }
  // shift: + 1 linha (a conversa que recebeu subiu para o topo). 2.16.9: só na 1ª volta de um envio (nas partes
  // seguintes a conversa já está no topo: volta para o mesmo lugar, sem escorregar uma linha por parte)
  const listRestoreTarget = ({ saved, rowH, scrollHeight, clientHeight, shift = true }) =>
    Math.round(Math.max(0, Math.min(Math.max(0, (scrollHeight || 0) - (clientHeight || 0)), (saved || 0) + (shift ? Math.min(120, Math.max(40, Number(rowH) || 72)) : 0))));

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
  //   activity: 2.12.8 — por conversa: última mensagem (lastAt, lastFrom 'cliente'|'loja'), última do
  //             cliente, lead novo (isNewLead/firstMessageAt) e os dias (SP) em que o cliente/a loja falaram;
  //             a varredura da abertura não entra (ela traz a própria atividade). Sem o sinal de compra.
  const TURN_GAP_S = 30 * 60;
  // 2.12.8: dia em São Paulo (UTC−3, como o ERP) de uma hora em segundos
  const spDayOfSec = (t) => new Date((Number(t) - 3 * 3600) * 1000).toISOString().slice(0, 10);
  // atividade de uma mensagem (evento da ponte)
  function activityOfEvent(e) {
    const mine = e.fromMe === true;
    return {
      chatId: e.chatId, phone: e.phone || null, name: null, lastAt: e.t, lastFrom: mine ? 'loja' : 'cliente', lastCustomerAt: mine ? null : e.t,
      isNewLead: !mine && e.first ? true : null, firstMessageAt: !mine && e.first ? e.t : null,
      days: [{ day: spDayOfSec(e.t), customer: !mine, store: mine }],
    };
  }
  // junta duas atividades da mesma conversa (como o gatilho do banco: só avança, o que já se sabe fica)
  function mergeActivity(a, b) {
    if (!a) return { ...b, days: (b.days || []).map((d) => ({ ...d })) };
    if (!b) return a;
    const max = (x, y) => (x == null ? (y == null ? null : y) : y == null ? x : Math.max(x, y));
    const min = (x, y) => (x == null ? (y == null ? null : y) : y == null ? x : Math.min(x, y));
    const bNewer = (b.lastAt ?? -Infinity) >= (a.lastAt ?? -Infinity);
    const days = new Map((a.days || []).map((d) => [d.day, { ...d }]));
    (b.days || []).forEach((d) => {
      const c = days.get(d.day) || { day: d.day, customer: false, store: false };
      c.customer = c.customer || !!d.customer;
      c.store = c.store || !!d.store;
      days.set(d.day, c);
    });
    return {
      chatId: a.chatId, phone: b.phone || a.phone || null, name: b.name || a.name || null,
      lastAt: max(a.lastAt, b.lastAt), lastFrom: (bNewer ? b.lastFrom || a.lastFrom : a.lastFrom || b.lastFrom) || null,
      lastCustomerAt: max(a.lastCustomerAt, b.lastCustomerAt),
      isNewLead: a.isNewLead ?? b.isNewLead ?? null, firstMessageAt: min(a.firstMessageAt, b.firstMessageAt),
      days: [...days.values()].sort((x, y) => (x.day < y.day ? -1 : 1)),
    };
  }
  // 2.12.8: fila da atividade com no máximo 1 gravação por conversa a cada gapMs (30 s). add() junta; take(now)
  // devolve as conversas que já podem ser gravadas (as outras esperam, juntando o que chegar)
  function activityBuffer(gapMs = 30 * 1000) {
    const pending = new Map();
    const lastWrite = new Map();
    return {
      add(items) { (items || []).forEach((it) => { if (it && typeof it.chatId === 'string') pending.set(it.chatId, mergeActivity(pending.get(it.chatId), it)); }); },
      take(now = Date.now()) {
        const out = [];
        pending.forEach((it, id) => {
          const w = lastWrite.get(id);
          if (w !== undefined && now - w < gapMs) return;
          out.push(it);
          lastWrite.set(id, now);
        });
        out.forEach((it) => pending.delete(it.chatId));
        if (lastWrite.size > 20000) lastWrite.clear();
        return out;
      },
      // devolve à fila o que não deu para gravar (a próxima tentativa respeita os 30 s)
      putBack(items) { (items || []).forEach((it) => { if (it && typeof it.chatId === 'string') pending.set(it.chatId, mergeActivity(it, pending.get(it.chatId))); }); },
      size: () => pending.size,
    };
  }
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
            if (!e.fromMe && e.first) out.leads.push({ chatId: chat, phone: e.phone || null, t: e.t, ad: e.ad || null, ...(e.ig ? { ig: e.ig } : {}), ...(!e.ig && e.igh ? { igh: e.igh } : {}) }); // 2.18.0: ig = código [IG-...] (só quando veio); 2.18.2: igh = resumo da frase
            if (e.scan) return; // varredura da abertura: só o lead
            act.set(chat, mergeActivity(act.get(chat), activityOfEvent(e)));
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

  // 2.12.5: etiqueta do WhatsApp do gatilho (automação com gatilho de etiqueta, ou sequência que começa por
  // etiqueta do WhatsApp); null se não houver
  const WA_LABEL_TRIGGERS = ['sem_resposta', 'entrou_etiqueta', 'respondeu'];
  function waTriggerLabelOf(a) {
    if (!a) return null;
    if (a.kind === 'sequencia') {
      const s = a.sequence && a.sequence.start;
      return s && s.type === 'etiqueta' && s.source === 'whatsapp' && s.wa_label_id ? String(s.wa_label_id) : null;
    }
    return a.trigger_label_source === 'whatsapp' && WA_LABEL_TRIGGERS.includes(a.trigger_type) && a.trigger_wa_label_id ? String(a.trigger_wa_label_id) : null;
  }

  // 2.12.6: frase da confirmação de "ligar". kind: 'etiqueta' | 'dia_hora' | 'venda' | 'outro'; n = quantos já estão
  // na etiqueta (null = ainda contando / não se aplica)
  function activationSentence({ name, label, kind, n }) {
    let t = `Ligar '${name || 'automação'}'? `;
    if (label) t += `Vale só para quem entrar na etiqueta ${label} a partir de agora.`;
    else if (kind === 'dia_hora') t += 'Vale a partir do próximo dia e hora.';
    else if (kind === 'venda') t += 'Só as vendas registradas a partir de agora disparam.';
    else t += 'Vale só para quem entrar a partir de agora.';
    if (label && Number.isInteger(n)) t += n ? ` ${n} contato${n === 1 ? '' : 's'} que já ${n === 1 ? 'está' : 'estão'} nela não ${n === 1 ? 'vai' : 'vão'} receber.` : ' Ninguém está nela agora.';
    return t;
  }

  // ── 2.12.4: depois de registrar a venda (💰) ─────────────────────────────
  // Escolhas: leaveAll (tirar de todas as automações e sequências), waAdd (etiqueta do WhatsApp; '' = nenhuma),
  // waRemove ('' = nenhuma, SALE_WA_ALL = todas menos a que vai colocar, ou uma etiqueta), crmAdd ('' = não mexe).
  const SALE_WA_ALL = '__todas__';
  const foldName = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const isNoSendLabel = (l) => !!l && foldName(l.name) === 'nao enviar';
  // padrão: tirar de tudo; etiqueta do WhatsApp "Cliente" (se existir); tirar nenhuma; CRM não mexe. A escolha
  // salva vale enquanto a etiqueta ainda existir; "Não enviar" nunca fica como "tirar".
  function saleAfterDefaults(saved, waLabels, crmLabels) {
    const wa = Array.isArray(waLabels) ? waLabels : [];
    const crm = Array.isArray(crmLabels) ? crmLabels : [];
    const s = saved && typeof saved === 'object' ? saved : null;
    const cliente = (wa.find((l) => foldName(l.name) === 'cliente') || {}).id || '';
    const waExists = (id) => !wa.length || wa.some((l) => l.id === id); // lista ainda não lida: mantém
    const waAdd = s && typeof s.waAdd === 'string' ? (s.waAdd === '' || waExists(s.waAdd) ? s.waAdd : cliente) : cliente;
    const rem = s && typeof s.waRemove === 'string' ? s.waRemove : '';
    const waRemove = rem === SALE_WA_ALL || (rem && waExists(rem) && !isNoSendLabel(wa.find((l) => l.id === rem))) ? rem : '';
    const crmAdd = s && typeof s.crmAdd === 'string' && crm.some((l) => l.id === s.crmAdd) ? s.crmAdd : '';
    return { leaveAll: s ? s.leaveAll !== false : true, waAdd, waRemove, crmAdd };
  }
  // O que fazer nas etiquetas do WhatsApp da conversa: { add, remove: [ids] }. Nunca tira "Não enviar" nem a que vai
  // colocar; etiqueta que não existe mais é ignorada (add vira null com missing: true).
  function saleWaPlan({ waAdd, waRemove }, waLabels, currentIds) {
    const wa = Array.isArray(waLabels) ? waLabels : [];
    const byId = (id) => wa.find((l) => String(l.id) === String(id)) || null;
    const add = waAdd && byId(waAdd) ? String(waAdd) : null;
    let remove = [];
    if (waRemove === SALE_WA_ALL) remove = (currentIds || []).map(String);
    else if (waRemove) remove = [String(waRemove)];
    remove = [...new Set(remove)].filter((id) => id !== add && byId(id) && !isNoSendLabel(byId(id)));
    return { add, remove, missing: !!waAdd && !add };
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
      if (now - fromMs < need) { // 2.14.2: tempo corrido
        const dueAt = fromMs + need;
        return { action: 'wait', reason: 'aguardando', chatId, dueAt, leftMs: Math.max(0, dueAt - now), entry };
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
  const SEQ_MAX_DEPTH = 10; // 2.16.4: até 10 "esperar resposta" um dentro do outro (antes 5)
  const SEQ_UNIT_MIN = { minutos: 1, horas: 60, dias: 1440 };
  // 2.16.0: espera contada desde a ENTRADA na automação (from: 'entrada'; ⏳ no modo tempo e ❓). Sem from = depois da
  // etapa anterior (como sempre).
  const seqFromEntry = (n) => !!n && n.from === 'entrada' && (n.type === 'esperar' || (n.type === 'pausa' && n.mode !== 'ate'));
  const seqNeedMin = (n) => Math.max(1, Number(n.amount) || 0) * (SEQ_UNIT_MIN[n.unit] || 60);
  const seqNeedMs = (n) => seqNeedMin(n) * MIN_MS;
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
  // run = { node, wait_started_at (ms), last_sent_at (ms), skip_wait, branches, entered_at (ms: quando entrou na automação) }
  // → { status: 'run' (mandar send.itemId e ir para node) | 'progress' (só gravar node/espera/etiquetas) | 'wait' | 'end',
  //     node, waitStart, ops: [etiquetas], send, branches (novas), outcome, dueAt, reason }
  function seqStep({ def, run, chat, replies, now, settings }) {
    const idx = seqIndex(def);
    const ops = [];
    const branches = [];
    let id = run.node || seqFirstOf(def.steps);
    let skip = !!run.skip_wait;
    let win = null; // 2.13.2: faixa "enviar só entre" da última espera que esta decisão passou
    const waitStart = Number(run.wait_started_at) || null;
    const lastSent = Number(run.last_sent_at) || null;
    const entered = Number(run.entered_at) || null; // 2.16.0 (sem ela: "desde a entrada" conta como "depois da anterior")
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
      if (n.type === 'enviar') return { status: 'run', node: seqNextOf(idx, id), sendNode: id, send: { itemId: n.item_id || null }, ops, branches, waitStart: null, window: win };
      // 2.13.0: ⏳ ESPERAR (só o tempo, sem caminhos): chegou agora → grava o começo; venceu → segue
      if (n.type === 'pausa') {
        if (seqFromEntry(n) && entered) {
          // 2.16.0: "até X depois de entrar": já passou (ex.: entrou no meio) → segue na hora
          const due = entered + seqNeedMs(n);
          if (now < due) {
            if (run.node !== id || !waitStart) return { status: 'progress', node: id, waitStart: now, ops, branches };
            return { status: 'wait', node: id, ops, branches, dueAt: due, reason: 'esperando o tempo desde a entrada' };
          }
        } else if (run.node !== id || !waitStart) return { status: 'progress', node: id, waitStart: now, ops, branches };
        // 2.13.2: "esperar até o próximo [dia] às HH:MM" (relógio, sem horário comercial)
        else if (n.mode === 'ate') {
          const until = pausaUntil(waitStart, n);
          if (until == null || now < until) return { status: 'wait', node: id, ops, branches, dueAt: until, reason: 'esperando o dia e a hora' };
        } else {
          const need = Math.max(1, Number(n.amount) || 0) * (SEQ_UNIT_MIN[n.unit] || 60) * MIN_MS;
          // 2.14.2: esperas sempre em tempo corrido (o envio que cair fora do horário espera o próximo horário permitido)
          if (now - waitStart < need) return { status: 'wait', node: id, ops, branches, dueAt: waitStart + need, reason: 'esperando o tempo' };
        }
        win = n.send_window || null; // 2.13.2: o envio seguinte só nesta faixa
        id = seqNextOf(idx, id);
        if (!id) return end('fim');
        // a próxima caixa começa agora (outra espera grava o próprio começo no ciclo seguinte)
        const nx = idx.get(id);
        if (nx && (nx.node.type === 'esperar' || nx.node.type === 'pausa')) return { status: 'progress', node: id, waitStart: now, ops, branches };
        continue;
      }
      if (n.type === 'esperar') {
        // chegou agora na espera: grava o começo (a decisão vem no próximo ciclo)
        if (run.node !== id || !waitStart) return { status: 'progress', node: id, waitStart: now, ops, branches };
        if (!chat || !chat.loaded) return { status: 'wait', node: id, ops, branches, reason: 'conversa não carregada' };
        const ref = lastSent && lastSent <= waitStart ? lastSent : waitStart;
        if (!skip && seqReplied(ref, chat, replies)) {
          branches.push({ node: id, result: 'sim', at: now });
          win = n.send_window || null;
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
        if (!timedOut && seqFromEntry(n) && entered) {
          // 2.16.0: prazo "até X depois de entrar" (o "contar da minha mensagem" não vale aqui); já passou → ❌ na hora
          dueAt = entered + need;
          timedOut = now >= dueAt;
        } else if (!timedOut) {
          if (n.after_mine && !mine) return { status: 'wait', node: id, ops, branches, reason: 'esperando a sua mensagem', dueAt: null };
          const from = Math.max(waitStart, mine);
          timedOut = now - from >= need; // 2.14.2: tempo corrido
          dueAt = from + need;
        }
        if (!timedOut) return { status: 'wait', node: id, ops, branches, dueAt, reason: 'esperando resposta' };
        branches.push({ node: id, result: 'nao', at: now });
        win = n.send_window || null;
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
      if (n.type === 'pausa' && n.mode !== 'ate' && !(Number(n.amount) >= 1)) out.push({ node: n.id, msg: 'Escolha quanto tempo esperar.' }); // 2.13.0 (2.13.4: no "até o próximo dia às" vale a hora)
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
    // 2.13.0: "Nunca para quem tem a etiqueta" (além do Não enviar, sempre)
    (Array.isArray(st.exclude) ? st.exclude : []).forEach((x) => { if (!(x && (x.source === 'whatsapp' ? x.wa_label_id : x.label_id))) out.push({ node: 'start', msg: 'Escolha a etiqueta de "Nunca para quem tem".' }); });
    out.push(...scheduleProblems(def)); // 2.13.2
    return out;
  }

  // ── 2.13.2: horário por automação e por etapa ──
  // def.schedule = { mode: 'geral' | 'personalizado', days: [0..6], windows: [{ start: 'HH:MM', end: 'HH:MM' }], daily_limit }
  //   geral = o "Horário geral" (Limites e horário); personalizado = estes dias e faixas (vale só para esta automação).
  // ⏳ pausa: mode 'tempo' (padrão: amount/unit) | 'ate' (until_day: 'qualquer' | 0..6, until_time: 'HH:MM').
  // ⏳ pausa e ❓ esperar: send_window = { start, end } — o envio SEGUINTE só sai nessa faixa (o prazo conta normal).
  // Ordem: faixa da etapa → horário da automação → limites gerais por hora/dia e intervalo (sempre valem).
  const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const minOf = (v) => (HM_RE.test(String(v || '')) ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)) : null);
  const COMMON_START = 8 * 60;
  const COMMON_END = 21 * 60;
  // dias e faixas (em minutos) que valem para a automação
  // 2.14.3: semana (minutos) de um horário personalizado: { week } novo, ou { days, windows } antigo convertido
  // (mesmo resultado: cada dia marcado ganha as mesmas faixas)
  function weekOf(sc) {
    const nw = weekFromJson(sc && sc.week);
    if (nw) return nw;
    const days = new Set(((sc && sc.days) || []).map(Number));
    const ws = ((sc && sc.windows) || []).map((w) => [minOf(w && w.start), minOf(w && w.end)]).filter(([a, b]) => a != null && b != null && b > a).sort((x, y) => x[0] - y[0]);
    return [0, 1, 2, 3, 4, 5, 6].map((d) => (days.has(d) ? ws.map((w) => [...w]) : []));
  }
  const weekToJson = (week) => week.map((ws) => ws.map(([a, b]) => ({ start: hm(a), end: hm(b) })));
  // o horário personalizado no formato novo (para a tela e para gravar): { mode, week, daily_limit? }
  function scheduleWeekJson(sc) {
    const out = { mode: 'personalizado', week: Array.isArray(sc && sc.week) && sc.week.length === 7 ? sc.week.map((ws) => (Array.isArray(ws) ? ws : []).map((w) => ({ start: String((w && w.start) || ''), end: String((w && w.end) || '') }))) : weekToJson(weekOf(sc)) };
    if (sc && sc.daily_limit != null && sc.daily_limit !== '') out.daily_limit = sc.daily_limit;
    return out;
  }
  // "Copiar para os dias úteis": a linha de segunda vai para terça–sexta
  const copyToWeekdays = (weekJson) => weekJson.map((ws, d) => (d >= 2 && d <= 5 ? (weekJson[1] || []).map((w) => ({ ...w })) : ws.map((w) => ({ ...w }))));
  // faixa de uma linha fora do horário comum (08:00–21:00): aviso amarelo por linha
  const rowOutsideCommon = (ws) => (ws || []).some((w) => { const a = minOf(w && w.start); const b = minOf(w && w.end); return a != null && b != null && (a < COMMON_START || b > COMMON_END); });
  function scheduleSpec(def, settings) {
    const sc = def && def.schedule;
    if (sc && sc.mode === 'personalizado') return { custom: true, week: weekOf(sc) };
    return { custom: false, week: ns(settings).week };
  }
  const minuteOfDay = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
  const inSpec = (ms, spec) => (spec.week[new Date(ms).getDay()] || []).some(([a, b]) => minuteOfDay(ms) >= a && minuteOfDay(ms) < b);
  // próximo momento >= ms dentro do horário (null se não houver em 15 dias)
  function nextInSpec(ms, spec) {
    if (inSpec(ms, spec)) return ms;
    let day = midnightOf(ms);
    for (let i = 0; i < 15; i++) {
      const d = new Date(day);
      for (const [a] of spec.week[d.getDay()] || []) {
        const t = atMinute(d.getFullYear(), d.getMonth(), d.getDate(), a);
        if (t >= ms) return t;
      }
      day = nextMidnight(day);
    }
    return null;
  }
  const winSpec = (w) => { const a = minOf(w && w.start); const b = minOf(w && w.end); return a != null && b != null && b > a ? { week: [0, 1, 2, 3, 4, 5, 6].map(() => [[a, b]]) } : null; };
  // quando a etapa pode enviar: faixa da etapa e horário da automação ao mesmo tempo (null = nunca em 15 dias)
  function nextSendTime(ms, def, stepWindow, settings) {
    const spec = scheduleSpec(def, settings);
    const ws = winSpec(stepWindow);
    let t = ms;
    for (let i = 0; i < 60 && t != null; i++) {
      if (ws && !inSpec(t, ws)) { t = nextInSpec(t, ws); continue; }
      if (!inSpec(t, spec)) { t = nextInSpec(t, spec); continue; }
      return t;
    }
    return null;
  }
  // 2.16.8: "Pular espera" já clicado (skip_wait): quando o envio deve sair, com as mesmas regras do motor — faixa da
  // etapa + horário da automação (nextSendTime), "Pausar tudo", limite do dia (geral e o da régua), limite por hora
  // (janela de 60 min: volta quando o envio mais antigo dela completar 1 h) e o intervalo médio entre contatos.
  // position = lugar aproximado na fila de envio (1 = o próximo). Não manda nada.
  // → { kind: 'fila' | 'horario' | 'hora' | 'dia' | 'pausado' | 'nunca', at, position, text }
  const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function seqSkipForecast({ def, window = null, settings, now, position = 1, counts = {}, lastSentAt = null, oldestHourAt = null, sentTodaySeq = null } = {}) {
    const s = ns(settings);
    const HOUR = 60 * MIN_MS;
    const pad = (n) => String(n).padStart(2, '0');
    const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const day = (ms) => {
      const d = midnightOf(ms);
      if (d === midnightOf(now)) return `hoje ${hm(ms)}`;
      if (d === nextMidnight(midnightOf(now))) return `amanhã ${hm(ms)}`;
      const x = new Date(ms);
      return `${WEEKDAY_SHORT[x.getDay()]} ${pad(x.getDate())}/${pad(x.getMonth() + 1)} ${hm(ms)}`;
    };
    const back = (ms) => (midnightOf(ms) === midnightOf(now) ? `volta às ${hm(ms)}` : `volta ${day(ms)}`);
    const pos = Math.max(1, Math.floor(Number(position) || 1));
    if (s.paused) return { kind: 'pausado', at: null, position: pos, text: 'pausado ("Pausar tudo" ligado)' };
    const open = nextSendTime(now, def, window, settings);
    if (open == null) return { kind: 'nunca', at: null, position: pos, text: 'sem horário possível para enviar (confira os horários)' };
    const lim = scheduleDailyLimit(def);
    if ((Number(counts.day) || 0) >= s.maxDay || (lim && Number(sentTodaySeq) >= lim)) {
      const at = nextSendTime(nextMidnight(now), def, window, settings);
      return { kind: 'dia', at, position: pos, text: `limite do dia — ${at ? back(at) : 'volta amanhã'}` };
    }
    if (open > now) return { kind: 'horario', at: open, position: pos, text: `fora do horário — ${day(open)}` };
    const hourFree = Number.isFinite(Number(oldestHourAt)) && oldestHourAt ? Number(oldestHourAt) + HOUR : now + HOUR;
    if ((Number(counts.hour) || 0) >= s.maxHour) {
      const at = nextSendTime(Math.max(now, hourFree), def, window, settings) || hourFree;
      return { kind: 'hora', at, position: pos, text: `limite por hora — ${back(at)}` };
    }
    const avg = ((s.minGapS + s.maxGapS) / 2) * 1000;
    let eta = Math.max(now, lastSentAt ? Number(lastSentAt) + avg : now) + (pos - 1) * avg;
    if (pos > s.maxHour - (Number(counts.hour) || 0)) eta = Math.max(eta, hourFree); // não cabe nesta hora
    eta = nextSendTime(eta, def, window, settings) || eta;
    return { kind: 'fila', at: eta, position: pos, text: `na fila: ${pos}º · sai por volta de ${midnightOf(eta) === midnightOf(now) ? hm(eta) : day(eta)}` };
  }
  // ⏳ "Esperar até o próximo [dia] às HH:MM": a próxima vez, DEPOIS do começo da espera
  function pausaUntil(waitStart, n) {
    const m = minOf(n && n.until_time);
    if (m == null) return null;
    const want = n.until_day === 'qualquer' || n.until_day == null || n.until_day === '' ? null : Number(n.until_day);
    let day = midnightOf(waitStart);
    for (let i = 0; i < 15; i++) {
      const d = new Date(day);
      const t = atMinute(d.getFullYear(), d.getMonth(), d.getDate(), m);
      if (t > waitStart && (want == null || d.getDay() === want)) return t;
      day = nextMidnight(day);
    }
    return null;
  }
  // limite próprio por dia (vazio = só os limites gerais)
  const scheduleDailyLimit = (def) => { const n = Number(def && def.schedule && def.schedule.daily_limit); return Number.isInteger(n) && n > 0 ? n : null; };
  // faixas fora do horário comum (08:00–21:00): aviso amarelo, mas deixa
  function scheduleOutsideCommon(def) {
    const sc = def && def.schedule;
    const ws = sc && sc.mode === 'personalizado' ? weekToJson(weekOf(sc)).flat() : [];
    seqIndex(def).forEach(({ node: n }) => { if (n.send_window) ws.push(n.send_window); });
    return ws.some((w) => { const a = minOf(w && w.start); const b = minOf(w && w.end); return a != null && b != null && (a < COMMON_START || b > COMMON_END); });
  }
  const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const DAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function daysText(days) {
    const d = [...new Set(days)].map(Number).sort((a, b) => a - b);
    if (d.length === 7) return 'todos os dias';
    // seguidos (seg–sex) viram faixa
    if (d.length >= 3 && d[d.length - 1] - d[0] === d.length - 1) return `${DAY_SHORT[d[0]]}–${DAY_SHORT[d[d.length - 1]]}`;
    return d.map((x) => DAY_SHORT[x]).join(', ');
  }
  // "Envia entre 09:00 e 12:00 e entre 14:00 e 18:00, seg–sex" / "Envia no horário geral (…)"
  function scheduleSentence(def, settings) {
    const sc = def && def.schedule;
    const lim = scheduleDailyLimit(def);
    const limTxt = lim ? `; no máximo ${lim} por dia` : '';
    if (!sc || sc.mode !== 'personalizado') return `Envia no horário geral (${scheduleText(settings)})${limTxt}`;
    const wk = weekOf(sc);
    return `${wk.some((w) => w.length) ? weekSummary(wk) : '(escolha os dias e as faixas)'}${limTxt}`; // 2.14.3: "Seg–Sex 19:00–22:00 · Sáb 10:00–14:00"
  }
  const untilText = (n) => {
    const day = n.until_day === 'qualquer' || n.until_day == null || n.until_day === '' ? null : Number(n.until_day);
    return `até ${day == null ? 'o próximo dia' : `${day === 0 || day === 6 ? 'o próximo' : 'a próxima'} ${DAY_LONG[day]}`} às ${n.until_time || '--:--'}`;
  };
  const windowText = (w) => (w && minOf(w.start) != null && minOf(w.end) != null ? `envia só entre ${w.start} e ${w.end}` : '');
  // validação dos horários (vai junto com seqValidate)
  function scheduleProblems(def) {
    const out = [];
    const sc = def && def.schedule;
    if (sc && sc.mode === 'personalizado') {
      if (Array.isArray(sc.week)) {
        // 2.14.3: por dia
        const all = sc.week.flatMap((ws) => (Array.isArray(ws) ? ws : []));
        if (!all.length) out.push({ node: 'start', msg: 'Horário personalizado: deixe pelo menos um dia aberto.' });
        if (all.some((w) => minOf(w && w.start) == null || minOf(w && w.end) == null || minOf(w.end) <= minOf(w.start))) out.push({ node: 'start', msg: 'Horário personalizado: cada faixa precisa de início antes do fim.' });
      } else {
        if (!(sc.days || []).length) out.push({ node: 'start', msg: 'Horário personalizado: escolha pelo menos um dia.' });
        const ws = sc.windows || [];
        if (!ws.length) out.push({ node: 'start', msg: 'Horário personalizado: adicione uma faixa de horário.' });
        if (ws.some((w) => minOf(w && w.start) == null || minOf(w && w.end) == null || minOf(w.end) <= minOf(w.start))) out.push({ node: 'start', msg: 'Horário personalizado: cada faixa precisa de início antes do fim.' });
      }
    }
    if (sc && sc.daily_limit != null && sc.daily_limit !== '' && !(Number.isInteger(Number(sc.daily_limit)) && Number(sc.daily_limit) > 0)) out.push({ node: 'start', msg: 'Limite por dia: um número inteiro (ou vazio).' });
    seqIndex(def).forEach(({ node: n }) => {
      if (n.type === 'pausa' && n.mode === 'ate' && minOf(n.until_time) == null) out.push({ node: n.id, msg: 'Escolha a hora (HH:MM).' });
      if (n.send_window && (minOf(n.send_window.start) == null || minOf(n.send_window.end) == null || minOf(n.send_window.end) <= minOf(n.send_window.start))) out.push({ node: n.id, msg: '"Enviar só entre": o início precisa ser antes do fim.' });
    });
    return out;
  }

  // ── 2.14.0: disparos — velocidade e segurança, previsão, variações e {a|b} ──
  // Limite duro: nenhum disparo passa disso, qualquer que seja o modelo (o servidor confere de novo).
  const CAMP_HARD = { min_s: 20, per_hour: 60, per_day: 400 };
  const CAMP_PRESETS = {
    seguro: { min_s: 90, max_s: 180, per_hour: 20, per_day: 100, pause_every: 15, pause_min: 10 },
    normal: { min_s: 45, max_s: 120, per_hour: 30, per_day: 150, pause_every: 20, pause_min: 5 },
  };
  const CAMP_PRESET_LABEL = { seguro: 'Bem seguro', normal: 'Normal', personalizado: 'Personalizado' };
  // Velocidade efetiva (sem "speed" = Normal). Personalizado: os números escolhidos, presos ao limite duro.
  function campaignSpeed(speed) {
    const s = speed && typeof speed === 'object' ? speed : {};
    const preset = s.preset === 'personalizado' || CAMP_PRESETS[s.preset] ? s.preset : 'normal';
    const base = preset === 'personalizado' ? { ...CAMP_PRESETS.normal, ...s } : CAMP_PRESETS[preset];
    const int = (v, d) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d);
    const min_s = Math.max(CAMP_HARD.min_s, Math.min(3600, int(base.min_s, 45)));
    const max_s = Math.max(min_s, Math.min(3600, int(base.max_s, 120)));
    const per_hour = Math.min(CAMP_HARD.per_hour, Math.max(1, int(base.per_hour, 30)));
    const per_day = Math.min(CAMP_HARD.per_day, Math.max(1, int(base.per_day, 150)));
    const pause_every = Math.max(0, Math.min(500, int(base.pause_every, 0)));
    const pause_min = pause_every ? Math.max(1, Math.min(240, int(base.pause_min, 5))) : 0;
    const schedule = preset === 'personalizado' && s.schedule && s.schedule.mode === 'personalizado' ? s.schedule : null;
    return { preset, min_s, max_s, per_hour, per_day, pause_every, pause_min, schedule };
  }
  // Mais rápido que o "Normal": aviso amarelo de risco de bloqueio
  function campaignSpeedRisk(speed) {
    const sp = campaignSpeed(speed);
    const n = CAMP_PRESETS.normal;
    return sp.min_s < n.min_s || sp.max_s < n.max_s || sp.per_hour > n.per_hour || sp.per_day > n.per_day;
  }
  // O que o personalizado pediu e o limite duro cortou (para a tela dizer)
  function campaignSpeedClamped(speed) {
    const s = speed && typeof speed === 'object' ? speed : {};
    if (s.preset !== 'personalizado') return [];
    const out = [];
    if (Number(s.min_s) < CAMP_HARD.min_s) out.push(`intervalo mínimo de ${CAMP_HARD.min_s} s`);
    if (Number(s.per_hour) > CAMP_HARD.per_hour) out.push(`no máximo ${CAMP_HARD.per_hour} por hora`);
    if (Number(s.per_day) > CAMP_HARD.per_day) out.push(`no máximo ${CAMP_HARD.per_day} por dia`);
    return out;
  }
  function campaignSpeedText(speed, settings) {
    const sp = campaignSpeed(speed);
    const pause = sp.pause_every ? `; pausa de ${sp.pause_min} min a cada ${sp.pause_every} envios` : '';
    const when = sp.schedule ? scheduleSentence({ schedule: sp.schedule }, settings).replace(/^Envia /, '') : `no horário geral (${scheduleText(settings)})`;
    return `${CAMP_PRESET_LABEL[sp.preset]}: ${sp.min_s}–${sp.max_s} s entre envios, até ${sp.per_hour}/hora e ${sp.per_day}/dia${pause}; ${when}`;
  }
  function campaignGapMs(speed, rnd = Math.random) {
    const sp = campaignSpeed(speed);
    const r = Math.min(1, Math.max(0, Number(rnd()) || 0));
    return Math.round((sp.min_s + r * (sp.max_s - sp.min_s)) * 1000);
  }
  // Pode mandar o próximo deste disparo agora? counts = TODOS os envios automáticos da última hora/de hoje
  // (disparo + automações + agendados): os dois juntos não passam do limite do disparo nem do geral.
  // sent = quantos este disparo já enviou; lastSentAt = o último; nextAt = último + intervalo sorteado.
  function campaignGate({ speed, sent = 0, lastSentAt = null, nextAt = null, counts = { hour: 0, day: 0 }, now, settings }) {
    const sp = campaignSpeed(speed);
    const at = nextSendTime(now, sp.schedule ? { schedule: sp.schedule } : {}, null, settings);
    if (at == null) return { ok: false, reason: 'sem horário para enviar', until: null };
    if (at > now) return { ok: false, reason: 'fora do horário do disparo', until: at };
    const g = ns(settings);
    if ((counts.hour || 0) >= Math.min(sp.per_hour, g.maxHour)) return { ok: false, reason: 'limite por hora (disparo + automações)', until: null };
    if ((counts.day || 0) >= Math.min(sp.per_day, g.maxDay)) return { ok: false, reason: 'limite do dia (disparo + automações)', until: null };
    const last = Number(lastSentAt) || 0;
    if (sp.pause_every && sent > 0 && sent % sp.pause_every === 0 && last && now - last < sp.pause_min * 60000) {
      return { ok: false, reason: `pausa de ${sp.pause_min} min a cada ${sp.pause_every} envios`, until: last + sp.pause_min * 60000 };
    }
    if (nextAt && now < nextAt) return { ok: false, reason: 'intervalo do disparo', until: nextAt };
    return { ok: true, reason: '', until: null };
  }
  // Previsão: quando o último sai (intervalo médio do disparo ou o geral, o maior; limites por hora/dia; pausas;
  // horário do disparo ou o geral). Sem contar as automações (que só podem atrasar).
  function campaignForecast(count, speed, settings, startAt) {
    const sp = campaignSpeed(speed);
    const g = ns(settings);
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (!n) return { endAt: startAt, ms: 0 };
    const gap = Math.round(Math.max((sp.min_s + sp.max_s) / 2, (g.minGapS + g.maxGapS) / 2) * 1000);
    const hourCap = Math.min(sp.per_hour, g.maxHour);
    const dayCap = Math.min(sp.per_day, g.maxDay);
    const def = sp.schedule ? { schedule: sp.schedule } : {};
    let t = startAt;
    let hour = [];
    let dayKey = null;
    let dayN = 0;
    let last = startAt;
    for (let i = 0; i < n; i++) {
      for (let guard = 0; guard < 2000; guard++) {
        const at = nextSendTime(t, def, null, settings);
        if (at == null) return null;
        t = at;
        hour = hour.filter((x) => x > t - 3600000);
        if (hour.length >= hourCap) { t = hour[0] + 3600000; continue; }
        if (midnightOf(t) !== dayKey) { dayKey = midnightOf(t); dayN = 0; }
        if (dayN >= dayCap) { t = nextMidnight(t); continue; }
        break;
      }
      hour.push(t);
      dayN++;
      last = t;
      t += gap;
      if (sp.pause_every && (i + 1) % sp.pause_every === 0) t += sp.pause_min * 60000;
    }
    return { endAt: last, ms: last - startAt };
  }
  const hm2 = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function forecastText(count, fc, now) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    const who = `${n} contato${n === 1 ? '' : 's'}`;
    if (!n) return `${who} · nada para enviar`;
    if (!fc) return `${who} · sem horário para enviar`;
    const h = fc.ms / 3600000;
    const dur = h < 1 ? `${Math.max(1, Math.round(fc.ms / 60000))} min` : h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} dias`;
    const dd = Math.round((midnightOf(fc.endAt) - midnightOf(now)) / 86400000);
    const d = new Date(fc.endAt);
    const day = dd <= 0 ? 'hoje' : dd === 1 ? 'amanhã' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${who} · termina em cerca de ${dur} (${day} às ${hm2(fc.endAt)})`;
  }
  // Sorteio de palavras: {Oi|Olá|Oiii} vira uma delas a cada envio ({nome} e {, nome} ficam: não têm "|")
  const SPIN_RE = /\{([^{}|]*(?:\|[^{}|]*)+)\}/g;
  function spinText(text, rnd = Math.random) {
    return String(text == null ? '' : text).replace(SPIN_RE, (m, inner) => {
      const opts = inner.split('|');
      return opts[Math.min(opts.length - 1, Math.floor((Number(rnd()) || 0) * opts.length))];
    });
  }
  const hasSpin = (text) => { SPIN_RE.lastIndex = 0; const r = SPIN_RE.test(String(text || '')); SPIN_RE.lastIndex = 0; return r; };
  // Variações: a mensagem do disparo é a 1ª; cada "+ Variação" troca o TEXTO (a 1ª parte de texto; sem texto,
  // entra um texto antes). variants = { mode: 'alternada'|'aleatoria'|'porcentagem', list: [{ text }], weights: [..] }
  const VARIANT_MODES = ['alternada', 'aleatoria', 'porcentagem'];
  const variantCount = (variants) => 1 + (variants && Array.isArray(variants.list) ? variants.list.length : 0);
  // n-ésimo envio (0, 1, 2…) → qual variação (0 = a mensagem; 1.. = as variações). Porcentagem: distribui
  // exatamente na proporção e intercalado (rodízio com peso).
  function pickVariant(index, variants, rnd = Math.random) {
    const k = variantCount(variants);
    if (k <= 1) return 0;
    const mode = VARIANT_MODES.includes(variants.mode) ? variants.mode : 'alternada';
    if (mode === 'aleatoria') return Math.min(k - 1, Math.floor((Number(rnd()) || 0) * k));
    if (mode === 'alternada') return ((index % k) + k) % k;
    const w = Array.from({ length: k }, (_, i) => Math.max(0, Number((variants.weights || [])[i]) || 0));
    const total = w.reduce((a, b) => a + b, 0);
    if (!total) return ((index % k) + k) % k;
    const credit = new Array(k).fill(0);
    let pick = 0;
    for (let s = 0; s <= index; s++) {
      for (let i = 0; i < k; i++) credit[i] += w[i];
      pick = 0;
      for (let i = 1; i < k; i++) if (credit[i] > credit[pick]) pick = i;
      credit[pick] -= total;
    }
    return pick;
  }
  function variantParts(parts, variants, v) {
    const list = (parts || []).map((p) => ({ ...p }));
    if (!v || !variants || !Array.isArray(variants.list) || !variants.list[v - 1]) return list;
    const text = String(variants.list[v - 1].text || '');
    const i = list.findIndex((p) => p.type === 'texto');
    if (i >= 0) list[i].body = text;
    else list.unshift({ type: 'texto', body: text, wait_seconds: 0, typing_seconds: 0 });
    return list;
  }
  const spinParts = (parts, rnd = Math.random) => (parts || []).map((p) => (p.body ? { ...p, body: spinText(p.body, rnd) } : { ...p }));
  // "Todas menos a que vou colocar" (ids) — "Não enviar" nunca sai
  function removeAllExcept(current, keep, isNoSend) {
    return (current || []).map(String).filter((id) => !(keep || []).map(String).includes(id) && !isNoSend(id));
  }

  // ── 2.13.1: excluir mensagem rápida ──
  // Onde ela está em uso (agendamentos pendentes, automações/réguas, réguas antigas, disparos) em frases para a tela.
  // usage = { schedules: [{ chatId, chatName, sendAt }], automations: [{ name, kind }], flows: [{ name }], campaigns: [{ name, status }] }
  function itemUsageLines(usage, { when = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } = {}) {
    const u = usage || {};
    const out = [];
    const sch = u.schedules || [];
    if (sch.length) {
      out.push({ kind: 'agendamento', head: `Esta mensagem está em ${sch.length} agendamento${sch.length === 1 ? '' : 's'} pendente${sch.length === 1 ? '' : 's'}:`,
        items: sch.map((s) => `${s.chatName || String(s.chatId || '').split('@')[0] || 'conversa'} · ${s.sendAt ? when(s.sendAt) : 'sem data'}`) });
    }
    const autos = u.automations || [];
    if (autos.length) out.push({ kind: 'automacao', head: `Está em ${autos.length} automaç${autos.length === 1 ? 'ão' : 'ões'}/régua${autos.length === 1 ? '' : 's'}:`, items: autos.map((a) => `${a.name}${a.active ? ' (ligada)' : ''}`) });
    const flows = u.flows || [];
    if (flows.length) out.push({ kind: 'regua', head: `Está em ${flows.length} régua${flows.length === 1 ? '' : 's'} de follow antiga${flows.length === 1 ? '' : 's'}:`, items: flows.map((f) => f.name) });
    const camps = u.campaigns || [];
    const ST = { rascunho: 'rascunho', agendada: 'agendado', rodando: 'rodando', pausada: 'pausado' };
    if (camps.length) out.push({ kind: 'disparo', head: `Está em ${camps.length} disparo${camps.length === 1 ? '' : 's'} não terminado${camps.length === 1 ? '' : 's'}:`, items: camps.map((c) => `${c.name} (${ST[c.status] || c.status})`) });
    return out;
  }
  const itemInUse = (usage) => itemUsageLines(usage).length > 0;
  // erro do banco ao excluir → frase clara (o texto técnico fica em "Detalhes")
  function friendlyDeleteError(message) {
    const m = String(message || '');
    if (/Mensagem em uso/.test(m)) return 'Esta mensagem ainda está em uso. Cancele ou troque onde ela aparece antes de excluir.';
    if (/23514|violates check constraint|Failing row contains/i.test(m)) return 'O banco recusou excluir: um agendamento antigo ainda aponta para esta mensagem. Aplique a migration 20261110120000 (regra nova de wa_schedules) ou fale com quem cuida do sistema.';
    if (/23503|foreign key/i.test(m)) return 'O banco recusou excluir: esta mensagem ainda é usada em outro lugar do sistema.';
    if (/Supabase (401|403)|JWT|permission denied|row-level security/i.test(m)) return 'Sem permissão para excluir. Entre de novo na extensão (ou peça acesso a quem cuida do sistema).';
    if (/Failed to fetch|NetworkError|network|Sem conexão|timeout|A biblioteca não respondeu/i.test(m)) return 'Sem conexão com o banco agora. Confira a internet e tente de novo.';
    return 'Não consegui excluir a mensagem. Tente de novo; se continuar, copie os detalhes para quem cuida do sistema.';
  }

  // ── 2.13.0: construtor visual (em cascata) ──
  // ⏳ ESPERAR = { id, type: 'pausa', amount, unit } (só o tempo). start.exclude = [{ source, label_id | wa_label_id }]:
  // quem tem uma dessas etiquetas sai (como o "Não enviar", que vale sempre).
  // Toda lista termina em FIM: põe { type: 'fim' } no fim de cada caminho que não termina (nem em espera de
  // resposta, que já abre os dois caminhos). Não muda o que o motor faz (fim da lista já é fim); só deixa o desenho claro.
  function seqNormalize(def) {
    const d = JSON.parse(JSON.stringify(def || {}));
    const fix = (list) => {
      (list || []).forEach((n) => { if (n && n.type === 'esperar') { n.yes = fix(n.yes || []); n.no = fix(n.no || []); } });
      const last = list[list.length - 1];
      if (!last || !['fim', 'ir', 'esperar'].includes(last.type)) list.push({ id: seqId(), type: 'fim' });
      return list;
    };
    d.steps = fix(Array.isArray(d.steps) ? d.steps : []);
    return d;
  }
  // Inserir uma caixa na posição i da lista. ❓ ESPERAR RESPOSTA no meio: o que vinha embaixo vai para o caminho
  // ❌ "Se não responder" (depois de uma espera de resposta a lista só continua pelos caminhos). FIM no meio corta
  // o que vinha embaixo. Devolve a caixa inserida.
  function seqInsert(list, i, node) {
    const at = Math.max(0, Math.min(list.length, i));
    const rest = list.splice(at);
    if (node.type === 'esperar') {
      const moved = rest.slice();
      if (moved.length && moved[moved.length - 1].type === 'fim') moved.pop(); // o caminho ganha o próprio FIM
      node.yes = node.yes || [];
      node.no = [...(node.no || []), ...moved];
      list.push(node);
    } else if (node.type === 'fim') list.push(node);
    else list.push(node, ...rest);
    return node;
  }
  // tira a caixa (espera de resposta: os dois caminhos saem junto)
  function seqRemove(def, id) {
    const e = seqIndex(def).get(id);
    if (!e) return false;
    e.list.splice(e.i, 1);
    return true;
  }
  // a conversa tem alguma etiqueta de "Nunca para quem tem"? (CRM: ids do contato; WhatsApp: ids da conversa)
  function seqExcluded(start, crmIds, waIds) {
    const ex = (start && Array.isArray(start.exclude)) ? start.exclude : [];
    const crm = new Set((crmIds || []).map(String));
    const wa = new Set((waIds || []).map(String));
    return ex.some((x) => (x.source === 'whatsapp' ? wa.has(String(x.wa_label_id)) : crm.has(String(x.label_id))));
  }
  // ── 2.18.1: SAIR AO TIRAR A ETIQUETA DO WHATSAPP DE INÍCIO ──
  // Só para sequências cuja caixa COMEÇA é uma etiqueta do WhatsApp (nativa), com a opção ligada (padrão; desligada =
  // start.exit_on_remove === false). Começo por etiqueta do CRM (ex.: Régua de follow-up): null, nada muda.
  function seqExitLabelOf(def) {
    const s = def && def.start;
    if (!s || s.type !== 'etiqueta' || s.source !== 'whatsapp' || !s.wa_label_id || s.exit_on_remove === false) return null;
    return String(s.wa_label_id);
  }
  // A própria automação já tirou a etiqueta de início neste percurso? (um passo "tirar" dela, ou "colocar … e tirar
  // todas as outras", ANTES do passo atual: na mesma lista e nas listas de cima). Essa retirada não conta.
  function seqSelfRemovedStart(def, node, labelId) {
    const L = String(labelId || '');
    if (!L || !node) return false;
    const idx = seqIndex(def);
    const removes = (n) => !!n && n.type === 'etiqueta' && n.source === 'whatsapp'
      && ((n.op === 'tirar' && String(n.wa_label_id) === L) || (n.op === 'colocar' && n.remove_others && String(n.wa_label_id) !== L));
    let e = idx.get(node);
    for (let guard = 0; e && guard < 20; guard++) {
      for (let i = 0; i < e.i; i++) if (removes(e.list[i])) return true;
      e = e.parent ? idx.get(e.parent.id) : null;
    }
    return false;
  }
  const opsRemoveLabel = (ops, labelId) => (ops || []).some((op) => op && op.source === 'whatsapp'
    && ((op.op === 'tirar' && String(op.wa_label_id) === String(labelId)) || (op.op === 'colocar' && op.remove_others && String(op.wa_label_id) !== String(labelId))));
  const digitsOf = (v) => String(v || '').replace(/\D/g, '');
  const samePhone = (a, b) => { const x = digitsOf(a); const y = digitsOf(b); return x.length >= 8 && y.length >= 8 && (x === y || x.slice(-11) === y.slice(-11)); };
  // A pessoa do percurso ainda tem a etiqueta? 'present' | 'absent' | 'unknown'. Troca de id (@c.us ↔ @lid) NÃO é
  // retirada: qualquer id da MESMA pessoa (o do percurso, o @lid mapeado ou o mesmo telefone) com a etiqueta = present.
  // absent só com a conversa do percurso carregada SEM a etiqueta e a lista da etiqueta lida por inteiro sem ninguém
  // dessa pessoa. Conversa sumiu da memória (a troca de id costuma fazer isso), lista falhou ou carregando: unknown.
  // holders = resposta de labelChatIds ({ count, chats: [{ id, phone?, lid? }] }) ou null.
  function waStartPresence({ labelId, runChatId, runPhone, chat, holders }) {
    const L = String(labelId);
    if (chat && chat.loaded && Array.isArray(chat.labels) && chat.labels.map(String).includes(L)) return 'present';
    if (!holders || !Array.isArray(holders.chats)) return 'unknown';
    const phone = runPhone || ((/^(\d{8,15})@c\.us$/.exec(runChatId || '') || [])[1]) || null;
    const mine = holders.chats.some((c) => c && (c.id === runChatId || c.lid === runChatId
      || (phone && (samePhone(c.phone, phone) || samePhone((/^(\d{8,15})@c\.us$/.exec(c.id || '') || [])[1], phone)))));
    if (mine) return 'present';
    if (!holders.chats.length && Number(holders.count) > 0) return 'unknown'; // WhatsApp ainda carregando a lista
    if (!chat || !chat.loaded || !Array.isArray(chat.labels)) return 'unknown';
    return 'absent';
  }
  const WA_LEFT_READS = 2; // leituras seguidas sem a etiqueta para sair
  const LEFT_LABEL_REASON = 'saiu da etiqueta';
  const unitText =(amount, unit) => {
    const n = Number(amount) || 0;
    if (unit === 'minutos') return `${n} minuto${n === 1 ? '' : 's'}`;
    if (unit === 'horas') return `${n} hora${n === 1 ? '' : 's'}`;
    return `${n} dia${n === 1 ? '' : 's'}`;
  };
  // Simular (não envia nem grava): linha do tempo de uma pessoa que NUNCA responde (scenario 'nunca') ou que
  // responde no 1º "esperar resposta" ('primeiro'). Tempo corrido a partir da entrada (minutos); com horário
  // comercial ligado, pode levar mais. → [{ at (min), kind, text, node }]
  // 2.13.2: com startAt (ms) e settings, conta os horários de verdade: espera até o dia/hora, horário comercial das
  // esperas, faixa "enviar só entre" da etapa e o horário da automação; cada passo ganha "when" (data e hora prevista)
  // 2.16.0: cada passo ganha "day" (dias inteiros desde a entrada: 0 = o dia em que entrou) e as esperas "desde a
  // entrada" contam do começo (se já passou, seguem na hora)
  // 2.18.5: from = { node, tm } continua de uma caixa (o percurso de uma conversa: o que falta), sem o "Entra"
  function seqSimulate(def, scenario = 'nunca', { itemTitle = (x) => x || '(sem mensagem)', labelName = (x) => x || '(sem etiqueta)', startAt = null, settings = null, from = null } = {}) {
    const idx = seqIndex(def);
    const out = [];
    const real = Number.isFinite(startAt);
    const cont = !!(real && from && Number.isFinite(from.tm));
    let tm = cont ? from.tm : real ? startAt : 0;
    let at = 0;
    let win = cont ? from.window || null : null;
    let replied = false;
    let id = cont ? from.node || null : seqFirstOf(def && def.steps);
    const lab = (n) => (n.source === 'whatsapp' ? labelName(n.wa_label_id, 'whatsapp') : labelName(n.label_id, 'crm'));
    const push = (ev) => out.push(real ? { ...ev, at: Math.round((tm - startAt) / MIN_MS), when: tm, day: Math.floor((tm - startAt) / DAY_MS) } : { ...ev, at, day: Math.floor(at / 1440) });
    const waitFor = (amount, unit, n) => {
      const need = Math.max(1, Number(amount) || 0) * (SEQ_UNIT_MIN[unit] || 60);
      if (seqFromEntry(n)) { if (!real) at = Math.max(at, need); else tm = Math.max(tm, startAt + need * MIN_MS); return; } // 2.16.0
      if (!real) { at += need; return; }
      tm += need * MIN_MS; // 2.14.2: tempo corrido
    };
    if (!cont) push({ kind: 'inicio', text: 'Entra na automação', node: 'start' });
    for (let g = 0; g < 200; g++) {
      if (!id) { push({ kind: 'fim', text: 'Fim: sai da automação', node: null }); break; }
      const e = idx.get(id);
      if (!e) { push({ kind: 'fim', text: 'Fim', node: null }); break; }
      const n = e.node;
      if (n.type === 'fim') { push({ kind: 'fim', text: 'Fim: sai da automação', node: n.id }); break; }
      if (n.type === 'ir') { id = n.to; continue; }
      if (n.type === 'enviar') {
        if (real) {
          const ok = nextSendTime(tm, def, win, settings);
          if (ok == null) { push({ kind: 'fim', text: 'Sem horário possível para enviar (confira os horários)', node: n.id }); break; }
          tm = ok;
        }
        push({ kind: 'enviar', text: `Recebe “${itemTitle(n.item_id)}”`, node: n.id });
        win = null;
      }
      if (n.type === 'etiqueta') push({ kind: 'etiqueta', text: `${n.op === 'tirar' ? 'Sai da' : 'Entra na'} etiqueta “${lab(n)}”${n.op !== 'tirar' && n.remove_others ? ' (e sai das outras)' : ''}`, node: n.id });
      if (n.type === 'pausa') {
        if (n.mode === 'ate') {
          if (real) { const u = pausaUntil(tm, n); tm = u == null ? tm : u; } else at += 1440;
          push({ kind: 'pausa', text: `Esperou ${untilText(n)}`, node: n.id });
        } else {
          waitFor(n.amount, n.unit, n);
          push({ kind: 'pausa', text: seqFromEntry(n) ? `Esperou até ${unitText(n.amount, n.unit)} depois de entrar` : `Esperou ${unitText(n.amount, n.unit)}`, node: n.id });
        }
        win = n.send_window || null;
      }
      if (n.type === 'esperar') {
        win = n.send_window || null;
        if (scenario === 'primeiro' && !replied) {
          replied = true;
          if (real) tm += 5 * MIN_MS; else at += 5;
          push({ kind: 'respondeu', text: '✅ Respondeu', node: n.id });
          id = seqFirstOf(n.yes);
          continue;
        }
        waitFor(n.amount, n.unit, n);
        push({ kind: 'nao', text: seqFromEntry(n) ? `❌ Não respondeu até ${unitText(n.amount, n.unit)} depois de entrar` : `❌ Não respondeu em ${unitText(n.amount, n.unit)}`, node: n.id });
        id = seqFirstOf(n.no);
        continue;
      }
      id = seqNextOf(idx, id);
    }
    return out;
  }
  // tempo da simulação: "agora", "+2 h", "+1 dia 3 h"
  function simAtText(min) {
    if (!min) return 'na hora';
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    return `+${[d ? `${d} dia${d === 1 ? '' : 's'}` : '', h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')}`;
  }
  // 2.16.0: "dia 3 desde a entrada" / "36 h desde a entrada" (frase da caixa com from: 'entrada')
  function sinceEntryText(n) {
    const m = seqNeedMin(n);
    if (m % 1440 === 0) return `dia ${m / 1440} desde a entrada`;
    if (m % 60 === 0) return `${m / 60} h desde a entrada`;
    return `${m} min desde a entrada`;
  }
  // 2.16.2: espera "desde a entrada" com tempo MENOR ou IGUAL ao que o caminho já garante (a espera anterior) segue na
  // hora — aviso amarelo (não impede salvar). Conta o mínimo garantido desde a entrada ao chegar em cada caixa:
  // ⏳ e ❌ (não respondeu) = o prazo da espera; ✅ (respondeu) = o que havia antes dela (pode ter respondido logo);
  // ⏳ "até o próximo dia às" e "Continuar em" não somam nada.
  const entryPoint = (min) => (min % 1440 === 0 ? `dia ${min / 1440}` : min % 60 === 0 ? `${min / 60} h` : `${min} min`);
  function seqEntryOrderWarnings(def) {
    const out = [];
    const walk = (list, cum, depth) => {
      if (depth > SEQ_MAX_DEPTH + 2) return;
      for (const n of list || []) {
        if (!n || !n.id) continue;
        const timed = n.type === 'esperar' || (n.type === 'pausa' && n.mode !== 'ate');
        if (!timed) continue;
        const need = seqNeedMin(n);
        let end = cum + need;
        if (seqFromEntry(n)) {
          if (cum > 0 && need <= cum) out.push({ node: n.id, at: need, prev: cum, msg: `⚠ Conta desde a entrada (${entryPoint(need)}), mas a espera anterior já vai até ${entryPoint(cum)} desde a entrada: esta seguiria na hora. Aumente o tempo (ex.: ${entryPoint(cum + (n.unit === 'dias' ? 1440 : n.unit === 'horas' ? 60 : 1))}).` });
          end = Math.max(cum, need);
        }
        if (n.type === 'esperar') { walk(n.yes, cum, depth + 1); walk(n.no, end, depth + 1); }
        else cum = end;
      }
    };
    walk(def && def.steps, 0, 1);
    return out;
  }
  // 2.16.0: as caixas ✉ ENVIAR na ordem do caminho de quem nunca responde ("Follow 1", "Follow 2"…), cada uma com
  // o tempo desde a entrada (minutos, sem horários), os ❌ tomados até ela, a espera logo antes (se houver) e a caixa
  // onde o percurso recomeça para mandar já (afterNode: logo depois da última espera/envio, para as etiquetas do meio valerem)
  function seqSendSteps(def) {
    const evs = seqSimulate(def, 'nunca');
    const out = [];
    const seen = new Set();
    let branches = [];
    let prevWait = null;
    let afterIdx = 1; // índice do evento logo depois da última espera/envio (o 0 é a entrada)
    evs.forEach((ev, i) => {
      if (ev.kind === 'nao') branches = [...branches, ev.node];
      if (ev.kind === 'enviar' && ev.node && !seen.has(ev.node)) {
        seen.add(ev.node);
        const after = evs[afterIdx] && evs[afterIdx].node && evs[afterIdx].node !== 'start' ? evs[afterIdx].node : ev.node;
        out.push({ node: ev.node, n: out.length + 1, at: ev.at, day: ev.day, branches: [...branches], prevWait, afterNode: after });
      }
      if (ev.kind === 'pausa' || ev.kind === 'nao') prevWait = ev.node;
      else if (ev.kind === 'enviar') prevWait = null;
      if (ev.kind === 'pausa' || ev.kind === 'nao' || ev.kind === 'enviar') afterIdx = i + 1;
    });
    return out;
  }
  // 2.16.0: entrar no meio da régua (manual), na caixa ✉ ENVIAR sendNode: a pessoa entra "como se tivesse entrado há
  // X tempo" (o tempo daquela etapa), então ela sai assim que estiver no horário de envio e as próximas seguem a
  // contagem normal. mode 'agora' = manda assim que o horário da automação deixar.
  // 2.16.6: mode 'marcado' ("Esperar o tempo da régua") = entra como se tivesse ACABADO de receber o follow anterior
  // (entrada recuada o tempo dele) e passa pelas esperas entre os dois a partir de agora: o follow sai no intervalo
  // da régua (e no horário/faixa); respondeu nesse meio → ✅ como sempre. No Follow 1: começa do começo, agora.
  // → { node, entered_at, wait_started_at, skip_wait, branches } (para o percurso) ou null se a caixa não existe
  function seqManualPlan(def, sendNode, { now, mode = 'agora' } = {}) {
    const first = seqFirstOf(def && def.steps);
    if (!sendNode) return { node: first, entered_at: now, wait_started_at: null, skip_wait: false, branches: [] };
    const steps = seqSendSteps(def);
    const i = steps.findIndex((s) => s.node === sendNode);
    if (i < 0) return null;
    const step = steps[i];
    const br = (ids) => ids.map((node) => ({ node, result: 'nao', at: now }));
    if (mode === 'marcado') {
      const prev = steps[i - 1];
      if (!prev) return { node: first, entered_at: now, wait_started_at: null, skip_wait: false, branches: [] };
      const idx = seqIndex(def);
      const node = seqNextOf(idx, prev.node);
      if (!node) return null;
      const nx = (idx.get(node) || {}).node || {};
      const isWait = nx.type === 'esperar' || nx.type === 'pausa';
      return { node, entered_at: now - prev.at * MIN_MS, wait_started_at: isWait ? now : null, skip_wait: false, branches: br(prev.branches) };
    }
    return { node: step.afterNode, entered_at: now - step.at * MIN_MS, wait_started_at: null, skip_wait: false, branches: br(step.branches) };
  }
  // 2.16.6: previsão de quando a caixa sendNode sai para um percurso novo (plan de seqManualPlan), se a pessoa não
  // responder: roda o próprio seqStep no tempo (esperas, "desde a entrada", faixas e horário da automação).
  // → ms ou null (não chega lá / sem horário possível)
  function seqManualForecast(def, plan, sendNode, { now, settings = null } = {}) {
    if (!plan || !plan.node) return null;
    const run = { node: plan.node, entered_at: plan.entered_at, wait_started_at: plan.wait_started_at, last_sent_at: null, skip_wait: !!plan.skip_wait, branches: [...(plan.branches || [])] };
    const chat = { loaded: true, last: null };
    let t = now;
    for (let g = 0; g < 200; g++) {
      const r = seqStep({ def, run, chat, replies: [], now: t, settings });
      run.branches = [...run.branches, ...(r.branches || [])];
      run.skip_wait = false;
      if (r.status === 'end') return null;
      if (r.status === 'progress') { run.node = r.node; run.wait_started_at = r.waitStart; continue; }
      if (r.status === 'wait') { if (r.dueAt == null) return null; t = Math.max(t + 1, r.dueAt); continue; }
      const ok = nextSendTime(t, def, r.window, settings);
      if (ok == null) return null;
      if (r.sendNode === sendNode) return ok;
      t = ok;
      const nx = r.node ? (seqIndex(def).get(r.node) || {}).node : null;
      Object.assign(run, { node: r.node, last_sent_at: t, wait_started_at: nx && (nx.type === 'esperar' || nx.type === 'pausa') ? t : null });
      if (!r.node) return null;
    }
    return null;
  }
  // minutos → { amount, unit } (o maior que dá certo)
  const seqAmountOf = (min) => {
    const n = Math.max(1, Math.round(Number(min) || 0));
    if (n % 1440 === 0) return { amount: n / 1440, unit: 'dias' };
    if (n % 60 === 0) return { amount: n / 60, unit: 'horas' };
    return { amount: n, unit: 'minutos' };
  };
  // Automação antiga (editor "Quando → Se → Então") → desenho. { def } ou { reason } (fica no editor antigo).
  //   entrou na etiqueta + X tempo → COMEÇA etiqueta → ⏳ X → ações → FIM
  //   venda registrada (+ X dias)   → COMEÇA venda → (⏳ X) → ações → FIM
  //   não respondeu X tempo          → COMEÇA etiqueta → ❓ X depois da SUA mensagem: ✅ FIM / ❌ ações → FIM
  // Não dá: "O cliente respondeu", dia e hora fixos, condições ("Só se…") e variantes da mensagem.
  function seqFromAutomation(a) {
    if (!a) return { reason: 'automação vazia' };
    if (a.kind === 'sequencia') return a.sequence ? { def: JSON.parse(JSON.stringify(a.sequence)) } : { reason: 'sequência sem passos' };
    if (!['entrou_etiqueta', 'venda_registrada', 'sem_resposta'].includes(a.trigger_type)) return { reason: a.trigger_type === 'respondeu' ? 'o gatilho "O cliente respondeu" não existe no desenho' : 'o gatilho "dia e hora fixos" não existe no desenho' };
    if ((a.conditions || []).length) return { reason: 'tem condições ("Só se…")' };
    const wa = a.trigger_label_source === 'whatsapp';
    const start = a.trigger_type === 'venda_registrada'
      ? { type: 'venda', ...(a.trigger_label_id ? { source: 'crm', label_id: a.trigger_label_id } : {}) }
      : wa ? { type: 'etiqueta', source: 'whatsapp', wa_label_id: String(a.trigger_wa_label_id || '') } : { type: 'etiqueta', source: 'crm', label_id: a.trigger_label_id || '' };
    const acts = [];
    for (const x of a.actions || []) {
      if (x.type === 'parar') break;
      if (x.type === 'enviar') {
        if ((x.variants || []).length) return { reason: 'a mensagem tem variantes (por etiqueta ou anúncio)' };
        acts.push({ id: seqId(), type: 'enviar', item_id: x.item_id || '' });
      } else if (x.type === 'adicionar_etiqueta') acts.push({ id: seqId(), type: 'etiqueta', op: 'colocar', source: 'crm', label_id: x.label_id });
      else if (x.type === 'remover_etiqueta') acts.push({ id: seqId(), type: 'etiqueta', op: 'tirar', source: 'crm', label_id: x.label_id || a.trigger_label_id });
      else if (x.type === 'adicionar_etiqueta_wa') acts.push({ id: seqId(), type: 'etiqueta', op: 'colocar', source: 'whatsapp', wa_label_id: String(x.wa_label_id) });
      else if (x.type === 'remover_etiqueta_wa') acts.push({ id: seqId(), type: 'etiqueta', op: 'tirar', source: 'whatsapp', wa_label_id: String(x.wa_label_id) });
      else if (x.type === 'mover') {
        if (wa) acts.push({ id: seqId(), type: 'etiqueta', op: 'tirar', source: 'whatsapp', wa_label_id: String(a.trigger_wa_label_id) });
        else if (a.trigger_label_id) acts.push({ id: seqId(), type: 'etiqueta', op: 'tirar', source: 'crm', label_id: a.trigger_label_id });
        acts.push({ id: seqId(), type: 'etiqueta', op: 'colocar', source: 'crm', label_id: x.label_id });
      } else return { reason: `a ação "${x.type}" não existe no desenho` };
    }
    let steps;
    if (a.trigger_type === 'sem_resposta') {
      steps = [{ id: seqId(), type: 'esperar', ...seqAmountOf(a.wait_minutes || 60), after_mine: true, yes: [{ id: seqId(), type: 'fim' }], no: [...acts, { id: seqId(), type: 'fim' }] }];
    } else {
      steps = [...(Number(a.wait_minutes) > 0 ? [{ id: seqId(), type: 'pausa', ...seqAmountOf(a.wait_minutes) }] : []), ...acts, { id: seqId(), type: 'fim' }];
    }
    return { def: { start, business: false, steps } };
  }
  // Texto do passo atual de uma conversa ("esperando resposta (faltam 1h20)")
  function seqDescribe(def, run, now, { itemTitle = (id) => id } = {}) {
    if (!run) return '';
    if (run.status && run.status !== 'ativo') return run.outcome === 'respondeu' ? 'saiu: respondeu' : run.outcome === 'nao_respondeu' ? 'saiu: não respondeu' : run.outcome === 'saiu_etiqueta' ? 'saiu: saiu da etiqueta' : 'saiu';
    const idx = seqIndex(def);
    const e = idx.get(run.node || seqFirstOf(def.steps));
    if (!e) return 'terminando';
    const n = e.node;
    if (n.type === 'esperar') {
      const due = Number(run.due_at) || null;
      if (n.after_mine && !due) return 'esperando a sua mensagem';
      return due ? `esperando resposta (faltam ${formatLeft(Math.max(0, due - now))})` : 'esperando resposta';
    }
    if (n.type === 'pausa') { const due = Number(run.due_at) || null; return due ? `esperando (faltam ${formatLeft(Math.max(0, due - now))})` : n.mode === 'ate' ? `esperando ${untilText(n)}` : `esperando ${unitText(n.amount, n.unit)}`; } // 2.13.0
    if (n.type === 'enviar') return `vai mandar “${itemTitle(n.item_id)}”`;
    if (n.type === 'etiqueta') return seqStepText(def, run, now, { itemTitle }).replace(/^./, (c) => c.toLowerCase()); // 2.18.5: a etapa real, não "vai mexer nas etiquetas"
    return 'continuando';
  }
  // ── 2.18.5: a conversa aberta na automação, em português simples ──
  // a etapa em que a pessoa está de verdade: pula as caixas instantâneas (etiqueta, "ir para") até a próxima que
  // espera, manda ou termina. "Esperando resposta — até 3 dias depois de entrar (faltam 1 dia 2 h)"
  function seqStepText(def, run, now, { itemTitle = (id) => id } = {}) {
    if (!run) return '';
    const idx = seqIndex(def);
    let id = run.node || seqFirstOf(def && def.steps);
    let first = true;
    for (let g = 0; g < 50; g++) {
      const e = id ? idx.get(id) : null;
      if (!e) return 'Terminando a automação';
      const n = e.node;
      const due = first ? Number(run.due_at) || null : null;
      const left = due ? ` (faltam ${formatLeft(Math.max(0, due - now))})` : '';
      if (n.type === 'esperar') {
        if (first && run.skip_wait === true) return 'Espera pulada: o próximo envio está na fila';
        if (n.after_mine && !due) return 'Esperando a sua mensagem';
        return `Esperando resposta — ${seqFromEntry(n) ? `até ${unitText(n.amount, n.unit)} depois de entrar` : `por ${unitText(n.amount, n.unit)}`}${left}`;
      }
      if (n.type === 'pausa') return `Esperando — ${n.mode === 'ate' ? untilText(n) : seqFromEntry(n) ? `até ${unitText(n.amount, n.unit)} depois de entrar` : unitText(n.amount, n.unit)}${left}`;
      if (n.type === 'enviar') return `Vai mandar “${itemTitle(n.item_id)}”`;
      if (n.type === 'fim') return 'Terminando a automação';
      id = n.type === 'ir' ? n.to : seqNextOf(idx, id);
      first = false;
    }
    return 'Continuando';
  }
  // o que falta para um percurso ATIVO (a pessoa nunca responde, como no ERP): eventos com "when"
  function seqForecast(def, run, now, opts = {}) {
    if (!run || (run.status && run.status !== 'ativo')) return [];
    const idx = seqIndex(def);
    const entered = Date.parse(run.created_at || '') || now;
    const id = run.node || seqFirstOf(def && def.steps);
    const e = id ? idx.get(id) : null;
    if (!e) return [{ kind: 'fim', text: 'Fim: sai da automação', when: now, node: null }];
    const n = e.node;
    const due = Number(run.due_at) || null;
    const pre = [];
    let node = id;
    let tm = now;
    if (n.type === 'esperar' || n.type === 'pausa') {
      if (n.type === 'esperar' && n.after_mine && !due && run.skip_wait !== true) return [];
      const end = run.skip_wait === true ? now : due ? Math.max(now, due) : n.type === 'pausa' && n.mode === 'ate' ? now : now + Math.max(1, Number(n.amount) || 0) * (SEQ_UNIT_MIN[n.unit] || 60) * MIN_MS;
      tm = end;
      if (n.type === 'esperar') {
        pre.push({ kind: 'nao', text: seqFromEntry(n) ? `❌ Não respondeu até ${unitText(n.amount, n.unit)} depois de entrar` : `❌ Não respondeu em ${unitText(n.amount, n.unit)}`, when: tm, node: n.id });
        node = seqFirstOf(n.no);
      } else {
        pre.push({ kind: 'pausa', text: n.mode === 'ate' ? `Esperou ${untilText(n)}` : `Esperou ${unitText(n.amount, n.unit)}`, when: tm, node: n.id });
        node = seqNextOf(idx, id);
      }
    }
    const rest = seqSimulate(def, 'nunca', { ...opts, startAt: entered, from: { node, tm, window: n.send_window || null } });
    return [...pre, ...rest];
  }
  const SEQ_OUTCOME_TEXT = {
    respondeu: 'respondeu', nao_respondeu: 'chegou ao fim sem responder', fim: 'chegou ao fim', manual: 'tirado manualmente',
    nao_enviar: 'etiqueta Não enviar', etiqueta_excluida: 'etiqueta excluída', id_duplicado: 'id duplicado (troca de id do WhatsApp)',
    outra_regua: 'entrou em outra régua', reentrou: 'entrou de novo', sem_mensagem: 'mensagem não existe mais', saiu_etiqueta: 'saiu da etiqueta',
  };
  const seqOutcomeText = (o) => (o ? SEQ_OUTCOME_TEXT[o] || String(o) : 'saiu');
  // o cartão da conversa: etapa, o que já recebeu, o próximo passo (ou por que está parado) e a linha do tempo
  // (feitos ✓ + previstos). sends = wa_send_log desta automação para a pessoa (os do percurso: depois da entrada).
  // hold = motivo de estar parado vindo do painel (automação desligada, envios pausados) ou null.
  function seqChatCard(def, run, sends, now, { itemTitle = (id) => id, labelName, settings = null, hold = null } = {}) {
    const t0 = Date.parse(run.created_at || '') || 0;
    const mine = (Array.isArray(sends) ? sends : []).filter((s) => (Date.parse(s.created_at || '') || 0) >= t0 - 60000).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const received = mine.filter((s) => s.status === 'enviado').map((s) => ({ title: itemTitle(s.item_id), at: Date.parse(s.created_at) }));
    const done = [{ done: true, kind: 'inicio', text: 'Entrou na automação', when: t0 || null }];
    const idx = seqIndex(def);
    (run.branches || []).forEach((b) => {
      const n = idx.get(b.node) && idx.get(b.node).node;
      done.push(b.result === 'sim' ? { done: true, kind: 'respondeu', text: '✅ Respondeu', when: Number(b.at) || null }
        : { done: true, kind: 'nao', text: n && seqFromEntry(n) ? `❌ Não respondeu até ${unitText(n.amount, n.unit)} depois de entrar` : n ? `❌ Não respondeu em ${unitText(n.amount, n.unit)}` : '❌ Não respondeu', when: Number(b.at) || null });
    });
    mine.forEach((s) => {
      const t = Date.parse(s.created_at) || null;
      if (s.status === 'enviado') done.push({ done: true, kind: 'enviar', text: `Recebeu “${itemTitle(s.item_id)}”`, when: t });
      else if (s.status === 'pulado') done.push({ done: true, kind: 'pulado', text: `Não recebeu “${itemTitle(s.item_id)}” (pulado${s.reason ? `: ${s.reason}` : ''})`, when: t });
      else if (s.status === 'falhou') done.push({ done: true, kind: 'erro', text: `Erro ao enviar “${itemTitle(s.item_id)}”`, when: t });
    });
    const active = !run.status || run.status === 'ativo';
    if (!active) done.push({ done: true, kind: 'fim', text: `Saiu: ${seqOutcomeText(run.outcome)}`, when: Date.parse(run.ended_at || run.updated_at || '') || null });
    done.sort((a, b) => (a.when || 0) - (b.when || 0));
    const fut = active ? seqForecast(def, run, now, { itemTitle, labelName, settings }).map((ev) => ({ done: false, kind: ev.kind, text: ev.kind === 'fim' ? 'Termina a automação' : ev.text, when: ev.when == null ? null : ev.when, late: ev.when != null && ev.when < now - 5 * MIN_MS })) : [];
    const nx = fut.find((x) => x.kind === 'enviar') || fut.find((x) => x.kind === 'fim') || null;
    let next = null;
    if (active) {
      if (hold) next = { text: nx ? nx.text.replace(/^Recebe /, '') : 'próximo passo', when: null, held: hold };
      else if (nx) {
        const shifted = nx.kind === 'enviar' && run.due_at && nx.when != null && nx.when > (Number(run.due_at) || 0) + 5 * MIN_MS && fut.indexOf(nx) <= 1;
        const overdue = !!run.due_at && Number(run.due_at) < now - 5 * MIN_MS && run.skip_wait !== true; // o prazo já passou e o motor ainda não andou
        next = { text: nx.kind === 'fim' ? 'Termina a automação' : nx.text.replace(/^Recebe /, ''), when: nx.when, late: overdue || !!nx.late, held: overdue || nx.late ? 'atrasado: sai assim que o motor puder (WhatsApp aberto, dentro dos limites de envio)' : shifted ? 'fora do horário de envio: espera o próximo horário' : null };
      } else if (seqIndex(def).get(run.node || '') && seqIndex(def).get(run.node).node.after_mine) next = { text: 'espera a sua mensagem', when: null, held: null };
    }
    return { step: active ? seqStepText(def, run, now, { itemTitle }) : `Saiu: ${seqOutcomeText(run.outcome)}`, received, next, timeline: [...done, ...fut] };
  }
  // Nome curto de cada passo (lista de automações: "quantos estão em cada passo")
  function seqNodeLabel(def, id, { itemTitle = (x) => x } = {}) {
    const e = seqIndex(def).get(id);
    if (!e) return 'passo removido';
    const n = e.node;
    if (n.type === 'esperar') return `Esperando resposta (${seqFromEntry(n) ? 'até ' : ''}${n.amount} ${n.unit === 'minutos' ? 'min' : n.unit === 'horas' ? 'h' : n.amount === 1 ? 'dia' : 'dias'}${seqFromEntry(n) ? ' depois de entrar' : ''})`;
    if (n.type === 'pausa') return n.mode === 'ate' ? `Esperando ${untilText(n)}` : seqFromEntry(n) ? `Esperando até ${unitText(n.amount, n.unit)} depois de entrar` : `Esperando ${unitText(n.amount, n.unit)}`; // 2.13.0 (2.16.0: desde a entrada)
    if (n.type === 'enviar') return `Antes de mandar “${itemTitle(n.item_id)}”`;
    return n.type;
  }
  let seqCounter = 0;
  const seqId = () => `n${Date.now().toString(36)}${(seqCounter++).toString(36)}`;
  // Modelos prontos: em branco e "Follow-up de lead novo" (etiquetas como "new:Nome")
  function seqTemplate(kind) {
    const fim = () => ({ id: seqId(), type: 'fim' });
    const tag = (name) => ({ id: seqId(), type: 'etiqueta', op: 'colocar', source: 'crm', label_id: `new:${name}` });
    const send = (hint) => ({ id: seqId(), type: 'enviar', item_id: '', hint });
    // 2.13.0: modelos do construtor visual (já desenhados; só trocar as mensagens)
    // 2.16.2: as esperas dos modelos contam desde a ENTRADA (from: 'entrada'), nos mesmos momentos de antes
    if (kind === 'followup3') {
      const ok = () => [tag('Em atendimento'), fim()];
      return {
        start: { type: 'etiqueta', source: 'crm', label_id: 'new:Follow Up 1' }, business: false,
        steps: [send('Follow 1'), { id: seqId(), type: 'esperar', amount: 1, unit: 'dias', from: 'entrada', yes: ok(), no: [
          send('Follow 2'), { id: seqId(), type: 'esperar', amount: 3, unit: 'dias', from: 'entrada', yes: ok(), no: [
            send('Follow 3'), { id: seqId(), type: 'esperar', amount: 6, unit: 'dias', from: 'entrada', yes: ok(), no: [tag('Frio'), fim()] },
          ] },
        ] }],
      };
    }
    if (kind === 'posvenda') {
      return { start: { type: 'venda' }, business: false, steps: [{ id: seqId(), type: 'pausa', amount: 7, unit: 'dias', from: 'entrada' }, send('pedido de avaliação'), fim()] };
    }
    if (kind === 'lead_sumiu') {
      return {
        start: { type: 'lead', origin: 'todos' }, business: false,
        steps: [{ id: seqId(), type: 'esperar', amount: 1, unit: 'dias', after_mine: true, yes: [fim()], no: [
          send('ainda tem interesse?'), { id: seqId(), type: 'esperar', amount: 3, unit: 'dias', from: 'entrada', yes: [tag('Em atendimento'), fim()], no: [tag('Frio'), fim()] },
        ] }],
      };
    }
    if (kind === 'vazio') return { start: { type: 'etiqueta', source: 'crm', label_id: '' }, business: false, steps: [fim()] };
    if (kind === 'lead_followup') {
      const tag = () => ({ id: seqId(), type: 'etiqueta', op: 'colocar', source: 'crm', label_id: 'new:Em atendimento' });
      return {
        start: { type: 'lead', origin: 'todos' }, business: false,
        steps: [{ id: seqId(), type: 'esperar', amount: 2, unit: 'horas', after_mine: true, yes: [tag()], no: [
          { id: seqId(), type: 'enviar', item_id: '', hint: 'Follow 1' },
          { id: seqId(), type: 'esperar', amount: 1, unit: 'dias', from: 'entrada', yes: [tag()], no: [
            { id: seqId(), type: 'enviar', item_id: '', hint: 'Follow 2' },
            { id: seqId(), type: 'esperar', amount: 3, unit: 'dias', from: 'entrada', yes: [tag()], no: [
              { id: seqId(), type: 'enviar', item_id: '', hint: 'Follow 3' },
            ] },
          ] },
        ] }],
      };
    }
    return { start: { type: 'lead', origin: 'todos' }, business: false, steps: [{ id: seqId(), type: 'enviar', item_id: '' }, { id: seqId(), type: 'esperar', amount: 1, unit: 'dias', from: 'entrada', yes: [], no: [] }] };
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
    const openDays = s.week.filter((w) => w.length).length || 1;
    return Math.max(60, Math.round(s.week.flat().reduce((x, [a, b]) => x + (b - a), 0) / openDays));
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
    const wait = wizardMinutes(w.amount, w.unit, { useful: false, settings }); // 2.14.2: tempo corrido
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
    const when = wizardWhen({ ...w, useful: false }); // 2.14.2: tempo corrido
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
    const openDays = s.week.filter((w) => w.length).length || 1;
    const dayHours = Math.max(0, s.week.flat().reduce((x, [a, b]) => x + (b - a), 0) / openDays / 60);
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
      st.campaignsV214 = s.campaignsV214 === true; // 2.14.0: público do WhatsApp, velocidade e variações
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
      st.active = { schedules: !!a.schedules, campaigns: !!a.campaigns, campaignsCustom: !!a.campaignsCustom, automations: list.length > 0, flows: !!a.flows };
      return st.active;
    }
    const anyActive = () => !!(st.active && (st.active.schedules || st.active.campaigns || st.active.automations || st.active.flows));

    // 2.5.0: registra a "primeira vez que viu" cada conversa nas etiquetas nativas usadas por automações
    // ativas. Eventos: fila local da ponte (sem banco se nada mudou). Varredura: a cada 10 min (ou quando
    // muda a lista de etiquetas), lendo só o que o WhatsApp Web já tem na memória (sem ler mensagens).
    // 2.12.5: + etiquetas do WhatsApp que iniciam sequências
    const nativeTriggerIds = () => [...new Set([
      ...st.activeAutomations.filter((a) => isWaTrigger(a) && a.trigger_type !== 'venda_registrada' && a.trigger_wa_label_id).map((a) => String(a.trigger_wa_label_id)),
      ...st.activeAutomations.filter((a) => a.kind === 'sequencia').map(waTriggerLabelOf).filter(Boolean),
    ])].sort();
    async function trackNativeLabels() {
      if (!deps.wa || typeof deps.wa.labelEvents !== 'function') return;
      let got = null;
      try { got = await deps.wa.labelEvents(); } catch { got = null; } // esvazia a fila da ponte sempre (só memória)
      const ids = st.automationsV25 ? nativeTriggerIds() : [];
      if (!ids.length) return;
      const events = [];
      ((got && Array.isArray(got.events)) ? got.events : []).forEach((e) => {
        // 2.12.5: confirmed = a ponte viu a conversa SEM a etiqueta antes (ou a extensão pôs a etiqueta)
        const seenWithout = (Array.isArray(e.seenWithout) ? e.seenWithout : []).map(String);
        (e.labelIds || []).forEach((l) => { if (ids.includes(String(l))) events.push({ chatId: e.chatId, name: e.name || null, phone: e.phone || null, labelId: String(l), type: e.type, at: e.t, confirmed: e.type === 'add' && seenWithout.includes(String(l)) }); });
      });
      if (events.length) {
        let res = null;
        try { res = await api('nativeLabelEvents', { events: events.slice(-200) }); } catch { /* a varredura corrige */ }
        // 2.16.5: proteção (mais de 20 entradas "confirmadas" de uma vez na mesma etiqueta): ficaram como "já estava";
        // aviso no log de cada automação que começa por essa etiqueta (não manda nada)
        for (const g of (res && Array.isArray(res.guarded) ? res.guarded : [])) {
          const autos = st.activeAutomations.filter((a) => waTriggerLabelOf(a) === String(g.labelId));
          for (const a of autos) {
            await logSkip({ source: 'follow', source_id: a.id, contact_id: null, chat_id: null, item_id: null },
              `proteção: ${g.count} entradas de uma vez = "já estava"`);
          }
        }
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
      // 2.16.0: entered_at = created_at do percurso (gravado com a hora de entrada: 1ª mensagem do lead, entrada na etiqueta…)
      return { node: r.node, wait_started_at: msOf(r.wait_started_at), last_sent_at: msOf(r.last_sent_at), skip_wait: !!r.skip_wait, branches: r.branches || [], due_at: msOf(r.due_at), entered_at: msOf(r.entered_at || r.created_at) };
    }
    async function seqEnter(seqs) {
      const items = [];
      // 2.16.0: enteredAt = quando a pessoa ENTROU (conta o "até X depois de entrar")
      // 2.16.7: + o telefone (o servidor não cria outro percurso para a mesma pessoa em outra conversa)
      const add = (a, chatId, key, contactId, enteredAt, phone = null) => {
        if (!chatId || (a.test_chat_id && chatId !== a.test_chat_id)) return;
        const k = `${a.id}|${chatId}|${key}`;
        if (seqKnown.has(k)) return;
        items.push({ automation_id: a.id, chat_id: chatId, entry_key: key, contact_id: contactId || null, node: seqIndexFirst(a.sequence), entered_at: Number.isFinite(enteredAt) ? enteredAt : null, ...(typeof phone === 'string' && phone ? { phone } : {}) });
        seqKnown.add(k);
      };
      const since = (a) => msOf(a.activated_at); // só daqui pra frente (sem ativação: ninguém entra)
      const leadSeqs = seqs.filter((a) => a.sequence.start.type === 'lead' && since(a));
      if (leadSeqs.length) {
        let leads = [];
        try { leads = await api('seqLeads', { since: new Date(Math.min(...leadSeqs.map(since))).toISOString() }); } catch { leads = []; }
        leadSeqs.forEach((a) => (leads || []).forEach((l) => { if (msOf(l.first_message_at) >= since(a) && seqStartMatches(a.sequence.start, l)) add(a, l.chat_id, 'lead', null, msOf(l.first_message_at), l.phone || null); }));
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
            add(a, chatIdOfContact(c), `lbl:${entry.key}`.slice(0, 120), c.id, entry.at, c.phone || null);
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
          add(a, chatIdOfContact(c), `venda@${c.sale_id}`, c.id, msOf(c.sale_at), c.phone || null);
        }));
      }
      const manualSeqs = seqs.filter((a) => a.sequence.start.type === 'manual');
      if (manualSeqs.length && st.automationsV25) {
        let enr = [];
        try { enr = await api('activeEnrollments', { automationIds: manualSeqs.map((a) => a.id) }) || []; } catch { enr = []; }
        const byId = new Map(manualSeqs.map((a) => [a.id, a]));
        enr.forEach((e) => { const a = byId.get(e.automation_id); if (a && e.chat_id) add(a, e.chat_id, `insc@${msOf(e.enrolled_at) || 0}`, e.contact_id, msOf(e.enrolled_at)); });
      }
      for (let i = 0; i < items.length; i += 500) {
        try { await api('seqCreateRuns', { items: items.slice(i, i + 500) }); } catch { items.slice(i, i + 500).forEach((it) => seqKnown.delete(`${it.automation_id}|${it.chat_id}|${it.entry_key}`)); }
      }
    }
    const seqIndexFirst = (def) => (def && def.steps && def.steps[0] ? def.steps[0].id : null);
    // 2.13.0: ids das etiquetas do WhatsApp chamadas "Não enviar" (relidas a cada 5 min; sem a ponte: nenhuma)
    const waNoSend = new Set();
    let waNoSendAt = 0;
    // 2.18.1: leituras seguidas sem a etiqueta de início (id do percurso → quantas) e percursos em que a própria
    // automação tirou essa etiqueta (só memória; o caminho já percorrido cobre depois de recarregar)
    const waLeftReads = new Map();
    const seqSelfRemoved = new Set();
    async function loadWaNoSend() {
      if (!deps.wa || typeof deps.wa.labels !== 'function' || now() - waNoSendAt < 5 * MIN_MS) return;
      waNoSendAt = now();
      try {
        const list = await deps.wa.labels();
        waNoSend.clear();
        (Array.isArray(list) ? list : []).filter((l) => isNoSendLabel(l)).forEach((l) => waNoSend.add(String(l.id)));
      } catch { /* fica com a lista de antes */ }
    }
    async function seqPatch(run, patch) {
      let r = null;
      try { r = await api('seqUpdateRun', { id: run.id, version: run.version, patch }); } catch { r = null; }
      return r && r.ok ? r.run : null;
    }
    // etiquetas da sequência (CRM pelo banco, cria o contato se preciso; WhatsApp pela ponte)
    // 2.16.7: CRM pelo contato do PERCURSO (contact_id) primeiro; sem ele, o servidor procura pelo chat_id e pelo
    // telefone (do @lid: o do cache do WhatsApp). Não achou ninguém → "pulado" no log da automação (não some calado).
    const LABEL_MISS = 'etiqueta não aplicada: contato não encontrado';
    async function seqRunPhone(run) {
      if (run.contact && run.contact.phone) return run.contact.phone;
      const m = /^(\d{8,15})@c\.us$/.exec(run.chat_id || '');
      if (m) return m[1];
      if (!/@lid$/.test(run.chat_id || '') || !deps.wa || typeof deps.wa.chatPhone !== 'function') return null;
      try { const r = await deps.wa.chatPhone({ chatId: run.chat_id }); return (r && r.phone) || null; } catch { return null; }
    }
    async function seqLabelOps(run, ops, automation = null) {
      // 2.18.1: a automação vai tirar a própria etiqueta de início: essa retirada não tira a pessoa do percurso
      const exitLabel = automation && automation.kind === 'sequencia' ? seqExitLabelOf(automation.sequence) : null;
      if (exitLabel && opsRemoveLabel(ops, exitLabel)) { seqSelfRemoved.add(run.id); waLeftReads.delete(run.id); }
      let who = null; // { contactId, name, phone }: uma vez por chamada
      let missLogged = false;
      const crmCall = async (payload) => {
        if (!who) who = { contactId: run.contact_id || (run.contact && run.contact.id) || null, name: (run.contact && run.contact.name) || null, phone: await seqRunPhone(run) };
        const r = await api('saleContactLabels', { chatId: run.chat_id, name: who.name, phone: who.phone, contactId: who.contactId, ...payload });
        if (r && r.contactId) { who.contactId = r.contactId; return r; }
        if (!missLogged) {
          missLogged = true;
          await logSkip({ source: 'follow', source_id: automation ? automation.id : run.automation_id || null, contact_id: null, chat_id: run.chat_id, item_id: null }, LABEL_MISS);
        }
        return null;
      };
      for (const op of ops || []) {
        try {
          if (op.source === 'whatsapp') {
            if (op.op === 'tirar') { await setWaLabel(run.chat_id, { remove: op.wa_label_id }); continue; }
            await setWaLabel(run.chat_id, { add: op.wa_label_id });
            if (op.remove_others && deps.wa.chatLabels) {
              const cur = await deps.wa.chatLabels({ chatId: run.chat_id });
              await loadWaNoSend();
              // 2.13.0: "Não enviar" nunca sai
              const ids = ((cur && cur.labelIds) || []).map(String).filter((id) => id !== String(op.wa_label_id) && !waNoSend.has(id));
              for (const id of ids) await setWaLabel(run.chat_id, { remove: id });
            }
            continue;
          }
          if (op.op === 'tirar') { await crmCall({ removeLabelIds: [op.label_id] }); continue; }
          const r = await crmCall({ addLabelId: op.label_id, removeLabelIds: [] });
          if (op.remove_others && r && Array.isArray(r.labelIds)) {
            const others = r.labelIds.filter((l) => l !== op.label_id && l !== st.noSendLabelId);
            if (others.length) await crmCall({ removeLabelIds: others });
          }
        } catch { /* segue: etiqueta não impede o resto */ }
      }
      if ((ops || []).length && deps.onLabelsChanged) deps.onLabelsChanged();
    }
    // 2.13.2: envios de hoje de uma automação (limite próprio por dia), lido uma vez por ciclo
    let sentToday = { at: 0, map: new Map() };
    async function sentTodayBy(automationId) {
      if (now() - sentToday.at > FOLLOW_EVAL_MS / 2) sentToday = { at: now(), map: new Map() };
      if (!sentToday.map.has(automationId)) {
        let n = 0;
        try { const r = await api('automationSentToday', { automationId, since: new Date(midnightOf(now())).toISOString() }); n = Number(r && r.count) || 0; } catch { n = Infinity; } // sem saber: não envia
        sentToday.map.set(automationId, n);
      }
      return sentToday.map.get(automationId);
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
      await loadWaNoSend();
      const starts = runs.map((r) => msOf(r.wait_started_at) || msOf(r.last_sent_at)).filter(Boolean);
      let replies = {};
      if (starts.length) { try { replies = await api('seqReplies', { chatIds, since: new Date(Math.min(...starts) - 60 * 1000).toISOString() }) || {}; } catch { replies = {}; } }
      const t = now();
      // 2.18.1: quem está em cada etiqueta de início (uma leitura por etiqueta por ciclo; falhou = null = "não sei")
      const holders = new Map();
      const holdersOf = async (labelId) => {
        if (!holders.has(labelId)) {
          let h = null;
          if (deps.wa && typeof deps.wa.labelChatIds === 'function') { try { h = await deps.wa.labelChatIds({ labelId }); } catch { h = null; } }
          holders.set(labelId, h && Array.isArray(h.chats) ? h : null);
        }
        return holders.get(labelId);
      };
      for (const r of runs) {
        const a = byId.get(r.automation_id);
        if (!a) continue;
        if (a.test_chat_id && r.chat_id !== a.test_chat_id) continue; // modo teste: só a conversa escolhida
        // nunca para quem tem "Não enviar": sai da sequência
        if (st.noSendLabelId && r.contact && (r.contact.labelIds || []).includes(st.noSendLabelId)) { await seqPatch(r, { status: 'saiu', outcome: 'nao_enviar' }); continue; }
        // 2.13.0: "Não enviar" do WhatsApp e as etiquetas de "Nunca para quem tem" (CRM ou WhatsApp)
        const waIds = ((chats[r.chat_id] || {}).labels || []).map(String);
        if (waIds.some((id) => waNoSend.has(id))) { await seqPatch(r, { status: 'saiu', outcome: 'nao_enviar' }); continue; }
        if (seqExcluded(a.sequence.start, r.contact ? r.contact.labelIds : [], waIds)) { await seqPatch(r, { status: 'saiu', outcome: 'etiqueta_excluida' }); continue; }
        // 2.18.1: tiraram a etiqueta do WhatsApp de início → sai antes do próximo envio (2 leituras seguidas)
        const exitLabel = seqExitLabelOf(a.sequence);
        if (exitLabel && !seqSelfRemoved.has(r.id) && !seqSelfRemovedStart(a.sequence, r.node, exitLabel)) {
          const pres = waStartPresence({ labelId: exitLabel, runChatId: r.chat_id, runPhone: await seqRunPhone(r), chat: chats[r.chat_id] || null, holders: await holdersOf(exitLabel) });
          if (pres === 'absent') {
            const n = (waLeftReads.get(r.id) || 0) + 1;
            waLeftReads.set(r.id, n);
            if (n >= WA_LEFT_READS) {
              waLeftReads.delete(r.id);
              if (await seqPatch(r, { status: 'saiu', outcome: 'saiu_etiqueta', due_at: null })) {
                await logSkip({ source: 'follow', source_id: a.id, contact_id: r.contact ? r.contact.id : r.contact_id || null, chat_id: r.chat_id, item_id: null }, LEFT_LABEL_REASON);
              }
            }
            continue; // 1ª leitura sem a etiqueta: não envia nada até a 2ª confirmar (ou a etiqueta voltar)
          }
          if (pres === 'present') waLeftReads.delete(r.id);
        }
        const res = seqStep({ def: a.sequence, run: seqRunState(r), chat: chats[r.chat_id] || null, replies: replies[r.chat_id] || [], now: t, settings: st.settings });
        if (res.status === 'wait') {
          const due = res.dueAt || null;
          if ((due || null) !== (msOf(r.due_at) || null) && Math.abs((due || 0) - (msOf(r.due_at) || 0)) > 60 * 1000) await seqPatch(r, { due_at: due });
          continue;
        }
        if (res.status === 'run') {
          const until = failedRecently.get(`seq:${r.id}`);
          // 2.13.2: faixa da etapa → horário da automação (geral ou personalizado) → limite próprio por dia. Fora: espera
          // a próxima janela (o "faltam" do painel mostra quando). Os limites gerais valem depois, no envio.
          const okAt = nextSendTime(t, a.sequence, res.window, st.settings);
          if (okAt == null || okAt > t) {
            if (okAt && Math.abs(okAt - (msOf(r.due_at) || 0)) > 60 * 1000) await seqPatch(r, { due_at: okAt });
            continue;
          }
          const lim = scheduleDailyLimit(a.sequence);
          if (lim && (await sentTodayBy(a.id)) >= lim) continue;
          if (!(until && until > t)) st.seqQueue.push({ automation: a, run: r, res });
          continue;
        }
        // espera nova, caminho tomado sem envio, etiquetas ou fim: grava já (nada sai)
        const patch = { branches: [...(r.branches || []), ...res.branches], skip_wait: false };
        if (res.status === 'progress') Object.assign(patch, { node: res.node, wait_started_at: res.waitStart, due_at: null });
        else Object.assign(patch, { status: 'fim', outcome: res.outcome, node: null, due_at: null });
        const saved = await seqPatch(r, patch);
        if (saved) await seqLabelOps(r, res.ops, a);
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
      const nextIsWait = res.node && (seqIndex(def).get(res.node) || {}).node && ['esperar', 'pausa'].includes(seqIndex(def).get(res.node).node.type); // 2.13.0: ⏳ também
      const branches = [...(run.branches || []), ...res.branches];
      // trava: avança o percurso ANTES de mandar (só uma aba/PC consegue esta versão)
      const claimed = await seqPatch(run, { node: res.node, wait_started_at: nextIsWait ? t : null, due_at: null, skip_wait: false, branches, last_sent_at: t,
        ...(res.node ? {} : { status: 'fim', outcome: seqOutcome(branches) }) });
      if (!claimed) return;
      await seqLabelOps(run, res.ops, automation);
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
      // 2.13.2: fora do horário geral só seguem as réguas com horário personalizado (cada uma confere o dela)
      const outside = !isBusinessTime(now(), st.settings);
      const customSeq = () => st.sequencesAvailable && seqActive().some((a) => a.sequence.schedule && a.sequence.schedule.mode === 'personalizado');
      // (fora do horário: confere o que está ligado no máximo a cada 2 min, para saber se alguma régua tem horário próprio)
      if (outside && (st.sequencesAvailable || st.campaignsAvailable) && (!st.active || now() - st.activityAt >= ACTIVITY_MS)) await refreshActivity();
      const customCamp = () => !!(st.active && st.active.campaignsCustom); // 2.14.0: disparo com horário próprio
      if (outside && !customSeq() && !customCamp()) { st.waiting = 'fora do horário'; return; }
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
      // (fora do horário geral: só as réguas com horário personalizado; disparos e agendados usam o geral)
      let job = !outside && st.active.schedules ? await scheduleJob() : null;
      // 2.14.0: o disparo confere o horário, a velocidade e os limites dele (somados com as automações)
      if (!job && (!outside || customCamp()) && st.campaignsAvailable && st.active.campaigns && deps.campaignJob) job = await deps.campaignJob(api, { counts: st.counts, settings: st.settings, now: now(), outside });
      if (!job && !outside) {
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
      _trackNativeLabelsOnce: () => trackNativeLabels(), // 2.16.5 (só testes): uma leitura das etiquetas nativas
      refreshCounts, evaluate, ensureNoSendLabel, loadAutomations, evaluateAutomations,
      setWaLabel, // 2.7.1: a mensagem rápida usa a mesma troca de etiqueta do WhatsApp das automações
    };
  }

  // ── 2.17.0: Radar — conversas "sem destino" (sem etiqueta CRM e sem percurso ativo) há mais de N horas ──
  // Pura (testável). chats = ponte radarChats; db = { chatId: { crmLabelIds, active } } (null = não deu para ler o banco:
  // ninguém entra, para não avisar errado); config = { on, since, hours, crmAsNone, waAsNone }; snooze = system_config.
  const RADAR_WINDOW_S = 7 * 86400;
  const radarNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  function radarPick({ chats, db, config, snooze, nowMs = Date.now() }) {
    const c = config || {};
    if (c.on === false || !db || !Array.isArray(chats)) return [];
    const nowS = Math.floor(nowMs / 1000);
    const hours = Number(c.hours) > 0 ? Number(c.hours) : 2;
    const idleS = Math.round(hours * 3600);
    const asNone = new Set(Array.isArray(c.crmAsNone) ? c.crmAsNone : []);
    const waNone = new Set((Array.isArray(c.waAsNone) ? c.waAsNone : []).map(String)); // 2.17.1: etiquetas do WhatsApp que não contam
    const sinceS = c.since && Date.parse(c.since) ? Math.floor(Date.parse(c.since) / 1000) : null; // 2.17.1: só daqui pra frente
    const sn = snooze || {};
    const out = [];
    for (const ch of chats) {
      if (!ch || typeof ch.id !== 'string' || !/^\d+@(c\.us|lid)$/.test(ch.id)) continue;
      const t = Number(ch.t) || 0;
      if (!t || t < nowS - RADAR_WINDOW_S || nowS - t < idleS) continue; // fora dos 7 dias / parada há menos de N h
      if (sinceS != null && t <= sinceS) continue; // 2.17.1: última mensagem de antes de o Radar ser ligado
      if (radarNorm(ch.name) === 'meu numero pessoal') continue;
      if ((Array.isArray(ch.labels) ? ch.labels : []).some((l) => !waNone.has(String(l)))) continue; // 2.17.1: qualquer etiqueta do WhatsApp é destino (menos as que "não contam")
      const d = db[ch.id] || { crmLabelIds: [], active: false };
      if (d.active) continue;
      if ((d.crmLabelIds || []).some((l) => !asNone.has(l))) continue; // tem etiqueta CRM que conta como destino
      const s = sn[ch.id];
      if (s && s.mode === 'none' && t <= Number(s.lastT)) continue; // "Não precisa" até chegar mensagem nova
      if (s && s.mode === 'remind' && Date.parse(s.until) > nowMs) continue; // "Lembrar em 1 h"
      out.push({ ...ch, idleS: nowS - t });
    }
    return out.sort((a, b) => b.t - a.t);
  }
  // "há 3 h 20 min" / "há 1 dia"
  function radarAgo(s) {
    const m = Math.max(0, Math.floor(Number(s) / 60) || 0);
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
    const d = Math.floor(h / 24);
    return `há ${d} dia${d === 1 ? '' : 's'}${h % 24 ? ` ${h % 24} h` : ''}`;
  }

  root.TspEngine = {
    radarPick, radarAgo, // 2.17.0
    DEFAULT_SETTINGS, NO_SEND_NAME, DAY_NAMES,
    parseHM, normSettings, businessMsBetween, isBusinessTime, addBusinessMs, nextBusinessStart,
    formatWait, formatDays, scheduleText, waitText, formatLeft, hm,
    firstNameOf, chatIdOfContact, pickVariant, evaluateFollow,
    smartFirstName, fillName, hasNameVar, firstWordOf, isCommonName, stripAccents,
    setGreetings, greetingFor, greetingPeriod, learnNameFrom, GREET_DEFAULT, convTracker,
    SALE_WA_ALL, saleAfterDefaults, saleWaPlan, // 2.12.4
    waTriggerLabelOf, // 2.12.5
    activationSentence, // 2.12.6
    activityOfEvent, mergeActivity, activityBuffer, spDayOfSec, // 2.12.8
    withRetry, errorReason, createNameLearner, PANEL_HDR_BTNS, // 2.12.1
    defaultPanelPrefs, normPanelPrefs, clampTopH, listShouldRestore, listRestoreTarget, LIST_KEEP_MS, previewSendPlan, sendLabelsApply,
    normBrPhone, matchSalesForPurchase, salePhoneOf, PANEL_TABS, PANEL_FILTERS, PANEL_BLOCKS, PANEL_CONV_BTNS,
    TRIGGER_TYPES, FUTURE_TRIGGERS, evaluateAutomation, automationSummary, automationNeedsChat, automationKeywords,
    automationEntry, leaveKey, isWaTrigger, WA_LABEL_ACTIONS,
    resolveSendItem, nextScheduleAt, AUTOMATION_TEMPLATES, waitPhrase,
    WIZARDS, wizardToAutomations, wizardSentence, wizardMinutes, businessMinutesPerDay, validateAutomationDraft,
    seqIndex, seqStep, seqValidate, seqFromEntry, sinceEntryText, seqEntryOrderWarnings, seqSendSteps, seqManualPlan, seqManualForecast, seqSkipForecast, seqDescribe, seqNodeLabel, seqTemplate, seqId, seqStartMatches, seqOutcome, SEQ_MAX_DEPTH,
    seqNormalize, seqInsert, seqRemove, seqExcluded, seqExitLabelOf, seqSelfRemovedStart, waStartPresence, LEFT_LABEL_REASON, createAgendaSync, // 2.18.1
    seqSimulate, simAtText, seqFromAutomation, seqAmountOf, // 2.13.0
    seqStepText, seqForecast, seqChatCard, seqOutcomeText, // 2.18.5
    itemUsageLines, itemInUse, friendlyDeleteError, // 2.13.1
    scheduleSpec, nextSendTime, pausaUntil, scheduleDailyLimit, scheduleOutsideCommon, scheduleSentence, scheduleProblems, untilText, windowText, daysText, // 2.13.2
    weekFromJson, weekOf, weekToJson, weekSummary, scheduleWeekJson, copyToWeekdays, rowOutsideCommon, WEEK_ORDER, DAY_CAP, // 2.14.3
    CAMP_HARD, CAMP_PRESETS, CAMP_PRESET_LABEL, campaignSpeed, campaignSpeedRisk, campaignSpeedClamped, campaignSpeedText, campaignGapMs, campaignGate, campaignForecast, forecastText,
    spinText, hasSpin, VARIANT_MODES, variantCount, pickVariant, variantParts, spinParts, removeAllExcept, // 2.14.0
    limitCheck, randomGapMs, estimateDuration, estimateText,
    createMotor,
  };
})(globalThis);
