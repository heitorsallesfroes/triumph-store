// Ponte do microfone: roda no mundo da página do WhatsApp Web (world MAIN), antes dele carregar.
// Quando o painel (content.js) "arma" a ponte com um áudio, o próximo pedido de microfone só de
// áudio recebe um stream que toca esse áudio uma vez, sem sair no alto-falante. O WhatsApp grava
// esse stream como se fosse a voz de quem está usando. Fora disso, getUserMedia funciona como antes.
// O áudio fica só na memória: esta ponte não faz nenhuma conexão de rede.
(() => {
  if (window.__tspMicBridge) return;
  window.__tspMicBridge = true;

  const FROM_PANEL     = 'tsp-wa-content';
  const TO_PANEL       = 'tsp-wa-bridge';
  const ARM_TIMEOUT_MS = 10 * 1000;     // desarma se o WhatsApp não pedir o microfone
  const RELEASE_MS     = 5 * 60 * 1000; // libera o áudio tocado depois de um tempo
  const VERSION        = 1;

  const devices  = navigator.mediaDevices;
  const original = devices && typeof devices.getUserMedia === 'function' ? devices.getUserMedia.bind(devices) : null;

  let armed  = null; // { id, audio: ArrayBuffer, timer }
  let active = null; // { id, ctx, source, timer }

  const post = (type, extra = {}) => window.postMessage({ source: TO_PANEL, type, ...extra }, window.location.origin);

  function disarm() {
    if (!armed) return;
    clearTimeout(armed.timer);
    armed = null;
  }

  function release() {
    if (!active) return;
    const { ctx, source, timer } = active;
    active = null;
    clearTimeout(timer);
    try { source.onended = null; source.stop(); } catch { /* já parado */ }
    ctx.close().catch(() => {});
  }

  async function playAsMicrophone(job) {
    release();
    const ctx = new AudioContext();
    try {
      const buffer = await ctx.decodeAudioData(job.audio);
      const destination = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(destination); // só no stream: não conecta em ctx.destination (alto-falante)
      active = { id: job.id, ctx, source, timer: null };
      source.onended = () => {
        if (!active || active.source !== source) return;
        active.timer = setTimeout(() => { if (active && active.source === source) release(); }, RELEASE_MS);
        post('ended', { id: job.id });
      };
      if (ctx.state !== 'running') await ctx.resume();
      if (ctx.state !== 'running') throw new Error('O navegador bloqueou o áudio');
      // Pequena folga para o WhatsApp começar a gravar antes do som
      source.start(ctx.currentTime + 0.25);
      post('playing', { id: job.id, duration: buffer.duration });
      return destination.stream;
    } catch (err) {
      if (active && active.ctx === ctx) active = null;
      ctx.close().catch(() => {});
      throw err;
    }
  }

  if (original) {
    const getUserMedia = function getUserMedia(constraints) {
      const audioOnly = !!(constraints && constraints.audio) && !(constraints && constraints.video);
      if (!armed || !audioOnly) return original(constraints);
      const job = armed;
      disarm(); // usado uma única vez
      post('requested', { id: job.id });
      return playAsMicrophone(job).catch((err) => {
        post('error', { id: job.id, message: String((err && err.message) || err) });
        // Nunca cai no microfone de verdade: recusa e o painel volta para "arquivo"
        throw new DOMException('Não foi possível usar o áudio da biblioteca', 'NotReadableError');
      });
    };
    try {
      Object.defineProperty(devices, 'getUserMedia', { value: getUserMedia, configurable: true, writable: true });
    } catch {
      devices.getUserMedia = getUserMedia;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== FROM_PANEL || typeof data.type !== 'string') return;

    switch (data.type) {
      case 'ping':
        post('pong', { id: data.id, version: VERSION, ready: !!original });
        break;
      case 'arm': {
        if (!original || typeof data.id !== 'string' || !(data.audio instanceof ArrayBuffer)) {
          post('error', { id: data.id, message: 'Pedido inválido' });
          break;
        }
        disarm();
        const id = data.id;
        armed = {
          id,
          audio: data.audio,
          timer: setTimeout(() => {
            if (armed && armed.id === id) { armed = null; post('timeout', { id }); }
          }, ARM_TIMEOUT_MS),
        };
        post('armed', { id });
        break;
      }
      case 'disarm':
        disarm();
        break;
      case 'stop':
        if (armed && (!data.id || armed.id === data.id)) disarm();
        if (active && (!data.id || active.id === data.id)) release();
        break;
      default:
        break;
    }
  });
})();
