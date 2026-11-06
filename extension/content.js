// Painel lateral com a biblioteca da aba WhatsApp do ERP, dentro do WhatsApp Web.
// Nunca envia mensagens sozinho: só preenche a caixa de texto ou abre a prévia do anexo.
(() => {
  if (window.__tspWaLoaded) return;
  window.__tspWaLoaded = true;

  const PANEL_W    = 360;
  const BAR_H      = 34; // barra de etiquetas do WhatsApp Business, no topo
  const ACCENT     = '#f97316';
  const REFRESH_MS = 5 * 60 * 1000;
  const VERSION    = (() => { try { return chrome.runtime.getManifest().version; } catch { return '?'; } })();

  // ── Ícones (traços no estilo lucide) ───────────────────────────────────────

  const ICONS = {
    zap:       '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    money:     '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    trend:     '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    image:     '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    eye:       '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    send:      '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    search:    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    refresh:   '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    x:         '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevron:   '<path d="m9 18 6-6-6-6"/>',
    sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon:      '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    monitor:   '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    activity:  '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    check:     '<path d="M20 6 9 17l-5-5"/>',
    alert:     '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    copy:      '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    back:      '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    wifiOff:   '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
    tag:       '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    mic:       '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    chat:      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    board:     '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/>',
    more:      '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    gear:      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    apps:      '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    clock:     '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    repeat:    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    inbox:     '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    texto:     '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/>',
    audio:     '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    imagem:    '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    video:     '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/>',
    documento: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  };

  // Mesmos rótulos e cores da página WhatsApp do ERP
  const TYPES = {
    texto:     { label: 'Texto',     color: '#22c55e' },
    audio:     { label: 'Áudio',     color: '#a855f7' },
    imagem:    { label: 'Imagem',    color: '#3b82f6' },
    video:     { label: 'Vídeo',     color: '#ef4444' },
    documento: { label: 'Documento', color: '#eab308' },
  };

  const FILTERS = [
    ['tudo', 'Tudo'], ['mais_usadas', 'Mais usadas'], ['texto', 'Texto'], ['audio', 'Áudio'],
    ['imagem', 'Imagem'], ['video', 'Vídeo'], ['documento', 'Documento'],
  ];

  // Cor de acento por categoria (escolhida pelo id, então não muda entre aberturas)
  const CAT_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#ef4444', '#06b6d4'];

  const THEME_PREFS = {
    auto:  { label: 'automático', icon: 'monitor', next: 'light' },
    light: { label: 'claro',      icon: 'sun',     next: 'dark'  },
    dark:  { label: 'escuro',     icon: 'moon',    next: 'auto'  },
  };

  const MIME_BY_EXT = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
    pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  // Seletores do WhatsApp Web com alternativas, do mais específico ao mais genérico
  const SEL = {
    conversation: ['#main', '[data-testid="conversation-panel-wrapper"]', '[data-testid="conversation-panel"]'],
    composer: [
      'footer div[contenteditable="true"][role="textbox"]',
      'footer div[contenteditable="true"][data-tab]',
      'footer div[contenteditable="true"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    contact: [
      'header [data-testid="conversation-info-header-chat-title"]',
      'header span[dir="auto"][title]',
      'header span[dir="auto"]',
      'header div[role="button"] span',
    ],
    caption: [
      '[data-testid="media-caption-input-container"] [contenteditable="true"]',
      'div[contenteditable="true"][aria-label*="legenda" i]',
      'div[contenteditable="true"][aria-placeholder*="legenda" i]',
      'div[contenteditable="true"][aria-label*="caption" i]',
      'div[contenteditable="true"][aria-placeholder*="caption" i]',
    ],
    // Mensagens da conversa aberta: o data-id traz o id do chat (ex.: false_5511999999999@c.us_ABC)
    messageIds: [
      '[data-id*="@c.us"], [data-id*="@g.us"]',
      '[data-id*="@"]',
    ],
    // Gravação de mensagem de voz (rodapé da conversa). O botão de gravar só aparece com a caixa vazia.
    micButton: [
      'button[aria-label*="mensagem de voz" i]', '[role="button"][aria-label*="mensagem de voz" i]',
      'button[aria-label*="voice message" i]', '[role="button"][aria-label*="voice message" i]',
      'button[aria-label*="mensaje de voz" i]', '[role="button"][aria-label*="mensaje de voz" i]',
      'button[aria-label*="gravar" i]', 'button[aria-label*="record" i]', 'button[aria-label*="grabar" i]',
      '[data-icon="ptt"]', '[data-icon="mic-outlined"]', '[data-icon="mic"]', '[data-icon="microphone"]',
    ],
    pauseButton: [
      'button[aria-label*="pausar" i]', '[role="button"][aria-label*="pausar" i]',
      'button[aria-label*="pause" i]', '[role="button"][aria-label*="pause" i]',
      '[data-icon="ptt-pause"]', '[data-icon="pause"]', '[data-icon*="pause"]',
    ],
    discardButton: [
      'button[aria-label*="descartar" i]', '[role="button"][aria-label*="descartar" i]',
      'button[aria-label*="discard" i]', 'button[aria-label*="excluir" i]', 'button[aria-label*="apagar" i]',
      'button[aria-label*="delete" i]', 'button[aria-label*="eliminar" i]',
      '[data-icon="delete"]', '[data-icon*="trash"]', '[data-icon*="delete"]',
    ],
    // Caixa "Pesquisar" da lista de conversas (coluna da esquerda)
    search: [
      '#side div[contenteditable="true"][role="textbox"]',
      '#side div[contenteditable="true"][data-tab="3"]',
      '#side div[contenteditable="true"]',
      '#side input[type="text"], #side input[role="textbox"], #side input:not([type])',
      'div[contenteditable="true"][data-tab="3"]',
      'input[aria-label*="pesquis" i], input[aria-label*="search" i]',
    ],
  };

  // Textos do cabeçalho da conversa que não são o nome do contato
  const NOT_A_NAME = /^(online|digitando|gravando|typing|recording|visto por último|last seen|clique|click)/i;
  const VAR_RE = /(\{[^{}\s]+\})/g;
  const IS_VAR = /^\{[^{}\s]+\}$/;

  // ── Estado ─────────────────────────────────────────────────────────────────

  const state = {
    open: false, view: 'list', section: 'mensagens', themePref: 'auto', bridgeOk: null, waStatus: null, waStatusAt: 0,
    // Barra-menu do topo: waLabels = etiquetas do WhatsApp (null enquanto indisponíveis; só ids, nomes, cores e números)
    // family = qual família a barra e o Quadro mostram: 'whatsapp' ou 'crm'
    barHiddenByUser: false, waLabels: null, family: 'whatsapp',
    // Colunas novas do banco (migration 20261031120000): true/false, null = ainda não testado
    schema: { hidden: null, notes: null },
    categories: [], items: [], loaded: false, source: null, syncedAt: null,
    partsAvailable: null, // tabela wa_item_parts existe? (null = ainda não sabemos)
    syncing: false, offline: false, error: null, lastSyncError: null,
    search: '', filter: 'tudo', collapsed: {}, previewId: null, busyId: null, lastUsed: '',
    ctx: null,
    // Etiquetas
    labels: [], labelsLoaded: false, labelsSource: null, labelsSyncedAt: null, labelsError: null,
    convKey: null, convLabelIds: [], convLoading: false, convError: false, menuOpen: false,
  };
  // Aba Etiquetas: contadores e lista de clientes da etiqueta aberta
  const lt = {
    counts: null, countsAt: null, countsError: null,
    openId: null, clients: [], hasMore: false, loading: false, error: null, search: '',
    reqId: 0, rowsSig: '', timer: null, searchTimer: null, hintTimer: null,
  };
  // Seção Etiquetas do painel, parte do WhatsApp: id da conversa aberta e etiquetas nativas dela (só na memória)
  const wt = { chatId: null, kind: null, labelIds: [], loading: false, error: false, busy: false, req: 0, timer: null };
  // Seção Etiquetas do painel: nota da conversa aberta, edição de etiqueta, cópia do WhatsApp
  const crm = {
    open: false, edit: null, busy: false, dragId: null, showNew: false, newColor: null, // open = seção Etiquetas visível
    note: { key: null, text: '', saved: '', available: null, loading: false, saving: false, error: false, msg: '', req: 0 },
    copy: { waId: '', dest: '__new', preview: null, previewReq: 0, running: false, stop: false, phase: '', done: 0, total: 0, result: '' },
    exportUrl: null,
  };
  const convCache   = new Map(); // key do contato -> ids das etiquetas
  let convTimer     = null;
  let pendingLabelOps = 0;
  const fileCache   = new Map(); // "id|url" -> Promise<Blob>
  const previewUrls = new Map(); // "id|url" -> blob: URL
  let refreshTimer = null;
  let contextTimer = null;

  // ── Utilitários ────────────────────────────────────────────────────────────

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function svg(name, cls = '') {
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  }

  function iconButton(icon, label, onClick, cls = '') {
    const b = el('button', `icon-btn ${cls}`);
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = svg(icon);
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
    return b;
  }

  function setIcon(button, icon) {
    button.innerHTML = svg(icon);
  }

  function formatSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function timeStr(ts) {
    return ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
  }

  function firstWords(text, n = 9) {
    const words = (text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    return words.slice(0, n).join(' ') + (words.length > n ? '…' : '');
  }

  function catColor(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CAT_COLORS[h % CAT_COLORS.length];
  }

  function isVisible(node) {
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // 2.1.0: {nome} e {, nome} (somem sem nome); a regra fica em engine.js (TspEngine.fillName)
  function fillVars(text, firstName) {
    return globalThis.TspEngine.fillName(text, firstName);
  }

  // Escreve o texto com variáveis não resolvidas destacadas; devolve quantas sobraram
  function appendResolved(target, text, firstName) {
    let unresolved = 0;
    fillVars(text, firstName).split(VAR_RE).forEach((part) => {
      if (IS_VAR.test(part)) { unresolved++; target.appendChild(el('span', 'var', part)); }
      else if (part) target.appendChild(document.createTextNode(part));
    });
    return unresolved;
  }

  // ── Comunicação com o background ───────────────────────────────────────────

  const INVALIDATED_MSG = 'A extensão foi atualizada. Recarregue o WhatsApp (F5).';

  // 2.4.1: pedidos que criam/ativam trabalho do motor → ele confere já (sem esperar a verificação de 2 min)
  const ENGINE_POKE = new Set(['createSchedule', 'saveFlow', 'setFlowActive', 'saveCampaign', 'startCampaign', 'campaignAction', 'saveAutomation', 'setAutomationActive', 'updateEngineSettings', 'enrollContact', 'leaveAutomation']);
  let enginePoke = null;

  function call(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const fail = (msg) => reject(new Error(/context invalidated/i.test(msg) ? INVALIDATED_MSG : msg));
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          const err = chrome.runtime.lastError;
          if (err) return fail(err.message);
          if (!res) return fail('Sem resposta da extensão');
          if (res.ok && enginePoke && ENGINE_POKE.has(type)) { try { enginePoke(); } catch { /* motor */ } }
          res.ok ? resolve(res.data) : fail(res.error);
        });
      } catch (e) {
        fail(String((e && e.message) || e));
      }
    });
  }

  function storageSet(obj) {
    try { chrome.storage.local.set(obj); } catch { /* extensão recarregada */ }
  }

  function saveCache() {
    storageSet({ library: { categories: state.categories, items: state.items, savedAt: state.syncedAt } });
  }

  // ── WhatsApp Web: conversa aberta, contato e caixas de texto ───────────────

  function findConversation() {
    for (const s of SEL.conversation) {
      const node = document.querySelector(s);
      if (node && isVisible(node)) return { root: node, via: s };
    }
    for (const box of document.querySelectorAll('footer [contenteditable="true"]')) {
      if (!box.closest('#side') && isVisible(box)) return { root: box.closest('footer').parentElement, via: 'footer' };
    }
    return null;
  }

  function findComposer(root) {
    for (let i = 0; i < SEL.composer.length; i++) {
      for (const node of root.querySelectorAll(SEL.composer[i])) {
        if (!node.closest('#side') && isVisible(node)) return { el: node, via: `seletor ${i + 1} de ${SEL.composer.length}` };
      }
    }
    return null;
  }

  function findContact(root) {
    for (let i = 0; i < SEL.contact.length; i++) {
      for (const node of root.querySelectorAll(SEL.contact[i])) {
        const text = (node.getAttribute('title') || node.textContent || '').trim();
        if (text && !NOT_A_NAME.test(text)) return { text, via: `seletor ${i + 1} de ${SEL.contact.length}` };
      }
    }
    return null;
  }

  // Nome salvo no CRM por conversa (só na memória; carregado com as etiquetas da conversa)
  const crmNames = new Map();
  // 2.8.3: "Nome para mensagens" (wa_chat_names): definido à mão → aprendido da SUA mensagem → vazio.
  // available false = tabela ainda não criada: o {nome} funciona como antes (nome do contato).
  const chatNames = { available: null, map: new Map(), current: null };

  function getContext() {
    const conv     = findConversation();
    const composer = conv ? findComposer(conv.root) : null;
    const contact  = conv ? findContact(conv.root) : null;
    const fullName = contact ? contact.text : '';
    const isNumber = !!fullName && /^[+\d\s().-]+$/.test(fullName);
    const identity = conv ? identifyConversation(conv.root, fullName) : null;
    const crmName = identity && identity.key && crmNames.has(identity.key) ? crmNames.get(identity.key) : null;
    return {
      conv, composer, contact, fullName, isNumber,
      // 2.8.3: {nome} = nome para mensagens desta conversa (à mão → aprendido → vazio). Sem a tabela: como antes
      // (2.1.0: CRM → WhatsApp, só nomes da lista de nomes comuns).
      firstName: chatNames.available === false
        ? globalThis.TspEngine.smartFirstName({ crmName, waName: isNumber ? '' : fullName })
        : ((chatNames.current && chatNames.map.has(chatNames.current) && chatNames.map.get(chatNames.current).name) || ''),
      identity,
    };
  }

  // Identifica a conversa aberta para as etiquetas:
  // 1) telefone no data-id das mensagens (<dígitos>@c.us; @g.us = grupo; @lid não é telefone)
  // 2) título do cabeçalho, se parecer telefone (10+ dígitos)
  // 3) só o nome
  function identifyConversation(root, title) {
    const cleanTitle = (title || '').trim().replace(/\s+/g, ' ');
    for (let i = 0; i < SEL.messageIds.length; i++) {
      const ids = [...root.querySelectorAll(SEL.messageIds[i])].map((n) => n.getAttribute('data-id') || '');
      if (!ids.length) continue;
      if (ids.some((id) => /@g\.us/i.test(id))) return { kind: 'group', via: 'data-id' };
      for (const id of ids) {
        const m = id.match(/(?:^|_)(\d{8,15})@c\.us/i);
        if (m) return makeIdentity('tel', m[1], cleanTitle, 'data-id das mensagens');
      }
    }
    const digits = cleanTitle.replace(/\D/g, '');
    if (/^[+\d\s().-]+$/.test(cleanTitle) && digits.length >= 10 && digits.length <= 15) {
      return makeIdentity('tel', digits, cleanTitle, 'título do cabeçalho');
    }
    if (cleanTitle) return makeIdentity('name', null, cleanTitle, 'nome');
    return { kind: 'none', via: 'falhou' };
  }

  function makeIdentity(kind, phone, title, via) {
    const name = title && !/^[+\d\s().-]+$/.test(title) ? title.slice(0, 100) : null;
    if (kind === 'tel') return { kind, key: `tel:${phone}`, phone, name, via };
    const asName = title.slice(0, 100);
    return { kind, key: `nome:${asName.toLowerCase()}`, phone: null, name: asName, via };
  }

  const canLabel = (identity) => !!identity && (identity.kind === 'tel' || identity.kind === 'name');

  async function insertText(box, text) {
    box.focus();
    await sleep(40);
    const before = box.innerText;
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(120);
    if (box.innerText !== before) return true;
    document.execCommand('insertText', false, text);
    await sleep(120);
    return box.innerText !== before;
  }

  // Espera a legenda da prévia do anexo: seletores conhecidos e, se não, qualquer caixa editável nova
  async function waitForCaption(before, composer, timeout) {
    const end = Date.now() + timeout;
    const usable = (node) => node !== composer && !before.has(node) && isVisible(node);
    while (Date.now() < end) {
      for (const s of SEL.caption) {
        for (const node of document.querySelectorAll(s)) if (usable(node)) return node;
      }
      for (const node of document.querySelectorAll('[contenteditable="true"]')) if (usable(node)) return node;
      await sleep(150);
    }
    return null;
  }

  async function attachFile(composer, file) {
    const before = new Set(document.querySelectorAll('[contenteditable="true"]'));
    const dt = new DataTransfer();
    dt.items.add(file);
    composer.focus();
    composer.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return waitForCaption(before, composer, 6000);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = el('textarea');
      ta.value = text;
      ta.style.cssText = 'position: fixed; opacity: 0; pointer-events: none;';
      shadow.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  // ── Arquivos ───────────────────────────────────────────────────────────────

  const fileKey = (item) => `${item.id}|${item.file_url}`;

  function base64ToBlob(base64, mime) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function guessMime(item, serverMime) {
    if (serverMime && serverMime !== 'application/octet-stream') return serverMime;
    const ext = ((item.file_name || item.file_url || '').split('.').pop() || '').toLowerCase();
    return MIME_BY_EXT[ext] || serverMime || 'application/octet-stream';
  }

  function getFile(item) {
    const key = fileKey(item);
    if (!fileCache.has(key)) {
      const p = call('fetchFile', { url: item.file_url }).then((d) => base64ToBlob(d.base64, guessMime(item, d.mime)));
      p.catch(() => fileCache.delete(key));
      fileCache.set(key, p);
    }
    return fileCache.get(key);
  }

  async function getBlobUrl(item) {
    const key = fileKey(item);
    if (!previewUrls.has(key)) previewUrls.set(key, URL.createObjectURL(await getFile(item)));
    return previewUrls.get(key);
  }

  // 2.7.1: miniaturas só carregam quando aparecem na tela (o arquivo fica em cache em fileCache/previewUrls)
  const HAS_IO = typeof IntersectionObserver === 'function';
  let lazyIO = null;
  const lazyFns = new WeakMap();
  function whenVisible(node, fn) {
    if (!HAS_IO) { fn(); return; }
    if (!lazyIO) {
      lazyIO = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          lazyIO.unobserve(e.target);
          const f = lazyFns.get(e.target);
          lazyFns.delete(e.target);
          if (f) f();
        }
      }, { rootMargin: '150px' });
    }
    lazyFns.set(node, fn);
    lazyIO.observe(node);
  }
  const mediaDur = new Map(); // file_url -> duração do áudio (s)
  const fmtDur = (sec) => { const t = Math.max(0, Math.round(sec)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const videoSrc = (url) => `${url}#t=0.1`; // primeiro quadro

  // ── Shadow DOM e layout ────────────────────────────────────────────────────

  // Remove sobras de uma versão anterior da extensão na mesma página
  document.getElementById('tsp-wa-host')?.remove();
  document.getElementById('tsp-wa-layout')?.remove();

  // Empurra o WhatsApp para a esquerda quando o painel está aberto
  const layoutStyle = document.createElement('style');
  layoutStyle.id = 'tsp-wa-layout';
  layoutStyle.textContent = `
    html.tsp-wa-open body { width: calc(100% - var(--tsp-pw, ${PANEL_W}px)) !important; min-width: 0 !important; }
    html.tsp-wa-open #app { max-width: calc(100vw - var(--tsp-pw, ${PANEL_W}px)) !important; }
    html.tsp-wa-open, html.tsp-wa-open body { overflow-x: hidden !important; }
    html.tsp-wa-resizing, html.tsp-wa-resizing * { user-select: none !important; -webkit-user-select: none !important; cursor: col-resize !important; }
    html.tsp-wa-bar #app { margin-top: ${BAR_H}px !important; height: calc(100% - ${BAR_H}px) !important; max-height: calc(100vh - ${BAR_H}px) !important; }
  `;

  const host = document.createElement('div');
  host.id = 'tsp-wa-host';
  host.style.cssText = 'all: initial; position: fixed; top: 0; right: 0; width: 0; height: 0; z-index: 2147483000;';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      /* ═══ 2.8.0: sistema visual (tokens). Todas as telas usam só estes valores. ═══
         Texto: 4 tamanhos (11/12/13/15). Espaço: múltiplos de 4. Cantos: 4/6/8/12/pílula. */
      .root {
        --accent: ${ACCENT}; --accent-strong: #ea580c; --accent-soft: rgba(249,115,22,.12); --accent-ring: rgba(249,115,22,.40); --on-accent: #ffffff;
        --fs-1: 11px; --fs-2: 12px; --fs-3: 13px; --fs-4: 15px; --fs-icon: 22px;
        --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px; --s-6: 24px;
        --r-xs: 4px; --r-sm: 6px; --r-md: 8px; --r-lg: 12px; --r-pill: 999px;
        --hit: 28px; --field-h: 32px; --wa-green: #25d366; --pw: ${PANEL_W}px;
        font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: var(--fs-3); line-height: 1.4; -webkit-font-smoothing: antialiased;
      }
      .root.light {
        --bg: #ffffff; --bg2: #f0f2f5; --card: #ffffff; --fg: #111b21; --fg2: #3b4a54; --muted: #667781; --border: #e4e8eb; --border-strong: #cfd6db;
        --hover: #f5f6f6; --shadow: rgba(11,20,26,.12); --sk1: #eef0f2; --sk2: #f8f9fa; --bubble: #d9fdd3;
        --accent-text: #c2410c; --ok: #15803d; --ok-soft: rgba(34,197,94,.13); --warn: #b45309; --warn-soft: rgba(245,158,11,.15); --err: #dc2626; --err-soft: rgba(239,68,68,.11);
        --sh-1: 0 1px 2px rgba(11,20,26,.07); --sh-2: 0 4px 12px rgba(11,20,26,.10); --sh-3: 0 12px 32px rgba(11,20,26,.18);
      }
      .root.dark {
        --bg: #111b21; --bg2: #1f2c33; --card: #1a252c; --fg: #e9edef; --fg2: #c5ced3; --muted: #8696a0; --border: #2a3942; --border-strong: #3b4a54;
        --hover: #202c33; --shadow: rgba(0,0,0,.45); --sk1: #1f2c34; --sk2: #2a3942; --bubble: #005c4b;
        --accent-soft: rgba(249,115,22,.17); --accent-text: #fb923c; --ok: #4ade80; --ok-soft: rgba(74,222,128,.14); --warn: #fbbf24; --warn-soft: rgba(251,191,36,.14); --err: #f87171; --err-soft: rgba(248,113,113,.15);
        --sh-1: 0 1px 2px rgba(0,0,0,.4); --sh-2: 0 4px 12px rgba(0,0,0,.45); --sh-3: 0 12px 32px rgba(0,0,0,.6);
      }
      * { box-sizing: border-box; }
      button { font: inherit; cursor: pointer; color: inherit; }
      button:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; display: block; }
      svg.fill { fill: currentColor; stroke: none; }

      /* Botão do raio */
      .toggle {
        position: fixed; top: 0; left: calc(50% - 20px); width: 40px; height: 22px; padding: 0 ;
        border: none; border-radius: 0 0 var(--r-lg) var(--r-lg) ; background: var(--accent); color: var(--on-accent);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 6px var(--shadow); transition: left .22s ease, height .15s ease;
      }
      .toggle:hover { height: 27px; }
      .toggle svg { width: 13px; height: 13px; }
      .root.open .toggle { left: calc((100% - var(--pw)) / 2 - 20px); }

      /* Painel */
      .panel {
        position: fixed; top: 0; right: 0; width: var(--pw); height: 100vh;
        background: var(--bg); color: var(--fg); border-left: 1px solid var(--border);
        display: flex; flex-direction: column; box-shadow: -2px 0 12px var(--shadow);
        transform: translateX(100%); visibility: hidden; transition: transform .22s ease, visibility .22s;
      }
      .root.open .panel { transform: none; visibility: visible; }

      .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 8px 12px 16px ; }
      .brand { display: flex; align-items: center; gap: 8px ; font-weight: 700; font-size: var(--fs-4); letter-spacing: -.01em; }
      .logo { width: 26px; height: 26px; border-radius: var(--r-sm) ; background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px var(--accent-ring); }
      .logo svg { width: 13px; height: 13px; }
      .actions { display: flex; gap: 1px ; }

      .icon-btn { width: 30px; height: 30px; padding: 0 ; border: none; border-radius: var(--r-sm) ; background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; transition: background .15s, color .15s, opacity .15s; }
      .icon-btn:hover { background: var(--bg2); color: var(--fg); }
      .icon-btn:disabled { opacity: .35; cursor: default; }
      .icon-btn.on { color: var(--accent-text); background: var(--accent-soft); }

      .status { display: flex; align-items: center; gap: 8px ; margin: 0 12px 8px ; padding: 8px 12px ; border-radius: var(--r-md) ; font-size: var(--fs-2); font-weight: 500; transition: background .2s, color .2s; }
      .status .dot { width: 7px; height: 7px; border-radius: 50% ; background: currentColor; flex-shrink: 0; }
      .status .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .status.ok { background: var(--ok-soft); color: var(--ok); }
      .status.warn { background: var(--warn-soft); color: var(--warn); }

      .tools { border-bottom: 1px solid var(--border); }
      .panel.diag .tools { display: none; }
      .search { margin: 0 12px 8px ; display: flex; align-items: center; gap: 8px ; padding: 0 12px ; border-radius: var(--r-md) ; background: var(--bg2); color: var(--muted); border: 1px solid transparent; transition: border-color .15s; }
      .search:focus-within { border-color: var(--accent); }
      .search input { flex: 1; min-width: 0; height: 34px; border: none; outline: none; background: transparent; color: var(--fg); font: inherit; }
      .search input::placeholder { color: var(--muted); }
      .filters { display: flex; flex-wrap: wrap; gap: 4px ; padding: 0 12px 12px ; }
      .chip { padding: 4px 12px ; border-radius: var(--r-pill) ; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: var(--fs-1); font-weight: 500; transition: all .15s; }
      .chip:hover { color: var(--fg); border-color: var(--muted); }
      .chip.active { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }

      .banner { display: flex; align-items: center; gap: 8px ; margin: 8px 12px 0 ; padding: 8px 12px ; border-radius: var(--r-md) ; background: var(--warn-soft); color: var(--warn); font-size: var(--fs-2); }
      .banner[hidden] { display: none; }
      .banner span { flex: 1; }
      .banner button { border: none; background: transparent; padding: 0 ; text-decoration: underline; font-size: var(--fs-2); color: inherit; }
      /* Conta (1.9.1): aviso fixo no topo enquanto não houver sessão */
      .auth { margin: 0 12px 8px ; padding: 8px 12px ; border-radius: var(--r-md) ; background: var(--warn-soft); color: var(--fg); font-size: var(--fs-2); }
      .auth[hidden] { display: none; }
      .auth-t { font-weight: 700; color: var(--warn); margin-bottom: 8px ; }
      .auth-f { display: flex; flex-direction: column; gap: 8px ; }
      .auth-f input { height: 30px; padding: 0 8px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--bg); color: var(--fg); font: inherit; outline: none; }
      .auth-f input:focus { border-color: var(--accent); }
      .auth-f .btn { margin-top: 0 ; justify-content: center; }
      .auth-err { color: var(--err); font-size: var(--fs-1); }
      .auth-err:empty { display: none; }

      .list { flex: 1; overflow-y: auto; padding: 8px 12px 12px ; scrollbar-width: thin; }
      .list > * { animation: fadeIn .18s ease both; }

      /* Categorias */
      .cat { margin-bottom: 8px ; border-radius: var(--r-lg) ; background: var(--bg2); border-left: 3px solid var(--cat); overflow: hidden; }
      .cat-head { width: 100%; display: flex; align-items: center; gap: 8px ; padding: 8px 12px ; border: none; background: transparent; font-weight: 650; font-size: var(--fs-2); text-align: left; }
      .cat-head:hover { background: color-mix(in srgb, var(--cat) 8%, transparent); }
      .cat-head .chev { width: 14px; height: 14px; color: var(--cat); transition: transform .2s ease; }
      .cat:not(.collapsed) .cat-head .chev { transform: rotate(90deg); }
      .cat-head .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .count { font-size: var(--fs-1); font-weight: 600; color: var(--cat); background: color-mix(in srgb, var(--cat) 15%, transparent); border-radius: var(--r-pill) ; padding: 1px 8px ; }
      .cat-body { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .22s ease; }
      .cat.collapsed .cat-body { grid-template-rows: 0fr; }
      .cat-inner { min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 4px ; padding: 0 8px 8px ; }
      .cat.collapsed .cat-inner { padding-bottom: 0 ; }

      /* Cartões */
      .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--r-md) ; transition: border-color .15s, box-shadow .15s; }
      .card:hover, .card:focus-within, .card.pv-open { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); box-shadow: 0 1px 4px var(--shadow); }
      .flat { display: flex; flex-direction: column; gap: 8px ; }
      .card-row { display: flex; align-items: center; gap: 8px ; padding: 8px 8px 8px 8px ; }
      .type { width: 30px; height: 30px; border-radius: var(--r-md) ; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .type svg { width: 15px; height: 15px; }
      .info { flex: 1; min-width: 0; }
      .info .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .info .sub { font-size: var(--fs-1); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px ; }
      .uses { font-size: var(--fs-1); font-weight: 600; color: var(--accent-text); background: var(--accent-soft); border-radius: var(--r-pill) ; padding: 1px 8px ; flex-shrink: 0; }
      .btns { display: flex; gap: 2px ; opacity: .5; transition: opacity .15s; }
      .card:hover .btns, .card:focus-within .btns, .card.pv-open .btns, .card.busy .btns { opacity: 1; }
      .btns .send { color: var(--accent-text); }
      /* Editor, menus e sequência (1.9.0) */
      .trow { display: flex; align-items: center; gap: 8px ; margin: 0 12px 8px ; }
      .trow .search { flex: 1; margin: 0 ; }
      .newitem { flex-shrink: 0; height: 36px; padding: 0 12px ; border-radius: var(--r-md) ; border: 1px solid var(--accent); background: var(--accent-soft); color: var(--accent-text); font-size: var(--fs-2); font-weight: 700; }
      .newitem:hover { background: var(--accent); color: var(--on-accent); }
      .panel.editing .tools, .panel.editing .banner { display: none; }
      .cat-top { display: flex; align-items: center; }
      .cat-top .cat-head { flex: 1; min-width: 0; }
      .cat-opts, .iopts { flex-shrink: 0; }
      .cat-opts { width: 26px; height: 26px; margin-right: 4px ; border: none; border-radius: var(--r-sm) ; background: transparent; color: var(--muted); font-size: var(--fs-4); line-height: 1; }
      .cat-opts:hover { background: var(--card); color: var(--fg); }
      .imenu { display: flex; flex-wrap: wrap; align-items: center; gap: 4px ; margin: 0 8px 8px ; padding: 8px ; border-radius: var(--r-md) ; background: var(--bg2); font-size: var(--fs-2); }
      .cat > .imenu { margin: 0 8px 8px ; background: var(--card); }
      .imenu button { padding: 4px 8px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--card); font-size: var(--fs-1); font-weight: 600; }
      .imenu button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-text); }
      .imenu button:disabled { opacity: .5; cursor: default; }
      .imenu button.danger { color: var(--err); }
      .imenu button.danger:hover:not(:disabled) { border-color: var(--err); color: var(--err); }
      .imenu .q { flex-basis: 100%; line-height: 1.4; }
      .imenu input { flex: 1; min-width: 120px; height: 28px; padding: 0 8px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--card); color: var(--fg); font: inherit; font-size: var(--fs-2); outline: none; }
      .imenu input:focus { border-color: var(--accent); }
      .seqbar { display: flex; align-items: center; gap: 8px ; margin: 0 12px 8px ; padding: 8px 12px ; border-radius: var(--r-md) ; background: var(--accent-soft); color: var(--fg); font-size: var(--fs-2); font-weight: 600; }
      .seqbar[hidden] { display: none; }
      .seqbar .seqtxt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .seqbar button { flex-shrink: 0; padding: 4px 12px ; border-radius: var(--r-sm) ; border: 1px solid var(--err); background: var(--card); color: var(--err); font-size: var(--fs-1); font-weight: 700; }
      .seqbar button:disabled { opacity: .5; cursor: default; }
      .editor { display: flex; flex-direction: column; gap: 8px ; font-size: var(--fs-2); }
      .ed-field { display: flex; flex-direction: column; gap: 4px ; font-size: var(--fs-1); font-weight: 600; color: var(--muted); }
      .ed-title, .ed-newcat, .ed-cat, .ed-part select { height: 32px; padding: 0 8px ; border-radius: var(--r-md) ; border: 1px solid var(--border); background: var(--card); color: var(--fg); font: inherit; font-size: var(--fs-2); outline: none; }
      .ed-title:focus, .ed-newcat:focus { border-color: var(--accent); }
      .ed-sub { margin-top: 4px ; font-size: var(--fs-1); font-weight: 700; letter-spacing: .04em; color: var(--muted); text-transform: uppercase; }
      .ed-part { display: flex; flex-direction: column; gap: 8px ; padding: 8px ; border-radius: var(--r-md) ; border: 1px solid var(--border); background: var(--card); }
      .ed-phead { display: flex; align-items: center; gap: 4px ; }
      .ed-phead b { flex: 1; font-size: var(--fs-2); }
      .ed-part select { height: 28px; font-size: var(--fs-2); }
      .ed-mini { padding: 4px 8px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--card); font-size: var(--fs-1); font-weight: 600; }
      .ed-mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-text); }
      .ed-mini:disabled { opacity: .4; cursor: default; }
      .ed-text, .ed-caption { width: 100%; resize: vertical; padding: 8px 8px ; border-radius: var(--r-md) ; border: 1px solid var(--border); background: var(--bg); color: var(--fg); font: inherit; font-size: var(--fs-2); outline: none; }
      .ed-text:focus, .ed-caption:focus { border-color: var(--accent); }
      .ed-count { align-self: flex-end; margin-top: -4px ; font-size: var(--fs-1); color: var(--muted); font-variant-numeric: tabular-nums; }
      .ed-file { display: flex; align-items: center; gap: 8px ; flex-wrap: wrap; }
      .ed-pick { position: relative; overflow: hidden; padding: 4px 12px ; border-radius: var(--r-sm) ; border: 1px dashed var(--accent); color: var(--accent-text); font-size: var(--fs-1); font-weight: 700; cursor: pointer; }
      .ed-pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
      .ed-fname { min-width: 0; font-size: var(--fs-1); color: var(--muted); word-break: break-all; }
      .ed-preview img, .ed-preview video { display: block; max-width: 100%; max-height: 160px; border-radius: var(--r-sm) ; }
      .ed-preview audio { width: 100%; }
      .ed-times { display: flex; flex-wrap: wrap; gap: 12px ; font-size: var(--fs-1); color: var(--muted); }
      .ed-num input { width: 56px; height: 26px; margin: 0 2px ; padding: 0 4px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--bg); color: var(--fg); font: inherit; font-size: var(--fs-2); }
      .ed-add { display: flex; flex-wrap: wrap; align-items: center; gap: 4px ; font-size: var(--fs-1); color: var(--muted); }
      .ed-note { font-size: var(--fs-1); color: var(--warn); }
      .ed-total { font-size: var(--fs-1); color: var(--muted); }
      .ed-msg { min-height: 1em; font-size: var(--fs-1); color: var(--muted); }
      .ed-msg.err { color: var(--err); }
      .ed-actions { display: flex; flex-wrap: wrap; gap: 8px ; }
      .ed-actions .btn { margin-top: 0 ; }
      .btn:disabled { opacity: .5; cursor: default; }
      .btns .send:hover { background: var(--accent-soft); color: var(--accent-text); }

      /* Prévia */
      .pv-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .22s ease; }
      .card.pv-open .pv-wrap { grid-template-rows: 1fr; }
      .pv-inner { min-height: 0; overflow: hidden; }
      .pv { margin: 0 8px 8px ; padding: 12px ; border-radius: var(--r-md) ; background: var(--bg2); display: flex; flex-direction: column; gap: 8px ; }
      .pv-media img, .pv-media video { width: 100%; max-height: 200px; object-fit: contain; border-radius: var(--r-sm) ; background: #000; display: block; }
      .pv-media audio { width: 100%; height: 36px; display: block; }
      .pv-media.loading { height: 90px; border-radius: var(--r-sm) ; }
      .pv-note { font-size: var(--fs-1); color: var(--muted); }
      .pv-doc { display: flex; align-items: center; gap: 8px ; padding: 8px 12px ; border-radius: var(--r-md) ; background: var(--card); border: 1px solid var(--border); font-size: var(--fs-2); word-break: break-all; }
      .bubble[contenteditable] { outline: none; cursor: text; }
      .bubble[contenteditable]:focus { box-shadow: 0 0 0 2px var(--accent); }
      .pv-part { font-size: var(--fs-1); font-weight: 700; color: var(--muted); align-self: flex-end; }
      .pv-name { border-color: var(--warn); }
      .bubble { align-self: flex-end; max-width: 100%; padding: 8px 8px ; border-radius: var(--r-md) 0 var(--r-md) var(--r-md) ; background: var(--bubble); color: var(--fg); white-space: pre-wrap; word-break: break-word; line-height: 1.45; font-size: var(--fs-2); box-shadow: 0 1px .5px var(--shadow); }
      .var { color: var(--accent-text); font-weight: 700; background: var(--accent-soft); border-radius: var(--r-xs) ; padding: 0 2px ; }

      /* Esqueleto */
      .sk-cat { margin-bottom: 8px ; padding: 12px ; border-radius: var(--r-lg) ; background: var(--bg2); display: flex; flex-direction: column; gap: 8px ; }
      .sk { border-radius: var(--r-sm) ; background: linear-gradient(90deg, var(--sk1) 25%, var(--sk2) 50%, var(--sk1) 75%); background-size: 200% 100%; animation: shimmer 1.3s linear infinite; }
      .sk-row { display: flex; align-items: center; gap: 8px ; padding: 8px ; border-radius: var(--r-md) ; background: var(--card); }
      .sk-ico { width: 30px; height: 30px; border-radius: var(--r-md) ; flex-shrink: 0; }
      .sk-lines { flex: 1; display: flex; flex-direction: column; gap: 8px ; }

      /* Estados vazio / erro */
      .empty { padding: 36px 20px ; text-align: center; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 8px ; }
      .empty svg { width: 30px; height: 30px; stroke-width: 1.5; opacity: .7; }
      .empty .h { color: var(--fg); font-weight: 600; font-size: var(--fs-3); }
      .empty .p { font-size: var(--fs-2); max-width: 240px; word-break: break-word; }
      .empty.error svg { color: var(--err); opacity: 1; }
      .btn { display: inline-flex; align-items: center; gap: 8px ; margin-top: 4px ; padding: 8px 16px ; border-radius: var(--r-md) ; border: 1px solid var(--border); background: var(--card); font-size: var(--fs-2); font-weight: 600; transition: border-color .15s, background .15s; }
      .btn:hover { border-color: var(--accent); }
      .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
      .btn.primary:hover { filter: brightness(1.06); }
      .btn svg { width: 14px; height: 14px; }

      /* Diagnóstico */
      .diag-head { display: flex; align-items: center; gap: 8px ; margin-bottom: 8px ; font-weight: 700; font-size: var(--fs-3); }
      .diag-list { display: flex; flex-direction: column; gap: 8px ; }
      .diag-row { display: flex; gap: 8px ; padding: 8px 12px ; border-radius: var(--r-md) ; background: var(--bg2); }
      .diag-ico { width: 20px; height: 20px; border-radius: 50% ; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px ; }
      .diag-ico svg { width: 12px; height: 12px; stroke-width: 3; }
      .diag-ico.ok { background: var(--ok-soft); color: var(--ok); }
      .diag-ico.warn { background: var(--warn-soft); color: var(--warn); }
      .diag-ico.fail { background: var(--err-soft); color: var(--err); }
      .diag-row .l { font-weight: 600; font-size: var(--fs-2); }
      .diag-row .v { font-size: var(--fs-1); color: var(--muted); word-break: break-word; margin-top: 1px ; }
      .diag-actions { display: flex; gap: 8px ; margin-top: 12px ; flex-wrap: wrap; }
      .diag-hint { font-size: var(--fs-1); color: var(--muted); margin-top: 12px ; }

      /* Etiquetas da conversa */
      .labels { position: relative; display: flex; align-items: flex-start; gap: 8px ; margin: -2px 12px 8px ; font-size: var(--fs-2); }
      .labels .lbl { flex-shrink: 0; color: var(--muted); font-weight: 600; padding-top: 4px ; }
      .labels .chips { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px ; align-items: center; min-height: 22px; }
      .labels .none { color: var(--muted); padding-top: 4px ; }
      .lchip { display: inline-flex; align-items: center; max-width: 100%; padding: 2px 8px ; border-radius: var(--r-pill) ; font-size: var(--fs-1); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: fadeIn .15s ease both; }
      .root.dark .lchip { box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
      .labels .add { width: 24px; height: 24px; border-radius: 50% ; border: 1px dashed var(--muted); background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0 ; transition: all .15s; }
      .labels .add:hover, .labels .add.on { border-style: solid; border-color: var(--accent); color: var(--accent-text); background: var(--accent-soft); }
      .labels .add svg { width: 13px; height: 13px; }
      .labels .add[hidden] { display: none; }
      .name-note { margin: -4px 12px 8px 72px ; font-size: var(--fs-1); color: var(--muted); }
      .name-note[hidden] { display: none; }
      .lmenu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 5; max-height: 280px; overflow-y: auto; padding: 4px ; border-radius: var(--r-lg) ; background: var(--card); border: 1px solid var(--border); box-shadow: 0 6px 20px var(--shadow); animation: fadeIn .15s ease both; }
      .lmenu[hidden] { display: none; }
      .lopt { width: 100%; display: flex; align-items: center; gap: 8px ; padding: 8px 8px ; border: none; border-radius: var(--r-sm) ; background: transparent; text-align: left; font-size: var(--fs-2); }
      .lopt:hover { background: var(--bg2); }
      .lopt .ldot { width: 11px; height: 11px; border-radius: 50% ; flex-shrink: 0; }
      .lopt .lname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lopt .lcheck { width: 15px; height: 15px; color: var(--accent-text); stroke-width: 3; }
      .lmenu .lempty { padding: 12px ; color: var(--muted); font-size: var(--fs-2); text-align: center; }

      /* Barra de etiquetas do WhatsApp (topo) */
      .toggle { z-index: 3; }
      .panel { z-index: 4; }
      .wabar { position: fixed; top: 0; left: 0; right: 0; height: ${BAR_H}px; z-index: 1; display: flex; align-items: center; gap: 8px ; padding: 0 8px 0 12px ; background: var(--bg); color: var(--fg); border-bottom: 1px solid var(--border); box-shadow: 0 1px 4px var(--shadow); font-size: var(--fs-2); }
      .wabar[hidden] { display: none; }
      .root.open .wabar { right: var(--pw); }
      .root.bar-on .toggle { top: ${BAR_H}px; }
      .wempty { color: var(--muted); font-size: var(--fs-1); }
      .wchips { flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; gap: 8px ; overflow-x: auto; overflow-y: hidden; white-space: nowrap; scrollbar-width: thin; }
      .wchip { flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px ; height: 24px; padding: 0 4px 0 8px ; border-radius: var(--r-pill) ; border: 1px solid var(--border); background: var(--card); font-size: var(--fs-1); font-weight: 700; letter-spacing: .02em; transition: border-color .15s, opacity .15s; }
      .wchip:hover { border-color: var(--accent); }
      .wchip.zero { opacity: .5; }
      .wchip.zero:hover { opacity: .8; }
      .wdot { width: 9px; height: 9px; border-radius: 50% ; flex-shrink: 0; }
      .wcount { min-width: 18px; padding: 1px 8px ; border-radius: var(--r-pill) ; background: var(--bg2); color: var(--muted); font-size: var(--fs-1); font-weight: 700; text-align: center; }
      .wclose { flex-shrink: 0; width: 22px; height: 22px; padding: 0 ; border: none; border-radius: var(--r-sm) ; background: transparent; color: var(--muted); font-size: var(--fs-4); line-height: 1; }
      .wclose:hover { background: var(--bg2); color: var(--fg); }

      /* Quadro de etiquetas */
      .board { position: fixed; top: 0; left: 64px; right: 0; bottom: 0; z-index: 2; display: flex; flex-direction: column; background: var(--bg2); color: var(--fg); border-left: 1px solid var(--border); box-shadow: 0 0 20px var(--shadow); outline: none; animation: fadeIn .15s ease both; }
      .board[hidden] { display: none; }
      .root.bar-on .board { top: ${BAR_H}px; }
      .root.open .board { right: var(--pw); }
      /* Menu de seções do painel */
      .pnav { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 2px ; margin: 0 8px 12px ; padding: 4px ; border-radius: var(--r-lg) ; background: var(--bg2); }
      .pnav button { display: flex; flex-direction: column; align-items: center; gap: 2px ; min-width: 0; padding: 4px 1px 4px ; border: none; border-radius: var(--r-md) ; background: transparent; color: var(--muted); font-size: var(--fs-1); font-weight: 600; line-height: 1.15; transition: background .15s, color .15s; }
      .pnav button svg { width: 16px; height: 16px; flex-shrink: 0; }
      .pnav button > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pnav button:hover:not([aria-disabled="true"]) { color: var(--fg); }
      .pnav button.on { background: var(--card); color: var(--accent-text); box-shadow: 0 1px 3px var(--shadow); }
      .pnav button[aria-disabled="true"] { opacity: .55; cursor: default; }
      .pnav .psoon { padding: 0 4px ; border-radius: var(--r-pill) ; background: var(--accent-soft); color: var(--accent-text); font-size: var(--fs-1); font-weight: 800; letter-spacing: .02em; text-transform: uppercase; }
      /* Seção Etiquetas (CRM) do painel */
      .ltab { display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 12px ; flex-direction: column; gap: 12px ; scrollbar-width: thin; }
      .ltab > * { flex-shrink: 0; }
      .panel.sec-labels .ltab { display: flex; }
      .panel.sec-labels .status, .panel.sec-labels .labels, .panel.sec-labels .name-note,
      .panel.sec-labels .tools, .panel.sec-labels .banner, .panel.sec-labels .list { display: none; }
      /* Seção Agendados */
      .stab { display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 12px ; flex-direction: column; gap: 12px ; scrollbar-width: thin; }
      .stab > * { flex-shrink: 0; }
      .panel.sec-sched .stab { display: flex; }
      .panel.sec-sched .status, .panel.sec-sched .labels, .panel.sec-sched .name-note,
      .panel.sec-sched .tools, .panel.sec-sched .banner, .panel.sec-sched .list { display: none; }
      .stab .crmsec { display: flex; flex-direction: column; gap: 8px ; }
      /* Seção Follows (2.0.0) */
      .ftab { display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 12px ; flex-direction: column; gap: 12px ; scrollbar-width: thin; }
      .ftab > * { flex-shrink: 0; }
      .panel.sec-follows .ftab { display: flex; }
      .panel.sec-follows .status, .panel.sec-follows .labels, .panel.sec-follows .name-note,
      .panel.sec-follows .tools, .panel.sec-follows .banner, .panel.sec-follows .list { display: none; }
      .ftab .crmsec { display: flex; flex-direction: column; gap: 8px ; }
      /* Seção Disparos (2.0.0) */
      .dtab { display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 12px ; flex-direction: column; gap: 12px ; scrollbar-width: thin; }
      .dtab > * { flex-shrink: 0; }
      .panel.sec-disparos .dtab { display: flex; }
      .panel.sec-disparos .status, .panel.sec-disparos .labels, .panel.sec-disparos .name-note,
      .panel.sec-disparos .tools, .panel.sec-disparos .banner, .panel.sec-disparos .list { display: none; }
      .dtab .crmsec { display: flex; flex-direction: column; gap: 8px ; }
      /* Seção Vendas (2.3.0) */
      .vtab { display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 12px ; flex-direction: column; gap: 12px ; scrollbar-width: thin; }
      .vtab > * { flex-shrink: 0; }
      .panel.sec-vendas .vtab { display: flex; }
      .panel.sec-vendas .labels, .panel.sec-vendas .name-note,
      .panel.sec-vendas .tools, .panel.sec-vendas .banner, .panel.sec-vendas .list { display: none; }
      .vtab .crmsec { display: flex; flex-direction: column; gap: 8px ; }
      .vd-results { display: flex; flex-direction: column; gap: 4px ; }
      .vd-prod { text-align: left; padding: 4px 8px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--card); font-size: var(--fs-2); }
      .vd-prod:hover { border-color: var(--accent); }
      .vd-total { font-size: var(--fs-3); }
      .vd-sale { width: 100%; text-align: left; border: none; }
      .vd-row { display: flex; align-items: center; gap: 8px ; }
      .vd-row .vd-sale { flex: 1; min-width: 0; }
      a.bbtn, a.ed-mini { text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
      .vd-erp { flex-shrink: 0; }
      .sale-quick { margin-left: auto ; flex-shrink: 0; padding: 1px 8px ; border-radius: var(--r-pill) ; border: 1px solid currentColor; background: transparent; color: inherit; font-size: var(--fs-1); font-weight: 700; }
      .sale-quick[hidden] { display: none; }
      .conv-quick { margin-left: 4px ; }
      /* Seção Conversões (2.4.0) */
      .ctab { display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 12px ; flex-direction: column; gap: 12px ; scrollbar-width: thin; }
      .ctab > * { flex-shrink: 0; }
      .panel.sec-conversoes .ctab { display: flex; }
      .panel.sec-conversoes .labels, .panel.sec-conversoes .name-note,
      .panel.sec-conversoes .tools, .panel.sec-conversoes .banner, .panel.sec-conversoes .list { display: none; }
      .ctab .crmsec { display: flex; flex-direction: column; gap: 8px ; }
      .cv-tech { font-size: var(--fs-1); color: var(--muted); word-break: break-word; }
      .cv-tech summary { cursor: pointer; font-weight: 600; }
      .ed-title.need { border-color: var(--err); box-shadow: 0 0 0 1px var(--err); }
      /* Seção Mídias (2.7.0) */
      .mtab { display: none; flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 12px ; flex-direction: column; gap: 12px ; scrollbar-width: thin; }
      .panel.sec-midias .mtab { display: flex; }
      .panel.sec-midias .labels, .panel.sec-midias .name-note,
      .panel.sec-midias .tools, .panel.sec-midias .banner, .panel.sec-midias .list { display: none; }
      .md-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px ; }
      .md-card { display: flex; flex-direction: column; gap: 4px ; padding: 4px ; border-radius: var(--r-lg) ; border: 1px solid var(--border); background: var(--card); color: var(--fg); text-align: left; cursor: pointer; font: inherit; }
      .md-card:hover { border-color: var(--accent); }
      .md-thumb { position: relative; aspect-ratio: 1; border-radius: var(--r-md) ; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--bg); font-size: var(--fs-icon); }
      .md-thumb.big { aspect-ratio: auto; min-height: 120px; max-height: 260px; }
      .md-thumb img, .md-thumb video { width: 100%; height: 100%; object-fit: cover; }
      .md-thumb.big img, .md-thumb.big video { object-fit: contain; max-height: 260px; }
      .md-name { font-size: var(--fs-2); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .md-size { font-size: var(--fs-1); color: var(--muted); }
      .md-drop { border: 1px dashed var(--border); border-radius: var(--r-lg) ; padding: 12px ; display: flex; flex-direction: column; gap: 8px ; }
      .md-drop.over { border-color: var(--accent); background: var(--card); }
      .md-quota { font-size: var(--fs-2); display: flex; flex-direction: column; gap: 4px ; }
      .md-qbar { height: 6px; border-radius: var(--r-xs) ; background: var(--border); overflow: hidden; }
      .md-qfill { height: 100%; background: var(--ok); }
      .md-quota.warn { color: var(--warn); } .md-quota.warn .md-qfill { background: var(--warn); }
      .md-quota.bad { color: var(--err); } .md-quota.bad .md-qfill { background: var(--err); }
      .md-up { font-size: var(--fs-2); } .md-up.err { color: var(--err); } .md-up.warn { color: var(--warn); }
      .ed-lib { cursor: pointer; }
      .md-pick { position: relative; display: flex; flex-direction: column; gap: 8px ; }
      .md-pbar { display: flex; gap: 8px ; }
      .md-pbar > * { flex: 1; min-width: 0; }
      .md-pick .md-grid { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px ; max-height: 260px; overflow-y: auto; scrollbar-width: thin; }
      .md-pcard { position: relative; display: flex; flex-direction: column; border-radius: var(--r-md) ; border: 1px solid var(--border); background: var(--card); }
      .md-pcard:hover, .md-pcard:focus-within { border-color: var(--accent); }
      .md-choose { display: flex; flex-direction: column; gap: 4px ; padding: 4px ; border: 0; background: transparent; text-align: left; min-width: 0; }
      .md-pick .md-thumb { font-size: var(--fs-icon); border-radius: var(--r-sm) ; }
      .md-pick .md-name { font-size: var(--fs-1); }
      .md-pick .md-size { font-size: var(--fs-1); }
      .md-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 26px; height: 26px; border-radius: 50% ; background: rgba(0,0,0,.55); color: #fff; font-size: var(--fs-1); display: flex; align-items: center; justify-content: center; pointer-events: none; }
      .md-dur { position: absolute; right: 4px; bottom: 3px; font-size: var(--fs-1); font-weight: 700; color: var(--muted); font-variant-numeric: tabular-nums; }
      .md-listen { position: absolute; top: 5px; left: 5px; width: 24px; height: 24px; padding: 0 ; border-radius: 50% ; border: 0; background: var(--accent); color: var(--on-accent); font-size: var(--fs-1); }
      .md-hov { position: absolute; top: 40px; right: 0; width: 58%; z-index: 6; padding: 8px ; border-radius: var(--r-lg) ; border: 1px solid var(--border); background: var(--card); box-shadow: 0 6px 20px var(--shadow); pointer-events: none; display: flex; flex-direction: column; gap: 4px ; }
      .md-hov.left { right: auto; left: 0; }
      .md-hov[hidden] { display: none; }
      .ed-docico { font-size: var(--fs-icon); }
      .ed-preview .md-ico { font-size: var(--fs-icon); }
      .fw-count { font-size: var(--fs-2); font-weight: 600; font-variant-numeric: tabular-nums; }
      .fw-card { display: flex; flex-direction: column; gap: 8px ; padding: 8px 12px ; border-radius: var(--r-lg) ; border: 1px solid var(--border); background: var(--bg2); font-size: var(--fs-2); text-align: left; }
      .fw-card.on { border-color: var(--accent); }
      .fw-new { align-items: center; color: var(--accent-text); font-weight: 700; border-style: dashed; background: transparent; }
      .fw-head { display: flex; align-items: center; gap: 8px ; }
      .fw-name { flex: 1; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .fw-badge { padding: 1px 8px ; border-radius: var(--r-pill) ; background: var(--card); color: var(--muted); font-size: var(--fs-1); font-weight: 800; letter-spacing: .04em; }
      .fw-badge.on { background: var(--ok-soft); color: var(--ok); }
      .fw-step { display: flex; gap: 8px ; }
      .fw-n { width: 17px; height: 17px; border-radius: 50% ; background: var(--accent-soft); color: var(--accent-text); font-size: var(--fs-1); font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .fw-txt { flex: 1; min-width: 0; line-height: 1.4; word-break: break-word; }
      .fw-arrow { text-align: center; color: var(--muted); font-size: var(--fs-2); }
      .fw-k { flex-shrink: 0; font-size: var(--fs-1); font-weight: 800; letter-spacing: .06em; color: var(--accent-text); min-width: 44px; }
      .fw-block { display: flex; flex-direction: column; gap: 8px ; padding: 8px ; border-radius: var(--r-md) ; border: 1px solid var(--border); }
      .fw-summary { font-size: var(--fs-1); }
      .fw-variant { display: flex; flex-direction: column; gap: 4px ; padding: 8px ; border-radius: var(--r-md) ; background: var(--bg2); }
      .fw-test { display: flex; flex-direction: column; gap: 4px ; padding: 8px 8px ; border-radius: var(--r-md) ; background: var(--bg2); font-size: var(--fs-2); }
      .fw-sim.ok .sc-prev { color: var(--ok); }
      .fw-sim.skip .sc-prev { color: var(--warn); }
      .foot-pause { flex-shrink: 0; padding: 2px 8px ; border-radius: var(--r-pill) ; border: 1px solid var(--border); background: var(--card); font-size: var(--fs-1); font-weight: 700; color: var(--fg); }
      .foot-pause.on { border-color: var(--accent); color: var(--accent-text); }
      .foot-pause[hidden] { display: none; }
      .sc-row { display: flex; flex-wrap: wrap; gap: 8px ; }
      .sc-row .ed-field { flex: 1; min-width: 110px; }
      .sc-radio { display: inline-flex; align-items: center; gap: 4px ; font-size: var(--fs-2); }
      .sc-radio input { margin: 0 ; accent-color: var(--accent); }
      .sc-item { display: flex; gap: 8px ; padding: 8px 8px ; border-radius: var(--r-md) ; background: var(--bg2); font-size: var(--fs-2); }
      .sc-main { flex: 1; min-width: 0; }
      .sc-who { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sc-prev { color: var(--muted); font-size: var(--fs-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sc-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px ; flex-shrink: 0; }
      .sc-when { font-size: var(--fs-1); font-variant-numeric: tabular-nums; }
      .sc-status { padding: 0 8px ; border-radius: var(--r-pill) ; background: var(--card); color: var(--muted); font-size: var(--fs-1); font-weight: 700; }
      .st-enviada .sc-status { color: var(--ok); }
      .st-falhou .sc-status, .st-expirada .sc-status { color: var(--err); }
      .st-enviando .sc-status { color: var(--accent-text); }
      .crm-intro { padding: 0 2px ; font-size: var(--fs-1); color: var(--muted); line-height: 1.4; }
      /* Seletor WhatsApp | CRM (barra e Quadro) */
      .wfam { flex-shrink: 0; display: inline-flex; padding: 2px ; border-radius: var(--r-md) ; background: var(--bg2); border: 1px solid var(--border); }
      .wfam button { height: 22px; padding: 0 8px ; border: none; border-radius: var(--r-sm) ; background: transparent; color: var(--muted); font-size: var(--fs-1); font-weight: 700; }
      .wfam button.on { background: var(--card); color: var(--accent-text); box-shadow: 0 1px 3px var(--shadow); }
      /* Seção Etiquetas (CRM) do painel: blocos */
      .crmsec { min-width: 0; padding: 12px ; border-radius: var(--r-lg) ; background: var(--bg); border: 1px solid var(--border); }
      .crm-sub { margin: 12px 2px 8px ; font-size: var(--fs-1); font-weight: 700; letter-spacing: .04em; color: var(--muted); }
      .crm-sub:first-of-type { margin-top: 2px ; }
      .crm-note { width: 100%; min-height: 76px; resize: vertical; padding: 8px 8px ; border-radius: var(--r-md) ; border: 1px solid var(--border); background: var(--card); color: var(--fg); font: inherit; font-size: var(--fs-2); outline: none; }
      .crm-note:focus { border-color: var(--accent); }
      .crm-note:disabled { opacity: .6; }
      .crm-noterow { display: flex; align-items: center; gap: 8px ; margin-top: 8px ; }
      .crm-notemsg { flex: 1; min-width: 0; font-size: var(--fs-1); color: var(--muted); }
      .crm-notemsg.warn { color: var(--warn); }
      .crm-notemsg.err { color: var(--err); }
      .crm-notemsg.ok { color: var(--ok); }
      .crm-count { font-size: var(--fs-1); color: var(--muted); font-variant-numeric: tabular-nums; }
      .bbtn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
      .bbtn.primary:hover { color: #fff; filter: brightness(1.06); }
      .bbtn:disabled { opacity: .5; cursor: default; }
      .crm-wa { margin-top: 12px ; padding-top: 4px ; border-top: 1px dashed var(--border); }
      .crm-wa[hidden] { display: none; }
      .lt-head { display: flex; align-items: center; }
      .lt-head .lt-row { flex: 1; min-width: 0; }
      .lt-grip { flex-shrink: 0; width: 18px; padding-left: 8px ; color: var(--muted); cursor: grab; user-select: none; font-size: var(--fs-3); }
      .lt-opts { flex-shrink: 0; width: 28px; height: 28px; margin-right: 4px ; border: none; border-radius: var(--r-sm) ; background: transparent; color: var(--muted); font-size: var(--fs-4); line-height: 1; }
      .lt-opts:hover, .lt-opts.on { background: var(--bg2); color: var(--fg); }
      .lt-item.is-hidden .lt-row { opacity: .55; }
      .lt-item.drop-before { box-shadow: 0 -2px 0 var(--accent); }
      .lt-item.drop-after { box-shadow: 0 2px 0 var(--accent); }
      .lt-tag { flex-shrink: 0; padding: 1px 8px ; border-radius: var(--r-pill) ; background: var(--bg2); color: var(--muted); font-size: var(--fs-1); font-weight: 700; }
      .lt-edit { display: flex; flex-wrap: wrap; align-items: center; gap: 8px ; padding: 8px 12px ; border-top: 1px solid var(--border); background: var(--bg2); font-size: var(--fs-2); }
      .lt-edit button { padding: 4px 8px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--card); font-size: var(--fs-1); font-weight: 600; }
      .lt-edit button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-text); }
      .lt-edit button:disabled { opacity: .45; cursor: default; }
      .lt-edit button.danger { color: var(--err); }
      .lt-edit button.danger:hover:not(:disabled) { border-color: var(--err); color: var(--err); }
      .lt-edit .q { flex-basis: 100%; line-height: 1.4; }
      .lt-edit input { flex: 1; min-width: 120px; height: 28px; padding: 0 8px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--card); color: var(--fg); font: inherit; font-size: var(--fs-2); outline: none; }
      .lt-edit input:focus { border-color: var(--accent); }
      .sw { width: 22px; height: 22px; padding: 0 !important; border-radius: 50% !important; border: 2px solid transparent !important; }
      .sw.on { border-color: var(--fg) !important; box-shadow: inset 0 0 0 2px var(--card); }
      .lt-export { display: flex; align-items: center; flex-wrap: wrap; gap: 8px ; margin-top: 8px ; font-size: var(--fs-1); color: var(--muted); }
      .lt-export a { color: var(--accent-text); font-weight: 700; }
      .crm-newbtn { width: 100%; margin-top: 8px ; padding: 8px ; border: 1px dashed var(--accent); border-radius: var(--r-md) ; background: transparent; color: var(--accent-text); font-size: var(--fs-2); font-weight: 700; }
      .crm-new { margin-top: 8px ; border-radius: var(--r-md) ; border: 1px solid var(--border); overflow: hidden; }
      .crm-new[hidden] { display: none; }
      .crm-tip { margin-top: 12px ; font-size: var(--fs-1); color: var(--muted); line-height: 1.45; }
      .cp-field { display: flex; flex-direction: column; gap: 4px ; margin-bottom: 8px ; font-size: var(--fs-1); font-weight: 600; color: var(--muted); }
      .cp-field select { height: 30px; padding: 0 8px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--card); color: var(--fg); font: inherit; font-size: var(--fs-2); }
      .cp-warn { margin: 2px 0 8px ; padding: 8px 8px ; border-radius: var(--r-md) ; background: var(--warn-soft); color: var(--warn); font-size: var(--fs-1); }
      .cp-warn[hidden], .cp-prog[hidden], .cp-result[hidden] { display: none; }
      .cp-prog { display: flex; align-items: center; gap: 8px ; margin-top: 8px ; font-size: var(--fs-1); }
      .cp-bar { flex: 1; height: 6px; border-radius: var(--r-pill) ; background: var(--bg2); overflow: hidden; }
      .cp-fill { height: 100%; width: 0; background: var(--accent); transition: width .2s; }
      .cp-result { margin-top: 8px ; padding: 8px 8px ; border-radius: var(--r-md) ; background: var(--ok-soft); color: var(--fg); font-size: var(--fs-2); line-height: 1.45; }
      .cp-result.err { background: var(--err-soft); color: var(--err); }
      .cp-off { font-size: var(--fs-2); color: var(--muted); }
      .bheader { position: relative; display: flex; align-items: center; gap: 12px ; padding: 12px 16px ; background: var(--bg); border-bottom: 1px solid var(--border); }
      .btitle { display: flex; flex-direction: column; min-width: 0; }
      .btitle b { font-size: var(--fs-4); }
      .btitle span { font-size: var(--fs-1); color: var(--muted); }
      .bstatus { flex: 1; min-width: 0; text-align: right; font-size: var(--fs-2); color: var(--err); }
      .bactions { display: flex; gap: 8px ; flex-shrink: 0; }
      .bbtn { height: 30px; padding: 0 12px ; border-radius: var(--r-md) ; border: 1px solid var(--border); background: var(--card); font-size: var(--fs-2); font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
      .bbtn:hover, .bbtn.on { border-color: var(--accent); color: var(--accent-text); }
      .bbtn.icon { width: 30px; padding: 0 ; }
      .bbtn svg { width: 14px; height: 14px; }
      .bcolsmenu { position: absolute; top: calc(100% + 4px); right: 14px; z-index: 3; width: 270px; max-height: 340px; overflow-y: auto; padding: 8px ; border-radius: var(--r-lg) ; background: var(--card); border: 1px solid var(--border); box-shadow: 0 6px 20px var(--shadow); }
      .bcolsmenu[hidden] { display: none; }
      .bopt { display: flex; align-items: center; gap: 8px ; padding: 8px 8px ; border-radius: var(--r-sm) ; font-size: var(--fs-2); cursor: pointer; }
      .bopt:hover { background: var(--bg2); }
      .bopt input { margin: 0 ; accent-color: var(--accent); }
      .boptname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .bopthint { padding: 8px 8px 2px ; font-size: var(--fs-1); color: var(--muted); }
      .bcols { flex: 1; min-height: 0; display: flex; gap: 12px ; padding: 12px ; overflow-x: auto; overflow-y: hidden; }
      .bcol { flex: 0 0 290px; display: flex; flex-direction: column; min-height: 0; border-radius: var(--r-lg) ; background: var(--bg); border: 1px solid var(--border); border-top: 3px solid var(--c); }
      .bhead { display: flex; align-items: center; gap: 8px ; padding: 12px 12px ; font-size: var(--fs-2); font-weight: 800; letter-spacing: .03em; border-bottom: 1px solid var(--border); }
      .bname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .bbody { flex: 1; min-height: 0; overflow-y: auto; padding: 8px ; display: flex; flex-direction: column; gap: 8px ; scrollbar-width: thin; }
      .bcard { flex-shrink: 0; display: flex; gap: 8px ; padding: 8px 12px ; border-radius: var(--r-md) ; background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--c); cursor: pointer; transition: border-color .15s, box-shadow .15s; }
      .bcard:hover, .bcard:focus-visible { border-color: var(--accent); border-left-color: var(--c); box-shadow: 0 1px 6px var(--shadow); }
      .bmain { flex: 1; min-width: 0; }
      .bcname { font-weight: 700; font-size: var(--fs-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bprev { margin-top: 2px ; min-height: 1.2em; font-size: var(--fs-1); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bside { display: flex; flex-direction: column; align-items: flex-end; gap: 4px ; flex-shrink: 0; }
      .bdate { font-size: var(--fs-1); color: var(--muted); white-space: nowrap; }
      .bunread { min-width: 18px; height: 18px; padding: 0 4px ; border-radius: var(--r-pill) ; background: var(--wa-green); color: #fff; font-size: var(--fs-1); font-weight: 700; display: flex; align-items: center; justify-content: center; }
      .bmsg { padding: 20px 8px ; text-align: center; font-size: var(--fs-2); color: var(--muted); }
      .bmsg button, .bmore { margin-top: 8px ; padding: 8px 12px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: var(--card); font-size: var(--fs-2); font-weight: 600; }
      .bmore { flex-shrink: 0; margin-top: 2px ; border-style: dashed; color: var(--accent-text); }
      .bmsg button:hover, .bmore:hover:not(:disabled) { border-color: var(--accent); }
      .bmore:disabled { color: var(--muted); cursor: default; }
      .bnote { flex-shrink: 0; padding: 8px 4px 2px ; text-align: center; font-size: var(--fs-1); color: var(--muted); }
      .bempty { padding: 32px ; font-size: var(--fs-3); color: var(--muted); }
      /* Quadro: trocar etiqueta (arrastar ou "Mover para…") */
      .bcard.busy { opacity: .45; pointer-events: none; }
      .bcard.dragging { opacity: .6; }
      .bcol.drop { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
      .bmove { padding: 1px 8px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: var(--fs-1); font-weight: 600; white-space: nowrap; }
      .bmove:hover, .bmove:focus-visible { color: var(--accent-text); border-color: var(--accent); }
      .bmovemenu { flex-shrink: 0; display: flex; flex-direction: column; gap: 2px ; margin-top: -2px ; padding: 4px ; border-radius: var(--r-md) ; background: var(--card); border: 1px solid var(--accent); box-shadow: 0 4px 14px var(--shadow); }
      .bmovemenu .bmovehint { padding: 4px 8px ; font-size: var(--fs-1); color: var(--muted); }
      .bmovemenu button { display: flex; align-items: center; gap: 8px ; padding: 8px 8px ; border: none; border-radius: var(--r-sm) ; background: transparent; text-align: left; font-size: var(--fs-2); font-weight: 600; }
      .bmovemenu button:hover, .bmovemenu button:focus-visible { background: var(--bg2); }
      .btoast { position: absolute; left: 50%; bottom: 16px; z-index: 4; max-width: calc(100% - 32px); transform: translateX(-50%); padding: 8px 12px ; border-radius: var(--r-md) ; font-size: var(--fs-2); box-shadow: 0 4px 16px var(--shadow); }
      .btoast[hidden] { display: none; }
      .btoast.ok { background: var(--card); color: var(--fg); border: 1px solid var(--ok); }
      .btoast.error { background: var(--err-soft); color: var(--err); border: 1px solid var(--err); }
      .tundo { margin-left: 8px ; padding: 2px 8px ; border-radius: var(--r-sm) ; border: 1px solid currentColor; background: transparent; color: inherit; font-size: var(--fs-1); font-weight: 700; }
      .tundo:hover:not(:disabled) { background: var(--accent-soft); }
      .tundo:disabled { opacity: .5; cursor: default; }

      /* Áudio como mensagem de voz */
      .asfile { padding: 0 8px ; height: 22px; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: var(--fs-1); font-weight: 600; white-space: nowrap; align-self: center; }
      .asfile:hover:not(:disabled) { color: var(--fg); border-color: var(--muted); }
      .asfile:disabled { opacity: .4; cursor: default; }
      .voice { margin: 0 12px 8px ; padding: 12px ; border-radius: var(--r-lg) ; background: var(--card); border: 1px solid var(--err); box-shadow: 0 2px 8px var(--shadow); animation: fadeIn .15s ease both; }
      .voice[hidden] { display: none; }
      .voice.prep { border-color: var(--border); }
      .vrow { display: flex; align-items: center; gap: 8px ; }
      .vmic { width: 28px; height: 28px; border-radius: 50% ; display: flex; align-items: center; justify-content: center; background: var(--err-soft); color: var(--err); flex-shrink: 0; }
      .voice:not(.prep) .vmic { animation: pulse 1.2s ease-in-out infinite; }
      .voice.prep .vmic { background: var(--bg2); color: var(--muted); }
      .vmic svg { width: 14px; height: 14px; }
      .vtxt { flex: 1; min-width: 0; }
      .vtxt b { display: block; font-size: var(--fs-2); }
      .vtime { font-size: var(--fs-1); color: var(--muted); font-variant-numeric: tabular-nums; }
      .vcancel { flex-shrink: 0; padding: 4px 12px ; border-radius: var(--r-sm) ; border: 1px solid var(--border); background: transparent; font-size: var(--fs-2); font-weight: 600; }
      .vcancel:hover { border-color: var(--err); color: var(--err); }
      .vbar { margin-top: 8px ; height: 4px; border-radius: var(--r-pill) ; background: var(--bg2); overflow: hidden; }
      .vfill { height: 100%; width: 0; background: var(--err); border-radius: var(--r-pill) ; transition: width .25s linear; }
      .voice.prep .vbar { display: none; }
      @keyframes pulse { 50% { transform: scale(1.12); opacity: .75; } }

      /* Etiquetas CRM (seção Etiquetas do painel) */
      .lt-sec { margin-bottom: 16px ; }
      .lt-title { font-size: var(--fs-1); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 2px 2px 8px ; }
      .lt-conv { padding: 12px ; border-radius: var(--r-lg) ; background: var(--bg2); }
      .lt-who { display: flex; align-items: center; gap: 8px ; font-weight: 600; font-size: var(--fs-3); margin-bottom: 8px ; min-width: 0; }
      .lt-who .dot { width: 7px; height: 7px; border-radius: 50% ; background: currentColor; flex-shrink: 0; }
      .lt-who .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lt-who.ok { color: var(--ok); }
      .lt-who.warn { color: var(--warn); }
      .lt-note { font-size: var(--fs-1); color: var(--muted); margin: -4px 0 8px ; }
      .lt-note[hidden] { display: none; }
      .tchips { display: flex; flex-wrap: wrap; gap: 4px ; transition: opacity .15s; }
      .tchips.loading { opacity: .6; }
      .tchip { --c: var(--accent); --on: #fff; display: inline-flex; align-items: center; gap: 4px ; max-width: 100%; padding: 4px 12px ; border-radius: var(--r-pill) ; font-size: var(--fs-1); font-weight: 600; background: transparent; color: var(--fg); border: 1.5px solid var(--c); transition: background .15s, color .15s, transform .1s; }
      .tchip:hover:not(:disabled) { background: color-mix(in srgb, var(--c) 15%, transparent); }
      .tchip:active:not(:disabled) { transform: scale(.96); }
      .tchip.on, .tchip.on:hover { background: var(--c); color: var(--on); }
      .tchip svg { width: 12px; height: 12px; stroke-width: 3; }
      .tchip .tdot { width: 8px; height: 8px; border-radius: 50% ; background: var(--c); flex-shrink: 0; }
      .tchip:disabled { opacity: .45; cursor: default; }
      .lt-none { font-size: var(--fs-2); color: var(--muted); }
      .lt-rows { display: flex; flex-direction: column; gap: 4px ; }
      .lt-item { border-radius: var(--r-md) ; border: 1px solid var(--border); background: var(--card); overflow: hidden; transition: border-color .15s; }
      .lt-item.open { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
      .lt-row { width: 100%; display: flex; align-items: center; gap: 8px ; padding: 8px 12px ; border: none; background: transparent; text-align: left; font-size: var(--fs-2); }
      .lt-row:hover { background: var(--hover); }
      .lt-row .ldot { width: 11px; height: 11px; border-radius: 50% ; flex-shrink: 0; }
      .lt-row .lname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
      .lt-row .chev { width: 14px; height: 14px; color: var(--muted); transition: transform .2s ease; }
      .lt-item.open .lt-row .chev { transform: rotate(90deg); }
      .lt-count { min-width: 24px; text-align: center; font-size: var(--fs-1); font-weight: 700; padding: 1px 8px ; border-radius: var(--r-pill) ; background: var(--bg2); color: var(--muted); }
      .lt-item.open .lt-count { background: var(--accent-soft); color: var(--accent-text); }
      .lt-body { padding: 0 8px 8px ; border-top: 1px solid var(--border); animation: fadeIn .15s ease both; }
      .lt-search { margin: 8px 0 8px ; display: flex; align-items: center; gap: 8px ; padding: 0 8px ; border-radius: var(--r-md) ; background: var(--bg2); color: var(--muted); border: 1px solid transparent; }
      .lt-search:focus-within { border-color: var(--accent); }
      .lt-search svg { width: 14px; height: 14px; }
      .lt-search input { flex: 1; min-width: 0; height: 30px; border: none; outline: none; background: transparent; color: var(--fg); font: inherit; font-size: var(--fs-2); }
      .lt-search input::placeholder { color: var(--muted); }
      .lt-clients { display: flex; flex-direction: column; gap: 1px ; }
      .lt-client { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 1px ; padding: 8px 8px ; border: none; border-radius: var(--r-sm) ; background: transparent; text-align: left; }
      .lt-client:hover { background: var(--bg2); }
      .lt-client .n { font-size: var(--fs-2); font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lt-client .p { font-size: var(--fs-1); color: var(--muted); }
      .lt-client .p.byname { font-style: italic; color: var(--warn); }
      .lt-more { width: 100%; margin-top: 4px ; padding: 8px ; border: 1px dashed var(--border); border-radius: var(--r-sm) ; background: transparent; color: var(--accent-text); font-size: var(--fs-2); font-weight: 600; }
      .lt-more:hover:not(:disabled) { border-color: var(--accent); }
      .lt-more:disabled { color: var(--muted); cursor: default; }
      .lt-msg { padding: 12px 8px ; font-size: var(--fs-2); color: var(--muted); text-align: center; }
      .lt-msg.err { color: var(--err); }
      .lt-msg button { margin-left: 8px ; border: none; background: transparent; padding: 0 ; color: inherit; text-decoration: underline; font-size: var(--fs-2); }
      .lt-sk { display: flex; flex-direction: column; gap: 8px ; padding: 8px 8px ; }
      .lt-hint { position: sticky; bottom: 0; margin-top: 12px ; padding: 8px 12px ; border-radius: var(--r-md) ; background: var(--card); border: 1px solid var(--accent); color: var(--fg); font-size: var(--fs-2); line-height: 1.45; box-shadow: 0 -4px 12px var(--bg); animation: fadeIn .15s ease both; }
      .lt-hint.warn { border-color: var(--warn); }
      .lt-hint[hidden] { display: none; }
      .lt-hint b { color: var(--accent-text); }
      .lt-hint.warn b { color: var(--warn); }
      .lt-hint .manual { margin-top: 4px ; font-weight: 600; word-break: break-word; }
      /* Aba Etiquetas: seção das etiquetas nativas do WhatsApp */
      .wt-head { font-size: var(--fs-1); font-weight: 800; letter-spacing: .08em; color: var(--fg); margin: 4px 2px 8px ; padding-bottom: 4px ; border-bottom: 1px solid var(--border); }
      .wt-head[hidden], .wt[hidden] { display: none; }
      .wt-who { display: flex; align-items: center; gap: 8px ; font-weight: 600; font-size: var(--fs-3); margin-bottom: 8px ; min-width: 0; }
      .wt-who.warn { color: var(--warn); }
      .wt-who span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .wt-chips { display: flex; flex-wrap: wrap; gap: 4px ; transition: opacity .15s; }
      .wt-chips.loading { opacity: .6; }
      .wtchip { --c: var(--accent); --on: #fff; display: inline-flex; align-items: center; gap: 4px ; max-width: 100%; padding: 4px 12px ; border-radius: var(--r-pill) ; font-size: var(--fs-1); font-weight: 600; background: transparent; color: var(--fg); border: 1.5px solid var(--c); transition: background .15s, color .15s; }
      .wtchip:hover:not(:disabled) { background: color-mix(in srgb, var(--c) 15%, transparent); }
      .wtchip.on, .wtchip.on:hover { background: var(--c); color: var(--on); }
      .wtchip svg { width: 12px; height: 12px; stroke-width: 3; }
      .wtchip .wdot { width: 8px; height: 8px; }
      .wtchip:disabled { opacity: .45; cursor: default; }
      .wt-none { font-size: var(--fs-2); color: var(--muted); }
      .wt-rows { display: flex; flex-direction: column; gap: 4px ; }
      .wt-row { width: 100%; display: flex; align-items: center; gap: 8px ; padding: 8px 12px ; border-radius: var(--r-md) ; border: 1px solid var(--border); background: var(--card); text-align: left; font-size: var(--fs-2); transition: border-color .15s; }
      .wt-row:hover { border-color: var(--accent); }
      .wt-row .wdot { width: 11px; height: 11px; }
      .wt-row .wtname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }

      /* Aviso e rodapé */
      .toast { margin: 0 12px ; max-height: 0; padding: 0 12px ; border-radius: var(--r-md) ; font-size: var(--fs-2); opacity: 0; overflow: hidden; transition: all .2s ease; }
      .toast.show { max-height: 80px; padding: 8px 12px ; margin-bottom: 8px ; opacity: 1; }
      .toast.info  { background: var(--bg2); color: var(--fg); }
      .toast.ok    { background: var(--ok-soft); color: var(--ok); }
      .toast.warn  { background: var(--warn-soft); color: var(--warn); }
      .toast.error { background: var(--err-soft); color: var(--err); }
      .foot { display: flex; align-items: center; gap: 8px ; padding: 8px 16px ; border-top: 1px solid var(--border); font-size: var(--fs-1); color: var(--muted); }
      .foot .last { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .foot b { color: var(--fg); font-weight: 600; }
      .foot .ver { flex-shrink: 0; font-size: var(--fs-1); opacity: .8; }

      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes shimmer { to { background-position: -200% 0; } }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(3px); } }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
      }

      /* ═══ 2.8.0: camada de componentes ═══ */
      .panel { background: var(--bg); border-left: 1px solid var(--border); box-shadow: var(--sh-3); }
      .panel ::-webkit-scrollbar { width: 8px; height: 8px; }
      .panel ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: var(--r-pill); border: 2px solid var(--bg); }
      .panel ::-webkit-scrollbar-track { background: transparent; }
      /* Foco visível no teclado */
      button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, a:focus-visible, summary:focus-visible, [tabindex]:focus-visible,
      .ed-pick:focus-within, .search:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
      .search:focus-within { outline-offset: 0; }
      /* Cabeçalho */
      .head { padding: var(--s-3) var(--s-2) var(--s-2) var(--s-4); min-height: 56px; }
      .brand { gap: var(--s-2); font-size: var(--fs-4); font-weight: 700; min-width: 0; }
      .brand-txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .logo { width: 28px; height: 28px; border-radius: var(--r-md); box-shadow: 0 2px 8px var(--accent-ring); }
      .actions { gap: 2px; }
      .icon-btn { width: 32px; height: 32px; border-radius: var(--r-md); }
      /* Menu de seções: uma linha + "Mais" */
      .pnav { display: flex; align-items: stretch; gap: 0; margin: 0 var(--s-2) var(--s-3); padding: var(--s-1); border-radius: var(--r-lg); background: var(--bg2); position: relative; }
      .pnav > button, .pmore-wrap { flex: 1 1 auto; min-width: 0; }
      .pmore-wrap { flex: 0 0 auto; }
      .pnav > button, .pmore { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--s-1); width: 100%; min-height: 48px; padding: var(--s-1) 2px; border: none; border-radius: var(--r-md); background: transparent; color: var(--muted); font-size: var(--fs-1); font-weight: 600; letter-spacing: -.01em; line-height: 1.2; transition: background .15s, color .15s, box-shadow .15s; }
      .pnav > button svg, .pmore svg { width: 18px; height: 18px; }
      .pnav > button > span, .pmore > span { white-space: nowrap; overflow: visible; text-overflow: clip; max-width: none; }
      .pnav > button:hover, .pmore:hover { color: var(--fg); background: color-mix(in srgb, var(--card) 60%, transparent); }
      .pnav > button.on, .pmore.on { background: var(--card); color: var(--accent-text); box-shadow: var(--sh-1), inset 0 -2px 0 var(--accent); }
      .pmore[aria-expanded="true"] { background: var(--card); color: var(--fg); }
      .pmore-wrap { position: relative; display: flex; }
      .pmore { padding: var(--s-1) var(--s-2); }
      .pmenu { position: absolute; top: calc(100% + var(--s-1)); right: 0; z-index: 8; width: 200px; padding: var(--s-1); border-radius: var(--r-lg); background: var(--card); border: 1px solid var(--border); box-shadow: var(--sh-3); display: flex; flex-direction: column; gap: 2px; animation: fadeIn .12s ease both; }
      .pmenu[hidden] { display: none; }
      .pmenu button { display: flex; flex-direction: row; justify-content: flex-start; width: 100%; align-items: center; gap: var(--s-3); min-height: 36px; padding: 0 var(--s-3); border: none; border-radius: var(--r-md); background: transparent; color: var(--fg); font-size: var(--fs-3); font-weight: 500; text-align: left; }
      .pmenu button svg { width: 18px; height: 18px; color: var(--muted); }
      .pmenu button:hover { background: var(--hover); }
      .pmenu button > span { max-width: none; overflow: visible; }
      .pmore { min-width: 44px; }
      .pmenu button.on { background: var(--accent-soft); color: var(--accent-text); font-weight: 600; }
      .pmenu button.on svg { color: var(--accent-text); }
      /* Faixa da conversa (status + botões 💰 📈 🔁): quebra linha, nunca corta */
      .status { flex-wrap: wrap; row-gap: var(--s-2); margin: 0 var(--s-3) var(--s-2); padding: var(--s-2) var(--s-3); border-radius: var(--r-md); font-size: var(--fs-2); }
      .status .txt { flex: 1 1 140px; }
      .qbtns { display: flex; flex-wrap: wrap; gap: var(--s-1); margin-left: auto; }
      .sale-quick, .sale-quick.conv-quick { margin: 0; min-height: var(--hit); padding: 0 var(--s-2); border-radius: var(--r-pill); border: 1px solid color-mix(in srgb, currentColor 45%, transparent); background: var(--card); color: var(--fg); font-size: var(--fs-1); font-weight: 600; white-space: nowrap; }
      .sale-quick:hover { border-color: var(--accent); color: var(--accent-text); }
      /* Títulos de seção (mesmo formato em todas as abas) */
      .wt-head, .crm-sub, .lt-title, .ed-sub { margin: var(--s-1) 0 var(--s-2); padding: 0 0 var(--s-1); font-size: var(--fs-1); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); }
      .crm-sub { border-bottom: none; padding-bottom: 0; }
      .diag-head { font-size: var(--fs-4); }
      .crm-intro { font-size: var(--fs-2); color: var(--muted); line-height: 1.5; padding: 0 var(--s-1); }
      /* Blocos e cartões */
      .ltab, .stab, .ftab, .dtab, .vtab, .ctab, .mtab { padding: 0 var(--s-3) var(--s-3); gap: var(--s-3); }
      .crmsec { padding: var(--s-3); border-radius: var(--r-lg); background: var(--card); border: 1px solid var(--border); box-shadow: var(--sh-1); }
      .stab .crmsec, .ftab .crmsec, .dtab .crmsec, .vtab .crmsec, .ctab .crmsec { gap: var(--s-2); }
      .card, .lt-item, .wt-row, .md-card, .md-pcard, .ed-part, .fw-block, .bcard { border-radius: var(--r-md); border-color: var(--border); }
      .card:hover, .wt-row:hover, .md-card:hover, .lt-item.open { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); box-shadow: var(--sh-2); }
      .cat { border-radius: var(--r-lg); }
      .sc-item, .fw-test, .fw-variant, .lt-conv, .diag-row { border-radius: var(--r-md); background: var(--bg2); }
      .sc-item { padding: var(--s-2) var(--s-3); min-height: 40px; align-items: center; }
      .fw-card { padding: var(--s-3); border-radius: var(--r-lg); background: var(--card); box-shadow: var(--sh-1); }
      .fw-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
      .fw-new { background: transparent; box-shadow: none; }
      /* Campos: rótulo em cima, mesma altura e borda */
      .ed-field, .cp-field { gap: var(--s-1); font-size: var(--fs-1); font-weight: 600; color: var(--fg2); }
      .ed-title, .ed-newcat, .ed-cat, .ed-part select, .cp-field select, .imenu input, .lt-edit input, .auth-f input, .vtab select, .vtab input[type="text"], .vtab input[type="number"], .vtab input:not([type]),
      .ctab select, .ctab input:not([type="checkbox"]):not([type="radio"]), .stab input:not([type="checkbox"]):not([type="radio"]), .stab select, .dtab select, .dtab input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),
      .ftab select, .ftab input:not([type="checkbox"]):not([type="radio"]), .mtab select, .mtab input[type="search"], .md-pick input, .md-pick select {
        min-height: var(--field-h); padding: 0 var(--s-2); border-radius: var(--r-md); border: 1px solid var(--border-strong); background: var(--card); color: var(--fg); font: inherit; font-size: var(--fs-2); outline: none; }
      .ed-text, .ed-caption, .crm-note, .vtab textarea, .ctab textarea, .stab textarea, .dtab textarea, .ftab textarea { padding: var(--s-2); border-radius: var(--r-md); border: 1px solid var(--border-strong); background: var(--card); color: var(--fg); font: inherit; font-size: var(--fs-2); line-height: 1.5; }
      input:focus, select:focus, textarea:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-soft); }
      .ed-num input { min-height: var(--hit); border-radius: var(--r-sm); border-color: var(--border-strong); }
      .search { height: var(--field-h); border-radius: var(--r-md); background: var(--bg2); border: 1px solid transparent; }
      .search input { height: 100%; font-size: var(--fs-2); }
      .lt-search { border-radius: var(--r-md); }
      ::placeholder { color: var(--muted); opacity: 1; }
      /* Botões: principal laranja, secundário neutro, perigo vermelho (área mínima 28px) */
      .btn, .bbtn, .ed-mini, .imenu button, .lt-edit button, .vcancel, .seqbar button, .bmsg button, .bmore, .lt-more, .crm-newbtn, .newitem, .ed-pick, .tundo, .wfam button, .cp-field button {
        min-height: var(--hit); border-radius: var(--r-md); font-size: var(--fs-2); font-weight: 600; transition: background .15s, border-color .15s, color .15s, box-shadow .15s; }
      .btn, .bbtn, .ed-mini, .imenu button, .lt-edit button, .vcancel, .bmsg button { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-1); padding: 0 var(--s-3); border: 1px solid var(--border-strong); background: var(--card); color: var(--fg); }
      .ed-mini { padding: 0 var(--s-2); }
      .btn:hover:not(:disabled), .bbtn:hover:not(:disabled), .ed-mini:hover:not(:disabled), .imenu button:hover:not(:disabled), .lt-edit button:hover:not(:disabled), .bmsg button:hover { border-color: var(--accent); color: var(--accent-text); background: var(--card); }
      .btn.primary, .bbtn.primary, .lt-edit button.crm-create { background: var(--accent-strong); border-color: var(--accent-strong); color: var(--on-accent); box-shadow: 0 1px 2px var(--accent-ring); }
      .btn.primary:hover:not(:disabled), .bbtn.primary:hover:not(:disabled), .lt-edit button.crm-create:hover:not(:disabled) { background: #c2410c; border-color: #c2410c; color: var(--on-accent); filter: none; }
      .imenu button.danger, .lt-edit button.danger, .bbtn.danger, .ed-mini.danger, .btn.danger { color: var(--err); border-color: color-mix(in srgb, var(--err) 45%, var(--border)); }
      .imenu button.danger:hover:not(:disabled), .lt-edit button.danger:hover:not(:disabled), .bbtn.danger:hover:not(:disabled), .ed-mini.danger:hover:not(:disabled), .btn.danger:hover:not(:disabled) { background: var(--err); border-color: var(--err); color: #fff; }
      .seqbar button, .vcancel:hover { color: var(--err); border-color: var(--err); }
      .btn:disabled, .bbtn:disabled, .ed-mini:disabled, .imenu button:disabled, .lt-edit button:disabled { opacity: .45; cursor: default; box-shadow: none; }
      .newitem { height: var(--field-h); padding: 0 var(--s-3); border-radius: var(--r-md); border: none; background: var(--accent-strong); color: var(--on-accent); box-shadow: 0 1px 2px var(--accent-ring); }
      .newitem:hover { background: #c2410c; color: var(--on-accent); }
      .ed-pick { display: inline-flex; align-items: center; padding: 0 var(--s-3); border-style: dashed; color: var(--accent-text); }
      .crm-newbtn, .lt-more, .bmore { min-height: 32px; border-radius: var(--r-md); color: var(--accent-text); }
      .ed-add, .ed-actions, .diag-actions { gap: var(--s-2); }
      a.bbtn, a.ed-mini, a.btn { text-decoration: none; }
      .wfam button { min-height: 24px; border-radius: var(--r-sm); }
      .cat-opts, .lt-opts, .iopts, .wclose, .btns .icon-btn { min-width: var(--hit); min-height: var(--hit); }
      .asfile { min-height: 24px; border-radius: var(--r-sm); }
      /* Etiquetas: mesmo chip para CRM e WhatsApp (fundo suave + texto legível) */
      .lchip, .tchip, .wtchip, .wchip { --chip-fg: color-mix(in srgb, var(--c, var(--accent)) 62%, var(--fg)); border-radius: var(--r-pill); font-size: var(--fs-1); font-weight: 600; line-height: 1.2; }
      .lchip { min-height: 22px; padding: 0 var(--s-2); background: color-mix(in srgb, var(--c, var(--accent)) 16%, var(--card)) !important; color: var(--chip-fg) !important; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c, var(--accent)) 38%, transparent); }
      .root.dark .lchip { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c, var(--accent)) 45%, transparent); }
      .tchip, .wtchip { min-height: var(--hit); padding: 0 var(--s-3) 0 var(--s-2); gap: var(--s-1); background: var(--card); color: var(--fg); border: 1px solid var(--border-strong); }
      .tchip:hover:not(:disabled), .wtchip:hover:not(:disabled) { background: color-mix(in srgb, var(--c) 10%, var(--card)); border-color: color-mix(in srgb, var(--c) 55%, var(--border)); }
      .tchip.on, .tchip.on:hover, .wtchip.on, .wtchip.on:hover { background: color-mix(in srgb, var(--c) 18%, var(--card)); color: var(--chip-fg); border-color: color-mix(in srgb, var(--c) 60%, transparent); }
      .tchip svg, .wtchip svg { color: var(--c); }
      .tchip .tdot, .wtchip .wdot { width: 8px; height: 8px; }
      .wchip { height: 28px; padding: 0 var(--s-1) 0 var(--s-2); background: var(--card); border-color: var(--border); color: var(--fg); }
      .wchip:hover { border-color: var(--accent); }
      .wcount, .lt-count, .count, .uses, .lt-tag, .fw-badge, .sc-status { border-radius: var(--r-pill); font-size: var(--fs-1); font-weight: 700; }
      .fw-badge.on { background: var(--ok-soft); color: var(--ok); }
      /* Estados vazios: ícone + frase (+ ação quando houver) */
      .lt-none, .wt-none, .bmsg { display: flex; flex-direction: column; align-items: center; gap: var(--s-2); padding: var(--s-5) var(--s-4); border: 1px dashed var(--border-strong); border-radius: var(--r-lg); color: var(--muted); font-size: var(--fs-2); text-align: center; line-height: 1.5; }
      .lt-none::before, .wt-none::before { content: ""; width: 28px; height: 28px; background: var(--muted); opacity: .55;
        -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 12h-6l-2 3h-4l-2-3H2'/%3E%3Cpath d='M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'/%3E%3C/svg%3E") center / contain no-repeat;
                mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 12h-6l-2 3h-4l-2-3H2'/%3E%3Cpath d='M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'/%3E%3C/svg%3E") center / contain no-repeat; }
      .lt-none.loading { border-style: solid; border-color: transparent; background: linear-gradient(90deg, var(--sk1) 25%, var(--sk2) 50%, var(--sk1) 75%); background-size: 200% 100%; animation: shimmer 1.3s linear infinite; color: var(--muted); min-height: 72px; justify-content: center; }
      .lt-none.loading::before { display: none; }
      .es-act { margin-top: var(--s-1); }
      .empty { padding: var(--s-6) var(--s-4); gap: var(--s-2); }
      .empty .h { font-size: var(--fs-3); }
      .empty .p { font-size: var(--fs-2); }
      /* Mensagens de sucesso / aviso / erro: mesmo formato */
      .ed-msg:not(:empty), .crm-notemsg:not(:empty), .md-up, .cp-result, .cp-warn, .auth-err:not(:empty) { padding: var(--s-2) var(--s-3); border-radius: var(--r-md); font-size: var(--fs-2); line-height: 1.45; border-left: 3px solid currentColor; }
      .ed-msg:not(:empty), .crm-notemsg:not(:empty), .md-up { background: var(--bg2); color: var(--fg2); }
      .ed-msg.err, .crm-notemsg.err, .md-up.err, .cp-result.err, .auth-err { background: var(--err-soft); color: var(--err); }
      .crm-notemsg.ok, .cp-result { background: var(--ok-soft); color: var(--ok); }
      .crm-notemsg.warn, .md-up.warn, .cp-warn { background: var(--warn-soft); color: var(--warn); }
      .ed-note { font-size: var(--fs-1); color: var(--warn); }
      .toast { border-radius: var(--r-md); font-size: var(--fs-2); }
      .toast.show { padding: var(--s-2) var(--s-3); border-left: 3px solid currentColor; box-shadow: var(--sh-1); }
      .banner { border-radius: var(--r-md); font-size: var(--fs-2); }
      /* Mídias */
      .md-grid { gap: var(--s-2); }
      .md-card { padding: var(--s-1); gap: var(--s-1); }
      .md-thumb { border-radius: var(--r-sm); background: var(--bg2); }
      .md-drop { padding: var(--s-3); border-radius: var(--r-lg); border-color: var(--border-strong); background: var(--bg2); }
      .md-drop.over { border-color: var(--accent); background: var(--accent-soft); }
      .md-qbar { height: 6px; border-radius: var(--r-pill); }
      /* Diagnóstico e rodapé */
      .diag-row { padding: var(--s-2) var(--s-3); }
      .foot { padding: var(--s-2) var(--s-4); font-size: var(--fs-1); background: var(--bg); }
      .foot .ver { font-size: var(--fs-1); }
      .foot-pause { min-height: 24px; font-size: var(--fs-1); }
      /* Quadro */
      .bheader { padding: var(--s-3) var(--s-4); }
      .btitle b { font-size: var(--fs-4); }
      .bcol { border-radius: var(--r-lg); box-shadow: var(--sh-1); }
      .bcard { border-radius: var(--r-md); }
      .bcard:hover, .bcard:focus-visible { box-shadow: var(--sh-2); }
      /* Barra do WhatsApp (topo) */
      .wabar { box-shadow: var(--sh-1); }
      /* ═══ 2.9.0: conversões por conversa ═══ */
      .cbuy { align-self: flex-start; margin: 0 var(--s-3) var(--s-2); padding: 2px var(--s-2); border-radius: var(--r-pill); background: var(--ok-soft); color: var(--ok); font-size: var(--fs-1); font-weight: 700; }
      .cbuy[hidden] { display: none; }
      .panel.sec-labels .cbuy, .panel.sec-sched .cbuy, .panel.sec-follows .cbuy, .panel.sec-disparos .cbuy, .panel.sec-vendas .cbuy, .panel.sec-midias .cbuy, .panel.editing .cbuy, .panel.diag .cbuy { display: none; }
      .cv-bought { display: inline-block; margin-top: 2px; padding: 0 var(--s-2); border-radius: var(--r-pill); background: var(--ok-soft); color: var(--ok); font-size: var(--fs-1); font-weight: 700; }
      .cv-chathist { gap: var(--s-1); }
      .cv-hrow.st-falhou { color: var(--err); }
      .cv-dup { border: 1px solid var(--warn); }
      /* ═══ 2.8.8: automações só daqui pra frente ═══ */
      .fw-badge.test { background: var(--warn-soft); color: var(--warn); }
      .act-box { gap: var(--s-2); border-color: var(--accent); }
      .act-count { font-weight: 600; color: var(--fg); }
      .act-list { margin: 0; padding-left: var(--s-4); max-height: 160px; overflow-y: auto; font-size: var(--fs-2); }
      /* ═══ 2.8.7: várias imagens (álbum) ═══ */
      .alb { display: flex; flex-direction: column; gap: var(--s-2); border-radius: var(--r-md); }
      .alb.over { outline: 2px dashed var(--accent); outline-offset: 2px; background: var(--accent-soft); }
      .alb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: var(--s-1); }
      .alb-cell { position: relative; aspect-ratio: 1; border-radius: var(--r-sm); overflow: hidden; background: var(--bg2); cursor: grab; touch-action: none; }
      .alb-thumb { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: var(--fs-icon); }
      .alb-thumb img, .alb-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .alb-x { position: absolute; top: 2px; right: 2px; width: 24px; height: 24px; padding: 0; border: none; border-radius: var(--r-pill); background: rgba(0,0,0,.6); color: #fff; font-size: var(--fs-1); }
      .alb-x:hover { background: var(--err); }
      .alb-n { position: absolute; left: 4px; bottom: 2px; padding: 0 var(--s-1); border-radius: var(--r-pill); background: rgba(0,0,0,.55); color: #fff; font-size: var(--fs-1); font-weight: 700; }
      .alb-count { font-size: var(--fs-1); color: var(--muted); }
      .ed-pick.off { opacity: .45; pointer-events: none; }
      .md-pcard.sel { border-color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); }
      .alb-pickok { align-self: flex-end; }
      .pv-album { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; max-width: 240px; align-self: flex-end; border-radius: var(--r-md); overflow: hidden; }
      .pv-album.n1 { grid-template-columns: 1fr; }
      .pv-album .alb-thumb { position: relative; aspect-ratio: 1; background: var(--bg2); }
      .pv-more { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.5); color: #fff; font-size: var(--fs-4); font-weight: 700; }
      /* ═══ 2.8.5: arrastar para reordenar ═══ */
      .cat-grip { flex-shrink: 0; width: 12px; margin-right: -4px; color: var(--muted); font-size: var(--fs-1); letter-spacing: -2px; opacity: 0; transition: opacity .15s; cursor: grab; }
      .cat-top:hover .cat-grip, .cat-top:focus-within .cat-grip { opacity: 1; }
      .list .card-row, .mtab .md-card, .mtab [data-folder] { touch-action: none; }
      .root.dnd-on, .root.dnd-on * { user-select: none !important; -webkit-user-select: none !important; cursor: grabbing !important; }
      .dnd-src { opacity: .45; }
      .dnd-before { box-shadow: 0 -3px 0 var(--accent) !important; }
      .dnd-after { box-shadow: 0 3px 0 var(--accent) !important; }
      .mtab .dnd-before { box-shadow: -3px 0 0 var(--accent) !important; }
      .mtab .dnd-after { box-shadow: 3px 0 0 var(--accent) !important; }
      .dnd-into { outline: 2px dashed var(--accent) !important; outline-offset: 2px; background: var(--accent-soft) !important; }
      /* ═══ 2.8.4: largura ajustável ═══ */
      .resizer { position: absolute; top: 0; bottom: 0; left: -4px; width: 8px; z-index: 9; cursor: col-resize; touch-action: none; }
      .resizer::after { content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 2px; background: var(--accent); opacity: 0; transition: opacity .15s; }
      .resizer:hover::after, .resizer:focus-visible::after, .root.resizing .resizer::after { opacity: 1; }
      .resizer:focus-visible { outline: none; }
      .root.resizing .panel { transition: none; user-select: none; }
      .panel.w-narrow .pnav > button > span, .panel.w-narrow .pmore > span { display: none; }
      .panel.w-narrow .pnav > button, .panel.w-narrow .pnav .pmore { min-height: 40px; }
      .panel.w-narrow .pnav > button svg, .panel.w-narrow .pnav .pmore svg { width: 20px; height: 20px; }
      .panel.w-narrow .qbtns { margin-left: 0; }
      .panel.w-narrow .trow .newitem, .panel.w-narrow .trow .newcat { white-space: nowrap; padding: 0 var(--s-2); font-size: var(--fs-1); }
      .panel.w-wide .md-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
      .panel.w-wide .md-pick .md-grid { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
      .panel.w-wide .editor { display: grid; grid-template-columns: 1fr 1fr; column-gap: var(--s-3); }
      .panel.w-wide .editor > * { grid-column: 1 / -1; }
      .panel.w-wide .editor > .ed-field { grid-column: auto; }
      .panel.w-wide .sc-row .ed-field { min-width: 160px; }
      /* ═══ 2.8.3: nome para mensagens e saudação ═══ */
      .cname { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-1) var(--s-2); margin: 0 var(--s-3) var(--s-2); font-size: var(--fs-2); }
      .cname[hidden] { display: none; }
      .cname-l { color: var(--muted); font-weight: 600; }
      .cname-v { font-weight: 600; }
      .cname-edit { min-width: var(--hit); min-height: var(--hit); padding: 0; border: none; border-radius: var(--r-sm); background: transparent; font-size: var(--fs-2); }
      .cname-edit:hover { background: var(--hover); }
      .cname-src { flex-basis: 100%; margin-top: -4px; font-size: var(--fs-1); color: var(--muted); }
      .cname-in { flex: 1 1 120px; min-height: var(--hit); padding: 0 var(--s-2); border-radius: var(--r-sm); border: 1px solid var(--border-strong); background: var(--card); color: var(--fg); font: inherit; font-size: var(--fs-2); }
      .cname-btn { min-height: var(--hit); padding: 0 var(--s-2); border-radius: var(--r-sm); border: 1px solid var(--border-strong); background: var(--card); color: var(--fg); font-size: var(--fs-1); font-weight: 600; }
      .cname-btn.primary { background: var(--accent-strong); border-color: var(--accent-strong); color: var(--on-accent); }
      .panel.sec-labels .cname, .panel.sec-sched .cname, .panel.sec-follows .cname, .panel.sec-disparos .cname, .panel.sec-vendas .cname, .panel.sec-conversoes .cname, .panel.sec-midias .cname, .panel.editing .cname, .panel.diag .cname { display: none; }
      .greetbtn { flex: 0 0 auto; width: var(--field-h); height: var(--field-h); border: 1px solid var(--border-strong); background: var(--card); }
      .greet-form { margin: 0 0 var(--s-2); display: flex; flex-direction: column; gap: var(--s-2); }
      .ed-vars { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-1); }
      .ed-varhint { flex-basis: 100%; font-size: var(--fs-1); color: var(--muted); }
      .pv-warn { padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--warn-soft); color: var(--warn); border-left: 3px solid currentColor; font-size: var(--fs-2); }
      /* ═══ 2.8.2: categorias ═══ */
      .trow .newitem, .trow .newcat { flex-shrink: 0; }
      .trow { flex-wrap: wrap; }
      .trow .search { flex: 1 1 100%; }
      .trow .newitem, .trow .newcat { flex: 1 1 0; }
      .newcat { min-height: var(--field-h); padding: 0 var(--s-3); border-radius: var(--r-md); border: 1px solid var(--border-strong); background: var(--card); color: var(--fg); font-size: var(--fs-2); font-weight: 600; }
      .newcat:hover { border-color: var(--accent); color: var(--accent-text); }
      .newcat-form { margin: 0 0 var(--s-2); }
      .imenu button.primary { background: var(--accent-strong); border-color: var(--accent-strong); color: var(--on-accent); }
      .cat-empty { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-1); padding: var(--s-2) var(--s-3); border: 1px dashed var(--border-strong); border-radius: var(--r-md); color: var(--muted); font-size: var(--fs-2); }
      .cat-add { min-height: var(--hit); padding: 0 var(--s-2); border: none; border-radius: var(--r-sm); background: transparent; color: var(--accent-text); font-size: var(--fs-2); font-weight: 600; }
      .cat-add:hover { background: var(--accent-soft); }
      .cat-askempty { margin: 0 0 var(--s-1); border: 1px solid var(--warn); background: var(--warn-soft); }
      /* ═══ 2.8.1: lista compacta, títulos inteiros (até 2 linhas) ═══ */
      .cat { margin-bottom: var(--s-2); }
      .cat-head { padding: var(--s-2) var(--s-3); font-size: var(--fs-2); font-weight: 700; }
      .cat-inner { gap: var(--s-1); padding: 0 var(--s-1) var(--s-1); }
      .card-row { gap: var(--s-2); padding: var(--s-1) var(--s-1) var(--s-1) var(--s-2); min-height: 44px; }
      .type { width: 28px; height: 28px; }
      .info .t { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; width: 100%; padding: 0; border: none; background: transparent; color: var(--fg); font: inherit; font-size: var(--fs-3); font-weight: 600; line-height: 1.3; text-align: left; white-space: normal; overflow: hidden; word-break: break-word; cursor: pointer; }
      .info .t:hover, .info .t.on { color: var(--accent-text); }
      .info .sub { margin-top: 2px; font-size: var(--fs-1); line-height: 1.3; }
      .btns { gap: 2px; opacity: 1; align-self: center; }
      .btns .icon-btn { width: var(--hit); height: var(--hit); border-radius: var(--r-sm); }
      .btns .send { color: var(--on-accent); background: var(--accent-strong); }
      .btns .send:hover { color: var(--on-accent); background: #c2410c; }
      .btns .send:disabled { opacity: .45; }
      .btns .send svg, .btns .iopts svg { width: 14px; height: 14px; }
      .imenu .asfile { width: auto; height: auto; }
      .md-name, .sc-who, .fw-name, .bcname, .lt-row .lname, .wt-row .wtname { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; overflow: hidden; word-break: break-word; line-height: 1.3; }
      .pmore-wrap { align-self: stretch; }
      .pmore { height: 100%; min-height: 48px; padding: var(--s-1) var(--s-2); gap: var(--s-1); }
      .pmore svg { width: 18px; height: 18px; }
      .pnav .pmore { height: 100%; min-height: 48px; padding: var(--s-1) var(--s-2); gap: var(--s-1); line-height: 1.2; }
      .pnav .pmore svg { width: 18px; height: 18px; }
        </style>
    <div class="root light">
      <button class="toggle" type="button" title="Mensagens (Triumph Store)" aria-label="Abrir ou fechar mensagens">${svg('zap', 'fill')}</button>
      <div class="wabar" role="toolbar" aria-label="Etiquetas do WhatsApp e do CRM" hidden>
        <div class="wfam" role="group" aria-label="Etiquetas do WhatsApp ou do CRM">
          <button type="button" data-fam="whatsapp" aria-pressed="false">WhatsApp</button><button type="button" data-fam="crm" aria-pressed="false">CRM</button>
        </div>
        <div class="wchips"></div>
        <button class="wclose" type="button" title="Ocultar a barra" aria-label="Ocultar a barra">×</button>
      </div>
      <div class="board" role="dialog" aria-label="Quadro" tabindex="-1" hidden>
        <div class="bheader">
          <div class="btitle"><b>Quadro</b><span class="bhint">Clique num cartão para abrir a conversa · arraste para outra coluna para trocar a etiqueta</span></div>
          <span class="bstatus" role="status" aria-live="polite"></span>
          <div class="wfam" role="group" aria-label="Etiquetas do WhatsApp ou do CRM">
            <button type="button" data-fam="whatsapp" aria-pressed="false">WhatsApp</button><button type="button" data-fam="crm" aria-pressed="false">CRM</button>
          </div>
          <div class="bactions">
            <button class="bbtn bcolsbtn" type="button" aria-haspopup="true" aria-expanded="false">Colunas</button>
            <button class="bbtn icon brefresh" type="button" title="Atualizar" aria-label="Atualizar">${svg('refresh')}</button>
            <button class="bbtn bclose" type="button" title="Fechar (Esc)">Fechar</button>
          </div>
          <div class="bcolsmenu" hidden></div>
        </div>
        <div class="bcols"></div>
        <div class="btoast" role="status" aria-live="polite" hidden></div>
      </div>
      <aside class="panel" aria-label="Mensagens">
        <div class="resizer" role="separator" aria-orientation="vertical" aria-label="Largura do painel" tabindex="0" title="Arraste para mudar a largura · duplo clique volta ao tamanho padrão"></div>
        <header class="head">
          <div class="brand"><span class="logo">${svg('zap', 'fill')}</span><span class="brand-txt">Mensagens</span></div>
          <div class="actions"></div>
        </header>
        <div class="auth" role="region" aria-label="Conta" hidden>
          <div class="auth-t">Entre com sua conta do sistema</div>
          <div class="auth-f">
            <input class="auth-email" type="email" autocomplete="username" maxlength="200" placeholder="E-mail" aria-label="E-mail" />
            <input class="auth-pass" type="password" autocomplete="current-password" maxlength="200" placeholder="Senha" aria-label="Senha" />
            <button class="btn primary auth-go" type="button">Entrar</button>
            <div class="auth-err" role="alert"></div>
          </div>
        </div>
        <nav class="pnav" aria-label="Seções do painel">
          <button type="button" data-sec="mensagens" title="Mensagens" aria-pressed="false">${svg('zap')}<span>Mensagens</span></button>
          <button type="button" data-sec="midias" title="Mídias 🖼️ (biblioteca de fotos, vídeos, áudios e PDFs)" aria-pressed="false">${svg('image')}<span>Mídias</span></button>
          <button type="button" data-sec="etiquetas" title="Etiquetas CRM" aria-pressed="false">${svg('tag')}<span>Etiquetas</span></button>
          <button type="button" data-sec="vendas" title="Vendas pela conversa" aria-pressed="false">${svg('money')}<span>Vendas</span></button>
          <button type="button" data-sec="conversoes" title="Conversões: compra para o Facebook" aria-pressed="false">${svg('trend')}<span>Conversões</span></button>
          <div class="pmore-wrap">
            <button type="button" class="pmore" title="Mais: Quadro, Agendados, Disparos e Automações" aria-haspopup="true" aria-expanded="false">${svg('apps')}<span>Mais</span></button>
            <div class="pmenu" role="group" aria-label="Mais seções" hidden>
              <button type="button" class="pboard" title="Abrir o Quadro" aria-pressed="false">${svg('board')}<span>Quadro</span></button>
              <button type="button" data-sec="agendados" title="Agendados" aria-pressed="false">${svg('clock')}<span>Agendados</span></button>
              <button type="button" data-sec="disparos" title="Disparos (envio para uma etiqueta CRM)" aria-pressed="false">${svg('megaphone')}<span>Disparos</span></button>
              <button type="button" data-sec="follows" title="Automações (Quando → Se → Então)" aria-pressed="false">${svg('repeat')}<span>Automações</span></button>
            </div>
          </div>
        </nav>
        <div class="status warn"><span class="dot"></span><span class="txt"></span><span class="qbtns"><button class="sale-quick" type="button" title="Registrar venda desta conversa" hidden>💰 Venda</button><button class="sale-quick conv-quick" type="button" title="Enviar compra desta conversa para o Facebook" hidden>📈 Compra p/ Facebook</button><button class="sale-quick conv-quick auto-quick" type="button" title="Adicionar esta conversa a uma automação" hidden>🔁 Automação</button></span></div>
        <div class="labels">
          <span class="lbl">Etiquetas CRM</span>
          <div class="chips"></div>
          <button class="add" type="button" title="Marcar etiquetas CRM" aria-label="Marcar etiquetas CRM" aria-haspopup="true" aria-expanded="false" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>
          <div class="lmenu" role="menu" hidden></div>
        </div>
        <div class="cname" role="group" aria-label="Nome para mensagens" hidden></div>
        <div class="cbuy" hidden>💰 compra enviada</div>
        <div class="name-note" hidden title="Sem telefone visível nesta conversa: a etiqueta fica ligada ao nome do contato. Se o nome mudar, ela não acompanha.">identificado só pelo nome</div>
        <div class="tools">
          <div class="trow">
            <label class="search">${svg('search')}<input type="text" placeholder="Pesquisar resposta rápida" aria-label="Pesquisar resposta rápida" /></label>
            <button class="newitem" type="button" title="Criar uma mensagem nova">+ Nova mensagem</button>
            <button class="newcat" type="button" title="Criar uma categoria nova">+ Nova categoria</button>
            <button class="greetbtn icon-btn" type="button" title="Textos da saudação ({saudacao})" aria-label="Textos da saudação" aria-expanded="false">${svg('gear')}</button>
          </div>
          <div class="filters" role="group" aria-label="Filtros"></div>
        </div>
        <div class="banner" hidden>${svg('wifiOff')}<span>Sem conexão: mostrando a última versão</span><button type="button">Tentar de novo</button></div>
        <div class="list"></div>
        <div class="ltab" role="region" aria-label="Etiquetas CRM">
          <div class="crm-intro">Etiquetas do CRM ficam só no nosso sistema. As etiquetas do WhatsApp continuam no WhatsApp.</div>
          <section class="crmsec">
            <div class="wt-head">ESTA CONVERSA</div>
            <div class="lt-conv">
              <div class="lt-who warn"><span class="dot"></span><span class="txt"></span></div>
              <div class="lt-note" hidden>identificado só pelo nome</div>
              <div class="crm-sub">Etiquetas CRM</div>
              <div class="tchips"></div>
              <div class="crm-sub">Nota do contato (CRM)</div>
              <textarea class="crm-note" maxlength="2000" rows="4" aria-label="Nota do contato (CRM)" placeholder="Anotações sobre este cliente (só ficam no CRM)"></textarea>
              <div class="crm-noterow"><span class="crm-notemsg" role="status" aria-live="polite"></span><span class="crm-count">0/2000</span><button class="bbtn crm-savenote" type="button" disabled>Salvar nota</button></div>
            </div>
            <div class="wt crm-wa" hidden>
              <div class="crm-sub">Etiquetas do WhatsApp nesta conversa</div>
              <div class="wt-who warn"><span></span></div>
              <div class="wt-chips"></div>
            </div>
          </section>
          <section class="crmsec">
            <div class="wt-head">TODAS AS ETIQUETAS CRM</div>
            <div class="lt-rows"></div>
            <button class="crm-newbtn" type="button" aria-expanded="false">+ Nova etiqueta CRM</button>
            <div class="crm-new" hidden><div class="lt-edit">
              <input class="crm-newname" type="text" maxlength="40" placeholder="Nome (até 40 caracteres)" aria-label="Nome da nova etiqueta CRM" />
              <div class="crm-newcolors" role="group" aria-label="Cor"></div>
              <button class="crm-create" type="button">Criar</button><button class="crm-cancelnew" type="button">Cancelar</button>
            </div></div>
            <div class="crm-tip">Sugestão de funil: Novo lead → Qualificação → Negociação → Proposta → Pós-venda. Comece com 3 a 6 etiquetas.</div>
            <div class="lt-hint" role="status" aria-live="polite" hidden></div>
          </section>
          <section class="crmsec">
            <div class="wt-head">COPIAR DO WHATSAPP</div>
            <div class="crm-copy"></div>
          </section>
        </div>
        <div class="voice prep" role="status" aria-live="polite" hidden>
          <div class="vrow">
            <span class="vmic">${svg('mic')}</span>
            <div class="vtxt"><b>Preparando áudio…</b><span class="vtime"></span></div>
            <button class="vcancel" type="button">Cancelar</button>
          </div>
          <div class="vbar"><div class="vfill"></div></div>
        </div>
        <div class="stab" role="region" aria-label="Agendados"></div>
        <div class="ftab" role="region" aria-label="Automações"></div>
        <div class="dtab" role="region" aria-label="Disparos"></div>
        <div class="vtab" role="region" aria-label="Vendas"></div>
        <div class="ctab" role="region" aria-label="Conversões"></div>
        <div class="mtab" role="region" aria-label="Mídias"></div>
        <div class="seqbar" role="status" aria-live="polite" hidden><span class="seqtxt"></span><button class="seqstop" type="button">Parar</button></div>
        <div class="toast" role="status" aria-live="polite"></div>
        <footer class="foot"><span class="last">Último usado: <b>—</b></span><button class="foot-pause" type="button" hidden></button><span class="ver"></span></footer>
      </aside>
    </div>
  `;

  const root      = shadow.querySelector('.root');
  const panel     = shadow.querySelector('.panel');
  const toggleBtn = shadow.querySelector('.toggle');
  const actions   = shadow.querySelector('.actions');
  const statusEl  = shadow.querySelector('.status');
  const statusTxt = shadow.querySelector('.status .txt');
  const searchIn  = shadow.querySelector('.search input');
  const filtersEl = shadow.querySelector('.filters');
  const bannerEl  = shadow.querySelector('.banner');
  const listEl    = shadow.querySelector('.list');
  const toastEl   = shadow.querySelector('.toast');
  const seqEl     = shadow.querySelector('.seqbar');
  const stabEl    = shadow.querySelector('.stab');
  const seqTxt    = shadow.querySelector('.seqbar .seqtxt');
  const seqStop   = shadow.querySelector('.seqbar .seqstop');
  seqStop.addEventListener('click', () => stopSequence());
  shadow.querySelector('.newitem').addEventListener('click', () => openEditor());
  // 2.8.3: textos da {saudacao}: carrega uma vez e quando a tela abre
  const greet = { open: false, cfg: null, draft: null, busy: false, seq: 0 };
  function loadGreetings() {
    const n = ++greet.seq; // uma leitura que começou antes de Salvar não volta o texto antigo
    return call('getGreetings').then((g) => { if (n !== greet.seq) return; greet.cfg = g; globalThis.TspEngine.setGreetings(g); }).catch(() => {});
  }
  loadGreetings();
  shadow.querySelector('.greetbtn').addEventListener('click', () => {
    if (state.view !== 'list') showList();
    greet.open = !greet.open;
    greet.draft = greet.open ? { ...(greet.cfg || globalThis.TspEngine.GREET_DEFAULT) } : null;
    shadow.querySelector('.greetbtn').setAttribute('aria-expanded', String(greet.open));
    if (greet.open) loadGreetings().then(() => { if (greet.open && greet.draft && !greet.touched) { greet.draft = { ...greet.cfg }; renderList(); } });
    greet.touched = false;
    renderList();
  });
  function greetingsEl() {
    const E2 = globalThis.TspEngine;
    const box = el('section', 'crmsec greet-form');
    box.append(el('div', 'wt-head', 'TEXTOS DA SAUDAÇÃO'));
    box.append(el('div', 'crm-intro', '{saudacao} muda sozinha conforme o horário de São Paulo: manhã (5h–11h59), tarde (12h–17h59) e noite (18h–4h59).'));
    const ex = el('div', 'fw-test greet-ex');
    const period = E2.greetingPeriod(new Date());
    const renderEx = () => { ex.textContent = `Agora (${{ manha: 'manhã', tarde: 'tarde', noite: 'noite' }[period]}): "${E2.fillName('{saudacao}, {nome}! Tudo bem?', 'Fernanda', { greetings: greet.draft })}"`; };
    [['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite']].forEach(([k, label]) => {
      const f = el('label', 'ed-field', label);
      const i = el('input', 'ed-title');
      i.type = 'text';
      i.maxLength = 60;
      i.value = greet.draft[k] || '';
      i.setAttribute('aria-label', `Saudação da ${label.toLowerCase()}`);
      i.addEventListener('input', () => { greet.draft[k] = i.value; greet.touched = true; renderEx(); });
      f.append(i);
      box.append(f);
    });
    renderEx();
    box.append(ex);
    const row = el('div', 'ed-add');
    const save = el('button', 'bbtn primary', greet.busy ? 'Salvando…' : 'Salvar');
    save.type = 'button';
    save.disabled = greet.busy;
    save.addEventListener('click', async () => {
      greet.busy = true;
      greet.seq++;
      renderList();
      try {
        const g = await call('setGreetings', greet.draft);
        greet.cfg = g;
        E2.setGreetings(g);
        greet.open = false;
        shadow.querySelector('.greetbtn').setAttribute('aria-expanded', 'false');
        toast('Textos da saudação salvos.', 'ok', 3000);
      } catch (e) { toast(e.message, 'error', 6000); }
      greet.busy = false;
      renderList();
    });
    const cancel = el('button', 'bbtn', 'Cancelar');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { greet.open = false; shadow.querySelector('.greetbtn').setAttribute('aria-expanded', 'false'); renderList(); });
    row.append(save, cancel);
    box.append(row);
    return box;
  }

  // 2.8.2: "+ Nova categoria" pede o nome ali mesmo, no topo da lista
  let newCatOpen = false;
  shadow.querySelector('.newcat').addEventListener('click', () => {
    if (state.view !== 'list') showList();
    newCatOpen = !newCatOpen;
    renderList();
  });
  const lastEl    = shadow.querySelector('.foot b');
  const labelsEl  = shadow.querySelector('.labels');
  const lchipsEl  = shadow.querySelector('.labels .chips');
  const laddBtn   = shadow.querySelector('.labels .add');
  const lmenuEl   = shadow.querySelector('.lmenu');
  const nameNote  = shadow.querySelector('.name-note');
  const voiceEl   = shadow.querySelector('.voice');
  const voiceTitle = shadow.querySelector('.voice .vtxt b');
  const voiceTime = shadow.querySelector('.voice .vtime');
  const voiceFill = shadow.querySelector('.voice .vfill');
  shadow.querySelector('.voice .vcancel').addEventListener('click', () => cancelVoice('Gravação cancelada.'));
  const ltWho     = shadow.querySelector('.lt-who');
  const ltWhoTxt  = shadow.querySelector('.lt-who .txt');
  const ltNote    = shadow.querySelector('.lt-note');
  const ltChips   = shadow.querySelector('.tchips');
  const ltRowsEl  = shadow.querySelector('.lt-rows');
  const ltHint    = shadow.querySelector('.lt-hint');
  const wtEl      = shadow.querySelector('.wt');
  const wtWho     = shadow.querySelector('.wt-who span');
  const wtChips   = shadow.querySelector('.wt-chips');
  const crmEls = {
    root: shadow.querySelector('.ltab'),
    note: shadow.querySelector('.crm-note'),
    noteMsg: shadow.querySelector('.crm-notemsg'),
    noteCount: shadow.querySelector('.crm-count'),
    noteSave: shadow.querySelector('.crm-savenote'),
    newBtn: shadow.querySelector('.crm-newbtn'),
    newBox: shadow.querySelector('.crm-new'),
    newName: shadow.querySelector('.crm-newname'),
    newColors: shadow.querySelector('.crm-newcolors'),
    copy: shadow.querySelector('.crm-copy'),
  };

  // Busca de clientes e lista da etiqueta aberta: elementos fixos, movidos para a etiqueta aberta
  const ltSearchWrap = el('label', 'lt-search');
  ltSearchWrap.innerHTML = svg('search');
  const ltSearchIn = el('input');
  ltSearchIn.type = 'text';
  ltSearchIn.placeholder = 'Buscar cliente';
  ltSearchIn.setAttribute('aria-label', 'Buscar cliente');
  ltSearchWrap.append(ltSearchIn);
  const ltClientsEl = el('div', 'lt-clients');
  shadow.querySelector('.foot .ver').textContent = `v${VERSION}`;
  bannerEl.querySelector('button').addEventListener('click', () => sync({ manual: true }));

  const refreshBtn = iconButton('refresh', 'Atualizar mensagens', () => sync({ manual: true }));
  const themeBtn   = iconButton('monitor', 'Tema', () => setThemePref(THEME_PREFS[state.themePref].next));
  const diagBtn    = iconButton('activity', 'Diagnóstico', () => (state.view === 'diag' ? showList() : showDiag()));
  const closeBtn   = iconButton('x', 'Fechar (Esc)', () => setOpen(false));
  actions.append(refreshBtn, themeBtn, diagBtn, closeBtn);

  // ── Conta (1.9.1): login pelo background (Supabase Auth). Sem sessão, tudo segue com a chave anon. ──
  // O painel só fica sabendo se está conectada e a dica do e-mail; a senha sai do campo direto
  // para o background (que só a envia ao Supabase Auth) e o campo é limpo em seguida.
  const auth = { connected: null, emailHint: '', busy: false };
  const authEl    = shadow.querySelector('.auth');
  const authEmail = shadow.querySelector('.auth-email');
  const authPass  = shadow.querySelector('.auth-pass');
  const authGo    = shadow.querySelector('.auth-go');
  const authErr   = shadow.querySelector('.auth-err');

  function renderAuth() {
    authEl.hidden = auth.connected !== false;
    authGo.disabled = auth.busy;
    authGo.textContent = auth.busy ? 'Entrando…' : 'Entrar';
  }

  async function refreshAuth() {
    try {
      const st = await call('authStatus');
      auth.connected = !!(st && st.connected);
      auth.emailHint = (st && st.emailHint) || '';
    } catch {
      if (auth.connected === null) auth.connected = false;
    }
    renderAuth();
    if (state.view === 'diag') renderDiag();
  }

  async function signIn() {
    if (auth.busy) return;
    const email = authEmail.value.trim();
    const password = authPass.value;
    authErr.textContent = '';
    if (!email || !password) { authErr.textContent = 'Preencha e-mail e senha.'; return; }
    auth.busy = true;
    renderAuth();
    try {
      const st = await call('authSignIn', { email, password });
      auth.connected = !!(st && st.connected);
      auth.emailHint = (st && st.emailHint) || '';
      authEmail.value = '';
      toast('Conta conectada.', 'ok', 2500);
      sync();
    } catch (err) {
      authErr.textContent = String((err && err.message) || 'Não foi possível entrar');
    } finally {
      authPass.value = '';
      auth.busy = false;
      renderAuth();
      if (state.view === 'diag') renderDiag();
    }
  }

  async function signOut() {
    try { await call('authSignOut'); } catch { /* a sessão local é apagada mesmo assim */ }
    auth.connected = false;
    auth.emailHint = '';
    renderAuth();
    if (state.view === 'diag') renderDiag();
    toast('Você saiu da conta.', 'ok', 2500);
  }

  authGo.addEventListener('click', () => signIn());
  [authEmail, authPass].forEach((input) => input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); signIn(); }
  }));

  // Re-injeta o painel e o estilo se o WhatsApp recriar a página
  function ensureInjected() {
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (!layoutStyle.isConnected) (document.head || document.documentElement).appendChild(layoutStyle);
    const html = document.documentElement;
    if (html.classList.contains('tsp-wa-open') !== state.open) html.classList.toggle('tsp-wa-open', state.open);
    // Barra de etiquetas: só reserva espaço quando está visível
    let wantBar = false;
    try { wantBar = barActive(); } catch { wantBar = false; }
    if (html.classList.contains('tsp-wa-bar') !== wantBar) html.classList.toggle('tsp-wa-bar', wantBar);
    if (root.classList.contains('bar-on') !== wantBar) root.classList.toggle('bar-on', wantBar);
  }

  function barActive() {
    return !state.barHiddenByUser && !!document.querySelector('#app');
  }

  let observedBody = null;
  let observedHead = null;
  const pageObserver = new MutationObserver(() => { ensureInjected(); applyTheme(); });

  function observePage() {
    pageObserver.observe(document.documentElement, { childList: true, attributes: true, attributeFilter: ['class'] });
    if (document.body && document.body !== observedBody) {
      observedBody = document.body;
      pageObserver.observe(observedBody, { attributes: true, attributeFilter: ['class'] });
    }
    if (document.head && document.head !== observedHead) {
      observedHead = document.head;
      pageObserver.observe(observedHead, { childList: true });
    }
  }

  ensureInjected();
  observePage();
  setInterval(() => { ensureInjected(); observePage(); applyTheme(); }, 3000);

  // ── Tema ───────────────────────────────────────────────────────────────────

  function whatsappIsDark() {
    const html = document.documentElement, body = document.body;
    if (html.classList.contains('dark') || (body && body.classList.contains('dark'))) return true;
    const app = document.querySelector('#app');
    const target = (app && app.firstElementChild) || body;
    const rgb = target && getComputedStyle(target).backgroundColor.match(/[\d.]+/g);
    if (!rgb || rgb.length < 3 || (rgb.length === 4 && Number(rgb[3]) === 0)) {
      return matchMedia('(prefers-color-scheme: dark)').matches;
    }
    const [r, g, b] = rgb.map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  }

  function appliedDark() {
    return state.themePref === 'auto' ? whatsappIsDark() : state.themePref === 'dark';
  }

  function applyTheme() {
    const dark = appliedDark();
    if (root.classList.contains('dark') === dark && root.classList.contains('light') === !dark) return;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
  }

  function renderThemeButton() {
    const pref = THEME_PREFS[state.themePref];
    setIcon(themeBtn, pref.icon);
    const label = `Tema: ${pref.label} (clique para trocar)`;
    themeBtn.title = label;
    themeBtn.setAttribute('aria-label', label);
  }

  function setThemePref(pref) {
    state.themePref = THEME_PREFS[pref] ? pref : 'auto';
    storageSet({ themePref: state.themePref });
    renderThemeButton();
    applyTheme();
    toast(`Tema ${THEME_PREFS[state.themePref].label}.`, 'info', 1500);
  }

  // ── Abrir / fechar ─────────────────────────────────────────────────────────

  function setOpen(open) {
    if (state.open === open) return;
    state.open = open;
    root.classList.toggle('open', open);
    ensureInjected();
    window.dispatchEvent(new Event('resize'));
    clearInterval(refreshTimer);
    clearInterval(contextTimer);
    if (open) {
      applyTheme();
      state.convKey = undefined; // força buscar as etiquetas da conversa de novo
      updateContext();
      contextTimer = setInterval(updateContext, 1000);
      refreshTimer = setInterval(() => { if (!document.hidden) sync(); }, REFRESH_MS); // 2.4.1: só com a aba visível
      sync();
      pingBridge();
      refreshWaStatus();
      try { barTick(); } catch { /* 2.4.1: contagens do CRM ao abrir o painel (se tiverem mais de 5 min) */ }
    } else {
      clearTimeout(convTimer);
      setMenuOpen(false);
      if (state.view === 'diag') showList();
    }
    syncCrmActive();
  }

  toggleBtn.addEventListener('click', () => setOpen(!state.open));

  // ── 2.8.4: largura do painel ajustável (arrastar a borda esquerda) ──
  // Mín. 300 px; máx. 50% da janela ou 700 px (o menor). Guardada só neste computador (storage local).
  // Durante o arraste só muda uma variável CSS, no máximo uma vez por quadro.
  const PW_MIN = 300;
  const pwMax = () => Math.max(PW_MIN, Math.min(700, Math.floor(window.innerWidth * 0.5)));
  const clampPw = (w) => Math.round(Math.min(pwMax(), Math.max(PW_MIN, Number(w) || PANEL_W)));
  state.panelW = PANEL_W;   // escolhida (guardada)
  let pwApplied = PANEL_W;  // a que está na tela (pode ser menor se a janela estreitar)
  function applyPanelWidth(w) {
    const px = clampPw(w);
    pwApplied = px;
    root.style.setProperty('--pw', `${px}px`);
    document.documentElement.style.setProperty('--tsp-pw', `${px}px`);
    panel.classList.toggle('w-narrow', px <= 340);
    panel.classList.toggle('w-wide', px > 480);
    resizer.setAttribute('aria-valuenow', String(px));
    resizer.setAttribute('aria-valuemin', String(PW_MIN));
    resizer.setAttribute('aria-valuemax', String(pwMax()));
    return px;
  }
  function setPanelWidth(w, { save = true } = {}) {
    state.panelW = applyPanelWidth(w);
    if (save) storageSet({ panelWidth: state.panelW });
    if (state.open) window.dispatchEvent(new Event('resize'));
  }
  const resizer = shadow.querySelector('.resizer');
  const drag = { on: false, x: null, raf: 0 };
  const dragFrame = () => { drag.raf = 0; if (drag.on && drag.x != null) applyPanelWidth(window.innerWidth - drag.x); };
  resizer.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    drag.on = true;
    drag.x = e.clientX;
    try { resizer.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
    root.classList.add('resizing');
    document.documentElement.classList.add('tsp-wa-resizing');
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!drag.on) return;
    drag.x = e.clientX;
    if (!drag.raf) drag.raf = requestAnimationFrame(dragFrame);
  });
  const endDrag = (e) => {
    if (!drag.on) return;
    if (e && e.clientX != null) drag.x = e.clientX;
    drag.on = false;
    if (drag.raf) { cancelAnimationFrame(drag.raf); drag.raf = 0; }
    root.classList.remove('resizing');
    document.documentElement.classList.remove('tsp-wa-resizing');
    setPanelWidth(window.innerWidth - drag.x);
  };
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);
  resizer.addEventListener('lostpointercapture', endDrag);
  resizer.addEventListener('dblclick', (e) => { e.preventDefault(); setPanelWidth(PANEL_W); });
  resizer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setPanelWidth(pwApplied + (e.key === 'ArrowLeft' ? 16 : -16)); }
    else if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); setPanelWidth(PANEL_W); }
  });
  // Janela do Chrome mudou de tamanho: reajusta (sem esquecer a largura escolhida)
  let pwResizeRaf = 0;
  window.addEventListener('resize', () => {
    if (drag.on || pwResizeRaf) return;
    pwResizeRaf = requestAnimationFrame(() => { pwResizeRaf = 0; if (clampPw(state.panelW) !== pwApplied) applyPanelWidth(state.panelW); });
  });
  applyPanelWidth(PANEL_W);

  // ── Seções do painel: Mensagens e Etiquetas (o Quadro abre por cima, sem trocar a seção) ──

  const brandTxt = shadow.querySelector('.brand-txt');
  const navBtns = [...shadow.querySelectorAll('.pnav button[data-sec], .pnav button.pboard')];
  // 2.8.0: menu numa linha; Quadro, Agendados, Disparos e Automações ficam em "Mais"
  const pmoreBtn = shadow.querySelector('.pmore');
  const pmenuEl = shadow.querySelector('.pmenu');
  function setMoreOpen(open) {
    pmenuEl.hidden = !open;
    pmoreBtn.setAttribute('aria-expanded', String(open));
  }
  pmoreBtn.addEventListener('click', (e) => { e.stopPropagation(); setMoreOpen(pmenuEl.hidden); });
  shadow.addEventListener('click', (e) => { if (!pmenuEl.hidden && !e.composedPath().includes(pmoreBtn.parentElement)) setMoreOpen(false); });
  pmenuEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); setMoreOpen(false); pmoreBtn.focus(); } });

  function renderPanelNav() {
    let moreOn = false;
    navBtns.forEach((b) => {
      const on = b.dataset.sec ? b.dataset.sec === state.section : b.classList.contains('pboard') && board.open;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      if (on && pmenuEl.contains(b)) moreOn = true;
    });
    pmoreBtn.classList.toggle('on', moreOn);
  }

  function setSection(section, { persist = true } = {}) {
    state.section = ['etiquetas', 'agendados', 'follows', 'disparos', 'vendas', 'conversoes', 'midias'].includes(section) ? section : 'mensagens';
    const labels = state.section === 'etiquetas';
    panel.classList.toggle('sec-labels', labels);
    panel.classList.toggle('sec-sched', state.section === 'agendados');
    panel.classList.toggle('sec-follows', state.section === 'follows');
    panel.classList.toggle('sec-disparos', state.section === 'disparos');
    panel.classList.toggle('sec-vendas', state.section === 'vendas');
    panel.classList.toggle('sec-conversoes', state.section === 'conversoes');
    panel.classList.toggle('sec-midias', state.section === 'midias');
    brandTxt.textContent = { mensagens: 'Mensagens', etiquetas: 'Etiquetas CRM', agendados: 'Agendados', follows: 'Automações', disparos: 'Disparos', vendas: 'Vendas', conversoes: 'Conversões', midias: 'Mídias' }[state.section];
    panel.setAttribute('aria-label', brandTxt.textContent);
    if (persist) storageSet({ panelSection: state.section }); // só o nome da seção
    setMenuOpen(false);
    if (state.section !== 'mensagens' && state.view === 'diag') showList();
    renderPanelNav();
    syncCrmActive();
  }

  // A seção Etiquetas só trabalha (lê dados, atualiza a cada minuto) com o painel aberto e ela visível
  function syncCrmActive() {
    const want = state.open && state.section === 'etiquetas';
    if (want && !crm.open) openCrm();
    else if (!want && crm.open) closeCrm();
    syncSchedActive();
    syncFollowsActive();
    syncDisparosActive();
    syncVendasActive();
    syncConversoesActive();
    syncMidiasActive();
  }

  navBtns.forEach((b) => b.addEventListener('click', () => {
    if (b.getAttribute('aria-disabled') === 'true') return; // "em breve"
    if (pmenuEl.contains(b)) setMoreOpen(false);
    if (b.classList.contains('pboard')) {
      if (board.open) closeBoard();
      else openBoard();
      return;
    }
    if (state.view === 'diag') showList();
    setSection(b.dataset.sec);
  }));

  // Teclas dentro do painel não vão para os atalhos do WhatsApp; Esc fecha
  ['keydown', 'keypress', 'keyup'].forEach((type) => panel.addEventListener(type, (e) => {
    if (type === 'keydown' && e.key === 'Escape') {
      e.preventDefault();
      // Na seção Etiquetas, Esc fecha primeiro a edição ou o formulário de nova etiqueta CRM
      if (crm.open && crm.edit) setEdit(null);
      else if (crm.open && crm.showNew) { crm.showNew = false; renderNewForm(); }
      else if (state.menuOpen) {
        setMenuOpen(false);
        laddBtn.focus();
      } else {
        setOpen(false);
        toggleBtn.focus();
      }
    }
    e.stopPropagation();
  }));

  // ── Status da conversa ─────────────────────────────────────────────────────

  function updateContext() {
    const prevFirst = state.ctx ? state.ctx.firstName : null;
    state.ctx = getContext();
    const { conv, composer, fullName } = state.ctx;
    if (conv && composer) {
      statusEl.className = 'status ok';
      statusTxt.textContent = `Conversa: ${fullName || 'contato sem nome'}`;
    } else {
      statusEl.className = 'status warn';
      statusTxt.textContent = conv ? 'Esta conversa não tem caixa de mensagem' : 'Abra uma conversa para enviar';
    }
    statusTxt.title = statusTxt.textContent;
    if (prevFirst !== null && prevFirst !== state.ctx.firstName) refreshOpenBubble();
    onConversationIdentity(state.ctx.identity);
    renderSaleQuick();
    scheduleChatCheck();
  }

  // 2.6.3: trocou de conversa → fecha as telas ligadas à conversa (📈, 💰, agendar com algo digitado,
  // 🔁 da conversa), descarta o que foi digitado e não enviado (inclusive a prévia editada e a nota) e
  // volta para Mensagens se uma dessas telas estava aberta. As telas gerais ficam onde estavam.
  const convWatch = { chatId: undefined, timer: null, busy: false };
  function scheduleChatCheck() {
    if (convWatch.timer || convWatch.busy) return;
    convWatch.timer = setTimeout(() => { convWatch.timer = null; checkActiveChat(); }, 150);
  }
  async function checkActiveChat() {
    convWatch.busy = true;
    let c = null;
    try { c = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { c = null; }
    convWatch.busy = false;
    if (!c) return;
    const id = chatKeyOf(c);
    if (convWatch.chatId === undefined) { convWatch.chatId = id; setNameChat(id); return; }
    if (id === convWatch.chatId) { if (chatNames.current !== (CHAT_ID_OK.test(id) ? id : null)) setNameChat(id); return; }
    convWatch.chatId = id;
    setNameChat(id);
    closeConversationScreens();
  }
  const chatKeyOf = (c) => (c && c.kind === 'individual' ? c.chatId : `(${c ? c.kind : 'nenhuma'})`);

  // ── 2.8.3: nome para mensagens ──
  const CHAT_ID_OK = /^[0-9]+@(c\.us|lid)$/;
  async function loadChatName(chatId) {
    if (!CHAT_ID_OK.test(chatId || '')) return null;
    let r = null;
    try { r = await call('getChatName', { chatId }); } catch { r = null; }
    if (!r) return chatNames.map.get(chatId) || null;
    chatNames.available = r.available !== false;
    if (r.available === false) return null;
    const v = { name: r.name || null, source: r.source || null };
    chatNames.map.set(chatId, v);
    return v;
  }
  // nome do {nome} para um envio (agendado, disparo, automação): à mão → aprendido → vazio; sem a tabela, o de antes
  async function nameForChat(chatId, fallback = '') {
    if (chatNames.available === false) return fallback || '';
    const v = await loadChatName(chatId);
    if (chatNames.available === false) return fallback || '';
    return (v && v.name) || '';
  }
  // 2.9.0: selo "💰 compra enviada" na conversa aberta (1 leitura ao trocar de conversa)
  async function loadChatBought(chatId) {
    const box = shadow.querySelector('.cbuy');
    if (!box) return;
    box.hidden = true;
    if (!chatId) return;
    let got = null;
    try { got = await call('purchasedChats', { chatIds: [chatId] }); } catch { got = null; }
    if (chatNames.current === chatId) box.hidden = !(Array.isArray(got) && got.includes(chatId));
  }
  async function setNameChat(id) {
    const chatId = CHAT_ID_OK.test(id || '') ? id : null;
    chatNames.current = chatId;
    loadChatBought(chatId);
    cn.editing = false;
    renderNameRow();
    if (!chatId) return;
    await loadChatName(chatId);
    if (chatNames.current !== chatId) return;
    state.ctx = getContext();
    renderNameRow();
    refreshOpenBubble();
  }
  // Aprender da SUA mensagem (fila da ponte: só o começo do texto, só na memória)
  const noLearnUntil = new Map(); // 2.9.1: chatId → até quando não aprende (envio com {nome} vazio)
  const learnBlocked = (chatId) => { const u = noLearnUntil.get(chatId); if (u == null) return false; if (u > Date.now()) return true; noLearnUntil.delete(chatId); return false; };
  async function learnTick() {
    if (chatNames.available === false) return;
    let got = null;
    try { got = await waRequest('myMessages', {}, { timeout: 2000 }); } catch { got = null; }
    if (!Array.isArray(got) || !got.length) return;
    const last = new Map();
    got.forEach((x) => { const n = x && globalThis.TspEngine.learnNameFrom(x.head); if (n && CHAT_ID_OK.test(x.chatId) && !learnBlocked(x.chatId)) last.set(x.chatId, n); });
    for (const [chatId, name] of last) {
      let r = null;
      try { r = await call('setChatName', { chatId, name, source: 'aprendido' }); } catch { r = null; }
      if (!r) continue;
      chatNames.map.set(chatId, { name: r.name || null, source: r.source || null });
      if (chatId === chatNames.current) { state.ctx = getContext(); renderNameRow(); refreshOpenBubble(); }
    }
  }
  setInterval(() => { learnTick().catch(() => {}); }, 4000);
  // descobre já se a tabela existe (sem ela, o {nome} funciona como antes)
  call('getChatName', { chatId: '1@c.us' }).then((r) => { if (r && chatNames.available === null) chatNames.available = r.available !== false; }).catch(() => {});

  // "Nome: Fernanda ✏️" na área de cima (perto das etiquetas CRM)
  const cn = { editing: false, busy: false };
  function renderNameRow() {
    const box = shadow.querySelector('.cname');
    if (!box) return;
    box.textContent = '';
    const chatId = chatNames.current;
    box.hidden = !chatId || chatNames.available === false;
    if (box.hidden) return;
    const v = chatNames.map.get(chatId) || { name: null, source: null };
    box.append(el('span', 'cname-l', 'Nome:'));
    if (cn.editing) {
      const input = el('input', 'cname-in');
      input.type = 'text';
      input.maxLength = 40;
      input.value = v.name || '';
      input.placeholder = 'Nome para as mensagens';
      input.setAttribute('aria-label', 'Nome para as mensagens desta conversa');
      const save = async () => {
        if (cn.busy) return;
        cn.busy = true;
        try {
          const r = await call('setChatName', { chatId, name: input.value, source: 'manual' });
          chatNames.map.set(chatId, { name: r.name || null, source: r.source || null });
          cn.editing = false;
          state.ctx = getContext();
          refreshOpenBubble();
        } catch (e) { toast(e.message, 'error', 5000); }
        cn.busy = false;
        renderNameRow();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cn.editing = false; renderNameRow(); } });
      const ok2 = el('button', 'cname-btn primary', 'Salvar');
      ok2.type = 'button';
      ok2.addEventListener('click', save);
      const no = el('button', 'cname-btn', 'Cancelar');
      no.type = 'button';
      no.addEventListener('click', () => { cn.editing = false; renderNameRow(); });
      box.append(input, ok2, no);
      setTimeout(() => input.focus(), 0);
      return;
    }
    box.append(el('span', 'cname-v', v.name || '—'));
    const edit = el('button', 'cname-edit', '✏️');
    edit.type = 'button';
    edit.title = 'Editar o nome para mensagens (vazio apaga)';
    edit.setAttribute('aria-label', 'Editar o nome para mensagens');
    edit.addEventListener('click', () => { cn.editing = true; renderNameRow(); });
    box.append(edit);
    if (v.name) box.append(el('span', 'cname-src', v.source === 'manual' ? 'definido por você' : 'aprendido da sua mensagem'));
  }

  // Um formulário da conversa está abrindo agora (com a conversa ativa da WA-JS em mãos): se ela não é a
  // conversa que o painel conhecia, descarta as telas da anterior (menos a que está abrindo) e passa a valer esta.
  function adoptChat(c, keep) {
    const id = chatKeyOf(c);
    if (convWatch.chatId !== undefined && convWatch.chatId !== id) closeConversationScreens({ keep, stay: true });
    convWatch.chatId = id;
    if (chatNames.current !== (CHAT_ID_OK.test(id) ? id : null)) setNameChat(id);
  }

  function closeConversationScreens({ keep = null, stay = false } = {}) {
    let leave = false;
    if (keep !== 'cv' && (cv.form || cv.view !== 'list')) {
      if (state.section === 'conversoes') leave = true;
      cv.form = null; cv.view = 'list'; cv.done = null; cv.msg = ''; cv.err = false;
    }
    if (keep !== 'vs' && (vs.form || vs.view !== 'list')) {
      if (state.section === 'vendas') leave = true;
      vs.form = null; vs.view = 'list'; vs.done = null; vs.msg = ''; vs.err = false; vs.courier = null;
    }
    if (keep !== 'fl' && fl.view === 'conversa') {
      if (state.section === 'follows') leave = true;
      fl.conv = null; fl.view = 'list';
    }
    const sf = sched.form;
    if (!sf.saving) {
      if ((sf.body || sf.itemId) && state.section === 'agendados') leave = true;
      Object.assign(sf, { mode: 'texto', itemId: '', body: '', date: '', time: '', msg: '', error: false });
    }
    // Prévia editada ("Enviar só nesta conversa") e nome digitado: valiam só para a conversa anterior
    pvEdits.clear();
    if (state.previewId) { state.previewId = null; renderList(); }
    // 2.7.0: legenda digitada para "Enviar nesta conversa" volta à legenda salva
    if (md.sel) { const m = md.media.find((x) => x.id === md.sel); md.caption = m && m.caption ? m.caption : ''; if (md.open) renderMidias(); }
    // Nota do cliente: relê a da conversa nova (o rascunho da anterior é descartado)
    scheduleNote(true);
    // Redesenha as telas (o formulário antigo não pode ficar escondido no painel)
    if (keep !== 'cv') renderConversoes();
    if (keep !== 'vs') renderVendas();
    if (keep !== 'fl') renderFollows();
    renderSched();
    if (leave && !stay) setSection('mensagens');
  }

  // ── Etiquetas da conversa ──────────────────────────────────────────────────

  let lastIdentityKind = null;

  function onConversationIdentity(identity) {
    const key  = canLabel(identity) ? identity.key : null;
    const kind = identity ? identity.kind : 'none';
    if (key === state.convKey && kind === lastIdentityKind) return;
    lastIdentityKind = kind;
    const keyChanged = key !== state.convKey;
    state.convKey = key;
    if (keyChanged) {
      state.convLabelIds = key && convCache.has(key) ? convCache.get(key) : [];
      state.convLoading  = !!key;
      state.convError    = false;
      clearTimeout(convTimer);
      if (key) convTimer = setTimeout(() => loadConvLabels(key), 300);
    }
    if (!key) setMenuOpen(false);
    renderLabelsRow();
    scheduleWaConv();
    if (keyChanged) scheduleNote();
  }

  async function loadConvLabels(key) {
    const identity = state.ctx && state.ctx.identity;
    if (!canLabel(identity) || identity.key !== key) return;
    try {
      const ids = await call('getContactLabels', { identity: identityPayload(identity) });
      convCache.set(key, ids);
      // Nome do CRM para o {nome} (2.1.0)
      call('getContactName', { identity: identityPayload(identity) }).then((r) => {
        const name = r && typeof r.name === 'string' ? r.name : null;
        if (crmNames.get(key) === name) return;
        crmNames.set(key, name);
        if (state.convKey === key) updateContext();
      }).catch(() => {});
      if (state.convKey === key && pendingLabelOps === 0) {
        state.convLabelIds = ids;
        state.convError = false;
      }
    } catch {
      if (state.convKey === key) state.convError = true;
    } finally {
      if (state.convKey === key) {
        state.convLoading = false;
        renderLabelsRow();
      }
    }
  }

  function identityPayload(identity) {
    return { key: identity.key, phone: identity.phone, name: identity.name };
  }

  function textOn(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    if (Number.isNaN(n)) return '#ffffff';
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111111' : '#ffffff';
  }

  function renderLabelsRow() {
    const identity = state.ctx && state.ctx.identity;
    lchipsEl.textContent = '';
    nameNote.hidden = !(identity && identity.kind === 'name');

    if (!state.ctx || !state.ctx.conv) {
      lchipsEl.append(el('span', 'none', 'Abra uma conversa para etiquetar'));
    } else if (identity.kind === 'group') {
      lchipsEl.append(el('span', 'none', 'Grupos não recebem etiquetas'));
    } else if (!canLabel(identity)) {
      lchipsEl.append(el('span', 'none', 'Não consegui identificar a conversa'));
    } else {
      const applied = state.labels.filter((l) => state.convLabelIds.includes(l.id));
      applied.forEach((l) => {
        const chip = el('span', 'lchip', l.name);
        chip.title = l.name;
        chip.style.background = l.color;
        chip.style.color = textOn(l.color);
        chip.style.setProperty('--c', l.color);
        lchipsEl.append(chip);
      });
      if (!applied.length) {
        const msg = state.convLoading ? '…' : state.convError ? 'Não consegui carregar' : 'Nenhuma';
        lchipsEl.append(el('span', 'none', msg));
      }
    }
    laddBtn.hidden = !canLabel(identity);
    if (state.menuOpen) renderMenu();
    renderConvTab();
  }

  // Etiquetas CRM ocultas só aparecem para a conversa que já as tem
  const visibleCrmLabels = () => state.labels.filter((l) => !l.hidden || state.convLabelIds.includes(l.id));

  function renderMenu() {
    lmenuEl.textContent = '';
    if (!visibleCrmLabels().length) {
      lmenuEl.append(el('div', 'lempty', state.labelsLoaded
        ? 'Nenhuma etiqueta CRM. Crie na seção Etiquetas do painel.'
        : 'Carregando etiquetas CRM...'));
      return;
    }
    visibleCrmLabels().forEach((l) => {
      const on = state.convLabelIds.includes(l.id);
      const opt = el('button', 'lopt');
      opt.type = 'button';
      opt.setAttribute('role', 'menuitemcheckbox');
      opt.setAttribute('aria-checked', String(on));
      const dot = el('span', 'ldot');
      dot.style.background = l.color;
      opt.append(dot, el('span', 'lname', l.name));
      if (on) opt.insertAdjacentHTML('beforeend', svg('check', 'lcheck'));
      opt.addEventListener('click', (e) => { e.stopPropagation(); toggleLabel(l.id); });
      lmenuEl.append(opt);
    });
  }

  function setMenuOpen(open) {
    state.menuOpen = open;
    lmenuEl.hidden = !open;
    laddBtn.classList.toggle('on', open);
    laddBtn.setAttribute('aria-expanded', String(open));
    if (open) renderMenu();
  }

  laddBtn.addEventListener('click', (e) => { e.stopPropagation(); setMenuOpen(!state.menuOpen); });
  const closeMenuOnOutsideClick = (e) => {
    if (state.menuOpen && !e.composedPath().includes(labelsEl)) setMenuOpen(false);
  };
  shadow.addEventListener('click', closeMenuOnOutsideClick);
  document.addEventListener('click', closeMenuOnOutsideClick, true);

  // Marca/desmarca na hora; se o Supabase falhar, desfaz e avisa
  async function toggleLabel(labelId) {
    const identity = state.ctx && state.ctx.identity;
    if (!canLabel(identity)) return;
    const key = identity.key;
    const on = !state.convLabelIds.includes(labelId);
    const apply = (ids) => {
      convCache.set(key, ids);
      if (state.convKey === key) { state.convLabelIds = ids; renderLabelsRow(); }
    };
    const current = () => (state.convKey === key ? state.convLabelIds : convCache.get(key) || []);
    apply(on ? [...current(), labelId] : current().filter((id) => id !== labelId));

    pendingLabelOps++;
    try {
      // 2.0.0: manda junto o id da conversa aberta (para os follows acharem a conversa)
      let chatId;
      if (on && state.waStatus && state.waStatus.ready) {
        try {
          const chat = await waRequest('activeChat', {}, { timeout: 1000 });
          if (chat && chat.kind === 'individual' && typeof chat.chatId === 'string') chatId = chat.chatId;
        } catch { chatId = undefined; }
      }
      const ids = await call('setContactLabel', { identity: { ...identityPayload(identity), chatId }, labelId, on });
      if (pendingLabelOps === 1) apply(ids);
      afterLabelChange();
    } catch {
      apply(on ? current().filter((id) => id !== labelId) : [...current(), labelId]);
      if (crm.open) crmToast('Não consegui salvar', 'error', 4000);
      else toast('Não consegui salvar', 'error');
    } finally {
      pendingLabelOps--;
    }
  }

  // ── Etiquetas CRM (dados da seção Etiquetas do painel) ──

  const labelsTabActive = () => crm.open;

  function restartLabelsTabTimer() {
    clearInterval(lt.timer);
    // 2.4.1: no máximo a cada 5 min e só com a aba visível
    if (labelsTabActive()) lt.timer = setInterval(() => { if (!document.hidden) refreshLabelsTab(); }, 5 * 60 * 1000);
  }

  async function refreshLabelsTab() {
    refreshWaTab();
    await Promise.all([syncLabels(), loadCounts()]);
    renderAllLabels();
    if (lt.openId) loadClients({ reset: true });
  }

  // Depois de qualquer mudança feita pela extensão: números da barra/painel/Quadro
  function afterLabelChange() {
    loadCounts();
    if (labelsTabActive() && lt.openId) loadClients({ reset: true });
  }

  function formatPhone(digits) {
    if (!digits) return '';
    const br = String(digits).match(/^55(\d{2})(\d{4,5})(\d{4})$/);
    return br ? `+55 (${br[1]}) ${br[2]}-${br[3]}` : `+${digits}`;
  }

  // "Esta conversa": chips que marcam/desmarcam com 1 clique
  function renderConvTab() {
    const ctx = state.ctx;
    const identity = ctx && ctx.identity;
    let warning = null;
    if (!ctx || !ctx.conv) warning = 'Abra uma conversa para etiquetar';
    else if (identity.kind === 'group') warning = 'Grupos não recebem etiquetas';
    else if (!canLabel(identity)) warning = 'Não consegui identificar a conversa';

    ltWho.className = `lt-who ${warning ? 'warn' : 'ok'}`;
    ltWhoTxt.textContent = warning || ctx.fullName || 'Contato sem nome';
    ltWhoTxt.title = ltWhoTxt.textContent;
    ltNote.hidden = !(identity && identity.kind === 'name');
    ltChips.classList.toggle('loading', !warning && state.convLoading);
    ltChips.textContent = '';

    if (!visibleCrmLabels().length) {
      ltChips.append(el('span', 'lt-none', state.labelsLoaded
        ? 'Nenhuma etiqueta CRM. Crie em "+ Nova etiqueta CRM".'
        : 'Carregando etiquetas CRM...'));
      return;
    }
    visibleCrmLabels().forEach((l) => {
      const on = !warning && state.convLabelIds.includes(l.id);
      const chip = el('button', `tchip${on ? ' on' : ''}`);
      chip.type = 'button';
      chip.disabled = !!warning;
      chip.style.setProperty('--c', l.color);
      chip.style.setProperty('--on', textOn(l.color));
      chip.setAttribute('aria-pressed', String(on));
      chip.title = warning || (on ? `Desmarcar "${l.name}"` : `Marcar "${l.name}"`);
      chip.innerHTML = on ? svg('check') : '<span class="tdot"></span>';
      chip.append(l.name);
      chip.addEventListener('click', () => toggleLabel(l.id));
      ltChips.append(chip);
    });
    if (!warning && state.convError) ltChips.append(el('span', 'lt-none', 'Não consegui carregar as etiquetas CRM desta conversa.'));
    renderNote();
  }

  async function loadCounts() {
    try {
      const counts = await call('fetchLabelCounts');
      if (!counts || typeof counts !== 'object') throw new Error('Resposta inválida ao contar clientes');
      lt.counts = counts;
      lt.countsAt = Date.now();
      lt.countsError = null;
    } catch (e) {
      lt.countsError = e.message;
    }
    renderAllLabels();
    onCrmCountsChanged();
  }

  function ltSkeleton(lines) {
    const box = el('div', 'lt-sk');
    for (let i = 0; i < lines; i++) {
      const bar = el('div', 'sk');
      bar.style.cssText = `height: 12px; width: ${85 - i * 15}%;`;
      box.append(bar);
    }
    return box;
  }

  function ltMessage(text, { error = false, retry = null } = {}) {
    const box = el('div', `lt-msg${error ? ' err' : ''}`, text);
    if (retry) {
      const b = el('button', null, 'Tentar de novo');
      b.type = 'button';
      b.addEventListener('click', retry);
      box.append(b);
    }
    return box;
  }

  // "Todas as etiquetas CRM": só reconstrói quando a lista muda (não tira o foco da busca nem do campo de nome)
  function renderAllLabels() {
    const labelsFailed = !state.labelsLoaded && !!state.labelsError;
    const sig = JSON.stringify([state.labelsLoaded, labelsFailed, state.labels.map((l) => [l.id, l.name, l.color, !!l.hidden]), lt.openId,
      !lt.counts && !!lt.countsError, crm.edit, crm.busy, state.schema.hidden]);
    if (sig !== lt.rowsSig) {
      lt.rowsSig = sig;
      ltRowsEl.textContent = '';
      if (lt.openId && !state.labels.some((l) => l.id === lt.openId)) lt.openId = null;

      if (labelsFailed) {
        ltRowsEl.append(ltMessage('Não consegui carregar as etiquetas CRM.', { error: true, retry: refreshLabelsTab }));
      } else if (!state.labelsLoaded) {
        ltRowsEl.append(ltSkeleton(3));
      } else if (!state.labels.length) {
        ltRowsEl.append(ltMessage('Nenhuma etiqueta CRM ainda. Crie em "+ Nova etiqueta CRM".'));
      } else {
        if (!lt.counts && lt.countsError) {
          ltRowsEl.append(ltMessage('Não consegui carregar os contadores.', { error: true, retry: loadCounts }));
        }
        state.labels.forEach((l) => {
          const open = lt.openId === l.id;
          const item = el('div', `lt-item${open ? ' open' : ''}${l.hidden ? ' is-hidden' : ''}`);
          item.dataset.id = l.id;
          const head = el('div', 'lt-head');
          const grip = el('span', 'lt-grip', '⠿');
          grip.title = 'Arraste para mudar a ordem';
          grip.setAttribute('aria-hidden', 'true');
          const row = el('button', 'lt-row');
          row.type = 'button';
          row.setAttribute('aria-expanded', String(open));
          const dot = el('span', 'ldot');
          dot.style.background = l.color;
          row.append(dot, el('span', 'lname', l.name));
          if (l.hidden) row.append(el('span', 'lt-tag', 'oculta'));
          row.append(el('span', 'lt-count', '…'));
          row.insertAdjacentHTML('beforeend', svg('chevron', 'chev'));
          row.addEventListener('click', () => toggleLabelOpen(l.id));
          const editing = crm.edit && crm.edit.id === l.id;
          const opts = el('button', `lt-opts${editing ? ' on' : ''}`, '⋯');
          opts.type = 'button';
          opts.title = 'Renomear, cor, ocultar, ordem, excluir';
          opts.setAttribute('aria-label', `Opções da etiqueta CRM "${l.name}"`);
          opts.setAttribute('aria-expanded', String(!!editing));
          opts.addEventListener('click', () => setEdit(editing ? null : l.id, 'menu'));
          head.append(grip, row, opts);
          item.append(head);
          if (editing) item.append(labelEditor(l));
          if (open) {
            const body = el('div', 'lt-body');
            body.append(ltSearchWrap, ltClientsEl, exportRow(l));
            item.append(body);
          }
          addReorderDrag(item, l);
          ltRowsEl.append(item);
        });
      }
    }
    updateCounts();
  }

  function updateCounts() {
    ltRowsEl.querySelectorAll('.lt-item').forEach((item) => {
      const badge = item.querySelector('.lt-count');
      const n = lt.counts ? lt.counts[item.dataset.id] : undefined;
      badge.textContent = n == null ? (lt.countsError ? '!' : '…') : String(n);
      badge.title = n == null
        ? (lt.countsError ? 'Não consegui carregar o contador' : 'Carregando')
        : `${n} cliente${n === 1 ? '' : 's'}`;
    });
  }

  function toggleLabelOpen(labelId) {
    lt.openId = lt.openId === labelId ? null : labelId;
    lt.search = '';
    ltSearchIn.value = '';
    lt.clients = [];
    lt.hasMore = false;
    lt.error = null;
    renderAllLabels();
    if (lt.openId) loadClients({ reset: true });
  }

  async function loadClients({ reset = false } = {}) {
    const labelId = lt.openId;
    if (!labelId) return;
    const reqId = ++lt.reqId;
    // Ao atualizar, recarrega o que já estava visível (até 200) para não "encolher" a lista
    const limit = reset ? Math.min(200, Math.max(50, lt.clients.length)) : 50;
    const offset = reset ? 0 : lt.clients.length;
    lt.loading = true;
    lt.error = null;
    renderClients();
    try {
      const page = await call('fetchLabelClients', { labelId, offset, limit, search: lt.search });
      if (reqId !== lt.reqId) return;
      lt.clients = reset ? page.clients : [...lt.clients, ...page.clients];
      lt.hasMore = page.hasMore;
    } catch (e) {
      if (reqId !== lt.reqId) return;
      lt.error = e.message;
    }
    lt.loading = false;
    renderClients();
  }

  function renderClients() {
    ltClientsEl.textContent = '';
    if (!lt.clients.length) {
      if (lt.loading) ltClientsEl.append(ltSkeleton(3));
      else if (lt.error) ltClientsEl.append(ltMessage('Não consegui carregar os clientes.', { error: true, retry: () => loadClients({ reset: true }) }));
      else ltClientsEl.append(ltMessage(lt.search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente com esta etiqueta.'));
      return;
    }
    lt.clients.forEach((c) => {
      const b = el('button', 'lt-client');
      b.type = 'button';
      b.title = 'Colocar na busca do WhatsApp';
      b.append(el('span', 'n', c.name || formatPhone(c.phone) || '—'));
      if (c.phone && c.name) b.append(el('span', 'p', formatPhone(c.phone)));
      else if (!c.phone) b.append(el('span', 'p byname', 'só pelo nome'));
      b.addEventListener('click', () => searchClientInWhatsApp(c));
      ltClientsEl.append(b);
    });
    if (lt.hasMore || (lt.loading && lt.clients.length)) {
      const more = el('button', 'lt-more', lt.loading ? 'Carregando...' : 'Ver mais');
      more.type = 'button';
      more.disabled = lt.loading;
      more.addEventListener('click', () => loadClients());
      ltClientsEl.append(more);
    }
    if (lt.error) ltClientsEl.append(ltMessage('Não consegui carregar mais.', { error: true, retry: () => loadClients() }));
  }

  ltSearchIn.addEventListener('input', () => {
    clearTimeout(lt.searchTimer);
    lt.searchTimer = setTimeout(() => {
      lt.search = ltSearchIn.value.trim();
      lt.clients = [];
      loadClients({ reset: true });
    }, 300);
  });

  // ── Clique no cliente: preenche a busca do WhatsApp (não abre a conversa) ──

  function findSearchBox() {
    for (const s of SEL.search) {
      for (const node of document.querySelectorAll(s)) {
        if (!host.contains(node) && isVisible(node)) return node;
      }
    }
    return null;
  }

  async function fillSearchBox(box, term) {
    const isInput = box.tagName === 'INPUT';
    const textOf = () => ((isInput ? box.value : box.textContent) || '').trim();
    box.focus();
    await sleep(40);
    if (isInput) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(box, term);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(80);
      return textOf() === term;
    }
    try { document.execCommand('selectAll', false); } catch { /* sem suporte */ }
    const dt = new DataTransfer();
    dt.setData('text/plain', term);
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(120);
    if (textOf() === term) return true;
    try { document.execCommand('insertText', false, term); } catch { /* sem suporte */ }
    await sleep(120);
    return textOf() === term;
  }

  function showHint(ok, client) {
    clearTimeout(lt.hintTimer);
    ltHint.textContent = '';
    ltHint.className = `lt-hint${ok ? '' : ' warn'}`;
    if (ok) {
      ltHint.append(el('b', null, 'Busca preenchida. '), 'Clique na conversa que apareceu na lista do WhatsApp.');
      lt.hintTimer = setTimeout(() => { ltHint.hidden = true; }, 12000);
    } else {
      ltHint.append(el('b', null, 'Não achei a busca do WhatsApp. '), 'Procure manualmente por:');
      const parts = [client.name, client.phone ? formatPhone(client.phone) : null].filter(Boolean);
      ltHint.append(el('div', 'manual', parts.join(' · ') || '—'));
    }
    ltHint.hidden = false;
  }

  async function searchClientInWhatsApp(client) {
    const term = client.phone || client.name || '';
    const box = term ? findSearchBox() : null;
    let ok = false;
    if (box) {
      try { ok = await fillSearchBox(box, term); } catch { ok = false; }
    }
    showHint(ok, client);
  }

  // ── Busca e filtros ────────────────────────────────────────────────────────

  searchIn.addEventListener('input', () => { state.search = searchIn.value; renderList(); });

  FILTERS.forEach(([id, label]) => {
    const chip = el('button', 'chip', label);
    chip.type = 'button';
    chip.dataset.id = id;
    chip.addEventListener('click', () => { state.filter = id; renderFilters(); renderList(); });
    filtersEl.appendChild(chip);
  });

  function renderFilters() {
    filtersEl.querySelectorAll('.chip').forEach((c) => {
      const active = c.dataset.id === state.filter;
      c.classList.toggle('active', active);
      c.setAttribute('aria-pressed', String(active));
    });
  }

  // ── Aviso, faixa offline e rodapé ──────────────────────────────────────────

  // action (opcional): { label, onClick } vira um botão no aviso, que vale uma vez só
  function fillToast(target, text, action) {
    target.textContent = text;
    if (!action) return;
    const b = el('button', 'tundo', action.label);
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.disabled) return;
      b.disabled = true;
      action.onClick();
    });
    target.append(b);
  }

  let toastTimer = null;
  function toast(text, kind = 'info', ms = 4000, action = null) {
    clearTimeout(toastTimer);
    fillToast(toastEl, text, action);
    toastEl.className = `toast show ${kind}`;
    if (ms) toastTimer = setTimeout(() => {
      toastEl.className = `toast ${kind}`;
      toastEl.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    }, ms);
  }

  function renderBanner() {
    bannerEl.hidden = !(state.offline && state.loaded) || state.view === 'diag';
  }

  function renderLastUsed() {
    lastEl.textContent = state.lastUsed || '—';
    lastEl.title = state.lastUsed || '';
  }

  function renderSyncing() {
    refreshBtn.querySelector('svg').classList.toggle('spin', state.syncing);
    refreshBtn.disabled = state.syncing;
  }

  // ── Dados (cache local + Supabase) ─────────────────────────────────────────

  function applyLibrary(lib, source, savedAt) {
    state.categories = lib.categories || [];
    state.items      = lib.items || [];
    if (typeof lib.partsAvailable === 'boolean') state.partsAvailable = lib.partsAvailable;
    if (typeof lib.removeAllAvailable === 'boolean') state.removeAllAvailable = lib.removeAllAvailable; // 2.8.6
    if (typeof lib.albumAvailable === 'boolean') state.albumAvailable = lib.albumAvailable; // 2.8.7
    state.loaded     = true;
    state.source     = source;
    state.syncedAt   = savedAt || null;
  }

  async function sync({ manual = false } = {}) {
    if (state.syncing) return;
    state.syncing = true;
    state.error = null;
    renderSyncing();
    if (!state.loaded) renderList();
    try {
      const [lib] = await Promise.all([call('fetchLibrary'), syncLabels()]);
      const changed = !state.loaded
        || JSON.stringify(lib) !== JSON.stringify({ categories: state.categories, items: state.items });
      applyLibrary(lib, 'servidor', Date.now());
      state.offline = false;
      state.lastSyncError = null;
      saveCache();
      if (changed) renderList();
      if (manual) toast('Mensagens atualizadas.', 'ok', 2000);
    } catch (e) {
      state.lastSyncError = e.message;
      if (state.loaded) state.offline = true;
      else state.error = e.message;
      if (e.message === INVALIDATED_MSG) toast(INVALIDATED_MSG, 'error', 0);
      renderList();
    } finally {
      state.syncing = false;
      renderSyncing();
      renderBanner();
      if (state.view === 'diag') renderDiag();
    }
  }

  // Etiquetas do ERP; nunca lança erro (a falha fica em state.labelsError)
  async function syncLabels() {
    try {
      const labels = await call('fetchLabels');
      if (!Array.isArray(labels)) throw new Error('Resposta inválida ao buscar etiquetas');
      const changed = JSON.stringify(labels) !== JSON.stringify(state.labels);
      state.labels = labels;
      state.labelsLoaded = true;
      state.labelsSource = 'servidor';
      state.labelsSyncedAt = Date.now();
      state.labelsError = null;
      storageSet({ labels: { items: labels, savedAt: state.labelsSyncedAt } });
      if (changed) renderLabelsRow();
      renderAllLabels();
    } catch (e) {
      state.labelsError = e.message;
      renderAllLabels();
    }
  }

  function visibleItems() {
    const q = state.search.trim().toLowerCase();
    let list = state.items.filter((i) => !q || i.title.toLowerCase().includes(q));
    if (state.filter === 'mais_usadas') {
      list = list.filter((i) => i.usage_count > 0).sort((a, b) => b.usage_count - a.usage_count);
    } else if (state.filter !== 'tudo') {
      list = list.filter((i) => i.type === state.filter);
    }
    return list;
  }

  // ── Lista ──────────────────────────────────────────────────────────────────

  function stateBox(icon, title, text, retry, isError = false) {
    const box = el('div', `empty${isError ? ' error' : ''}`);
    box.innerHTML = svg(icon);
    box.append(el('div', 'h', title));
    if (text) box.append(el('div', 'p', text));
    if (retry) {
      const b = el('button', 'btn primary');
      b.type = 'button';
      b.innerHTML = svg('refresh');
      b.append('Tentar de novo');
      b.addEventListener('click', () => sync({ manual: true }));
      box.append(b);
    }
    return box;
  }

  function skeleton() {
    const frag = document.createDocumentFragment();
    [3, 2].forEach((rows) => {
      const cat = el('div', 'sk-cat');
      const title = el('div', 'sk');
      title.style.cssText = 'width: 45%; height: 12px;';
      cat.append(title);
      for (let i = 0; i < rows; i++) {
        const row = el('div', 'sk-row');
        const lines = el('div', 'sk-lines');
        const l1 = el('div', 'sk'); l1.style.cssText = `width: ${70 - i * 12}%; height: 10px;`;
        const l2 = el('div', 'sk'); l2.style.cssText = `width: ${50 + i * 10}%; height: 8px;`;
        lines.append(l1, l2);
        row.append(el('div', 'sk sk-ico'), lines);
        cat.append(row);
      }
      frag.append(cat);
    });
    return frag;
  }

  function renderList() {
    if (state.view !== 'list') return;
    const scroll = listEl.scrollTop;
    listEl.textContent = '';
    renderBanner();

    if (!state.loaded) {
      if (state.error) {
        listEl.append(stateBox('alert', 'Não foi possível carregar as mensagens.', state.error, true, true));
      } else {
        listEl.append(skeleton());
      }
      return;
    }
    if (greet.open && greet.draft) listEl.append(greetingsEl());
    if (newCatOpen) listEl.append(newCategoryEl());
    const filtering = state.filter !== 'tudo' || state.search.trim() !== '';
    if (!state.items.length && (!state.categories.length || filtering)) {
      listEl.append(stateBox('inbox', 'Nenhuma mensagem cadastrada.', 'Use "+ Nova mensagem" aqui no painel ou a aba WhatsApp do ERP.', true));
      return;
    }

    const items = visibleItems();
    if (!items.length && filtering) {
      listEl.append(state.filter === 'mais_usadas'
        ? stateBox('inbox', 'Nenhuma mensagem usada ainda.', 'As mais usadas aparecem aqui depois do primeiro envio.')
        : stateBox('search', 'Nada encontrado.', 'Tente outra palavra ou outro filtro.'));
      return;
    }

    if (state.filter === 'mais_usadas') {
      const flat = el('div', 'flat');
      items.forEach((i) => flat.append(cardEl(i, { showUses: true })));
      listEl.append(flat);
    } else {
      const searching = state.search.trim() !== '';
      // 2.8.2: sem filtro nem busca, mostra também as categorias vazias; com filtro/busca, só as que têm resultado
      state.categories.forEach((cat) => {
        const catItems = items.filter((i) => i.category_id === cat.id);
        if (catItems.length || !filtering) listEl.append(categoryEl(cat, catItems, searching));
      });
    }
    listEl.scrollTop = scroll;
  }

  function categoryEl(cat, catItems, searching) {
    const section = el('section', 'cat');
    section.style.setProperty('--cat', catColor(cat.id));
    if (!searching && state.collapsed[cat.id]) section.classList.add('collapsed');

    section.dataset.cat = cat.id;
    const head = el('button', 'cat-head');
    head.type = 'button';
    head.innerHTML = svg('chevron', 'chev');
    const grip = el('span', 'cat-grip', '⋮⋮');
    grip.setAttribute('aria-hidden', 'true');
    grip.title = 'Arraste para mudar a ordem';
    head.prepend(grip);
    head.append(el('span', 'name', cat.name), el('span', 'count', String(catItems.length)));
    head.setAttribute('aria-expanded', String(!section.classList.contains('collapsed')));
    head.addEventListener('click', () => {
      const collapsed = section.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', String(!collapsed));
      state.collapsed[cat.id] = collapsed;
      storageSet({ collapsed: state.collapsed });
    });

    const top = el('div', 'cat-top');
    const opts = el('button', 'cat-opts', '···');
    opts.type = 'button';
    opts.title = 'Renomear, mudar a ordem ou apagar a categoria';
    opts.setAttribute('aria-label', `Opções da categoria "${cat.name}"`);
    opts.addEventListener('click', () => { catMenu = catMenu && catMenu.id === cat.id ? null : { id: cat.id, mode: 'menu' }; renderList(); });
    top.append(head, opts);

    const body  = el('div', 'cat-body');
    const inner = el('div', 'cat-inner');
    catItems.forEach((i) => inner.append(cardEl(i)));
    if (!catItems.length) {
      const empty = el('div', 'cat-empty');
      empty.append('Nenhuma mensagem. ');
      const add = el('button', 'cat-add', '+ Nova mensagem aqui');
      add.type = 'button';
      add.addEventListener('click', (e) => { e.stopPropagation(); openEditor(null, { categoryId: cat.id }); });
      empty.append(add);
      inner.append(empty);
    }
    if (emptyAsk && emptyAsk.id === cat.id) inner.prepend(emptyAskEl(cat));
    body.append(inner);
    section.append(top);
    if (catMenu && catMenu.id === cat.id) section.append(catMenuEl(cat, catItems));
    section.append(body);
    return section;
  }

  // 2.8.1: tipo + resumo ("Áudio de voz · 0:40", "Imagem · foto.png · 161.0 KB")
  function subtitle(item) {
    if (item.type === 'texto') return firstWords(item.body) || 'Sem texto';
    if (item.type === 'audio') {
      const dur = item.file_url && typeof mediaDur !== 'undefined' && mediaDur.has(item.file_url) ? fmtDur(mediaDur.get(item.file_url)) : formatSize(item.file_size);
      return ['Áudio de voz', dur].filter(Boolean).join(' · ');
    }
    const label = item.type === 'documento' ? 'PDF' : TYPES[item.type]?.label;
    return [label, item.file_name, formatSize(item.file_size)].filter(Boolean).join(' · ');
  }

  function cardEl(item, { showUses = false } = {}) {
    const cfg  = TYPES[item.type] || TYPES.documento;
    const card = el('div', 'card');
    card.dataset.id = item.id;

    const row  = el('div', 'card-row');
    const type = el('span', 'type');
    type.innerHTML = svg(ICONS[item.type] ? item.type : 'documento');
    type.style.color = cfg.color;
    type.style.background = `${cfg.color}22`;
    type.title = cfg.label;

    const info = el('div', 'info');
    // 2.8.1: clicar no título abre/fecha a prévia
    const t = el('button', 't', item.title);
    t.type = 'button';
    t.title = `${item.title} (clique para ver a prévia)`;
    t.setAttribute('aria-expanded', 'false');
    const sub = el('div', 'sub', subtitle(item));
    sub.title = sub.textContent;
    info.append(t, sub);
    row.append(type, info);
    if (showUses) row.append(el('span', 'uses', `${item.usage_count}x`));

    const btns = el('div', 'btns');
    const eye = t;
    t.addEventListener('click', (e) => { e.stopPropagation(); togglePreview(item, card, t); });
    const isAudio = item.type === 'audio';
    const fixedSeconds = isAudio ? recordSecondsOf(item) : null;
    const voiceHint = fixedSeconds == null ? 'gravando automático' : fixedSeconds === 0 ? 'na hora' : `gravando ${fixedSeconds} s`;
    const multi = isMultiPart(item);
    const sendTitle = multi ? `Enviar as ${item.parts.length} partes nesta conversa`
      : isAudio ? `Enviar como mensagem de voz (${voiceHint})` : 'Enviar nesta conversa';
    const send = iconButton('send', sendTitle, () => sendItemSequence(item, card, send), 'send');
    btns.append(send);
    const opts = iconButton('more', 'Prévia, editar, duplicar, excluir…', () => {
      itemMenu = itemMenu && itemMenu.id === item.id ? null : { id: item.id, mode: 'menu' };
      renderList();
    }, 'iopts');
    btns.append(opts);
    row.append(btns);
    if (multi) info.querySelector('.sub').textContent = `${item.parts.length} partes · ${subtitle(item)}`;
    if (multi && item.parts.length === 1 && Array.isArray(item.parts[0].files) && item.parts[0].files.length > 1) info.querySelector('.sub').textContent = `Várias imagens · ${item.parts[0].files.length} arquivos`;
    info.querySelector('.sub').title = info.querySelector('.sub').textContent;

    const wrap  = el('div', 'pv-wrap');
    const inner = el('div', 'pv-inner');
    wrap.append(inner);
    card.append(row);
    if (itemMenu && itemMenu.id === item.id) card.append(itemMenuEl(item, card, send));
    card.append(wrap);

    if (state.previewId === item.id) {
      fillPreview(inner, item);
      card.classList.add('pv-open');
      eye.classList.add('on');
      eye.setAttribute('aria-expanded', 'true');
    }
    if (state.busyId === item.id) setBusy(card, send, true);
    else if (state.busyId) card.querySelectorAll('.btns .send, .imenu .asfile').forEach((b) => { b.disabled = true; });
    return card;
  }

  // ── Prévia ─────────────────────────────────────────────────────────────────

  function togglePreview(item, card, eye) {
    const opening = state.previewId !== item.id;
    if (state.previewId) {
      const prev = listEl.querySelector(`.card[data-id="${state.previewId}"]`);
      if (prev) {
        prev.classList.remove('pv-open');
        const prevEye = prev.querySelector('.info .t');
        prevEye.classList.remove('on');
        prevEye.setAttribute('aria-expanded', 'false');
      }
    }
    state.previewId = opening ? item.id : null;
    if (opening) {
      fillPreview(card.querySelector('.pv-inner'), item);
      requestAnimationFrame(() => card.classList.add('pv-open'));
      eye.classList.add('on');
      eye.setAttribute('aria-expanded', 'true');
    }
  }

  function fillPreview(inner, item) {
    inner.textContent = '';
    const pv = el('div', 'pv');

    if (['imagem', 'video', 'audio'].includes(item.type) && item.file_url) {
      const media = el('div', 'pv-media loading sk');
      pv.append(media);
      getBlobUrl(item).then((url) => {
        const tag = item.type === 'imagem' ? 'img' : item.type;
        const m = document.createElement(tag);
        m.src = url;
        if (tag === 'img') m.alt = item.title;
        else { m.controls = true; m.preload = 'metadata'; }
        media.className = 'pv-media';
        media.append(m);
      }).catch((e) => {
        media.className = 'pv-note';
        media.textContent = `Não foi possível carregar a prévia: ${e.message}`;
      });
    }

    if (item.type === 'documento' && item.file_name) {
      const doc = el('div', 'pv-doc');
      doc.innerHTML = svg('documento');
      doc.firstChild.style.color = TYPES.documento.color;
      doc.append(`${item.file_name}${item.file_size != null ? ` · ${formatSize(item.file_size)}` : ''}`);
      pv.append(doc);
    }

    // 2.8.7: álbum = grade das fotos como vai chegar
    partsOf(item).forEach((p) => { if (Array.isArray(p.files) && p.files.length > 1) pv.append(albumPreviewEl(p)); });
    if (item.body || textPartsOf(item).length) {
      const slot = el('div', 'bubble-slot');
      fillBubble(slot, item);
      pv.append(slot);
    } else if (item.type === 'texto' || !item.file_url) {
      pv.append(el('div', 'pv-note', 'Sem conteúdo.'));
    }
    inner.append(pv);
  }

  function albumThumb(f, k, key) {
    const th = el('div', 'alb-thumb');
    th.append(el('span', 'md-ico', f.kind === 'video' ? '🎬' : '🖼️'));
    const mount = (url) => {
      const m = document.createElement(f.kind === 'video' ? 'video' : 'img');
      if (f.kind === 'video') { m.muted = true; m.preload = 'metadata'; m.src = `${url}#t=0.1`; } else { m.alt = ''; m.src = url; }
      th.textContent = '';
      th.append(m);
      if (f.kind === 'video') th.append(el('span', 'md-play', '▶'));
    };
    if (f.localUrl) mount(f.localUrl);
    else if (f.file_url) whenVisible(th, () => getBlobUrl({ id: key || 'arquivo', file_url: f.file_url, file_name: f.file_name }).then(mount).catch(() => {}));
    return th;
  }
  function albumPreviewEl(p) {
    const grid = el('div', `pv-album n${Math.min(p.files.length, 4)}`);
    p.files.forEach((f, k) => {
      const cell = albumThumb(f, k, 'arquivo');
      if (k === 3 && p.files.length > 4) cell.append(el('span', 'pv-more', `+${p.files.length - 4}`));
      if (k < 4) grid.append(cell);
    });
    return grid;
  }

  // ── Prévia editável (2.1.0) ──
  // Textos e legendas ficam editáveis; "Enviar só nesta conversa" manda o que está na tela e a
  // mensagem salva NÃO muda. Edições e o nome digitado ficam só na memória (por item).
  const pvEdits = new Map(); // itemId → { name: string|null, texts: { [parte]: texto } }
  const NAME_SLOT_RE = /(\{[^{}]*?\bnome\b[^{}]*?\})/gi;
  const textPartsOf = (item) => partsOf(item).map((p, i) => ({ p, i })).filter(({ p }) => p.type === 'texto' || (p.type !== 'audio' && p.body));

  // Sem nome: o lugar do {nome} aparece destacado (e some ao enviar, ou vira o nome digitado)
  function renderTemplate(target, text, name) {
    // 2.8.3: a prévia mostra o texto já trocado (sem nome, o trecho e a vírgula somem)
    if (name || chatNames.available !== false) { appendResolved(target, text, name); return 0; }
    let slots = 0;
    String(text || '').split(NAME_SLOT_RE).forEach((chunk) => {
      if (!chunk) return;
      if (/^\{[^{}]*?\bnome\b[^{}]*?\}$/i.test(chunk)) {
        slots++;
        const slot = el('span', 'var name-slot', chunk);
        slot.title = 'Sem nome: digite o nome acima ou apague';
        target.appendChild(slot);
      } else appendResolved(target, chunk, '');
    });
    return slots;
  }

  // Texto que sai, lido da bolha (o destaque do nome vira o nome digitado ou some)
  function bubbleText(bubble, name) {
    let out = '';
    bubble.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeName === 'BR') out += '\n';
      else if (n.classList && n.classList.contains('name-slot')) out += n.textContent;
      else out += n.textContent;
    });
    return fillVars(out, name);
  }

  function previewName(item) {
    const st = pvEdits.get(item.id);
    if (st && st.name) return st.name;
    return state.ctx ? state.ctx.firstName : '';
  }

  // Como o texto vai ficar na conversa aberta
  function fillBubble(slot, item) {
    slot.textContent = '';
    slot.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
    if (!pvEdits.has(item.id)) pvEdits.set(item.id, { name: null, texts: {} });
    const st = pvEdits.get(item.id);
    const detected = state.ctx ? state.ctx.firstName : '';
    const parts = textPartsOf(item);
    const usesName = parts.some(({ p }) => globalThis.TspEngine.hasNameVar(p.body));
    if (usesName && !detected) {
      const nameIn = el('input', 'ed-title pv-name');
      nameIn.type = 'text';
      nameIn.maxLength = 40;
      nameIn.value = st.name || '';
      nameIn.placeholder = 'Nome do contato (só nesta conversa)';
      nameIn.setAttribute('aria-label', 'Nome do contato só nesta conversa');
      nameIn.addEventListener('input', () => {
        st.name = nameIn.value.trim() || null;
        slot.querySelectorAll('.bubble').forEach((b) => {
          const i = Number(b.dataset.part);
          if (st.texts[i] != null) return;
          b.textContent = '';
          renderTemplate(b, partsOf(item)[i].body, st.name || '');
        });
      });
      slot.append(nameIn);
    }
    let unresolved = 0;
    const multi = parts.length > 1 || (parts[0] && parts[0].p.type !== 'texto');
    parts.forEach(({ p, i }) => {
      const albumPart = Array.isArray(p.files) && p.files.length > 1;
      const albumBefore = albumPart && !!(p.files[0] && p.files[0].caption_before);
      if (multi) slot.append(el('div', 'pv-part', `Parte ${i + 1}${albumPart ? (albumBefore ? ' (mensagem antes das fotos)' : ' (mensagem depois das fotos)') : p.type !== 'texto' ? ' (legenda)' : ''}`));
      const bubble = el('div', 'bubble');
      bubble.dataset.part = String(i);
      bubble.setAttribute('contenteditable', 'plaintext-only');
      bubble.setAttribute('role', 'textbox');
      bubble.setAttribute('aria-label', `Texto da parte ${i + 1} (editável só nesta conversa)`);
      if (st.texts[i] != null) bubble.textContent = st.texts[i];
      else {
        renderTemplate(bubble, p.body, st.name || detected);
        unresolved += bubble.querySelectorAll('.var:not(.name-slot)').length;
      }
      bubble.addEventListener('input', () => { st.texts[i] = bubbleText(bubble, st.name || detected); });
      slot.append(bubble);
    });
    const notes = [];
    if (usesName) notes.push(detected ? `{nome} trocado por "${detected}".` : 'Sem nome para esta conversa: digite acima ou deixe vazio (o trecho do nome some).');
    if (unresolved) notes.push('Em laranja: variáveis que você troca à mão antes de enviar.');
    if (parts.length) notes.push('Você pode editar o texto aqui: vale só para este envio.');
    if (usesName && !(st.name || detected) && chatNames.available !== false) slot.append(el('div', 'pv-warn', 'Sem nome para esta conversa (vai sair sem nome)'));
    if (notes.length) slot.append(el('div', 'pv-note', notes.join(' ')));
    if (parts.length) {
      const row = el('div', 'ed-add');
      const go = el('button', 'btn primary pv-send', 'Enviar só nesta conversa');
      go.type = 'button';
      go.addEventListener('click', (e) => { e.stopPropagation(); sendEditedPreview(item, slot); });
      const restore = el('button', 'btn pv-restore', 'Restaurar');
      restore.type = 'button';
      restore.addEventListener('click', (e) => { e.stopPropagation(); pvEdits.delete(item.id); fillBubble(slot, item); });
      row.append(go, restore);
      slot.append(row);
    }
  }

  async function sendEditedPreview(item, slot) {
    if (state.busyId || seq) { toast('Já tem um envio em andamento. Espere terminar ou clique em Parar.', 'warn', 5000); return; }
    if (!getContext().conv) { toast('Abra uma conversa', 'warn'); return; }
    const st = await waStatusForSend();
    if (!st || !st.ready) { toast('O WhatsApp ainda não está pronto para enviar. Tente de novo em instantes.', 'warn', 6000); return; }
    const chatId = await openIndividualChat();
    if (!chatId) return;
    const name = previewName(item);
    const parts = partsOf(item).map((p, i) => {
      if (!(p.type === 'texto' || (p.type !== 'audio' && p.body))) return p;
      const bubble = slot.querySelector(`.bubble[data-part="${i}"]`);
      return { ...p, body: bubble ? bubbleText(bubble, name) : fillVars(p.body || '', name) };
    });
    if (parts.some((p) => p.type === 'texto' && !String(p.body || '').trim())) { toast('Uma parte de texto ficou vazia.', 'warn', 5000); return; }
    state.busyId = item.id;
    setSendButtonsDisabled(true);
    try {
      const noLearn = !name && partsOf(item).some((p) => globalThis.TspEngine.hasNameVar(p.body)); // 2.9.1
      const res = await runSequence({ parts, chatId, firstName: name, noLearn });
      sequenceToast(res, parts.length);
      if (res.status === 'ok') { registerUse(item); applyItemLabels(item, targetForOpenChat(chatId)); }
    } finally {
      state.busyId = null;
      setSendButtonsDisabled(false);
    }
  }

  function refreshOpenBubble() {
    if (!state.previewId) return;
    const card = listEl.querySelector(`.card[data-id="${state.previewId}"]`);
    const item = state.items.find((i) => i.id === state.previewId);
    const slot = card && card.querySelector('.bubble-slot');
    if (slot && item) fillBubble(slot, item);
  }

  // ── Usar um item ───────────────────────────────────────────────────────────

  function setBusy(card, send, busy) {
    card.classList.toggle('busy', busy);
    setIcon(send, busy ? 'refresh' : 'send');
    if (busy) send.querySelector('svg').classList.add('spin');
    setSendButtonsDisabled(busy);
  }

  // Só um envio por vez (inclusive "Como arquivo")
  function setSendButtonsDisabled(disabled) {
    listEl.querySelectorAll('.btns .send, .imenu .asfile').forEach((b) => { b.disabled = disabled; });
  }

  // ── Mensagem rápida que etiqueta (2.1.0): só depois que a mensagem INTEIRA saiu ──
  function targetForOpenChat(chatId) {
    const id = state.ctx && state.ctx.identity;
    if (canLabel(id)) return { identity: { ...identityPayload(id), chatId: chatId || undefined } };
    return chatId ? { chatId } : null;
  }

  async function applyItemLabels(item, target) {
    if (!item || !target) return;
    if (item.on_send_add_label_id || item.on_send_remove_label_id || item.on_send_remove_all_crm) {
      try {
        const r = await call('applySendLabels', { addLabelId: item.on_send_add_label_id || null, removeLabelId: item.on_send_remove_all_crm ? null : item.on_send_remove_label_id || null, removeAll: !!item.on_send_remove_all_crm, ...target });
        if (r && r.applied) afterLabelChange();
      } catch {
        toast('Enviado, mas não consegui trocar a etiqueta CRM.', 'warn', 5000);
      }
    }
    await applyItemWaLabels(item, target);
  }

  // 2.7.1: etiquetas do WhatsApp "ao enviar" (mesma troca das automações: motor.setWaLabel).
  // Etiqueta que não existe mais no WhatsApp é ignorada sem erro.
  async function applyItemWaLabels(item, target) {
    const want = { add: item.on_send_add_wa_label_id ? String(item.on_send_add_wa_label_id) : null, remove: item.on_send_remove_wa_label_id ? String(item.on_send_remove_wa_label_id) : null };
    if (want.add && want.add === want.remove) want.remove = null;
    const removeAllWa = !!item.on_send_remove_all_wa;
    if (removeAllWa) want.remove = null;
    if (!want.add && !want.remove && !removeAllWa) return;
    let chatId = target.chatId || (target.identity && target.identity.chatId) || null;
    if (!chatId) {
      try { const c = await waRequest('activeChat', {}, { timeout: 2000 }); if (c && c.kind === 'individual') chatId = c.chatId; } catch { /* sem conversa */ }
    }
    if (!chatId) return;
    if (removeAllWa) {
      // 2.8.6: tira de todas as etiquetas do WhatsApp da conversa (uma por vez), menos a que vai colocar e a "Não enviar"
      if (!Array.isArray(state.waLabels)) await refreshBar().catch(() => {});
      let now = [];
      try { const r = await waRequest('chatLabels', { chatId }, { timeout: 5000 }); now = (r && r.labelIds) || []; } catch { now = []; }
      const noSend = (id) => { const l = waLabelById(String(id)); return !!l && String(l.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'nao enviar'; };
      let failed = false;
      for (const lid of now.map(String)) {
        if (lid === want.add || noSend(lid)) continue;
        if (!(await motor.setWaLabel(chatId, { remove: lid }))) failed = true;
      }
      if (failed) toast('Enviado, mas não consegui tirar todas as etiquetas do WhatsApp.', 'warn', 5000);
      if (!want.add) return;
    }
    const existing = () => ({ add: want.add && waLabelById(want.add) ? want.add : null, remove: want.remove && waLabelById(want.remove) ? want.remove : null });
    if (!Array.isArray(state.waLabels)) await refreshBar().catch(() => {});
    let ch = Array.isArray(state.waLabels) ? existing() : want;
    if (!ch.add && !ch.remove) return;
    if (await motor.setWaLabel(chatId, ch)) return;
    // falhou: relê as etiquetas; se alguma foi apagada, tenta só com as que existem (ou ignora)
    await refreshBar().catch(() => {});
    if (!Array.isArray(state.waLabels)) { toast('Enviado, mas não consegui trocar a etiqueta do WhatsApp.', 'warn', 5000); return; }
    const again = existing();
    if (!again.add && !again.remove) return;
    if (again.add !== ch.add || again.remove !== ch.remove) { ch = again; if (await motor.setWaLabel(chatId, ch)) return; }
    toast('Enviado, mas não consegui trocar a etiqueta do WhatsApp.', 'warn', 5000);
  }

  function registerUse(item) {
    item.usage_count += 1;
    state.lastUsed = item.title;
    storageSet({ lastUsed: state.lastUsed });
    saveCache();
    renderLastUsed();
    call('incrementUsage', { id: item.id })
      .then((count) => { item.usage_count = count; saveCache(); })
      .catch(() => { /* o contador local já foi atualizado */ });
  }

  async function sendItem(item, card, send, { asFile = false } = {}) {
    if (state.busyId) return;
    const ctx = getContext();
    state.ctx = ctx;
    if (!ctx.composer) { toast('Abra uma conversa', 'warn'); return; }
    const composer = ctx.composer.el;
    const asVoice = item.type === 'audio' && !asFile;

    state.busyId = item.id;
    setBusy(card, send, true);
    try {
      const text = fillVars(item.body || '', ctx.firstName);

      if (item.type === 'texto') {
        if (!text.trim()) throw new Error('Este item não tem texto.');
        if (!(await insertText(composer, text))) throw new Error('Não consegui escrever na caixa de mensagem.');
        toast('Texto pronto na conversa. Confira e aperte Enter.', 'ok');
        registerUse(item);
        return;
      }

      if (!item.file_url) throw new Error('Este item não tem arquivo.');

      let fallbackNote = null;
      if (asVoice) {
        // 1) Rápido: WA-JS envia como mensagem de voz (só arquivos Ogg/Opus)
        const fast = await sendVoiceFast(item);
        if (fast.status === 'ok') { registerUse(item); applyItemLabels(item, targetForOpenChat(null)); return; }
        if (fast.status === 'stop') return;
        // 2) Plano B: gravação simulada pela ponte do microfone (o WhatsApp codifica o áudio)
        const planB = getContext();
        if (!planB.composer) { toast('Abra uma conversa', 'warn'); return; }
        const result = await sendVoice(item, planB);
        if (result.status === 'ok') { registerUse(item); return; }
        if (result.status === 'cancelled') return;
        // 3) Plano C: anexar como arquivo
        fallbackNote = 'Enviei como arquivo de áudio (gravação não disponível)';
      }

      const fresh = fallbackNote ? getContext() : ctx;
      if (!fresh.composer) { toast('Abra uma conversa', 'warn'); return; }
      toast(fallbackNote ? `${fallbackNote}. Anexando...` : 'Baixando arquivo...', fallbackNote ? 'warn' : 'info', 0);
      const blob = await getFile(item);
      const file = new File([blob], item.file_name || 'arquivo', { type: blob.type });
      const caption = await attachFile(fresh.composer.el, file);
      if (!caption) {
        toast('O WhatsApp não abriu a prévia do anexo. Se ela abriu, confira antes de enviar.', 'warn', 6000);
        return;
      }
      registerUse(item);
      const captionOk = !text.trim() || (await insertText(caption, text));
      if (fallbackNote) {
        toast(`${fallbackNote}. Confira e envie.`, 'warn', 8000);
      } else if (!text.trim()) {
        toast('Arquivo anexado. Confira e envie.', 'ok');
      } else if (captionOk) {
        toast('Arquivo anexado com legenda. Confira e envie.', 'ok');
      } else if (await copyToClipboard(text)) {
        toast('Arquivo anexado. Legenda copiada: cole com Ctrl+V.', 'warn', 6000);
      } else {
        toast('Arquivo anexado, mas não consegui preencher a legenda.', 'warn', 6000);
      }
    } catch (e) {
      toast(e.message, 'error', 6000);
    } finally {
      state.busyId = null;
      if (card.isConnected) setBusy(card, send, false);
      else setSendButtonsDisabled(false);
      if (state.filter === 'mais_usadas') renderList();
    }
  }

  // ── Áudio como mensagem de voz (ponte do microfone em mic-bridge.js) ───────
  // Fluxo: arma a ponte com o áudio → clica em gravar do WhatsApp → o WhatsApp pede o microfone
  // e recebe o áudio → no fim, clica em PAUSAR. Nunca clica em enviar.

  const BRIDGE_IN  = 'tsp-wa-content';
  const BRIDGE_OUT = 'tsp-wa-bridge';
  const bridgeWaiters = new Set();
  let voice = null; // gravação em andamento

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== BRIDGE_OUT || typeof d.type !== 'string') return;
    [...bridgeWaiters].forEach((fn) => fn(d));
  });

  function toBridge(msg, transfer) {
    window.postMessage({ source: BRIDGE_IN, ...msg }, window.location.origin, transfer || []);
  }

  function waitBridge(match, timeout) {
    return new Promise((resolve) => {
      const fn = (d) => { if (match(d)) { clearTimeout(timer); bridgeWaiters.delete(fn); resolve(d); } };
      const timer = setTimeout(() => { bridgeWaiters.delete(fn); resolve(null); }, timeout);
      bridgeWaiters.add(fn);
    });
  }

  async function pingBridge() {
    const id = `p${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const reply = waitBridge((d) => d.type === 'pong' && d.id === id, 800);
    toBridge({ type: 'ping', id });
    const res = await reply;
    state.bridgeOk = !!(res && res.ready);
    return state.bridgeOk;
  }

  function composerText(box) {
    return ((box.innerText != null ? box.innerText : box.textContent) || '').trim();
  }

  // Botões da gravação: procura no rodapé da conversa, nunca dentro das mensagens
  function findConvButton(selectors, root) {
    const scopes = [...root.querySelectorAll('footer'), root];
    for (const scope of scopes) {
      for (const s of selectors) {
        for (const node of scope.querySelectorAll(s)) {
          if (node.closest('[data-id]') || host.contains(node) || !isVisible(node)) continue;
          return node.closest('button, [role="button"]') || node;
        }
      }
    }
    return null;
  }

  const convKeyOf = (ctx) => (ctx && ctx.identity && ctx.identity.key) || `${ctx && ctx.identity ? ctx.identity.kind : 'none'}:${(ctx && ctx.fullName) || ''}`;

  const mmss = (s) => {
    const t = Math.max(0, Math.round(s));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };

  function renderVoice() {
    if (!voice) { voiceEl.hidden = true; return; }
    voiceEl.hidden = false;
    const recording = voice.phase === 'rec';
    voiceEl.classList.toggle('prep', !recording);
    voiceTitle.textContent = recording ? 'Gravando áudio…' : 'Preparando áudio…';
    if (recording) {
      const elapsed = Math.min(voice.duration, (Date.now() - voice.startedAt) / 1000);
      voiceTime.textContent = `${mmss(elapsed)} / ${mmss(voice.duration)}`;
      voiceFill.style.width = `${voice.duration ? Math.min(100, (elapsed / voice.duration) * 100) : 0}%`;
    } else {
      voiceTime.textContent = '';
      voiceFill.style.width = '0%';
    }
  }

  function clickDiscard(root) {
    const btn = root && findConvButton(SEL.discardButton, root);
    if (btn) btn.click();
    return !!btn;
  }

  // ── Biblioteca WA-JS (wa-bridge.js, mundo da página) ───────────────────────
  // Protocolo próprio, separado da ponte do microfone:
  //   pedido   { source: 'tsp-wajs-content', id, type, payload }
  //   resposta { source: 'tsp-wajs-bridge', id, type, ok, data | error: { code, message, stage } }

  const WAJS_IN  = 'tsp-wajs-content';
  const WAJS_OUT = 'tsp-wajs-bridge';
  const waPending = new Map(); // id -> { resolve, reject, timer }

  const newRequestId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.source !== WAJS_OUT || typeof d.id !== 'string') return;
    const pending = waPending.get(d.id);
    if (!pending) return;
    waPending.delete(d.id);
    clearTimeout(pending.timer);
    if (d.ok) {
      pending.resolve(d.data);
    } else {
      const info = d.error || {};
      pending.reject(Object.assign(new Error(info.message || 'Erro na biblioteca'), { code: info.code || 'unexpected', stage: info.stage || 'before-send' }));
    }
  });

  function waRequest(type, payload = {}, { timeout = 2000, transfer = [], id = newRequestId('w') } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waPending.delete(id);
        // Sem resposta: não dá para saber se algo já foi enviado
        reject(Object.assign(new Error('A biblioteca não respondeu'), { code: 'timeout', stage: 'unknown' }));
      }, timeout);
      waPending.set(id, { resolve, reject, timer });
      window.postMessage({ source: WAJS_IN, id, type, payload }, window.location.origin, transfer);
    });
  }

  async function refreshWaStatus() {
    try {
      state.waStatus = await waRequest('status', {}, { timeout: 2000 });
    } catch {
      state.waStatus = null;
    }
    state.waStatusAt = Date.now();
    return state.waStatus;
  }

  // Se a ponte não respondeu há pouco, não espera de novo a cada áudio
  function waStatusForSend() {
    const recentlyAbsent = state.waStatusAt && !state.waStatus && Date.now() - state.waStatusAt < 30 * 1000;
    return recentlyAbsent ? Promise.resolve(null) : refreshWaStatus();
  }

  // Ogg/Opus: começa com "OggS" e tem "OpusHead" nos primeiros 64 bytes
  function isOggOpus(bytes) {
    let ascii = '';
    for (const b of bytes) ascii += String.fromCharCode(b);
    return ascii.startsWith('OggS') && ascii.includes('OpusHead');
  }

  async function audioDurationMs(blob) {
    const ctx = new OfflineAudioContext(1, 1, 48000);
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return Math.round(buffer.duration * 1000);
  }

  // record_seconds do cadastro: inteiro de 0 a 60; qualquer outra coisa (vazio etc.) = automático
  function recordSecondsOf(item) {
    const s = item && item.record_seconds;
    return Number.isInteger(s) && s >= 0 && s <= 60 ? s : null;
  }

  // Resultado: 'ok' (enviado), 'stop' (não seguir para os planos B/C) ou 'fallback' (seguir para o plano B)
  async function sendVoiceFast(item) {
    const st = await waStatusForSend();
    if (!st || !st.ready) return { status: 'fallback' };

    const blob = await getFile(item);
    const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
    if (!isOggOpus(head)) return { status: 'fallback' };

    let chat;
    try {
      chat = await waRequest('activeChat', {}, { timeout: 2000 });
    } catch {
      return { status: 'fallback' };
    }
    if (!chat || chat.kind !== 'individual' || typeof chat.chatId !== 'string') {
      toast('Abra uma conversa individual', 'warn', 6000);
      return { status: 'stop' };
    }

    // Tempo de "gravando áudio…": o do cadastro (0 a 60 s) ou automático (duração do áudio, 2 a 8 s)
    const fixedSeconds = recordSecondsOf(item);
    const recordMs = fixedSeconds != null
      ? fixedSeconds * 1000
      : Math.min(8000, Math.max(2000, await audioDurationMs(blob).catch(() => 4000)));
    const instant = recordMs === 0; // na hora: sem "gravando…" e sem tempo para cancelar
    const startKey = convKeyOf(getContext());
    const reqId = newRequestId('s');
    let ticker = null;
    let watcher = null;
    if (!instant) {
      voice = { id: reqId, mode: 'fast', phase: 'rec', cancelled: false, cancelRequested: false, startedAt: Date.now(), duration: recordMs / 1000 };
      renderVoice();
      ticker = setInterval(renderVoice, 250);
      // Trocou de conversa durante o "gravando…": cancela (o áudio iria para a conversa anterior)
      watcher = setInterval(() => {
        if (voice && voice.id === reqId && convKeyOf(getContext()) !== startKey) cancelVoice('Você trocou de conversa: gravação cancelada.');
      }, 400);
    }

    try {
      const audio = await blob.arrayBuffer();
      await waRequest('sendVoice', { chatId: chat.chatId, audio, recordMs }, { id: reqId, timeout: recordMs + 20000, transfer: [audio] });
      toast('Áudio enviado como mensagem de voz (rápido).', 'ok', 6000);
      return { status: 'ok' };
    } catch (e) {
      if (e.code === 'cancelled') return { status: 'stop' };
      if (e.stage === 'before-send') return { status: 'fallback' };
      // Envio já começou (ou sem resposta): nada de plano B, para não mandar em dobro
      toast('Não consegui confirmar o envio. Confira a conversa antes de tentar de novo.', 'error', 12000);
      return { status: 'stop' };
    } finally {
      clearInterval(ticker);
      clearInterval(watcher);
      if (voice && voice.id === reqId) voice = null;
      renderVoice();
    }
  }

  // Cancelar só funciona enquanto mostra "gravando…"; depois que o envio começou, não dá
  async function cancelVoiceFast(message) {
    const v = voice;
    if (!v || v.cancelRequested) return;
    v.cancelRequested = true;
    let res = null;
    try { res = await waRequest('cancel', { id: v.id }, { timeout: 2000 }); } catch { res = null; }
    if (res && res.cancelled) {
      v.cancelled = true;
      toast(message, 'warn', 6000);
    } else {
      toast('O envio já começou: não dá mais para cancelar.', 'info', 5000);
    }
  }

  function cancelVoice(message) {
    if (!voice || voice.cancelled) return;
    if (voice.mode === 'fast') { cancelVoiceFast(message); return; }
    voice.cancelled = true;
    toBridge({ type: 'stop', id: voice.id });
    if (voice.phase === 'rec' || voice.micClicked) clickDiscard(voice.root);
    toast(message, 'warn', 6000);
    if (voice.wake) voice.wake();
  }

  async function sendVoice(item, ctx) {
    const id = `v${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const startKey = convKeyOf(ctx);
    voice = { id, phase: 'prep', cancelled: false, micClicked: false, root: ctx.conv.root, startedAt: 0, duration: 0, wake: null };
    renderVoice();
    let ticker = null;
    // Trocou de conversa no meio: cancela
    const watcher = setInterval(() => {
      if (voice && voice.id === id && convKeyOf(getContext()) !== startKey) cancelVoice('Você trocou de conversa: gravação cancelada.');
    }, 400);
    const cancelled = () => !voice || voice.id !== id || voice.cancelled;

    try {
      const blob = await getFile(item);
      if (cancelled()) return { status: 'cancelled' };
      if (!(await pingBridge())) return { status: 'fallback', reason: 'ponte do microfone indisponível' };
      if (cancelled()) return { status: 'cancelled' };

      const now = getContext();
      if (!now.composer) return { status: 'fallback', reason: 'conversa sem caixa de mensagem' };
      if (composerText(now.composer.el)) {
        toast('Apague o texto da caixa para enviar o áudio', 'warn', 6000);
        return { status: 'cancelled' };
      }
      const mic = findConvButton(SEL.micButton, now.conv.root);
      if (!mic) return { status: 'fallback', reason: 'botão de gravar não encontrado' };

      const audio = await blob.arrayBuffer();
      const armed = waitBridge((d) => d.id === id && (d.type === 'armed' || d.type === 'error'), 1000);
      toBridge({ type: 'arm', id, audio }, [audio]);
      const armReply = await armed;
      if (!armReply || armReply.type !== 'armed') return { status: 'fallback', reason: 'ponte do microfone não respondeu' };
      if (cancelled()) return { status: 'cancelled' };

      const requested = waitBridge((d) => d.id === id && d.type === 'requested', 3000);
      voice.micClicked = true;
      mic.click();
      if (!(await requested)) {
        toBridge({ type: 'disarm' });
        if (!cancelled()) clickDiscard(now.conv.root); // por segurança, se abriu a gravação com o microfone real
        return cancelled() ? { status: 'cancelled' } : { status: 'fallback', reason: 'o WhatsApp não pediu o microfone' };
      }

      const playing = await waitBridge((d) => d.id === id && (d.type === 'playing' || d.type === 'error'), 8000);
      if (cancelled()) return { status: 'cancelled' };
      if (!playing || playing.type !== 'playing') {
        toBridge({ type: 'stop', id });
        clickDiscard(now.conv.root);
        return { status: 'fallback', reason: 'não consegui tocar o áudio' };
      }

      voice.phase = 'rec';
      voice.duration = Number(playing.duration) || 0;
      voice.startedAt = Date.now() + 250; // a ponte começa a tocar com 0,25 s de folga
      renderVoice();
      ticker = setInterval(renderVoice, 250);

      // Espera o fim do áudio (ou cancelar)
      await Promise.race([
        waitBridge((d) => d.id === id && (d.type === 'ended' || d.type === 'error'), voice.duration * 1000 + 15000),
        new Promise((resolve) => { voice.wake = resolve; }),
      ]);
      if (cancelled()) return { status: 'cancelled' };

      await sleep(400);
      if (cancelled()) return { status: 'cancelled' };
      const pause = findConvButton(SEL.pauseButton, now.conv.root);
      if (pause) {
        pause.click();
        toast('Pronto! Confira e aperte enviar no WhatsApp (gravação simulada, mais lenta).', 'ok', 8000);
      } else {
        toast('Terminou. Aperte enviar agora', 'warn', 8000);
      }
      return { status: 'ok' };
    } finally {
      clearInterval(watcher);
      clearInterval(ticker);
      if (voice && voice.id === id) voice = null;
      renderVoice();
    }
  }

  // ── Sequência: enviar um item de várias partes (1.9.0) ─────────────────────
  // Só por clique do usuário (ou agendamento criado por ele). Uma sequência por vez, sempre
  // visível no rodapé com "Parar". Erro durante o envio de uma parte (ou sem resposta) = para tudo
  // e nunca reenvia sozinho.

  const SEQ_TEXT_MAX = 4096;
  let seq = null; // { total, index, phase: 'wait' | 'typing' | 'send', until, stop, reqId, label }

  // Partes do item; item antigo (sem linhas em wa_item_parts) = 1 parte com os campos do próprio item
  function partsOf(item) {
    if (Array.isArray(item.parts) && item.parts.length) return item.parts.map((p) => ({ ...p }));
    return [{
      id: item.id, type: item.type, body: item.body || null, file_url: item.file_url, file_name: item.file_name, file_size: item.file_size,
      wait_seconds: 0, typing_seconds: item.type === 'audio' ? recordSecondsOf(item) : 0,
    }];
  }
  const isMultiPart = (item) => Array.isArray(item.parts) && item.parts.length > 0;

  function renderSeq() {
    if (!seq) { seqEl.hidden = true; return; }
    seqEl.hidden = false;
    const left = Math.max(0, Math.ceil((seq.until - Date.now()) / 1000));
    let txt = `${seq.label ? `${seq.label} · ` : ''}Enviando ${seq.index}/${seq.total}`;
    if (seq.stop) txt += ' · parando…';
    else if (seq.phase === 'wait' && left) txt += ` · aguardando ${left}s`;
    else if (seq.phase === 'typing' && left) txt += ` · ${seq.typingLabel} ${left}s`;
    seqTxt.textContent = txt;
    seqStop.disabled = seq.stop;
  }

  function stopSequence() {
    if (!seq || seq.stop) return;
    seq.stop = true;
    if (seq.reqId) waRequest('cancel', { id: seq.reqId }, { timeout: 2000 }).catch(() => {}); // só vale antes do envio
    if (seq.onStop) seq.onStop();
    renderSeq();
  }

  async function waitUnlessStopped(ms) {
    const end = Date.now() + ms;
    while (seq && !seq.stop && Date.now() < end) await sleep(Math.min(200, end - Date.now()));
  }

  const partAsItem = (p, i) => ({ id: p.id || `parte${i}`, file_url: p.file_url, file_name: p.file_name });

  // Envia uma parte; erros vêm com stage ('before-send', 'sending' ou 'unknown' quando não houve resposta)
  // newChat (2.0.0-D2, só disparo com "permitir conversas novas"): a 1ª parte vai pelo pedido
  // campaignSend da ponte (confere o número com queryExists e cria a conversa), sem "digitando…"
  async function sendPart(part, i, chatId, firstName, reqId, newChat = false) {
    const typingMs = Number.isInteger(part.typing_seconds) ? Math.min(60, Math.max(0, part.typing_seconds)) * 1000 : null;
    const campaignSend = (p, transfer = []) => waRequest('campaignSend', { campaign: true, chatId, ...p }, { id: reqId, timeout: 150000, transfer });
    if (part.type === 'texto') {
      const text = fillVars(part.body || '', firstName);
      if (!text.trim()) throw Object.assign(new Error('parte sem texto'), { code: 'empty', stage: 'before-send' });
      if (newChat) { await campaignSend({ kind: 'texto', text: text.slice(0, SEQ_TEXT_MAX) }); return; }
      await waRequest('sendText', { chatId, text: text.slice(0, SEQ_TEXT_MAX), typingMs: typingMs || 0 }, { id: reqId, timeout: (typingMs || 0) + 20000 });
      return;
    }
    if (Array.isArray(part.files) && part.files.length > 1) return sendAlbum(part, i, chatId, firstName, reqId, newChat, typingMs);
    if (!part.file_url) throw Object.assign(new Error('parte sem arquivo'), { code: 'empty', stage: 'before-send' });
    let blob;
    try {
      blob = await getFile(partAsItem(part, i));
    } catch (e) {
      throw Object.assign(new Error(`não consegui baixar o arquivo (${e.message})`), { code: 'download', stage: 'before-send' });
    }
    if (part.type === 'audio') {
      const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
      if (isOggOpus(head) && newChat) {
        const audio = await blob.arrayBuffer();
        await campaignSend({ kind: 'voz', data: audio }, [audio]);
        return;
      }
      if (isOggOpus(head)) {
        // Mensagem de voz: "gravando…" = typing_seconds (0 = na hora; vazio = automático pela duração)
        const recordMs = typingMs != null ? typingMs : Math.min(8000, Math.max(2000, await audioDurationMs(blob).catch(() => 4000)));
        const audio = await blob.arrayBuffer();
        await waRequest('sendVoice', { chatId, audio, recordMs, requireLoaded: true }, { id: reqId, timeout: recordMs + 30000, transfer: [audio] });
        return;
      }
    }
    const kind = part.type === 'audio' ? 'audio-arquivo' : part.type;
    const data = await blob.arrayBuffer();
    const mime = (blob.type || 'application/octet-stream').split(';')[0];
    const caption = part.type === 'audio' ? null : fillVars(part.body || '', firstName).slice(0, SEQ_TEXT_MAX);
    if (newChat) {
      await campaignSend({ kind, data, mime, fileName: (part.file_name || 'arquivo').slice(0, 200), caption }, [data]);
      return;
    }
    await waRequest('sendMedia', { chatId, kind, data, mime, fileName: (part.file_name || 'arquivo').slice(0, 200), caption, typingMs: typingMs || 0 },
      { id: reqId, timeout: (typingMs || 0) + 120000, transfer: [data] });
  }

  // 2.8.7: álbum: as fotos/vídeos saem em seguida (sem pausa) para o WhatsApp agrupar. "digitando" só antes da 1ª
  // mensagem. Se um arquivo falhar, os outros continuam e o aviso diz qual falhou.
  // 2.8.9: a WA-JS 4.7.2 não tem envio de álbum (várias mídias numa mensagem): as fotos vão SEM legenda e a legenda
  // vai como mensagem de texto separada, logo depois da última foto (~1,5 s) ou antes das fotos.
  const ALBUM_CAPTION_GAP_MS = 1500;
  async function sendAlbumCaption(text, chatId, reqId, newChat, typingMs) {
    if (newChat) await waRequest('campaignSend', { campaign: true, chatId, kind: 'texto', text }, { id: reqId, timeout: 150000 });
    else await waRequest('sendText', { chatId, text, typingMs: typingMs || 0 }, { id: reqId, timeout: (typingMs || 0) + 20000 });
  }
  async function sendAlbum(part, i, chatId, firstName, reqId, newChat, typingMs) {
    const failed = [];
    let sentAny = false;
    const caption = fillVars(part.body || '', firstName).slice(0, SEQ_TEXT_MAX).trim();
    const before = !!(part.caption_before || (part.files[0] && part.files[0].caption_before));
    let typingLeft = typingMs || 0;
    if (caption && before) {
      try { await sendAlbumCaption(caption, chatId, reqId, newChat, typingLeft); typingLeft = 0; } catch (e) {
        if (e.code === 'cancelled') throw e;
        throw Object.assign(new Error(`não consegui enviar a legenda (${e.message})`), { code: e.code || 'album', stage: e.stage || 'sending' });
      }
      sentAny = true;
    }
    let sentFiles = 0;
    for (let k = 0; k < part.files.length; k++) {
      const f = part.files[k];
      const fileName = (f.file_name || `arquivo ${k + 1}`).slice(0, 200);
      try {
        const blob = await getFile({ id: `${part.id || `p${i}`}-${k}`, file_url: f.file_url, file_name: f.file_name });
        const data = await blob.arrayBuffer();
        const mime = (blob.type || 'application/octet-stream').split(';')[0];
        const kind = f.kind === 'video' ? 'video' : 'imagem';
        if (newChat) await waRequest('campaignSend', { campaign: true, chatId, kind, data, mime, fileName, caption: null }, { id: reqId, timeout: 150000, transfer: [data] });
        else await waRequest('sendMedia', { chatId, kind, data, mime, fileName, caption: null, typingMs: typingLeft }, { id: reqId, timeout: typingLeft + 120000, transfer: [data] });
        typingLeft = 0;
        sentAny = true;
        sentFiles++;
        if (seq && seq.stop) break;
      } catch (e) {
        if (e.code === 'cancelled') throw e;
        failed.push(fileName);
      }
    }
    if (!sentFiles) throw Object.assign(new Error(`nenhum arquivo do álbum saiu (${failed.join(', ')})`), { code: 'album', stage: 'sending' });
    if (caption && !before && !(seq && seq.stop)) {
      await waitUnlessStopped(ALBUM_CAPTION_GAP_MS);
      if (!(seq && seq.stop)) {
        try { await sendAlbumCaption(caption, chatId, reqId, newChat, 0); } catch (e) {
          if (e.code === 'cancelled') throw e;
          failed.push('legenda');
        }
      }
    }
    return { failedFiles: failed };
  }

  // Resultado: { status: 'ok' | 'stopped' | 'failed', sent, failedAt, stage, message }
  async function runSequence({ parts, chatId, firstName = '', label = '', onStop = null, newChat = false, noLearn = false }) {
    if (seq) return { status: 'failed', sent: 0, stage: 'before-send', message: 'já existe um envio em andamento' };
    // 2.9.1: mensagem com {nome} que saiu com o nome VAZIO não ensina nome (durante o envio e um pouco depois)
    const hasVar = (t) => globalThis.TspEngine.hasNameVar(t);
    const quiet = noLearn || (!firstName && (parts || []).some((p) => hasVar(p && p.body) || (Array.isArray(p && p.files) && p.files.some((f) => hasVar(f && f.caption)))));
    if (quiet && chatId) noLearnUntil.set(chatId, Infinity);
    seq = { total: parts.length, index: 0, phase: 'wait', until: 0, stop: false, reqId: null, label, typingLabel: 'digitando', onStop };
    const ticker = setInterval(renderSeq, 250);
    renderSeq();
    let sent = 0;
    const failedFiles = [];
    try {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        seq.index = i + 1;
        seq.reqId = null;
        const waitMs = Math.min(600, Math.max(0, Number(part.wait_seconds) || 0)) * 1000;
        if (waitMs) {
          seq.phase = 'wait';
          seq.until = Date.now() + waitMs;
          renderSeq();
          await waitUnlessStopped(waitMs);
        }
        if (seq.stop) return { status: 'stopped', sent };
        const firstNew = newChat && i === 0;
        const typing = !firstNew && Number.isInteger(part.typing_seconds) ? part.typing_seconds : 0;
        seq.phase = typing ? 'typing' : 'send';
        seq.typingLabel = part.type === 'audio' ? 'gravando' : 'digitando';
        seq.until = Date.now() + typing * 1000;
        seq.reqId = newRequestId('q');
        renderSeq();
        try {
          const r = await sendPart(part, i, chatId, firstName, seq.reqId, firstNew);
          if (r && Array.isArray(r.failedFiles)) failedFiles.push(...r.failedFiles);
        } catch (e) {
          if (e.code === 'cancelled') return { status: 'stopped', sent };
          return { status: 'failed', sent, failedAt: i + 1, stage: e.stage === 'before-send' ? 'before-send' : 'sending', message: e.message, code: e.code };
        }
        sent++;
        if (seq.stop && i < parts.length - 1) return { status: 'stopped', sent };
      }
      return failedFiles.length ? { status: 'ok', sent, failedFiles } : { status: 'ok', sent };
    } finally {
      clearInterval(ticker);
      seq = null;
      renderSeq();
      if (quiet && chatId) noLearnUntil.set(chatId, Date.now() + 20000);
    }
  }

  function sequenceToast(res, total) {
    if (res.status === 'ok' && res.failedFiles && res.failedFiles.length) { toast(`Enviado, mas não consegui enviar: ${res.failedFiles.join(', ')}.`, 'warn', 10000); return; }
    if (res.status === 'ok') { toast(total > 1 ? `Enviado: ${total} partes.` : 'Enviado.', 'ok', 4000); return; }
    if (res.status === 'stopped') { toast(`Parado: ${res.sent} de ${total} enviada${res.sent === 1 ? '' : 's'}.`, 'warn', 6000); return; }
    if (res.stage === 'sending') {
      toast(`Não consegui confirmar o envio da parte ${res.failedAt}. Confira a conversa antes de tentar de novo.`, 'error', 12000);
    } else {
      toast(`Parei antes da parte ${res.failedAt || 1}: ${res.message || 'erro'}.`, 'error', 8000);
    }
  }

  // Conversa individual aberta no WhatsApp (via WA-JS); null com aviso se não der
  async function openIndividualChat() {
    let chat = null;
    try { chat = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { chat = null; }
    if (!chat || chat.kind !== 'individual' || typeof chat.chatId !== 'string') {
      toast(chat && chat.kind === 'grupo' ? 'Grupos não recebem envios da extensão.' : 'Abra uma conversa individual', 'warn', 6000);
      return null;
    }
    return chat.chatId;
  }

  // Seta do item: envia a sequência na conversa aberta
  async function sendItemSequence(item, card = null, send = null) {
    if (state.busyId || seq) { toast('Já tem um envio em andamento. Espere terminar ou clique em Parar.', 'warn', 5000); return; }
    if (!getContext().conv) { toast('Abra uma conversa', 'warn'); return; }
    const multi = isMultiPart(item);
    if (!multi && item.type === 'audio') { if (card && send) sendItem(item, card, send); return; } // voz: fluxo de sempre
    const st = await waStatusForSend();
    if (!st || !st.ready) {
      if (!multi && card && send) { sendItem(item, card, send); return; } // sem WA-JS: jeito antigo (preenche/anexa)
      toast('O WhatsApp ainda não está pronto para enviar. Tente de novo em instantes.', 'warn', 6000);
      return;
    }
    const chatId = await openIndividualChat();
    if (!chatId) return;
    const ctx = getContext();
    state.ctx = ctx;
    const parts = partsOf(item);
    state.busyId = item.id;
    if (card && send) setBusy(card, send, true);
    else setSendButtonsDisabled(true);
    try {
      const res = await runSequence({ parts, chatId, firstName: ctx.firstName });
      sequenceToast(res, parts.length);
      if (res.status === 'ok') { registerUse(item); applyItemLabels(item, targetForOpenChat(chatId)); }
    } finally {
      state.busyId = null;
      if (card && send && card.isConnected) setBusy(card, send, false);
      else setSendButtonsDisabled(false);
      if (state.filter === 'mais_usadas') renderList();
    }
  }

  // ── Menu "···" do item e da categoria (confirmações dentro do painel) ──

  let itemMenu = null; // { id, mode: 'menu' | 'delete' }
  let emptyAsk = null; // 2.8.2: { id } da categoria que ficou vazia
  let catMenu = null;  // { id, mode: 'menu' | 'rename' | 'delete' }
  let libBusy = false;

  function itemMenuEl(item, card, send) {
    const box = el('div', 'imenu');
    const btn = (text, onClick, cls = '') => {
      const b = el('button', cls || null, text);
      b.type = 'button';
      b.disabled = libBusy;
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return b;
    };
    if (itemMenu.mode === 'delete') {
      box.append(el('div', 'q', `Excluir "${item.title}"? ${isMultiPart(item) ? 'As partes somem junto. ' : ''}Os arquivos continuam guardados.`),
        btn('Excluir', () => deleteLibraryItem(item), 'danger'), btn('Cancelar', () => { itemMenu = null; renderList(); }));
      return box;
    }
    const open = state.previewId === item.id;
    box.append(btn(open ? 'Fechar prévia' : 'Prévia', () => { itemMenu = null; renderList(); const c = listEl.querySelector(`.card[data-id="${item.id}"]`); if (c) togglePreview(item, c, c.querySelector('.info .t')); }));
    if (item.type === 'audio' && !isMultiPart(item)) {
      // Jeito antigo, sempre disponível: anexar o áudio como arquivo
      const asFile = btn('Enviar áudio como arquivo', () => { itemMenu = null; renderList(); const c = listEl.querySelector(`.card[data-id="${item.id}"]`) || card; sendItem(item, c, (c && c.querySelector('.btns .send')) || send, { asFile: true }); }, 'asfile');
      asFile.title = 'Anexar como arquivo de áudio';
      if (state.busyId) asFile.disabled = true;
      box.append(asFile);
    }
    box.append(btn('Editar', () => { itemMenu = null; openEditor(item); }));
    box.append(btn('Duplicar', () => { itemMenu = null; openEditor(item, { duplicate: true }); }));
    if (!isMultiPart(item) && item.type === 'texto') box.append(btn('Colocar na caixa', () => { itemMenu = null; renderList(); sendItem(item, card, send); }));
    box.append(btn('Agendar nesta conversa', () => { itemMenu = null; renderList(); scheduleItem(item); }));
    box.append(btn('Excluir', () => { itemMenu = { id: item.id, mode: 'delete' }; renderList(); }, 'danger'));
    return box;
  }

  async function reloadLibrary() {
    const lib = await call('fetchLibrary');
    applyLibrary(lib, 'servidor', Date.now());
    state.offline = false;
    saveCache();
    renderList();
  }

  async function deleteLibraryItem(item) {
    if (libBusy) return;
    libBusy = true;
    renderList();
    try {
      const wasLast = !state.items.some((i) => i.id !== item.id && i.category_id === item.category_id);
      await call('deleteItem', { id: item.id });
      itemMenu = null;
      toast('Mensagem excluída.', 'ok', 3000);
      if (wasLast && state.categories.some((c) => c.id === item.category_id)) emptyAsk = { id: item.category_id };
      await reloadLibrary();
    } catch (e) {
      toast(`Não consegui excluir: ${e.message}`, 'error', 6000);
    } finally {
      libBusy = false;
      renderList();
    }
  }

  function catMenuEl(cat, catItems) {
    const box = el('div', 'imenu');
    const btn = (text, onClick, cls = '') => {
      const b = el('button', cls || null, text);
      b.type = 'button';
      b.disabled = libBusy;
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return b;
    };
    const total = state.items.filter((i) => i.category_id === cat.id).length;
    if (catMenu.mode === 'rename') {
      const input = el('input');
      input.type = 'text';
      input.maxLength = 60;
      input.value = cat.name;
      input.setAttribute('aria-label', 'Novo nome da categoria');
      const save = () => categoryOp('renameCategory', { id: cat.id, name: input.value }, 'Categoria renomeada.');
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      box.append(input, btn('Salvar', save), btn('Cancelar', () => { catMenu = null; renderList(); }));
      setTimeout(() => input.focus(), 0);
    } else if (catMenu.mode === 'delete') {
      // 2.8.2: com mensagens, apaga junto (as mídias da biblioteca ficam)
      box.append(el('div', 'q', total
        ? `Apagar a categoria "${cat.name}" e as ${total} mensage${total === 1 ? 'm' : 'ns'} dela? As mídias da biblioteca não são apagadas.`
        : `Apagar a categoria "${cat.name}"?`),
        btn('Apagar', () => deleteCategoryNow(cat, total), 'danger'),
        btn('Cancelar', () => { catMenu = null; renderList(); }));
    } else {
      box.append(btn('Renomear', () => { catMenu = { id: cat.id, mode: 'rename' }; renderList(); }));
      box.append(btn('Apagar', () => { catMenu = { id: cat.id, mode: 'delete' }; renderList(); }, 'danger'));
    }
    return box;
  }

  // 2.8.2: apagar a categoria (e as mensagens, se tiver): some da tela e do editor na hora
  async function deleteCategoryNow(cat, total) {
    if (libBusy) return;
    libBusy = true;
    renderList();
    try {
      await call('deleteCategory', { id: cat.id, withItems: total > 0 });
      catMenu = null;
      if (emptyAsk && emptyAsk.id === cat.id) emptyAsk = null;
      state.categories = state.categories.filter((c) => c.id !== cat.id);
      state.items = state.items.filter((i) => i.category_id !== cat.id);
      saveCache();
      toast(total ? `Categoria apagada com ${total} mensage${total === 1 ? 'm' : 'ns'}.` : 'Categoria apagada.', 'ok', 3000);
      await reloadLibrary().catch(() => {});
    } catch (e) {
      toast(e.message, 'error', 6000);
    } finally {
      libBusy = false;
      renderList();
    }
  }

  // ── 2.8.5: arrastar para reordenar (ponteiro; só começa depois de mover alguns pixels) ──
  // Clique simples continua abrindo/fechando; Esc cancela; com filtro/busca fica desligado; erro ao salvar volta a ordem.
  const DND_PX = 6;
  const dnd = { cfg: null, src: null, active: false, x0: 0, y0: 0, hit: null };
  const dndPoint = (e) => (e.composedPath ? e.composedPath()[0] : e.target);
  function dndMark(hit) {
    shadow.querySelectorAll('.dnd-before, .dnd-after, .dnd-into').forEach((n) => n.classList.remove('dnd-before', 'dnd-after', 'dnd-into'));
    if (hit) hit.el.classList.add(`dnd-${hit.where}`);
  }
  function dndStop(drop) {
    window.removeEventListener('pointermove', dndMove, true);
    window.removeEventListener('pointerup', dndUp, true);
    window.removeEventListener('keydown', dndKey, true);
    const { cfg, hit, active, src } = dnd;
    dndMark(null);
    root.classList.remove('dnd-on');
    if (src) src.classList.remove('dnd-src');
    Object.assign(dnd, { cfg: null, src: null, active: false, hit: null });
    if (!active) return;
    // o clique que vem logo depois de soltar não abre/fecha nada
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    shadow.addEventListener('click', stop, true);
    setTimeout(() => shadow.removeEventListener('click', stop, true), 0);
    if (drop && hit) cfg.drop(hit);
  }
  function dndMove(e) {
    if (!dnd.cfg) return;
    if (!dnd.active) {
      if (Math.abs(e.clientX - dnd.x0) < DND_PX && Math.abs(e.clientY - dnd.y0) < DND_PX) return;
      if (dnd.cfg.blocked()) { toast('Limpe a busca para reordenar', 'warn', 4000); dndStop(false); return; }
      dnd.active = true;
      root.classList.add('dnd-on');
      dnd.src.classList.add('dnd-src');
    }
    const t = dndPoint(e);
    const hit = t && t.closest ? dnd.cfg.find(t, e) : null;
    dnd.hit = hit && hit.el !== dnd.src ? hit : null;
    dndMark(dnd.hit);
  }
  function dndUp(e) { if (dnd.active) dndMove(e); dndStop(true); }
  function dndKey(e) {
    if (e.key !== 'Escape' || !dnd.cfg) return;
    e.preventDefault();
    e.stopPropagation();
    dndStop(false);
  }
  function dndStart(e, src, cfg) {
    if (e.button != null && e.button !== 0) return;
    if (dnd.cfg) dndStop(false);
    Object.assign(dnd, { cfg, src, active: false, x0: e.clientX, y0: e.clientY, hit: null });
    window.addEventListener('pointermove', dndMove, true);
    window.addEventListener('pointerup', dndUp, true);
    window.addEventListener('keydown', dndKey, true);
  }
  const halfY = (node, e) => { const r = node.getBoundingClientRect(); return e.clientY < r.top + r.height / 2 ? 'before' : 'after'; };
  const halfX = (node, e) => { const r = node.getBoundingClientRect(); return e.clientX < r.left + r.width / 2 ? 'before' : 'after'; };
  const listFiltering = () => state.filter !== 'tudo' || state.search.trim() !== '';

  async function dropCategory(srcId, hit) {
    const prev = state.categories.slice();
    const list = prev.filter((c) => c.id !== srcId);
    const moved = prev.find((c) => c.id === srcId);
    const at = list.findIndex((c) => c.id === hit.el.dataset.cat);
    if (!moved || at < 0) return;
    list.splice(at + (hit.where === 'after' ? 1 : 0), 0, moved);
    state.categories = list;
    renderList();
    try {
      await call('reorderCategories', { ids: list.map((c) => c.id) });
      saveCache();
    } catch (e) {
      state.categories = prev;
      renderList();
      toast(`Não consegui salvar a nova ordem: ${e.message}`, 'error', 6000);
    }
  }

  async function dropItem(srcId, hit) {
    const prev = state.items.slice();
    const item = prev.find((i) => i.id === srcId);
    if (!item) return;
    const list = prev.filter((i) => i.id !== srcId);
    let catId;
    let at;
    if (hit.where === 'into') {
      catId = hit.el.dataset.cat;
      let last = -1;
      list.forEach((i, k) => { if (i.category_id === catId) last = k; });
      at = last >= 0 ? last + 1 : list.length;
    } else {
      const target = list.find((i) => i.id === hit.el.dataset.id);
      if (!target) return;
      catId = target.category_id;
      at = list.indexOf(target) + (hit.where === 'after' ? 1 : 0);
    }
    if (!catId) return;
    list.splice(at, 0, { ...item, category_id: catId });
    state.items = list;
    renderList();
    try {
      await call('moveItems', { categoryId: catId, ids: list.filter((i) => i.category_id === catId).map((i) => i.id) });
      saveCache();
      if (catId !== item.category_id) toast('Mensagem movida.', 'ok', 2500);
    } catch (e) {
      state.items = prev;
      renderList();
      toast(`Não consegui salvar a nova ordem: ${e.message}`, 'error', 6000);
    }
  }

  // Lista de mensagens: arrastar categoria (pelo cabeçalho) ou mensagem (pela linha)
  listEl.addEventListener('pointerdown', (e) => {
    if (state.view !== 'list' || state.filter === 'mais_usadas') return;
    const t = dndPoint(e);
    if (!t || !t.closest || t.closest('.btns, .cat-opts, .imenu, .pv-wrap, .cat-empty, .greet-form, .newcat-form, input, textarea, select')) return;
    const card = t.closest('.card');
    if (card && card.closest('.cat')) {
      dndStart(e, card, {
        blocked: listFiltering,
        find: (p, ev) => {
          const c = p.closest('.card');
          if (c && c.closest('.cat')) return { el: c, where: halfY(c, ev) };
          const sec = p.closest('.cat');
          return sec ? { el: sec, where: 'into' } : null;
        },
        drop: (hit) => dropItem(card.dataset.id, hit),
      });
      return;
    }
    const top = t.closest('.cat-top');
    const sec = top && top.closest('.cat');
    if (sec) {
      dndStart(e, sec, {
        blocked: listFiltering,
        find: (p, ev) => { const c = p.closest('.cat'); return c ? { el: c, where: halfY(c, ev) } : null; },
        drop: (hit) => dropCategory(sec.dataset.cat, hit),
      });
    }
  });

  // 2.8.2: nova categoria pelo topo da lista
  function newCategoryEl() {
    const box = el('div', 'imenu newcat-form');
    const input = el('input');
    input.type = 'text';
    input.maxLength = 60;
    input.placeholder = 'Nome da nova categoria';
    input.setAttribute('aria-label', 'Nome da nova categoria');
    const create = async () => {
      if (libBusy) return;
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      libBusy = true;
      try {
        await call('createCategory', { name });
        newCatOpen = false;
        toast('Categoria criada.', 'ok', 3000);
        await reloadLibrary();
      } catch (e) {
        toast(e.message, 'error', 6000);
      } finally {
        libBusy = false;
        renderList();
      }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
    const b = (text, fn, cls) => { const x = el('button', cls || null, text); x.type = 'button'; x.disabled = libBusy; x.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return x; };
    box.append(input, b('Criar', create, 'primary'), b('Cancelar', () => { newCatOpen = false; renderList(); }));
    setTimeout(() => input.focus(), 0);
    return box;
  }

  // 2.8.2: apagou a última mensagem da categoria → "Apagar a categoria também?"
  function emptyAskEl(cat) {
    const box = el('div', 'imenu cat-askempty');
    box.setAttribute('role', 'alert');
    const b = (text, fn, cls) => { const x = el('button', cls || null, text); x.type = 'button'; x.disabled = libBusy; x.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return x; };
    box.append(el('div', 'q', `A categoria "${cat.name}" ficou vazia. Apagar a categoria também?`),
      b('Apagar', () => deleteCategoryNow(cat, 0), 'danger'), b('Manter', () => { emptyAsk = null; renderList(); }));
    return box;
  }

  async function categoryOp(type, payload, okText) {
    if (libBusy) return;
    libBusy = true;
    renderList();
    try {
      await call(type, payload);
      catMenu = null;
      toast(okText, 'ok', 3000);
      await reloadLibrary();
    } catch (e) {
      toast(e.message, 'error', 6000);
    } finally {
      libBusy = false;
      renderList();
    }
  }

  // ── Editor de mensagens (dentro do painel) ──

  const ED_TYPES = [['texto', 'Texto'], ['imagem', 'Imagem'], ['video', 'Vídeo'], ['audio', 'Áudio'], ['documento', 'PDF']];
  const ED_ACCEPT = {
    imagem: 'image/jpeg,image/png,image/webp',
    video: 'video/mp4',
    audio: 'audio/ogg,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/webm,.ogg,.opus,.mp3,.m4a,.wav,.webm',
    documento: 'application/pdf,.pdf',
  };
  const ED_MIME = {
    imagem: ['image/jpeg', 'image/png', 'image/webp'],
    video: ['video/mp4'],
    audio: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm'],
    documento: ['application/pdf'],
  };
  const ED_EXT_MIME = { ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm' };
  const ED_MAX_PARTS = 10;
  const ED_MAX_BYTES = 40 * 1024 * 1024;
  const DB_MISSING = 'Atualize o banco para usar este recurso';
  let ed = null;
  let edKey = 0;

  function edPart(p) {
    const album = Array.isArray(p.files) && p.files.length > 1;
    return {
      ...(album ? { files: p.files.map((f) => ({ kind: f.kind === 'video' ? 'video' : 'imagem', file_url: f.file_url, file_name: f.file_name, file_size: f.file_size ?? null, file: null, localUrl: null })), caption_before: !!(p.files[0] && p.files[0].caption_before) } : {}),
      key: ++edKey, type: album ? 'album' : p.type, body: p.body || '', file_url: album ? null : p.file_url || null, file_name: album ? null : p.file_name || null,
      file_size: p.file_size ?? null, wait_seconds: Number(p.wait_seconds) || 0,
      typing_seconds: Number.isInteger(p.typing_seconds) ? p.typing_seconds : p.type === 'audio' ? 3 : 0,
      file: null, localUrl: null,
    };
  }

  // 2.7.0: sobe o arquivo da parte pela biblioteca (entra em "Sem pasta"; o mesmo arquivo já salvo é
  // reaproveitado, sem subir de novo). Sem as tabelas da biblioteca: o upload de sempre.
  async function uploadPartFile(p) {
    const base64 = await fileToBase64(p.file);
    const mime = edFileMime(p.type, p.file);
    try {
      const r = await call('uploadMedia', { mediaType: p.type, base64, mime, fileName: p.file.name, folderId: null, enforceLimits: false });
      md.loaded = false; // a aba Mídias relê
      return { file_url: r.media.file_url, file_name: r.media.file_name || p.file.name, file_size: r.media.file_size ?? p.file.size };
    } catch (e) {
      if (e.message !== DB_MISSING) throw e;
    }
    return call('uploadFile', { partType: p.type, base64, mime, fileName: p.file.name });
  }

  // 2.7.1: prévia do arquivo da parte (arquivo novo: direto do computador; já salvo: pelo background, em cache)
  function edChosenPreview(p) {
    const pv = el('div', 'ed-preview');
    const mount = (url) => {
      const tag = p.type === 'imagem' ? 'img' : p.type;
      const m = document.createElement(tag);
      if (tag === 'img') m.alt = '';
      else { m.controls = true; m.preload = 'metadata'; }
      m.src = p.type === 'video' ? videoSrc(url) : url;
      pv.textContent = '';
      pv.append(m);
    };
    if (p.localUrl) mount(p.localUrl);
    else {
      pv.append(el('span', 'md-ico', MD_ICON[p.type] || '📎'));
      const url = p.file_url;
      whenVisible(pv, () => getBlobUrl({ id: 'arquivo', file_url: url, file_name: p.file_name })
        .then((u) => { if (p.file_url === url && !p.localUrl) mount(u); }).catch(() => { /* fica o ícone */ }));
    }
    return pv;
  }

  // ── 2.8.7: "Várias imagens" (álbum): até 10 fotos/vídeos numa parte ──
  const ALBUM_MAX = 10;
  const edTypes = (cur) => (state.albumAvailable || cur === 'album' ? [...ED_TYPES.slice(0, 2), ['album', 'Várias imagens'], ...ED_TYPES.slice(2)] : ED_TYPES);
  function addAlbumFiles(p, list, ctx, i) {
    const files = [...(list || [])];
    for (const f of files) {
      if (p.files.length >= ALBUM_MAX) { ctx.msg(`Parte ${i + 1}: até ${ALBUM_MAX} fotos/vídeos.`, true); break; }
      const kind = /^video\//.test(f.type) || /\.mp4$/i.test(f.name) ? 'video' : 'imagem';
      const mime = edFileMime(kind, f);
      if (!ED_MIME[kind].includes(mime)) { ctx.msg(`Parte ${i + 1}: ${f.name}: tipo de arquivo não aceito (JPG, PNG, WebP ou MP4).`, true); continue; }
      if (f.size > ED_MAX_BYTES) { ctx.msg(`Parte ${i + 1}: ${f.name}: acima de 40 MB.`, true); continue; }
      p.files.push({ kind, file: f, localUrl: URL.createObjectURL(f), file_url: null, file_name: f.name, file_size: f.size });
    }
    ctx.rerender();
  }
  function albumEditorEl(p, i, ctx) {
    const wrap = el('div', 'alb');
    const grid = el('div', 'alb-grid');
    p.files.forEach((f, k) => {
      const cell = el('div', 'alb-cell');
      cell.dataset.k = String(k);
      cell.title = `${f.file_name || 'arquivo'} (arraste para mudar a ordem)`;
      cell.append(albumThumb(f, k, 'arquivo'), el('span', 'alb-n', String(k + 1)));
      const x = el('button', 'alb-x', '✕');
      x.type = 'button';
      x.disabled = ctx.saving();
      x.setAttribute('aria-label', `Remover ${f.file_name || `arquivo ${k + 1}`} (parte ${i + 1})`);
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        if (f.localUrl) URL.revokeObjectURL(f.localUrl);
        p.files.splice(k, 1);
        ctx.rerender();
      });
      cell.append(x);
      grid.append(cell);
    });
    // arrastar para mudar a ordem (mesmo arraste da 2.8.5)
    grid.addEventListener('pointerdown', (e) => {
      const t = dndPoint(e);
      if (!t || !t.closest || t.closest('.alb-x')) return;
      const cell = t.closest('.alb-cell');
      if (!cell) return;
      dndStart(e, cell, {
        blocked: () => false,
        find: (pp, ev) => { const c = pp.closest('.alb-cell'); return c && grid.contains(c) ? { el: c, where: halfX(c, ev) } : null; },
        drop: (hit) => {
          const from = Number(cell.dataset.k);
          const to = Number(hit.el.dataset.k);
          const [m] = p.files.splice(from, 1);
          let at = to - (from < to ? 1 : 0) + (hit.where === 'after' ? 1 : 0);
          at = Math.max(0, Math.min(p.files.length, at));
          p.files.splice(at, 0, m);
          ctx.rerender();
        },
      });
    });
    wrap.append(grid);
    wrap.append(el('div', 'alb-count', `${p.files.length}/${ALBUM_MAX} fotos/vídeos`));
    const row = el('div', 'ed-file');
    const pick = el('label', 'ed-pick', 'Subir arquivos');
    const input = el('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/jpeg,image/png,image/webp,video/mp4';
    input.setAttribute('aria-label', `Subir fotos ou vídeos (parte ${i + 1})`);
    input.addEventListener('change', () => { addAlbumFiles(p, input.files, ctx, i); });
    pick.append(input);
    const lib = el('button', 'ed-mini ed-lib', p.picking ? 'Fechar biblioteca' : 'Escolher da biblioteca');
    lib.type = 'button';
    lib.disabled = ctx.saving() || p.files.length >= ALBUM_MAX;
    lib.setAttribute('aria-label', `Escolher da biblioteca (parte ${i + 1})`);
    lib.addEventListener('click', () => {
      p.picking = !p.picking;
      p.pickSel = [];
      if (!p.picking) stopPickAudio();
      if (p.picking && !md.loaded) loadMedia({ quiet: true }).then(() => ctx.rerender());
      ctx.rerender();
    });
    pick.classList.toggle('off', p.files.length >= ALBUM_MAX);
    row.append(pick, lib);
    wrap.append(row);
    // arrastar vários arquivos para a parte
    wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('over'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('over'));
    wrap.addEventListener('drop', (e) => { e.preventDefault(); wrap.classList.remove('over'); addAlbumFiles(p, e.dataTransfer && e.dataTransfer.files, ctx, i); });
    if (p.picking) wrap.append(mediaPicker(p, i, ctx));
    const cap = el('textarea', 'ed-caption');
    cap.maxLength = 4096;
    cap.rows = 2;
    cap.value = p.body;
    cap.placeholder = 'Legenda (opcional; vai como mensagem separada)';
    cap.setAttribute('aria-label', `Legenda da parte ${i + 1}`);
    cap.addEventListener('input', () => { p.body = cap.value; });
    // 2.8.9: legenda depois (padrão) ou antes das fotos
    const pos = el('select', 'ed-cat alb-cappos');
    pos.setAttribute('aria-label', `Posição da legenda (parte ${i + 1})`);
    [['depois', 'Legenda: depois das fotos'], ['antes', 'Legenda: antes das fotos']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = (p.caption_before ? 'antes' : 'depois') === v; pos.append(o); });
    pos.addEventListener('change', () => { p.caption_before = pos.value === 'antes'; });
    wrap.append(cap, pos, varButtons(cap, (v) => { p.body = v; }, i));
    wrap.append(el('div', 'ed-varhint alb-help', 'As fotos vão juntas; a legenda vai como mensagem logo depois (o WhatsApp agrupa a partir de 4 fotos)'));
    return wrap;
  }
  // salvar: sobe os arquivos novos (entram na biblioteca) e monta a parte; 1 arquivo só vira parte normal
  async function albumPartForSave(p, i, msg) {
    const files = [];
    for (let k = 0; k < p.files.length; k++) {
      const f = p.files[k];
      if (f.file) {
        msg(`Enviando o arquivo ${k + 1} de ${p.files.length} da parte ${i + 1}…`);
        const up = await uploadPartFile({ type: f.kind, file: f.file });
        Object.assign(f, up, { file: null });
      }
      files.push({ kind: f.kind, file_url: f.file_url, file_name: f.file_name, file_size: f.file_size ?? null });
    }
    const base = { body: p.body || null, wait_seconds: p.wait_seconds, typing_seconds: p.typing_seconds };
    if (files.length === 1) return { type: files[0].kind, ...base, file_url: files[0].file_url, file_name: files[0].file_name, file_size: files[0].file_size };
    if (p.caption_before) files[0].caption_before = true; // 2.8.9
    return { type: 'imagem', ...base, file_url: files[0].file_url, file_name: files[0].file_name, file_size: files[0].file_size, files };
  }

  // 2.8.6: opção "Todas (menos a que vai colocar)" logo abaixo de "(não mexe)" (só com as colunas no banco)
  const REMOVE_ALL = '__all__';
  function withRemoveAll(sel, value) {
    if (!state.removeAllAvailable && value !== REMOVE_ALL) return sel;
    const o = el('option', null, 'Todas (menos a que vai colocar)');
    o.value = REMOVE_ALL;
    sel.insertBefore(o, sel.options[1] || null);
    if (value === REMOVE_ALL) sel.value = REMOVE_ALL;
    return sel;
  }

  // 2.8.3: inserir {nome} / {saudacao} no cursor
  function varButtons(field, onChange, i) {
    const row = el('div', 'ed-vars');
    [['{nome}', 'Inserir {nome}'], ['{saudacao}', 'Inserir {saudacao}']].forEach(([v, title]) => {
      const b = el('button', 'ed-mini ed-var', `+ ${v}`);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', `${title} (parte ${i + 1})`);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        const a = field.selectionStart ?? field.value.length;
        const z = field.selectionEnd ?? a;
        const next = field.value.slice(0, a) + v + field.value.slice(z);
        if (next.length > field.maxLength && field.maxLength > 0) return;
        field.value = next;
        field.selectionStart = field.selectionEnd = a + v.length;
        onChange(next);
        field.focus();
      });
      row.append(b);
    });
    row.append(el('div', 'ed-varhint', '{nome} = nome que você escreveu no primeiro contato; {saudacao} = muda sozinha conforme o horário'));
    return row;
  }

  function edFileMime(type, file) {
    let m = (file.type || '').toLowerCase();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!m || m === 'application/octet-stream') m = type === 'audio' ? ED_EXT_MIME[ext] || '' : MIME_BY_EXT[ext] || '';
    if (type === 'audio' && m === 'video/webm') m = 'audio/webm';
    return m;
  }

  function openEditor(item = null, { duplicate = false, categoryId = null } = {}) {
    closeEditorState();
    const cats = state.categories;
    ed = {
      id: item && !duplicate ? item.id : null,
      title: item ? (duplicate ? `${item.title} (cópia)` : item.title).slice(0, 80) : '',
      category_id: item ? item.category_id : categoryId && cats.some((c) => c.id === categoryId) ? categoryId : cats.length ? cats[0].id : '__new',
      newCategory: '',
      parts: item ? partsOf(item).map(edPart) : [edPart({ type: 'texto' })],
      // 2.1.0: etiquetas CRM ao enviar (opcionais)
      on_send_add_label_id: (item && item.on_send_add_label_id) || '',
      on_send_remove_label_id: (item && item.on_send_remove_all_crm) ? REMOVE_ALL : (item && item.on_send_remove_label_id) || '',
      // 2.7.1: etiquetas do WhatsApp ao enviar (opcionais)
      on_send_add_wa_label_id: (item && item.on_send_add_wa_label_id) || '',
      on_send_remove_wa_label_id: (item && item.on_send_remove_all_wa) ? REMOVE_ALL : (item && item.on_send_remove_wa_label_id) || '',
      saving: false, msg: '', error: false, duplicate,
    };
    state.view = 'editor';
    if (!Array.isArray(state.waLabels)) refreshBar().then(() => { if (state.view === 'editor' && ed) renderEditor(); }).catch(() => {});
    panel.classList.add('editing');
    renderBanner();
    listEl.scrollTop = 0;
    renderEditor();
  }

  function closeEditorState() {
    stopPickAudio();
    if (ed) ed.parts.forEach((p) => { if (p.localUrl) URL.revokeObjectURL(p.localUrl); });
    ed = null;
    panel.classList.remove('editing');
  }

  function closeEditor() {
    closeEditorState();
    showList();
  }

  const edTotalSeconds = () => (ed ? ed.parts.reduce((s, p) => s + (Number(p.wait_seconds) || 0) + (Number(p.typing_seconds) || 0), 0) : 0);

  function edMsg(text, error = false) {
    if (!ed) return;
    ed.msg = text;
    ed.error = error;
    const box = listEl.querySelector('.ed-msg');
    if (box) { box.textContent = text; box.className = `ed-msg${error ? ' err' : ''}`; }
  }

  function edUpdateTotals() {
    const total = listEl.querySelector('.ed-total');
    if (total) total.textContent = `Tempo total ~${edTotalSeconds()}s`;
  }

  function numField(label, value, max, onInput, after = edUpdateTotals) {
    const wrap = el('label', 'ed-num');
    const input = el('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(max);
    input.step = '1';
    input.value = String(value);
    input.addEventListener('input', () => {
      const n = Math.floor(Number(input.value));
      onInput(Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0);
      if (after) after();
    });
    wrap.append(label, input, ' s');
    return wrap;
  }

  // ctx (2.2.0): o mesmo editor de partes serve à mensagem salva e à mensagem exclusiva do disparo
  const edCtx = () => ({ parts: ed.parts, rerender: renderEditor, msg: edMsg, saving: () => ed.saving, totals: edUpdateTotals });
  function edPartEl(p, i, ctx = edCtx()) {
    const box = el('div', 'ed-part');
    const head = el('div', 'ed-phead');
    head.append(el('b', null, `Parte ${i + 1}`));
    const typeSel = el('select');
    typeSel.setAttribute('aria-label', `Tipo da parte ${i + 1}`);
    edTypes(p.type).forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = v === p.type; typeSel.append(o); });
    typeSel.addEventListener('change', () => {
      if (p.localUrl) URL.revokeObjectURL(p.localUrl);
      (p.files || []).forEach((f) => { if (f.localUrl) URL.revokeObjectURL(f.localUrl); });
      Object.assign(p, { type: typeSel.value, file: null, localUrl: null, file_url: null, file_name: null, file_size: null, files: typeSel.value === 'album' ? [] : undefined, picking: false });
      if (p.type === 'audio' && !p.typing_seconds) p.typing_seconds = 3;
      ctx.rerender();
    });
    const mini = (text, title, disabled, onClick) => {
      const b = el('button', 'ed-mini', text);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', `${title} (parte ${i + 1})`);
      b.disabled = disabled || ctx.saving();
      b.addEventListener('click', onClick);
      return b;
    };
    head.append(typeSel,
      mini('↑', 'Subir', i === 0, () => { ctx.parts.splice(i - 1, 0, ctx.parts.splice(i, 1)[0]); ctx.rerender(); }),
      mini('↓', 'Descer', i === ctx.parts.length - 1, () => { ctx.parts.splice(i + 1, 0, ctx.parts.splice(i, 1)[0]); ctx.rerender(); }),
      mini('×', 'Remover', ctx.parts.length === 1, () => { if (p.localUrl) URL.revokeObjectURL(p.localUrl); ctx.parts.splice(i, 1); ctx.rerender(); }));
    box.append(head);

    if (p.type === 'album') {
      box.append(albumEditorEl(p, i, ctx));
    } else if (p.type === 'texto') {
      const ta = el('textarea', 'ed-text');
      ta.maxLength = 4096;
      ta.rows = 4;
      ta.value = p.body;
      ta.placeholder = 'Texto da mensagem ({nome} vira o primeiro nome do contato)';
      ta.setAttribute('aria-label', `Texto da parte ${i + 1}`);
      const count = el('div', 'ed-count', `${p.body.length}/4096`);
      ta.addEventListener('input', () => { p.body = ta.value; count.textContent = `${ta.value.length}/4096`; });
      box.append(ta, count, varButtons(ta, (v) => { p.body = v; count.textContent = `${v.length}/4096`; }, i));
    } else {
      const hasFile = !!(p.file || p.file_url);
      const fname = el('span', 'ed-fname', hasFile ? `${p.file_name || 'Arquivo'}${p.file_size != null ? ` · ${formatSize(p.file_size)}` : ''}${p.file ? ' (novo)' : p.fromLibrary ? ' (da biblioteca)' : ''}` : 'Nenhum arquivo');
      // 2.7.1: arquivo escolhido mostra a prévia (foto/vídeo em miniatura, player de áudio, ícone do PDF) e "Trocar"
      if (hasFile && p.type !== 'documento') box.append(edChosenPreview(p));
      if (hasFile && !p.changing && !p.picking) {
        const row = el('div', 'ed-file');
        if (p.type === 'documento') row.append(el('span', 'ed-docico', '📄'));
        const swap = el('button', 'ed-mini', 'Trocar');
        swap.type = 'button';
        swap.disabled = ctx.saving();
        swap.setAttribute('aria-label', `Trocar o arquivo (parte ${i + 1})`);
        swap.addEventListener('click', () => { p.changing = true; ctx.rerender(); });
        row.append(fname, swap);
        if (p.type === 'imagem' && state.albumAvailable) {
          // 2.8.7: vira "Várias imagens" mantendo a foto atual
          const more = el('button', 'ed-mini ed-tomany', '+ adicionar mais fotos');
          more.type = 'button';
          more.disabled = ctx.saving();
          more.setAttribute('aria-label', `Adicionar mais fotos (parte ${i + 1})`);
          more.addEventListener('click', () => {
            const first = { kind: 'imagem', file_url: p.file_url, file_name: p.file_name, file_size: p.file_size, file: p.file || null, localUrl: p.localUrl || null };
            Object.assign(p, { type: 'album', files: [first], file: null, localUrl: null, file_url: null, file_name: null, file_size: null, changing: false });
            ctx.rerender();
          });
          row.append(more);
        }
        box.append(row);
      } else {
      const fileRow = el('div', 'ed-file');
      // <label> abre o seletor de arquivo do próprio navegador (sem clique simulado)
      const pick = el('label', 'ed-pick', 'Subir arquivo');
      const input = el('input');
      input.type = 'file';
      input.accept = ED_ACCEPT[p.type];
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const mime = edFileMime(p.type, f);
        if (!ED_MIME[p.type].includes(mime)) { ctx.msg(`Parte ${i + 1}: tipo de arquivo não aceito.`, true); return; }
        if (f.size > ED_MAX_BYTES) { ctx.msg(`Parte ${i + 1}: arquivo acima de 40 MB.`, true); return; }
        if (p.localUrl) URL.revokeObjectURL(p.localUrl);
        p.file = f;
        p.localUrl = ['imagem', 'video', 'audio'].includes(p.type) ? URL.createObjectURL(f) : null;
        p.file_name = f.name;
        p.file_size = f.size;
        p.fromLibrary = null;
        p.changing = false;
        p.picking = false;
        ctx.msg('');
        ctx.rerender();
      });
      pick.append(input);
      fileRow.append(pick);
      // 2.7.0: escolher da biblioteca usa o mesmo arquivo (mesmo file_url; nada é copiado)
      const lib = el('button', 'ed-mini ed-lib', p.picking ? 'Fechar biblioteca' : 'Escolher da biblioteca');
      lib.type = 'button';
      lib.disabled = ctx.saving();
      lib.setAttribute('aria-label', `Escolher da biblioteca (parte ${i + 1})`);
      lib.addEventListener('click', () => {
        p.picking = !p.picking;
        if (!p.picking) stopPickAudio();
        if (p.picking && !md.loaded) loadMedia({ quiet: true }).then(() => ctx.rerender());
        ctx.rerender();
      });
      fileRow.append(lib);
      if (hasFile) {
        const cancel = el('button', 'ed-mini', 'Cancelar');
        cancel.type = 'button';
        cancel.setAttribute('aria-label', `Manter o arquivo atual (parte ${i + 1})`);
        cancel.addEventListener('click', () => { p.changing = false; p.picking = false; stopPickAudio(); ctx.rerender(); });
        fileRow.append(cancel);
      }
      fileRow.append(fname);
      box.append(fileRow);
      if (p.picking) box.append(mediaPicker(p, i, ctx));
      }
      if (p.type !== 'audio') {
        const cap = el('textarea', 'ed-caption');
        cap.maxLength = 4096;
        cap.rows = 2;
        cap.value = p.body;
        cap.placeholder = 'Legenda (opcional)';
        cap.setAttribute('aria-label', `Legenda da parte ${i + 1}`);
        cap.addEventListener('input', () => { p.body = cap.value; });
        box.append(cap, varButtons(cap, (v) => { p.body = v; }, i));
      }
    }

    const times = el('div', 'ed-times');
    if (state.partsAvailable === false) {
      times.append(el('span', 'ed-note', `Esperar e digitando: ${DB_MISSING.toLowerCase()}`));
    } else {
      times.append(numField('esperar ', p.wait_seconds, 600, (n) => { p.wait_seconds = n; }, ctx.totals),
        numField(p.type === 'audio' ? 'gravando ' : 'digitando ', p.typing_seconds, 60, (n) => { p.typing_seconds = n; }, ctx.totals));
    }
    box.append(times);
    return box;
  }

  function renderEditor() {
    if (state.view !== 'editor' || !ed) return;
    const scroll = listEl.scrollTop;
    listEl.textContent = '';
    const wrap = el('div', 'editor');

    const head = el('div', 'diag-head');
    head.append(iconButton('back', 'Voltar sem salvar', () => closeEditor()), ed.id ? 'Editar mensagem' : 'Nova mensagem');
    wrap.append(head);

    const title = el('input', 'ed-title');
    title.type = 'text';
    title.maxLength = 80;
    title.value = ed.title;
    title.placeholder = 'Título (até 80 caracteres)';
    title.setAttribute('aria-label', 'Título');
    title.addEventListener('input', () => { ed.title = title.value; });
    const tl = el('label', 'ed-field', 'Título');
    tl.append(title);
    wrap.append(tl);

    const cat = el('select', 'ed-cat');
    cat.setAttribute('aria-label', 'Categoria');
    state.categories.forEach((c) => { const o = el('option', null, c.name); o.value = c.id; o.selected = c.id === ed.category_id; cat.append(o); });
    const optNew = el('option', null, 'Nova categoria…');
    optNew.value = '__new';
    optNew.selected = ed.category_id === '__new';
    cat.append(optNew);
    cat.addEventListener('change', () => { ed.category_id = cat.value; renderEditor(); });
    const cl = el('label', 'ed-field', 'Categoria');
    cl.append(cat);
    wrap.append(cl);
    if (ed.category_id === '__new') {
      const nc = el('input', 'ed-newcat');
      nc.type = 'text';
      nc.maxLength = 60;
      nc.value = ed.newCategory;
      nc.placeholder = 'Nome da nova categoria';
      nc.setAttribute('aria-label', 'Nome da nova categoria');
      nc.addEventListener('input', () => { ed.newCategory = nc.value; });
      wrap.append(nc);
    }

    wrap.append(el('div', 'ed-sub', `Partes (${ed.parts.length}/${ED_MAX_PARTS})`));
    ed.parts.forEach((p, i) => wrap.append(edPartEl(p, i)));

    const add = el('div', 'ed-add');
    add.append(el('span', null, '+ Adicionar:'));
    const multiOff = state.partsAvailable === false;
    edTypes().forEach(([v, t]) => {
      const b = el('button', 'ed-mini', t);
      b.type = 'button';
      b.disabled = ed.saving || ed.parts.length >= ED_MAX_PARTS || multiOff;
      b.addEventListener('click', () => { ed.parts.push(v === 'album' ? { ...edPart({ type: 'imagem' }), type: 'album', files: [] } : edPart({ type: v })); renderEditor(); });
      add.append(b);
    });
    wrap.append(add);
    if (multiOff) wrap.append(el('div', 'ed-note', `Várias partes: ${DB_MISSING.toLowerCase()}.`));
    wrap.append(el('div', 'ed-total', `Tempo total ~${edTotalSeconds()}s`));
    // 2.1.0: mensagem rápida que etiqueta (só quando a mensagem inteira sair com sucesso)
    const addSel = labelSelect(ed.on_send_add_label_id, { empty: '(não mexe)', aria: 'Ao enviar, colocar na etiqueta CRM' });
    addSel.addEventListener('change', () => { ed.on_send_add_label_id = addSel.value; });
    const remSel = withRemoveAll(labelSelect(ed.on_send_remove_label_id === REMOVE_ALL ? '' : ed.on_send_remove_label_id, { empty: '(não mexe)', aria: 'Ao enviar, tirar da etiqueta CRM' }), ed.on_send_remove_label_id);
    remSel.addEventListener('change', () => { ed.on_send_remove_label_id = remSel.value; });
    const al = el('label', 'ed-field', 'Ao enviar, colocar na etiqueta CRM');
    al.append(addSel);
    const rl = el('label', 'ed-field', 'e tirar da etiqueta CRM');
    rl.append(remSel);
    const waAddSel = waLabelSelect(ed.on_send_add_wa_label_id, 'Ao enviar, colocar na etiqueta do WhatsApp', '(não mexe)');
    waAddSel.addEventListener('change', () => { ed.on_send_add_wa_label_id = waAddSel.value; });
    const waRemSel = withRemoveAll(waLabelSelect(ed.on_send_remove_wa_label_id === REMOVE_ALL ? '' : ed.on_send_remove_wa_label_id, 'Ao enviar, tirar da etiqueta do WhatsApp', '(não mexe)'), ed.on_send_remove_wa_label_id);
    waRemSel.addEventListener('change', () => { ed.on_send_remove_wa_label_id = waRemSel.value; });
    const wal = el('label', 'ed-field', 'Ao enviar, colocar na etiqueta do WhatsApp');
    wal.append(waAddSel);
    const wrl = el('label', 'ed-field', 'e tirar da etiqueta do WhatsApp');
    wrl.append(waRemSel);
    wrap.append(al, rl, wal, wrl);
    if (state.removeAllAvailable) wrap.append(el('div', 'ed-varhint', 'A etiqueta Não enviar nunca é retirada.'));
    wrap.append(el('div', 'crm-intro', 'Só muda as etiquetas (CRM e WhatsApp) quando a mensagem inteira sai com sucesso (seta, prévia, agendamento, automação ou disparo).'));
    wrap.append(el('div', `ed-msg${ed.error ? ' err' : ''}`, ed.msg));

    const actionsRow = el('div', 'ed-actions');
    const mk = (text, cls, onClick) => {
      const b = el('button', `btn${cls ? ` ${cls}` : ''}`, text);
      b.type = 'button';
      b.disabled = ed.saving;
      b.addEventListener('click', onClick);
      return b;
    };
    actionsRow.append(mk(ed.saving ? 'Salvando…' : 'Salvar', 'primary', () => saveEditor(false)),
      mk('Salvar e enviar', '', () => saveEditor(true)), mk('Cancelar', '', () => closeEditor()));
    wrap.append(actionsRow);
    listEl.append(wrap);
    listEl.scrollTop = scroll;
  }

  function edValidate() {
    if (!ed.title.trim()) return 'Escreva o título.';
    if (ed.category_id === '__new' && !ed.newCategory.trim()) return 'Escreva o nome da nova categoria.';
    if (ed.parts.length > 1 && state.partsAvailable === false) return `Várias partes: ${DB_MISSING.toLowerCase()}.`;
    for (let i = 0; i < ed.parts.length; i++) {
      const p = ed.parts[i];
      if (p.type === 'texto' && !p.body.trim()) return `Parte ${i + 1}: escreva o texto.`;
      if (p.type === 'album' && !(p.files && p.files.length)) return `Parte ${i + 1}: escolha as fotos.`;
      if (p.type !== 'texto' && p.type !== 'album' && !p.file && !p.file_url) return `Parte ${i + 1}: escolha o arquivo.`;
    }
    return null;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
      reader.onerror = () => reject(new Error('Não consegui ler o arquivo'));
      reader.readAsDataURL(file);
    });
  }

  async function saveEditor(andSend) {
    if (!ed || ed.saving) return;
    const problem = edValidate();
    if (problem) { edMsg(problem, true); return; }
    ed.saving = true;
    edMsg('Salvando…');
    renderEditor();
    const current = ed;
    try {
      let categoryId = current.category_id;
      if (categoryId === '__new') {
        const c = await call('createCategory', { name: current.newCategory });
        categoryId = c.id;
        current.category_id = c.id;
        current.newCategory = '';
      }
      const parts = [];
      for (let i = 0; i < current.parts.length; i++) {
        const p = current.parts[i];
        if (p.type === 'album') { parts.push(await albumPartForSave(p, i, edMsg)); continue; }
        let file = { file_url: p.file_url, file_name: p.file_name, file_size: p.file_size };
        if (p.type !== 'texto' && p.file) {
          edMsg(`Enviando o arquivo da parte ${i + 1}…`);
          file = await uploadPartFile(p);
          Object.assign(p, file, { file: null });
        }
        parts.push({
          type: p.type, body: p.type === 'audio' ? null : p.body, ...(p.type === 'texto' ? {} : file),
          wait_seconds: p.wait_seconds, typing_seconds: p.typing_seconds,
        });
      }
      const res = await call('saveItem', {
        id: current.id || undefined, category_id: categoryId, title: current.title, parts,
        on_send_add_label_id: current.on_send_add_label_id || null, on_send_remove_label_id: current.on_send_remove_label_id === REMOVE_ALL ? null : current.on_send_remove_label_id || null,
        // 2.8.6: "Todas" vai em colunas próprias (só manda se a opção existe ou se o item já tinha)
        ...(state.removeAllAvailable ? { on_send_remove_all_crm: current.on_send_remove_label_id === REMOVE_ALL, on_send_remove_all_wa: current.on_send_remove_wa_label_id === REMOVE_ALL } : {}),
        ...(current.on_send_add_wa_label_id || current.on_send_remove_wa_label_id
          ? { on_send_add_wa_label_id: current.on_send_add_wa_label_id || null, on_send_remove_wa_label_id: current.on_send_remove_wa_label_id === REMOVE_ALL ? null : current.on_send_remove_wa_label_id || null }
          : current.id && state.items.some((x) => x.id === current.id && (x.on_send_add_wa_label_id || x.on_send_remove_wa_label_id))
            ? { on_send_add_wa_label_id: null, on_send_remove_wa_label_id: null } : {}),
      });
      await reloadLibrary().catch(() => {});
      if (ed !== current) return;
      closeEditor();
      toast('Mensagem salva.', 'ok', 3000);
      const item = state.items.find((x) => x.id === res.id);
      if (andSend && item) sendItemSequence(item);
      else if (andSend) toast('Salva, mas não consegui recarregar para enviar. Use a seta da mensagem.', 'warn', 6000);
    } catch (e) {
      if (ed !== current) return;
      current.saving = false;
      current.msg = e.message === DB_MISSING ? DB_MISSING : `Não consegui salvar: ${e.message}`;
      current.error = true;
      renderEditor();
    }
  }

  // ── Agendamentos (1.9.0): seção ⏰ Agendados + executor ────────────────────
  // Só envia o que o usuário agendou. O executor roda a cada 30 s com o WhatsApp pronto, reserva a linha
  // no Supabase (pendente → enviando, só uma aba consegue) e usa o mesmo motor de sequência.
  // Atraso acima de 24 h = 'expirada' (não envia). Erro no envio = 'falhou' (nunca reenvia).

  const SCHED_TICK_MS = 60 * 1000; // 2.4.1: lista da seção Agendados (era 30 s)
  const SCHED_FIRST_MS = 5 * 1000;
  const SCHED_MAX_LATE_MS = 24 * 3600 * 1000;
  const SCHED_GAP_MIN_MS = 15 * 1000;
  const SCHED_GAP_EXTRA_MS = 15 * 1000;
  const SCHED_STATUS_LABEL = { pendente: 'pendente', enviando: 'enviando', enviada: 'enviada', falhou: 'falhou', cancelada: 'cancelada', expirada: 'expirada' };
  const SCHED_ERROR_LABEL = {
    chat_not_loaded: 'conversa não carregada', send_unconfirmed: 'envio não confirmado', item_not_found: 'mensagem salva não existe mais',
    stopped: 'parado por você', not_ready: 'WhatsApp não estava pronto', no_send: 'contato com a etiqueta "Não enviar"',
  };

  const sched = {
    available: null, pending: [], recent: [], loading: false, error: '', timer: null,
    form: { mode: 'texto', itemId: '', body: '', date: '', time: '', saving: false, msg: '', error: false },
    target: null, targetReq: 0, // conversa aberta para o formulário: { chatId, name } (só na memória)
    runner: { busy: false, cooldownUntil: 0, probeAt: 0, current: null },
  };

  const two = (n) => String(n).padStart(2, '0');
  const dateInput = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  const timeInput = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;

  function schedWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
  }

  // Atalhos de data/hora (hora local)
  function shortcutDate(kind, now = new Date()) {
    const d = new Date(now.getTime());
    d.setSeconds(0, 0);
    if (kind === '+1h') d.setHours(d.getHours() + 1);
    else if (kind === '+3h') d.setHours(d.getHours() + 3);
    else if (kind === 'amanha9') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    else if (kind === 'amanha14') { d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); }
    else if (kind === '2dias') d.setDate(d.getDate() + 2);
    return d;
  }

  function schedPreview(row) {
    if (row.item_id) {
      const item = state.items.find((i) => i.id === row.item_id);
      return item ? `Mensagem salva: ${item.title}` : 'Mensagem salva';
    }
    if (!row.item_id && !row.body) return 'Mensagem salva (excluída)';
    return firstWords(row.body || '', 8) || '—';
  }

  async function loadSchedules() {
    sched.loading = true;
    renderSched();
    try {
      const res = await call('fetchSchedules');
      sched.available = !!res.available;
      sched.pending = Array.isArray(res.pending) ? res.pending : [];
      sched.recent = Array.isArray(res.recent) ? res.recent : [];
      sched.error = '';
    } catch (e) {
      sched.error = 'Não consegui carregar os agendamentos.';
    }
    sched.loading = false;
    renderSched();
  }

  // Conversa aberta (individual) para o formulário
  async function loadSchedTarget() {
    const req = ++sched.targetReq;
    let chat = null;
    try { chat = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { chat = null; }
    if (req !== sched.targetReq) return;
    const ctx = state.ctx || getContext();
    sched.target = chat && chat.kind === 'individual' && typeof chat.chatId === 'string' && /^[0-9]+@(c\.us|lid)$/.test(chat.chatId)
      ? { chatId: chat.chatId, name: (ctx.fullName || '').slice(0, 100) }
      : { chatId: null, kind: chat ? chat.kind : 'nenhuma' };
    renderSched();
  }

  function syncSchedActive() {
    const want = state.open && state.section === 'agendados';
    clearInterval(sched.timer);
    sched.timer = null;
    if (!want) return;
    loadSchedules();
    loadSchedTarget();
    sched.timer = setInterval(() => { if (document.hidden) return; loadSchedules(); loadSchedTarget(); }, SCHED_TICK_MS);
  }

  // "Agendar nesta conversa" no menu do item
  function scheduleItem(item) {
    sched.form.mode = 'salva';
    sched.form.itemId = item.id;
    sched.form.msg = '';
    sched.form.error = false;
    setSection('agendados');
  }

  function schedField(label, input) {
    const f = el('label', 'ed-field', label);
    f.append(input);
    return f;
  }

  function renderSched() {
    if (!stabEl) return;
    const f = sched.form;
    stabEl.textContent = '';
    stabEl.append(el('div', 'crm-intro', 'Sai na hora marcada com o WhatsApp Web aberto; se estiver fechado, sai quando você abrir (até 24 h de atraso; depois disso expira).'));
    if (sched.available === false) {
      stabEl.append(el('div', 'ed-note', 'Atualize o banco para usar este recurso.'));
      return;
    }

    // Formulário
    const form = el('section', 'crmsec');
    const t = sched.target;
    const who = t && t.chatId ? t.name || 'conversa aberta' : null;
    form.append(el('div', 'wt-head', who ? `AGENDAR PARA ${who.toUpperCase()}` : 'AGENDAR'));
    if (!who) {
      form.append(el('div', 'ed-note', t && t.kind === 'grupo' ? 'Grupos não recebem agendamentos. Abra uma conversa individual.' : 'Abra uma conversa individual no WhatsApp para agendar.'));
    }
    const date = el('input', 'ed-title');
    date.type = 'date';
    date.value = f.date;
    date.setAttribute('aria-label', 'Data');
    date.addEventListener('input', () => { f.date = date.value; });
    const time = el('input', 'ed-title');
    time.type = 'time';
    time.value = f.time;
    time.setAttribute('aria-label', 'Hora');
    time.addEventListener('input', () => { f.time = time.value; });
    const dt = el('div', 'sc-row');
    dt.append(schedField('Data', date), schedField('Hora', time));
    form.append(dt);
    const quick = el('div', 'ed-add');
    [['+1h', '+1h'], ['+3h', '+3h'], ['amanha9', 'amanhã 9h'], ['amanha14', 'amanhã 14h'], ['2dias', 'em 2 dias']].forEach(([k, label]) => {
      const b = el('button', 'ed-mini', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        const d = shortcutDate(k);
        f.date = dateInput(d);
        f.time = timeInput(d);
        renderSched();
      });
      quick.append(b);
    });
    form.append(quick);

    const modeRow = el('div', 'sc-row');
    [['texto', 'Escrever agora'], ['salva', 'Mensagem salva']].forEach(([m, label]) => {
      const l = el('label', 'sc-radio');
      const r = el('input');
      r.type = 'radio';
      r.name = 'sc-mode';
      r.value = m;
      r.checked = f.mode === m;
      r.addEventListener('change', () => { f.mode = m; renderSched(); });
      l.append(r, label);
      modeRow.append(l);
    });
    form.append(modeRow);
    if (f.mode === 'texto') {
      const ta = el('textarea', 'ed-text');
      ta.maxLength = 4096;
      ta.rows = 3;
      ta.value = f.body;
      ta.placeholder = 'Mensagem ({nome} vira o primeiro nome do contato)';
      ta.setAttribute('aria-label', 'Mensagem do agendamento');
      const count = el('div', 'ed-count', `${f.body.length}/4096`);
      ta.addEventListener('input', () => { f.body = ta.value; count.textContent = `${ta.value.length}/4096`; });
      form.append(ta, count);
    } else {
      const sel = el('select', 'ed-cat');
      sel.setAttribute('aria-label', 'Mensagem salva');
      const none = el('option', null, 'Escolha uma mensagem…');
      none.value = '';
      sel.append(none);
      state.items.forEach((i) => {
        const o = el('option', null, `${i.title}${isMultiPart(i) ? ` (${i.parts.length} partes)` : ''}`);
        o.value = i.id;
        o.selected = i.id === f.itemId;
        sel.append(o);
      });
      sel.addEventListener('change', () => { f.itemId = sel.value; });
      form.append(sel);
    }
    const go = el('button', 'btn primary', f.saving ? 'Agendando…' : 'Agendar');
    go.type = 'button';
    go.disabled = f.saving || !who;
    go.addEventListener('click', () => createScheduleFromForm());
    form.append(go, el('div', `ed-msg${f.error ? ' err' : ''}`, f.msg));
    stabEl.append(form);

    // Listas
    const listSec = (title, rows, withCancel) => {
      const sec = el('section', 'crmsec');
      sec.append(el('div', 'wt-head', title));
      if (!rows.length) sec.append(el('div', 'lt-none', sched.loading ? 'Carregando…' : 'Nenhum.'));
      rows.forEach((row) => {
        const line = el('div', `sc-item st-${row.status}`);
        const main = el('div', 'sc-main');
        main.append(el('div', 'sc-who', row.chat_name || 'Conversa'), el('div', 'sc-prev', schedPreview(row)));
        const side = el('div', 'sc-side');
        side.append(el('span', 'sc-when', schedWhen(row.send_at)));
        const status = el('span', 'sc-status', SCHED_STATUS_LABEL[row.status] || row.status);
        if (row.error_code) status.title = SCHED_ERROR_LABEL[row.error_code] || row.error_code;
        side.append(status);
        if (withCancel && row.status === 'pendente') {
          const c = el('button', 'ed-mini', 'Cancelar');
          c.type = 'button';
          c.addEventListener('click', () => cancelScheduleRow(row));
          side.append(c);
        }
        line.append(main, side);
        sec.append(line);
      });
      return sec;
    };
    if (sched.error) stabEl.append(el('div', 'ed-msg err', sched.error));
    stabEl.append(listSec('PENDENTES', sched.pending, true), listSec('ÚLTIMOS 3 DIAS', sched.recent, false));
  }

  async function createScheduleFromForm() {
    const f = sched.form;
    const t = sched.target;
    if (f.saving || !t || !t.chatId) return;
    const fail = (msg) => { f.msg = msg; f.error = true; renderSched(); };
    if (!f.date || !f.time) return fail('Escolha a data e a hora.');
    const when = new Date(`${f.date}T${f.time}:00`);
    if (Number.isNaN(when.getTime())) return fail('Data e hora inválidas.');
    if (when.getTime() < Date.now() - 60 * 1000) return fail('Escolha uma data e hora no futuro.');
    const payload = { chat_id: t.chatId, chat_name: t.name || null, send_at: when.toISOString() };
    if (f.mode === 'texto') {
      if (!f.body.trim()) return fail('Escreva a mensagem.');
      payload.body = f.body;
    } else {
      if (!state.items.some((i) => i.id === f.itemId)) return fail('Escolha uma mensagem salva.');
      payload.item_id = f.itemId;
    }
    f.saving = true;
    f.msg = '';
    f.error = false;
    renderSched();
    try {
      await call('createSchedule', payload);
      f.body = '';
      f.msg = `Agendado para ${schedWhen(payload.send_at)}.`;
      f.error = false;
    } catch (e) {
      f.msg = e.message === 'Atualize o banco para usar este recurso' ? e.message : `Não consegui agendar: ${e.message}`;
      f.error = true;
    }
    f.saving = false;
    await loadSchedules();
  }

  async function cancelScheduleRow(row) {
    try {
      const res = await call('cancelSchedule', { id: row.id });
      toast(res && res.cancelled ? 'Agendamento cancelado.' : 'Esse agendamento já saiu da fila.', res && res.cancelled ? 'ok' : 'warn', 4000);
    } catch {
      toast('Não consegui cancelar. Tente de novo.', 'error', 5000);
    }
    loadSchedules();
  }

  // ── Executor ──

  const finishSched = (id, status, error_code = null) => call('finishSchedule', { id, status, error_code }).catch(() => null);

  async function schedTick() {
    const r = sched.runner;
    if (r.busy || seq || state.busyId || Date.now() < r.cooldownUntil) return;
    if (sched.available === false && Date.now() - r.probeAt < 5 * 60 * 1000) return;
    r.busy = true;
    try {
      const st = await refreshWaStatus();
      if (!st || !st.ready) return;
      let due;
      try {
        due = await call('dueSchedules');
        sched.available = true;
      } catch (e) {
        if (e.message === 'Atualize o banco para usar este recurso') { sched.available = false; r.probeAt = Date.now(); }
        return;
      }
      if (!Array.isArray(due) || !due.length) return;
      let target = null;
      for (const row of due) {
        if (Date.now() - Date.parse(row.send_at) > SCHED_MAX_LATE_MS) await finishSched(row.id, 'expirada');
        else { target = row; break; }
      }
      if (!target) { if (state.section === 'agendados') loadSchedules(); return; }
      if (seq || state.busyId) return;
      const claimed = await call('claimSchedule', { id: target.id }).catch(() => null);
      if (!claimed) return; // outra aba/PC pegou
      await runScheduled(claimed);
      r.cooldownUntil = Date.now() + SCHED_GAP_MIN_MS + Math.floor(Math.random() * SCHED_GAP_EXTRA_MS);
      setTimeout(() => { schedTick(); }, r.cooldownUntil - Date.now() + 50);
      if (state.section === 'agendados') loadSchedules();
    } finally {
      r.busy = false;
    }
  }

  async function runScheduled(row) {
    let parts;
    let item = null;
    if (row.item_id) {
      item = state.items.find((i) => i.id === row.item_id);
      if (!item) { await reloadLibrary().catch(() => {}); item = state.items.find((i) => i.id === row.item_id); }
      if (!item) { await finishSched(row.id, 'falhou', 'item_not_found'); return { status: 'missing' }; }
      parts = partsOf(item);
    } else {
      parts = [{ type: 'texto', body: row.body, wait_seconds: 0, typing_seconds: 0 }];
    }
    const name = (row.chat_name || '').trim();
    const firstName = await nameForChat(row.chat_id, globalThis.TspEngine.smartFirstName({ waName: name }));
    sched.runner.current = row.id;
    let res;
    try {
      res = await runSequence({ parts, chatId: row.chat_id, firstName, label: 'Agendado' });
    } finally {
      sched.runner.current = null;
    }
    if (res.status === 'ok') {
      await finishSched(row.id, 'enviada');
      if (item) applyItemLabels(item, { chatId: row.chat_id, name: row.chat_name || null });
      if (item) registerUse(item);
      toast(`Agendamento enviado${row.chat_name ? ` para ${row.chat_name}` : ''}.`, 'ok', 5000);
      return res;
    } else if (res.status === 'stopped') {
      await finishSched(row.id, 'cancelada', 'stopped');
      toast('Agendamento parado e cancelado.', 'warn', 5000);
    } else if (res.stage === 'before-send') {
      const code = res.code === 'invalid_chat' ? 'chat_not_loaded' : res.code === 'not_ready' ? 'not_ready' : 'send_unconfirmed';
      await finishSched(row.id, 'falhou', res.sent ? 'send_unconfirmed' : code);
      toast(code === 'chat_not_loaded' ? 'Agendamento não saiu: a conversa não está carregada no WhatsApp Web.' : 'Agendamento não saiu. Veja em Agendados.', 'error', 8000);
    } else {
      await finishSched(row.id, 'falhou', 'send_unconfirmed');
      toast('Agendamento: não consegui confirmar o envio. Confira a conversa antes de tentar de novo.', 'error', 12000);
    }
    return res; // 2.0.0: o motor registra o resultado em wa_send_log
  }

  // ── Motor de envios (2.0.0): agendados + follows (+ disparos) numa fila só ──────────
  // A lógica fica em engine.js (TspEngine). Aqui só ligamos o motor ao painel: background (call),
  // ponte do WhatsApp (waRequest) e o envio em sequência (runSequence). Sem as tabelas novas,
  // o motor chama o executor de agendamentos da 1.9.0 (schedTick), como antes.

  const E = globalThis.TspEngine;
  const AUTO_LABELS = ['Agendado', 'Follow', 'Disparo'];

  enginePoke = () => motor.poke();
  const motor = E.createMotor({
    api: (type, payload) => call(type, payload),
    wa: {
      ready: async () => { const st = await refreshWaStatus(); return !!(st && st.ready); },
      chatsInfo: (p) => waRequest('chatsInfo', p, { timeout: 8000 }),
      // 2.5.0: etiquetas nativas (fila de trocas e conversas da etiqueta: só memória do WhatsApp Web)
      labelEvents: () => waRequest('labelEvents', {}, { timeout: 2000 }),
      labelChatIds: (p) => waRequest('labelChatIds', p, { timeout: 8000 }),
      setChatLabels: (p) => waRequest('setChatLabels', p, { timeout: 15000 }),
    },
    sendParts: (o) => runSequence(o),
    partsOf: (item) => partsOf(item),
    itemById: async (id) => {
      let item = state.items.find((i) => i.id === id);
      if (!item) { await reloadLibrary().catch(() => {}); item = state.items.find((i) => i.id === id); }
      return item || null;
    },
    isManualBusy: () => !!(seq || state.busyId),
    runScheduled: (row) => runScheduled(row),
    legacyTick: () => schedTick(),
    onChange: () => renderEngineUi(),
    onItemUsed: (item) => registerUse(item),
    onItemSent: (item, target) => applyItemLabels(item, target),
    nameFor: (chatId, fallback) => nameForChat(chatId, fallback),
    onLabelsChanged: () => { syncLabels().catch(() => {}); },
    stopRunning: () => { if (seq && AUTO_LABELS.includes(seq.label)) stopSequence(); },
    campaignJob: (api) => campaignJob(api),
    runCampaignJob: (job, helpers) => runCampaignJob(job, helpers),
    leaseWork: async () => { await adAttributionTick(); await contactAutoTick(); },
  });

  // ── Disparos (2.0.0-D2): o motor só pega alvos de disparos que o usuário iniciou ──

  async function campaignJob(api) {
    let r = null;
    try { r = await api('nextCampaignTarget'); } catch { r = null; }
    return r && r.target ? { kind: 'disparo', campaign: r.campaign, target: r.target } : null;
  }

  const finishTarget = (id, status, reason) => call('finishTarget', { id, status, reason }).catch(() => null);

  async function runCampaignJob({ campaign, target }, h) {
    const entry = { source: 'disparo', source_id: campaign.id, contact_id: target.contact_id || null, chat_id: target.chat_id || null, item_id: campaign.item_id || null };
    const skip = async (reason) => { await finishTarget(target.id, 'pulado', reason); await h.logSkip(entry, reason); return { attempted: false }; };
    // "Não enviar" de novo (a etiqueta pode ter sido marcada depois da foto)
    if (h.noSendLabelId && target.contact_id) {
      let labels = null;
      try { labels = await call('contactLabelIds', { contactId: target.contact_id }); } catch { labels = null; }
      if (Array.isArray(labels) && labels.includes(h.noSendLabelId)) return skip('Não enviar');
    }
    if (!target.chat_id) return skip('sem telefone');
    // 2.2.0: mensagem exclusiva do disparo (parts) ou a mensagem salva
    const exclusive = Array.isArray(campaign.parts) && campaign.parts.length ? campaign.parts.map((p) => ({ ...p })) : null;
    let item = null;
    if (!exclusive) {
      item = state.items.find((i) => i.id === campaign.item_id);
      if (!item) { await reloadLibrary().catch(() => {}); item = state.items.find((i) => i.id === campaign.item_id); }
      if (!item) return skip('mensagem salva não existe mais');
    }
    let info = null;
    try { info = await waRequest('chatsInfo', { chatIds: [target.chat_id], keywords: [] }, { timeout: 8000 }); } catch { info = null; }
    const loaded = !!(info && info.chats && info.chats[target.chat_id]);
    const replied = (campaign.filters || []).find((x) => x.type === 'respondeu_recente');
    const lastIn = loaded ? info.chats[target.chat_id].lastIn : null;
    if (replied && lastIn && Date.now() - lastIn * 1000 <= replied.days * 86400000) return skip(`respondeu nos últimos ${replied.days} dias`);
    let newChat = false;
    if (!loaded) {
      // Conversa nova só com a opção ligada e só para número (@c.us); a ponte confere com queryExists
      if (!campaign.allow_new_chats || !/^\d{8,15}@c\.us$/.test(target.chat_id)) return skip('conversa não carregada');
      newChat = true;
    }
    const claimed = await call('claimTarget', { id: target.id }).catch(() => null);
    if (!claimed) return { attempted: false }; // outra aba pegou
    const logId = await h.logStart(entry);
    let res;
    try {
      res = await runSequence({ parts: exclusive || partsOf(item), chatId: target.chat_id, firstName: await nameForChat(target.chat_id, E.firstNameOf(target.name)), label: 'Disparo', newChat });
    } catch {
      res = { status: 'failed', stage: 'sending', sent: 0 };
    }
    let out;
    if (res.status !== 'ok' && res.code === 'no_whatsapp' && !res.sent) out = { status: 'pulado', reason: 'número sem WhatsApp' };
    else {
      out = h.outcome(res);
      if (out.status === 'pulado' && res.status === 'stopped') out = { status: 'pulado', reason: 'parado por você' };
    }
    await finishTarget(target.id, out.status, out.reason);
    await h.logFinish(logId, out.status, out.reason);
    if (out.status === 'enviado') {
      if (item) { registerUse(item); applyItemLabels(item, { contactId: target.contact_id || undefined, chatId: target.chat_id }); }
      // Depois de enviar (2.2.0): só para quem recebeu com sucesso
      if (target.contact_id) {
        for (const a of campaign.after_actions || []) {
          try {
            if (a.type === 'adicionar_etiqueta') await call('followAdd', { contactId: target.contact_id, labelId: a.label_id });
            else if (a.type === 'remover_etiqueta') await call('followReserve', { contactId: target.contact_id, labelId: a.label_id });
            else if (a.type === 'mover') {
              if (campaign.label_id) await call('followReserve', { contactId: target.contact_id, labelId: campaign.label_id });
              await call('followAdd', { contactId: target.contact_id, labelId: a.label_id });
            }
          } catch { /* a próxima ação segue */ }
        }
        if ((campaign.after_actions || []).length) afterLabelChange();
      }
    }
    if (dp.open) refreshDisparos({ quiet: true });
    return { attempted: out.status !== 'pulado' };
  }

  const dtabEl = shadow.querySelector('.dtab');
  const dp = {
    open: false, timer: null, view: 'list', list: [], loading: false, error: '', msg: '', msgErr: false,
    form: null, confirm: null, detail: null, busy: false, confirmAction: null,
  };
  const CAMPAIGN_STATUS = { rascunho: 'RASCUNHO', agendada: 'AGENDADO', rodando: 'RODANDO', pausada: 'PAUSADO', concluida: 'CONCLUÍDO', cancelada: 'CANCELADO' };
  const TARGET_STATUS_LABEL = { pendente: 'pendente', enviando: 'enviando', enviado: 'enviado', falhou: 'falhou', pulado: 'pulado' };
  const MASS_WARNING = 'Envios em massa podem fazer o WhatsApp bloquear seu número. Use mensagens que o cliente espera receber e respeite os limites.';
  const campaignsReady = () => motor.state.available === true && motor.state.campaignsAvailable === true;
  const campaignsLive = () => dp.list.some((c) => c.status === 'rodando' || c.status === 'agendada');

  function syncDisparosActive() {
    const want = state.open && state.section === 'disparos';
    clearInterval(dp.timer);
    dp.timer = null;
    dp.open = want;
    if (!want) return;
    refreshDisparos();
    dp.timer = setInterval(() => { if (dp.view === 'list' && !document.hidden) refreshDisparos({ quiet: true }); }, 60 * 1000); // 2.4.1: era 10 s
  }

  async function refreshDisparos({ quiet = false } = {}) {
    if (!quiet) { dp.loading = true; renderDisparos(); }
    await motor.loadSettings();
    if (campaignsReady()) {
      try {
        const [list] = await Promise.all([call('fetchCampaigns'), motor.refreshCounts(), motor.ensureNoSendLabel()]);
        dp.list = Array.isArray(list) ? list : [];
        dp.error = '';
      } catch (e) {
        dp.error = e.message === 'Atualize o banco para usar este recurso' ? '' : 'Não consegui carregar os disparos.';
        if (e.message === 'Atualize o banco para usar este recurso') motor.state.campaignsAvailable = false;
      }
    }
    dp.loading = false;
    if (dp.view === 'list') renderDisparos();
    renderFootPause();
  }

  function campaignProgress(c) {
    const n = c.counts || {};
    return `enviados ${n.enviado || 0} · falhas ${n.falhou || 0} · pulados ${n.pulado || 0} · restantes ${(n.pendente || 0) + (n.enviando || 0)}`;
  }

  async function doCampaignAction(c, action) {
    if (dp.busy) return;
    dp.busy = true;
    try {
      await call('campaignAction', { id: c.id, action });
      dp.msg = { pause: 'Disparo pausado.', resume: 'Disparo retomado.', cancel: 'Disparo cancelado.' }[action];
      dp.msgErr = false;
    } catch (e) {
      dp.msg = e.message;
      dp.msgErr = true;
    }
    dp.busy = false;
    dp.confirmAction = null;
    await refreshDisparos({ quiet: true });
  }

  function campaignCard(c) {
    const card = el('div', `fw-card${c.status === 'rodando' ? ' on' : ''}`);
    const head = el('div', 'fw-head');
    head.append(el('span', 'fw-name', c.name), el('span', `fw-badge${c.status === 'rodando' ? ' on' : ''}`, CAMPAIGN_STATUS[c.status] || c.status));
    card.append(head);
    const msgName = Array.isArray(c.parts) && c.parts.length ? 'exclusiva deste disparo' : c.item_id ? itemTitle(c.item_id) : 'excluída';
    card.append(el('div', 'fw-txt', `Etiqueta CRM: ${c.label_id ? labelName(c.label_id) : 'excluída'} · Mensagem: ${msgName}`));
    const start = c.start_at ? `início ${schedWhen(c.start_at)}` : 'início: agora (ao confirmar)';
    card.append(el('div', 'fw-txt', `${start}${c.allow_new_chats ? ' · permite conversas novas' : ''}${c.skip_recent_days ? ` · pula quem recebeu nos últimos ${c.skip_recent_days} dias` : ''}`));
    if (c.status !== 'rascunho') card.append(el('div', 'fw-count', campaignProgress(c)));
    const row = el('div', 'ed-add');
    const confirmBtn = (action, text, confirmText) => fbtn('ed-mini', dp.confirmAction === `${action}:${c.id}` ? confirmText : text, () => {
      if (dp.confirmAction !== `${action}:${c.id}`) { dp.confirmAction = `${action}:${c.id}`; renderDisparos(); return; }
      if (action === 'delete') deleteCampaignRow(c);
      else doCampaignAction(c, action);
    });
    if (c.status === 'rascunho') {
      row.append(fbtn('ed-mini', 'Revisar e iniciar', () => openConfirm(c)), fbtn('ed-mini', 'Editar', () => openCampaignForm(c)), confirmBtn('delete', 'Excluir', 'Confirmar exclusão'));
    } else {
      if (c.status === 'rodando' || c.status === 'agendada') row.append(fbtn('ed-mini', 'Pausar', () => doCampaignAction(c, 'pause')));
      if (c.status === 'pausada') row.append(fbtn('ed-mini', 'Retomar', () => doCampaignAction(c, 'resume')));
      if (['rodando', 'agendada', 'pausada'].includes(c.status)) row.append(confirmBtn('cancel', 'Cancelar', 'Confirmar cancelamento'));
      row.append(fbtn('ed-mini', 'Ver alvos', () => openDetail(c)));
    }
    row.append(fbtn('ed-mini', 'Duplicar', () => duplicateCampaignRow(c)));
    if (c.status !== 'rascunho') {
      if (['concluida', 'cancelada'].includes(c.status)) row.append(confirmBtn('delete', 'Excluir', 'Confirmar exclusão'));
    }
    card.append(row);
    return card;
  }

  // Duplicar: rascunho igual (mensagem, ações e filtros), sem alvos
  async function duplicateCampaignRow(c) {
    try {
      await call('duplicateCampaign', { id: c.id });
      dp.msg = 'Disparo duplicado como rascunho.';
      dp.msgErr = false;
    } catch (e) {
      dp.msg = `Não consegui duplicar: ${e.message}`;
      dp.msgErr = true;
    }
    await refreshDisparos({ quiet: true });
  }

  async function deleteCampaignRow(c) {
    try {
      await call('deleteCampaign', { id: c.id });
      dp.msg = 'Disparo excluído.';
      dp.msgErr = false;
    } catch (e) {
      dp.msg = e.message;
      dp.msgErr = true;
    }
    dp.confirmAction = null;
    await refreshDisparos({ quiet: true });
  }

  function renderDisparos() {
    if (!dtabEl) return;
    dtabEl.textContent = '';
    dtabEl.append(el('div', 'crm-intro', 'Disparos mandam uma mensagem (exclusiva do disparo ou salva) para todos de uma etiqueta CRM, um por vez, com os mesmos limites e horário das automações. Só começa quando você confirma "Iniciar disparo".'));
    if (motor.state.available === false || motor.state.campaignsAvailable === false) {
      dtabEl.append(el('div', 'ed-note', 'Atualize o banco para usar este recurso.'));
      return;
    }
    if (motor.state.available === null) { dtabEl.append(el('div', 'lt-none loading', 'Carregando…')); return; }
    if (dp.view === 'new') { renderCampaignForm(); return; }
    if (dp.view === 'confirm') { renderConfirm(); return; }
    if (dp.view === 'detail') { renderDetail(); return; }
    if (dp.view === 'simulate' && dp.sim) { renderCampaignSim(); return; }
    renderFollowsTop(dtabEl);
    if (dp.msg) dtabEl.append(el('div', `ed-msg${dp.msgErr ? ' err' : ''}`, dp.msg));
    if (dp.error) dtabEl.append(el('div', 'ed-msg err', dp.error));
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'DISPAROS'));
    sec.append(fbtn('fw-card fw-new', '+ Novo disparo', () => openCampaignForm(null)));
    if (!dp.list.length) sec.append(el('div', 'lt-none', dp.loading ? 'Carregando…' : 'Nenhum disparo ainda.'));
    dp.list.forEach((c) => sec.append(campaignCard(c)));
    dtabEl.append(sec);
  }

  // ── Formulário do disparo (2.2.0: mensagem exclusiva, filtros, depois de enviar, simular) ──

  const v2Ready = () => motor.state.campaignsV2 === true;
  const AFTER_LABEL = { adicionar_etiqueta: 'Adicionar etiqueta CRM', remover_etiqueta: 'Remover etiqueta CRM', mover: 'Mover (tira a do disparo e põe outra)' };
  const FILTER_LABEL = { tem_etiqueta: 'também tem a etiqueta', nao_tem_etiqueta: 'NÃO tem a etiqueta', respondeu_recente: 'excluir quem respondeu nos últimos (dias)' };

  function openCampaignForm(c) {
    const start = c && c.start_at ? new Date(c.start_at) : null;
    const hasParts = !!(c && Array.isArray(c.parts) && c.parts.length);
    dp.form = {
      id: c ? c.id : null, name: c ? c.name : '', label_id: c ? c.label_id || '' : '', item_id: c ? c.item_id || '' : '',
      mode: !v2Ready() ? 'salva' : hasParts ? 'exclusiva' : c && c.item_id ? 'salva' : 'exclusiva',
      parts: hasParts ? c.parts.map(edPart) : [edPart({ type: 'texto' })],
      after_actions: c && Array.isArray(c.after_actions) ? c.after_actions.map((a) => ({ ...a })) : [],
      filters: c && Array.isArray(c.filters) ? c.filters.map((f) => ({ ...f })) : [],
      when: start ? 'data' : 'agora', date: start ? dateInput(start) : '', time: start ? timeInput(start) : '',
      allow_new_chats: c ? !!c.allow_new_chats : false, skip_recent_days: c ? c.skip_recent_days : 7,
      quick: { category_id: state.categories.length ? state.categories[0].id : '', title: '', saving: false },
      msg: '', err: false, saving: false,
    };
    dp.view = 'new';
    renderDisparos();
  }

  function dpMsg(text, err = false) {
    if (!dp.form) return;
    dp.form.msg = text;
    dp.form.err = err;
    const box = dtabEl.querySelector('.dp-msg');
    if (box) { box.textContent = text; box.className = `ed-msg dp-msg${err ? ' err' : ''}`; }
  }

  const dpCtx = () => ({ parts: dp.form.parts, rerender: renderDisparos, msg: dpMsg, saving: () => dp.form.saving, totals: null });

  // Etiqueta com "Criar agora" (mesmo comportamento do editor de automações)
  function dpLabelPicker(value, onChange, aria) {
    return labelPicker(value, onChange, { empty: 'Escolha a etiqueta CRM…', aria, rerender: renderDisparos, onError: (m) => dpMsg(m, true) });
  }

  function renderCampaignForm() {
    const f = dp.form;
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', f.id ? 'EDITAR DISPARO' : 'NOVO DISPARO'));
    const name = el('input', 'ed-title');
    name.maxLength = 60;
    name.value = f.name;
    name.placeholder = 'Ex.: Black Friday clientes';
    name.addEventListener('input', () => { f.name = name.value; });
    sec.append(schedField('Nome', name));
    const lab = labelSelect(f.label_id, { empty: 'Escolha a etiqueta CRM…', aria: 'Etiqueta CRM do disparo' });
    lab.addEventListener('change', () => { f.label_id = lab.value; });
    sec.append(schedField('Para quem (etiqueta CRM)', lab));

    // Mensagem
    sec.append(el('div', 'crm-sub', 'Mensagem'));
    const modeRow = el('div', 'sc-row');
    [['exclusiva', 'Escrever só para este disparo'], ['salva', 'Usar uma mensagem salva']].forEach(([m, label]) => {
      const l = el('label', 'sc-radio');
      const r = el('input');
      r.type = 'radio';
      r.name = 'dp-msgmode';
      r.checked = f.mode === m;
      r.disabled = m === 'exclusiva' && !v2Ready();
      r.addEventListener('change', () => { f.mode = m; renderDisparos(); });
      l.append(r, label);
      modeRow.append(l);
    });
    sec.append(modeRow);
    if (!v2Ready()) sec.append(el('div', 'ed-note', 'Mensagem exclusiva, filtros e "depois de enviar": atualize o banco para usar este recurso.'));
    if (f.mode === 'exclusiva') {
      sec.append(el('div', 'crm-intro', 'Não cria nada em Mensagens. {nome} vira o primeiro nome; Olá{, nome}! some sem nome.'));
      f.parts.forEach((p, i) => sec.append(edPartEl(p, i, dpCtx())));
      const add = el('div', 'ed-add');
      add.append(el('span', null, '+ Adicionar:'));
      edTypes().forEach(([v, t]) => {
        const b = fbtn('ed-mini', t, () => { f.parts.push(v === 'album' ? { ...edPart({ type: 'imagem' }), type: 'album', files: [] } : edPart({ type: v })); renderDisparos(); });
        b.disabled = f.saving || f.parts.length >= ED_MAX_PARTS;
        add.append(b);
      });
      sec.append(add);
      // Salvar também como mensagem rápida
      const qr = el('div', 'sc-row');
      const cat = el('select', 'ed-cat');
      cat.setAttribute('aria-label', 'Categoria da mensagem rápida');
      state.categories.forEach((c) => { const o = el('option', null, c.name); o.value = c.id; o.selected = c.id === f.quick.category_id; cat.append(o); });
      cat.addEventListener('change', () => { f.quick.category_id = cat.value; });
      const qt = el('input', 'ed-title');
      qt.maxLength = 80;
      qt.value = f.quick.title;
      qt.placeholder = 'Título da mensagem rápida';
      qt.setAttribute('aria-label', 'Título da mensagem rápida');
      qt.addEventListener('input', () => { f.quick.title = qt.value; });
      const qb = fbtn('ed-mini', f.quick.saving ? 'Salvando…' : 'Salvar também como mensagem rápida', () => saveCampaignAsItem());
      qb.disabled = f.quick.saving || !state.categories.length;
      qr.append(cat, qt, qb);
      sec.append(qr);
    } else {
      const it = itemSelect(f.item_id, { aria: 'Mensagem do disparo' });
      it.addEventListener('change', () => { f.item_id = it.value; });
      sec.append(it);
    }

    // Quando
    const whenRow = el('div', 'sc-row');
    [['agora', 'Começar ao confirmar'], ['data', 'Data e hora']].forEach(([m, label]) => {
      const l = el('label', 'sc-radio');
      const r = el('input');
      r.type = 'radio';
      r.name = 'dp-when';
      r.checked = f.when === m;
      r.addEventListener('change', () => { f.when = m; renderDisparos(); });
      l.append(r, label);
      whenRow.append(l);
    });
    sec.append(el('div', 'crm-sub', 'Início'), whenRow);
    if (f.when === 'data') {
      const d = el('input', 'ed-title');
      d.type = 'date';
      d.value = f.date;
      d.setAttribute('aria-label', 'Data do início');
      d.addEventListener('input', () => { f.date = d.value; });
      const t = el('input', 'ed-title');
      t.type = 'time';
      t.value = f.time;
      t.setAttribute('aria-label', 'Hora do início');
      t.addEventListener('input', () => { f.time = t.value; });
      const r = el('div', 'sc-row');
      r.append(schedField('Data', d), schedField('Hora', t));
      sec.append(r);
    }

    // Público
    sec.append(el('div', 'crm-sub', 'Público (além da etiqueta principal)'));
    f.filters.forEach((flt, i) => {
      const row = el('div', 'fw-variant');
      row.append(el('div', 'crm-sub', FILTER_LABEL[flt.type]));
      if (flt.type === 'respondeu_recente') {
        const n = numberInput(flt.days || 7, 1, 365, `Dias do filtro ${i + 1}`);
        n.addEventListener('input', () => { flt.days = Math.floor(Number(n.value) || 0); });
        row.append(n);
      } else row.append(dpLabelPicker(flt.label_id, (v) => { flt.label_id = v; }, `Etiqueta do filtro ${i + 1}`));
      const rm = fbtn('ed-mini', '✕', () => { f.filters.splice(i, 1); renderDisparos(); });
      rm.setAttribute('aria-label', 'Remover filtro');
      row.append(rm);
      sec.append(row);
    });
    const addF = el('div', 'ed-add');
    [['tem_etiqueta', '+ também tem a etiqueta'], ['nao_tem_etiqueta', '+ NÃO tem a etiqueta'], ['respondeu_recente', '+ excluir quem respondeu nos últimos X dias']].forEach(([t, label]) => {
      const b = fbtn('ed-mini', label, () => { f.filters.push(t === 'respondeu_recente' ? { type: t, days: 7 } : { type: t, label_id: '' }); renderDisparos(); });
      b.disabled = !v2Ready() || f.filters.length >= 10;
      addF.append(b);
    });
    sec.append(addF);
    const recent = numberInput(f.skip_recent_days, 0, 90, 'Pular quem recebeu envio automático nos últimos (dias)');
    recent.addEventListener('input', () => { f.skip_recent_days = Math.floor(Number(recent.value) || 0); });
    sec.append(schedField('Excluir quem recebeu qualquer envio automático nos últimos (dias)', recent));
    const nl = el('label', 'sc-radio');
    const nc = el('input');
    nc.type = 'checkbox';
    nc.checked = f.allow_new_chats;
    nc.addEventListener('change', () => { f.allow_new_chats = nc.checked; });
    nl.append(nc, 'Permitir conversas novas');
    sec.append(nl, el('div', 'crm-intro', 'Desligado (recomendado): só conversas já carregadas no WhatsApp Web; as outras ficam "pulado". Ligado: manda também para números que nunca falaram com você, depois de conferir que o número tem WhatsApp.'));

    // Depois de enviar
    sec.append(el('div', 'crm-sub', 'Depois de enviar (só para quem recebeu com sucesso)'));
    f.after_actions.forEach((a, i) => {
      const row = el('div', 'fw-variant');
      const type = el('select', 'ed-cat');
      type.setAttribute('aria-label', `Depois de enviar ${i + 1}`);
      Object.entries(AFTER_LABEL).forEach(([k, t]) => { const o = el('option', null, `${i + 1}. ${t}`); o.value = k; o.selected = a.type === k; type.append(o); });
      type.addEventListener('change', () => { a.type = type.value; renderDisparos(); });
      row.append(type, dpLabelPicker(a.label_id, (v) => { a.label_id = v; }, `Etiqueta depois de enviar ${i + 1}`));
      const ctl = el('div', 'ed-add');
      const up = fbtn('ed-mini', '↑', () => { f.after_actions.splice(i - 1, 0, f.after_actions.splice(i, 1)[0]); renderDisparos(); });
      up.disabled = i === 0;
      up.setAttribute('aria-label', 'Subir');
      const rm = fbtn('ed-mini', '✕', () => { f.after_actions.splice(i, 1); renderDisparos(); });
      rm.setAttribute('aria-label', 'Remover ação');
      ctl.append(up, rm);
      row.append(ctl);
      sec.append(row);
    });
    const addA = fbtn('ed-mini', '+ Ação depois de enviar', () => { f.after_actions.push({ type: 'adicionar_etiqueta', label_id: '' }); renderDisparos(); });
    addA.disabled = !v2Ready() || f.after_actions.length >= 10;
    sec.append(addA);

    const actions = el('div', 'ed-add');
    const save = fbtn('bbtn primary', f.saving ? 'Salvando…' : 'Salvar e revisar', () => saveCampaignForm());
    save.disabled = f.saving;
    actions.append(save, fbtn('bbtn', 'Simular', () => simulateCampaignForm()), fbtn('bbtn', 'Cancelar', () => { dp.view = 'list'; renderDisparos(); }));
    sec.append(actions, el('div', `ed-msg dp-msg${f.err ? ' err' : ''}`, f.msg));
    dtabEl.append(sec);
  }

  // Sobe os arquivos novos das partes e devolve as partes prontas para gravar
  async function partsForSave(list, msg) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.type === 'texto' && !String(p.body || '').trim()) throw new Error(`Parte ${i + 1}: escreva o texto.`);
      if (p.type === 'album') {
        if (!(p.files && p.files.length)) throw new Error(`Parte ${i + 1}: escolha as fotos.`);
        out.push(await albumPartForSave(p, i, msg));
        continue;
      }
      if (p.type !== 'texto' && !p.file && !p.file_url) throw new Error(`Parte ${i + 1}: escolha o arquivo.`);
      let file = { file_url: p.file_url, file_name: p.file_name, file_size: p.file_size };
      if (p.type !== 'texto' && p.file) {
        msg(`Enviando o arquivo da parte ${i + 1}…`);
        file = await uploadPartFile(p);
        Object.assign(p, file, { file: null });
      }
      out.push({ type: p.type, body: p.type === 'audio' ? null : p.body, ...(p.type === 'texto' ? {} : file), wait_seconds: p.wait_seconds, typing_seconds: p.typing_seconds });
    }
    return out;
  }

  async function campaignPayload(f, { upload = true } = {}) {
    if (f.label_id && String(JSON.stringify([f.after_actions, f.filters])).includes('"new:')) throw new Error('Crie as etiquetas que faltam (botão "Criar agora").');
    let start_at = null;
    if (f.when === 'data') {
      if (!f.date || !f.time) throw new Error('Escolha a data e a hora do início.');
      const when = new Date(`${f.date}T${f.time}:00`);
      if (Number.isNaN(when.getTime())) throw new Error('Data e hora inválidas.');
      start_at = when.toISOString();
    }
    const exclusive = f.mode === 'exclusiva';
    let parts = null;
    if (exclusive) {
      parts = upload ? await partsForSave(f.parts, dpMsg) : f.parts.map((p) => ({ type: p.type, body: p.type === 'audio' ? null : p.body, file_url: p.file_url || (p.file ? 'pendente' : null), file_name: p.file_name, file_size: p.file_size, wait_seconds: p.wait_seconds, typing_seconds: p.typing_seconds }));
    }
    const v2 = v2Ready();
    return {
      name: f.name, label_id: f.label_id || null, item_id: exclusive ? null : f.item_id || null, start_at, allow_new_chats: f.allow_new_chats,
      skip_recent_days: f.skip_recent_days,
      ...(v2 ? { parts, after_actions: f.after_actions.map((a) => ({ type: a.type, label_id: a.label_id || null })), filters: f.filters.map((x) => ({ ...x })) } : {}),
    };
  }

  async function saveCampaignForm() {
    const f = dp.form;
    if (f.saving) return;
    f.saving = true;
    renderDisparos();
    try {
      const campaign = await campaignPayload(f);
      const r = await call('saveCampaign', { id: f.id || undefined, campaign });
      f.saving = false;
      await refreshDisparos({ quiet: true });
      const c = dp.list.find((x) => x.id === r.id);
      if (c) { openConfirm(c); return; }
      dp.view = 'list';
      renderDisparos();
    } catch (e) {
      f.saving = false;
      f.msg = e.message;
      f.err = true;
      renderDisparos();
    }
  }

  // "Salvar também como mensagem rápida": cria o item (opcional; o disparo segue com a mensagem exclusiva)
  async function saveCampaignAsItem() {
    const f = dp.form;
    if (f.quick.saving) return;
    if (!f.quick.title.trim()) { dpMsg('Escreva o título da mensagem rápida.', true); return; }
    f.quick.saving = true;
    renderDisparos();
    try {
      const parts = await partsForSave(f.parts, dpMsg);
      await call('saveItem', { category_id: f.quick.category_id, title: f.quick.title, parts });
      await reloadLibrary().catch(() => {});
      f.quick.saving = false;
      f.quick.title = '';
      f.msg = 'Também salva em Mensagens.';
      f.err = false;
    } catch (e) {
      f.quick.saving = false;
      f.msg = `Não consegui salvar a mensagem rápida: ${e.message}`;
      f.err = true;
    }
    renderDisparos();
  }

  // ── Simular (não envia nem grava nada) ──

  function firstPartPreview(c, name) {
    const first = Array.isArray(c.parts) && c.parts.length ? c.parts[0] : (() => { const it = state.items.find((i) => i.id === c.item_id); return it ? partsOf(it)[0] : null; })();
    if (!first) return '(sem mensagem)';
    const text = first.body ? fillVars(first.body, name) : '';
    const kind = first.type === 'texto' ? '' : `[${first.type}] `;
    return `${kind}${firstWords(text, 14)}`.trim() || `[${first.type}]`;
  }

  async function runSimulation(campaign, preview) {
    const pv = preview;
    const go = pv.targets.filter((t) => t.status === 'pendente');
    const loaded = {};
    const ids = go.map((t) => t.chat_id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 500) {
      try {
        const r = await waRequest('chatsInfo', { chatIds: ids.slice(i, i + 500), keywords: [] }, { timeout: 8000 });
        Object.assign(loaded, (r && r.chats) || {});
      } catch { /* WhatsApp não pronto: conta como não carregada */ }
    }
    const replied = (campaign.filters || []).find((x) => x.type === 'respondeu_recente');
    const rows = pv.targets.map((t) => {
      if (t.status !== 'pendente') return { ...t, send: false };
      const info = loaded[t.chat_id];
      if (!info) {
        if (!campaign.allow_new_chats || !/^\d{8,15}@c\.us$/.test(t.chat_id || '')) return { ...t, send: false, reason: 'conversa não carregada' };
      }
      if (replied && info && info.lastIn && Date.now() - info.lastIn * 1000 <= replied.days * 86400000) return { ...t, send: false, reason: `respondeu nos últimos ${replied.days} dias` };
      return { ...t, send: true, preview: firstPartPreview(campaign, E.firstNameOf(t.name)), newChat: !info };
    });
    return { rows, sending: rows.filter((r) => r.send).length, total: rows.length };
  }

  async function simulateCampaignForm() {
    const f = dp.form;
    dpMsg('Simulando…');
    try {
      const campaign = await campaignPayload(f, { upload: false });
      const pv = await call('simulateCampaign', { campaign: { ...campaign, parts: campaign.parts && campaign.parts.map((p) => (p.file_url === 'pendente' ? { ...p, file_url: null, type: 'texto', body: p.body || `[${p.type}]` } : p)) } });
      dp.sim = { from: 'new', campaign, ...(await runSimulation(campaign, pv)) };
      dp.view = 'simulate';
      renderDisparos();
    } catch (e) {
      dpMsg(`Não consegui simular: ${e.message}`, true);
    }
  }

  async function simulateSaved(c) {
    try {
      const pv = await call('previewCampaign', { id: c.id });
      dp.sim = { from: 'confirm', campaign: c, ...(await runSimulation(c, pv)) };
      dp.view = 'simulate';
    } catch (e) {
      dp.msg = `Não consegui simular: ${e.message}`;
      dp.msgErr = true;
    }
    renderDisparos();
  }

  function renderCampaignSim() {
    const sim = dp.sim;
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'SIMULAR DISPARO'));
    sec.append(el('div', 'crm-intro', 'Nada foi enviado nem gravado.'));
    const skip = sim.rows.filter((r) => !r.send);
    const box = el('div', 'fw-test');
    box.append(el('div', null, `Total na etiqueta: ${sim.total} · vão receber: ${sim.sending} · pulados: ${skip.length}`));
    box.append(el('div', null, `Tempo estimado pelos limites: ${E.estimateText(sim.sending, motor.state.settings)}`));
    sec.append(box);
    sim.rows.slice(0, 200).forEach((r) => {
      const line = el('div', `sc-item fw-sim ${r.send ? 'ok' : 'skip'}`);
      const main = el('div', 'sc-main');
      main.append(el('div', 'sc-who', r.name || 'Contato'), el('div', 'sc-prev', r.send ? `${r.newChat ? '(conversa nova) ' : ''}${r.preview}` : `pulado: ${r.reason}`));
      line.append(main);
      sec.append(line);
    });
    if (sim.rows.length > 200) sec.append(el('div', 'crm-intro', `Mostrando 200 de ${sim.rows.length}.`));
    sec.append(el('div', 'ed-note', MASS_WARNING));
    sec.append(fbtn('bbtn', 'Voltar', () => { dp.view = sim.from === 'new' ? 'new' : 'confirm'; renderDisparos(); }));
    dtabEl.append(sec);
  }

  // Confirmação: total, pulados (e por quê), tempo estimado e o aviso
  async function openConfirm(c) {
    dp.view = 'confirm';
    dp.confirm = { campaign: c, loading: true };
    renderDisparos();
    try {
      const pv = await call('previewCampaign', { id: c.id });
      const chatIds = pv.chatIds || [];
      const loaded = new Set();
      for (let i = 0; i < chatIds.length; i += 500) {
        try {
          const r = await waRequest('chatsInfo', { chatIds: chatIds.slice(i, i + 500), keywords: [] }, { timeout: 8000 });
          Object.keys((r && r.chats) || {}).forEach((id) => loaded.add(id));
        } catch { /* sem WhatsApp pronto: conta como não carregada */ }
      }
      const notLoaded = chatIds.filter((id) => !loaded.has(id));
      const newOk = c.allow_new_chats ? notLoaded.filter((id) => /@c\.us$/.test(id)).length : 0;
      const notLoadedSkip = notLoaded.length - newOk;
      dp.confirm = { campaign: c, loading: false, pv, loaded: loaded.size, newOk, notLoadedSkip, sending: loaded.size + newOk };
    } catch (e) {
      dp.confirm = { campaign: c, loading: false, error: e.message };
    }
    if (dp.view === 'confirm') renderDisparos();
  }

  function renderConfirm() {
    const cf = dp.confirm;
    const c = cf.campaign;
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', `CONFIRMAR: ${c.name.toUpperCase()}`));
    if (cf.loading) { sec.append(el('div', 'lt-none', 'Calculando…')); dtabEl.append(sec); return; }
    if (cf.error) {
      sec.append(el('div', 'ed-msg err', cf.error), fbtn('bbtn', 'Voltar', () => { dp.view = 'list'; refreshDisparos(); }));
      dtabEl.append(sec);
      return;
    }
    const pv = cf.pv;
    const lines = [
      `Na etiqueta ${labelName(c.label_id)}: ${pv.total} contato${pv.total === 1 ? '' : 's'}`,
      `Vão receber: ${cf.sending}${cf.newOk ? ` (${cf.newOk} em conversa nova, se o número tiver WhatsApp)` : ''}`,
    ];
    const skips = Object.entries(pv.skipped || {});
    if (cf.notLoadedSkip) skips.push(['conversa não carregada no WhatsApp Web', cf.notLoadedSkip]);
    const skipTotal = skips.reduce((a, [, n]) => a + n, 0);
    lines.push(`Pulados: ${skipTotal}${skips.length ? ` (${skips.map(([r, n]) => `${r}: ${n}`).join('; ')})` : ''}`);
    lines.push(`Mensagem: ${Array.isArray(c.parts) && c.parts.length ? `exclusiva deste disparo (${c.parts.length} parte${c.parts.length === 1 ? '' : 's'})` : itemTitle(c.item_id)}`);
    lines.push(`Tempo estimado pelos limites: ${E.estimateText(cf.sending, motor.state.settings)}`);
    lines.push(c.start_at && Date.parse(c.start_at) > Date.now() ? `Começa em ${schedWhen(c.start_at)} (no horário comercial)` : 'Começa agora (no horário comercial)');
    const box = el('div', 'fw-test');
    lines.forEach((l) => box.append(el('div', null, l)));
    sec.append(box, el('div', 'ed-note', MASS_WARNING));
    const actions = el('div', 'ed-add');
    const go = fbtn('bbtn primary', dp.busy ? 'Iniciando…' : 'Iniciar disparo', () => startCampaignNow(c));
    go.disabled = dp.busy || !cf.sending;
    actions.append(go, fbtn('bbtn', 'Simular', () => simulateSaved(c)), fbtn('bbtn', 'Voltar', () => { dp.view = 'list'; refreshDisparos(); }));
    sec.append(actions);
    dtabEl.append(sec);
  }

  async function startCampaignNow(c) {
    if (dp.busy) return;
    dp.busy = true;
    renderDisparos();
    try {
      const r = await call('startCampaign', { id: c.id });
      dp.msg = r.status === 'agendada' ? `Disparo agendado: ${r.willSend} para enviar.` : `Disparo iniciado: ${r.willSend} para enviar, um por vez.`;
      dp.msgErr = false;
    } catch (e) {
      dp.msg = `Não consegui iniciar: ${e.message}`;
      dp.msgErr = true;
    }
    dp.busy = false;
    dp.view = 'list';
    await refreshDisparos();
  }

  async function openDetail(c, more = false) {
    dp.view = 'detail';
    const prev = more && dp.detail ? dp.detail.targets : [];
    dp.detail = { campaign: c, loading: true, targets: prev, hasMore: false };
    renderDisparos();
    try {
      const r = await call('campaignTargets', { id: c.id, offset: prev.length, limit: 200 });
      dp.detail = { campaign: c, loading: false, targets: [...prev, ...r.targets], hasMore: r.hasMore };
    } catch (e) {
      dp.detail = { campaign: c, loading: false, targets: prev, error: e.message };
    }
    if (dp.view === 'detail') renderDisparos();
  }

  function renderDetail() {
    const d = dp.detail;
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', `ALVOS: ${d.campaign.name.toUpperCase()}`));
    sec.append(el('div', 'fw-count', campaignProgress(dp.list.find((x) => x.id === d.campaign.id) || d.campaign)));
    if (d.error) sec.append(el('div', 'ed-msg err', d.error));
    if (!d.loading && !d.targets.length) sec.append(el('div', 'lt-none', 'Nenhum alvo.'));
    d.targets.forEach((t) => {
      const line = el('div', `sc-item st-${t.status}`);
      const main = el('div', 'sc-main');
      main.append(el('div', 'sc-who', t.name || 'Contato'), el('div', 'sc-prev', t.reason || (t.sent_at ? `enviado ${schedWhen(t.sent_at)}` : '')));
      const side = el('div', 'sc-side');
      side.append(el('span', 'sc-status', TARGET_STATUS_LABEL[t.status] || t.status));
      line.append(main, side);
      sec.append(line);
    });
    if (d.loading) sec.append(el('div', 'lt-none loading', 'Carregando…'));
    const actions = el('div', 'ed-add');
    if (d.hasMore) actions.append(fbtn('bbtn', 'Mostrar mais', () => openDetail(d.campaign, true)));
    actions.append(fbtn('bbtn', 'Voltar', () => { dp.view = 'list'; refreshDisparos(); }));
    sec.append(actions);
    dtabEl.append(sec);
  }

  function startScheduler() {
    motor.start();
  }

  const ftabEl = shadow.querySelector('.ftab');
  const footPause = shadow.querySelector('.foot-pause');

  const fl = {
    open: false, timer: null, view: 'list', loading: false, error: '', msg: '', msgErr: false,
    edit: null, settingsForm: null, sim: null, test: null, history: null, putFlowId: '', saving: false, confirmDelete: false,
  };

  const labelName = (id) => { const l = state.labels.find((x) => x.id === id); return l ? l.name : 'etiqueta excluída'; };
  const itemTitle = (id) => { const i = state.items.find((x) => x.id === id); return i ? i.title : 'mensagem excluída'; };
  const activeFlows = () => motor.state.flows.filter((f) => f.active);
  const autoActive = () => motor.state.available === true
    && ((motor.state.automationsAvailable ? motor.state.automations.filter((a) => a.active).length : activeFlows().length) > 0 || campaignsLive() || !!motor.state.current || !!(motor.state.settings && motor.state.settings.paused_all));

  function engineRoleText() {
    const m = motor.state;
    if (m.available === false) return 'sem o banco atualizado';
    if (m.settings && m.settings.paused_all) return 'pausado';
    if (m.role === 'este') return 'este computador executa';
    if (m.role === 'outro') return 'outro computador executa';
    return 'aguardando o WhatsApp ficar pronto';
  }

  function renderFootPause() {
    if (!footPause) return;
    const show = autoActive();
    footPause.hidden = !show;
    if (!show) return;
    const paused = !!(motor.state.settings && motor.state.settings.paused_all);
    footPause.textContent = paused ? '▶ Retomar envios' : '⏸ Pausar envios';
    footPause.classList.toggle('on', paused);
  }

  function renderEngineUi() {
    renderFootPause();
    if (fl.open && fl.view === 'list') renderFollows();
    if (dp.open && dp.view === 'list') renderDisparos();
    if (state.view === 'diag') renderDiag();
  }

  async function togglePauseAll() {
    const paused = !!(motor.state.settings && motor.state.settings.paused_all);
    try {
      await motor.setPaused(!paused);
      if (dp.open) refreshDisparos({ quiet: true });
      toast(paused ? 'Envios automáticos retomados.' : 'Envios automáticos pausados.', 'ok', 3000);
    } catch (e) {
      toast(e.message === 'Atualize o banco para usar este recurso' ? e.message : 'Não consegui mudar. Tente de novo.', 'error', 5000);
    }
    renderEngineUi();
  }
  if (footPause) footPause.addEventListener('click', () => togglePauseAll());

  function syncFollowsActive() {
    const want = state.open && state.section === 'follows';
    clearInterval(fl.timer);
    fl.timer = null;
    fl.open = want;
    if (!want) return;
    refreshFollows();
    fl.timer = setInterval(() => { if (fl.view === 'list' && !document.hidden) refreshFollows({ quiet: true }); }, 60 * 1000); // 2.4.1: era 15 s
  }

  async function refreshFollows({ quiet = false } = {}) {
    if (!quiet) { fl.loading = true; renderFollows(); }
    await motor.loadSettings();
    if (motor.state.available) {
      await Promise.all([motor.state.automationsAvailable ? motor.loadAutomations() : motor.loadFlows(), motor.refreshCounts(), motor.ensureNoSendLabel()]);
      fl.error = '';
    }
    fl.loading = false;
    renderFollows();
    renderFootPause();
  }

  const fbtn = (cls, text, onClick) => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  function labelSelect(value, { empty = null, aria } = {}) {
    const sel = el('select', 'ed-cat');
    if (aria) sel.setAttribute('aria-label', aria);
    if (empty !== null) {
      const o = el('option', null, empty);
      o.value = '';
      sel.append(o);
    }
    state.labels.forEach((l) => {
      const o = el('option', null, l.name);
      o.value = l.id;
      o.selected = l.id === value;
      sel.append(o);
    });
    if (value && !state.labels.some((l) => l.id === value)) {
      const o = el('option', null, 'etiqueta excluída');
      o.value = value;
      o.selected = true;
      sel.append(o);
    }
    return sel;
  }

  function itemSelect(value, { empty = 'Escolha uma mensagem…', aria } = {}) {
    const sel = el('select', 'ed-cat');
    if (aria) sel.setAttribute('aria-label', aria);
    const none = el('option', null, empty);
    none.value = '';
    sel.append(none);
    state.items.forEach((i) => {
      const o = el('option', null, `${i.title}${isMultiPart(i) ? ` (${i.parts.length} partes)` : ''}`);
      o.value = i.id;
      o.selected = i.id === value;
      sel.append(o);
    });
    return sel;
  }

  function flash(text, err = false) {
    fl.msg = text;
    fl.msgErr = err;
  }

  function renderFollowsTop(box) {
    const m = motor.state;
    const s = m.settings || E.DEFAULT_SETTINGS;
    const top = el('section', 'crmsec');
    const row = el('div', 'ed-add');
    const paused = !!s.paused_all;
    const p = fbtn(`bbtn${paused ? ' primary' : ''}`, paused ? '▶ Retomar' : '⏸ Pausar tudo', () => togglePauseAll());
    p.classList.add('fw-pause');
    row.append(p, fbtn('bbtn', 'Limites e horário', () => { if (state.section !== 'follows') setSection('follows'); openSettings(); }));
    top.append(row);
    top.append(el('div', 'fw-count', `Envios na última hora: ${m.counts.hour}/${s.max_per_hour} · hoje: ${m.counts.day}/${s.max_per_day}`));
    top.append(el('div', 'crm-intro', `Motor: ${engineRoleText()}${m.waiting && m.role === 'este' && !paused ? ` · agora: ${m.waiting}` : ''}`));
    box.append(top);
  }

  function backToList() {
    fl.view = 'list';
    fl.edit = null;
    fl.settingsForm = null;
    renderFollows();
  }

  function numberInput(value, min, max, aria) {
    const i = el('input', 'ed-title');
    i.type = 'number';
    i.min = String(min);
    i.max = String(max);
    i.step = '1';
    i.value = String(value);
    i.setAttribute('aria-label', aria);
    return i;
  }

  // ── Automações (2.1.0): cartões, modelos e editor "Quando → Se → Então" ──

  const TRIGGER_LABEL = {
    sem_resposta: 'Ficou sem responder (tempo útil)', entrou_etiqueta: 'Entrou na etiqueta há (tempo corrido)',
    respondeu: 'Respondeu', dia_hora: 'Dia e hora fixos', venda_registrada: 'Venda registrada pela conversa',
  };
  const ACTION_LABEL = {
    enviar: 'Enviar mensagem salva', adicionar_etiqueta: 'Adicionar etiqueta CRM', remover_etiqueta: 'Remover etiqueta CRM', mover: 'Mover (tira a do gatilho e põe outra)',
    adicionar_etiqueta_wa: 'Adicionar etiqueta do WhatsApp', remover_etiqueta_wa: 'Remover etiqueta do WhatsApp', parar: 'Parar',
  };
  const COND_LABEL = { tem_etiqueta: 'tem a etiqueta CRM', nao_tem_etiqueta: 'não tem a etiqueta CRM', anuncio: 'veio do anúncio com a palavra', parada_max_dias: 'conversa parada há no máximo (dias)' };
  const NEW_LABEL = 'new:';
  const automationsReady = () => motor.state.available === true && motor.state.automationsAvailable === true;
  const activeAutomations = () => motor.state.automations.filter((a) => a.active);
  // 2.5.0: etiquetas do WhatsApp (nativas) no gatilho e nas ações
  const waLabelName = (id) => { const l = waLabelById(String(id)); return l ? l.name : `etiqueta ${id}`; };
  const summaryOf = (a) => E.automationSummary(a, { labelName: (id) => (String(id).startsWith(NEW_LABEL) ? String(id).slice(NEW_LABEL.length) : labelName(id)), waLabelName, itemTitle, settings: motor.state.settings });

  function automationCard(a) {
    const card = el('div', `fw-card${a.active ? ' on' : ''}`);
    const head = el('div', 'fw-head');
    head.append(el('span', 'fw-name', a.name), el('span', `fw-badge${a.active ? ' on' : ''}`, a.active ? 'ATIVA' : 'DESLIGADA'));
    if (a.test_chat_id) head.append(el('span', 'fw-badge test', 'EM TESTE')); // 2.8.8
    card.append(head);
    if (a.test_chat_id) card.append(el('div', 'crm-intro', `Em teste: roda só para ${testChatLabel(a.test_chat_id)}; ignora todos os outros.`));
    if (a.active && a.activated_at) card.append(el('div', 'crm-intro', `Vale daqui pra frente: desde ${new Date(a.activated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${a.include_existing ? ' (incluiu quem já estava na etiqueta)' : ''}.`));
    const s = summaryOf(a);
    [['QUANDO', s.quando], ['SE', s.se], ['ENTÃO', s.entao]].forEach(([k, t], i) => {
      if (i) card.append(el('div', 'fw-arrow', '↓'));
      const row = el('div', 'fw-step');
      row.append(el('span', 'fw-k', k), el('div', 'fw-txt', t));
      card.append(row);
    });
    const actions = el('div', 'ed-add');
    const confirmKey = `del:${a.id}`;
    actions.append(
      fbtn('ed-mini', 'Editar', () => openAutomationEditor(a)),
      fbtn('ed-mini', a.active ? 'Desligar' : 'Ligar', async () => {
        // 2.8.8: ligar mostra antes quem já está na etiqueta (e NÃO vai receber)
        if (!a.active) { fl.activating = { id: a.id, include: false, info: null }; renderFollows(); loadActivationInfo(a); return; }
        try {
          await call('setAutomationActive', { id: a.id, active: false });
          await motor.loadAutomations();
        } catch (e) { flash(`Não consegui mudar: ${e.message}`, true); }
        renderFollows();
        renderFootPause();
      }),
      fbtn('ed-mini', 'Duplicar', () => openAutomationEditor({ ...a, id: null, name: `${a.name} (cópia)`.slice(0, 60), active: false })),
      fbtn('ed-mini', fl.confirmDelete === confirmKey ? 'Confirmar exclusão' : 'Excluir', async () => {
        if (fl.confirmDelete !== confirmKey) { fl.confirmDelete = confirmKey; renderFollows(); return; }
        fl.confirmDelete = false;
        try {
          await call('deleteAutomation', { id: a.id });
          await motor.loadAutomations();
          flash('Automação excluída.');
        } catch (e) { flash(`Não consegui excluir: ${e.message}`, true); }
        renderFollows();
      }),
    );
    card.append(actions);
    if (fl.activating && fl.activating.id === a.id) card.append(activationEl(a, fl.activating, async () => {
      const act = fl.activating;
      try {
        await baselineWaLabel(a);
        await call('setAutomationActive', { id: a.id, active: true, includeExisting: !!act.include });
        fl.activating = null;
        await motor.loadAutomations();
        flash(act.include ? 'Automação ligada (incluindo quem já estava na etiqueta).' : 'Automação ligada: vale para quem entrar daqui pra frente.');
      } catch (e) { act.err = e.message; }
      renderFollows();
      renderFootPause();
    }, () => { fl.activating = null; renderFollows(); }));
    return card;
  }

  // ── 2.8.8: ativar = vale daqui pra frente ──
  const LABEL_TRIGGERS = ['sem_resposta', 'entrou_etiqueta', 'respondeu'];
  function testChatLabel(chatId) {
    const c = (fl.recentChats || []).find((x) => x.id === chatId);
    return c && c.name ? `${c.name} (${chatId.split('@')[0]})` : chatId.split('@')[0];
  }
  // quem já está na etiqueta do gatilho (CRM pelo banco; WhatsApp pela lista do WhatsApp Web)
  async function loadActivationInfo(a) {
    const act = fl.activating || (fl.edit && fl.edit.activation);
    if (!act || !LABEL_TRIGGERS.includes(a.trigger_type)) return;
    let list = null;
    try {
      if (a.trigger_label_source === 'whatsapp' && a.trigger_wa_label_id) {
        const r = await waRequest('labelChatIds', { labelId: String(a.trigger_wa_label_id) }, { timeout: 8000 });
        list = (r && r.chats ? r.chats : []).map((c) => ({ name: c.name || null, phone: c.phone || (/@c\.us$/.test(c.id) ? c.id.split('@')[0] : null) }));
      } else if (a.trigger_label_id && !String(a.trigger_label_id).startsWith(NEW_LABEL)) {
        list = await call('automationExisting', { labelId: a.trigger_label_id });
      } else list = [];
    } catch (e) { act.infoErr = e.message; list = null; }
    act.info = list;
    renderFollows();
  }
  // etiqueta do WhatsApp: registra agora quem já está nela (assim, ao ligar, conta como "já estava")
  async function baselineWaLabel(a) {
    if (a.trigger_label_source !== 'whatsapp' || !a.trigger_wa_label_id || !LABEL_TRIGGERS.includes(a.trigger_type)) return;
    const labelId = String(a.trigger_wa_label_id);
    const r = await waRequest('labelChatIds', { labelId }, { timeout: 8000 });
    const chats = (r && r.chats) || [];
    await call('nativeLabelSweep', { labelId, chats: chats.slice(0, 5000), complete: chats.length >= (Number(r && r.count) || 0) });
  }
  function activationEl(a, act, onConfirm, onCancel) {
    const box = el('div', 'fw-block act-box');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Ligar a automação');
    if (a.trigger_type === 'dia_hora') box.append(el('div', 'crm-intro', 'Vale a partir do próximo dia e hora depois de ligar.'));
    else if (a.trigger_type === 'venda_registrada') box.append(el('div', 'crm-intro', 'Só vendas registradas depois de ligar disparam (as antigas não).'));
    else if (act.info == null) box.append(el('div', 'lt-none loading', act.infoErr ? `Não consegui ver quem já está na etiqueta: ${act.infoErr}` : 'Carregando…'));
    else {
      const n = act.info.length;
      box.append(el('div', 'act-count', `${n} contato${n === 1 ? '' : 's'} já ${n === 1 ? 'está' : 'estão'} nessa etiqueta e NÃO ${n === 1 ? 'vai' : 'vão'} receber.`));
      if (n) {
        const lab = el('label', 'sc-radio');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!act.include;
        cb.setAttribute('aria-label', 'Incluir também quem já está na etiqueta');
        cb.addEventListener('change', () => { act.include = cb.checked; renderFollows(); });
        lab.append(cb, ' Incluir também quem já está na etiqueta');
        box.append(lab);
        if (act.include) {
          box.append(el('div', 'ed-note', `Confirme: estes ${n} vão receber${n > 50 ? ' (mostrando 50)' : ''}:`));
          const ul = el('ul', 'act-list');
          act.info.slice(0, 50).forEach((c) => ul.append(el('li', null, [c.name, c.phone].filter(Boolean).join(' · ') || 'sem nome')));
          box.append(ul);
        }
      }
    }
    const row = el('div', 'ed-add');
    const go = el('button', 'bbtn primary act-go', act.include && act.info && act.info.length ? `Confirmar e ligar (incluir ${act.info.length})` : 'Ligar daqui pra frente');
    go.type = 'button';
    go.disabled = LABEL_TRIGGERS.includes(a.trigger_type) && act.info == null && !act.infoErr;
    go.addEventListener('click', onConfirm);
    const no = el('button', 'bbtn', 'Cancelar');
    no.type = 'button';
    no.addEventListener('click', onCancel);
    row.append(go, no);
    box.append(row);
    if (act.err) box.append(el('div', 'ed-msg err', act.err));
    return box;
  }

  function renderFollows() {
    if (!ftabEl) return;
    ftabEl.textContent = '';
    ftabEl.append(el('div', 'crm-intro', 'Automações: QUANDO acontece algo com um contato de uma etiqueta (CRM ou do WhatsApp) ou com quem você adicionou pelo 🔁 → SE as condições batem → ENTÃO a extensão faz as ações, uma vez por entrada. Só no horário comercial, com o WhatsApp Web aberto e nunca para quem tem "Não enviar".'));
    if (motor.state.available === null) { ftabEl.append(el('div', 'lt-none loading', 'Carregando…')); return; }
    if (!automationsReady()) {
      ftabEl.append(el('div', 'ed-note', 'Atualize o banco para usar este recurso.'));
      if (motor.state.available === true) ftabEl.append(el('div', 'crm-intro', 'As réguas de follow da 2.0.0 continuam rodando até a atualização.'));
      return;
    }
    if (fl.view === 'templates') { renderTemplates(); return; }
    if (fl.view === 'edit') { renderAutomationEditor(); return; }
    if (fl.view === 'settings') { renderSettings(); return; }
    if (fl.view === 'simulate') { renderSimulation(); return; }
    if (fl.view === 'history') { renderHistory(); return; }
    if (fl.view === 'conversa') { renderChatAutomations(); return; }

    renderFollowsTop(ftabEl);
    if (fl.msg) ftabEl.append(el('div', `ed-msg${fl.msgErr ? ' err' : ''}`, fl.msg));
    const list = el('section', 'crmsec');
    list.append(el('div', 'wt-head', 'AUTOMAÇÕES'));
    const items = [...motor.state.automations].sort((a, b) => (a.position || 0) - (b.position || 0));
    if (!items.length) list.append(el('div', 'lt-none', fl.loading ? 'Carregando…' : 'Nenhuma automação ainda.'));
    items.forEach((a) => list.append(automationCard(a)));
    list.append(fbtn('fw-card fw-new', '+ Nova automação', () => { fl.view = 'templates'; renderFollows(); }));
    ftabEl.append(list);

    const tools = el('section', 'crmsec');
    tools.append(el('div', 'wt-head', 'FERRAMENTAS'));
    const r1 = el('div', 'ed-add');
    r1.append(fbtn('bbtn', 'Simular', () => openSimulation()), fbtn('bbtn', 'Testar com a conversa aberta', () => testOpenChat()), fbtn('bbtn', 'Histórico', () => openHistory()));
    tools.append(r1);
    if (fl.test) {
      const t = el('div', 'fw-test');
      fl.test.forEach((line) => t.append(el('div', null, line)));
      tools.append(t);
    }
    tools.append(el('div', 'crm-sub', 'Conversa aberta: em quais automações ela está, adicionar a partir de agora ou tirar'));
    tools.append(fbtn('bbtn primary', '🔁 Adicionar à automação', () => openChatAutomations()));
    ftabEl.append(tools);
  }

  // ── Modelos prontos (só preenchem o editor; nada é criado sem Salvar) ──

  const labelIdByName = (name) => { const l = state.labels.find((x) => x.name.toLowerCase() === String(name).toLowerCase()); return l ? l.id : null; };
  const labelRef = (name) => labelIdByName(name) || `${NEW_LABEL}${name}`;

  function renderTemplates() {
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'NOVA AUTOMAÇÃO'));
    sec.append(el('div', 'crm-intro', 'Escolha um modelo para preencher o editor (nada é criado antes de Salvar) ou comece em branco.'));
    E.AUTOMATION_TEMPLATES.forEach((t) => {
      const card = el('div', 'fw-card');
      card.append(el('div', 'fw-name', t.title));
      card.append(el('div', 'fw-txt', summaryOf(templateToAutomation(t)).text));
      if (t.help) card.append(el('div', 'crm-intro', t.help));
      card.append(fbtn('ed-mini', 'Usar este modelo', () => openAutomationEditor(templateToAutomation(t), { template: t })));
      sec.append(card);
    });
    sec.append(fbtn('bbtn', 'Em branco', () => openAutomationEditor(null)), fbtn('bbtn', 'Voltar', () => backToList()));
    ftabEl.append(sec);
  }

  function templateToAutomation(t) {
    return {
      id: null, name: t.name, active: false, trigger_type: t.trigger_type, trigger_label_id: labelRef(t.trigger_label),
      wait_minutes: t.wait_minutes, schedule_days: [1, 2, 3, 4, 5], schedule_time: '10:00', ignore_older_days: 15, conditions: [],
      actions: t.actions.map((x) => (x.type === 'enviar' ? { type: 'enviar', item_id: '', variants: [], hint: x.hint }
        : x.followsTrigger ? { type: x.type, label_id: labelRef(t.trigger_label), followsTrigger: true } : { type: x.type, label_id: labelRef(x.label) })),
      help: t.help || null,
    };
  }

  // ── Editor ──

  function openAutomationEditor(a, { template = null } = {}) {
    fl.view = 'edit';
    fl.confirmDelete = false;
    if (!Array.isArray(state.waLabels)) refreshBar().then(() => { if (fl.view === 'edit') renderFollows(); }).catch(() => {});
    const src = a || { id: null, name: '', active: false, trigger_type: 'sem_resposta', trigger_label_id: '', wait_minutes: 120, schedule_days: [1, 2, 3, 4, 5], schedule_time: '10:00', ignore_older_days: 15, conditions: [], actions: [{ type: 'enviar', item_id: '', variants: [] }] };
    const wait = Number(src.wait_minutes) || 60;
    const unit = wait % 1440 === 0 ? 'dias' : wait % 60 === 0 ? 'horas' : 'minutos';
    fl.edit = {
      wasActive: !!src.id && !!src.active, testOn: !!src.test_chat_id, test_chat_id: src.test_chat_id || '', activation: null, // 2.8.8
      id: src.id || null, name: src.name || '', active: !!src.active, trigger_type: src.trigger_type || 'sem_resposta', trigger_label_id: src.trigger_label_id || '',
      trigger_label_source: src.trigger_label_source === 'whatsapp' ? 'whatsapp' : 'crm', trigger_wa_label_id: src.trigger_wa_label_id || '',
      wait_minutes: wait, wait_unit: unit, schedule_days: [...(src.schedule_days || [1, 2, 3, 4, 5])], schedule_time: String(src.schedule_time || '10:00').slice(0, 5),
      ignore_older_days: src.ignore_older_days || 15,
      conditions: (src.conditions || []).map((c) => ({ ...c })),
      actions: (src.actions || []).map((x) => ({ ...x, variants: (x.variants || []).map((v) => ({ ...v })) })),
      template: template ? template.title : null, help: src.help || null, msg: '', err: false,
    };
    renderFollows();
  }

  // Select de etiqueta CRM que aceita "new:Nome" (etiqueta de modelo que ainda não existe)
  function labelPicker(value, onChange, { empty = 'Escolha a etiqueta CRM…', aria, rerender = () => renderFollows(), onError = null } = {}) {
    const wrap = el('div', 'sc-row');
    const sel = labelSelect(String(value || '').startsWith(NEW_LABEL) ? '' : value, { empty, aria });
    if (String(value || '').startsWith(NEW_LABEL)) {
      const o = el('option', null, `${value.slice(NEW_LABEL.length)} (ainda não existe)`);
      o.value = value;
      o.selected = true;
      sel.append(o);
    }
    sel.addEventListener('change', () => { onChange(sel.value); rerender(); });
    wrap.append(sel);
    if (String(value || '').startsWith(NEW_LABEL)) {
      const name = value.slice(NEW_LABEL.length);
      wrap.append(fbtn('ed-mini', 'Criar agora', async () => {
        try {
          const created = await call('createLabel', { name, color: '#3b82f6' });
          await syncLabels().catch(() => {});
          onChange(created.id);
        } catch (e) {
          const existing = labelIdByName(name);
          if (existing) onChange(existing);
          else if (onError) onError(`Não consegui criar a etiqueta: ${e.message}`);
          else { fl.edit.msg = `Não consegui criar a etiqueta: ${e.message}`; fl.edit.err = true; }
        }
        rerender();
      }));
    }
    return wrap;
  }

  function editorToAutomation(f) {
    return {
      test_chat_id: f.testOn ? f.test_chat_id || null : null, // 2.8.8
      name: f.name, active: f.active, trigger_type: f.trigger_type, trigger_label_id: f.trigger_label_source === 'whatsapp' ? null : f.trigger_label_id || null,
      trigger_label_source: f.trigger_label_source, trigger_wa_label_id: f.trigger_label_source === 'whatsapp' ? f.trigger_wa_label_id || null : null,
      wait_minutes: f.wait_minutes,
      schedule_days: f.schedule_days, schedule_time: f.schedule_time, ignore_older_days: f.ignore_older_days,
      conditions: f.conditions.map((c) => ({ ...c })),
      actions: f.actions.map((x) => (x.type === 'enviar' ? { type: 'enviar', item_id: x.item_id || null, variants: x.variants.map((v) => ({ ...v })) }
        : E.WA_LABEL_ACTIONS.includes(x.type) ? { type: x.type, wa_label_id: x.wa_label_id || null } : { type: x.type, label_id: x.label_id || null })),
    };
  }

  // 2.5.0: etiqueta do gatilho em duas famílias: "CRM: …" e "WhatsApp: …"
  function setTrigger(f, v) {
    if (v.startsWith('wa:')) {
      f.trigger_label_source = 'whatsapp';
      f.trigger_wa_label_id = v.slice(3);
      f.trigger_label_id = '';
    } else {
      f.trigger_label_source = 'crm';
      f.trigger_wa_label_id = '';
      f.trigger_label_id = v;
    }
    // "remover a etiqueta do gatilho" (modelo) acompanha a família escolhida
    f.actions.forEach((x) => {
      if (!x.followsTrigger || !['remover_etiqueta', 'remover_etiqueta_wa'].includes(x.type)) return;
      if (f.trigger_label_source === 'whatsapp') { x.type = 'remover_etiqueta_wa'; x.wa_label_id = f.trigger_wa_label_id; x.label_id = ''; }
      else { x.type = 'remover_etiqueta'; x.label_id = f.trigger_label_id; x.wa_label_id = ''; }
    });
  }

  function triggerPicker(f) {
    const wrap = el('div', 'sc-row');
    const sel = el('select', 'ed-cat');
    sel.setAttribute('aria-label', 'Etiqueta do gatilho');
    const pending = String(f.trigger_label_id || '').startsWith(NEW_LABEL);
    const cur = f.trigger_label_source === 'whatsapp' ? `wa:${f.trigger_wa_label_id || ''}` : pending ? f.trigger_label_id : f.trigger_label_id || ''; // CRM: id puro; WhatsApp: 'wa:<id>'
    const opt = (parent, value, text, disabled = false) => {
      const o = el('option', null, text);
      o.value = value;
      o.selected = value === cur;
      o.disabled = disabled;
      parent.append(o);
    };
    opt(sel, '', 'Escolha a etiqueta…');
    const crm = el('optgroup');
    crm.label = 'Etiquetas CRM';
    state.labels.forEach((l) => opt(crm, l.id, `CRM: ${l.name}`));
    if (pending) opt(crm, f.trigger_label_id, `CRM: ${f.trigger_label_id.slice(NEW_LABEL.length)} (ainda não existe)`);
    else if (f.trigger_label_source !== 'whatsapp' && f.trigger_label_id && !state.labels.some((l) => l.id === f.trigger_label_id)) opt(crm, cur, 'CRM: etiqueta excluída');
    const wa = el('optgroup');
    const v25 = motor.state.automationsV25 === true;
    wa.label = v25 ? 'Etiquetas do WhatsApp' : 'Etiquetas do WhatsApp (atualize o banco)';
    const waList = Array.isArray(state.waLabels) ? state.waLabels : [];
    waList.forEach((l) => opt(wa, `wa:${l.id}`, `WhatsApp: ${l.name}`, !v25));
    if (f.trigger_label_source === 'whatsapp' && f.trigger_wa_label_id && !waList.some((l) => l.id === f.trigger_wa_label_id)) opt(wa, cur, `WhatsApp: etiqueta ${f.trigger_wa_label_id} (não encontrada)`);
    if (!waList.length) opt(wa, 'wa:', Array.isArray(state.waLabels) ? 'WhatsApp: nenhuma etiqueta nesta conta' : 'WhatsApp: carregando…', true);
    sel.append(crm, wa);
    sel.addEventListener('change', () => { setTrigger(f, sel.value); renderFollows(); });
    wrap.append(sel);
    if (pending) {
      const name = f.trigger_label_id.slice(NEW_LABEL.length);
      wrap.append(fbtn('ed-mini', 'Criar agora', async () => {
        try {
          const created = await call('createLabel', { name, color: '#3b82f6' });
          await syncLabels().catch(() => {});
          setTrigger(f, created.id);
        } catch (e) {
          const existing = labelIdByName(name);
          if (existing) setTrigger(f, existing);
          else { f.msg = `Não consegui criar a etiqueta: ${e.message}`; f.err = true; }
        }
        renderFollows();
      }));
    }
    return wrap;
  }

  // Etiqueta do WhatsApp das ações "adicionar/remover etiqueta do WhatsApp" (só as que existem)
  function waLabelSelect(value, aria, empty = 'Escolha a etiqueta do WhatsApp…') {
    const sel = el('select', 'ed-cat');
    sel.setAttribute('aria-label', aria);
    const none = el('option', null, Array.isArray(state.waLabels) ? empty : 'Carregando as etiquetas do WhatsApp…');
    none.value = '';
    sel.append(none);
    (state.waLabels || []).forEach((l) => {
      const o = el('option', null, l.name);
      o.value = l.id;
      o.selected = l.id === value;
      sel.append(o);
    });
    if (value && !(state.waLabels || []).some((l) => l.id === value)) {
      const o = el('option', null, `etiqueta ${value} (não encontrada)`);
      o.value = value;
      o.selected = true;
      sel.append(o);
    }
    return sel;
  }

  function renderAutomationEditor() {
    const f = fl.edit;
    const sec = el('section', 'crmsec fw-editor');
    sec.append(el('div', 'wt-head', f.id ? 'EDITAR AUTOMAÇÃO' : `NOVA AUTOMAÇÃO${f.template ? ` · MODELO: ${f.template.toUpperCase()}` : ''}`));
    if (f.help) sec.append(el('div', 'crm-intro', f.help));
    const summaryBox = el('div', 'fw-test fw-summary');
    const updateSummary = () => {
      const s = summaryOf(editorToAutomation(f));
      summaryBox.textContent = '';
      [s.quando, s.se, s.entao].forEach((t) => summaryBox.append(el('div', null, t)));
    };
    const name = el('input', 'ed-title');
    name.maxLength = 60;
    name.value = f.name;
    name.placeholder = 'Ex.: Follow de venda';
    name.addEventListener('input', () => { f.name = name.value; });
    sec.append(schedField('Nome', name));
    const act = el('label', 'sc-radio');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = f.active;
    cb.addEventListener('change', () => { f.active = cb.checked; if (f.active && !f.wasActive) { f.activation = { include: false, info: null }; loadActivationInfo(editorToAutomation(f)); } renderFollows(); });
    act.append(cb, 'Ativa');
    sec.append(act);

    // QUANDO
    const q = el('div', 'fw-block');
    q.append(el('div', 'fw-k', 'QUANDO'));
    const trig = el('select', 'ed-cat');
    trig.setAttribute('aria-label', 'Gatilho');
    E.TRIGGER_TYPES.forEach((t) => {
      const off = t === 'venda_registrada' && motor.state.salesOrigin !== true;
      const o = el('option', null, off ? `${TRIGGER_LABEL[t]} (atualize o banco)` : TRIGGER_LABEL[t]);
      o.value = t;
      o.disabled = off && f.trigger_type !== t;
      o.selected = f.trigger_type === t;
      trig.append(o);
    });
    E.FUTURE_TRIGGERS.forEach((t) => { const o = el('option', null, `${t.label} (${t.note})`); o.value = t.type; o.disabled = true; trig.append(o); });
    trig.addEventListener('change', () => {
      f.trigger_type = trig.value;
      if (f.trigger_type === 'venda_registrada' && f.trigger_label_source === 'whatsapp') setTrigger(f, '');
      renderFollows();
    });
    q.append(trig);
    // Ações "remover a etiqueta do gatilho" (do modelo) acompanham a etiqueta escolhida aqui
    const saleTrig = f.trigger_type === 'venda_registrada';
    if (saleTrig) q.append(schedField('Só para quem está na etiqueta CRM (opcional)', labelPicker(f.trigger_label_id, (v) => { f.trigger_label_id = v; f.actions.forEach((x) => { if (x.followsTrigger) x.label_id = v; }); }, { aria: 'Etiqueta do gatilho', empty: '(qualquer contato)' })));
    else {
      q.append(schedField('Etiqueta do gatilho (CRM ou WhatsApp)', triggerPicker(f)));
      if (f.trigger_label_source === 'whatsapp') q.append(el('div', 'crm-intro', 'Etiqueta do WhatsApp: a entrada conta a partir da primeira vez que a extensão viu a conversa nela (o WhatsApp não guarda essa data). Tirou e colocou de novo: conta como nova entrada.'));
    }
    if (saleTrig) q.append(el('div', 'crm-intro', 'Roda uma vez para cada venda registrada pela conversa (botão 💰 Venda).'));
    if (f.trigger_type === 'sem_resposta') {
      const hours = numberInput(Math.floor(f.wait_minutes / 60), 0, 8760, 'Horas');
      const mins = numberInput(f.wait_minutes % 60, 0, 59, 'Minutos');
      const upd = () => { f.wait_minutes = (Math.max(0, Math.floor(Number(hours.value) || 0)) * 60) + Math.max(0, Math.min(59, Math.floor(Number(mins.value) || 0))); updateSummary(); };
      hours.addEventListener('input', upd);
      mins.addEventListener('input', upd);
      const r = el('div', 'sc-row');
      r.append(schedField('Sem responder: horas úteis', hours), schedField('minutos', mins));
      q.append(r, el('div', 'crm-intro', `Conta só ${E.scheduleText(motor.state.settings)} (mude em "Limites e horário").`));
      const older = numberInput(f.ignore_older_days, 1, 365, 'Ignorar conversas paradas há (dias)');
      older.addEventListener('input', () => { f.ignore_older_days = Math.floor(Number(older.value) || 0); });
      q.append(schedField('Ignorar conversas paradas há mais de (dias)', older));
    } else if (f.trigger_type === 'entrou_etiqueta') {
      const mult = { minutos: 1, horas: 60, dias: 1440 }[f.wait_unit] || 1;
      if (f.wait_amount == null) f.wait_amount = Math.max(1, Math.round(f.wait_minutes / mult));
      const amount = numberInput(f.wait_amount, 1, 525600, 'Quanto tempo');
      amount.addEventListener('input', () => { f.wait_amount = Math.floor(Number(amount.value) || 0); f.wait_minutes = f.wait_amount * ({ minutos: 1, horas: 60, dias: 1440 }[f.wait_unit] || 1); updateSummary(); });
      const unit = el('select', 'ed-cat');
      unit.setAttribute('aria-label', 'Unidade');
      ['minutos', 'horas', 'dias'].forEach((u) => { const o = el('option', null, u); o.value = u; o.selected = f.wait_unit === u; unit.append(o); });
      unit.addEventListener('change', () => { f.wait_unit = unit.value; f.wait_minutes = f.wait_amount * ({ minutos: 1, horas: 60, dias: 1440 }[f.wait_unit] || 1); renderFollows(); });
      const r = el('div', 'sc-row');
      r.append(schedField('Depois de', amount), schedField('unidade', unit));
      q.append(r, el('div', 'crm-intro', 'Tempo corrido desde que o contato entrou na etiqueta (mesmo que tenha conversado no meio).'));
    } else if (f.trigger_type === 'dia_hora') {
      const days = el('div', 'ed-add');
      E.DAY_NAMES.forEach((dn, d) => {
        const l = el('label', 'sc-radio');
        const c = el('input');
        c.type = 'checkbox';
        c.checked = f.schedule_days.includes(d);
        c.addEventListener('change', () => { f.schedule_days = c.checked ? [...new Set([...f.schedule_days, d])].sort() : f.schedule_days.filter((x) => x !== d); updateSummary(); });
        l.append(c, dn);
        days.append(l);
      });
      const time = el('input', 'ed-title');
      time.type = 'time';
      time.value = f.schedule_time;
      time.setAttribute('aria-label', 'Hora');
      time.addEventListener('input', () => { f.schedule_time = time.value; updateSummary(); });
      q.append(el('div', 'crm-sub', 'Dias'), days, schedField('Hora', time), el('div', 'crm-intro', 'Cada contato da etiqueta, uma vez por dia.'));
    }
    sec.append(q);

    // SE
    const se = el('div', 'fw-block');
    se.append(el('div', 'fw-k', 'SE (todas precisam bater)'));
    if (!f.conditions.length) se.append(el('div', 'lt-none', 'Sem condições.'));
    f.conditions.forEach((c, i) => {
      const row = el('div', 'fw-variant');
      row.append(el('div', 'crm-sub', COND_LABEL[c.type]));
      if (c.type === 'tem_etiqueta' || c.type === 'nao_tem_etiqueta') row.append(labelPicker(c.label_id, (v) => { c.label_id = v; }, { aria: `Etiqueta da condição ${i + 1}` }));
      else if (c.type === 'anuncio') {
        const kw = el('input', 'ed-title');
        kw.maxLength = 60;
        kw.value = c.keyword || '';
        kw.placeholder = 'palavra do anúncio';
        kw.setAttribute('aria-label', `Palavra da condição ${i + 1}`);
        kw.addEventListener('input', () => { c.keyword = kw.value; updateSummary(); });
        row.append(kw);
      } else {
        const d = numberInput(c.days || 30, 1, 365, `Dias da condição ${i + 1}`);
        d.addEventListener('input', () => { c.days = Math.floor(Number(d.value) || 0); updateSummary(); });
        row.append(d);
      }
      const rm = fbtn('ed-mini', '✕', () => { f.conditions.splice(i, 1); renderFollows(); });
      rm.setAttribute('aria-label', 'Remover condição');
      row.append(rm);
      se.append(row);
    });
    const addC = el('div', 'ed-add');
    [['tem_etiqueta', '+ tem etiqueta'], ['nao_tem_etiqueta', '+ não tem etiqueta'], ['anuncio', '+ veio do anúncio'], ['parada_max_dias', '+ conversa parada há no máx.']].forEach(([t, label]) => {
      const b = fbtn('ed-mini', label, () => { f.conditions.push(t === 'parada_max_dias' ? { type: t, days: 30 } : t === 'anuncio' ? { type: t, keyword: '' } : { type: t, label_id: '' }); renderFollows(); });
      b.disabled = f.conditions.length >= 10;
      addC.append(b);
    });
    se.append(addC);
    sec.append(se);

    // ENTÃO
    const en = el('div', 'fw-block');
    en.append(el('div', 'fw-k', 'ENTÃO (em ordem; se o envio falhar, as próximas não rodam)'));
    f.actions.forEach((x, i) => {
      const row = el('div', 'fw-variant');
      const type = el('select', 'ed-cat');
      type.setAttribute('aria-label', `Ação ${i + 1}`);
      Object.entries(ACTION_LABEL).forEach(([k, t]) => { const o = el('option', null, `${i + 1}. ${t}`); o.value = k; o.selected = x.type === k; type.append(o); });
      Object.keys(ACTION_LABEL).forEach((k, j) => { if (E.WA_LABEL_ACTIONS.includes(k) && motor.state.automationsV25 !== true) type.options[j].disabled = x.type !== k; });
      type.addEventListener('change', () => {
        f.actions[i] = type.value === 'enviar' ? { type: 'enviar', item_id: '', variants: [] } : E.WA_LABEL_ACTIONS.includes(type.value) ? { type: type.value, wa_label_id: '' } : { type: type.value, label_id: '' };
        renderFollows();
      });
      row.append(type);
      if (x.type === 'enviar') {
        const it = itemSelect(x.item_id, { empty: x.variants.length ? '(nenhuma se nenhuma variante bater)' : 'Escolha a mensagem salva…', aria: `Mensagem da ação ${i + 1}` });
        it.addEventListener('change', () => { x.item_id = it.value; updateSummary(); });
        row.append(it);
        if (x.hint && !x.item_id) row.append(el('div', 'ed-note', `Escolha ${x.hint}.`));
        x.variants.forEach((v, j) => {
          const vr = el('div', 'sc-row');
          const cond = el('select', 'ed-cat');
          cond.setAttribute('aria-label', `Variante ${j + 1}`);
          [['etiqueta', 'se tem a etiqueta'], ['anuncio', 'se veio do anúncio com']].forEach(([k, t]) => { const o = el('option', null, t); o.value = k; o.selected = v.when === k; cond.append(o); });
          cond.addEventListener('change', () => { x.variants[j] = cond.value === 'etiqueta' ? { when: 'etiqueta', label_id: '', item_id: v.item_id } : { when: 'anuncio', keyword: '', item_id: v.item_id }; renderFollows(); });
          vr.append(cond);
          if (v.when === 'etiqueta') vr.append(labelPicker(v.label_id, (val) => { v.label_id = val; }, { empty: 'Escolha…', aria: `Etiqueta da variante ${j + 1}` }));
          else {
            const kw = el('input', 'ed-title');
            kw.maxLength = 60;
            kw.value = v.keyword || '';
            kw.placeholder = 'palavra do anúncio';
            kw.addEventListener('input', () => { v.keyword = kw.value; updateSummary(); });
            vr.append(kw);
          }
          const vi = itemSelect(v.item_id, { aria: `Mensagem da variante ${j + 1}` });
          vi.addEventListener('change', () => { v.item_id = vi.value; updateSummary(); });
          vr.append(el('span', null, 'manda'), vi, fbtn('ed-mini', '✕', () => { x.variants.splice(j, 1); renderFollows(); }));
          row.append(vr);
        });
        const addV = fbtn('ed-mini', '+ Variante "se tem etiqueta X, manda Y"', () => { x.variants.push({ when: 'etiqueta', label_id: '', item_id: '' }); renderFollows(); });
        addV.disabled = x.variants.length >= 10;
        row.append(addV);
      } else if (E.WA_LABEL_ACTIONS.includes(x.type)) {
        const ws = waLabelSelect(x.wa_label_id, `Etiqueta do WhatsApp da ação ${i + 1}`);
        ws.addEventListener('change', () => { x.wa_label_id = ws.value; x.followsTrigger = false; updateSummary(); });
        row.append(ws);
        if (x.followsTrigger) row.append(el('div', 'crm-intro', 'Acompanha a etiqueta do gatilho.'));
      } else if (x.type !== 'parar') {
        row.append(labelPicker(x.label_id, (v) => { x.label_id = v; x.followsTrigger = false; }, { aria: `Etiqueta da ação ${i + 1}` }));
        if (x.followsTrigger) row.append(el('div', 'crm-intro', 'Acompanha a etiqueta do gatilho.'));
      }
      const ctl = el('div', 'ed-add');
      const up = fbtn('ed-mini', '↑', () => { f.actions.splice(i - 1, 0, f.actions.splice(i, 1)[0]); renderFollows(); });
      up.disabled = i === 0;
      up.setAttribute('aria-label', 'Subir');
      const down = fbtn('ed-mini', '↓', () => { f.actions.splice(i + 1, 0, f.actions.splice(i, 1)[0]); renderFollows(); });
      down.disabled = i === f.actions.length - 1;
      down.setAttribute('aria-label', 'Descer');
      const rm = fbtn('ed-mini', '✕', () => { f.actions.splice(i, 1); renderFollows(); });
      rm.setAttribute('aria-label', 'Remover ação');
      ctl.append(up, down, rm);
      row.append(ctl);
      en.append(row);
    });
    const addA = fbtn('ed-mini', '+ Ação', () => { f.actions.push({ type: 'adicionar_etiqueta', label_id: '' }); renderFollows(); });
    addA.disabled = f.actions.length >= 10;
    en.append(addA);
    sec.append(en);

    sec.append(el('div', 'crm-sub', 'Resumo'), summaryBox);
    updateSummary();
    sec.append(automationSafetyEl(f)); // 2.8.8
    const actions = el('div', 'ed-add');
    const save = fbtn('bbtn primary', fl.saving ? 'Salvando…' : 'Salvar', () => saveAutomationForm());
    save.disabled = fl.saving;
    actions.append(save, fbtn('bbtn', 'Cancelar', () => backToList()));
    sec.append(actions, el('div', `ed-msg${f.err ? ' err' : ''}`, f.msg));
    ftabEl.append(sec);
  }

  async function saveAutomationForm() {
    const f = fl.edit;
    if (!f || fl.saving) return;
    const automation = editorToAutomation(f);
    if (f.testOn && !f.test_chat_id) { f.msg = 'Escolha a conversa de teste.'; f.err = true; renderFollows(); return; }
    const pending = JSON.stringify(automation).match(/"new:([^"]+)"/);
    if (pending) { f.msg = `A etiqueta "${pending[1]}" ainda não existe: clique em "Criar agora".`; f.err = true; renderFollows(); return; }
    fl.saving = true;
    f.msg = '';
    renderFollows();
    try {
      // 2.8.8: ligar (ou trocar gatilho/etiqueta de uma ligada) = vale daqui pra frente
      if (automation.active) await baselineWaLabel(automation).catch(() => {});
      await call('saveAutomation', { id: f.id || undefined, automation, includeExisting: !!(f.activation && f.activation.include) });
      await motor.loadAutomations();
      flash('Automação salva.');
      fl.saving = false;
      backToList();
      renderFootPause();
      return;
    } catch (e) {
      f.msg = e.message;
      f.err = true;
    }
    fl.saving = false;
    renderFollows();
  }

  // 2.8.8: bloco do editor: aviso ao ligar + modo teste (só uma conversa)
  function automationSafetyEl(f) {
    const box = el('div', 'fw-block');
    box.append(el('div', 'fw-k', 'SEGURANÇA'));
    box.append(el('div', 'crm-intro', 'Só vale daqui pra frente: quem já estava na etiqueta antes de ligar (ou de trocar o gatilho/etiqueta) não recebe. "Dia e hora" e "venda registrada" também só valem depois de ligar.'));
    if (f.active && !f.wasActive && f.activation) {
      box.append(activationEl(editorToAutomation(f), f.activation, () => saveAutomationForm(), () => { f.active = false; f.activation = null; renderFollows(); }));
    }
    const lab = el('label', 'sc-radio');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !!f.testOn;
    cb.setAttribute('aria-label', 'Testar só com uma conversa');
    cb.addEventListener('change', async () => {
      f.testOn = cb.checked;
      if (f.testOn && !fl.recentChats) { try { fl.recentChats = await waRequest('recentChats', { limit: 30 }, { timeout: 6000 }); } catch { fl.recentChats = []; } }
      renderFollows();
    });
    lab.append(cb, ' Testar só com uma conversa');
    box.append(lab);
    if (f.testOn) {
      const opts = [['', 'Escolha a conversa…'], ...(fl.recentChats || []).map((c) => [c.id, `${c.name || c.id.split('@')[0]}`])];
      if (f.test_chat_id && !opts.some(([v]) => v === f.test_chat_id)) opts.push([f.test_chat_id, f.test_chat_id.split('@')[0]]);
      const sel = el('select', 'ed-cat');
      sel.setAttribute('aria-label', 'Conversa de teste');
      opts.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = v === (f.test_chat_id || ''); sel.append(o); });
      sel.addEventListener('change', () => { f.test_chat_id = sel.value; });
      const here = fbtn('ed-mini', 'Usar a conversa aberta', async () => {
        let c = null;
        try { c = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { c = null; }
        if (!c || c.kind !== 'individual') { flash('Abra uma conversa individual.', true); return; }
        if (!(fl.recentChats || []).some((x) => x.id === c.chatId)) fl.recentChats = [{ id: c.chatId, name: c.name || null }, ...(fl.recentChats || [])];
        f.test_chat_id = c.chatId;
        renderFollows();
      });
      const row = el('div', 'sc-row');
      row.append(sel, here);
      box.append(row, el('div', 'ed-note', 'Em teste, roda só para esta conversa e ignora todos os outros ("EM TESTE" na lista).'));
    }
    return box;
  }

  // ── Limites e horário ──

  function openSettings() {
    const s = motor.state.settings || E.DEFAULT_SETTINGS;
    fl.settingsForm = {
      max_per_hour: s.max_per_hour, max_per_day: s.max_per_day, min_interval_s: s.min_interval_s, max_interval_s: s.max_interval_s,
      business_start: String(s.business_start).slice(0, 5), business_end: String(s.business_end).slice(0, 5),
      business_days: [...(s.business_days || [])], msg: '', err: false,
    };
    fl.view = 'settings';
    renderFollows();
  }

  function renderSettings() {
    const f = fl.settingsForm;
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'LIMITES E HORÁRIO'));
    sec.append(el('div', 'crm-intro', 'Valem para tudo que sai sozinho: follows, disparos e agendados, somados.'));
    const num = (key, label, min, max) => {
      const i = numberInput(f[key], min, max, label);
      i.addEventListener('input', () => { f[key] = Math.floor(Number(i.value) || 0); });
      return schedField(label, i);
    };
    const r1 = el('div', 'sc-row');
    r1.append(num('max_per_hour', 'Máx. por hora', 1, 200), num('max_per_day', 'Máx. por dia', 1, 2000));
    const r2 = el('div', 'sc-row');
    r2.append(num('min_interval_s', 'Intervalo mín. (s)', 10, 3600), num('max_interval_s', 'Intervalo máx. (s)', 10, 3600));
    const time = (key, label) => {
      const i = el('input', 'ed-title');
      i.type = 'time';
      i.value = f[key];
      i.setAttribute('aria-label', label);
      i.addEventListener('input', () => { f[key] = i.value; });
      return schedField(label, i);
    };
    const r3 = el('div', 'sc-row');
    r3.append(time('business_start', 'Início do expediente'), time('business_end', 'Fim do expediente'));
    const days = el('div', 'ed-add');
    E.DAY_NAMES.forEach((name, d) => {
      const l = el('label', 'sc-radio');
      const c = el('input');
      c.type = 'checkbox';
      c.checked = f.business_days.includes(d);
      c.addEventListener('change', () => {
        f.business_days = c.checked ? [...new Set([...f.business_days, d])] : f.business_days.filter((x) => x !== d);
      });
      l.append(c, name);
      days.append(l);
    });
    sec.append(r1, r2, r3, el('div', 'crm-sub', 'Dias'), days);
    const actions = el('div', 'ed-add');
    actions.append(fbtn('bbtn primary', 'Salvar', async () => {
      const patch = { ...f };
      delete patch.msg;
      delete patch.err;
      try {
        await motor.saveSettings(patch);
        flash('Limites e horário salvos.');
        backToList();
      } catch (e) {
        f.msg = e.message;
        f.err = true;
        renderFollows();
      }
    }), fbtn('bbtn', 'Cancelar', () => backToList()));
    sec.append(actions, el('div', `ed-msg${f.err ? ' err' : ''}`, f.msg));
    ftabEl.append(sec);
  }

  // ── Simular (não envia nem grava nada) ──

  function planText(plan) {
    return plan.map((p) => {
      if (p.type === 'enviar') return `envia "${itemTitle(p.itemId)}"${p.pick && p.pick.kind === 'etiqueta' ? ` (variante: etiqueta ${labelName(p.pick.variant.label_id)})` : p.pick && p.pick.kind === 'anuncio' ? ` (variante: anúncio "${p.pick.variant.keyword}")` : ''}`;
      if (p.type === 'adicionar_etiqueta') return `adiciona ${labelName(p.label_id)}`;
      if (p.type === 'adicionar_etiqueta_wa') return `adiciona ${waLabelName(p.wa_label_id)} (WhatsApp)`;
      if (p.type === 'remover_etiqueta_wa') return `tira ${waLabelName(p.wa_label_id)} (WhatsApp)`;
      if (p.type === 'remover_etiqueta') return `tira ${labelName(p.label_id)}`;
      if (p.type === 'mover') return `move para ${labelName(p.label_id)}`;
      return p.type;
    }).join(', depois ');
  }

  function evText(ev) {
    if (ev.action === 'run') return { kind: 'ok', text: `rodaria agora: ${planText(ev.plan)}` };
    if (ev.action === 'wait') return { kind: 'wait', text: ev.leftMs == null ? 'aguardando (sem horário configurado)' : `aguardando: falta ${E.formatLeft(ev.leftMs)}` };
    if (ev.action === 'done') return { kind: 'wait', text: ev.entry && ev.entry.via === 'inscricao' ? 'já rodou para esta inscrição' : 'já rodou para esta entrada na etiqueta' };
    if (ev.action === 'none') return { kind: 'wait', text: ev.reason };
    if (ev.reason === 'condição não bateu' && ev.condition) {
      const c = ev.condition;
      const what = c.type === 'tem_etiqueta' ? `não tem ${labelName(c.label_id)}` : c.type === 'nao_tem_etiqueta' ? `tem ${labelName(c.label_id)}`
        : c.type === 'anuncio' ? `não veio do anúncio com "${c.keyword}"` : `conversa parada há mais de ${c.days} dias`;
      return { kind: 'skip', text: `pulado: ${what}` };
    }
    return { kind: 'skip', text: `pulado: ${ev.reason}` };
  }

  async function openSimulation() {
    fl.view = 'simulate';
    fl.sim = { loading: true, rows: [], total: 0 };
    renderFollows();
    let res;
    try { res = await motor.simulate(200); } catch (e) { res = { available: true, rows: [], error: e.message }; }
    fl.sim = { loading: false, rows: res.rows || [], total: res.total || 0, error: res.error || '' };
    if (fl.view === 'simulate') renderFollows();
  }

  function renderSimulation() {
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'SIMULAR'));
    sec.append(el('div', 'crm-intro', 'O que cada automação ativa faria agora. Nada foi enviado nem gravado.'));
    const s = fl.sim || { loading: true, rows: [] };
    if (s.loading) sec.append(el('div', 'lt-none', 'Calculando…'));
    else if (s.error) sec.append(el('div', 'ed-msg err', `Não consegui simular: ${s.error}`));
    else if (!s.rows.length) sec.append(el('div', 'lt-none', activeAutomations().length ? 'Ninguém nas etiquetas das automações ativas.' : 'Nenhuma automação ativa.'));
    s.rows.forEach((r) => {
      const t = evText(r.ev);
      const line = el('div', `sc-item fw-sim ${t.kind}`);
      const main = el('div', 'sc-main');
      main.append(el('div', 'sc-who', `${r.contact.name || r.contact.phone || 'Contato'} · ${(r.automation || r.flow).name}`), el('div', 'sc-prev', t.text));
      line.append(main);
      sec.append(line);
    });
    if (s.total > s.rows.length) sec.append(el('div', 'crm-intro', `Mostrando ${s.rows.length} de ${s.total}.`));
    sec.append(fbtn('bbtn', 'Voltar', () => backToList()));
    ftabEl.append(sec);
  }

  // ── Testar / colocar a conversa aberta ──

  async function openChatContact() {
    const ctx = getContext();
    state.ctx = ctx;
    let chat = null;
    try { chat = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { chat = null; }
    if (!chat || chat.kind !== 'individual' || !ctx.identity || !canLabel(ctx.identity)) return null;
    return { ctx, chatId: chat.chatId, identity: { ...identityPayload(ctx.identity), chatId: chat.chatId } };
  }

  async function testOpenChat() {
    fl.test = ['Testando…'];
    renderFollows();
    const open = await openChatContact();
    if (!open) { fl.test = ['Abra uma conversa individual no WhatsApp.']; renderFollows(); return; }
    let res = null;
    try { res = await chatAutomationRows(open, activeAutomations()); } catch { res = null; }
    const mine = res ? res.rows : [];
    if (!mine.length) { fl.test = ['Esta conversa não está em nenhuma automação ativa.']; renderFollows(); return; }
    fl.test = mine.map((r) => `${r.automation.name}: ${evText(r.ev).text}`);
    renderFollows();
  }

  // ── 2.5.0: "Adicionar à automação" (botão 🔁 e seção Automações) ──
  // A conversa entra a partir de AGORA (inscrição manual, sem marcar etiqueta). A tela mostra em quais
  // automações a conversa está (pela inscrição ou pela etiqueta CRM/do WhatsApp) e quanto falta.

  // Leitura (não grava nada): contato, etiquetas, inscrições, execuções e a última mensagem carregada
  async function chatAutomationRows(open, automations) {
    const st = await call('chatAutomationState', { identity: open.identity, chatId: open.chatId });
    const contact = st.contact || { id: null, name: null, phone: open.identity.phone || null, chat_id: open.chatId, labelIds: [], links: [], waSeen: st.waSeen || {}, enrolled: {}, enrollmentIds: {} };
    if (!contact.chat_id) contact.chat_id = open.chatId;
    const ranKeys = new Set(st.ranKeys || []);
    const mine = automations.filter((a) => a.trigger_type !== 'venda_registrada' && E.automationEntry(a, contact));
    let chat = null;
    if (mine.length) {
      const keywords = [...new Set(mine.flatMap(E.automationKeywords))].slice(0, 20);
      let info = null;
      try { info = await waRequest('chatsInfo', { chatIds: [open.chatId], keywords }, { timeout: 8000 }); } catch { info = null; }
      chat = info && info.chats ? info.chats[open.chatId] : null;
    }
    const rows = mine.map((automation) => ({
      automation,
      entry: E.automationEntry(automation, contact),
      labelEntry: E.automationEntry(automation, contact, { ignoreEnrollment: true }),
      ev: E.evaluateAutomation({ automation, contact: { ...contact, id: contact.id || '?' }, chat, settings: motor.state.settings, now: Date.now(), noSendLabelId: motor.state.noSendLabelId, ranKeys }),
    })).filter((r) => r.ev.reason !== 'tirado da automação');
    return { v25: st.v25 === true, contact: st.contact ? contact : null, rows };
  }

  async function openChatAutomations() {
    fl.view = 'conversa';
    fl.conv = { loading: true, open: null, rows: [], contact: null, v25: motor.state.automationsV25 === true, msg: '', err: false, pick: fl.conv ? fl.conv.pick : '', busy: false };
    renderFollows();
    await loadChatAutomations();
  }

  async function loadChatAutomations() {
    const c = fl.conv;
    if (!c) return;
    const open = await openChatContact();
    c.open = open;
    if (open) adoptChat({ kind: 'individual', chatId: open.chatId }, 'fl'); // 2.6.3
    if (open) {
      try {
        if (!motor.state.automations.length) await motor.loadAutomations();
        Object.assign(c, await chatAutomationRows(open, motor.state.automations));
      } catch (e) { c.msg = `Não consegui ler as automações: ${e.message}`; c.err = true; }
    }
    c.loading = false;
    if (fl.view === 'conversa') renderFollows();
  }

  function viaText(a, entry) {
    if (entry.via === 'inscricao') return 'adicionada por você (🔁)';
    if (entry.via === 'whatsapp') return `pela etiqueta do WhatsApp "${waLabelName(a.trigger_wa_label_id)}"`;
    return `pela etiqueta CRM "${labelName(a.trigger_label_id)}"`;
  }

  function renderChatAutomations() {
    const c = fl.conv || { loading: true };
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'ESTA CONVERSA NAS AUTOMAÇÕES'));
    if (c.loading) { sec.append(el('div', 'lt-none loading', 'Carregando…')); ftabEl.append(sec); return; }
    if (!c.open) {
      sec.append(el('div', 'lt-none', 'Abra uma conversa individual no WhatsApp.'), fbtn('bbtn', 'Voltar', () => backToList()));
      ftabEl.append(sec);
      return;
    }
    if (!c.v25) sec.append(el('div', 'ed-note', 'Atualize o banco para usar este recurso.'));
    sec.append(el('div', 'crm-sub', 'Esta conversa está em:'));
    if (!c.rows.length) sec.append(el('div', 'lt-none', 'Nenhuma automação.'));
    c.rows.forEach((r) => {
      const line = el('div', 'fw-card');
      line.append(el('div', 'fw-name', `${r.automation.name}${r.automation.active ? '' : ' (desligada: não roda)'}`));
      line.append(el('div', 'fw-txt', `${viaText(r.automation, r.entry)} · ${evText(r.ev).text}`));
      if (c.contact && c.v25) {
        const b = fbtn('ed-mini', 'Tirar desta automação', () => leaveChatAutomation(r));
        b.disabled = c.busy;
        line.append(b);
      }
      sec.append(line);
    });
    sec.append(el('div', 'crm-sub', 'Adicionar à automação'));
    sec.append(el('div', 'crm-intro', 'A conversa entra a partir de AGORA: o tempo da automação começa a contar neste momento, sem marcar etiqueta. Em "dia e hora fixos", entra na lista daquela automação.'));
    const row = el('div', 'sc-row');
    const sel = el('select', 'ed-cat');
    sel.setAttribute('aria-label', 'Automação');
    const none = el('option', null, 'Escolha a automação…');
    none.value = '';
    sel.append(none);
    [...motor.state.automations].filter((a) => a.trigger_type !== 'venda_registrada').sort((a, b) => (a.position || 0) - (b.position || 0)).forEach((a) => {
      const o = el('option', null, `${a.name}${a.active ? '' : ' (desligada)'}`);
      o.value = a.id;
      o.selected = a.id === c.pick;
      sel.append(o);
    });
    sel.addEventListener('change', () => { c.pick = sel.value; });
    const add = fbtn('bbtn primary', c.busy ? 'Adicionando…' : 'Adicionar', () => enrollOpenChat());
    add.disabled = c.busy || !c.v25;
    row.append(sel, add);
    sec.append(row);
    if (c.msg) sec.append(el('div', `ed-msg${c.err ? ' err' : ''}`, c.msg));
    sec.append(fbtn('bbtn', 'Voltar', () => { fl.conv = null; backToList(); }));
    ftabEl.append(sec);
  }

  async function enrollOpenChat() {
    const c = fl.conv;
    if (!c || c.busy) return;
    const a = motor.state.automations.find((x) => x.id === c.pick);
    if (!a) { c.msg = 'Escolha a automação.'; c.err = true; renderFollows(); return; }
    const open = await openChatContact();
    if (!open) { c.msg = 'Abra uma conversa individual no WhatsApp.'; c.err = true; renderFollows(); return; }
    c.busy = true;
    renderFollows();
    try {
      const r = await call('enrollContact', { automationId: a.id, identity: open.identity, chatId: open.chatId, name: state.ctx && !state.ctx.isNumber ? state.ctx.fullName : null });
      c.msg = r.already ? `Esta conversa já está em "${a.name}".` : `Conversa adicionada a "${a.name}" a partir de agora.${a.active ? '' : ' A automação está desligada: ligue para rodar.'}`;
      c.err = false;
    } catch (e) {
      c.msg = `Não consegui adicionar: ${e.message}`;
      c.err = true;
    }
    c.busy = false;
    await loadChatAutomations();
  }

  async function leaveChatAutomation(r) {
    const c = fl.conv;
    if (!c || c.busy || !c.contact) return;
    c.busy = true;
    renderFollows();
    try {
      await call('leaveAutomation', {
        automationId: r.automation.id, contactId: c.contact.id,
        enrollmentId: r.entry.via === 'inscricao' ? c.contact.enrollmentIds[r.automation.id] : undefined,
        entryKey: r.labelEntry ? r.labelEntry.key : undefined,
      });
      c.msg = `Conversa tirada de "${r.automation.name}".`;
      c.err = false;
    } catch (e) {
      c.msg = `Não consegui tirar: ${e.message}`;
      c.err = true;
    }
    c.busy = false;
    await loadChatAutomations();
  }

  // ── Histórico ──

  const SOURCE_LABEL = { follow: 'follow', disparo: 'disparo', agendado: 'agendado' };

  async function openHistory() {
    fl.view = 'history';
    fl.history = { loading: true, rows: [] };
    renderFollows();
    try {
      fl.history = { loading: false, rows: await call('fetchSendLog', { limit: 50 }) };
    } catch (e) {
      fl.history = { loading: false, rows: [], error: e.message };
    }
    if (fl.view === 'history') renderFollows();
  }

  function renderHistory() {
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'HISTÓRICO (ÚLTIMOS 50)'));
    const h = fl.history || { loading: true, rows: [] };
    if (h.loading) sec.append(el('div', 'lt-none loading', 'Carregando…'));
    else if (h.error) sec.append(el('div', 'ed-msg err', h.error));
    else if (!h.rows.length) sec.append(el('div', 'lt-none', 'Nenhum envio automático ainda.'));
    (h.rows || []).forEach((r) => {
      const line = el('div', `sc-item st-${r.status}`);
      const main = el('div', 'sc-main');
      main.append(el('div', 'sc-who', r.name || 'Contato'), el('div', 'sc-prev', `${SOURCE_LABEL[r.source] || r.source}${r.reason ? ` · ${r.reason}` : ''}`));
      const side = el('div', 'sc-side');
      side.append(el('span', 'sc-when', schedWhen(r.created_at)), el('span', 'sc-status', r.status));
      line.append(main, side);
      sec.append(line);
    });
    sec.append(fbtn('bbtn', 'Voltar', () => backToList()));
    ftabEl.append(sec);
  }

  // ── 💰 Vendas pela conversa (2.3.0) ──────────────────────────────────────
  // Formulário da venda da conversa aberta. Só grava ao clicar em "Registrar venda" (o background
  // recalcula tudo como o ERP). Nomes, telefones e endereços ficam só na tela e na venda do ERP.

  const TS = globalThis.TspSale;
  const vtabEl = shadow.querySelector('.vtab');
  const saleQuick = shadow.querySelector('.sale-quick');
  const ERP_STATUS = { em_separacao: 'Em separação', embalado: 'Embalado', em_rota: 'Em rota de entrega', finalizado: 'Finalizado', pago: 'Pago', embalar_amanha: 'Embalar amanhã', reembolsado: 'Reembolsado', concluido: 'Concluído' };
  const vs = { open: false, view: 'list', catalog: null, list: null, listError: '', form: null, msg: '', err: false, busy: false, done: null, courier: null };

  function syncVendasActive() {
    const want = state.open && state.section === 'vendas';
    vs.open = want;
    if (!want) return;
    loadSaleCatalog();
    if (vs.view === 'list') loadChatSales();
  }

  // 2.7.2: links que abrem o ERP direto na tela certa (?pagina=historico&venda=<id> / ?pagina=nova-venda&nome=&telefone=)
  function erpLink(params) {
    const base = vs.catalog && vs.catalog.erpUrl;
    if (!base) return null;
    try {
      const u = new URL(base);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      Object.entries(params).forEach(([k, v]) => { if (v) u.searchParams.set(k, String(v)); });
      return u.href;
    } catch { return null; }
  }
  function erpAnchor(text, href, cls, aria) {
    const a = el('a', cls, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (aria) a.setAttribute('aria-label', aria);
    return a;
  }
  // Nova venda no ERP com o nome e o telefone DESTA conversa (mesma trava do telefone da 2.6.3)
  async function openErpNewSale() {
    if (!erpLink({})) { toast('Endereço do ERP não configurado (ERP_URL).', 'warn', 5000); return; }
    let chat = null;
    try { chat = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { chat = null; }
    const chatId = chat && chat.kind === 'individual' ? chat.chatId : null;
    if (!chatId) { toast('Abra uma conversa individual no WhatsApp.', 'warn', 5000); return; }
    const pn = await chatPhoneName(chatId);
    const lock = await phoneLock(chatId, pn.phone, { allowEmpty: true });
    if (lock) { toast(lock, 'warn', 6000); return; }
    const url = erpLink({ pagina: 'nova-venda', nome: pn.name, telefone: pn.phone });
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function loadSaleCatalog() {
    try { vs.catalog = await call('erpCatalog'); } catch (e) { vs.catalog = { error: e.message }; }
    renderVendas();
  }

  async function loadChatSales() {
    try { vs.list = await call('fetchChatSales'); vs.listError = ''; } catch (e) { vs.list = []; vs.listError = e.message; }
    renderVendas();
  }

  if (saleQuick) saleQuick.addEventListener('click', () => { if (!state.open) setOpen(true); setSection('vendas'); openSaleForm(); });

  // Pode rodar antes da seção existir (updateContext): busca o botão direto no painel
  function renderSaleQuick() {
    const id = state.ctx && state.ctx.identity;
    const show = !!(id && (id.kind === 'tel' || id.kind === 'name'));
    shadow.querySelectorAll('.sale-quick').forEach((b) => { b.hidden = !show; });
  }

  const productLabel = (p) => `${p.model}${p.color ? ` · ${p.color}` : ''}`;

  async function openSaleForm() {
    vs.view = 'form';
    vs.msg = '';
    vs.err = false;
    vs.done = null;
    vs.courier = null;
    const ctx = getContext();
    state.ctx = ctx;
    let chat = null;
    try { chat = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { chat = null; }
    const chatId = chat && chat.kind === 'individual' ? chat.chatId : null;
    // 2.6.3: nada da tela (cabeçalho/CRM do contato da tela): só desta conversa (chatId da WA-JS)
    const phone = chatId && /^\d+@c\.us$/.test(chatId) ? chatId.split('@')[0] : '';
    // Etiquetas de gatilho das automações ativas (carrega se o motor ainda não leu)
    if (!motor.state.automations.length) await motor.loadAutomations();
    const autoLabels = activeAutomations().map((a) => a.trigger_label_id).filter(Boolean);
    vs.form = {
      chatId, customer_name: '', customer_phone: phone || '',
      items: [], search: '', accessories: [], payment_method: 'credit_card', card_brand: 'visa_mastercard', installments: 10, payment_status: 'a_cobrar',
      delivery_type: 'motoboy', motoboy_id: '', delivery_fee: TS.DEFAULT_DELIVERY_FEE, delivery_cost: 0,
      city: '', neighborhood: '', address_street: '', address_number: '', address_complement: '', reference: '', zip_code: '', schedule: '', notes: '',
      warranty_months: '', origin: 'organico', ad: null, map: null, addressHint: null,
      moveLabels: true, clientLabel: labelRef('Cliente'), removeLabels: state.convLabelIds.filter((l) => autoLabels.includes(l)),
      dupAsk: false,
    };
    const f = vs.form;
    adoptChat(chat, 'vs');
    if (!vs.catalog) await loadSaleCatalog();
    if (vs.form !== f) return; // trocou de conversa no meio: descarta
    renderVendas();
    if (chatId) {
      try {
        const info = await waRequest('chatSaleInfo', { chatId }, { timeout: 4000 });
        if (vs.form === f && info && info.ad) { f.ad = info.ad; f.origin = 'anuncio'; }
        if (vs.form === f && info) f.saleInfo = info;
      } catch { /* sem origem detectada */ }
      // 2.6.0/2.6.3: telefone verdadeiro desta conversa (@lid pelo WhatsApp) e o nome desta conversa
      const pn = await chatPhoneName(chatId);
      if (vs.form === f) {
        if (!f.customer_phone && pn.phone) f.customer_phone = pn.phone;
        if (!f.customer_name && pn.name) f.customer_name = pn.name;
        f.phoneChecked = true;
      }
      renderVendas();
    }
  }

  // 2.6.3: telefone e nome SÓ desta conversa (📈, 💰). Telefone: @c.us = os dígitos do id; @lid = o que o
  // WhatsApp diz para este @lid. Nunca o telefone do CRM (o chat_id salvo no CRM pode estar em outro contato).
  // Nome: o desta conversa (nome salvo/pushname); o do CRM só se o telefone do CRM for o desta conversa.
  const samePhone = (a, b) => { const n = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 10 || d.length === 11 ? `55${d}` : d; }; return !!n(a) && n(a) === n(b); };
  async function chatPhoneName(chatId) {
    let wa = null;
    let crm = null;
    try { wa = await waRequest('chatPhone', { chatId }, { timeout: 4000 }); } catch { wa = null; }
    const phone = String((wa && wa.phone) || '').replace(/\D/g, '');
    let name = (wa && wa.name) || '';
    if (!name && phone) {
      try { crm = await call('chatContactInfo', { chatId }); } catch { crm = null; }
      if (crm && crm.name && samePhone(crm.phone, phone)) name = crm.name;
    }
    return { phone, name };
  }

  // 2.6.3: trava antes de enviar/lançar: o telefone tem que ser desta conversa (e a conversa ainda a aberta)
  const PHONE_LOCK_MSG = 'O telefone não é desta conversa. Confira antes de enviar.';
  async function phoneLock(chatId, phone, { requireActive = true, allowEmpty = false } = {}) {
    if (!chatId) return 'Abra uma conversa individual no WhatsApp.';
    let r = null;
    try { r = await waRequest('verifyChatPhone', { chatId, phone: phone || '' }, { timeout: 5000 }); } catch { r = null; }
    if (!r) return 'Não consegui conferir o telefone desta conversa no WhatsApp. Tente de novo.';
    if (requireActive && !r.active) return 'A conversa mudou. Abra o formulário de novo na conversa certa.';
    if (!String(phone || '').replace(/\D/g, '')) return allowEmpty ? null : PHONE_LOCK_MSG;
    if (!r.match) return PHONE_LOCK_MSG;
    return null;
  }

  function saleTotals(f) {
    const cat = vs.catalog || {};
    const items = f.items.map((it) => { const p = (cat.products || []).find((x) => x.id === it.product_id) || {}; return { ...it, unit_cost: Number(p.cost) || 0, category: p.category }; });
    const accessories = f.accessories.map((a) => { const x = (cat.accessories || []).find((y) => y.id === a.accessory_id) || {}; return { ...a, cost: Number(x.cost) || 0 }; });
    const payments = [{ method: f.payment_method, card_brand: f.card_brand, installments: Number(f.installments) || 0, amount: 0 }];
    return TS.computeTotals({ items, accessories, payments, delivery_type: f.delivery_type, delivery_fee: Number(f.delivery_fee) || 0, delivery_cost: Number(f.delivery_cost) || 0, cfg: cat.fees || {} });
  }

  function deliveryNotes(f) {
    const lines = [];
    if (f.reference.trim()) lines.push(`Referência: ${f.reference.trim()}`);
    if (f.schedule.trim()) lines.push(`Horário: ${f.schedule.trim()}`);
    if (f.map) lines.push(`Mapa: ${f.map.url}${f.map.name ? ` (${f.map.name})` : ''}`);
    if (f.notes.trim()) lines.push(f.notes.trim());
    return lines.join('\n');
  }

  const inputField = (label, value, onInput, { type = 'text', max = 200, aria, list, need = false } = {}) => {
    const i = el('input', `ed-title${need ? ' need' : ''}`);
    i.type = type;
    i.maxLength = max;
    i.value = value;
    i.setAttribute('aria-label', aria || label);
    if (list) i.setAttribute('list', list);
    i.addEventListener('input', () => onInput(i.value));
    return schedField(label, i);
  };

  function selectOf(options, value, aria, onChange) {
    const sel = el('select', 'ed-cat');
    sel.setAttribute('aria-label', aria);
    options.forEach(([k, t]) => { const o = el('option', null, t); o.value = k; o.selected = String(k) === String(value); sel.append(o); });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function renderSaleForm() {
    const f = vs.form;
    const cat = vs.catalog || {};
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'NOVA VENDA DESTA CONVERSA'));
    if (!f.chatId) sec.append(el('div', 'ed-note', 'Abra uma conversa individual no WhatsApp.'));
    if (cat.error) sec.append(el('div', 'ed-msg err', `Não consegui carregar os dados do ERP: ${cat.error}`));

    sec.append(el('div', 'crm-sub', '1. Cliente'));
    const r1 = el('div', 'sc-row');
    r1.append(inputField('Nome', f.customer_name, (v) => { f.customer_name = v; }, { max: 100, aria: 'Nome do cliente' }), inputField('Telefone', f.customer_phone, (v) => { f.customer_phone = v; }, { max: 30, aria: 'Telefone do cliente', need: !!f.phoneChecked && !f.customer_phone }));
    sec.append(r1);

    // Produtos
    sec.append(el('div', 'crm-sub', '2. Produtos'));
    const search = el('input', 'ed-title');
    search.value = f.search;
    search.placeholder = 'Buscar produto (modelo ou cor)';
    search.setAttribute('aria-label', 'Buscar produto');
    const results = el('div', 'vd-results');
    const showResults = () => {
      results.textContent = '';
      const q = globalThis.TspEngine.stripAccents(f.search).toLowerCase().trim();
      if (!q) return;
      (cat.products || []).filter((p) => globalThis.TspEngine.stripAccents(productLabel(p)).toLowerCase().includes(q)).slice(0, 8).forEach((p) => {
        const b = fbtn('vd-prod', `${productLabel(p)} · estoque ${p.current_stock} · ${TS.money(p.price)}`, () => {
          const ex = f.items.find((x) => x.product_id === p.id);
          if (ex) ex.quantity += 1;
          else f.items.push({ product_id: p.id, quantity: 1, unit_price: Number(p.price) || 0 });
          f.search = '';
          renderVendas();
        });
        results.append(b);
      });
    };
    search.addEventListener('input', () => { f.search = search.value; showResults(); });
    sec.append(search, results);
    showResults();
    f.items.forEach((it, i) => {
      const p = (cat.products || []).find((x) => x.id === it.product_id) || { model: 'produto' };
      const row = el('div', 'fw-variant');
      row.append(el('div', 'sc-who', `${productLabel(p)}${p.current_stock != null ? ` · estoque ${p.current_stock}` : ''}`));
      const r = el('div', 'sc-row');
      const q = numberInput(it.quantity, 1, 999, `Quantidade do produto ${i + 1}`);
      q.addEventListener('input', () => { it.quantity = Math.max(1, Math.floor(Number(q.value) || 1)); renderTotal(); });
      const pr = el('input', 'ed-title');
      pr.type = 'number';
      pr.step = '0.01';
      pr.min = '0';
      pr.value = String(it.unit_price);
      pr.setAttribute('aria-label', `Valor unitário do produto ${i + 1}`);
      pr.addEventListener('input', () => { it.unit_price = Math.max(0, Number(pr.value) || 0); renderTotal(); });
      r.append(schedField('Qtd.', q), schedField('Valor unitário (R$)', pr), fbtn('ed-mini', '✕', () => { f.items.splice(i, 1); renderVendas(); }));
      row.append(r);
      sec.append(row);
    });
    // Acessórios (como no ERP: só custo, não entram no valor da venda)
    if ((cat.accessories || []).length) {
      const ar = el('div', 'sc-row');
      const accSel = selectOf([['', '+ acessório (brinde, entra só no custo)'], ...cat.accessories.map((a) => [a.id, a.name])], '', 'Adicionar acessório', (v) => {
        if (!v) return;
        const ex = f.accessories.find((x) => x.accessory_id === v);
        if (ex) ex.quantity += 1; else f.accessories.push({ accessory_id: v, quantity: 1 });
        renderVendas();
      });
      ar.append(accSel);
      sec.append(ar);
      f.accessories.forEach((a, i) => {
        const x = cat.accessories.find((y) => y.id === a.accessory_id) || { name: 'acessório' };
        const row = el('div', 'sc-row');
        const q = numberInput(a.quantity, 1, 999, `Quantidade do acessório ${i + 1}`);
        q.addEventListener('input', () => { a.quantity = Math.max(1, Math.floor(Number(q.value) || 1)); renderTotal(); });
        row.append(el('span', 'sc-who', x.name), q, fbtn('ed-mini', '✕', () => { f.accessories.splice(i, 1); renderVendas(); }));
        sec.append(row);
      });
    }

    // Pagamento
    sec.append(el('div', 'crm-sub', '3. Pagamento'));
    const pr = el('div', 'sc-row');
    pr.append(selectOf(TS.PAYMENT_METHODS, f.payment_method, 'Forma de pagamento', (v) => {
      f.payment_method = v;
      // como o ERP: fora de cartão, sem bandeira e sem parcelas
      if (!['credit_card', 'debit_card', 'payment_link'].includes(v)) { f.card_brand = ''; f.installments = 0; }
      if (v !== 'credit_card' && v !== 'payment_link') f.installments = 0;
      if (['credit_card', 'debit_card', 'payment_link'].includes(v) && !f.card_brand) f.card_brand = 'visa_mastercard';
      renderVendas();
    }));
    if (['credit_card', 'debit_card', 'payment_link'].includes(f.payment_method)) {
      pr.append(selectOf([['', 'Bandeira (definir depois)'], ...TS.CARD_BRANDS], f.card_brand, 'Bandeira', (v) => { f.card_brand = v; renderTotal(); }));
    }
    if (f.payment_method === 'credit_card' || f.payment_method === 'payment_link') {
      pr.append(selectOf([['0', 'Parcelas (definir depois)'], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1}x`])], String(f.installments), 'Parcelas', (v) => { f.installments = Number(v) || 0; renderTotal(); }));
    }
    sec.append(pr);
    const ps = el('div', 'sc-row');
    [['a_cobrar', 'A cobrar'], ['pago', 'Já pago']].forEach(([k, t]) => {
      const l = el('label', 'sc-radio');
      const r = el('input');
      r.type = 'radio';
      r.name = 'vd-paystatus';
      r.checked = f.payment_status === k;
      r.addEventListener('change', () => { f.payment_status = k; });
      l.append(r, t);
      ps.append(l);
    });
    sec.append(ps);
    const totalEl = el('div', 'fw-count vd-total');
    const renderTotal = () => {
      const t = saleTotals(f);
      totalEl.textContent = `Total: ${TS.money(t.totalSalePrice)} · taxa ${TS.money(t.cardFee)} · líquido ${TS.money(t.netReceived)}`;
    };
    renderTotal();
    sec.append(totalEl);

    // Entrega
    sec.append(el('div', 'crm-sub', '4. Entrega'));
    const dr = el('div', 'sc-row');
    dr.append(selectOf(TS.DELIVERY_TYPES, f.delivery_type, 'Tipo de entrega', (v) => { f.delivery_type = v; renderVendas(); }));
    if (f.delivery_type === 'motoboy') {
      dr.append(selectOf([['', 'Selecionar Motoboy'], ...(cat.motoboys || []).map((m) => [m.id, m.name])], f.motoboy_id, 'Motoboy', (v) => { f.motoboy_id = v; }));
      const fee = numberInput(f.delivery_fee, 0, 10000, 'Taxa do motoboy');
      fee.addEventListener('input', () => { f.delivery_fee = Math.max(0, Number(fee.value) || 0); renderTotal(); });
      dr.append(schedField('Taxa do motoboy (R$)', fee));
    }
    if (f.delivery_type === 'correios') {
      const cost = numberInput(f.delivery_cost, 0, 10000, 'Frete');
      cost.addEventListener('input', () => { f.delivery_cost = Math.max(0, Number(cost.value) || 0); renderTotal(); });
      dr.append(schedField('Frete (R$)', cost));
    }
    sec.append(dr);
    const dl = (id, list) => { const d = el('datalist'); d.id = id; list.forEach((x) => { const o = el('option'); o.value = x.name; d.append(o); }); return d; };
    sec.append(dl('vd-cities', cat.cities || []), dl('vd-neigh', cat.neighborhoods || []));
    const ar2 = el('div', 'sc-row');
    ar2.append(inputField('Cidade', f.city, (v) => { f.city = v; }, { max: 80, list: 'vd-cities' }), inputField('Bairro', f.neighborhood, (v) => { f.neighborhood = v; }, { max: 80, list: 'vd-neigh' }));
    sec.append(ar2);
    const ar3 = el('div', 'sc-row');
    ar3.append(inputField('Rua', f.address_street, (v) => { f.address_street = v; }), inputField('Número', f.address_number, (v) => { f.address_number = v; }, { max: 30 }));
    sec.append(ar3);
    const ar4 = el('div', 'sc-row');
    ar4.append(inputField('Complemento', f.address_complement, (v) => { f.address_complement = v; }), inputField('Referência', f.reference, (v) => { f.reference = v; }), inputField('CEP (opcional)', f.zip_code, (v) => { f.zip_code = v; }, { max: 12 }));
    sec.append(ar4);
    sec.append(inputField('Horário de entrega', f.schedule, (v) => { f.schedule = v; }, { max: 80 }));
    const sh = el('div', 'ed-add');
    ['hoje 15h', 'hoje à tarde', 'amanhã manhã', 'amanhã tarde'].forEach((t) => sh.append(fbtn('ed-mini', t, () => { f.schedule = t; renderVendas(); })));
    sec.append(sh);
    sec.append(fbtn('bbtn', 'Pegar endereço da conversa', () => pickAddressFromChat()));
    if (f.map) sec.append(el('div', 'fw-test', `Localização: ${f.map.name || 'sem nome'} · ${f.map.url}`));
    if (f.addressHint) {
      const hint = el('div', 'fw-test');
      hint.append(el('div', null, `O cliente escreveu: "${f.addressHint}"`), fbtn('ed-mini', 'Usar como rua', () => { f.address_street = f.addressHint.slice(0, 200); f.addressHint = null; renderVendas(); }));
      sec.append(hint);
    }
    sec.append(inputField('Observações para a entrega', f.notes, (v) => { f.notes = v; }, { max: 500 }));

    // Garantia, origem e etiquetas
    sec.append(el('div', 'crm-sub', '5. Garantia'));
    const w = numberInput(f.warranty_months === '' ? '' : f.warranty_months, 0, 120, 'Garantia (meses)');
    w.placeholder = 'meses';
    w.addEventListener('input', () => { f.warranty_months = w.value === '' ? '' : Math.max(0, Math.min(120, Math.floor(Number(w.value) || 0))); });
    sec.append(schedField('Garantia (meses)', w));
    if (cat.originAvailable === false) sec.append(el('div', 'ed-note', 'Garantia, origem e conversa da venda: atualize o banco para guardar (a venda é registrada mesmo assim).'));
    sec.append(el('div', 'crm-sub', '6. Origem'));
    const or = el('div', 'sc-row');
    [['anuncio', 'Veio de anúncio'], ['organico', 'Orgânico']].forEach(([k, t]) => {
      const l = el('label', 'sc-radio');
      const r = el('input');
      r.type = 'radio';
      r.name = 'vd-origin';
      r.checked = f.origin === k;
      r.addEventListener('change', () => { f.origin = k; });
      l.append(r, t);
      or.append(l);
    });
    sec.append(or);
    if (f.ad) {
      const ad = el('div', 'fw-test');
      ad.append(el('div', null, `Veio do anúncio: ${f.ad.title || '(sem título)'}${f.ad.platform ? ` · ${f.ad.platform}` : ''}`));
      if (f.ad.url) {
        const a = el('a', null, 'abrir anúncio');
        a.href = f.ad.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        ad.append(a);
      }
      sec.append(ad);
    }
    sec.append(el('div', 'crm-sub', '7. Opções'));
    const ml = el('label', 'sc-radio');
    const mc = el('input');
    mc.type = 'checkbox';
    mc.checked = f.moveLabels;
    mc.addEventListener('change', () => { f.moveLabels = mc.checked; renderVendas(); });
    ml.append(mc, 'Tirar das automações e pôr na etiqueta CRM:');
    sec.append(ml);
    if (f.moveLabels) {
      sec.append(labelPicker(f.clientLabel, (v) => { f.clientLabel = v; }, { aria: 'Etiqueta do cliente', rerender: renderVendas, onError: (m) => { vs.msg = m; vs.err = true; } }));
      const cur = state.convLabelIds.filter((l) => l !== f.clientLabel);
      if (cur.length) {
        sec.append(el('div', 'crm-intro', 'Tirar destas etiquetas CRM:'));
        const box = el('div', 'ed-add');
        cur.forEach((l) => {
          const lab = el('label', 'sc-radio');
          const c = el('input');
          c.type = 'checkbox';
          c.checked = f.removeLabels.includes(l);
          c.addEventListener('change', () => { f.removeLabels = c.checked ? [...new Set([...f.removeLabels, l])] : f.removeLabels.filter((x) => x !== l); });
          lab.append(c, labelName(l));
          box.append(lab);
        });
        sec.append(box);
      }
    }
    if (f.dupAsk) {
      const dup = el('div', 'fw-test');
      dup.append(el('div', 'ed-note', 'Já existe uma venda desta conversa hoje. Registrar outra?'), fbtn('bbtn primary', 'Registrar outra', () => registerSale(true)), fbtn('bbtn', 'Cancelar', () => { f.dupAsk = false; renderVendas(); }));
      sec.append(dup);
    }
    const actions = el('div', 'ed-add');
    const go = fbtn('bbtn primary', vs.busy ? 'Registrando…' : 'Registrar venda', () => registerSale(false));
    go.disabled = vs.busy || !f.chatId || !f.items.length;
    actions.append(go, fbtn('bbtn', 'Gerar mensagem do entregador', () => openCourier()), fbtn('bbtn', 'Cancelar', () => { vs.view = 'list'; loadChatSales(); }));
    sec.append(actions, el('div', `ed-msg${vs.err ? ' err' : ''}`, vs.msg));
    vtabEl.append(sec);
  }

  async function pickAddressFromChat() {
    const f = vs.form;
    if (!f.chatId) return;
    let info = null;
    try { info = await waRequest('chatSaleInfo', { chatId: f.chatId }, { timeout: 4000 }); } catch { info = null; }
    if (!info) { vs.msg = 'Não consegui ler a conversa.'; vs.err = true; renderVendas(); return; }
    if (info.location) f.map = { url: TS.mapUrl(info.location.lat, info.location.lng), name: info.location.name || null };
    if (info.addressText) f.addressHint = info.addressText;
    vs.msg = info.location || info.addressText ? '' : 'Nenhuma localização ou endereço nas mensagens carregadas.';
    vs.err = false;
    renderVendas();
  }

  function salePayload(f) {
    return {
      customer_name: f.customer_name, customer_phone: f.customer_phone,
      items: f.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
      accessories: f.accessories.map((a) => ({ accessory_id: a.accessory_id, quantity: a.quantity })),
      payment_method: f.payment_method, card_brand: f.card_brand, installments: f.installments, payment_status: f.payment_status,
      delivery_type: f.delivery_type, motoboy_id: f.motoboy_id || null, delivery_fee: f.delivery_fee, delivery_cost: f.delivery_cost,
      city: f.city, neighborhood: f.neighborhood, address_street: f.address_street, address_number: f.address_number,
      address_complement: f.address_complement, zip_code: f.zip_code, delivery_notes: deliveryNotes(f),
      wa_chat_id: f.chatId, origin: f.origin, ad_source: f.origin === 'anuncio' && f.ad ? f.ad.platform || f.ad.sourceType || null : null,
      ad_title: f.origin === 'anuncio' && f.ad ? f.ad.title : null, ad_url: f.origin === 'anuncio' && f.ad ? f.ad.url : null,
      warranty_months: f.warranty_months === '' ? null : f.warranty_months,
    };
  }

  async function registerSale(confirmedDup) {
    const f = vs.form;
    if (vs.busy || !f || !f.chatId) return;
    if (!f.items.length) { vs.msg = 'Adicione pelo menos um produto.'; vs.err = true; renderVendas(); return; }
    const v = TS.validateAddress(f.delivery_type, f);
    if (!v.isValid) { vs.msg = v.message; vs.err = true; renderVendas(); return; }
    if (f.moveLabels && String(f.clientLabel || '').startsWith('new:')) { vs.msg = 'Crie a etiqueta do cliente (botão "Criar agora") ou desmarque a opção.'; vs.err = true; renderVendas(); return; }
    vs.busy = true;
    vs.msg = '';
    renderVendas();
    // 2.6.3: trava: telefone desta conversa (vazio pode) e a conversa ainda é a aberta
    const lock = await phoneLock(f.chatId, f.customer_phone, { allowEmpty: true });
    if (lock || vs.form !== f) { vs.busy = false; if (vs.form === f) { vs.msg = lock; vs.err = true; } renderVendas(); return; }
    try {
      if (!confirmedDup) {
        const dup = await call('recentChatSale', { chatId: f.chatId, phone: f.customer_phone });
        if (dup && dup.exists) { f.dupAsk = true; vs.busy = false; renderVendas(); return; }
      }
      f.dupAsk = false;
      const res = await call('createSaleFromChat', { sale: salePayload(f) });
      // contato da conversa (para o gatilho "venda registrada") + opção de etiquetas
      try {
        await call('saleContactLabels', { chatId: f.chatId, name: f.customer_name, phone: f.customer_phone, addLabelId: f.moveLabels && f.clientLabel ? f.clientLabel : null, removeLabelIds: f.moveLabels ? f.removeLabels : [] });
        afterLabelChange();
      } catch { /* a venda já está registrada */ }
      motor.state.lastEvalAt = 0; // automações "venda registrada" no próximo ciclo
      vs.done = { id: res.id, total: res.total, tinyFailed: res.tinyFailed };
      vs.view = 'done';
    } catch (e) {
      vs.msg = `Não consegui registrar: ${e.message}`;
      vs.err = true;
    }
    vs.busy = false;
    renderVendas();
  }

  function renderSaleDone() {
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'VENDA REGISTRADA'));
    sec.append(el('div', 'fw-test', `Venda registrada (pendente). Finalize no ERP. Total ${TS.money(vs.done.total)}.`));
    const url = erpLink({ pagina: 'historico', venda: vs.done.id });
    if (url) sec.append(erpAnchor('Abrir esta venda no ERP', url, 'bbtn primary vd-open'));
    else sec.append(el('div', 'crm-intro', 'No ERP: Histórico de Vendas.'));
    if (vs.done.tinyFailed) sec.append(el('div', 'ed-note', 'O estoque do Tiny não confirmou a atualização: confira no ERP.'));
    sec.append(fbtn('bbtn', 'Gerar mensagem do entregador', () => openCourier()), fbtn('bbtn', 'Voltar', () => { vs.view = 'list'; loadChatSales(); }));
    vtabEl.append(sec);
  }

  // ── Mensagem do entregador (só monta o texto; enviar é um clique) ──
  async function openCourier() {
    const f = vs.form;
    if (!f) return;
    const cat = vs.catalog || {};
    const t = saleTotals(f);
    const text = TS.courierMessage({
      customer_name: f.customer_name, customer_phone: f.customer_phone, address_street: f.address_street, address_number: f.address_number,
      neighborhood: f.neighborhood, city: f.city, reference: f.reference, schedule: f.schedule,
      items: f.items.map((i) => { const p = (cat.products || []).find((x) => x.id === i.product_id); return { quantity: i.quantity, name: p ? productLabel(p) : 'produto' }; }),
      total: t.totalSalePrice, payment_method: f.payment_method, payment_status: f.payment_status, map_url: f.map ? f.map.url : null,
    });
    vs.courier = { text, back: vs.view, chats: null, target: '' };
    vs.view = 'courier';
    renderVendas();
    try { vs.courier.chats = await waRequest('recentChats', { limit: 30 }, { timeout: 6000 }); } catch { vs.courier.chats = []; }
    if (vs.view === 'courier') renderVendas();
  }

  function renderCourier() {
    const c = vs.courier;
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'MENSAGEM DO ENTREGADOR'));
    const ta = el('textarea', 'ed-text');
    ta.rows = 10;
    ta.value = c.text;
    ta.setAttribute('aria-label', 'Mensagem do entregador');
    ta.addEventListener('input', () => { c.text = ta.value; });
    sec.append(ta);
    const r = el('div', 'ed-add');
    r.append(fbtn('bbtn', 'Copiar', async () => { const okc = await copyToClipboard(c.text); toast(okc ? 'Mensagem copiada.' : 'Não foi possível copiar.', okc ? 'ok' : 'error', 2500); }));
    sec.append(r);
    const sr = el('div', 'sc-row');
    sr.append(selectOf([['', c.chats ? 'Enviar para… (conversa carregada)' : 'Carregando conversas…'], ...(c.chats || []).map((x) => [x.id, x.name || x.id.split('@')[0]])], c.target, 'Enviar para', (v) => { c.target = v; }));
    sr.append(fbtn('bbtn primary', 'Enviar', () => sendCourier()));
    sec.append(sr, fbtn('bbtn', 'Voltar', () => { vs.view = c.back === 'courier' ? 'form' : c.back; renderVendas(); }));
    vtabEl.append(sec);
  }

  async function sendCourier() {
    const c = vs.courier;
    if (!c.target || !c.text.trim()) { toast('Escolha a conversa.', 'warn', 3000); return; }
    if (state.busyId || seq) { toast('Já tem um envio em andamento.', 'warn', 4000); return; }
    state.busyId = 'courier';
    try {
      const res = await runSequence({ parts: [{ type: 'texto', body: c.text.slice(0, 4096), wait_seconds: 0, typing_seconds: 0 }], chatId: c.target, firstName: '' });
      sequenceToast(res, 1);
    } finally {
      state.busyId = null;
    }
  }

  // ── Lista ──
  function renderVendas() {
    if (!vtabEl) return;
    vtabEl.textContent = '';
    vtabEl.append(el('div', 'crm-intro', 'Registre a venda da conversa aberta direto no ERP (fica "Em separação"; finalize no ERP).'));
    if (vs.view === 'form' && vs.form) { renderSaleForm(); return; }
    if (vs.view === 'done' && vs.done) { renderSaleDone(); return; }
    if (vs.view === 'courier' && vs.courier) { renderCourier(); return; }
    const top = el('div', 'ed-add');
    top.append(fbtn('bbtn primary', '💰 Nova venda desta conversa', () => openSaleForm()));
    if (erpLink({})) top.append(fbtn('bbtn', 'Nova venda no ERP', () => openErpNewSale()));
    vtabEl.append(top);
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'ÚLTIMAS 20 VENDAS PELA CONVERSA'));
    if (vs.listError) sec.append(el('div', 'ed-note', vs.listError === 'Atualize o banco para usar este recurso' ? 'Atualize o banco para usar este recurso (a lista precisa da migration 20261103170000).' : vs.listError));
    else if (!vs.list) sec.append(el('div', 'lt-none loading', 'Carregando…'));
    else if (!vs.list.length) sec.append(el('div', 'lt-none', 'Nenhuma venda registrada pela extensão ainda.'));
    (vs.list || []).forEach((s) => {
      const line = fbtn('sc-item vd-sale', '', async () => {
        try { await waRequest('openChat', { chatId: s.wa_chat_id }, { timeout: 6000 }); } catch { toast('Essa conversa não está carregada no WhatsApp Web.', 'warn', 4000); }
      });
      const main = el('div', 'sc-main');
      main.append(el('div', 'sc-who', s.customer_name || 'Cliente'), el('div', 'sc-prev', `${TS.money(s.total_sale_price)} · ${ERP_STATUS[s.status] || s.status}`));
      const side = el('div', 'sc-side');
      side.append(el('span', 'sc-when', schedWhen(s.created_at || s.sale_date)));
      line.append(main, side);
      const href = s.id ? erpLink({ pagina: 'historico', venda: s.id }) : null;
      if (href) {
        const row = el('div', 'vd-row');
        row.append(line, erpAnchor('Abrir no ERP', href, 'ed-mini vd-erp', `Abrir no ERP a venda de ${s.customer_name || 'Cliente'}`));
        sec.append(row);
      } else sec.append(line);
    });
    vtabEl.append(sec);
  }

  // ── 🖼️ Mídias (2.7.0): biblioteca de mídias da loja ──────────────────────
  // Pastas, busca, filtro por tipo, grade com miniaturas, subir (botão ou arrastar, vários de uma vez, sem
  // duplicar), enviar na conversa aberta (envio manual imediato, como as mensagens rápidas; áudio .ogg vai
  // como voz), editar, apagar (só sem uso) e importar as mídias das mensagens rápidas.

  const mtabEl = shadow.querySelector('.mtab');
  const MD_TYPE_LABEL = { imagem: 'Foto', video: 'Vídeo', audio: 'Áudio', documento: 'PDF' };
  const MD_ICON = { imagem: '🖼️', video: '🎬', audio: '🎵', documento: '📄' };
  const MD_LIMIT_MB = { imagem: 5, video: 16, audio: 16, documento: 20 };
  const MD_THUMBS = 60; // miniaturas carregadas por vez (as outras mostram o ícone)
  const md = {
    open: false, loaded: false, loading: false, error: '', folders: [], media: [], used: 0, quota: 1024 * 1024 * 1024,
    folder: 'todas', type: 'todos', q: '', sel: null, caption: '', edit: null, usage: null, confirmDel: false,
    folderEdit: null, confirmFolderDel: null, msg: '', err: false, busy: false, upMsgs: [],
  };
  const mdNorm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function syncMidiasActive() {
    const want = state.open && state.section === 'midias';
    md.open = want;
    if (!want) return;
    loadMedia();
  }

  async function loadMedia({ quiet = false } = {}) {
    if (!quiet && !md.loaded) { md.loading = true; renderMidias(); }
    try {
      const r = await call('fetchMediaLibrary');
      Object.assign(md, { folders: r.folders || [], media: r.media || [], used: Number(r.used) || 0, quota: Number(r.quota) || md.quota, error: '' });
    } catch (e) {
      md.error = e.message;
    }
    md.loaded = true;
    md.loading = false;
    renderMidias();
  }

  function mdTypeOf(file) {
    const m = (file.type || '').toLowerCase();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (/^image\//.test(m) || ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'imagem';
    if (m === 'video/mp4' || ext === 'mp4') return 'video';
    if (/^audio\//.test(m) || ['ogg', 'opus', 'mp3', 'm4a', 'wav', 'webm'].includes(ext)) return 'audio';
    if (m === 'application/pdf' || ext === 'pdf') return 'documento';
    return null;
  }

  async function uploadMediaFiles(files) {
    const list = [...(files || [])];
    if (!list.length || md.busy) return;
    md.busy = true;
    md.upMsgs = [];
    const folderId = md.folder !== 'todas' && md.folder !== 'sem' ? md.folder : null;
    renderMidias();
    for (const f of list) {
      const type = mdTypeOf(f);
      const mime = type ? edFileMime(type, f) : '';
      if (!type || !ED_MIME[type].includes(mime)) { md.upMsgs.push({ cls: 'err', text: `${f.name}: tipo de arquivo não aceito (foto JPG/PNG/WebP, vídeo MP4, áudio ou PDF).` }); renderMidias(); continue; }
      if (f.size > MD_LIMIT_MB[type] * 1024 * 1024) { md.upMsgs.push({ cls: 'err', text: `${f.name}: acima de ${MD_LIMIT_MB[type]} MB (limite para ${MD_TYPE_LABEL[type].toLowerCase()}).` }); renderMidias(); continue; }
      const line = { cls: '', text: `Enviando ${f.name}…` };
      md.upMsgs.push(line);
      renderMidias();
      try {
        const r = await call('uploadMedia', { mediaType: type, base64: await fileToBase64(f), mime, fileName: f.name, folderId });
        Object.assign(line, r.duplicate ? { cls: 'warn', text: `${f.name}: esse arquivo já está na biblioteca ("${r.media.title}"). Não subi de novo.` } : { cls: '', text: `${f.name}: salvo.` });
      } catch (e) {
        Object.assign(line, { cls: 'err', text: `${f.name}: ${e.message === DB_MISSING ? DB_MISSING : e.message}` });
      }
      renderMidias();
    }
    md.busy = false;
    await loadMedia({ quiet: true });
  }

  // 2.8.5: arrastar pastas (ordem) e mídias (para outra pasta)
  const mdFiltering = () => !!md.q || md.type !== 'todos';
  async function dropFolder(srcId, hit) {
    const prev = md.folders.slice();
    const list = prev.filter((f) => f.id !== srcId);
    const moved = prev.find((f) => f.id === srcId);
    const at = list.findIndex((f) => f.id === hit.el.dataset.folder);
    if (!moved || at < 0) return;
    list.splice(at + (hit.where === 'after' ? 1 : 0), 0, moved);
    md.folders = list;
    renderMidias();
    try { await call('reorderMediaFolders', { ids: list.map((f) => f.id) }); } catch (e) {
      md.folders = prev;
      renderMidias();
      toast(`Não consegui salvar a nova ordem: ${e.message}`, 'error', 6000);
    }
  }
  async function dropMedia(mediaId, hit) {
    const m = md.media.find((x) => x.id === mediaId);
    if (!m) return;
    const folderId = hit.el.dataset.folder === 'sem' ? null : hit.el.dataset.folder;
    if ((m.folder_id || null) === folderId) return;
    const before = m.folder_id;
    m.folder_id = folderId;
    renderMidias();
    try {
      await call('updateMedia', { id: m.id, folderId });
      toast('Mídia movida.', 'ok', 2500);
    } catch (e) {
      m.folder_id = before;
      renderMidias();
      toast(`Não consegui mover: ${e.message}`, 'error', 6000);
    }
  }
  const FOLDER_ID = /^[0-9a-f-]{36}$/;
  if (mtabEl) {
    mtabEl.addEventListener('pointerdown', (e) => {
      if (md.sel) return;
      const t = dndPoint(e);
      if (!t || !t.closest || t.closest('input, textarea, select, .md-drop')) return;
      const chip = t.closest('[data-folder]');
      if (chip && FOLDER_ID.test(chip.dataset.folder)) {
        dndStart(e, chip, {
          blocked: mdFiltering,
          find: (p, ev) => { const c = p.closest('[data-folder]'); return c && FOLDER_ID.test(c.dataset.folder) ? { el: c, where: halfX(c, ev) } : null; },
          drop: (hit) => dropFolder(chip.dataset.folder, hit),
        });
        return;
      }
      const card = t.closest('.md-card');
      if (card && card.dataset.id) {
        dndStart(e, card, {
          blocked: mdFiltering,
          find: (p) => { const c = p.closest('[data-folder]'); return c && c.dataset.folder !== 'todas' ? { el: c, where: 'into' } : null; },
          drop: (hit) => dropMedia(card.dataset.id, hit),
        });
      }
    });
  }

  // Arrastar e soltar em qualquer lugar da aba
  if (mtabEl) {
    mtabEl.addEventListener('dragover', (e) => { e.preventDefault(); const z = mtabEl.querySelector('.md-drop'); if (z) z.classList.add('over'); });
    mtabEl.addEventListener('dragleave', () => { const z = mtabEl.querySelector('.md-drop'); if (z) z.classList.remove('over'); });
    mtabEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const z = mtabEl.querySelector('.md-drop');
      if (z) z.classList.remove('over');
      if (md.sel) return;
      uploadMediaFiles(e.dataTransfer && e.dataTransfer.files);
    });
  }

  const mdVisible = () => md.media.filter((m) => (md.folder === 'todas' || (md.folder === 'sem' ? !m.folder_id : m.folder_id === md.folder))
    && (md.type === 'todos' || m.type === md.type) && (!md.q || mdNorm(m.title).includes(mdNorm(md.q))));
  const mdFileItem = (m) => ({ id: 'arquivo', file_url: m.file_url, file_name: m.file_name }); // mesmo cache da prévia do editor

  // Miniatura: a foto, o primeiro quadro do vídeo ou o ícone do tipo (o arquivo vem pelo background, em cache)
  // 2.7.1: vídeo com ▶, áudio com a duração; carrega só quando aparece na tela
  function mdThumb(m, { big = false, load = true, eager = false } = {}) {
    const box = el('div', `md-thumb${big ? ' big' : ''}`);
    box.append(el('span', 'md-ico', MD_ICON[m.type] || '📎'));
    const play = !big && m.type === 'video' ? el('span', 'md-play', '▶') : null;
    if (play) box.append(play);
    let dur = null;
    if (!big && m.type === 'audio') {
      dur = el('span', 'md-dur', mediaDur.has(m.file_url) ? fmtDur(mediaDur.get(m.file_url)) : '');
      box.append(dur);
    }
    if (!load || m.type === 'documento' || (dur && mediaDur.has(m.file_url))) return box;
    (eager ? (fn) => fn() : (fn) => whenVisible(box, fn))(() => getBlobUrl(mdFileItem(m)).then((url) => {
      if (dur) {
        // só lê a duração (o áudio não toca aqui)
        const a = document.createElement('audio');
        a.preload = 'metadata';
        a.hidden = true;
        a.addEventListener('loadedmetadata', () => {
          if (Number.isFinite(a.duration) && a.duration > 0) { mediaDur.set(m.file_url, a.duration); dur.textContent = fmtDur(a.duration); }
          a.remove();
        }, { once: true });
        a.src = url;
        box.append(a);
        return;
      }
      let tag;
      if (m.type === 'imagem') { tag = document.createElement('img'); tag.alt = ''; }
      else if (m.type === 'video') { tag = document.createElement('video'); tag.muted = true; tag.preload = 'metadata'; if (big) tag.controls = true; }
      else { tag = document.createElement('audio'); tag.controls = true; tag.preload = 'metadata'; }
      tag.src = m.type === 'video' ? videoSrc(url) : url;
      if (m.type === 'audio') box.append(tag);
      else { box.textContent = ''; box.append(tag); if (play) box.append(play); }
    }).catch(() => { /* fica o ícone */ }));
    return box;
  }

  function renderMidias() {
    if (!mtabEl) return;
    mtabEl.textContent = '';
    mtabEl.append(el('div', 'crm-intro', 'Biblioteca de mídias da loja: fotos, vídeos, áudios e PDFs em pastas. Envie na conversa aberta com um clique ou escolha daqui ao montar uma mensagem rápida ou a mensagem de um disparo (o arquivo não é subido de novo).'));
    if (md.error) {
      mtabEl.append(el('div', 'ed-note', md.error === DB_MISSING ? 'Atualize o banco para usar este recurso (migration 20261105090000).' : `Não consegui carregar a biblioteca: ${md.error}`));
      return;
    }
    if (!md.loaded) { mtabEl.append(el('div', 'lt-none loading', 'Carregando…')); return; }
    if (md.sel) { renderMediaDetail(); return; }

    // Pastas
    const fsec = el('section', 'crmsec');
    fsec.append(el('div', 'wt-head', 'PASTAS'));
    const chips = el('div', 'ed-add');
    const count = (pred) => md.media.filter(pred).length;
    const chip = (id, label) => {
      const b = fbtn(`ed-mini${md.folder === id ? ' on' : ''}`, label, () => { md.folder = id; md.folderEdit = null; md.confirmFolderDel = null; renderMidias(); });
      b.setAttribute('aria-pressed', String(md.folder === id));
      b.dataset.folder = id; // 2.8.5: arrastar (pastas: ordem; mídias: soltar na pasta)
      return b;
    };
    chips.append(chip('todas', `Todas (${md.media.length})`), chip('sem', `Sem pasta (${count((m) => !m.folder_id)})`));
    md.folders.forEach((f) => chips.append(chip(f.id, `${f.name} (${count((m) => m.folder_id === f.id)})`)));
    fsec.append(chips);
    const fact = el('div', 'ed-add');
    fact.append(fbtn('ed-mini', '+ Pasta', () => { md.folderEdit = { id: null, name: '' }; renderMidias(); }));
    const cur = md.folders.find((f) => f.id === md.folder);
    if (cur) {
      // 2.8.5: a ordem das pastas muda arrastando o nome da pasta
      fact.append(fbtn('ed-mini', 'Renomear', () => { md.folderEdit = { id: cur.id, name: cur.name }; renderMidias(); }),
        fbtn('ed-mini', md.confirmFolderDel === cur.id ? 'Confirmar: apagar a pasta' : 'Apagar pasta', async () => {
          if (md.confirmFolderDel !== cur.id) { md.confirmFolderDel = cur.id; renderMidias(); return; }
          md.confirmFolderDel = null;
          try { await call('deleteMediaFolder', { id: cur.id }); md.folder = 'todas'; md.msg = 'Pasta apagada (as mídias dela ficaram em "Sem pasta").'; md.err = false; } catch (e) { md.msg = `Não consegui apagar: ${e.message}`; md.err = true; }
          await loadMedia({ quiet: true });
        }));
    }
    fsec.append(fact);
    if (md.folderEdit) {
      const fe = md.folderEdit;
      const row = el('div', 'sc-row');
      const inp = el('input', 'ed-title');
      inp.maxLength = 60;
      inp.value = fe.name;
      inp.placeholder = 'Nome da pasta';
      inp.setAttribute('aria-label', 'Nome da pasta');
      inp.addEventListener('input', () => { fe.name = inp.value; });
      row.append(inp, fbtn('bbtn primary', 'Salvar pasta', async () => {
        try {
          if (fe.id) await call('renameMediaFolder', { id: fe.id, name: fe.name });
          else { const f = await call('createMediaFolder', { name: fe.name }); md.folder = f.id; }
          md.folderEdit = null;
          md.msg = '';
        } catch (e) { md.msg = `Não consegui salvar a pasta: ${e.message}`; md.err = true; }
        await loadMedia({ quiet: true });
      }), fbtn('bbtn', 'Cancelar', () => { md.folderEdit = null; renderMidias(); }));
      fsec.append(row);
    }
    mtabEl.append(fsec);

    // Busca e tipo
    const filt = el('div', 'sc-row');
    const q = el('input', 'ed-title');
    q.type = 'search';
    q.value = md.q;
    q.placeholder = 'Buscar pelo título';
    q.setAttribute('aria-label', 'Buscar mídia');
    q.addEventListener('input', () => { md.q = q.value; renderMidiaGrid(); });
    const ty = el('select', 'ed-cat');
    ty.setAttribute('aria-label', 'Tipo de mídia');
    [['todos', 'Todos os tipos'], ['imagem', 'Fotos'], ['video', 'Vídeos'], ['audio', 'Áudios'], ['documento', 'PDFs']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = md.type === v; ty.append(o); });
    ty.addEventListener('change', () => { md.type = ty.value; renderMidiaGrid(); });
    filt.append(q, ty);
    mtabEl.append(filt);

    // Subir (botão ou arrastar)
    const drop = el('div', 'md-drop');
    const pick = el('label', 'ed-pick', md.busy ? 'Enviando…' : 'Subir arquivos');
    const input = el('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/jpeg,image/png,image/webp,video/mp4,audio/ogg,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/webm,.ogg,.opus,.mp3,.m4a,.wav,.webm,application/pdf,.pdf';
    input.disabled = md.busy;
    input.setAttribute('aria-label', 'Subir arquivos para a biblioteca');
    input.addEventListener('change', () => { uploadMediaFiles(input.files); });
    pick.append(input);
    drop.append(pick, el('div', 'crm-intro', `ou arraste os arquivos para cá (vários de uma vez). Limites: foto ${MD_LIMIT_MB.imagem} MB, vídeo ${MD_LIMIT_MB.video} MB, áudio ${MD_LIMIT_MB.audio} MB, PDF ${MD_LIMIT_MB.documento} MB. Vai para a pasta escolhida acima.`));
    md.upMsgs.forEach((u) => drop.append(el('div', `md-up${u.cls ? ` ${u.cls}` : ''}`, u.text)));
    mtabEl.append(drop);
    if (md.msg) mtabEl.append(el('div', `ed-msg${md.err ? ' err' : ''}`, md.msg));

    // Grade
    const gsec = el('section', 'crmsec md-gsec');
    mtabEl.append(gsec);
    renderMidiaGrid(gsec);

    // Importar e espaço usado
    const tools = el('div', 'ed-add');
    tools.append(fbtn('bbtn', md.importing ? 'Importando…' : 'Importar mídias das mensagens rápidas', () => importMedia()));
    mtabEl.append(tools);
    const pct = md.quota ? md.used / md.quota : 0;
    const quota = el('div', `md-quota${pct > 0.9 ? ' bad' : pct > 0.7 ? ' warn' : ''}`);
    quota.append(el('div', null, `Espaço usado no wa-media: ${formatSize(md.used)} de 1 GB (${(pct * 100).toFixed(1).replace('.', ',')}%)${pct > 0.9 ? ' — quase cheio' : pct > 0.7 ? ' — atenção' : ''}`));
    const bar = el('div', 'md-qbar');
    const fill = el('div', 'md-qfill');
    fill.style.width = `${Math.min(100, pct * 100).toFixed(1)}%`;
    bar.append(fill);
    quota.append(bar);
    mtabEl.append(quota);
  }

  function renderMidiaGrid(target = mtabEl && mtabEl.querySelector('.md-gsec')) {
    if (!target) return;
    target.textContent = '';
    const list = mdVisible();
    target.append(el('div', 'wt-head', `MÍDIAS (${list.length})`));
    if (!list.length) {
      const empty = el('div', 'lt-none', md.media.length ? 'Nenhuma mídia com esse filtro.' : 'Nenhuma mídia ainda. Suba arquivos ou importe das mensagens rápidas.');
      if (!md.media.length) {
        // 2.8.0: estado vazio com ação (o mesmo seletor de arquivos da área "Subir arquivos")
        const act = el('label', 'ed-pick es-act', 'Subir arquivo');
        const inp = el('input');
        inp.type = 'file';
        inp.multiple = true;
        inp.addEventListener('change', () => uploadMediaFiles(inp.files));
        act.append(inp);
        empty.append(act);
      }
      target.append(empty);
      return;
    }
    const grid = el('div', 'md-grid');
    list.forEach((m, i) => {
      const card = el('button', 'md-card');
      card.type = 'button';
      card.title = m.title;
      card.dataset.id = m.id;
      card.append(mdThumb(m, { load: HAS_IO || i < MD_THUMBS }), el('span', 'md-name', m.title), el('span', 'md-size', `${MD_TYPE_LABEL[m.type] || m.type}${m.file_size != null ? ` · ${formatSize(m.file_size)}` : ''}`));
      card.addEventListener('click', () => openMediaDetail(m));
      grid.append(card);
    });
    target.append(grid);
  }

  function openMediaDetail(m) {
    Object.assign(md, { sel: m.id, caption: m.caption || '', edit: null, usage: null, confirmDel: false, msg: '', err: false });
    renderMidias();
  }

  function renderMediaDetail() {
    const m = md.media.find((x) => x.id === md.sel);
    if (!m) { md.sel = null; renderMidias(); return; }
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', m.title.toUpperCase()));
    sec.append(mdThumb(m, { big: true }));
    sec.append(el('div', 'md-size', `${MD_TYPE_LABEL[m.type]}${m.file_size != null ? ` · ${formatSize(m.file_size)}` : ''}${m.file_name ? ` · ${m.file_name}` : ''} · usada ${m.usage_count || 0} vez${(m.usage_count || 0) === 1 ? '' : 'es'}`));
    if (md.edit) {
      const f = md.edit;
      const t = el('input', 'ed-title');
      t.maxLength = 120;
      t.value = f.title;
      t.setAttribute('aria-label', 'Título da mídia');
      t.addEventListener('input', () => { f.title = t.value; });
      sec.append(schedField('Título', t));
      if (m.type !== 'audio') {
        const c = el('textarea', 'ed-caption');
        c.maxLength = 4096;
        c.rows = 3;
        c.value = f.caption;
        c.setAttribute('aria-label', 'Legenda padrão da mídia');
        c.addEventListener('input', () => { f.caption = c.value; });
        sec.append(schedField('Legenda padrão (opcional)', c));
      }
      const fs = el('select', 'ed-cat');
      fs.setAttribute('aria-label', 'Pasta da mídia');
      const none = el('option', null, 'Sem pasta');
      none.value = '';
      fs.append(none);
      md.folders.forEach((x) => { const o = el('option', null, x.name); o.value = x.id; o.selected = x.id === f.folderId; fs.append(o); });
      fs.addEventListener('change', () => { f.folderId = fs.value; });
      sec.append(schedField('Pasta', fs));
      const a = el('div', 'ed-add');
      a.append(fbtn('bbtn primary', 'Salvar', async () => {
        try {
          const row = await call('updateMedia', { id: m.id, title: f.title, caption: m.type === 'audio' ? undefined : f.caption, folderId: f.folderId || null });
          Object.assign(m, row);
          md.edit = null;
          md.caption = m.caption || '';
          md.msg = 'Mídia salva.';
          md.err = false;
        } catch (e) { md.msg = `Não consegui salvar: ${e.message}`; md.err = true; }
        renderMidias();
      }), fbtn('bbtn', 'Cancelar', () => { md.edit = null; renderMidias(); }));
      sec.append(a);
    } else {
      if (m.type !== 'audio') {
        const c = el('textarea', 'ed-caption');
        c.maxLength = 4096;
        c.rows = 3;
        c.value = md.caption;
        c.placeholder = 'Legenda (opcional; {nome} vira o primeiro nome)';
        c.setAttribute('aria-label', 'Legenda do envio');
        c.addEventListener('input', () => { md.caption = c.value; });
        sec.append(schedField('Legenda do envio (só desta vez)', c));
      } else sec.append(el('div', 'crm-intro', 'Áudio .ogg vai como mensagem de voz; outros formatos vão como arquivo de áudio.'));
      const a = el('div', 'ed-add');
      const send = fbtn('bbtn primary', md.busy ? 'Enviando…' : 'Enviar nesta conversa', () => sendMediaHere(m));
      send.disabled = md.busy;
      a.append(send, fbtn('bbtn', 'Editar', () => { md.edit = { title: m.title, caption: m.caption || '', folderId: m.folder_id || '' }; md.usage = null; md.confirmDel = false; renderMidias(); }),
        fbtn('bbtn', md.confirmDel ? 'Confirmar: apagar' : 'Apagar', () => deleteMediaClick(m)));
      sec.append(a);
      if (md.usage && md.usage.inUse) {
        const u = el('div', 'fw-test');
        u.append(el('div', 'ed-note', 'Em uso: não dá para apagar. Tire o arquivo destes lugares antes:'));
        if (md.usage.items.length) u.append(el('div', null, `Mensagens rápidas: ${md.usage.items.join(', ')}`));
        if (md.usage.campaigns.length) u.append(el('div', null, `Disparos: ${md.usage.campaigns.join(', ')}`));
        if (md.usage.automations.length) u.append(el('div', null, `Automações: ${md.usage.automations.join(', ')}`));
        sec.append(u);
      }
    }
    if (md.msg) sec.append(el('div', `ed-msg${md.err ? ' err' : ''}`, md.msg));
    sec.append(fbtn('bbtn', 'Voltar', () => { md.sel = null; md.msg = ''; md.usage = null; renderMidias(); }));
    mtabEl.append(sec);
  }

  // Envio manual na conversa aberta: imediato (como a seta das mensagens rápidas), pelo mesmo caminho seguro
  async function sendMediaHere(m) {
    if (md.busy) return;
    if (state.busyId || seq) { toast('Já tem um envio em andamento. Espere terminar ou clique em Parar.', 'warn', 5000); return; }
    const st = await waStatusForSend();
    if (!st || !st.ready) { toast('O WhatsApp ainda não está pronto para enviar. Tente de novo em instantes.', 'warn', 6000); return; }
    const chatId = await openIndividualChat();
    if (!chatId) return;
    const ctx = getContext();
    state.ctx = ctx;
    const part = {
      id: `midia:${m.id}`, type: m.type, body: m.type === 'audio' ? '' : md.caption, file_url: m.file_url, file_name: m.file_name, file_size: m.file_size,
      wait_seconds: 0, typing_seconds: m.type === 'audio' ? null : 0, // áudio: "gravando…" automático pela duração
    };
    md.busy = true;
    md.msg = '';
    renderMidias();
    try {
      const res = await runSequence({ parts: [part], chatId, firstName: ctx.firstName });
      sequenceToast(res, 1);
      if (res.status === 'ok') {
        try { m.usage_count = await call('incrementMediaUsage', { id: m.id }); } catch { /* contador */ }
      }
    } finally {
      md.busy = false;
      renderMidias();
    }
  }

  async function deleteMediaClick(m) {
    md.msg = '';
    if (!md.confirmDel) {
      try { md.usage = await call('mediaUsage', { id: m.id }); } catch (e) { md.msg = `Não consegui conferir o uso: ${e.message}`; md.err = true; renderMidias(); return; }
      if (md.usage.inUse) { renderMidias(); return; }
      md.confirmDel = true;
      renderMidias();
      return;
    }
    md.confirmDel = false;
    try {
      const r = await call('deleteMedia', { id: m.id });
      if (!r.deleted) { md.usage = r.usage; renderMidias(); return; }
      md.sel = null;
      md.msg = `"${m.title}" apagada.`;
      md.err = false;
    } catch (e) { md.msg = `Não consegui apagar: ${e.message}`; md.err = true; }
    await loadMedia({ quiet: true });
  }

  async function importMedia() {
    if (md.importing) return;
    md.importing = true;
    renderMidias();
    try {
      const r = await call('importMediaFromItems');
      md.msg = r.added ? `${r.added} mídia${r.added === 1 ? '' : 's'} importada${r.added === 1 ? '' : 's'} das mensagens rápidas (sem subir de novo).` : 'Nada novo para importar: as mídias das mensagens rápidas já estão na biblioteca.';
      md.err = false;
    } catch (e) { md.msg = `Não consegui importar: ${e.message}`; md.err = true; }
    md.importing = false;
    await loadMedia({ quiet: true });
  }

  // Editor de partes (2.7.1): grade da biblioteca só com o tipo da parte, busca e pasta; passar o mouse mostra
  // uma prévia maior; áudio tem ▶ para ouvir antes de escolher.
  const pickAudio = { a: null, id: null, btn: null };
  function stopPickAudio() {
    if (pickAudio.a) { try { pickAudio.a.pause(); } catch { /* já parado */ } }
    if (pickAudio.btn) { pickAudio.btn.textContent = '▶'; pickAudio.btn.setAttribute('aria-label', pickAudio.btn.dataset.listen || 'Ouvir'); }
    Object.assign(pickAudio, { a: null, id: null, btn: null });
  }
  async function togglePickAudio(m, btn) {
    if (pickAudio.id === m.id) { stopPickAudio(); return; }
    stopPickAudio();
    Object.assign(pickAudio, { id: m.id, btn });
    btn.textContent = '⏸';
    btn.setAttribute('aria-label', `Parar ${m.title}`);
    try {
      const url = await getBlobUrl(mdFileItem(m));
      if (pickAudio.id !== m.id) return;
      const au = document.createElement('audio');
      au.src = url;
      au.addEventListener('ended', () => { if (pickAudio.a === au) stopPickAudio(); });
      pickAudio.a = au;
      await au.play();
    } catch { if (pickAudio.id === m.id) stopPickAudio(); }
  }

  const MD_PICK_MAX = 120;
  function mediaPicker(p, i, ctx) {
    stopPickAudio();
    const box = el('div', 'fw-test md-pick');
    if (!md.loaded) { box.append(el('div', 'lt-none', 'Carregando a biblioteca…')); return box; }
    if (md.error) { box.append(el('div', 'ed-note', md.error === DB_MISSING ? 'Atualize o banco para usar a biblioteca de mídias.' : md.error)); return box; }
    const q = el('input', 'ed-title');
    q.type = 'search';
    q.value = p.pickQ || '';
    q.placeholder = 'Buscar na biblioteca';
    q.setAttribute('aria-label', `Buscar na biblioteca (parte ${i + 1})`);
    const fsel = el('select', 'ed-title');
    fsel.setAttribute('aria-label', `Pasta da biblioteca (parte ${i + 1})`);
    [['todas', 'Todas as pastas'], ['sem', 'Sem pasta'], ...md.folders.map((f) => [f.id, f.name])].forEach(([v, t]) => {
      const o = el('option', null, t);
      o.value = v;
      o.selected = v === (p.pickFolder || 'todas');
      fsel.append(o);
    });
    const bar = el('div', 'md-pbar');
    bar.append(q, fsel);
    const grid = el('div', 'md-grid');
    const hov = el('div', 'md-hov');
    hov.hidden = true;
    const showHov = (m, card) => {
      hov.textContent = '';
      hov.append(mdThumb(m, { big: true, eager: true, load: m.type === 'imagem' || m.type === 'video' }),
        el('span', 'md-name', m.title),
        el('span', 'md-size', `${MD_TYPE_LABEL[m.type]}${m.file_size != null ? ` · ${formatSize(m.file_size)}` : ''}${mediaDur.has(m.file_url) ? ` · ${fmtDur(mediaDur.get(m.file_url))}` : ''}`));
      const g = grid.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      hov.classList.toggle('left', c.left + c.width / 2 > g.left + g.width / 2);
      hov.hidden = false;
    };
    const hideHov = () => { hov.hidden = true; hov.textContent = ''; };
    const fill = () => {
      grid.textContent = '';
      hideHov();
      const folder = p.pickFolder || 'todas';
      const items = md.media.filter((m) => (p.type === 'album' ? (m.type === 'imagem' || m.type === 'video') : m.type === p.type)
        && (folder === 'todas' || (folder === 'sem' ? !m.folder_id : m.folder_id === folder))
        && (!p.pickQ || mdNorm(m.title).includes(mdNorm(p.pickQ))));
      if (!items.length) {
        grid.append(el('div', 'lt-none', `Nenhum${p.type === 'imagem' ? 'a foto' : p.type === 'video' ? ' vídeo' : p.type === 'audio' ? ' áudio' : ' PDF'} na biblioteca${folder !== 'todas' || p.pickQ ? ' com esse filtro' : ''}.`));
        return;
      }
      items.slice(0, MD_PICK_MAX).forEach((m) => {
        const card = el('div', 'md-pcard');
        const choose = el('button', 'md-choose');
        choose.type = 'button';
        choose.dataset.media = m.id;
        choose.title = m.title;
        choose.setAttribute('aria-label', `Escolher ${m.title}`);
        choose.append(mdThumb(m), el('span', 'md-name', m.title), el('span', 'md-size', m.file_size != null ? formatSize(m.file_size) : MD_TYPE_LABEL[m.type]));
        if (p.type === 'album') {
          // 2.8.7: marcar várias e confirmar
          const on = !!(p.pickSel && p.pickSel.includes(m.id));
          card.classList.toggle('sel', on);
          choose.setAttribute('aria-pressed', String(on));
          choose.addEventListener('click', () => {
            p.pickSel = p.pickSel || [];
            const k = p.pickSel.indexOf(m.id);
            if (k >= 0) p.pickSel.splice(k, 1);
            else if (p.files.length + p.pickSel.length >= ALBUM_MAX) { ctx.msg(`Parte ${i + 1}: até ${ALBUM_MAX} fotos/vídeos.`, true); return; }
            else p.pickSel.push(m.id);
            ctx.msg('');
            const now = p.pickSel.includes(m.id);
            card.classList.toggle('sel', now);
            choose.setAttribute('aria-pressed', String(now));
            const okBtn = box.querySelector('.alb-pickok');
            if (okBtn) { okBtn.textContent = `Adicionar ${p.pickSel.length}`; okBtn.disabled = !p.pickSel.length; }
          });
          card.addEventListener('mouseenter', () => showHov(m, card));
          card.addEventListener('mouseleave', hideHov);
          card.append(choose);
          grid.append(card);
          return;
        }
        choose.addEventListener('click', () => {
          stopPickAudio();
          if (p.localUrl) URL.revokeObjectURL(p.localUrl);
          Object.assign(p, { file: null, localUrl: null, file_url: m.file_url, file_name: m.file_name || m.title, file_size: m.file_size ?? null, picking: false, changing: false, fromLibrary: m.id });
          if (p.type !== 'audio' && !String(p.body || '').trim() && m.caption) p.body = m.caption;
          ctx.msg('');
          ctx.rerender();
        });
        card.addEventListener('mouseenter', () => showHov(m, card));
        card.addEventListener('mouseleave', hideHov);
        choose.addEventListener('focus', () => showHov(m, card));
        choose.addEventListener('blur', hideHov);
        card.append(choose);
        if (m.type === 'audio') {
          const listen = el('button', 'md-listen', '▶');
          listen.type = 'button';
          listen.dataset.listen = `Ouvir ${m.title}`;
          listen.setAttribute('aria-label', listen.dataset.listen);
          listen.addEventListener('click', () => togglePickAudio(m, listen));
          card.append(listen);
        }
        grid.append(card);
      });
      if (items.length > MD_PICK_MAX) grid.append(el('div', 'lt-none', `Mostrando ${MD_PICK_MAX} de ${items.length}. Use a busca ou a pasta.`));
    };
    q.addEventListener('input', () => { p.pickQ = q.value; fill(); });
    fsel.addEventListener('change', () => { p.pickFolder = fsel.value; fill(); });
    fill();
    box.append(bar, grid, hov);
    if (p.type === 'album') {
      const n = (p.pickSel || []).length;
      const okBtn = el('button', 'bbtn primary alb-pickok', `Adicionar ${n}`);
      okBtn.type = 'button';
      okBtn.disabled = !n;
      okBtn.addEventListener('click', () => {
        (p.pickSel || []).forEach((id) => {
          const m = md.media.find((x) => x.id === id);
          if (m && p.files.length < ALBUM_MAX) p.files.push({ kind: m.type === 'video' ? 'video' : 'imagem', file_url: m.file_url, file_name: m.file_name || m.title, file_size: m.file_size ?? null, file: null, localUrl: null });
          if (m && !String(p.body || '').trim() && m.caption) p.body = m.caption;
        });
        p.pickSel = [];
        p.picking = false;
        ctx.rerender();
      });
      box.append(okBtn);
    }
    return box;
  }

  // ── 📈 Conversões: compra para o Facebook (2.4.0) ───────────────────────
  // Separado do "💰 Venda". Só envia no clique em "Enviar compra"; o envio é feito pela Edge Function
  // meta-purchase-event (o token do Facebook nunca passa pela extensão; o telefone vai em hash).

  const ctabEl = shadow.querySelector('.ctab');
  const cv = { open: false, view: 'list', form: null, history: null, historyError: '', status: null, test: false, busy: false, msg: '', err: false, done: null, contactCfg: null, contactBusy: false, contactMsg: '', contactErr: false };
  try { chrome.storage.local.get(['metaTestMode'], (r) => { cv.test = !!(r && r.metaTestMode); }); } catch { /* extensão recarregada */ }

  shadow.querySelector('.conv-quick').addEventListener('click', () => { if (!state.open) setOpen(true); setSection('conversoes'); openConversionForm(); });
  // 2.5.0: 🔁 abre "Esta conversa nas automações" (seção Automações)
  shadow.querySelector('.auto-quick').addEventListener('click', () => { if (!state.open) setOpen(true); setSection('follows'); openChatAutomations(); });

  function syncConversoesActive() {
    const want = state.open && state.section === 'conversoes';
    cv.open = want;
    if (!want) return;
    if (cv.view === 'list') loadConversions();
    loadMetaStatus();
    loadContactCfg();
  }

  // ── 2.6.0: "Contato" automático ──
  async function loadContactCfg() {
    try { cv.contactCfg = await call('metaContactConfig'); } catch { cv.contactCfg = { on: false, since: null, test: false }; }
    ca.cfg = cv.contactCfg;
    ca.cfgAt = Date.now();
    if (cv.open && cv.view === 'list') renderConversoes();
  }

  async function saveContactCfg(next) {
    cv.contactBusy = true;
    cv.contactMsg = '';
    renderConversoes();
    try {
      cv.contactCfg = await call('setMetaContactConfig', next);
      ca.cfg = cv.contactCfg;
      ca.cfgAt = Date.now();
      cv.contactMsg = next.on ? 'Contato automático ligado.' : 'Contato automático desligado.';
      cv.contactErr = false;
    } catch (e) {
      cv.contactMsg = `Não consegui salvar: ${e.message}`;
      cv.contactErr = true;
    }
    cv.contactBusy = false;
    renderConversoes();
  }

  // Aba com a trava (chamado pelo motor a cada ciclo): pega da ponte os leads novos de anúncio (memória) e,
  // se o interruptor estiver ligado, manda 1 "Contato" por conversa, no máximo 1 a cada 10 s. Sem lead novo,
  // nenhuma consulta ao banco; o interruptor é relido no máximo a cada 5 min (e na hora em que é mudado aqui).
  const ca = { cfg: null, cfgAt: 0, lastSentAt: 0, sent: new Set(), queue: [], pendingDone: false, lastSkip: '' };
  const CONTACT_GAP_MS = 10 * 1000;
  async function contactAutoTick() {
    let got = null;
    try { got = await waRequest('adLeads', {}, { timeout: 4000 }); } catch { got = null; }
    const leads = got && Array.isArray(got.leads) ? got.leads : [];
    // 2.9.0: uma vez por abertura (depois da varredura dos anúncios das conversas carregadas): leads guardados que
    // ainda não têm Contato (chegaram com a extensão fechada ou a tentativa falhou) entram na fila, sem duplicar
    const pendingDue = !ca.pendingDone && at.scanned;
    if (!leads.length && !ca.queue.length && !pendingDue) return;
    if (!ca.cfg || Date.now() - ca.cfgAt >= 5 * 60 * 1000) {
      ca.cfgAt = Date.now();
      try { ca.cfg = await call('metaContactConfig'); } catch { /* fica com o que sabia */ }
    }
    const cfg = ca.cfg;
    if (pendingDue) ca.pendingDone = true;
    if (!cfg || !cfg.on || !cfg.since) { ca.queue = []; return; }
    const since = Date.parse(cfg.since);
    if (pendingDue) { try { leads.push(...await call('pendingContactLeads', { since: cfg.since })); } catch { /* próxima abertura */ } }
    leads.forEach((l) => {
      if (!l || !l.chatId || !(Number(l.t) * 1000 >= since)) return; // só leads que chegaram depois de ligar
      if (ca.sent.has(l.chatId) || ca.queue.some((q) => q.chatId === l.chatId)) return;
      ca.queue.push(l);
    });
    if (!ca.queue.length || Date.now() - ca.lastSentAt < CONTACT_GAP_MS) return;
    const l = ca.queue.shift();
    ca.lastSentAt = Date.now();
    ca.sent.add(l.chatId);
    // 2.6.3: telefone só o do WhatsApp para ESTA conversa (conferido); nome desta conversa
    // 2.9.0: o lead vem da ponte sem telefone: pega o desta conversa no WhatsApp (@c.us = os dígitos; @lid = o que
    // o WhatsApp diz). Antes, lead @lid sem código de clique ia sem telefone e o Facebook recusava (sem histórico).
    let phone = String(l.phone || '').replace(/\D/g, '');
    let name = l.name || '';
    if (!phone) { const pn = await chatPhoneName(l.chatId); phone = pn.phone || ''; if (!name) name = pn.name || ''; }
    const ad = l.ad || {};
    if (!phone && !ad.ctwaClid) { ca.lastSkip = 'lead sem telefone e sem código de clique'; return; }
    if (phone && (await phoneLock(l.chatId, phone, { requireActive: false }))) { ca.lastSkip = 'telefone não confere com a conversa'; return; } // não bate: não envia
    try {
      await call('sendContactEvent', { event: {
        chat_id: l.chatId, phone, contact_name: name || null, event_time: Math.floor(Number(l.t)), test: !!cfg.test,
        ad: { title: ad.title, source_id: ad.sourceId, source_app: ad.platform || ad.sourceApp, conversion_source: ad.conversionSource, ctwa_clid: ad.ctwaClid || null },
      } });
      ca.lastSkip = '';
    } catch (e) { ca.lastSkip = `falhou: ${e.message}`; /* não tenta de novo nesta aba; na próxima abertura entra de novo (sem duplicar) */ }
    if (cv.open && cv.view === 'list') loadConversions();
  }

  async function loadMetaStatus() {
    try { cv.status = await call('metaStatus'); } catch { cv.status = { published: null }; }
    if (cv.open) renderConversoes();
    if (state.view === 'diag') renderDiag();
  }

  async function loadConversions() {
    try { cv.history = await call('fetchConversions', { limit: 50 }); cv.historyError = ''; } catch (e) { cv.history = []; cv.historyError = e.message; }
    renderConversoes();
    // 2.9.0: selo "💰 compra enviada" e diagnóstico (só números)
    const ids = [...new Set((cv.history || []).map((h) => h.chat_id).filter(Boolean))];
    if (ids.length) { try { cv.bought = new Set(await call('purchasedChats', { chatIds: ids })); } catch { cv.bought = null; } }
    const day = new Date(); day.setHours(0, 0, 0, 0);
    try { cv.stats = await call('conversionStats', { since: day.toISOString() }); } catch { cv.stats = null; }
    if (cv.open && cv.view === 'list') renderConversoes();
  }

  const nowLocalInput = () => { const d = new Date(); d.setSeconds(0, 0); return `${dateInput(d)}T${timeInput(d)}`; };

  async function openConversionForm() {
    cv.view = 'form';
    cv.msg = '';
    cv.err = false;
    cv.done = null;
    const ctx = getContext();
    state.ctx = ctx;
    let chat = null;
    try { chat = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { chat = null; }
    const chatId = chat && chat.kind === 'individual' ? chat.chatId : null;
    // 2.6.3: nada da tela (cabeçalho/CRM do contato da tela): só desta conversa (chatId da WA-JS)
    const phone = chatId && /^\d+@c\.us$/.test(chatId) ? chatId.split('@')[0] : '';
    adoptChat(chat, 'cv');
    cv.form = {
      chatId, phone, name: '',
      value: '', when: nowLocalInput(), description: '', ad: null, adLoaded: false, recent: null, askAgain: false, eventId: crypto.randomUUID(),
    };
    renderConversoes();
    if (!chatId) return;
    const f = cv.form;
    const [saved, recent, last, pn] = await Promise.all([
      call('getAdAttribution', { chatId }).catch(() => null),
      call('recentConversion', { chatId }).catch(() => null),
      call('lastChatSaleValue', { chatId, phone }).catch(() => null),
      chatPhoneName(chatId),
    ]);
    if (cv.form !== f) return;
    if (!f.phone && pn.phone) f.phone = pn.phone;
    if (!f.name && pn.name) f.name = pn.name;
    f.phoneChecked = true;
    f.recent = recent && recent.exists ? recent : null;
    loadChatHistory(f);
    if (last && last.value && !f.value) f.value = String(last.value.toFixed(2));
    // 2.6.2: o anúncio vem primeiro do banco; senão das mensagens carregadas; senão das antigas (pode demorar)
    let ad = saved && saved.row ? adFromAttribution(saved.row) : null;
    if (!ad) {
      renderConversoes();
      const found = await waRequest('adContext', { chatId, deep: true }, { timeout: 60000 }).catch(() => null);
      if (cv.form !== f) return;
      if (found && found.found) {
        ad = found;
        call('saveAdAttributions', { items: [{ chatId, t: found.firstMessageAt, phone: f.phone || null, name: f.name || null,
          ad: { title: found.title, sourceId: found.sourceId, sourceApp: found.platform || found.sourceApp, sourceUrl: found.sourceUrl, conversionSource: found.conversionSource, ctwaClid: found.ctwaClid } }] }).catch(() => {});
      } else f.adSearch = found && found.deep ? found.deep : null;
    }
    f.ad = ad;
    f.adLoaded = true;
    renderConversoes();
  }

  // 2.9.0: "Já enviado nesta conversa"
  async function loadChatHistory(f) {
    let rows = null;
    try { rows = await call('chatConversions', { chatId: f.chatId }); } catch { rows = []; }
    if (cv.form !== f) return;
    f.history = rows;
    renderConversoes();
  }
  const dmHm = (iso) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  // Linha salva em wa_ad_attribution → o mesmo formato do anúncio lido da conversa
  function adFromAttribution(r) {
    const app = String(r.source_app || '').toLowerCase();
    const clid = r.ctwa_clid || null;
    return {
      found: true, origin: 'salvo no banco', title: r.ad_title || null, description: null, sourceUrl: r.source_url || null, sourceId: r.ad_id || null,
      sourceType: null, sourceApp: r.source_app || null, conversionSource: r.conversion_source || null, mediaType: null,
      platform: /insta/.test(app) ? 'Instagram' : /face|fb/.test(app) ? 'Facebook' : null, conversionData: null, ctwaClid: clid,
      clidInfo: clid ? { field: 'salvo no banco', path: '-', length: clid.length, mask: `${clid.slice(0, 6)}…${clid.slice(-4)}` } : null, clidCandidates: [], keys: [],
      firstMessageAt: r.first_message_at ? Math.floor(Date.parse(r.first_message_at) / 1000) : null,
    };
  }

  // 2.6.2: aba com a trava: grava o anúncio de cada lead que chega (sempre) e, uma vez por abertura do
  // WhatsApp, o das conversas já carregadas. Sem lead novo, nenhuma consulta ao banco.
  const at = { scanned: false, off: false };
  async function adAttributionTick() {
    if (at.off) return;
    let got = null;
    try { got = await waRequest('adAttributions', { scan: !at.scanned }, { timeout: 15000 }); } catch { got = null; }
    if (!got) return;
    if (got.scanned) at.scanned = true;
    const items = Array.isArray(got.items) ? got.items : [];
    if (!items.length) return;
    try { await call('saveAdAttributions', { items }); } catch (e) {
      if (e.message === 'Atualize o banco para usar este recurso') at.off = true; // sem a tabela: para até recarregar
    }
  }

  // Onde o código de clique foi achado — nunca o valor inteiro (6 primeiros + 4 últimos)
  const clidWhere = (c) => `${c.field}${c.path && c.path !== '-' ? `, campo protobuf ${c.path}` : ''}, tamanho ${c.length}, ${c.mask}`;

  function techDetails(ad, search = null) {
    const d = el('details', 'cv-tech');
    d.append(el('summary', null, 'Detalhes técnicos do anúncio'));
    const lines = ad ? [
      ['origem do anúncio', ad.origin || 'mensagens carregadas'],
      ['título', ad.title], ['descrição', ad.description], ['sourceUrl', ad.sourceUrl], ['sourceId (id do anúncio)', ad.sourceId], ['sourceType', ad.sourceType],
      ['sourceApp', ad.sourceApp], ['conversionSource', ad.conversionSource], ['mediaType', ad.mediaType],
      ['conversionData', ad.conversionData ? `${ad.conversionData.type}${ad.conversionData.size != null ? `, tamanho ${ad.conversionData.size}` : ''}${ad.conversionData.keys && ad.conversionData.keys.length ? `, chaves: ${ad.conversionData.keys.join(', ')}` : ''}${ad.conversionData.looksLikeClid ? ', parece ter identificador de clique' : ''}` : 'não tem'],
      ['ctwa_clid', ad.clidInfo ? `encontrado em ${clidWhere(ad.clidInfo)}` : ad.ctwaClid ? 'encontrado' : 'não encontrado'],
      ...((ad.clidCandidates || []).length > 1 ? [['outros candidatos', ad.clidCandidates.slice(1).map(clidWhere).join(' | ')]] : []),
      ['campos do ctwaContext', (ad.keys || []).join(', ')],
    ] : [['anúncio', 'nenhum ctwaContext nas mensagens carregadas'],
      ...(search ? [['mensagens antigas', `procurei ${search.scanned} mensagens; parei: ${search.stop}`]] : [])];
    lines.forEach(([k, v]) => d.append(el('div', null, `${k}: ${v == null || v === '' ? '—' : v}`)));
    return d;
  }

  function renderConversionForm() {
    const f = cv.form;
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'COMPRA PARA O FACEBOOK'));
    if (!f.chatId) { sec.append(el('div', 'ed-note', 'Abra uma conversa individual no WhatsApp.')); ctabEl.append(sec); return; }
    // 2.9.0: o que já foi enviado para ESTA conversa
    const hist = el('div', 'fw-test cv-chathist');
    hist.append(el('div', 'fw-k', 'JÁ ENVIADO NESTA CONVERSA'));
    if (!f.history) hist.append(el('div', 'lt-none loading', 'Carregando…'));
    else if (!f.history.length) hist.append(el('div', 'sc-prev', 'Nenhuma compra enviada nesta conversa'));
    else f.history.forEach((h) => hist.append(el('div', `sc-prev cv-hrow st-${h.status === 'enviado' ? 'enviada' : 'falhou'}`,
      `${dmHm(h.created_at)} · ${h.event_name === 'Contact' ? 'Contato' : `Compra ${TS.money(h.value)}`} · ${h.test ? 'teste' : 'real'} · ${h.status}`)));
    sec.append(hist);
    const adBox = el('div', 'fw-test');
    if (!f.adLoaded) adBox.append(el('div', null, 'Procurando o anúncio da conversa (pode levar alguns segundos em conversas longas)…'));
    else if (f.ad) adBox.append(el('div', null, `Anúncio: ${f.ad.title || '(sem título)'}${f.ad.sourceId ? ` · id ${f.ad.sourceId}` : ''}${f.ad.platform ? ` · ${f.ad.platform}` : ''}`));
    else adBox.append(el('div', null, 'Não achei anúncio nesta conversa (será enviado só com o telefone).'));
    sec.append(adBox);
    if (f.adLoaded) sec.append(techDetails(f.ad, f.adSearch || null));
    const r1 = el('div', 'sc-row');
    r1.append(inputField('Cliente', f.name, (v) => { f.name = v; }, { max: 100, aria: 'Nome do cliente' }), inputField('Telefone', f.phone, (v) => { f.phone = v; }, { max: 20, aria: 'Telefone do cliente', need: !!f.phoneChecked && !f.phone }));
    sec.append(r1);
    if (f.phoneChecked && !f.phone) sec.append(el('div', 'ed-note', 'Não achei o telefone desta conversa: preencha o campo.'));
    const val = el('input', 'ed-title');
    val.type = 'number';
    val.step = '0.01';
    val.min = '0.01';
    val.value = f.value;
    val.setAttribute('aria-label', 'Valor da compra');
    val.addEventListener('input', () => { f.value = val.value; });
    const when = el('input', 'ed-title');
    when.type = 'datetime-local';
    when.value = f.when;
    when.setAttribute('aria-label', 'Data e hora da compra');
    when.addEventListener('input', () => { f.when = when.value; });
    const r2 = el('div', 'sc-row');
    r2.append(schedField('Valor (R$)', val), schedField('Data e hora da compra', when));
    sec.append(r2, inputField('Descrição / produto (opcional)', f.description, (v) => { f.description = v; }, { max: 200, aria: 'Descrição da compra' }));
    if (cv.test) sec.append(el('div', 'ed-note', 'Modo teste ligado: o evento aparece em "Testar eventos" no Gerenciador de Eventos.'));
    if (f.recent && f.askAgain) {
      // 2.9.0: trava contra compra duplicada (só compras REAIS dos últimos 7 dias contam)
      const box = el('div', 'fw-test cv-dup');
      box.setAttribute('role', 'alert');
      box.append(el('div', 'ed-note', `Já foi enviada uma compra de ${TS.money(f.recent.value)} em ${dmHm(f.recent.at)}. É uma compra NOVA (outro pedido)?`),
        fbtn('bbtn primary', 'Sim, é outra compra', () => sendPurchase(true)), fbtn('bbtn', 'Cancelar', () => { f.askAgain = false; renderConversoes(); }));
      sec.append(box);
    }
    const actions = el('div', 'ed-add');
    const go = fbtn('bbtn primary', cv.busy ? 'Enviando…' : f.recent ? 'Enviar outra compra' : 'Enviar compra', () => sendPurchase(false));
    go.disabled = cv.busy;
    actions.append(go, fbtn('bbtn', 'Voltar', () => { cv.view = 'list'; loadConversions(); }));
    sec.append(actions, el('div', `ed-msg${cv.err ? ' err' : ''}`, cv.msg));
    ctabEl.append(sec);
  }

  async function sendPurchase(confirmed) {
    const f = cv.form;
    if (!f || cv.busy) return;
    const value = Number(String(f.value).replace(',', '.'));
    const whenMs = Date.parse(f.when);
    const fail = (m) => { cv.msg = m; cv.err = true; renderConversoes(); };
    if (!Number.isFinite(value) || value <= 0 || value > 100000) return fail('Informe o valor (maior que 0 e até 100.000).');
    if (!Number.isFinite(whenMs)) return fail('Data e hora inválidas.');
    if (whenMs > Date.now() + 60000) return fail('A data da compra não pode ser no futuro.');
    if (whenMs < Date.now() - 7 * 86400000) return fail('O Facebook só aceita compras dos últimos 7 dias.');
    if (f.recent && !confirmed) { f.askAgain = true; renderConversoes(); return; }
    cv.busy = true;
    cv.msg = '';
    renderConversoes();
    // 2.6.3: trava: o telefone tem que ser desta conversa (e a conversa ainda a aberta)
    const lock = await phoneLock(f.chatId, f.phone);
    if (lock || cv.form !== f) { cv.busy = false; if (cv.form === f) { cv.msg = lock; cv.err = true; } renderConversoes(); return; }
    try {
      const r = await call('sendPurchaseEvent', { event: {
        event_id: f.eventId, chat_id: f.chatId, phone: f.phone, contact_name: f.name, value, event_time: Math.floor(whenMs / 1000),
        description: f.description, test: cv.test,
        ad: f.ad ? { title: f.ad.title, source_id: f.ad.sourceId, source_app: f.ad.platform || f.ad.sourceApp, conversion_source: f.ad.conversionSource || null, ctwa_clid: f.ad.ctwaClid || null } : null,
      } });
      if (cv.form === f) { cv.done = { ...r, value }; cv.view = 'done'; }
    } catch (e) {
      if (cv.form === f) { cv.msg = e.message; cv.err = true; }
    }
    cv.busy = false;
    renderConversoes();
  }

  function renderConversoes() {
    if (!ctabEl) return;
    ctabEl.textContent = '';
    ctabEl.append(el('div', 'crm-intro', 'Manda o evento de compra (Purchase) para o Conjunto de dados do Facebook, com o anúncio de onde o cliente veio e o código de clique quando o WhatsApp tiver. Separado do 💰 Venda (que lança no ERP). Opcional: "Contato" automático para leads novos de anúncio.'));
    if (cv.view === 'form' && cv.form) { renderConversionForm(); return; }
    if (cv.view === 'done' && cv.done) {
      const sec = el('section', 'crmsec');
      sec.append(el('div', 'fw-test', cv.done.duplicate ? 'Esse evento já tinha sido enviado (não mandei de novo).' : `Enviado ✓ (o Facebook recebeu ${cv.done.events_received} evento${cv.done.events_received === 1 ? '' : 's'})${cv.done.test ? ' · modo teste' : ''}`));
      sec.append(fbtn('bbtn', 'Voltar', () => { cv.view = 'list'; loadConversions(); }));
      ctabEl.append(sec);
      return;
    }
    const top = el('div', 'ed-add');
    top.append(fbtn('bbtn primary', '📈 Compra desta conversa', () => openConversionForm()));
    const tl = el('label', 'sc-radio');
    const tc = el('input');
    tc.type = 'checkbox';
    tc.checked = cv.test;
    tc.addEventListener('change', () => { cv.test = tc.checked; storageSet({ metaTestMode: cv.test }); });
    tl.append(tc, 'Modo teste');
    top.append(tl);
    ctabEl.append(top);
    ctabEl.append(el('div', 'ed-note', 'Se o Tintim ainda estiver ativo, não envie a mesma compra pelos dois (o Facebook conta duas vezes). Use o modo teste até desligar o Tintim.'));
    // 2.6.0: "Contato" automático (vale para todos os computadores; a aba que executa os envios manda)
    const auto = el('section', 'crmsec');
    auto.append(el('div', 'wt-head', 'CONTATO AUTOMÁTICO'));
    const cc = cv.contactCfg;
    if (!cc) auto.append(el('div', 'lt-none loading', 'Carregando…'));
    else {
      const mk = (label, checked, onChange) => {
        const l = el('label', 'sc-radio');
        const i = el('input');
        i.type = 'checkbox';
        i.checked = checked;
        i.disabled = !!cv.contactBusy;
        i.addEventListener('change', () => onChange(i.checked));
        l.append(i, label);
        return l;
      };
      auto.append(mk('Enviar \'Contato\' ao Facebook quando um lead novo de anúncio chamar', cc.on, (v) => saveContactCfg({ on: v, test: cc.test })));
      auto.append(mk('Modo teste (só para o Contato)', cc.test, (v) => saveContactCfg({ on: cc.on, test: v })));
      auto.append(el('div', 'crm-intro', cc.on
        ? `Ligado${cc.since ? ` desde ${schedWhen(cc.since)}` : ''}: só conversas novas que chegarem de anúncio depois disso, uma vez por conversa (no máximo 1 a cada 10 s), pela aba que executa os envios.`
        : 'Desligado. Ao ligar, vale só para os leads que chegarem depois (nunca para conversas antigas).'));
      if (cv.contactMsg) auto.append(el('div', `ed-msg${cv.contactErr ? ' err' : ''}`, cv.contactMsg));
    }
    ctabEl.append(auto);
    // 2.9.0: diagnóstico (só números)
    const dg = el('section', 'crmsec cv-diag');
    dg.append(el('div', 'wt-head', 'DIAGNÓSTICO'));
    if (!cv.stats) dg.append(el('div', 'lt-none loading', 'Carregando…'));
    else {
      const hm2 = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
      dg.append(el('div', 'sc-prev', `Últimos leads de anúncio capturados: ${cv.stats.leadsToday} hoje${cv.stats.lastLeadAt ? ` · último às ${hm2(cv.stats.lastLeadAt)}` : ''}`),
        el('div', 'sc-prev', `Contatos enviados hoje: ${cv.stats.contactsToday}`));
      if (ca.lastSkip) dg.append(el('div', 'ed-note', `Último Contato não enviado: ${ca.lastSkip}`));
    }
    ctabEl.append(dg);
    const st = cv.status;
    if (st && st.published === false) ctabEl.append(el('div', 'ed-note', 'A função meta-purchase-event ainda não foi publicada no Supabase.'));
    else if (st && st.configured && !(st.configured.token && st.configured.dataset)) ctabEl.append(el('div', 'ed-note', 'Faltam os secrets META_ACCESS_TOKEN e META_DATASET_ID na Edge Function.'));
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'HISTÓRICO'));
    if (cv.historyError) sec.append(el('div', 'ed-note', cv.historyError === 'Atualize o banco para usar este recurso' ? 'Atualize o banco para usar este recurso (migration 20261103190000).' : cv.historyError));
    else if (!cv.history) sec.append(el('div', 'lt-none loading', 'Carregando…'));
    else if (!cv.history.length) sec.append(el('div', 'lt-none', 'Nenhum evento enviado ainda.'));
    (cv.history || []).forEach((h) => {
      const line = el('div', `sc-item st-${h.status === 'enviado' ? 'enviada' : 'falhou'}`);
      const main = el('div', 'sc-main');
      main.append(el('div', 'sc-who', `${h.contact_name || 'Cliente'} · ${h.event_name === 'Contact' ? 'Contato (lead de anúncio)' : TS.money(h.value)}`),
        el('div', 'sc-prev', `${h.ad_title ? `anúncio: ${h.ad_title}` : 'sem anúncio'} · ${h.method === 'business_messaging' ? 'WhatsApp (clique do anúncio)' : 'chat (telefone)'}${h.test ? ' · teste' : ''}${h.error ? ` · ${h.error}` : ''}`));
      const side = el('div', 'sc-side');
      side.append(el('span', 'sc-when', schedWhen(h.created_at)), el('span', 'sc-status', h.status));
      if (cv.bought && h.chat_id && cv.bought.has(h.chat_id)) main.append(el('span', 'cv-bought', '💰 compra enviada'));
      line.append(main, side);
      sec.append(line);
    });
    ctabEl.append(sec);
  }

  // Diagnóstico: só sim/não (sem valores dos secrets)
  function conversionDiagRow() {
    const st = cv.status;
    if (!st) return { label: 'Conversões Facebook', status: 'warn', screen: 'testando...' };
    if (st.published === false) return { label: 'Conversões Facebook', status: 'warn', screen: 'função não publicada' };
    if (st.published == null) return { label: 'Conversões Facebook', status: 'warn', screen: 'não consegui conferir' };
    if (st.loggedIn === false) return { label: 'Conversões Facebook', status: 'warn', screen: 'função publicada; entre com a conta para conferir os secrets' };
    const c = st.configured || {};
    if (c.token && c.dataset) return { label: 'Conversões Facebook', status: 'ok', screen: `função publicada; secrets ok${c.waba ? ' (com WABA)' : ''}${c.test_code ? ' (com código de teste)' : ''}` };
    return { label: 'Conversões Facebook', status: 'warn', screen: 'função publicada; faltam secrets' };
  }

  // Diagnóstico: só estados (sem nomes nem números)
  function engineDiagRows() {
    const m = motor.state;
    const motorRow = m.available === null
      ? { label: 'Motor de envios', status: 'warn', screen: 'testando...' }
      : m.available === false
        ? { label: 'Motor de envios', status: 'warn', screen: 'sem o banco atualizado (só agendamentos, como na 1.9.0)' }
        : { label: 'Motor de envios', status: m.role === 'este' || m.role === 'outro' ? 'ok' : 'warn', screen: engineRoleText() };
    let flowsRow;
    if (m.available === null) flowsRow = { label: 'Follows e Disparos', status: 'warn', screen: 'testando...' };
    else if (m.available === false) flowsRow = { label: 'Follows e Disparos', status: 'warn', screen: 'falta atualizar o banco (migrations 20261103130000 e 20261103140000)' };
    else if (m.campaignsAvailable === false) flowsRow = { label: 'Follows e Disparos', status: 'warn', screen: 'follows ok; disparos: falta atualizar o banco (migration 20261103140000)' };
    else flowsRow = { label: 'Follows e Disparos', status: 'ok', screen: 'ok' };
    const autoRow = m.available === null ? { label: 'Automações', status: 'warn', screen: 'testando...' }
      : m.automationsAvailable === true ? { label: 'Automações', status: 'ok', screen: 'ok' }
        : { label: 'Automações', status: 'warn', screen: 'falta atualizar o banco (migration 20261103150000)' };
    // 2.3.0: venda pela conversa (colunas de origem da venda)
    const saleRow = m.available === null ? { label: 'Vendas pela conversa', status: 'warn', screen: 'testando...' }
      : m.salesOrigin === true ? { label: 'Vendas pela conversa', status: 'ok', screen: 'ok' }
        : { label: 'Vendas pela conversa', status: 'warn', screen: 'falta atualizar o banco (migration 20261103170000)' };
    return [motorRow, flowsRow, autoRow, saleRow, conversionDiagRow()];
  }

  // ── Diagnóstico (nunca inclui conteúdo de conversa) ────────────────────────

  function diagnostics() {
    const ctx = getContext();
    state.ctx = ctx;
    const chrome_ = (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || 'desconhecido';
    const libValue = state.loaded
      ? `${state.categories.length} categorias, ${state.items.length} itens (${state.source === 'servidor' ? 'do servidor' : 'do cache local'}, ${timeStr(state.syncedAt)})`
      : 'não carregada';

    let contact;
    if (!ctx.conv) contact = { status: 'warn', screen: 'sem conversa aberta', copy: 'sem conversa aberta' };
    else if (!ctx.fullName) contact = { status: 'fail', screen: 'não detectado', copy: 'não detectado' };
    else if (ctx.isNumber) contact = { status: 'warn', screen: `só número (${ctx.contact.via}): {nome} fica como está`, copy: `só número (${ctx.contact.via})` };
    else contact = { status: 'ok', screen: `"${ctx.fullName}" → {nome} = ${ctx.firstName} (${ctx.contact.via})`, copy: `detectado (${ctx.contact.via})` };

    const supabase = state.syncing ? { status: 'warn', v: 'testando...' }
      : state.lastSyncError ? { status: 'fail', v: `falhou: ${state.lastSyncError}` }
      : state.source === 'servidor' ? { status: 'ok', v: `ok (${timeStr(state.syncedAt)})` }
      : { status: 'warn', v: 'ainda não testada' };

    const rows = [
      { label: 'Extensão', status: 'ok', screen: `v${VERSION} · Chrome ${chrome_}` },
      { label: 'Biblioteca carregada', status: state.loaded ? 'ok' : 'fail', screen: libValue },
      { label: 'Conexão com o Supabase', status: supabase.status, screen: supabase.v },
      accountDiagRow(),
      { label: 'Conversa detectada', status: ctx.conv ? 'ok' : 'warn', screen: ctx.conv ? `sim (${ctx.conv.via})` : 'nenhuma conversa aberta' },
      { label: 'Caixa de mensagem', status: ctx.composer ? 'ok' : (ctx.conv ? 'fail' : 'warn'), screen: ctx.composer ? `encontrada (${ctx.composer.via})` : 'não encontrada' },
      { label: 'Nome do contato', status: contact.status, screen: contact.screen, copy: contact.copy },
      { label: 'Identificação da conversa', ...identityDiag(ctx) },
      {
        label: 'Etiquetas CRM',
        status: state.labelsLoaded ? (state.labelsError ? 'warn' : 'ok') : 'fail',
        screen: state.labelsLoaded
          ? `${state.labels.length}${crmHiddenText()} (${state.labelsSource === 'servidor' ? 'do servidor' : 'do cache local'}, ${timeStr(state.labelsSyncedAt)})${state.labelsError ? ` · última atualização falhou: ${state.labelsError}` : ''}`
          : `não carregadas${state.labelsError ? `: ${state.labelsError}` : ''}`,
      },
      schemaDiagRow(),
      partsDiagRow(),
      schedDiagRow(),
      ...engineDiagRows(),
      ...waDiagRows(),
      {
        label: 'Ponte do microfone carregada',
        status: state.bridgeOk ? 'ok' : state.bridgeOk === false ? 'fail' : 'warn',
        screen: state.bridgeOk ? 'sim' : state.bridgeOk === false ? 'não (áudios vão como arquivo; recarregue o WhatsApp com F5)' : 'testando...',
      },
      { label: 'Botão de gravar encontrado', ...micDiag(ctx) },
      {
        label: 'Etiquetas CRM: contadores carregados',
        status: lt.counts ? 'ok' : lt.countsError ? 'fail' : 'warn',
        screen: lt.counts
          ? `sim (${timeStr(lt.countsAt)})${lt.countsError ? ` · última atualização falhou: ${lt.countsError}` : ''}`
          : lt.countsError ? `não: ${lt.countsError}` : 'não (abra Etiquetas CRM)',
      },
      { label: 'Tema', status: 'ok', screen: `${THEME_PREFS[state.themePref].label} → ${appliedDark() ? 'escuro' : 'claro'} (WhatsApp ${whatsappIsDark() ? 'escuro' : 'claro'})` },
      { label: 'Página do WhatsApp', status: document.querySelector('#app') ? 'ok' : 'fail', screen: document.querySelector('#app') ? '#app encontrado' : '#app não encontrado' },
      { label: 'Painel na página', status: host.isConnected && layoutStyle.isConnected ? 'ok' : 'fail', screen: host.isConnected && layoutStyle.isConnected ? 'injetado' : 'faltando (será re-injetado)' },
    ];
    return rows;
  }

  // Conta (1.9.1): só conectada / não conectada; na tela, a dica do e-mail (2 letras + domínio)
  function accountDiagRow() {
    if (auth.connected === null) return { label: 'Conta', status: 'warn', screen: 'testando...' };
    if (!auth.connected) return { label: 'Conta', status: 'warn', screen: 'não conectada (entre pelo aviso no topo do painel)', copy: 'não conectada' };
    return { label: 'Conta', status: 'ok', screen: auth.emailHint ? `conectada (${auth.emailHint})` : 'conectada', copy: 'conectada' };
  }

  // Itens com várias partes (migration 20261031130000): só ok / falta atualizar
  function partsDiagRow() {
    if (state.partsAvailable === true) return { label: 'Itens com várias partes', status: 'ok', screen: 'ok' };
    if (state.partsAvailable === false) return { label: 'Itens com várias partes', status: 'warn', screen: 'falta atualizar o banco (migration 20261031130000)' };
    return { label: 'Itens com várias partes', status: 'warn', screen: 'testando...' };
  }

  // Agendamentos (migration 20261031140000): só ok / falta atualizar (sem textos nem números)
  function schedDiagRow() {
    if (sched.available === true) return { label: 'Agendamentos', status: 'ok', screen: 'ok' };
    if (sched.available === false) return { label: 'Agendamentos', status: 'warn', screen: 'falta atualizar o banco (migration 20261031140000)' };
    return { label: 'Agendamentos', status: 'warn', screen: 'testando...' };
  }

  // Etiquetas CRM: só quantidades (sem nomes)
  function crmHiddenText() {
    const n = state.labels.filter((l) => l.hidden).length;
    return n ? `, ${n} oculta${n === 1 ? '' : 's'}` : '';
  }

  // Colunas da migration 20261031120000 (hidden e notes)
  function schemaDiagRow() {
    const { hidden, notes } = state.schema;
    if (hidden === null || notes === null) return { label: 'Colunas novas do banco', status: 'warn', screen: 'testando...' };
    if (hidden && notes) return { label: 'Colunas novas do banco', status: 'ok', screen: 'ok' };
    const missing = [hidden ? null : 'hidden', notes ? null : 'notes'].filter(Boolean).join(' e ');
    return { label: 'Colunas novas do banco', status: 'warn', screen: `falta atualizar (${missing}): aplique a migration 20261031120000 no Supabase` };
  }

  // Biblioteca WA-JS: sem ids nem telefones (só sim/não, tipo de conversa e quantidade)
  function waDiagRows() {
    const st = state.waStatus;
    if (!st) {
      const tested = !!state.waStatusAt;
      return [
        { label: 'Biblioteca WA-JS carregada', status: tested ? 'fail' : 'warn', screen: tested ? 'não (recarregue o WhatsApp com F5)' : 'testando...' },
        { label: 'WhatsApp pronto para a biblioteca', status: 'warn', screen: 'não' },
        { label: 'Telemetria e servidores de terceiros da biblioteca desligados', status: 'warn', screen: 'biblioteca não carregada' },
        { label: 'Conversa aberta', status: 'warn', screen: 'não disponível' },
        { label: 'Etiquetas do WhatsApp Business', status: 'warn', screen: 'não disponível' },
        labelWriteDiagRow(null),
        barDiagRow(),
      ];
    }
    const privacyOk = st.telemetryOff === true && st.linkServersOff === true;
    const labels = st.labels || {};
    return [
      { label: 'Biblioteca WA-JS carregada', status: st.loaded ? 'ok' : 'fail', screen: st.loaded ? 'sim' : 'não' },
      { label: 'WhatsApp pronto para a biblioteca', status: st.ready ? 'ok' : 'warn', screen: st.ready ? 'sim' : 'não (os áudios usam a gravação simulada)' },
      {
        label: 'Telemetria e servidores de terceiros da biblioteca desligados',
        status: privacyOk ? 'ok' : 'fail',
        screen: privacyOk ? 'sim' : `não (telemetria ${st.telemetryOff ? 'desligada' : 'LIGADA'}, servidores de prévia ${st.linkServersOff ? 'desligados' : 'LIGADOS'})`,
      },
      { label: 'Conversa aberta', status: st.chat === 'individual' ? 'ok' : 'warn', screen: ['individual', 'grupo', 'nenhuma'].includes(st.chat) ? st.chat : 'nenhuma' },
      {
        label: 'Etiquetas do WhatsApp Business',
        status: labels.available ? 'ok' : 'warn',
        screen: labels.available && Number.isFinite(labels.count) ? `${labels.count} etiqueta${labels.count === 1 ? '' : 's'}` : 'não disponível',
      },
      labelWriteDiagRow(st.labelWrite),
      barDiagRow(),
    ];
  }

  // Trocar etiquetas nativas: só disponível/indisponível e o motivo (sem nomes)
  function labelWriteDiagRow(info) {
    if (info && info.available) return { label: 'Trocar etiquetas', status: 'ok', screen: 'disponível' };
    const why = info && info.reason === 'not_business' ? 'conta não Business' : 'biblioteca não pronta';
    return { label: 'Trocar etiquetas', status: 'warn', screen: `indisponível: ${why}` };
  }

  // Barra de etiquetas: só o estado (nunca nomes de etiquetas ou de clientes)
  function barDiagRow() {
    let active = false;
    try { active = barActive(); } catch { active = false; }
    if (active) return { label: 'Barra de etiquetas', status: 'ok', screen: 'ativa' };
    if (state.barHiddenByUser) return { label: 'Barra de etiquetas', status: 'warn', screen: 'oculta por você' };
    return { label: 'Barra de etiquetas', status: 'warn', screen: 'indisponível' };
  }

  function micDiag(ctx) {
    if (!ctx.conv || !ctx.composer) return { status: 'warn', screen: 'sem conversa aberta' };
    if (composerText(ctx.composer.el)) return { status: 'warn', screen: 'caixa com texto (o botão só aparece com a caixa vazia)', copy: 'caixa com texto' };
    return findConvButton(SEL.micButton, ctx.conv.root) ? { status: 'ok', screen: 'sim' } : { status: 'fail', screen: 'não' };
  }

  // Na tela pode mostrar o telefone; no texto copiado, só o tipo de identificação
  function identityDiag(ctx) {
    const id = ctx.identity;
    if (!ctx.conv || !id) return { status: 'warn', screen: 'sem conversa aberta' };
    if (id.kind === 'tel') return { status: 'ok', screen: `telefone ${id.phone} (${id.via})`, copy: `telefone (${id.via})` };
    if (id.kind === 'name') return { status: 'warn', screen: `só nome (${id.via})`, copy: `só nome (${id.via})` };
    if (id.kind === 'group') return { status: 'warn', screen: 'grupo (não recebe etiquetas)' };
    return { status: 'fail', screen: 'falhou' };
  }

  function diagnosticsText(rows) {
    const mark = { ok: 'OK  ', warn: 'AVISO', fail: 'FALHA' };
    const now = new Date().toLocaleString('pt-BR');
    return [
      `Diagnóstico - Triumph Store Mensagens (${now})`,
      ...rows.map((r) => `[${mark[r.status]}] ${r.label}: ${r.copy || r.screen}`),
    ].join('\n');
  }

  function renderDiag() {
    if (state.view !== 'diag') return;
    const rows = diagnostics();
    listEl.textContent = '';

    const head = el('div', 'diag-head');
    head.append(iconButton('back', 'Voltar para as mensagens', showList), 'Diagnóstico');
    const list = el('div', 'diag-list');
    rows.forEach((r) => {
      const row = el('div', 'diag-row');
      const ico = el('span', `diag-ico ${r.status}`);
      ico.innerHTML = svg(r.status === 'ok' ? 'check' : r.status === 'warn' ? 'alert' : 'x');
      const txt = el('div');
      txt.append(el('div', 'l', r.label), el('div', 'v', r.screen));
      row.append(ico, txt);
      list.append(row);
    });

    const actionsRow = el('div', 'diag-actions');
    const retest = el('button', 'btn');
    retest.type = 'button';
    retest.innerHTML = svg('refresh');
    retest.append('Testar de novo');
    retest.addEventListener('click', () => { renderDiag(); sync(); });
    const copy = el('button', 'btn primary');
    copy.type = 'button';
    copy.innerHTML = svg('copy');
    copy.append('Copiar diagnóstico');
    copy.addEventListener('click', async () => {
      const ok = await copyToClipboard(diagnosticsText(diagnostics()));
      toast(ok ? 'Diagnóstico copiado.' : 'Não foi possível copiar.', ok ? 'ok' : 'error', 2500);
    });
    actionsRow.append(retest, copy);
    if (auth.connected) {
      const out = el('button', 'btn');
      out.type = 'button';
      out.classList.add('auth-out');
      out.append('Sair');
      out.addEventListener('click', () => signOut());
      actionsRow.append(out);
    }

    listEl.append(head, list, actionsRow,
      el('div', 'diag-hint', 'O texto copiado não inclui nomes de contatos nem mensagens.'));
  }

  function showDiag() {
    closeEditorState();
    if (state.section !== 'mensagens') setSection('mensagens', { persist: false });
    state.view = 'diag';
    panel.classList.add('diag');
    diagBtn.classList.add('on');
    renderBanner();
    listEl.scrollTop = 0;
    renderDiag();
    sync();
    pingBridge().then(renderDiag);
    refreshWaStatus().then(renderDiag);
    loadSchema().then(renderDiag);
    refreshAuth();
    call('fetchSchedules').then((r) => { sched.available = !!(r && r.available); }, () => {}).then(renderDiag);
    motor.loadSettings().catch(() => {}).then(renderDiag); // 2.3.0: linhas do motor/automações/vendas sem esperar o 1º ciclo
    loadMetaStatus(); // 2.4.0: função publicada / secrets (só sim ou não)
  }

  function showList() {
    state.view = 'list';
    panel.classList.remove('diag');
    diagBtn.classList.remove('on');
    renderList();
  }

  // ── Barra-menu do topo + Quadro (WhatsApp | CRM) ──────────────────────────
  // Etiquetas do WhatsApp: lidas pelo wa-bridge.js (labels, labelChats, openChat). Trocar (setChatLabels)
  // só no clique/arraste/"Desfazer" do usuário, uma conversa por vez; nada em lote nem em timer.
  // Etiquetas do CRM: as nossas (Supabase), pelo background. Toda gravação vem de um clique.
  // Nomes, telefones e prévias ficam só na memória enquanto o Quadro está aberto:
  // nunca vão para chrome.storage, console ou Diagnóstico (prévias nunca vão para o Supabase).

  const BOARD_MAX_COLS = 6;
  const BOARD_PAGE = 50;
  const BAR_REFRESH_MS = 30 * 1000;
  const CRM_REFRESH_MS = 5 * 60 * 1000; // 2.4.1: etiquetas e contagens do CRM (era 1 min)
  const PREVIEW_ICON = { audio: '🎤', foto: '📷', video: '🎬', documento: '📄', figurinha: '😀', localizacao: '📍' };
  const PREVIEW_LABEL = { audio: 'Áudio', foto: 'Foto', video: 'Vídeo', documento: 'Documento', figurinha: 'Figurinha', localizacao: 'Localização', outro: 'Mensagem' };
  const FAMILY_NAME = { whatsapp: 'WhatsApp', crm: 'CRM' };

  const bar = { el: null, chips: null, btn: null, busy: false, lastAt: 0, crmAt: 0, crmBusy: false };
  const board = {
    open: false, columns: [], data: new Map(), saved: { whatsapp: null, crm: null }, menuOpen: false, opening: false,
    moving: new Set(), drag: null, moveMenu: null, toastTimer: null, // ids das conversas/contatos sendo trocados agora
  };
  const LABEL_FAIL_MSG = 'Não consegui trocar a etiqueta. Confira no WhatsApp.';
  const CRM_FAIL_MSG = 'Não consegui trocar a etiqueta CRM. Tente de novo.';
  const UNDO_MS = 8000;
  let boardEls = null;

  const waLabelById = (id) => (state.waLabels || []).find((l) => l.id === id) || null;
  const isCrm = () => state.family === 'crm';

  // Etiquetas da família, no formato do Quadro/barra: { id, name, hexColor, count }
  function familyLabels(family) {
    if (family === 'crm') {
      return state.labels.filter((l) => !l.hidden).map((l) => ({
        id: l.id, name: l.name, hexColor: l.color,
        count: lt.counts && Number.isFinite(lt.counts[l.id]) ? lt.counts[l.id] : null,
      }));
    }
    return state.waLabels || [];
  }
  const boardLabelById = (id) => familyLabels(state.family).find((l) => l.id === id) || null;
  const countText = (n) => (n == null ? '…' : String(n));

  function renderFamilyButtons() {
    shadow.querySelectorAll('.wfam button').forEach((b) => {
      const on = b.dataset.fam === state.family;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function renderBar() {
    if (!bar.el) return;
    const active = barActive();
    bar.el.hidden = !active;
    ensureInjected();
    renderFamilyButtons();
    if (bar.btn) {
      bar.btn.classList.toggle('on', active);
      bar.btn.title = 'Mostrar ou ocultar a barra do topo';
      bar.btn.setAttribute('aria-label', state.barHiddenByUser ? 'Mostrar a barra do topo' : 'Ocultar a barra do topo');
      bar.btn.setAttribute('aria-pressed', String(active));
    }
    renderPanelNav();
    if (!active) return;
    const scroll = bar.chips.scrollLeft;
    bar.chips.textContent = '';
    const labels = familyLabels(state.family);
    if (!labels.length) bar.chips.append(el('span', 'wempty', `Nenhuma etiqueta do ${FAMILY_NAME[state.family]}`));
    labels.forEach((l) => {
      const chip = el('button', `wchip${l.count === 0 ? ' zero' : ''}`);
      chip.type = 'button';
      chip.title = `Abrir o Quadro (${FAMILY_NAME[state.family]}) com "${l.name}"`;
      const dot = el('span', 'wdot');
      dot.style.background = l.hexColor;
      chip.append(dot, el('span', null, l.name.toUpperCase()), el('span', 'wcount', countText(l.count)));
      chip.addEventListener('click', () => openBoard(l.id));
      bar.chips.append(chip);
    });
    bar.chips.scrollLeft = scroll;
  }

  // Etiquetas do WhatsApp (leitura)
  async function refreshBar() {
    if (bar.busy) return;
    bar.busy = true;
    try {
      const labels = await waRequest('labels', {}, { timeout: 5000 });
      state.waLabels = Array.isArray(labels) ? labels : [];
    } catch (e) {
      // Biblioteca ausente ou WhatsApp ainda não pronto: sem etiquetas do WhatsApp
      if (e.code === 'not_ready' || e.code === 'timeout' || !Array.isArray(state.waLabels)) state.waLabels = null;
    } finally {
      bar.busy = false;
      bar.lastAt = Date.now();
      renderBar();
      if (board.open && !isCrm()) updateBoardCounts();
      renderWaTab();
      renderCopy();
    }
  }

  // Etiquetas do CRM e números (leitura)
  async function refreshCrmLabels() {
    if (bar.crmBusy) return;
    bar.crmBusy = true;
    bar.crmAt = Date.now();
    try {
      await syncLabels();
      await loadCounts();
    } finally {
      bar.crmBusy = false;
    }
  }

  // Números novos do CRM: barra, Quadro (modo CRM) e painel
  function onCrmCountsChanged() {
    renderBar();
    if (board.open && isCrm()) updateBoardCounts();
  }

  // WhatsApp: tenta a cada 5 s até ficar pronto, depois a cada 30 s. CRM: a cada 60 s. Só com a aba visível.
  function barTick() {
    if (document.visibilityState !== 'visible') return;
    if (state.barHiddenByUser && !board.open && !crm.open) return;
    const now = Date.now();
    if (!Array.isArray(state.waLabels) || now - bar.lastAt >= BAR_REFRESH_MS) refreshBar();
    // 2.4.1: contagens do CRM só com o painel (ou o Quadro) aberto
    if ((state.open || board.open) && now - bar.crmAt >= CRM_REFRESH_MS) refreshCrmLabels();
  }

  function setBarHidden(hidden) {
    state.barHiddenByUser = hidden;
    storageSet({ labelsBarHidden: hidden });
    renderBar();
    if (!hidden) barTick();
  }

  // Família da barra e do Quadro (lembrada no chrome.storage; só 'whatsapp' ou 'crm')
  function setFamily(family) {
    const f = family === 'crm' ? 'crm' : 'whatsapp';
    if (f === state.family) return;
    state.family = f;
    storageSet({ labelsFamily: f });
    renderBar();
    if (board.open) {
      closeMoveMenu();
      hideBoardToast();
      setColsMenu(false);
      board.columns = boardColumnIds();
      board.data = new Map();
      renderBoardHeader();
      renderBoardColumns();
      board.columns.forEach((id) => loadColumn(id, true));
    }
  }

  // ── Quadro ──

  function boardStatus(text) {
    if (boardEls) boardEls.status.textContent = text || '';
  }

  function renderBoardHeader() {
    boardEls.hint.textContent = isCrm()
      ? 'Etiquetas do CRM · clique num cartão para abrir a conversa · arraste para outra coluna para trocar a etiqueta CRM'
      : 'Clique num cartão para abrir a conversa · arraste para outra coluna para trocar a etiqueta';
  }

  function boardColumnIds(firstId) {
    const labels = familyLabels(state.family);
    const valid = new Set(labels.map((l) => l.id));
    let ids = (board.saved[state.family] || []).filter((id) => valid.has(id));
    if (!ids.length) ids = labels.filter((l) => l.count > 0).slice(0, 3).map((l) => l.id);
    if (!ids.length && isCrm()) ids = labels.slice(0, 3).map((l) => l.id);
    if (firstId && valid.has(firstId)) ids = [firstId, ...ids.filter((id) => id !== firstId)];
    return ids.slice(0, BOARD_MAX_COLS);
  }

  function openBoard(firstId) {
    if (!boardEls) return;
    board.open = true;
    board.columns = boardColumnIds(firstId);
    board.data = new Map();
    boardEls.root.hidden = false;
    boardStatus('');
    setColsMenu(false);
    renderBoardHeader();
    renderBoardColumns();
    board.columns.forEach((id) => loadColumn(id, true));
    renderBar();
    boardEls.root.focus();
  }

  // Fecha e apaga da memória as conversas carregadas
  function closeBoard() {
    if (!boardEls) return;
    board.open = false;
    board.data = new Map();
    board.drag = null;
    board.moveMenu = null;
    setColsMenu(false);
    hideBoardToast();
    boardEls.cols.textContent = '';
    boardEls.root.hidden = true;
    renderBar();
  }

  function columnEls(id) {
    const col = [...boardEls.cols.querySelectorAll('.bcol')].find((c) => c.dataset.id === id);
    return col ? { col, body: col.querySelector('.bbody'), count: col.querySelector('.wcount') } : null;
  }

  function renderBoardColumns() {
    boardEls.cols.textContent = '';
    const ids = board.columns.filter((id) => boardLabelById(id));
    if (!ids.length) {
      let msg = 'Nenhuma coluna escolhida. Use "Colunas" para escolher as etiquetas.';
      if (!familyLabels(state.family).length) {
        msg = isCrm() ? 'Nenhuma etiqueta do CRM. Crie na seção Etiquetas do painel.'
          : Array.isArray(state.waLabels) ? 'Nenhuma etiqueta do WhatsApp nesta conta.'
            : 'As etiquetas do WhatsApp ainda não estão prontas (só no WhatsApp Business).';
      }
      boardEls.cols.append(el('div', 'bempty', msg));
      return;
    }
    ids.forEach((id) => {
      const label = boardLabelById(id);
      const col = el('section', 'bcol');
      col.dataset.id = id;
      col.style.setProperty('--c', label.hexColor);
      const head = el('div', 'bhead');
      const dot = el('span', 'wdot');
      dot.style.background = label.hexColor;
      const name = el('span', 'bname', label.name.toUpperCase());
      name.title = label.name;
      head.append(dot, name, el('span', 'wcount', countText(label.count)));
      col.append(head, el('div', 'bbody'));
      addDropTarget(col, id);
      boardEls.cols.append(col);
      renderColumn(id);
    });
  }

  function updateBoardCounts() {
    if (!boardEls) return;
    boardEls.cols.querySelectorAll('.bcol').forEach((col) => {
      const label = boardLabelById(col.dataset.id);
      if (label) col.querySelector('.wcount').textContent = countText(label.count);
    });
  }

  async function loadColumn(id, reset) {
    const prev = board.data.get(id);
    const d = reset || !prev ? { cards: [], total: 0, loading: false, error: false, req: 0, family: state.family } : prev;
    const req = ++d.req;
    d.loading = true;
    d.error = false;
    board.data.set(id, d);
    renderColumn(id);
    const stale = () => !board.open || board.data.get(id) !== d || d.req !== req;
    try {
      if (d.family === 'crm') {
        const res = await call('fetchLabelClients', { labelId: id, offset: d.cards.length, limit: BOARD_PAGE });
        if (stale()) return;
        const got = Array.isArray(res && res.clients) ? res.clients : [];
        d.cards = d.cards.concat(got.filter((c) => !d.cards.some((x) => x.id === c.id)).map((c) => ({ ...c, crm: true })));
        d.total = d.cards.length + (res && res.hasMore ? 1 : 0);
      } else {
        const res = await waRequest('labelChats', { labelId: id, offset: d.cards.length, limit: BOARD_PAGE }, { timeout: 8000 });
        if (stale()) return;
        d.cards = d.cards.concat(Array.isArray(res && res.chats) ? res.chats : []);
        d.total = Number(res && res.total) || 0;
      }
    } catch {
      if (stale()) return;
      d.error = true;
    }
    d.loading = false;
    renderColumn(id);
  }

  function formatChatDate(t) {
    if (!t) return '';
    const d = new Date(t * 1000);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const two = (n) => String(n).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return `${two(d.getHours())}:${two(d.getMinutes())}`;
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
  }

  const isoSeconds = (iso) => {
    const ms = Date.parse(iso || '');
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  };

  function previewLine(c) {
    const p = c.preview || {};
    if (p.kind === 'nenhum') return '';
    const icon = PREVIEW_ICON[p.kind] || '';
    const text = p.text || (p.kind === 'texto' ? '' : PREVIEW_LABEL[p.kind] || '');
    if (!text && !icon) return '';
    return `${c.fromMe ? '✓ ' : ''}${icon ? `${icon} ` : ''}${text}`;
  }

  function boardCard(c, label) {
    const busy = board.moving.has(c.id);
    const card = el('div', `bcard${busy ? ' busy' : ''}`);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.style.setProperty('--c', label.hexColor);
    if (busy) card.setAttribute('aria-busy', 'true');
    const main = el('div', 'bmain');
    const side = el('div', 'bside');
    if (c.crm) {
      // Contato do CRM: nome, telefone, data em que entrou na etiqueta e 📝 se tiver nota
      const title = c.name || formatPhone(c.phone) || '—';
      const name = el('div', 'bcname', `${c.hasNote ? '📝 ' : ''}${title}`);
      name.title = c.hasNote ? `${title} (tem nota)` : title;
      main.append(name, el('div', 'bprev', c.phone ? (c.name ? formatPhone(c.phone) : '') : 'só pelo nome'));
      const date = el('span', 'bdate', formatChatDate(isoSeconds(c.addedAt)));
      date.title = 'Entrou nesta etiqueta CRM';
      side.append(date);
    } else {
      const name = el('div', 'bcname', c.name || '—');
      name.title = c.name || '';
      main.append(name, el('div', 'bprev', previewLine(c)));
      side.append(el('span', 'bdate', formatChatDate(c.t)));
      if (c.unread > 0) side.append(el('span', 'bunread', c.unread > 99 ? '99+' : String(c.unread)));
    }
    if (boardTargets(label.id).length) {
      const move = el('button', 'bmove', 'Mover para…');
      move.type = 'button';
      move.disabled = busy;
      move.title = c.crm ? 'Trocar a etiqueta CRM deste contato' : 'Trocar a etiqueta desta conversa';
      move.setAttribute('aria-haspopup', 'true');
      move.addEventListener('click', (e) => { e.stopPropagation(); toggleMoveMenu(card, c.id, label.id); });
      side.append(move);
    }
    card.append(main, side);
    const open = () => (c.crm ? openCrmCard(c) : openBoardChat(c.id));
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.target !== card) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    // Arrastar para outra coluna = trocar a etiqueta (dados do arraste só na memória, nunca no dataTransfer)
    card.draggable = !busy;
    card.addEventListener('dragstart', (e) => {
      if (board.moving.has(c.id)) { e.preventDefault(); return; }
      board.drag = { chatId: c.id, from: label.id };
      closeMoveMenu();
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('application/x-tsp-board', ''); } catch { /* ok */ }
      }
    });
    card.addEventListener('dragend', () => {
      board.drag = null;
      card.classList.remove('dragging');
      boardEls.cols.querySelectorAll('.bcol.drop').forEach((col) => col.classList.remove('drop'));
    });
    return card;
  }

  // Colunas visíveis para onde o cartão pode ir (todas menos a dele)
  function boardTargets(fromId) {
    return board.columns.filter((id) => id !== fromId && boardLabelById(id));
  }

  function addDropTarget(col, id) {
    const accepts = () => !!board.drag && board.drag.from !== id;
    ['dragenter', 'dragover'].forEach((type) => col.addEventListener(type, (e) => {
      if (!board.drag) return;
      e.stopPropagation();
      if (!accepts()) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      col.classList.add('drop');
    }));
    col.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || !col.contains(e.relatedTarget)) col.classList.remove('drop');
    });
    col.addEventListener('drop', (e) => {
      if (!board.drag) return;
      e.preventDefault();
      e.stopPropagation();
      col.classList.remove('drop');
      const { chatId, from } = board.drag;
      board.drag = null;
      if (from !== id) moveBoardCard(chatId, from, id);
    });
  }

  function closeMoveMenu() {
    if (board.moveMenu) board.moveMenu.menu.remove();
    board.moveMenu = null;
  }

  // "Mover para…": lista das colunas visíveis, logo abaixo do cartão
  function toggleMoveMenu(card, chatId, fromId) {
    const same = board.moveMenu && board.moveMenu.menu.isConnected && board.moveMenu.chatId === chatId && board.moveMenu.from === fromId;
    closeMoveMenu();
    if (same || board.moving.has(chatId)) return;
    const menu = el('div', 'bmovemenu');
    menu.setAttribute('role', 'menu');
    menu.append(el('div', 'bmovehint', 'Mover para…'));
    boardTargets(fromId).forEach((id) => {
      const l = boardLabelById(id);
      const opt = el('button');
      opt.type = 'button';
      opt.setAttribute('role', 'menuitem');
      const dot = el('span', 'wdot');
      dot.style.background = l.hexColor;
      opt.append(dot, l.name);
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMoveMenu();
        moveBoardCard(chatId, fromId, id);
      });
      menu.append(opt);
    });
    card.after(menu);
    board.moveMenu = { chatId, from: fromId, menu, card };
    const firstOpt = menu.querySelector('button');
    if (firstOpt) firstOpt.focus();
  }

  function hideBoardToast() {
    clearTimeout(board.toastTimer);
    if (!boardEls || !boardEls.toast) return;
    boardEls.toast.hidden = true;
    boardEls.toast.textContent = '';
  }

  function boardToast(text, kind, ms, action = null) {
    if (!boardEls || !boardEls.toast) return;
    clearTimeout(board.toastTimer);
    fillToast(boardEls.toast, text, action);
    boardEls.toast.className = `btoast ${kind}`;
    boardEls.toast.hidden = false;
    board.toastTimer = setTimeout(hideBoardToast, ms);
  }

  // Ajusta o número de uma etiqueta na barra/Quadro depois de uma troca confirmada
  function bumpWaCount(labelId, delta) {
    const l = waLabelById(labelId);
    if (l) l.count = Math.max(0, l.count + delta);
  }

  function bumpCrmCount(labelId, delta) {
    if (lt.counts && Number.isFinite(lt.counts[labelId])) lt.counts[labelId] = Math.max(0, lt.counts[labelId] + delta);
  }

  async function requestLabelChange(chatId, add, remove) {
    try {
      const res = await waRequest('setChatLabels', { chatId, add, remove }, { timeout: 15000 });
      return res && res.confirmed === true && Array.isArray(res.labelIds) ? res : null;
    } catch {
      return null;
    }
  }

  async function requestCrmMove(contactId, from, to) {
    try {
      await call('moveContactLabel', { contactId, from, to });
      return true;
    } catch {
      return false;
    }
  }

  // Troca a etiqueta de um cartão: tira a da coluna de origem e põe a da coluna de destino
  // (WhatsApp: no próprio WhatsApp; CRM: no Supabase)
  async function moveBoardCard(chatId, from, to, { undo = false } = {}) {
    if (from === to || board.moving.has(chatId) || !boardLabelById(to)) return;
    const fromData = board.data.get(from);
    const card = fromData && fromData.cards.find((c) => c.id === chatId);
    if (!card) return;
    const crmMode = fromData.family === 'crm';
    board.moving.add(chatId);
    renderColumn(from);
    renderColumn(to);
    const ok = crmMode ? await requestCrmMove(chatId, from, to) : !!(await requestLabelChange(chatId, [to], [from]));
    board.moving.delete(chatId);
    const live = board.open && board.data.get(from) === fromData;
    if (!ok) {
      if (live) { renderColumn(from); renderColumn(to); }
      boardToast(crmMode ? CRM_FAIL_MSG : LABEL_FAIL_MSG, 'error', 6000);
      return;
    }
    const toData = board.data.get(to);
    const wasInTo = !!(toData && toData.cards.some((c) => c.id === chatId));
    const bump = crmMode ? bumpCrmCount : bumpWaCount;
    bump(from, -1);
    if (!wasInTo) bump(to, 1);
    fromData.cards = fromData.cards.filter((c) => c.id !== chatId);
    fromData.total = Math.max(0, fromData.total - 1);
    const moved = crmMode ? { ...card, addedAt: new Date().toISOString() } : card;
    if (toData) {
      toData.cards = [moved, ...toData.cards.filter((c) => c.id !== chatId)];
      if (!wasInTo) toData.total += 1;
    }
    renderBar();
    if (crmMode) { renderAllLabels(); afterLabelChange(); } else renderWaTab();
    if (!live) return;
    updateBoardCounts();
    renderColumn(from);
    renderColumn(to);
    const label = boardLabelById(to);
    const name = label ? label.name : '';
    const what = crmMode ? 'Etiqueta CRM' : 'Etiqueta';
    if (undo) boardToast(`Troca desfeita: ${what.toLowerCase()} de volta para ${name}.`, 'ok', 4000);
    else boardToast(`${what} trocada para ${name}`, 'ok', UNDO_MS, { label: 'Desfazer', onClick: () => { hideBoardToast(); moveBoardCard(chatId, to, from, { undo: true }); } });
  }

  function renderColumn(id) {
    const els = columnEls(id);
    const label = boardLabelById(id);
    if (!els || !label) return;
    const d = board.data.get(id);
    const crmMode = !!d && d.family === 'crm';
    const what = crmMode ? 'contatos' : 'conversas';
    const scroll = els.body.scrollTop;
    els.body.textContent = '';
    if (!d || (d.loading && !d.cards.length)) {
      els.body.append(el('div', 'bmsg', 'Carregando…'));
      return;
    }
    if (d.error && !d.cards.length) {
      const box = el('div', 'bmsg', crmMode ? 'Não consegui carregar estes contatos agora.' : 'Não consegui carregar estas conversas agora.');
      const retry = el('button', null, 'Tentar de novo');
      retry.type = 'button';
      retry.addEventListener('click', () => loadColumn(id, true));
      box.append(el('br'), retry);
      els.body.append(box);
      return;
    }
    if (!d.cards.length) {
      els.body.append(el('div', 'bmsg', crmMode ? 'Nenhum contato com esta etiqueta CRM.' : 'Nenhuma conversa carregada com esta etiqueta.'));
      return;
    }
    d.cards.forEach((c) => els.body.append(boardCard(c, label)));
    if (d.cards.length < d.total || d.loading) {
      const more = el('button', 'bmore', d.loading ? 'Carregando…' : 'Mostrar mais');
      more.type = 'button';
      more.disabled = d.loading;
      more.addEventListener('click', () => loadColumn(id, false));
      els.body.append(more);
    }
    if (d.error) {
      const box = el('div', 'bmsg', `Não consegui carregar mais ${what}. `);
      const retry = el('button', null, 'Tentar de novo');
      retry.type = 'button';
      retry.addEventListener('click', () => loadColumn(id, false));
      box.append(retry);
      els.body.append(box);
    }
    if (!crmMode && d.total < label.count) {
      els.body.append(el('div', 'bnote', `Mostrando ${d.total} conversas carregadas no WhatsApp Web agora.`));
    }
    els.body.scrollTop = scroll;
  }

  async function openBoardChat(chatId) {
    if (board.opening) return;
    board.opening = true;
    boardStatus('');
    try {
      await waRequest('openChat', { chatId }, { timeout: 6000 });
      closeBoard();
    } catch {
      boardStatus('Não consegui abrir a conversa. Tente de novo.');
    } finally {
      board.opening = false;
    }
  }

  // Cartão do CRM: abre a conversa <telefone>@c.us se ela estiver carregada no WhatsApp Web
  async function openCrmCard(c) {
    if (board.opening) return;
    const who = c.name || formatPhone(c.phone) || '—';
    const notLoaded = () => boardToast(`Conversa não carregada no WhatsApp Web. Procure pelo nome: ${who}`, 'error', 6000);
    if (!c.phone || !/^\d{8,15}$/.test(c.phone)) { notLoaded(); return; }
    board.opening = true;
    boardStatus('');
    try {
      await waRequest('openChat', { chatId: `${c.phone}@c.us` }, { timeout: 6000 });
      closeBoard();
    } catch {
      notLoaded();
    } finally {
      board.opening = false;
    }
  }

  function setColsMenu(open) {
    if (!boardEls) return;
    board.menuOpen = open;
    boardEls.menu.hidden = !open;
    boardEls.colsBtn.classList.toggle('on', open);
    boardEls.colsBtn.setAttribute('aria-expanded', String(open));
    if (open) renderColsMenu();
  }

  function renderColsMenu() {
    boardEls.menu.textContent = '';
    familyLabels(state.family).forEach((l) => {
      const row = el('label', 'bopt');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = board.columns.includes(l.id);
      cb.disabled = !cb.checked && board.columns.length >= BOARD_MAX_COLS;
      cb.addEventListener('change', () => toggleBoardColumn(l.id, cb.checked));
      const dot = el('span', 'wdot');
      dot.style.background = l.hexColor;
      row.append(cb, dot, el('span', 'boptname', l.name), el('span', 'wcount', countText(l.count)));
      boardEls.menu.append(row);
    });
    boardEls.menu.append(el('div', 'bopthint', `Escolha até ${BOARD_MAX_COLS} colunas (${FAMILY_NAME[state.family]}).`));
  }

  function toggleBoardColumn(id, on) {
    const order = familyLabels(state.family).map((l) => l.id);
    const chosen = on ? [...board.columns, id] : board.columns.filter((x) => x !== id);
    board.columns = order.filter((x) => chosen.includes(x)).slice(0, BOARD_MAX_COLS); // na ordem da barra
    board.saved[state.family] = board.columns.slice();
    // Só ids de etiquetas, separados por família
    storageSet(isCrm() ? { boardCrmLabelIds: board.saved.crm } : { boardLabelIds: board.saved.whatsapp });
    renderBoardColumns();
    board.columns.forEach((x) => { if (!board.data.has(x)) loadColumn(x, true); });
    renderColsMenu();
  }

  async function refreshBoard() {
    boardStatus('');
    if (isCrm()) await refreshCrmLabels();
    else await refreshBar();
    if (!board.open) return;
    if (!isCrm() && !Array.isArray(state.waLabels)) { boardStatus('O WhatsApp ainda não está pronto. Tente de novo em instantes.'); return; }
    board.data = new Map();
    renderBoardColumns();
    board.columns.forEach((id) => { if (boardLabelById(id)) loadColumn(id, true); });
  }

  // ── Seção Etiquetas do painel: etiquetas do WhatsApp nesta conversa (v1.7.0, só mudaram de lugar) ──
  // Só aparecem com as etiquetas do WhatsApp disponíveis.

  const waTabOn = () => Array.isArray(state.waLabels) && state.waLabels.length > 0;

  function renderWaTab() {
    const on = waTabOn();
    wtEl.hidden = !on;
    if (!on) return;
    if (wt.req === 0 && labelsTabActive()) scheduleWaConv(); // etiquetas chegaram com a seção já aberta

    let warning = null;
    if (wt.kind === 'grupo') warning = 'Grupos: troque a etiqueta pelo Quadro';
    else if (!wt.chatId) warning = 'Abra uma conversa para etiquetar';
    wtWho.parentElement.classList.toggle('warn', !!warning);
    wtWho.textContent = warning || (state.ctx && state.ctx.fullName) || 'Conversa aberta';
    wtWho.title = wtWho.textContent;
    wtChips.classList.toggle('loading', !warning && (wt.loading || wt.busy));
    wtChips.textContent = '';
    state.waLabels.forEach((l) => {
      const applied = !warning && wt.labelIds.includes(l.id);
      const chip = el('button', `wtchip${applied ? ' on' : ''}`);
      chip.type = 'button';
      chip.disabled = !!warning || wt.loading || wt.busy || wt.error;
      chip.style.setProperty('--c', l.hexColor);
      chip.style.setProperty('--on', textOn(l.hexColor));
      chip.setAttribute('aria-pressed', String(applied));
      chip.title = warning || (applied ? `Desmarcar "${l.name}" no WhatsApp` : `Marcar "${l.name}" no WhatsApp`);
      if (applied) chip.innerHTML = svg('check');
      else chip.append(el('span', 'wdot'));
      if (!applied) chip.querySelector('.wdot').style.background = l.hexColor;
      chip.append(l.name);
      chip.addEventListener('click', () => toggleWaLabel(wt.chatId, l.id, !applied));
      wtChips.append(chip);
    });
    if (!warning && wt.error) wtChips.append(el('span', 'wt-none', 'Não consegui ler as etiquetas do WhatsApp desta conversa.'));
  }

  async function refreshWaTab() {
    if (!Array.isArray(state.waLabels)) await refreshBar();
    loadWaConv();
  }

  // Ao trocar de conversa: relê as etiquetas do WhatsApp da conversa aberta
  function scheduleWaConv() {
    clearTimeout(wt.timer);
    if (labelsTabActive()) wt.timer = setTimeout(loadWaConv, 300);
  }

  async function loadWaConv() {
    if (!labelsTabActive() || !waTabOn()) { renderWaTab(); return; }
    const req = ++wt.req;
    let active;
    try { active = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { active = null; }
    if (req !== wt.req) return;
    const kind = (active && active.kind) || 'nenhuma';
    const chatId = kind === 'individual' && typeof active.chatId === 'string' ? active.chatId : null;
    if (chatId !== wt.chatId) wt.labelIds = [];
    wt.chatId = chatId;
    wt.kind = kind;
    wt.error = false;
    wt.loading = !!chatId;
    renderWaTab();
    if (!chatId) return;
    try {
      const res = await waRequest('chatLabels', { chatId }, { timeout: 7000 });
      if (req !== wt.req) return;
      wt.labelIds = Array.isArray(res && res.labelIds) ? res.labelIds.filter((x) => typeof x === 'string') : [];
    } catch {
      if (req !== wt.req) return;
      wt.error = true;
    }
    wt.loading = false;
    renderWaTab();
  }

  // Marca (on) ou desmarca uma etiqueta do WhatsApp na conversa: só pelo clique ou pelo "Desfazer"
  async function toggleWaLabel(chatId, labelId, on, { undo = false } = {}) {
    if (!chatId || wt.busy || board.moving.has(chatId) || !waLabelById(labelId)) return;
    wt.busy = true;
    board.moving.add(chatId);
    wt.req++; // descarta leituras em andamento
    renderWaTab();
    const res = await requestLabelChange(chatId, on ? [labelId] : [], on ? [] : [labelId]);
    wt.busy = false;
    board.moving.delete(chatId);
    wt.loading = false;
    if (!res) {
      renderWaTab();
      crmToast(LABEL_FAIL_MSG, 'error', 6000);
      return;
    }
    bumpWaCount(labelId, on ? 1 : -1);
    if (wt.chatId === chatId) { wt.labelIds = res.labelIds.slice(); wt.error = false; }
    renderBar();
    renderWaTab();
    if (board.open && !isCrm()) {
      updateBoardCounts();
      if (board.columns.includes(labelId)) loadColumn(labelId, true);
    }
    const name = waLabelById(labelId).name;
    if (undo) crmToast('Troca desfeita.', 'ok', 4000);
    else crmToast(`Etiqueta do WhatsApp "${name}" ${on ? 'marcada' : 'desmarcada'} nesta conversa.`, 'ok', UNDO_MS,
      { label: 'Desfazer', onClick: () => toggleWaLabel(chatId, labelId, !on, { undo: true }) });
  }

  // ── Seção Etiquetas do painel (etiquetas CRM; era a janela "Etiquetas CRM" na 1.8.0) ──

  const PALETTE = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#6b7280'];
  const NOTE_MAX = 2000;
  const NOTES_MISSING = 'Nota disponível após atualizar o banco';

  // Avisos da seção Etiquetas: no aviso do próprio painel
  function crmToast(text, kind, ms, action = null) {
    toast(text, kind, ms, action);
  }

  async function loadSchema() {
    try {
      const s = await call('fetchSchema');
      state.schema = { hidden: s && s.hidden === true, notes: s && s.notes === true };
    } catch { /* fica como estava */ }
    if (crm.open) { renderAllLabels(); renderNote(); }
  }

  // Chamadas por syncCrmActive (painel aberto + seção Etiquetas); a conversa aberta vem do updateContext do painel
  function openCrm() {
    crm.open = true;
    state.convKey = undefined; // relê a conversa aberta
    updateContext();
    restartLabelsTabTimer();
    refreshLabelsTab();
    loadSchema();
    scheduleNote(true);
    if (crm.copy.preview && crm.copy.preview.failed) crm.copy.preview = null; // tenta contar de novo
    renderNewForm();
    renderCopy();
  }

  function closeCrm() {
    crm.open = false;
    restartLabelsTabTimer();
    clearTimeout(wt.timer);
    crm.edit = null;
    crm.showNew = false;
    crm.copy.stop = true;
    renderNewForm();
    renderAllLabels();
  }

  // ── Nota do contato (CRM): lida ao trocar de conversa; gravada só no clique em "Salvar nota" ──

  function scheduleNote(force = false) {
    const identity = state.ctx && state.ctx.identity;
    const key = canLabel(identity) ? identity.key : null;
    if (!force && key === crm.note.key) return;
    const n = crm.note;
    n.key = key;
    n.text = '';
    n.saved = '';
    n.error = false;
    n.msg = '';
    n.req++;
    crmEls.note.value = '';
    if (!crm.open || !key) { n.loading = false; renderNote(); return; }
    n.loading = true;
    renderNote();
    loadNote(key, n.req);
  }

  async function loadNote(key, req) {
    const identity = state.ctx && state.ctx.identity;
    if (!canLabel(identity) || identity.key !== key) return;
    const n = crm.note;
    try {
      const res = await call('getContactNote', { identity: identityPayload(identity) });
      if (n.req !== req) return;
      state.schema.notes = !!(res && res.available);
      n.saved = (res && typeof res.note === 'string') ? res.note : '';
      n.text = n.saved;
      crmEls.note.value = n.text;
    } catch {
      if (n.req !== req) return;
      n.error = true;
      n.msg = 'Não consegui ler a nota.';
    }
    n.loading = false;
    renderNote();
  }

  function renderNote() {
    const n = crm.note;
    const identity = state.ctx && state.ctx.identity;
    const ok = canLabel(identity) && n.key === identity.key;
    const missing = state.schema.notes === false;
    crmEls.note.disabled = !ok || missing || n.loading || n.saving;
    crmEls.noteCount.textContent = `${crmEls.note.value.length}/${NOTE_MAX}`;
    crmEls.noteSave.disabled = crmEls.note.disabled || crmEls.note.value === n.saved;
    crmEls.noteSave.textContent = n.saving ? 'Salvando…' : 'Salvar nota';
    let msg = n.msg;
    let cls = n.error ? 'err' : msg ? 'ok' : '';
    if (missing) { msg = NOTES_MISSING; cls = 'warn'; }
    else if (!ok) { msg = 'Abra uma conversa para escrever uma nota'; cls = ''; }
    else if (n.loading) { msg = 'Carregando…'; cls = ''; }
    else if (!msg && crmEls.note.value !== n.saved) { msg = 'Não salva: clique em "Salvar nota"'; cls = 'warn'; }
    crmEls.noteMsg.textContent = msg;
    crmEls.noteMsg.className = `crm-notemsg${cls ? ` ${cls}` : ''}`;
  }

  async function saveNote() {
    const n = crm.note;
    const identity = state.ctx && state.ctx.identity;
    if (n.saving || !canLabel(identity) || identity.key !== n.key) return;
    const text = crmEls.note.value;
    if (text.length > NOTE_MAX) return;
    const key = n.key;
    n.saving = true;
    n.msg = '';
    n.error = false;
    renderNote();
    try {
      const res = await call('setContactNote', { identity: identityPayload(identity), note: text });
      if (n.key === key) {
        n.saved = (res && typeof res.note === 'string') ? res.note : text.trim();
        crmEls.note.value = n.saved;
        n.msg = 'Nota salva.';
      }
    } catch (e) {
      if (n.key === key) {
        n.error = true;
        n.msg = e.message === NOTES_MISSING ? NOTES_MISSING : 'Não consegui salvar a nota. Tente de novo.';
        if (e.message === NOTES_MISSING) state.schema.notes = false;
      }
    }
    n.saving = false;
    renderNote();
  }

  // ── Gerenciar etiquetas CRM (renomear, cor, ocultar, ordem, excluir, criar) ──

  function crmError(e) {
    const m = String((e && e.message) || '');
    if (/^(Já existe|Nome da etiqueta|Ocultar disponível|Cor fora)/.test(m)) return m;
    return 'Não consegui salvar no CRM. Tente de novo.';
  }

  async function crmLabelOp(type, payload, okText) {
    if (crm.busy) return false;
    crm.busy = true;
    renderAllLabels();
    let ok = false;
    try {
      await call(type, payload);
      ok = true;
      crm.edit = null;
      if (okText) crmToast(okText, 'ok', 4000);
    } catch (e) {
      crmToast(crmError(e), 'error', 6000);
    }
    crm.busy = false;
    await syncLabels();
    renderAllLabels();
    afterLabelChange();
    if (board.open && isCrm()) refreshBoard();
    return ok;
  }

  function setEdit(id, mode) {
    crm.edit = id && mode ? { id, mode } : null;
    renderAllLabels();
    const box = ltRowsEl.querySelector('.lt-edit input, .lt-edit button');
    if (box) box.focus();
  }

  function labelEditor(l) {
    const box = el('div', 'lt-edit');
    const btn = (text, onClick, cls = '') => {
      const b = el('button', cls || null, text);
      b.type = 'button';
      b.disabled = crm.busy;
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return b;
    };
    const mode = crm.edit.mode;
    if (mode === 'rename') {
      const input = el('input');
      input.type = 'text';
      input.maxLength = 40;
      input.value = l.name;
      input.setAttribute('aria-label', 'Novo nome da etiqueta CRM');
      const save = () => crmLabelOp('updateLabel', { id: l.id, name: input.value }, 'Etiqueta CRM renomeada.');
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      box.append(input, btn('Salvar', save), btn('Cancelar', () => setEdit(null)));
    } else if (mode === 'color') {
      PALETTE.forEach((c) => {
        const sw = btn('', () => crmLabelOp('updateLabel', { id: l.id, color: c }, 'Cor da etiqueta CRM trocada.'), `sw${c === String(l.color).toLowerCase() ? ' on' : ''}`);
        sw.style.background = c;
        sw.setAttribute('aria-label', `Cor ${c}`);
        box.append(sw);
      });
      box.append(btn('Cancelar', () => setEdit(null)));
    } else if (mode === 'delete') {
      box.append(el('div', 'q', `Excluir '${l.name}'? Os contatos continuam salvos; só a etiqueta e as marcações somem.`));
      box.append(btn('Excluir', () => crmLabelOp('deleteLabel', { id: l.id }, `Etiqueta CRM "${l.name}" excluída.`), 'danger'),
        btn('Cancelar', () => setEdit(null)));
    } else {
      const idx = state.labels.findIndex((x) => x.id === l.id);
      const hide = btn(l.hidden ? 'Mostrar' : 'Ocultar', () => crmLabelOp('updateLabel', { id: l.id, hidden: !l.hidden },
        l.hidden ? 'Etiqueta CRM visível de novo.' : 'Etiqueta CRM oculta (some da barra e do Quadro).'));
      if (state.schema.hidden !== true) {
        hide.disabled = true;
        hide.title = 'Ocultar disponível após atualizar o banco';
      }
      const up = btn('↑', () => moveLabel(l.id, idx - 1));
      up.disabled = crm.busy || idx <= 0;
      up.setAttribute('aria-label', 'Subir');
      const down = btn('↓', () => moveLabel(l.id, idx + 1));
      down.disabled = crm.busy || idx >= state.labels.length - 1;
      down.setAttribute('aria-label', 'Descer');
      box.append(btn('Renomear', () => setEdit(l.id, 'rename')), btn('Cor', () => setEdit(l.id, 'color')), hide, up, down,
        btn('Excluir', () => setEdit(l.id, 'delete'), 'danger'));
    }
    return box;
  }

  // Nova ordem: grava position de todas (some se falhar e volta a ordem do banco)
  async function moveLabel(id, toIndex) {
    const from = state.labels.findIndex((l) => l.id === id);
    if (from < 0 || toIndex < 0 || toIndex >= state.labels.length || from === toIndex || crm.busy) return;
    const list = state.labels.slice();
    const [item] = list.splice(from, 1);
    list.splice(toIndex, 0, item);
    state.labels = list;
    renderAllLabels();
    renderBar();
    await crmLabelOp('reorderLabels', { ids: list.map((l) => l.id) }, null);
  }

  function addReorderDrag(item, l) {
    const grip = item.querySelector('.lt-grip');
    grip.addEventListener('mousedown', () => { item.draggable = true; });
    item.addEventListener('dragstart', (e) => {
      if (crm.busy) { e.preventDefault(); return; }
      crm.dragId = l.id;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('application/x-tsp-crm', ''); } catch { /* ok */ }
      }
    });
    item.addEventListener('dragend', () => {
      crm.dragId = null;
      item.draggable = false;
      ltRowsEl.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    });
    const after = (e) => {
      const r = item.getBoundingClientRect();
      return typeof e.clientY === 'number' && r.height ? e.clientY > r.top + r.height / 2 : true;
    };
    item.addEventListener('dragover', (e) => {
      if (!crm.dragId || crm.dragId === l.id) return;
      e.preventDefault();
      e.stopPropagation();
      const a = after(e);
      item.classList.toggle('drop-after', a);
      item.classList.toggle('drop-before', !a);
    });
    item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));
    item.addEventListener('drop', (e) => {
      if (!crm.dragId) return;
      e.preventDefault();
      e.stopPropagation();
      const dragId = crm.dragId;
      crm.dragId = null;
      item.classList.remove('drop-before', 'drop-after');
      if (dragId === l.id) return;
      const from = state.labels.findIndex((x) => x.id === dragId);
      let to = state.labels.findIndex((x) => x.id === l.id) + (after(e) ? 1 : 0);
      if (from < to) to -= 1;
      moveLabel(dragId, to);
    });
  }

  function renderNewForm() {
    crmEls.newBox.hidden = !crm.showNew;
    crmEls.newBtn.setAttribute('aria-expanded', String(crm.showNew));
    if (!crm.newColor) crm.newColor = PALETTE[state.labels.length % PALETTE.length];
    crmEls.newColors.textContent = '';
    PALETTE.forEach((c) => {
      const sw = el('button', `sw${c === crm.newColor ? ' on' : ''}`);
      sw.type = 'button';
      sw.style.background = c;
      sw.setAttribute('aria-label', `Cor ${c}`);
      sw.setAttribute('aria-pressed', String(c === crm.newColor));
      sw.addEventListener('click', () => { crm.newColor = c; renderNewForm(); });
      crmEls.newColors.append(sw);
    });
  }

  async function createCrmLabel() {
    const name = crmEls.newName.value.trim();
    if (!name) { crmToast('Escreva o nome da etiqueta CRM.', 'error', 4000); return; }
    const ok = await crmLabelOp('createLabel', { name, color: crm.newColor }, `Etiqueta CRM "${name}" criada.`);
    if (ok) {
      crmEls.newName.value = '';
      crm.showNew = false;
      crm.newColor = null;
      renderNewForm();
    }
  }

  // ── Exportar CSV (gerado aqui mesmo; o arquivo nunca sai do computador) ──

  function csvField(value) {
    let v = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`; // o Excel não executa como fórmula
    return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  function buildCsv(rows) {
    const lines = ['nome;telefone', ...rows.map((r) => `${csvField(r.name)};${csvField(r.phone)}`)];
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  function csvFileName(labelName, date = new Date()) {
    const slug = String(labelName).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'etiqueta';
    const two = (n) => String(n).padStart(2, '0');
    return `crm-${slug}-${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}.csv`;
  }

  async function exportCsv(label, box) {
    if (box.dataset.busy) return;
    box.dataset.busy = '1';
    box.textContent = '';
    box.append('Preparando o CSV…');
    try {
      const rows = await call('fetchAllLabelClients', { labelId: label.id });
      const list = Array.isArray(rows) ? rows : [];
      if (crm.exportUrl) URL.revokeObjectURL(crm.exportUrl);
      crm.exportUrl = URL.createObjectURL(new Blob([buildCsv(list)], { type: 'text/csv;charset=utf-8' }));
      const a = el('a', null, `Baixar ${csvFileName(label.name)}`);
      a.href = crm.exportUrl;
      a.download = csvFileName(label.name);
      box.textContent = '';
      box.append(a, ` (${list.length} contato${list.length === 1 ? '' : 's'})`);
    } catch {
      box.textContent = '';
      box.append('Não consegui gerar o CSV. Tente de novo.');
    }
    delete box.dataset.busy;
  }

  function exportRow(label) {
    const wrap = el('div', 'lt-export');
    const b = el('button', 'bbtn', 'Exportar CSV');
    b.type = 'button';
    const out = el('span');
    b.addEventListener('click', () => exportCsv(label, out));
    wrap.append(b, out);
    return wrap;
  }

  // ── Copiar do WhatsApp (cópia única: depois as duas etiquetas seguem independentes) ──

  // Cor da paleta mais parecida com a cor da etiqueta do WhatsApp
  function nearestPalette(hex) {
    const rgb = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const [r, g, b] = rgb(hex);
    if ([r, g, b].some((x) => Number.isNaN(x))) return PALETTE[0];
    let best = PALETTE[0];
    let bestD = Infinity;
    PALETTE.forEach((p) => {
      const [pr, pg, pb] = rgb(p);
      const dist = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
      if (dist < bestD) { bestD = dist; best = p; }
    });
    return best;
  }

  // Conversa do WhatsApp → contato do CRM. @c.us: telefone; @lid: só o nome; grupos e sem nome ficam de fora.
  function contactFromChat(c) {
    const id = typeof c.id === 'string' ? c.id : '';
    const [user, server] = id.split('@');
    const raw = typeof c.name === 'string' ? c.name.trim().replace(/\s+/g, ' ').slice(0, 100) : '';
    const name = raw && raw !== user && !/^[+\d\s().-]+$/.test(raw) ? raw : null;
    if (c.kind !== 'individual') return null;
    if (server === 'c.us' && /^\d{8,15}$/.test(user)) return { key: `tel:${user}`, phone: user, name, chatId: id };
    if (server === 'lid' && name) return { key: `nome:${name.toLowerCase()}`, phone: null, name, chatId: id };
    return null;
  }

  function renderCopy() {
    if (!crmEls || !crmEls.copy) return;
    const box = crmEls.copy;
    const cp = crm.copy;
    box.textContent = '';
    if (!waTabOn()) {
      box.append(el('div', 'cp-off', 'Disponível quando as etiquetas do WhatsApp (WhatsApp Business) estiverem prontas.'));
      if (cp.result) box.append(el('div', 'cp-result', cp.result));
      return;
    }
    if (!state.waLabels.some((l) => l.id === cp.waId)) { cp.waId = state.waLabels[0].id; cp.preview = null; }
    if (cp.dest !== '__new' && !state.labels.some((l) => l.id === cp.dest)) cp.dest = '__new';

    const field = (text, select) => { const f = el('label', 'cp-field', text); f.append(select); return f; };
    const waSel = el('select');
    state.waLabels.forEach((l) => {
      const o = el('option', null, `${l.name} (${l.count})`);
      o.value = l.id;
      o.selected = l.id === cp.waId;
      waSel.append(o);
    });
    waSel.disabled = cp.running;
    waSel.addEventListener('change', () => { cp.waId = waSel.value; cp.preview = null; cp.result = ''; renderCopy(); });
    const crmSel = el('select');
    const optNew = el('option', null, 'Criar nova com o mesmo nome');
    optNew.value = '__new';
    crmSel.append(optNew);
    state.labels.forEach((l) => {
      const o = el('option', null, l.name);
      o.value = l.id;
      o.selected = l.id === cp.dest;
      crmSel.append(o);
    });
    crmSel.disabled = cp.running;
    crmSel.addEventListener('change', () => { cp.dest = crmSel.value; });
    box.append(field('Etiqueta do WhatsApp', waSel), field('Etiqueta CRM de destino', crmSel));

    const waLabel = waLabelById(cp.waId);
    const warn = el('div', 'cp-warn');
    const ready = !!cp.preview && cp.preview.waId === cp.waId && !cp.preview.failed;
    if (ready) {
      warn.textContent = `Só entram as conversas carregadas no WhatsApp Web agora (${cp.preview.total} de ${waLabel.count}).`;
    } else if (cp.preview && cp.preview.waId === cp.waId) {
      warn.textContent = 'Não consegui contar as conversas do WhatsApp agora. Volte para Mensagens e abra Etiquetas de novo para tentar.';
    } else {
      warn.textContent = 'Contando as conversas carregadas no WhatsApp Web…';
      if (!cp.running && crm.open) previewCopy(cp.waId);
    }
    box.append(warn);

    const go = el('button', 'bbtn primary', 'Copiar contatos');
    go.type = 'button';
    go.disabled = cp.running || !ready;
    go.addEventListener('click', () => runCopy());
    box.append(go);

    const prog = el('div', 'cp-prog');
    prog.hidden = !cp.running;
    const barEl = el('div', 'cp-bar');
    const fill = el('div', 'cp-fill');
    fill.style.width = `${cp.total ? Math.round((cp.done / cp.total) * 100) : 0}%`;
    barEl.append(fill);
    const stop = el('button', 'bbtn', cp.stop ? 'Parando…' : 'Parar');
    stop.type = 'button';
    stop.disabled = cp.stop;
    stop.addEventListener('click', () => { cp.stop = true; renderCopy(); });
    prog.append(barEl, el('span', null, cp.phase === 'ler' ? 'Lendo conversas…' : `${cp.done} de ${cp.total}`), stop);
    box.append(prog);
    if (cp.result) box.append(el('div', `cp-result${cp.error ? ' err' : ''}`, cp.result));
  }

  async function previewCopy(waId) {
    const cp = crm.copy;
    const req = ++cp.previewReq;
    try {
      const res = await waRequest('labelChats', { labelId: waId, offset: 0, limit: 1, noPreview: true }, { timeout: 8000 });
      if (req !== cp.previewReq || cp.waId !== waId) return;
      cp.preview = { waId, total: Number(res && res.total) || 0 };
    } catch {
      if (req !== cp.previewReq) return;
      cp.preview = { waId, failed: true };
    }
    renderCopy();
  }

  // Lê todas as páginas (sem prévias) e grava em lotes de 100; "Parar" interrompe entre os lotes
  async function runCopy() {
    const cp = crm.copy;
    if (cp.running) return;
    const waLabel = waLabelById(cp.waId);
    if (!waLabel) return;
    Object.assign(cp, { running: true, stop: false, phase: 'ler', done: 0, total: 0, result: '', error: false });
    renderCopy();
    let labelId = cp.dest;
    const sum = { added: 0, tel: 0, name: 0, already: 0, out: 0 };
    let failed = false;
    try {
      if (labelId === '__new') {
        const name = waLabel.name.slice(0, 40);
        const same = state.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
        if (same) labelId = same.id;
        else {
          const created = await call('createLabel', { name, color: nearestPalette(waLabel.hexColor) });
          labelId = created.id;
          await syncLabels();
        }
        cp.dest = labelId;
      }
      const chats = [];
      for (let offset = 0; !cp.stop; offset += 100) {
        const res = await waRequest('labelChats', { labelId: waLabel.id, offset, limit: 100, noPreview: true }, { timeout: 8000 });
        const page = Array.isArray(res && res.chats) ? res.chats : [];
        chats.push(...page);
        if (!page.length || offset + 100 >= (Number(res && res.total) || 0)) break;
      }
      const byKey = new Map();
      chats.forEach((c) => {
        const contact = contactFromChat(c);
        if (!contact) sum.out++;
        else if (!byKey.has(contact.key)) byKey.set(contact.key, contact);
      });
      const contacts = [...byKey.values()];
      cp.phase = 'gravar';
      cp.total = contacts.length;
      renderCopy();
      for (let i = 0; i < contacts.length && !cp.stop; i += 100) {
        const res = await call('bulkAddContactsToLabel', { labelId, contacts: contacts.slice(i, i + 100) });
        sum.added += res.added || 0;
        sum.tel += res.addedTel || 0;
        sum.name += res.addedName || 0;
        sum.already += res.already || 0;
        cp.done = Math.min(contacts.length, i + 100);
        renderCopy();
      }
    } catch {
      failed = true;
    }
    const stopped = cp.stop;
    cp.running = false;
    cp.stop = false;
    cp.error = failed;
    cp.result = `${failed ? 'Parou com erro. ' : stopped ? 'Cópia parada antes do fim. ' : ''}`
      + `Copiados ${sum.added} (${sum.tel} por telefone, ${sum.name} só pelo nome). Já estavam: ${sum.already}. Fora: ${sum.out} (grupos/sem nome).`;
    await syncLabels();
    afterLabelChange();
    renderCopy();
  }

  function initCrmWindow() {
    crmEls.note.addEventListener('input', () => { crm.note.msg = ''; crm.note.error = false; renderNote(); });
    crmEls.noteSave.addEventListener('click', () => saveNote());
    crmEls.newBtn.addEventListener('click', () => {
      crm.showNew = !crm.showNew;
      renderNewForm();
      if (crm.showNew) crmEls.newName.focus();
    });
    crmEls.root.querySelector('.crm-create').addEventListener('click', () => createCrmLabel());
    crmEls.root.querySelector('.crm-cancelnew').addEventListener('click', () => { crm.showNew = false; renderNewForm(); });
    crmEls.newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); createCrmLabel(); } });
    // (Esc e as teclas ficam com o painel: veja o listener de teclado do painel)
    ['dragstart', 'drag', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'].forEach((type) => crmEls.root.addEventListener(type, (e) => {
      if (crm.dragId) {
        e.stopPropagation();
        if (type === 'drop') { e.preventDefault(); crm.dragId = null; }
      }
    }));
    renderNote();
  }

  function initLabelsBar() {
    bar.el = shadow.querySelector('.wabar');
    bar.chips = shadow.querySelector('.wabar .wchips');
    boardEls = {
      root: shadow.querySelector('.board'),
      cols: shadow.querySelector('.board .bcols'),
      menu: shadow.querySelector('.board .bcolsmenu'),
      colsBtn: shadow.querySelector('.board .bcolsbtn'),
      status: shadow.querySelector('.board .bstatus'),
      toast: shadow.querySelector('.board .btoast'),
      hint: shadow.querySelector('.board .bhint'),
    };

    shadow.querySelector('.wabar .wclose').addEventListener('click', () => setBarHidden(true));
    shadow.querySelectorAll('.wfam button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setFamily(b.dataset.fam); }));
    boardEls.colsBtn.addEventListener('click', (e) => { e.stopPropagation(); setColsMenu(!board.menuOpen); });
    shadow.querySelector('.board .brefresh').addEventListener('click', () => refreshBoard());
    shadow.querySelector('.board .bclose').addEventListener('click', () => closeBoard());
    boardEls.root.addEventListener('click', (e) => {
      if (board.menuOpen && !e.composedPath().includes(boardEls.menu) && !e.composedPath().includes(boardEls.colsBtn)) setColsMenu(false);
      if (board.moveMenu && !e.composedPath().includes(board.moveMenu.menu)) closeMoveMenu();
    });
    // Arraste de cartão não vai para o WhatsApp (nada de "soltar arquivo" na página)
    ['dragstart', 'drag', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'].forEach((type) => boardEls.root.addEventListener(type, (e) => {
      if (board.drag) {
        e.stopPropagation();
        if (type === 'drop') { e.preventDefault(); board.drag = null; }
      }
    }));
    // Esc fecha só o Quadro (ou o menu aberto); teclas não vão para os atalhos do WhatsApp
    ['keydown', 'keypress', 'keyup'].forEach((type) => boardEls.root.addEventListener(type, (e) => {
      if (type === 'keydown' && e.key === 'Escape') {
        e.preventDefault();
        if (board.moveMenu && board.moveMenu.menu.isConnected) {
          const card = board.moveMenu.card;
          closeMoveMenu();
          if (card.isConnected) card.focus();
        } else if (board.menuOpen) setColsMenu(false);
        else closeBoard();
      }
      e.stopPropagation();
    }));

    // Botão no cabeçalho do painel: mostrar/ocultar a barra
    bar.btn = iconButton('tag', 'Mostrar ou ocultar a barra do topo', () => setBarHidden(!state.barHiddenByUser));
    actions.insertBefore(bar.btn, closeBtn);

    initCrmWindow();

    try {
      chrome.storage.local.get(['labelsBarHidden', 'boardLabelIds', 'boardCrmLabelIds', 'labelsFamily'], (saved) => {
        saved = saved || {};
        const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, BOARD_MAX_COLS) : null);
        state.barHiddenByUser = saved.labelsBarHidden === true;
        state.family = saved.labelsFamily === 'crm' ? 'crm' : 'whatsapp';
        board.saved = { whatsapp: ids(saved.boardLabelIds), crm: ids(saved.boardCrmLabelIds) };
        renderBar();
      });
    } catch { /* extensão recarregada */ }

    renderBar();
    setTimeout(() => { try { barTick(); } catch { /* ok */ } }, 1500);
    setInterval(() => { try { barTick(); } catch { /* ok */ } }, 5000);
    document.addEventListener('visibilitychange', () => { try { barTick(); } catch { /* ok */ } });
  }

  // Se a barra, o Quadro ou a seção Etiquetas falhar, o resto da extensão continua funcionando
  try {
    initLabelsBar();
  } catch {
    bar.el = null;
    boardEls = null;
    state.waLabels = null;
    try { ensureInjected(); } catch { /* ok */ }
  }

  // ── Início: mostra o cache na hora ─────────────────────────────────────────

  startScheduler();

  renderThemeButton();
  renderFilters();
  renderLastUsed();
  renderLabelsRow();
  renderAllLabels();
  renderList();
  setSection('mensagens', { persist: false });
  refreshAuth();
  try {
    // Sessão criada, renovada ou apagada pelo background (ex.: renovação recusada): reconsulta o status
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes && Object.prototype.hasOwnProperty.call(changes, 'waAuth')) refreshAuth();
    });
  } catch { /* extensão recarregada */ }
  try {
    chrome.storage.local.get(['library', 'labels', 'collapsed', 'lastUsed', 'themePref', 'panelSection', 'panelWidth'], (saved) => {
      saved = saved || {};
      if (Number.isFinite(saved.panelWidth)) { state.panelW = saved.panelWidth; applyPanelWidth(saved.panelWidth); } // 2.8.4
      state.collapsed = saved.collapsed || {};
      state.lastUsed  = saved.lastUsed || '';
      state.themePref = THEME_PREFS[saved.themePref] ? saved.themePref : 'auto';
      if (saved.library && !state.loaded) applyLibrary(saved.library, 'cache', saved.library.savedAt);
      if (saved.labels && !state.labelsLoaded) {
        state.labels = saved.labels.items || [];
        state.labelsLoaded = true;
        state.labelsSource = 'cache';
        state.labelsSyncedAt = saved.labels.savedAt || null;
      }
      renderLabelsRow();
      renderAllLabels();
      setSection(saved.panelSection, { persist: false });
      renderThemeButton();
      applyTheme();
      renderLastUsed();
      renderList();
    });
  } catch { /* extensão recarregada */ }
})();
