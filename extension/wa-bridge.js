// Ponte para a biblioteca WA-JS: roda no mundo da página (world MAIN) logo DEPOIS de
// vendor/wppconnect-wa.js. Atende o painel (content.js) por window.postMessage com protocolo
// próprio (diferente da ponte do microfone):
//   pedido:   { source: 'tsp-wajs-content', id, type, payload }
//   resposta: { source: 'tsp-wajs-bridge', id, type, ok, data } ou { ..., ok: false, error: { code, message, stage } }
// stage: 'before-send' = nada foi enviado; 'sending' = o envio já tinha começado.
// Nunca devolve mensagens de erro da biblioteca (podem conter o id da conversa).
(() => {
  if (window.__tspWaJsBridge) return;
  Object.defineProperty(window, '__tspWaJsBridge', { value: true });

  const FROM_PANEL = 'tsp-wajs-content';
  const TO_PANEL   = 'tsp-wajs-bridge';
  const MIN_RECORD_MS = 1500;
  const MAX_RECORD_MS = 60000;

  const before = window.__tspWaBefore || { wpp: null, config: null };
  try { delete window.__tspWaBefore; } catch { /* ok */ }

  // A nossa cópia: a biblioteca acabou de publicar self.WPP. Se ainda é o WPP de antes, a nossa não carregou.
  const loadedWpp = window.WPP;
  const wpp = loadedWpp && loadedWpp !== before.wpp ? loadedWpp : null;

  // Devolve ao global o WPP de outra extensão quando o nosso ficar pronto
  if (wpp && before.wpp) {
    const restore = () => {
      window.WPP = before.wpp;
      if (before.config) window.WPPConfig = before.config;
    };
    if (wpp.isReady) restore();
    else if (wpp.loader && typeof wpp.loader.onReady === 'function') wpp.loader.onReady(restore);
  }

  const jobs = new Map(); // id do pedido sendVoice/sendText/sendMedia -> { cancelled, stage, wake }

  class BridgeError extends Error {
    constructor(code, message, stage) {
      super(message);
      this.code = code;
      this.stage = stage;
    }
  }

  const isReady = () => !!(wpp && wpp.isReady);
  // 2.9.2: tipos novos de parte (rich-parts.js roda logo antes desta ponte, no mesmo mundo)
  const Rich = window.TspRich || null;

  function activeChat() {
    if (!isReady()) return { kind: 'nenhuma', chatId: null };
    let chat;
    try { chat = wpp.chat.getActiveChat(); } catch { chat = null; }
    if (!chat || !chat.id) return { kind: 'nenhuma', chatId: null };
    const chatId = chat.id._serialized || String(chat.id);
    if (chat.isGroup || /@g\.us$/.test(chatId)) return { kind: 'grupo', chatId: null };
    if (/@(c\.us|lid)$/.test(chatId)) return { kind: 'individual', chatId };
    return { kind: 'nenhuma', chatId: null }; // canais, transmissões etc.
  }

  async function labelsInfo() {
    if (!isReady() || !wpp.labels || typeof wpp.labels.getAllLabels !== 'function') return { available: false, count: null };
    try {
      // Só leitura; com limite de 1 s para o pedido "status" não demorar
      const labels = await Promise.race([
        wpp.labels.getAllLabels(),
        new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
      ]);
      return Array.isArray(labels) ? { available: true, count: labels.length } : { available: false, count: null };
    } catch {
      return { available: false, count: null };
    }
  }

  // true/false quando a biblioteca sabe; undefined quando não dá para saber (só leitura)
  function businessAccount() {
    try {
      return wpp.profile && typeof wpp.profile.isBusiness === 'function' ? wpp.profile.isBusiness() : undefined;
    } catch {
      return undefined;
    }
  }

  function labelWriteInfo() {
    if (!isReady() || !wpp.labels || typeof wpp.labels.addOrRemoveLabels !== 'function') return { available: false, reason: 'not_ready' };
    if (businessAccount() === false) return { available: false, reason: 'not_business' };
    return { available: true, reason: null };
  }

  async function status() {
    const config = (wpp && wpp.config) || {};
    const servers = config.linkPreviewApiServers;
    return {
      loaded: !!wpp,
      ready: isReady(),
      telemetryOff: config.disableGoogleAnalytics === true,
      linkServersOff: Array.isArray(servers) && servers.length === 0,
      chat: activeChat().kind,
      labels: await labelsInfo(),
      labelWrite: labelWriteInfo(),
    };
  }

  async function sendVoice(requestId, payload) {
    const { chatId, audio, recordMs } = payload || {};
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    if (typeof chatId !== 'string' || !/^[^@\s]+@(c\.us|lid)$/.test(chatId)) {
      throw new BridgeError('invalid_chat', 'Conversa inválida (só conversas individuais)', 'before-send');
    }
    // Sequências (1.9.0) pedem a checagem de conversa carregada; o envio de sempre continua igual
    if (payload.requireLoaded === true) await individualLoadedChat(chatId);
    if (!(audio instanceof ArrayBuffer) || audio.byteLength === 0) throw new BridgeError('invalid_audio', 'Áudio inválido', 'before-send');
    // recordMs: inteiro >= 0 (0 = na hora, sem "gravando…"); qualquer outra coisa é erro (nunca vira 0)
    if (!Number.isInteger(recordMs) || recordMs < 0) throw new BridgeError('invalid_record_ms', 'Tempo de gravação inválido', 'before-send');
    if (jobs.has(requestId)) throw new BridgeError('duplicate', 'Pedido repetido', 'before-send');
    const instant = recordMs === 0;
    const waitMs = instant ? 0 : Math.min(MAX_RECORD_MS, Math.max(MIN_RECORD_MS, recordMs));

    const job = { cancelled: false, stage: 'before-send', wake: null };
    jobs.set(requestId, job);
    try {
      if (!instant) {
        try {
          // (a) "gravando áudio…" para o cliente
          await wpp.chat.markIsRecording(chatId);
          // (b) espera, podendo ser cancelada
          if (!job.cancelled) {
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, waitMs);
              job.wake = () => { clearTimeout(timer); resolve(); };
            });
          }
        } catch {
          throw new BridgeError('recording_failed', 'Não consegui mostrar "gravando áudio"', 'before-send');
        } finally {
          // (c) sempre tira o "gravando…", inclusive em erro ou cancelamento
          try { await wpp.chat.markIsPaused(chatId); } catch { /* ok */ }
        }
      }
      if (job.cancelled) throw new BridgeError('cancelled', 'Envio cancelado', 'before-send');

      // (d) só Blob (nunca URL) e (e) envio como mensagem de voz
      const blob = new Blob([audio], { type: 'audio/ogg; codecs=opus' });
      job.stage = 'sending';
      try {
        await wpp.chat.sendFileMessage(chatId, blob, {
          type: 'audio',
          isPtt: true,
          waveform: true,
          createChat: false,
          markIsRead: false,
        });
      } catch {
        throw new BridgeError('send_failed', 'O WhatsApp não confirmou o envio', 'sending');
      }
      return { sent: true };
    } finally {
      jobs.delete(requestId);
    }
  }

  // ── Etiquetas nativas do WhatsApp Business (SÓ LEITURA) ───────────────────
  // Usa só getAllLabels, chat.list e openChatBottom. Nada aqui altera etiquetas ou envia mensagens.
  // Lê apenas o que já está na memória do WhatsApp Web (sem getMessages, sem downloads).

  const LABELS_TIMEOUT_MS = 3000;
  const LIST_TIMEOUT_MS = 5000;
  const CHAT_ID_RE = /^[^@\s]+@(c\.us|lid|g\.us)$/;
  const PREVIEW_KIND = {
    chat: 'texto', ptt: 'audio', audio: 'audio', image: 'foto', video: 'video', gif: 'video', ptv: 'video',
    document: 'documento', sticker: 'figurinha', location: 'localizacao', liveLocation: 'localizacao',
  };

  const safe = (fn, fallback) => {
    try {
      const v = fn();
      return v === undefined || v === null ? fallback : v;
    } catch {
      return fallback;
    }
  };

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new BridgeError('timeout', 'A biblioteca demorou para responder', 'before-send')), ms)),
    ]);
  }

  const oneLine = (text, max) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };

  const chatIdOf = (chat) => safe(() => chat.id._serialized || String(chat.id), '');

  async function labels() {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    let all;
    try {
      all = await withTimeout(wpp.labels.getAllLabels(), LABELS_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof BridgeError) throw err;
      throw new BridgeError('labels_failed', 'Não consegui ler as etiquetas', 'before-send');
    }
    if (!Array.isArray(all)) throw new BridgeError('labels_failed', 'Não consegui ler as etiquetas', 'before-send');
    return all
      .filter((l) => l && typeof l.name === 'string' && l.name.trim() !== '' && l.id != null)
      .map((l) => ({
        id: String(l.id),
        name: l.name.trim().slice(0, 60),
        hexColor: /^#[0-9a-f]{3,8}$/i.test(l.hexColor || '') ? l.hexColor : '#9ca3af',
        count: Number.isFinite(Number(l.count)) && Number(l.count) > 0 ? Math.floor(Number(l.count)) : 0,
      }));
  }

  function lastLoadedMessage(chat) {
    const msgs = safe(() => chat.msgs.getModelsArray(), null);
    if (!Array.isArray(msgs) || !msgs.length) return null;
    let best = null;
    let bestT = -1;
    for (const m of msgs) {
      const t = Number(safe(() => m.t, 0)) || 0;
      if (t >= bestT) { best = m; bestT = t; }
    }
    return best;
  }

  // Prévia curta: texto (≤ 80, uma linha) ou só o tipo da mídia (legenda ≤ 60 para foto/vídeo/documento)
  function previewOf(msg) {
    if (!msg) return { kind: 'nenhum', text: '' };
    const kind = PREVIEW_KIND[safe(() => msg.type, '')] || 'outro';
    if (kind === 'texto') return { kind, text: oneLine(safe(() => msg.body, ''), 80) };
    if (kind === 'foto' || kind === 'video' || kind === 'documento') return { kind, text: oneLine(safe(() => msg.caption, ''), 60) };
    return { kind, text: '' };
  }

  function chatCard(chat, withPreview = true) {
    const id = chatIdOf(chat);
    const group = safe(() => !!chat.isGroup, false) || /@g\.us$/.test(id);
    const kind = group ? 'grupo' : /@(c\.us|lid)$/.test(id) ? 'individual' : 'outro';
    const contactName = safe(() => chat.contact.formattedName || chat.contact.displayName || chat.contact.pushname, '');
    const name = [safe(() => chat.formattedTitle, ''), safe(() => chat.name, ''), contactName, id.split('@')[0]]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .find(Boolean) || '';
    const last = withPreview ? lastLoadedMessage(chat) : null; // sem prévia: nem olha as mensagens
    return {
      id,
      name: name.slice(0, 100),
      kind,
      t: Number(safe(() => chat.t, 0)) || 0,
      unread: Math.max(0, Math.floor(Number(safe(() => chat.unreadCount, 0)) || 0)),
      fromMe: !!(last && safe(() => last.id.fromMe, false)),
      preview: previewOf(last),
    };
  }

  async function labelChats(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const p = payload || {};
    const labelId = p.labelId;
    const offset = p.offset === undefined ? 0 : p.offset;
    const limit = p.limit === undefined ? 50 : p.limit;
    if (typeof labelId !== 'string' || !labelId || labelId.length > 40) throw new BridgeError('invalid_label', 'Etiqueta inválida', 'before-send');
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1) {
      throw new BridgeError('invalid_request', 'Pedido inválido', 'before-send');
    }
    const pageSize = Math.min(100, limit);
    const known = await labels();
    if (!known.some((l) => l.id === labelId)) throw new BridgeError('invalid_label', 'Etiqueta inválida', 'before-send');

    let chats;
    try {
      chats = await withTimeout(wpp.chat.list({ withLabels: [labelId], ignoreGroupMetadata: true }), LIST_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof BridgeError) throw err;
      throw new BridgeError('chats_failed', 'Não consegui ler as conversas', 'before-send');
    }
    if (!Array.isArray(chats)) throw new BridgeError('chats_failed', 'Não consegui ler as conversas', 'before-send');

    // Arquivadas ficam fora (o número da etiqueta também não as conta); ordena antes de paginar
    const filtered = chats
      .filter((c) => !safe(() => c.archive, false))
      .filter((c) => {
        const ids = safe(() => c.labels, null);
        return !Array.isArray(ids) || ids.map(String).includes(labelId);
      })
      .map((c) => ({ c, t: Number(safe(() => c.t, 0)) || 0 }))
      .sort((a, b) => b.t - a.t);
    return {
      total: filtered.length,
      chats: filtered.slice(offset, offset + pageSize).map(({ c }) => chatCard(c, p.noPreview !== true)),
    };
  }

  // ── 2.5.0: etiquetas nativas para as automações (SÓ LEITURA) ──
  // labelChatIds: todas as conversas individuais que estão numa etiqueta (inclusive arquivadas), só id e nome,
  // sem olhar mensagens. labelEvents: trocas de etiqueta (evento chat.update_label) guardadas só na memória
  // desta aba até o painel pedir; o painel só grava no banco as das etiquetas usadas por automações ativas.
  const LABEL_EVENTS_MAX = 500;
  const labelEventQueue = [];

  function onLabelUpdate(e) {
    try {
      const chat = e && e.chat;
      const id = chatIdOf(chat);
      if (!/^[0-9]+@(c\.us|lid)$/.test(id)) return; // só conversas individuais
      const type = e.type === 'add' || e.type === 'remove' ? e.type : null;
      const ids = (Array.isArray(e.ids) ? e.ids : []).map(String).filter((x) => x && x.length <= 40);
      if (!type || !ids.length) return;
      labelEventQueue.push({ chatId: id, name: chatCard(chat, false).name, type, labelIds: ids.slice(0, 20), t: Date.now() });
      if (labelEventQueue.length > LABEL_EVENTS_MAX) labelEventQueue.splice(0, labelEventQueue.length - LABEL_EVENTS_MAX);
    } catch { /* evento estranho: ignora */ }
  }
  try { if (wpp && typeof wpp.on === 'function') wpp.on('chat.update_label', onLabelUpdate); } catch { /* sem eventos: a varredura cobre */ }

  async function labelEvents() {
    const events = labelEventQueue.splice(0, labelEventQueue.length);
    if (isReady()) for (const e of events) if (/@lid$/.test(e.chatId)) { const pn = await pnOfChat(e.chatId); if (pn) e.phone = pn; }
    return { events };
  }

  async function labelChatIds(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const labelId = payload && payload.labelId;
    if (typeof labelId !== 'string' || !labelId || labelId.length > 40) throw new BridgeError('invalid_label', 'Etiqueta inválida', 'before-send');
    const known = (await labels()).find((l) => l.id === labelId);
    if (!known) throw new BridgeError('invalid_label', 'Etiqueta inválida', 'before-send');
    let chats;
    try {
      chats = await withTimeout(wpp.chat.list({ withLabels: [labelId], ignoreGroupMetadata: true }), LIST_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof BridgeError) throw err;
      throw new BridgeError('chats_failed', 'Não consegui ler as conversas', 'before-send');
    }
    if (!Array.isArray(chats)) throw new BridgeError('chats_failed', 'Não consegui ler as conversas', 'before-send');
    const out = [];
    for (const c of chats) {
      const ids = safe(() => c.labels, null);
      if (Array.isArray(ids) && !ids.map(String).includes(labelId)) continue;
      const card = chatCard(c, false);
      if (card.kind !== 'individual' || !/^[0-9]+@(c\.us|lid)$/.test(card.id)) continue;
      out.push({ id: card.id, name: card.name });
      if (out.length >= 5000) break;
    }
    // 2.6.0: @lid → telefone verdadeiro (cache local), para o contato do CRM ganhar o número
    for (const c of out) if (/@lid$/.test(c.id)) { const pn = await pnOfChat(c.id); if (pn) c.phone = pn; }
    return { count: known.count, chats: out };
  }

  // Só conversas que já estão carregadas no WhatsApp Web (nunca cria conversa)
  async function loadedChat(chatId) {
    if (typeof chatId !== 'string' || !CHAT_ID_RE.test(chatId)) throw new BridgeError('invalid_chat', 'Conversa inválida', 'before-send');
    let loaded;
    try {
      loaded = await withTimeout(wpp.chat.list({ ignoreGroupMetadata: true }), LIST_TIMEOUT_MS);
    } catch {
      loaded = null;
    }
    const chat = Array.isArray(loaded) ? loaded.find((c) => chatIdOf(c) === chatId) : null;
    if (!chat) throw new BridgeError('invalid_chat', 'Conversa não encontrada', 'before-send');
    return chat;
  }

  async function openChat(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const chatId = payload && payload.chatId;
    // openChatBottom pode CRIAR conversa: só abre conversas que já estão carregadas no WhatsApp Web
    await loadedChat(chatId);
    try {
      await wpp.chat.openChatBottom(chatId);
    } catch {
      throw new BridgeError('open_failed', 'Não consegui abrir a conversa', 'before-send');
    }
    return { opened: true };
  }

  // ── Etiquetas nativas: trocar (a pedido do usuário ou de uma automação que ele criou; uma conversa por vez) ──
  // A única escrita é labels.addOrRemoveLabels, chamada uma vez por pedido. Nunca cria, apaga,
  // renomeia ou muda a cor de etiquetas.

  const LABEL_CONFIRM_MS = 1500;

  const labelIdsOf = (chat) => {
    const ids = safe(() => chat.labels, null);
    return Array.isArray(ids) ? ids.map(String) : [];
  };

  async function chatLabels(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const chat = await loadedChat(payload && payload.chatId);
    return { labelIds: labelIdsOf(chat) };
  }

  async function setChatLabels(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const p = payload || {};
    const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : null);
    const add = list(p.add);
    const remove = list(p.remove);
    if (!add || !remove || add.length > 1 || remove.length > 1 || add.length + remove.length === 0) {
      throw new BridgeError('invalid_request', 'Pedido inválido', 'before-send');
    }
    const ids = [...add, ...remove];
    if (ids.some((id) => typeof id !== 'string' || !id || id.length > 40)) throw new BridgeError('invalid_label', 'Etiqueta inválida', 'before-send');
    if (add.length && remove.length && add[0] === remove[0]) throw new BridgeError('invalid_request', 'Pedido inválido', 'before-send');
    if (typeof p.chatId !== 'string' || !CHAT_ID_RE.test(p.chatId)) throw new BridgeError('invalid_chat', 'Conversa inválida', 'before-send');
    if (labelWriteInfo().reason === 'not_business') throw new BridgeError('not_business', 'A conta não é do WhatsApp Business', 'before-send');
    const known = await labels();
    if (!ids.every((id) => known.some((l) => l.id === id))) throw new BridgeError('invalid_label', 'Etiqueta inválida', 'before-send');
    const chat = await loadedChat(p.chatId);

    try {
      await wpp.labels.addOrRemoveLabels(p.chatId, [
        ...add.map((labelId) => ({ labelId, type: 'add' })),
        ...remove.map((labelId) => ({ labelId, type: 'remove' })),
      ]);
    } catch (err) {
      if (err && err.code === 'is_not_business') throw new BridgeError('not_business', 'A conta não é do WhatsApp Business', 'before-send');
      throw new BridgeError('label_failed', 'O WhatsApp não confirmou a troca de etiqueta', 'sending');
    }

    // Relê a conversa até a mudança aparecer (no máx. 1,5 s)
    const done = (now) => add.every((id) => now.includes(id)) && remove.every((id) => !now.includes(id));
    const read = () => labelIdsOf(safe(() => wpp.chat.get(p.chatId), null) || chat);
    let now = read();
    const until = Date.now() + LABEL_CONFIRM_MS;
    while (!done(now) && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      now = read();
    }
    return { labelIds: now, confirmed: done(now) };
  }

  // ── Texto e arquivo (1.9.0): só a pedido do painel (clique ou agendamento do usuário) ──
  // Só conversas individuais já carregadas; nunca cria conversa (createChat: false).
  // "digitando…" (markIsComposing) pode ser cancelado; markIsPaused sempre no fim.

  const SEND_MAX_BYTES = 40 * 1024 * 1024;
  const TYPING_MAX_MS = 60000;
  const TEXT_MAX = 4096;
  const MEDIA_TYPE = { imagem: 'image', video: 'video', documento: 'document', 'audio-arquivo': 'audio' };

  async function individualLoadedChat(chatId) {
    if (typeof chatId !== 'string' || !/^[^@\s]+@(c\.us|lid)$/.test(chatId)) {
      throw new BridgeError('invalid_chat', 'Conversa inválida (só conversas individuais)', 'before-send');
    }
    const chat = await loadedChat(chatId);
    if (safe(() => !!chat.isGroup, false)) throw new BridgeError('invalid_chat', 'Conversa inválida (só conversas individuais)', 'before-send');
    return chat;
  }

  function typingMsOf(typingMs) {
    if (typingMs === undefined || typingMs === null) return 0;
    if (!Number.isInteger(typingMs) || typingMs < 0 || typingMs > TYPING_MAX_MS) {
      throw new BridgeError('invalid_typing', 'Tempo de "digitando" inválido', 'before-send');
    }
    return typingMs;
  }

  async function typingPhase(job, chatId, ms) {
    if (!ms) return;
    try {
      await wpp.chat.markIsComposing(chatId);
      if (!job.cancelled) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, ms);
          job.wake = () => { clearTimeout(timer); resolve(); };
        });
      }
    } catch {
      throw new BridgeError('typing_failed', 'Não consegui mostrar "digitando…"', 'before-send');
    } finally {
      try { await wpp.chat.markIsPaused(chatId); } catch { /* ok */ }
    }
  }

  // Valida, mostra "digitando…" e chama send() uma vez; stage vira 'sending' só na hora de enviar
  async function sendJob(requestId, chatId, typingMs, send, onFail = null) {
    if (jobs.has(requestId)) throw new BridgeError('duplicate', 'Pedido repetido', 'before-send');
    const job = { cancelled: false, stage: 'before-send', wake: null };
    jobs.set(requestId, job);
    try {
      await individualLoadedChat(chatId);
      if (job.cancelled) throw new BridgeError('cancelled', 'Envio cancelado', 'before-send');
      await typingPhase(job, chatId, typingMs);
      if (job.cancelled) throw new BridgeError('cancelled', 'Envio cancelado', 'before-send');
      job.stage = 'sending';
      try {
        await send();
      } catch {
        throw onFail ? onFail() : new BridgeError('send_failed', 'O WhatsApp não confirmou o envio', 'sending');
      }
      return { sent: true };
    } finally {
      jobs.delete(requestId);
    }
  }

  // ── 2.9.2: localização, produto, catálogo, contato e Pix ──
  // A validação e a montagem ficam em rich-parts.js; aqui só a checagem antes de enviar (erro = nada saiu).
  const RICH_FAIL = {
    pix: 'Chave Pix: o WhatsApp não aceitou o envio nesta conta (precisa ser WhatsApp Business com Pix liberado). Confira a conversa.',
    catalogo: 'Catálogo: o WhatsApp não aceitou o envio. Confira a conversa.',
    produto: 'Produto: o WhatsApp não aceitou o envio. Confira a conversa.',
    localizacao: 'Localização: o WhatsApp não aceitou o envio. Confira a conversa.',
    contato: 'Contato: o WhatsApp não aceitou o envio. Confira a conversa.',
  };
  async function richSendFn(chatId, p, opts) {
    if (!Rich) throw new BridgeError('rich_unavailable', 'Tipo de parte indisponível nesta versão', 'before-send');
    if (p.text != null && (typeof p.text !== 'string' || p.text.length > TEXT_MAX)) throw new BridgeError('invalid_text', 'Texto inválido', 'before-send');
    try {
      return await Rich.prepareSend(wpp, chatId, { kind: p.kind, data: p.data, text: p.text }, opts);
    } catch (e) {
      // só mensagens nossas (richCode); erro da biblioteca vira genérico
      if (e && e.richCode) throw new BridgeError(e.richCode, e.message, 'before-send');
      throw new BridgeError('rich_prepare', 'Não consegui preparar a mensagem', 'before-send');
    }
  }
  const richFail = (kind) => () => new BridgeError(kind === 'pix' ? 'pix_failed' : 'rich_failed', RICH_FAIL[kind] || 'O WhatsApp não confirmou o envio', 'sending');

  async function sendRich(requestId, payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const p = payload || {};
    if (!Rich || !Rich.isRich(p.kind)) throw new BridgeError('invalid_kind', 'Tipo de parte inválido', 'before-send');
    const ms = typingMsOf(p.typingMs);
    await individualLoadedChat(p.chatId);
    const send = await richSendFn(p.chatId, p, { createChat: false, markIsRead: false });
    return sendJob(requestId, p.chatId, ms, send, richFail(p.kind));
  }

  function richInfo() {
    if (!isReady() || !Rich) return { ready: isReady(), types: null };
    return { ready: true, types: Rich.availability(wpp) };
  }

  // Produtos do MEU catálogo (só leitura; foto, nome, preço). Sem catálogo / conta comum: lista vazia com motivo.
  const CATALOG_MAX = 500;
  async function catalogProducts() {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    if (!Rich || !wpp.catalog || typeof wpp.catalog.getProducts !== 'function') return { ok: false, reason: 'unavailable', products: [] };
    if (businessAccount() === false) return { ok: false, reason: 'not_business', products: [] };
    let me = null;
    try { me = wpp.conn.getMyUserId(); } catch { me = null; }
    if (!me) return { ok: false, reason: 'no_me', products: [] };
    const meId = String(me._serialized || me);
    let raw = null;
    try { raw = await withTimeout(Promise.resolve().then(() => wpp.catalog.getProducts(meId, CATALOG_MAX)), 15000); } catch { raw = null; }
    if (!Array.isArray(raw) || !raw.length) {
      // o que o WhatsApp já tem carregado do catálogo
      const cat = await Promise.resolve().then(() => (typeof wpp.catalog.getMyCatalog === 'function' ? wpp.catalog.getMyCatalog() : null)).catch(() => null);
      const models = safe(() => cat.productCollection.getModelsArray(), null) || safe(() => cat.productCollection._models, null);
      if (Array.isArray(models)) raw = models;
    }
    if (!Array.isArray(raw)) return { ok: false, reason: 'failed', products: [] };
    const seen = new Set();
    const products = [];
    for (const r of raw.slice(0, CATALOG_MAX)) {
      const n = safe(() => Rich.normalizeProduct(r), null);
      if (n && !seen.has(n.id)) { seen.add(n.id); products.push(n); }
    }
    return { ok: true, reason: null, products };
  }

  // Contatos salvos (nome + número) para a parte "Contato"; só @c.us, até 20, filtrados aqui
  async function contactSearch(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const q = payload && typeof payload.q === 'string' ? payload.q.trim().toLowerCase().slice(0, 60) : '';
    const qd = q.replace(/\D/g, '');
    let list = null;
    try { list = await withTimeout(Promise.resolve().then(() => wpp.contact.list({ onlyMyContacts: true })), LIST_TIMEOUT_MS); } catch { list = null; }
    if (!Array.isArray(list)) list = safe(() => wpp.whatsapp.ContactStore.getModelsArray().filter((c) => c.isMyContact), []) || [];
    const out = [];
    for (const c of list) {
      const id = safe(() => c.id._serialized, '') || '';
      const m = /^(\d{8,15})@c\.us$/.exec(id);
      if (!m) continue;
      const name = String(safe(() => c.name, '') || safe(() => c.pushname, '') || '').trim().slice(0, 60);
      if (!name) continue;
      if (q && !name.toLowerCase().includes(q) && !(qd.length >= 3 && m[1].includes(qd))) continue;
      out.push({ name, phone: m[1] });
      if (out.length >= 20) break;
    }
    return out;
  }

  async function sendText(requestId, payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const { chatId, text, typingMs } = payload || {};
    if (typeof text !== 'string' || !text.trim() || text.length > TEXT_MAX) {
      throw new BridgeError('invalid_text', 'Texto inválido (1 a 4096 caracteres)', 'before-send');
    }
    const ms = typingMsOf(typingMs);
    return sendJob(requestId, chatId, ms, () => wpp.chat.sendTextMessage(chatId, text, { createChat: false, markIsRead: false }));
  }

  async function sendMedia(requestId, payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const { chatId, kind, data, mime, fileName, caption, typingMs } = payload || {};
    const type = Object.prototype.hasOwnProperty.call(MEDIA_TYPE, kind) ? MEDIA_TYPE[kind] : null;
    if (!type) throw new BridgeError('invalid_kind', 'Tipo de arquivo inválido', 'before-send');
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0) throw new BridgeError('invalid_file', 'Arquivo inválido', 'before-send');
    if (data.byteLength > SEND_MAX_BYTES) throw new BridgeError('file_too_big', 'Arquivo acima de 40 MB', 'before-send');
    if (typeof mime !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(mime) || mime.length > 100) {
      throw new BridgeError('invalid_file', 'Tipo do arquivo inválido', 'before-send');
    }
    if (fileName != null && (typeof fileName !== 'string' || fileName.length > 200)) throw new BridgeError('invalid_file', 'Nome do arquivo inválido', 'before-send');
    if (caption != null && (typeof caption !== 'string' || caption.length > TEXT_MAX)) throw new BridgeError('invalid_text', 'Legenda inválida', 'before-send');
    const ms = typingMsOf(typingMs);
    const blob = new Blob([data], { type: mime }); // só Blob, nunca URL
    const options = { type, createChat: false, markIsRead: false };
    if (fileName) options.filename = fileName;
    if (type !== 'audio' && caption && caption.trim()) options.caption = caption;
    if (type === 'audio') options.isPtt = false;
    return sendJob(requestId, chatId, ms, () => wpp.chat.sendFileMessage(chatId, blob, options));
  }

  // ── Motor de envios (2.0.0): SÓ LEITURA do que já está carregado no WhatsApp Web ──
  // Para cada conversa pedida: se está carregada, quem mandou a última mensagem e quando
  // (só fromMe + horário, nunca o texto) e quais palavras de anúncio aparecem no ctwaContext
  // (o texto do anúncio é comparado aqui e nunca sai da ponte).

  const INFO_MAX_CHATS = 500;
  const INFO_MAX_KEYWORDS = 20;
  const INDIVIDUAL_RE = /^[^@\s]+@(c\.us|lid)$/;

  function adTextsOf(chat) {
    const msgs = safe(() => chat.msgs.getModelsArray(), null);
    if (!Array.isArray(msgs)) return '';
    const parts = [];
    for (const m of msgs) {
      const ctx = safe(() => m.ctwaContext, null);
      if (!ctx || typeof ctx !== 'object') continue;
      ['title', 'description', 'body'].forEach((k) => {
        const v = safe(() => ctx[k], '');
        if (typeof v === 'string' && v) parts.push(v);
      });
    }
    return parts.join('\n').toLowerCase();
  }

  async function chatsInfo(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const p = payload || {};
    const ids = Array.isArray(p.chatIds) ? p.chatIds : null;
    const keywords = p.keywords === undefined ? [] : Array.isArray(p.keywords) ? p.keywords : null;
    if (!ids || ids.length > INFO_MAX_CHATS || ids.some((id) => typeof id !== 'string' || !INDIVIDUAL_RE.test(id))) {
      throw new BridgeError('invalid_request', 'Pedido inválido', 'before-send');
    }
    if (!keywords || keywords.length > INFO_MAX_KEYWORDS || keywords.some((k) => typeof k !== 'string' || !k.trim() || k.length > 60)) {
      throw new BridgeError('invalid_request', 'Pedido inválido', 'before-send');
    }
    let loaded;
    try {
      loaded = await withTimeout(wpp.chat.list({ ignoreGroupMetadata: true }), LIST_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof BridgeError) throw err;
      throw new BridgeError('chats_failed', 'Não consegui ler as conversas', 'before-send');
    }
    const byId = new Map();
    (Array.isArray(loaded) ? loaded : []).forEach((c) => byId.set(chatIdOf(c), c));
    const kws = keywords.map((k) => k.trim().toLowerCase());
    const chats = {};
    ids.forEach((id) => {
      const chat = byId.get(id);
      if (!chat || safe(() => !!chat.isGroup, false)) return;
      const last = lastLoadedMessage(chat);
      const ads = kws.length ? adTextsOf(chat) : '';
      // 2.2.0: horário da última mensagem carregada do CLIENTE (só o horário, nunca o texto)
      let lastIn = 0;
      (safe(() => chat.msgs.getModelsArray(), null) || []).forEach((m) => {
        if (safe(() => m.id.fromMe, true)) return;
        const t = Number(safe(() => m.t, 0)) || 0;
        if (t > lastIn) lastIn = t;
      });
      chats[id] = {
        loaded: true,
        last: last ? { fromMe: !!safe(() => last.id.fromMe, false), t: Number(safe(() => last.t, 0)) || 0 } : null,
        lastIn: lastIn || null,
        ad: ads ? kws.filter((k) => ads.includes(k)) : [],
      };
    });
    return { chats };
  }

  // ── Venda pela conversa (2.3.0): SÓ LEITURA da conversa aberta ─────────────
  // Última localização mandada pelo cliente, um texto do cliente que pareça endereço (só sugestão,
  // o usuário confirma) e a origem do anúncio (ctwaContext). Nada disso é guardado aqui.

  const ADDRESS_RE = /\b(rua|r\.|av\.?|avenida|travessa|tv\.|estrada|rodovia|alameda|praça|praca|largo|condom[ií]nio|bloco|apto|apartamento|n[º°o]\.?\s*\d|cep)\b/i;

  function adOf(msgs) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const ctx = safe(() => msgs[i].ctwaContext, null);
      if (!ctx || typeof ctx !== 'object') continue;
      const str = (k, max) => { const v = safe(() => ctx[k], ''); return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null; };
      const url = str('sourceUrl', 500);
      const app = (str('sourceApp', 40) || str('conversionSource', 40) || '').toLowerCase();
      const platform = /insta/.test(app) || /instagram\.com/.test(url || '') ? 'Instagram' : /face|fb/.test(app) || /facebook\.com|fb\.(me|com)/.test(url || '') ? 'Facebook' : null;
      return { title: str('title', 300), body: str('description', 300) || str('body', 300), url: url && /^https?:\/\//.test(url) ? url : null, sourceType: str('sourceType', 40), platform };
    }
    return null;
  }

  async function chatSaleInfo(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const chat = await individualLoadedChat(payload && payload.chatId);
    const msgs = (safe(() => chat.msgs.getModelsArray(), null) || []).slice().sort((a, b) => (Number(safe(() => a.t, 0)) || 0) - (Number(safe(() => b.t, 0)) || 0));
    let location = null;
    let addressText = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (safe(() => m.id.fromMe, true)) continue;
      const type = safe(() => m.type, '');
      if (!location && (type === 'location' || type === 'liveLocation')) {
        const lat = Number(safe(() => m.lat, NaN));
        const lng = Number(safe(() => m.lng, NaN));
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const loc = safe(() => m.loc, '') || safe(() => m.comment, '');
          location = { lat, lng, name: typeof loc === 'string' && loc.trim() ? loc.trim().replace(/\s+/g, ' ').slice(0, 200) : null };
        }
      }
      if (!addressText && type === 'chat') {
        const body = safe(() => m.body, '');
        if (typeof body === 'string' && body.length <= 300 && ADDRESS_RE.test(body) && /\d/.test(body)) addressText = body.trim().replace(/\s+/g, ' ');
      }
      if (location && addressText) break;
    }
    return { location, addressText, ad: adOf(msgs) };
  }

  // ── Conversões (2.4.0): diagnóstico do anúncio da conversa (SÓ LEITURA) ──
  // Devolve os campos do ctwaContext e só um RESUMO do conversionData (tipo, tamanho, nomes das
  // chaves), nunca o conteúdo. O ctwa_clid só sai se estiver num campo com esse nome (texto).

  const CLID_KEYS = ['ctwa_clid', 'ctwaClid', 'clid'];

  function summarizeData(v) {
    if (v == null) return null;
    if (typeof v === 'string') return { type: 'texto', size: v.length, keys: null, looksLikeClid: false };
    if (v instanceof ArrayBuffer) return { type: 'bytes', size: v.byteLength, keys: null, looksLikeClid: true };
    if (ArrayBuffer.isView(v)) return { type: 'bytes', size: v.byteLength, keys: null, looksLikeClid: true };
    if (typeof v === 'object') {
      const keys = safe(() => Object.keys(v), []).slice(0, 30).map((k) => String(k).slice(0, 40));
      return { type: 'objeto', size: keys.length, keys, looksLikeClid: keys.some((k) => /clid/i.test(k)) };
    }
    return { type: typeof v, size: null, keys: null, looksLikeClid: false };
  }

  function clidOf(ctx) {
    for (const k of CLID_KEYS) {
      const v = safe(() => ctx[k], null);
      if (typeof v === 'string' && /^[\w.:=+/-]{8,500}$/.test(v)) return v;
    }
    const data = safe(() => ctx.conversionData, null);
    if (data && typeof data === 'object' && !ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) {
      for (const k of CLID_KEYS) {
        const v = safe(() => data[k], null);
        if (typeof v === 'string' && /^[\w.:=+/-]{8,500}$/.test(v)) return v;
      }
    }
    return null;
  }

  // 2.6.0: o código de clique costuma vir DENTRO do conversionData (bytes em protobuf). Leitura genérica
  // de protobuf (varint e length-delimited, até 3 níveis, sem biblioteca), procurando textos que pareçam
  // um click id da Meta. Só o painel recebe o valor (para mandar à Edge Function); a tela mostra só um
  // resumo mascarado (campo, número do campo, tamanho, 6 primeiros + 4 últimos caracteres).
  const CLID_CHARS = /^[A-Za-z0-9_\-.=+/]+$/;
  const MAX_PROTO_BYTES = 16384;

  function b64Bytes(v) {
    if (typeof v !== 'string' || v.length < 16 || v.length > 20000 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(v)) return null;
    try {
      const bin = atob(v.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(v.length / 4) * 4, '='));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch { return null; }
  }

  function toBytes(v) {
    if (v == null) return null;
    if (v instanceof Uint8Array) return v;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (typeof v === 'string') return b64Bytes(v);
    const arr = Array.isArray(v) ? v : (v && typeof v === 'object' && Array.isArray(v.data) ? v.data : null);
    if (arr && arr.length <= MAX_PROTO_BYTES && arr.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)) return Uint8Array.from(arr);
    return null;
  }

  function printable(bytes) {
    if (!bytes.length || bytes.length > 1000) return null;
    for (const c of bytes) if (c < 0x20 || c > 0x7e) return null;
    let t = '';
    for (const c of bytes) t += String.fromCharCode(c);
    return t;
  }

  function readVarint(b, pos) {
    let x = 0;
    let mul = 1;
    for (let i = 0; i < 10 && pos < b.length; i++) {
      const c = b[pos++];
      x += (c & 0x7f) * mul;
      if (!(c & 0x80)) return [x, pos];
      mul *= 128;
    }
    return null;
  }

  // Mensagem protobuf válida inteira → textos imprimíveis (com o caminho de números de campo, ex. "3.1")
  function protoTexts(b, depth, path, out) {
    if (!b || !b.length || b.length > MAX_PROTO_BYTES) return false;
    const subs = [];
    let pos = 0;
    while (pos < b.length) {
      const k = readVarint(b, pos);
      if (!k) return false;
      pos = k[1];
      const field = Math.floor(k[0] / 8);
      const wire = k[0] % 8;
      if (field < 1) return false;
      if (wire === 0) { const v = readVarint(b, pos); if (!v) return false; pos = v[1]; }
      else if (wire === 1) pos += 8;
      else if (wire === 5) pos += 4;
      else if (wire === 2) {
        const l = readVarint(b, pos);
        if (!l) return false;
        pos = l[1];
        if (pos + l[0] > b.length) return false;
        subs.push({ field, bytes: b.subarray(pos, pos + l[0]) });
        pos += l[0];
      } else return false;
      if (pos > b.length) return false;
    }
    for (const f of subs) {
      const p = path ? `${path}.${f.field}` : String(f.field);
      const text = printable(f.bytes);
      if (text) out.push({ path: p, text });
      else if (depth < 3) protoTexts(f.bytes, depth + 1, p, out);
    }
    return true;
  }

  // Nota do candidato: 3 = começa como click id da Meta (ARA/Af/Ab); 2 = base64url longo; 0 = não serve
  function clidScore(t, sourceId) {
    if (typeof t !== 'string' || t.length < 20 || t.length > 500 || !CLID_CHARS.test(t)) return 0;
    if (/^\d+$/.test(t) || t === sourceId || /^https?\//i.test(t) || /\.(jpe?g|png|webp|mp4)$/i.test(t)) return 0;
    if (/^(ARA|Af|Ab)/.test(t)) return 3;
    if (t.length >= 40 && /[A-Z]/.test(t) && /[a-z]/.test(t) && /\d/.test(t)) return 2;
    return 0;
  }

  // Todos os candidatos de um campo do ctwaContext (bytes, base64, texto ou objeto)
  function clidCandidates(fieldName, v, sourceId) {
    const found = [];
    const add = (path, text) => { const score = clidScore(text, sourceId); if (score) found.push({ field: fieldName, path, text, score }); };
    const scan = (val, prefix) => {
      if (typeof val === 'string' && /^(ARA|Af|Ab)/.test(val)) add(prefix || '-', val); // padrão Meta: vale como está
      const bytes = toBytes(val);
      const texts = [];
      // base64/bytes que são uma mensagem protobuf válida: valem os textos de DENTRO (não o base64 inteiro)
      if (bytes && protoTexts(bytes, 1, '', texts)) { texts.forEach((x) => add(prefix ? `${prefix}.${x.path}` : x.path, x.text)); return; }
      if (typeof val === 'string') { add(prefix || '-', val); return; }
      const t = bytes ? printable(bytes) : null;
      if (t) add(prefix || '-', t);
    };
    if (v && typeof v === 'object' && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer) && !Array.isArray(v) && !Array.isArray(v.data)) {
      safe(() => Object.keys(v), []).slice(0, 30).forEach((k) => scan(safe(() => v[k], null), String(k).slice(0, 30)));
    } else scan(v, '');
    return found;
  }

  const maskClid = (t) => `${t.slice(0, 6)}…${t.slice(-4)}`;

  // Escolhe o mais provável: padrão Meta > base64url; conversionData > ctwaSignals; caminho mais raso; mais longo
  function extractClid(ctx) {
    const sourceId = (() => { const v = safe(() => ctx.sourceId, null); return v == null ? null : String(v); })();
    const all = [...clidCandidates('conversionData', safe(() => ctx.conversionData, null), sourceId), ...clidCandidates('ctwaSignals', safe(() => ctx.ctwaSignals, null), sourceId)];
    const seen = new Set();
    const list = all.filter((c) => (seen.has(c.text) ? false : seen.add(c.text)))
      .sort((a, b) => b.score - a.score || (a.field === 'conversionData' ? 0 : 1) - (b.field === 'conversionData' ? 0 : 1)
        || a.path.split('.').length - b.path.split('.').length || b.text.length - a.text.length);
    if (!list.length) return { clid: null, info: null, candidates: [] };
    const pick = list[0];
    const pub = (c) => ({ field: c.field, path: c.path, length: c.text.length, mask: maskClid(c.text), score: c.score });
    return { clid: pick.text, info: pub(pick), candidates: list.slice(0, 5).map(pub) };
  }

  // Campo com o nome (texto) vale primeiro; senão, o que a leitura do protobuf achar
  function clidFields(ctx) {
    const named = clidOf(ctx);
    if (named) return { ctwaClid: named, clidInfo: { field: 'campo ctwa_clid', path: '-', length: named.length, mask: maskClid(named), score: 3 }, clidCandidates: [] };
    const x = extractClid(ctx);
    return { ctwaClid: x.clid, clidInfo: x.info, clidCandidates: x.candidates };
  }

  const msgT = (m) => Number(safe(() => m.t, 0)) || 0;
  const ctxOf = (m) => { const c = safe(() => m.ctwaContext, null); return c && typeof c === 'object' ? c : null; };

  function adSummary(ctx) {
      const s = (k, max) => { const v = safe(() => ctx[k], null); return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : (typeof v === 'number' ? String(v) : null); };
      const app = (s('sourceApp', 40) || s('conversionSource', 40) || '').toLowerCase();
      const url = s('sourceUrl', 500);
      return {
        found: true,
        title: s('title', 200),
        description: s('description', 120),
        sourceUrl: url && /^https?:\/\//.test(url) ? url : null,
        sourceId: s('sourceId', 100),
        sourceType: s('sourceType', 40),
        sourceApp: s('sourceApp', 40),
        conversionSource: s('conversionSource', 40),
        mediaType: s('mediaType', 40),
        platform: /insta/.test(app) || /instagram\.com/.test(url || '') ? 'Instagram' : /face|fb/.test(app) || /facebook\.com|fb\.(me|com)/.test(url || '') ? 'Facebook' : null,
        conversionData: summarizeData(safe(() => ctx.conversionData, null)),
        ...clidFields(ctx),
        keys: safe(() => Object.keys(ctx), []).slice(0, 40).map((k) => String(k).slice(0, 40)),
      };
  }

  // 2.6.2: conversa longa: a mensagem do anúncio pode não estar carregada. Busca mensagens ANTERIORES pela
  // WA-JS (chat.getMessages, direction 'before', 100 por vez, só leitura) até achar o ctwaContext, chegar ao
  // começo da conversa, passar de 30 dias ou de 1000 mensagens.
  const DEEP_BATCH = 100;
  const DEEP_MAX = 1000;
  const DEEP_DAYS = 30;
  async function earlierAdMessage(chatId, oldest) {
    if (!wpp.chat || typeof wpp.chat.getMessages !== 'function') return { msg: null, scanned: 0, stop: 'sem acesso às mensagens antigas' };
    let anchor = safe(() => oldest.id._serialized, '') || '';
    if (!anchor) return { msg: null, scanned: 0, stop: 'começo da conversa' };
    const limitT = Math.floor(Date.now() / 1000) - DEEP_DAYS * 86400;
    let scanned = 0;
    while (scanned < DEEP_MAX) {
      let batch;
      try {
        batch = await withTimeout(wpp.chat.getMessages(chatId, { count: DEEP_BATCH, direction: 'before', id: anchor }), 10000);
      } catch { return { msg: null, scanned, stop: 'o WhatsApp não entregou as mensagens antigas' }; }
      const list = (Array.isArray(batch) ? batch : []).filter((m) => safe(() => m.id._serialized, '') !== anchor).sort((a, b) => msgT(a) - msgT(b));
      if (!list.length) return { msg: null, scanned, stop: 'começo da conversa' };
      scanned += list.length;
      const hit = list.find((m) => ctxOf(m));
      if (hit) return { msg: hit, scanned, stop: null };
      const next = safe(() => list[0].id._serialized, '');
      if (!next || next === anchor) return { msg: null, scanned, stop: 'começo da conversa' };
      anchor = next;
      if (msgT(list[0]) && msgT(list[0]) < limitT) return { msg: null, scanned, stop: `passou de ${DEEP_DAYS} dias` };
    }
    return { msg: null, scanned, stop: `passou de ${DEEP_MAX} mensagens` };
  }

  // payload.deep: se não achar nas mensagens carregadas, procura nas antigas (pode demorar alguns segundos)
  async function adContext(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const chat = await individualLoadedChat(payload && payload.chatId);
    const msgs = (safe(() => chat.msgs.getModelsArray(), null) || []).slice().sort((a, b) => msgT(b) - msgT(a));
    const loadedHit = msgs.find((m) => ctxOf(m));
    if (loadedHit) return { ...adSummary(ctxOf(loadedHit)), origin: 'mensagens carregadas', firstMessageAt: msgT(loadedHit) || null };
    if (!(payload && payload.deep === true)) return { found: false };
    const r = await earlierAdMessage(payload.chatId, msgs[msgs.length - 1]);
    if (r.msg) return { ...adSummary(ctxOf(r.msg)), origin: 'mensagens antigas', firstMessageAt: msgT(r.msg) || null, deep: { scanned: r.scanned } };
    return { found: false, deep: { scanned: r.scanned, stop: r.stop } };
  }

  // ── 2.6.0: telefone verdadeiro de conversas @lid ──
  // contact.getPnLidEntry (WA-JS 4.7.2) para @lid só lê o cache lidPnCache do WhatsApp Web (não consulta
  // o servidor). Para @c.us o número já está no id (não chama nada).
  async function pnOfChat(chatId) {
    const m = /^(\d{8,15})@c\.us$/.exec(chatId || '');
    if (m) return m[1];
    if (!/^\d+@lid$/.test(chatId || '') || !wpp.contact || typeof wpp.contact.getPnLidEntry !== 'function') return null;
    try {
      const e = await withTimeout(wpp.contact.getPnLidEntry(chatId), 2000);
      const pn = String(safe(() => e.phoneNumber.id, '') || '');
      return /^\d{8,15}$/.test(pn) ? pn : null;
    } catch { return null; }
  }

  const realName = (v) => (typeof v === 'string' && v.trim() && !/^[+\d\s().-]+$/.test(v) ? v.trim().replace(/\s+/g, ' ').slice(0, 100) : null);

  async function chatPhone(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const chatId = payload && payload.chatId;
    if (typeof chatId !== 'string' || !/^[0-9]+@(c\.us|lid)$/.test(chatId)) throw new BridgeError('invalid_chat', 'Conversa inválida', 'before-send');
    const phone = await pnOfChat(chatId);
    let name = null;
    const chat = safe(() => wpp.chat.get(chatId), null);
    // 2.6.3: nome DESTA conversa: título salvo; senão o nome/pushname do contato desta conversa
    if (chat) {
      name = realName(safe(() => chat.formattedTitle, null)) || realName(safe(() => chat.name, null)) || realName(safe(() => chat.contact.name, null))
        || realName(safe(() => chat.contact.pushname, null)) || realName(safe(() => chat.contact.verifiedName, null));
    }
    if (!name && /@lid$/.test(chatId) && wpp.contact && typeof wpp.contact.getPnLidEntry === 'function') {
      try {
        const e = await withTimeout(wpp.contact.getPnLidEntry(chatId), 2000);
        name = realName(safe(() => e.contact.name, null)) || realName(safe(() => e.contact.pushname, null)) || realName(safe(() => e.contact.verifiedName, null));
      } catch { /* sem nome */ }
    }
    return { phone, name, via: /@c\.us$/.test(chatId) ? 'numero' : phone ? 'lid' : null };
  }

  // ── 2.6.3: trava do telefone (antes de enviar Compra/Contato e de lançar a venda) ──
  // O telefone tem que ser DESTA conversa: @c.us → os dígitos do próprio id; @lid → o que
  // contact.getPnLidEntry devolve agora para ESTE @lid. requireActive: a conversa ainda é a aberta.
  // Devolve só sim/não (nunca o número).
  const normPhone = (v) => { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length === 10 || d.length === 11 ? `55${d}` : d; };
  async function verifyChatPhone(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const p = payload || {};
    const chatId = p.chatId;
    if (typeof chatId !== 'string' || !/^[0-9]+@(c\.us|lid)$/.test(chatId)) throw new BridgeError('invalid_chat', 'Conversa inválida', 'before-send');
    const act = activeChat();
    const expected = await pnOfChat(chatId);
    const given = normPhone(p.phone);
    return { active: act.chatId === chatId, known: !!expected, match: !!expected && !!given && given === normPhone(expected) };
  }

  // ── 2.6.0: leads novos de anúncio (evento chat.new_message), só na memória desta aba ──
  // Entra na fila só a mensagem do CLIENTE com ctwaContext que é a primeira dele na conversa (nada do
  // cliente antes, nas mensagens carregadas). O painel decide se manda o "Contato" (interruptor + data).
  const LEADS_MAX = 200;
  const leadQueue = [];
  // 2.8.3: começo das SUAS mensagens (para aprender o nome: "Olá, Fernanda!!"). Recebidas não entram.
  const MINE_MAX = 200;
  const mineQueue = [];
  function onMyMessage(m) {
    const chatId = safe(() => m.id.remote._serialized, '') || String(safe(() => m.id.remote, '') || '');
    if (!/^[0-9]+@(c\.us|lid)$/.test(chatId)) return;
    const type = safe(() => m.type, '');
    const body = type === 'chat' ? safe(() => m.body, '') : safe(() => m.caption, '');
    if (typeof body !== 'string' || !body.trim()) return;
    mineQueue.push({ chatId, head: body.slice(0, 80) });
    if (mineQueue.length > MINE_MAX) mineQueue.splice(0, mineQueue.length - MINE_MAX);
  }
  // ── 2.10.0: painel de resultados — eventos das conversas individuais (só memória desta aba) ──
  // Para cada mensagem nova: conversa, se é sua ou do cliente e a hora. Mensagem do cliente sem nenhuma
  // mensagem antes na conversa = lead novo (first), com o anúncio se vier de anúncio. Nunca o texto.
  // O painel (aba com a trava) grava leads, respostas e o que você digitou.
  const CONV_MAX = 2000;
  const convQueue = [];
  const SKIP_TYPES = new Set(['e2e_notification', 'notification', 'notification_template', 'gp2', 'protocol', 'reaction', 'call_log', 'revoked', 'ciphertext_failed']);
  const realMsg = (x) => !SKIP_TYPES.has(String(safe(() => x.type, '') || '')) && !safe(() => x.isNotification, false);
  const convChatId = (m) => safe(() => m.id.remote._serialized, '') || String(safe(() => m.id.remote, '') || '');
  const noEarlierOf = (chat) => safe(() => chat.msgs.msgLoadState.noEarlierMsgs, undefined);
  function leadAd(m) {
    const ctx = ctxOf(m);
    if (!ctx) return null;
    const a = adSummary(ctx);
    return { id: a.sourceId || null, title: a.title || null };
  }
  function onConvMessage(m) {
    const chatId = convChatId(m);
    if (!/^[0-9]+@(c\.us|lid)$/.test(chatId) || !realMsg(m)) return;
    const fromMe = safe(() => m.id.fromMe, null);
    if (typeof fromMe !== 'boolean') return;
    const t = msgT(m) || Math.floor(Date.now() / 1000);
    const ev = { chatId, fromMe, t };
    if (!fromMe) {
      const chat = safe(() => wpp.chat.get(chatId), null);
      const msgs = (chat && safe(() => chat.msgs.getModelsArray(), null)) || [];
      const earlier = msgs.some((x) => x !== m && realMsg(x) && msgT(x) <= t && safe(() => x.id.id, 1) !== safe(() => m.id.id, 2));
      if (!earlier && noEarlierOf(chat) !== false) { ev.first = true; ev.ad = leadAd(m); }
    }
    convQueue.push(ev);
    if (convQueue.length > CONV_MAX) convQueue.splice(0, convQueue.length - CONV_MAX);
  }
  const pnCache = new Map();
  async function cachedPn(chatId) {
    if (pnCache.has(chatId)) return pnCache.get(chatId);
    const pn = await pnOfChat(chatId);
    if (pnCache.size > 5000) pnCache.clear();
    pnCache.set(chatId, pn);
    return pn;
  }
  // scan (1 vez por abertura): conversas carregadas cuja 1ª mensagem é do cliente e chegou nas últimas 24 h
  // (com o PC desligado). Só conta se o WhatsApp diz que não há mensagens mais antigas na conversa.
  const LEAD_SCAN_MS = 24 * 3600 * 1000;
  async function convEvents(payload) {
    let scanned = false;
    const scan = [];
    if (payload && payload.scan === true && isReady()) {
      let loaded = null;
      try { loaded = await withTimeout(wpp.chat.list({ ignoreGroupMetadata: true }), LIST_TIMEOUT_MS); } catch { loaded = null; }
      if (Array.isArray(loaded)) {
        scanned = true;
        const since = (Date.now() - LEAD_SCAN_MS) / 1000;
        for (const chat of loaded.slice(0, 3000)) {
          const id = chatIdOf(chat);
          if (!/^[0-9]+@(c\.us|lid)$/.test(id) || noEarlierOf(chat) !== true) continue;
          const msgs = (safe(() => chat.msgs.getModelsArray(), null) || []).filter(realMsg);
          if (!msgs.length) continue;
          const first = msgs.reduce((a, b) => (msgT(b) < msgT(a) ? b : a));
          if (safe(() => first.id.fromMe, true) || msgT(first) < since) continue;
          scan.push({ chatId: id, fromMe: false, t: msgT(first), first: true, ad: leadAd(first), scan: true });
        }
      }
    }
    const events = [...convQueue.splice(0, convQueue.length), ...scan];
    if (isReady()) for (const e of events) if (!e.fromMe) e.phone = await cachedPn(e.chatId);
    return { events, scanned };
  }

  function onNewMessage(m) {
    try { onConvMessage(m); } catch { /* mensagem estranha: ignora */ }
    try {
      if (safe(() => m.id.fromMe, false) === true) { onMyMessage(m); return; }
      if (safe(() => m.id.fromMe, true)) return;
      const ctx = safe(() => m.ctwaContext, null);
      if (!ctx || typeof ctx !== 'object') return;
      const chatId = safe(() => m.id.remote._serialized, '') || String(safe(() => m.id.remote, '') || '');
      if (!/^[0-9]+@(c\.us|lid)$/.test(chatId)) return;
      const t = Number(safe(() => m.t, 0)) || Math.floor(Date.now() / 1000);
      const chat = safe(() => wpp.chat.get(chatId), null);
      queueAttribution(chatId, t, ctx, chat); // 2.6.2: guarda o anúncio de onde o lead veio (sempre)
      const msgs = (chat && safe(() => chat.msgs.getModelsArray(), null)) || [];
      if (msgs.some((x) => x !== m && !safe(() => x.id.fromMe, true) && (Number(safe(() => x.t, 0)) || 0) < t)) return;
      if (leadQueue.some((l) => l.chatId === chatId)) return;
      const s2 = (k, max) => { const v = safe(() => ctx[k], null); return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : (typeof v === 'number' ? String(v) : null); };
      const app = (s2('sourceApp', 40) || '').toLowerCase();
      leadQueue.push({
        chatId, t, name: chat ? realName(chatCard(chat, false).name) : null,
        ad: { title: s2('title', 200), sourceId: s2('sourceId', 100), sourceApp: s2('sourceApp', 40), conversionSource: s2('conversionSource', 40),
          platform: /insta/.test(app) ? 'Instagram' : /face|fb/.test(app) ? 'Facebook' : null, ctwaClid: clidFields(ctx).ctwaClid },
      });
      if (leadQueue.length > LEADS_MAX) leadQueue.splice(0, leadQueue.length - LEADS_MAX);
    } catch { /* mensagem estranha: ignora */ }
  }
  try { if (wpp && typeof wpp.on === 'function') wpp.on('chat.new_message', onNewMessage); } catch { /* sem eventos: sem Contato automático */ }

  // ── 2.6.2: atribuição do anúncio (wa_ad_attribution) ──
  // Fila só na memória desta aba; o painel (aba com a trava) grava no banco. scan: na abertura do WhatsApp,
  // varre as conversas já carregadas (a mensagem mais antiga com ctwaContext de cada uma).
  const ATTR_MAX = 1000;
  const attrQueue = new Map(); // chatId → item
  function attributionItem(chatId, t, ctx, chat) {
    const a = adSummary(ctx);
    return {
      chatId, t, name: chat ? realName(chatCard(chat, false).name) : null,
      ad: { title: a.title, sourceId: a.sourceId, sourceApp: a.platform || a.sourceApp, sourceUrl: a.sourceUrl, conversionSource: a.conversionSource, ctwaClid: a.ctwaClid },
    };
  }
  function queueAttribution(chatId, t, ctx, chat) {
    const prev = attrQueue.get(chatId);
    if (prev && prev.t <= t) return; // vale a mais antiga
    if (!prev && attrQueue.size >= ATTR_MAX) return;
    attrQueue.set(chatId, attributionItem(chatId, t, ctx, chat));
  }

  async function adAttributions(payload) {
    let scanned = false;
    if (payload && payload.scan === true && isReady()) {
      let loaded = null;
      try { loaded = await withTimeout(wpp.chat.list({ ignoreGroupMetadata: true }), LIST_TIMEOUT_MS); } catch { loaded = null; }
      if (Array.isArray(loaded)) {
        scanned = true;
        for (const chat of loaded.slice(0, 3000)) {
          const id = chatIdOf(chat);
          if (!/^[0-9]+@(c\.us|lid)$/.test(id)) continue;
          const msgs = safe(() => chat.msgs.getModelsArray(), null) || [];
          let first = null;
          for (const m of msgs) if (!safe(() => m.id.fromMe, true) && ctxOf(m) && (!first || msgT(m) < msgT(first))) first = m;
          if (first) queueAttribution(id, msgT(first) || Math.floor(Date.now() / 1000), ctxOf(first), chat);
        }
      }
    }
    const items = [...attrQueue.values()];
    attrQueue.clear();
    if (isReady()) for (const it of items) it.phone = await pnOfChat(it.chatId);
    return { items, scanned };
  }

  async function adLeads() {
    const leads = leadQueue.splice(0, leadQueue.length);
    for (const l of leads) l.phone = await pnOfChat(l.chatId);
    return { leads };
  }

  // Conversas individuais carregadas, mais recentes primeiro (para "Enviar para…")
  async function recentChats(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const limit = Math.min(50, Math.max(1, Math.floor(Number(payload && payload.limit) || 30)));
    let loaded;
    try {
      loaded = await withTimeout(wpp.chat.list({ ignoreGroupMetadata: true }), LIST_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof BridgeError) throw err;
      throw new BridgeError('chats_failed', 'Não consegui ler as conversas', 'before-send');
    }
    return (Array.isArray(loaded) ? loaded : [])
      .map((c) => chatCard(c, false))
      .filter((c) => c.kind === 'individual')
      .sort((a, b) => b.t - a.t)
      .slice(0, limit)
      .map((c) => ({ id: c.id, name: c.name }));
  }

  // ── Disparo para conversa nova (2.0.0-D2) ────────────────────────────────
  // ÚNICO pedido que cria conversa. Só para disparo com "permitir conversas novas"
  // (payload.campaign === true), só números @c.us e só depois de contact.queryExists
  // confirmar que o número tem WhatsApp. Manda só a 1ª parte (sem "digitando…": a conversa
  // ainda não existe); as outras partes seguem pelo envio normal (conversa já carregada).

  const QUERY_TIMEOUT_MS = 8000;

  async function campaignSend(requestId, payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const p = payload || {};
    if (p.campaign !== true) throw new BridgeError('invalid_request', 'Pedido inválido', 'before-send');
    if (typeof p.chatId !== 'string' || !/^\d{8,15}@c\.us$/.test(p.chatId)) throw new BridgeError('invalid_chat', 'Conversa inválida (só números @c.us)', 'before-send');
    let send;
    const newChat = { createChat: true, markIsRead: false };
    let onFail = null;
    if (Rich && Rich.isRich(p.kind)) {
      send = null; // 2.9.2: montado depois de confirmar o número
      onFail = richFail(p.kind);
    } else if (p.kind === 'texto') {
      if (typeof p.text !== 'string' || !p.text.trim() || p.text.length > TEXT_MAX) throw new BridgeError('invalid_text', 'Texto inválido (1 a 4096 caracteres)', 'before-send');
      send = () => wpp.chat.sendTextMessage(p.chatId, p.text, newChat);
    } else if (p.kind === 'voz') {
      if (!(p.data instanceof ArrayBuffer) || p.data.byteLength === 0 || p.data.byteLength > SEND_MAX_BYTES) throw new BridgeError('invalid_audio', 'Áudio inválido', 'before-send');
      const blob = new Blob([p.data], { type: 'audio/ogg; codecs=opus' });
      send = () => wpp.chat.sendFileMessage(p.chatId, blob, { ...newChat, type: 'audio', isPtt: true, waveform: true });
    } else {
      const type = Object.prototype.hasOwnProperty.call(MEDIA_TYPE, p.kind) ? MEDIA_TYPE[p.kind] : null;
      if (!type) throw new BridgeError('invalid_kind', 'Tipo de arquivo inválido', 'before-send');
      if (!(p.data instanceof ArrayBuffer) || p.data.byteLength === 0) throw new BridgeError('invalid_file', 'Arquivo inválido', 'before-send');
      if (p.data.byteLength > SEND_MAX_BYTES) throw new BridgeError('file_too_big', 'Arquivo acima de 40 MB', 'before-send');
      if (typeof p.mime !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(p.mime) || p.mime.length > 100) throw new BridgeError('invalid_file', 'Tipo do arquivo inválido', 'before-send');
      if (p.fileName != null && (typeof p.fileName !== 'string' || p.fileName.length > 200)) throw new BridgeError('invalid_file', 'Nome do arquivo inválido', 'before-send');
      if (p.caption != null && (typeof p.caption !== 'string' || p.caption.length > TEXT_MAX)) throw new BridgeError('invalid_text', 'Legenda inválida', 'before-send');
      const blob = new Blob([p.data], { type: p.mime });
      const options = { ...newChat, type };
      if (p.fileName) options.filename = p.fileName;
      if (type !== 'audio' && p.caption && p.caption.trim()) options.caption = p.caption;
      if (type === 'audio') options.isPtt = false;
      send = () => wpp.chat.sendFileMessage(p.chatId, blob, options);
    }
    if (jobs.has(requestId)) throw new BridgeError('duplicate', 'Pedido repetido', 'before-send');
    const job = { cancelled: false, stage: 'before-send', wake: null };
    jobs.set(requestId, job);
    try {
      let exists;
      try {
        exists = await withTimeout(Promise.resolve().then(() => wpp.contact.queryExists(p.chatId)), QUERY_TIMEOUT_MS);
      } catch {
        throw new BridgeError('query_failed', 'Não consegui confirmar se o número tem WhatsApp', 'before-send');
      }
      if (!exists) throw new BridgeError('no_whatsapp', 'Número sem WhatsApp', 'before-send');
      if (!send) send = await richSendFn(p.chatId, p, newChat);
      if (job.cancelled) throw new BridgeError('cancelled', 'Envio cancelado', 'before-send');
      job.stage = 'sending';
      try {
        await send();
      } catch {
        throw onFail ? onFail() : new BridgeError('send_failed', 'O WhatsApp não confirmou o envio', 'sending');
      }
      return { sent: true };
    } finally {
      jobs.delete(requestId);
    }
  }

  function cancel(payload) {
    const job = payload && typeof payload.id === 'string' ? jobs.get(payload.id) : null;
    if (!job || job.stage !== 'before-send') return { cancelled: false };
    job.cancelled = true;
    if (job.wake) job.wake();
    return { cancelled: true };
  }

  const HANDLERS = {
    status: () => status(),
    activeChat: () => activeChat(),
    sendVoice: (payload, requestId) => sendVoice(requestId, payload),
    sendText: (payload, requestId) => sendText(requestId, payload),
    sendMedia: (payload, requestId) => sendMedia(requestId, payload),
    cancel: (payload) => cancel(payload),
    labels: () => labels(),
    labelChats: (payload) => labelChats(payload),
    openChat: (payload) => openChat(payload),
    chatLabels: (payload) => chatLabels(payload),
    setChatLabels: (payload) => setChatLabels(payload),
    chatsInfo: (payload) => chatsInfo(payload),
    campaignSend: (payload, requestId) => campaignSend(requestId, payload),
    chatSaleInfo: (payload) => chatSaleInfo(payload),
    recentChats: (payload) => recentChats(payload),
    adContext: (payload) => adContext(payload),
    labelEvents: () => labelEvents(),
    chatPhone: (payload) => chatPhone(payload),
    verifyChatPhone: (payload) => verifyChatPhone(payload),
    adLeads: () => adLeads(),
    myMessages: () => mineQueue.splice(0, mineQueue.length),
    adAttributions: (payload) => adAttributions(payload),
    labelChatIds: (payload) => labelChatIds(payload),
    sendRich: (payload, requestId) => sendRich(requestId, payload),
    richInfo: () => richInfo(),
    catalogProducts: () => catalogProducts(),
    contactSearch: (payload) => contactSearch(payload),
    convEvents: (payload) => convEvents(payload), // 2.10.0
  };

  function reply(request, ok, data, error) {
    const msg = { source: TO_PANEL, id: request.id, type: request.type, ok };
    if (ok) msg.data = data;
    else {
      const known = error instanceof BridgeError;
      msg.error = {
        code: known ? error.code : 'unexpected',
        message: known ? error.message : 'Erro inesperado na biblioteca',
        stage: known ? error.stage : 'before-send',
      };
    }
    window.postMessage(msg, window.location.origin);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || typeof d !== 'object' || d.source !== FROM_PANEL) return;
    if (typeof d.id !== 'string' || !d.id || d.id.length > 100 || typeof d.type !== 'string') return;
    const handler = Object.prototype.hasOwnProperty.call(HANDLERS, d.type) ? HANDLERS[d.type] : null;
    if (!handler) {
      reply(d, false, null, new BridgeError('unknown_type', 'Pedido desconhecido', 'before-send'));
      return;
    }
    Promise.resolve()
      .then(() => handler(d.payload, d.id))
      .then((data) => reply(d, true, data), (err) => reply(d, false, null, err));
  });
})();
