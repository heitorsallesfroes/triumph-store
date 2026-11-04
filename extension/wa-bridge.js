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

  function labelEvents() {
    return { events: labelEventQueue.splice(0, labelEventQueue.length) };
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
  async function sendJob(requestId, chatId, typingMs, send) {
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
        throw new BridgeError('send_failed', 'O WhatsApp não confirmou o envio', 'sending');
      }
      return { sent: true };
    } finally {
      jobs.delete(requestId);
    }
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

  async function adContext(payload) {
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    const chat = await individualLoadedChat(payload && payload.chatId);
    const msgs = (safe(() => chat.msgs.getModelsArray(), null) || []).slice().sort((a, b) => (Number(safe(() => b.t, 0)) || 0) - (Number(safe(() => a.t, 0)) || 0));
    for (const m of msgs) {
      const ctx = safe(() => m.ctwaContext, null);
      if (!ctx || typeof ctx !== 'object') continue;
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
        ctwaClid: clidOf(ctx),
        keys: safe(() => Object.keys(ctx), []).slice(0, 40).map((k) => String(k).slice(0, 40)),
      };
    }
    return { found: false };
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
    if (p.kind === 'texto') {
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
      if (job.cancelled) throw new BridgeError('cancelled', 'Envio cancelado', 'before-send');
      job.stage = 'sending';
      try {
        await send();
      } catch {
        throw new BridgeError('send_failed', 'O WhatsApp não confirmou o envio', 'sending');
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
    labelChatIds: (payload) => labelChatIds(payload),
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
