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
  const MAX_RECORD_MS = 12000;

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
    };
  }

  async function sendVoice(requestId, payload) {
    const { chatId, audio, recordMs } = payload || {};
    if (!isReady()) throw new BridgeError('not_ready', 'A biblioteca ainda não está pronta', 'before-send');
    if (typeof chatId !== 'string' || !/^[^@\s]+@(c\.us|lid)$/.test(chatId)) {
      throw new BridgeError('invalid_chat', 'Conversa inválida (só conversas individuais)', 'before-send');
    }
    if (!(audio instanceof ArrayBuffer) || audio.byteLength === 0) throw new BridgeError('invalid_audio', 'Áudio inválido', 'before-send');
    if (jobs.has(requestId)) throw new BridgeError('duplicate', 'Pedido repetido', 'before-send');
    const waitMs = Math.min(MAX_RECORD_MS, Math.max(MIN_RECORD_MS, Math.round(Number(recordMs) || 0)));

    const job = { cancelled: false, stage: 'before-send', wake: null };
    jobs.set(requestId, job);
    try {
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
