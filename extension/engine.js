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

  function firstNameOf(name) {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n || /^[+\d\s().-]+$/.test(n)) return '';
    return n.split(/\s+/)[0];
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

  const TICK_MS = 10 * 1000;
  const LEASE_MS = 30 * 1000;
  const LEASE_TTL_S = 90;
  const FOLLOW_EVAL_MS = 60 * 1000;
  const PROBE_MS = 5 * 60 * 1000;
  const FIRST_MS = 5 * 1000;
  const SCHED_MAX_LATE_MS = 24 * 3600 * 1000;
  const RETRY_AFTER_FAIL_MS = 30 * 60 * 1000;
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
      noSendLabelId: null,
      current: null,           // { source } enquanto envia
      probeAt: 0,
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
      // Renovada há menos de 30 s: não precisa pedir de novo
      if (!force && holding && st.leaseUntil - now() > (LEASE_TTL_S * 1000) - LEASE_MS) return true;
      // Sem o WhatsApp pronto nesta aba: não pega nem renova (outra aba pronta assume quando vencer)
      if (!(await waReady())) {
        if (!holding) st.role = pausedNow() ? 'pausado' : null;
        return holding;
      }
      let r = null;
      try { r = await api('claimLease', { runnerId, ttlS: LEASE_TTL_S }); } catch { r = null; }
      if (r && r.held) {
        st.leaseUntil = Date.parse(r.lease_until) || now() + LEASE_TTL_S * 1000;
        st.role = pausedNow() ? 'pausado' : 'este';
        return true;
      }
      if (r) st.leaseUntil = 0; // outra aba/PC tem a trava
      st.role = pausedNow() ? 'pausado' : r ? 'outro' : (holding ? 'este' : null);
      return r ? false : holding;
    }

    async function refreshCounts() {
      const t = now();
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
        res = await deps.sendParts({ parts: deps.partsOf(item), chatId: ev.chatId, firstName: firstNameOf(contact.name), label: 'Follow' });
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

    // ── Ciclo ──

    async function step() {
      if (st.available === false && now() - st.probeAt < PROBE_MS) {
        if (deps.legacyTick) await deps.legacyTick();
        return;
      }
      if (!(await loadSettings())) {
        if (deps.legacyTick) await deps.legacyTick();
        return;
      }
      await ensureNoSendLabel();
      const holding = await ensureLease();
      if (st.settings.paused_all) { st.role = 'pausado'; st.waiting = 'pausado'; return; }
      if (!holding) { st.waiting = st.role === 'outro' ? 'outro computador executa' : 'WhatsApp não pronto'; return; }
      st.role = 'este';
      if (deps.isManualBusy && deps.isManualBusy()) { st.waiting = 'envio manual em andamento'; return; }
      if (!isBusinessTime(now(), st.settings)) { st.waiting = 'fora do horário'; return; }
      if (!(await waReady())) { st.waiting = 'WhatsApp não pronto'; return; }
      await refreshCounts();
      const lim = limitCheck(st.counts, st.settings);
      if (!lim.ok) { st.waiting = lim.reason; return; }
      if (now() < st.nextAllowedAt) { st.waiting = 'intervalo entre contatos'; return; }
      st.waiting = '';
      // Ordem: agendados (hora marcada) → disparos → follows
      let job = await scheduleJob();
      if (!job && st.campaignsAvailable && deps.campaignJob) job = await deps.campaignJob(api);
      if (!job) job = await followJob();
      if (!job) return false;
      // A trava ainda é nossa? (renova antes de enviar)
      if (!(await ensureLease({ force: st.leaseUntil - now() < 45 * 1000 }))) return false;
      if (st.settings.paused_all) return false;
      if (job.kind === 'agendado') await runScheduleJob(job);
      else if (job.kind === 'follow') await runFollowJob(job);
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

    async function leaseTick() {
      if (busy || st.available !== true) return;
      try {
        if (!(await loadSettings())) return;
        await ensureLease({ force: true });
      } catch { /* próximo */ }
      changed();
    }

    function start() {
      running = true;
      const set = deps.setTimer || ((fn, ms, repeat) => (repeat ? setInterval(fn, ms) : setTimeout(fn, ms)));
      timers.push(set(() => tick(), FIRST_MS, false));
      timers.push(set(() => tick(), TICK_MS, true));
      timers.push(set(() => leaseTick(), LEASE_MS, true));
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
    async function simulate(limit = 200) {
      await loadSettings();
      if (!st.available) return { available: false, rows: [] };
      await loadFlows();
      const rows = await evaluate();
      return { available: true, rows: rows.slice(0, limit), total: rows.length };
    }

    return {
      state: st, runnerId, start, stop, tick, leaseTick, setPaused, saveSettings, simulate, loadSettings, loadFlows,
      refreshCounts, evaluate, ensureNoSendLabel,
    };
  }

  root.TspEngine = {
    DEFAULT_SETTINGS, NO_SEND_NAME, DAY_NAMES,
    parseHM, normSettings, businessMsBetween, isBusinessTime, addBusinessMs, nextBusinessStart,
    formatWait, formatDays, scheduleText, waitText, formatLeft, hm,
    firstNameOf, chatIdOfContact, pickVariant, evaluateFollow,
    limitCheck, randomGapMs, estimateDuration, estimateText,
    createMotor,
  };
})(globalThis);
