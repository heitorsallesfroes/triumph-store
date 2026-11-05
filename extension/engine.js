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
  const NAME_VAR = /\{([^{}]*?)\bnome\b([^{}]*?)\}/gi;
  function fillName(text, name) {
    return String(text == null ? '' : text).replace(NAME_VAR, (m, pre, suf) => (name ? `${pre}${name}${suf}` : ''));
  }
  const hasNameVar = (text) => /\{[^{}]*?\bnome\b[^{}]*?\}/i.test(String(text || ''));

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
      runKey = `venda@${contact.sale_id}`; // uma vez por venda
    } else if (a.trigger_type === 'dia_hora') {
      const t = parseHM(a.schedule_time);
      const d = new Date(now);
      const todayAt = t == null ? null : atMinute(d.getFullYear(), d.getMonth(), d.getDate(), t);
      if (todayAt == null || !(a.schedule_days || []).includes(d.getDay()) || now < todayAt || (manual && todayAt < enteredAt)) {
        const dueAt = nextScheduleAt(a, manual ? Math.max(now, enteredAt) : now);
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
    else if (a.trigger_type === 'venda_registrada') quando = `Quando uma venda for registrada pela conversa${a.trigger_label_id ? ` (só quem está na etiqueta ${lab(a.trigger_label_id)})` : ''}`;
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
      const list = (Array.isArray(source) ? source : st.automations).filter((a) => a.active).sort((a, b) => (a.position || 0) - (b.position || 0));
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
      if (saleList.length) { try { buyers = await api('saleTriggerCandidates', { sinceDays: 2 }); } catch { buyers = []; } }
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
            res = await deps.sendParts({ parts: deps.partsOf(item), chatId: ev.chatId, firstName: smartFirstName({ crmName: contact.name }), label: 'Automação' });
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
      if (!job) return false;
      st.workAt = 0; // achou trabalho: o próximo ciclo pode procurar de novo (o intervalo entre envios continua valendo)
      // A trava ainda é nossa? (renova antes de enviar)
      if (!(await ensureLease({ force: st.leaseUntil - now() < 45 * 1000 }))) return false;
      if (st.settings.paused_all) return false;
      if (job.kind === 'agendado') await runScheduleJob(job);
      else if (job.kind === 'follow') await runFollowJob(job);
      else if (job.kind === 'automacao') await runAutomationJob(job);
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
      state: st, runnerId, start, stop, tick, leaseTick, poke, refreshActivity, setPaused, saveSettings, simulate, loadSettings, loadFlows,
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
    TRIGGER_TYPES, FUTURE_TRIGGERS, evaluateAutomation, automationSummary, automationNeedsChat, automationKeywords,
    automationEntry, leaveKey, isWaTrigger, WA_LABEL_ACTIONS,
    resolveSendItem, nextScheduleAt, AUTOMATION_TEMPLATES, waitPhrase,
    limitCheck, randomGapMs, estimateDuration, estimateText,
    createMotor,
  };
})(globalThis);
