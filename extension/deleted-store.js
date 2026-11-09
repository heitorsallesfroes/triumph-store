// 2.15.0: cópia LOCAL das mensagens recebidas do cliente (conversa individual), para ver depois o que ele apagou ou
// editou. Roda no mundo da página (world MAIN) logo antes do wa-bridge.js e publica window.TspDeleted.
// Fica só neste computador (IndexedDB "tsp-deleted-msgs"); NUNCA vai para o Supabase nem para outro servidor.
// Regras: só mensagem recebida (nunca as suas), nada de grupo; texto, miniatura e, se até 5 MB, o arquivo da mídia;
// cópias com mais de 7 dias somem sozinhas; no total até 200 MB (apaga as mais antigas primeiro).
(() => {
  if (window.TspDeleted) return;

  const DAY = 24 * 3600 * 1000;
  const LIMITS = Object.freeze({ maxAgeMs: 7 * DAY, maxBytes: 200 * 1024 * 1024, mediaMaxBytes: 5 * 1024 * 1024, textMax: 65536 });
  const CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
  // Tipos guardados (o resto, como avisos do sistema, chamadas e figurinhas animadas de grupo, é ignorado)
  const KINDS = Object.freeze({ chat: 'texto', image: 'imagem', video: 'video', ptt: 'audio', audio: 'audio', document: 'documento', sticker: 'figurinha', location: 'localizacao', vcard: 'contato' });
  const MEDIA = new Set(['image', 'video', 'ptt', 'audio', 'document', 'sticker']);

  const sizeOf = (r) => (r.body ? r.body.length * 2 : 0) + (r.caption ? r.caption.length * 2 : 0) + (r.thumb ? r.thumb.length : 0)
    + (r.media && typeof r.media.size === 'number' ? r.media.size : 0) + (r.edits || []).reduce((n, e) => n + (e.body ? e.body.length * 2 : 0), 0) + 256;

  // Só o que importa da mensagem do WhatsApp (sem nada da biblioteca). null = não guardar.
  function recordOf(m, now = Date.now()) {
    if (!m || typeof m !== 'object') return null;
    const g = (fn, d = null) => { try { const v = fn(); return v === undefined ? d : v; } catch { return d; } };
    if (g(() => m.id.fromMe, true) !== false) return null; // só recebidas
    const id = String(g(() => m.id._serialized, '') || '');
    const chatId = String(g(() => m.id.remote._serialized, '') || g(() => m.from._serialized, '') || '');
    if (!id || !CHAT_RE.test(chatId)) return null; // nada de grupo, status, canal
    if (g(() => m.isGroupMsg, false) || g(() => m.isStatusV3, false)) return null;
    const type = String(g(() => m.type, '') || '');
    if (!Object.prototype.hasOwnProperty.call(KINDS, type)) return null;
    const body = typeof m.body === 'string' ? m.body : '';
    const thumbRaw = MEDIA.has(type) ? (g(() => m.mediaData.preview, null) || (/^\/9j\//.test(body) ? body : null)) : null;
    const rec = {
      id, chatId, type, kind: KINDS[type],
      t: Math.floor(Number(g(() => m.t, 0)) || now / 1000),
      savedAt: now,
      body: type === 'chat' || type === 'location' || type === 'vcard' ? body.slice(0, LIMITS.textMax) : '',
      caption: typeof m.caption === 'string' ? m.caption.slice(0, LIMITS.textMax) : '',
      mimetype: typeof m.mimetype === 'string' ? m.mimetype.slice(0, 100) : '',
      filename: typeof m.filename === 'string' ? m.filename.slice(0, 200) : '',
      duration: Number(g(() => m.duration, 0)) || 0,
      size: Number(g(() => m.size, 0)) || 0,
      thumb: typeof thumbRaw === 'string' && /^[A-Za-z0-9+/=]+$/.test(thumbRaw) && thumbRaw.length < 200000 ? `data:image/jpeg;base64,${thumbRaw}` : null,
      media: null,
      revokedAt: null, editedAt: null, edits: [],
    };
    if (type === 'location') rec.body = [g(() => m.lat, ''), g(() => m.lng, '')].join(',') + (g(() => m.loc, '') ? ` · ${g(() => m.loc, '')}` : '');
    return rec;
  }
  const wantsMedia = (rec) => !!rec && MEDIA.has(rec.type) && rec.size > 0 && rec.size <= LIMITS.mediaMaxBytes;

  // ── Armazenamento: IndexedDB (navegador) ou memória (testes) ──
  function memoryBackend() {
    const m = new Map();
    return {
      put: async (r) => { m.set(r.id, r); },
      get: async (id) => m.get(id) || null,
      del: async (id) => { m.delete(id); },
      all: async () => [...m.values()],
      byChat: async (chatId) => [...m.values()].filter((r) => r.chatId === chatId),
      clear: async () => { m.clear(); },
    };
  }
  function idbBackend(name = 'tsp-deleted-msgs') {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore('msgs', { keyPath: 'id' });
        s.createIndex('chatId', 'chatId');
        s.createIndex('savedAt', 'savedAt');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbp = null; reject(req.error); };
    }));
    const run = async (mode, fn) => {
      const d = await db();
      return new Promise((resolve, reject) => {
        const tx = d.transaction('msgs', mode);
        let out;
        const req = fn(tx.objectStore('msgs'));
        if (req) req.onsuccess = () => { out = req.result; };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    };
    return {
      put: (r) => run('readwrite', (s) => s.put(r)),
      get: async (id) => (await run('readonly', (s) => s.get(id))) || null,
      del: (id) => run('readwrite', (s) => s.delete(id)),
      all: async () => (await run('readonly', (s) => s.getAll())) || [],
      byChat: async (chatId) => (await run('readonly', (s) => s.index('chatId').getAll(chatId))) || [],
      clear: () => run('readwrite', (s) => s.clear()),
    };
  }

  // Resumo sem o arquivo (o que o painel lista)
  const meta = (r) => ({
    id: r.id, chatId: r.chatId, type: r.type, kind: r.kind, t: r.t, revokedAt: r.revokedAt, editedAt: r.editedAt,
    preview: (r.body || r.caption || '').slice(0, 140), hasMedia: !!r.media, hasThumb: !!r.thumb, edits: (r.edits || []).length,
  });

  function createStore(backend, { now = () => Date.now() } = {}) {
    let lastPrune = 0;
    async function prune(force = false) {
      const t = now();
      if (!force && t - lastPrune < 60 * 1000) return { removed: 0 };
      lastPrune = t;
      const rows = (await backend.all()).sort((a, b) => a.savedAt - b.savedAt);
      let removed = 0;
      let total = 0;
      const keep = [];
      for (const r of rows) {
        if (t - r.savedAt > LIMITS.maxAgeMs) { await backend.del(r.id); removed++; } else { keep.push(r); total += sizeOf(r); }
      }
      for (const r of keep) { // mais antigas primeiro
        if (total <= LIMITS.maxBytes) break;
        await backend.del(r.id);
        total -= sizeOf(r);
        removed++;
      }
      return { removed, bytes: total };
    }
    return {
      // Guarda (ou completa: o mesmo id de novo mantém o que já foi apagado/editado e o arquivo já baixado)
      async save(rec) {
        if (!rec || !rec.id) return false;
        const old = await backend.get(rec.id);
        // o texto ORIGINAL nunca é trocado (o WhatsApp pode mandar a mesma mensagem de novo já editada)
        const next = old ? { ...rec, media: rec.media || old.media, thumb: rec.thumb || old.thumb, revokedAt: old.revokedAt, editedAt: old.editedAt, edits: old.edits || [], savedAt: old.savedAt,
          body: old.body || rec.body, caption: old.caption || rec.caption } : rec;
        await backend.put(next);
        prune().catch(() => {});
        return true;
      },
      async attachMedia(id, blob) {
        const r = await backend.get(id);
        if (!r || !blob || typeof blob.size !== 'number' || blob.size > LIMITS.mediaMaxBytes) return false;
        r.media = blob;
        await backend.put(r);
        prune(true).catch(() => {});
        return true;
      },
      // O cliente apagou: só marca (só existe cópia de mensagem recebida)
      async markRevoked(id) {
        const r = await backend.get(id);
        if (!r) return null;
        if (!r.revokedAt) { r.revokedAt = now(); await backend.put(r); }
        return meta(r);
      },
      // O cliente editou: guarda o texto novo; o original (body/caption) continua
      async markEdited(id, newText) {
        const r = await backend.get(id);
        if (!r) return null;
        const text = typeof newText === 'string' ? newText.slice(0, LIMITS.textMax) : '';
        const original = r.body || r.caption || '';
        const last = r.edits && r.edits.length ? r.edits[r.edits.length - 1].body : original;
        if (text === last) return meta(r);
        r.edits = [...(r.edits || []), { body: text, at: now() }].slice(-20);
        r.editedAt = now();
        await backend.put(r);
        return meta(r);
      },
      async get(id) { const r = await backend.get(id); return r && now() - r.savedAt <= LIMITS.maxAgeMs ? r : null; },
      // Só as apagadas/editadas desta conversa nos últimos 7 dias, da mais nova para a mais antiga
      async changedInChat(chatId) {
        const t = now();
        return (await backend.byChat(chatId)).filter((r) => (r.revokedAt || r.editedAt) && t - r.savedAt <= LIMITS.maxAgeMs)
          .sort((a, b) => b.t - a.t).map(meta);
      },
      async clear() { await backend.clear(); },
      prune,
    };
  }

  window.TspDeleted = Object.freeze({ LIMITS, KINDS, recordOf, wantsMedia, sizeOf, memoryBackend, idbBackend, createStore, meta });
})();
