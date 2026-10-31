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

  const jobs = new Map(); // id do pedido sendVoice -> { cancelled, stage, wake }

  class BridgeError extends Error {
    constructor(code, message, stage) {
      super(message);
      this.code = code;
      this.stage = stage;
    }
  }

  const isReady = () => !!(wpp && wpp.isReady);

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

  function chatCard(chat) {
    const id = chatIdOf(chat);
    const group = safe(() => !!chat.isGroup, false) || /@g\.us$/.test(id);
    const kind = group ? 'grupo' : /@(c\.us|lid)$/.test(id) ? 'individual' : 'outro';
    const contactName = safe(() => chat.contact.formattedName || chat.contact.displayName || chat.contact.pushname, '');
    const name = [safe(() => chat.formattedTitle, ''), safe(() => chat.name, ''), contactName, id.split('@')[0]]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .find(Boolean) || '';
    const last = lastLoadedMessage(chat);
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
      chats: filtered.slice(offset, offset + pageSize).map(({ c }) => chatCard(c)),
    };
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

  // ── Etiquetas nativas: trocar (SÓ a pedido do usuário, uma conversa por vez) ──
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
    cancel: (payload) => cancel(payload),
    labels: () => labels(),
    labelChats: (payload) => labelChats(payload),
    openChat: (payload) => openChat(payload),
    chatLabels: (payload) => chatLabels(payload),
    setChatLabels: (payload) => setChatLabels(payload),
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
