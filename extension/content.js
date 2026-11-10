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
    sliders:   '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
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
  // 2.9.2: localização, produto, catálogo, contato e Pix (rich-parts.js)
  const Rich = globalThis.TspRich;
  Rich.TYPES.forEach((t) => { TYPES[t] = { label: Rich.LABEL[t], color: Rich.COLOR[t] }; });

  const FILTERS = [
    ['tudo', 'Tudo'], ['mais_usadas', 'Mais usadas'], ['texto', 'Texto'], ['audio', 'Áudio'],
    ['imagem', 'Imagem'], ['video', 'Vídeo'], ['documento', 'Documento'],
    ['localizacao', 'Localização'], ['produto', 'Produto'], ['catalogo', 'Catálogo'], ['contato', 'Contato'], ['pix', 'Pix'],
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
    convKey: null, convLabelIds: [], convLoading: false, convError: false, convErrorMsg: '', menuOpen: false,
  };
  // 2.10.2: painel personalizável (abas, filtros, botões da conversa, densidade, seções recolhidas, altura do topo).
  // Só visual; guardado em chrome.storage.local (panelPrefs), por computador. Regras em engine.js (normPanelPrefs).
  const pz = { prefs: globalThis.TspEngine.defaultPanelPrefs(), filtersOpen: false, moreChip: null, open: false, el: null };
  // 2.10.3: lista de conversas do WhatsApp (#pane-side): posição que VOCÊ deixou, último envio seu e sua última mexida
  // userAt = qualquer mexida sua na lista (clique incluso); scrollAt = você rolando (roda, toque, teclado, barra)
  const lk = { el: null, saved: null, userAt: 0, scrollAt: 0, armAt: 0, restores: 0, pointer: false };
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
  const ENGINE_POKE = new Set(['createSchedule', 'saveFlow', 'setFlowActive', 'saveCampaign', 'startCampaign', 'campaignAction', 'saveAutomation', 'setAutomationActive', 'updateEngineSettings', 'enrollContact', 'leaveAutomation', 'seqManualEnter']);
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
  // 2.8.3: "Nome para mensagens" (wa_chat_names): definido à mão → da venda (2.13.3) → aprendido da SUA mensagem → vazio.
  // available false = tabela ainda não criada: o {nome} funciona como antes (nome do contato).
  const chatNames = { available: null, map: new Map(), current: null, readErr: new Map() }; // 2.12.1: readErr = motivo da leitura que falhou

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
      // 2.8.3: {nome} = nome para mensagens desta conversa (à mão → da venda → aprendido → vazio). Sem a tabela: como antes
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
      /* 2.13.1: excluir mensagem em uso / erro do banco */
      .imenu .del-inuse { color: var(--fg); }
      .imenu .del-head { font-weight: 700; margin-top: 4px; }
      .imenu .del-list { margin: 2px 0 4px; padding-left: 18px; font-size: var(--fs-2); }
      .imenu .del-hint { color: var(--warn); font-weight: 700; }
      .imenu .del-err { flex-basis: 100%; color: var(--err); font-weight: 600; }
      .imenu .del-det { font-weight: 400; color: var(--muted); }
      .imenu .del-det summary { cursor: pointer; }
      .imenu .del-raw { font-size: var(--fs-1); word-break: break-all; }
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
      .vd-prod.vd-sel { border-color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
      .vd-hit { font-weight: 700; }
      .vd-total { font-size: var(--fs-3); }
      /* 2.12.3: formulário igual à Nova Venda do ERP, compacto, com seções recolhíveis */
      .vd-form { gap: 6px ; }
      .vd-sec { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--card); }
      .vd-sec-head { width: 100%; display: flex; align-items: center; gap: 6px; padding: 7px 10px; border: none; background: transparent; color: var(--fg); font: inherit; font-size: var(--fs-2); font-weight: 700; text-align: left; cursor: pointer; border-radius: var(--r-md); }
      .vd-sec-head:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: -2px; }
      .vd-sec-arrow { width: 12px; color: var(--muted); }
      .vd-sec-sum { margin-left: auto; color: var(--muted); font-weight: 600; font-size: var(--fs-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
      .vd-sec-body { display: flex; flex-direction: column; gap: 6px; padding: 0 10px 10px; }
      .vd-grid2 { display: grid; grid-template-columns: 1fr; gap: 6px; }
      .panel.w-wide .vd-grid2 { grid-template-columns: 1fr 1fr; }
      .vd-item { gap: 4px; padding: 6px 8px; }
      .vd-item-top { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
      .vd-item .sc-row .ed-field { min-width: 70px; }
      .vd-stock { font-size: var(--fs-1); color: var(--muted); white-space: nowrap; }
      .vd-item-end { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
      .vd-sub { font-weight: 800; color: var(--accent-text, var(--accent)); }
      .vd-pay { gap: 6px; }
      .vd-pay .sc-row > select { flex: 1; min-width: 120px; }
      .vd-pay .sc-row > input { width: 110px; }
      .vd-fee { font-size: var(--fs-1); color: var(--err); }
      .vd-fee:empty { display: none; }
      .vd-paystatus { flex-wrap: nowrap; }
      .vd-ps { flex: 1; }
      .vd-ps.on[data-ps="pago"] { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
      .vd-ps.on[data-ps="a_cobrar"] { background: var(--warn-soft); border-color: var(--warn); color: var(--warn); }
      .vd-alloc, .vd-fin { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding-top: 6px; border-top: 1px solid var(--border); }
      .vd-fin { grid-template-columns: repeat(2, 1fr); border-top: none; }
      .panel.w-wide .vd-fin { grid-template-columns: repeat(4, 1fr); }
      .vd-alloc-l, .vd-fin-l { font-size: var(--fs-1); color: var(--muted); }
      .vd-alloc-v { font-weight: 800; }
      .vd-alloc-c.ok .vd-alloc-v { color: var(--ok); }
      .vd-alloc-c.warn .vd-alloc-v { color: var(--warn); }
      .vd-alloc-c.bad .vd-alloc-v { color: var(--err); }
      .vd-fin-c { padding: 6px 8px; border-radius: var(--r-sm); background: var(--bg2); border: 1px solid var(--border); }
      .vd-fin-v { font-size: var(--fs-3); font-weight: 800; }
      .vd-fin-c.bad .vd-fin-v { color: var(--err); }
      .vd-fin-c.profit { border-color: var(--accent); }
      .vd-fin-c.profit .vd-fin-v { color: var(--ok); }
      .vd-fin-c.profit.neg .vd-fin-v { color: var(--err); }
      .vd-fin-h { font-size: var(--fs-1); color: var(--muted); font-weight: 700; }
      .vd-fin-det { display: grid; grid-template-columns: 1fr; gap: 2px 12px; font-size: var(--fs-1); }
      .panel.w-wide .vd-fin-det { grid-template-columns: 1fr 1fr; }
      .vd-fin-line { display: flex; justify-content: space-between; gap: 6px; color: var(--muted); }
      .vd-fin-line b { color: var(--fg2); }
      .vd-cpf-err:empty { display: none; }
      .vd-paste { width: 100%; box-sizing: border-box; border-color: var(--accent); }
      .vd-supplier-row { align-items: center; }
      .vd-supplier-row select { flex: 1; min-width: 120px; }
      .vd-after { display: flex; flex-direction: column; gap: 4px; }
      .vd-after-line { font-size: var(--fs-2); }
      .vd-after-line.ok { color: var(--ok); }
      .vd-after-line.err { color: var(--err); font-weight: 600; }
      .vd-actions { position: sticky; bottom: 0; background: var(--bg, var(--card)); padding: 6px 0; z-index: 1; }
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
      .md-catx { display: flex; flex-direction: column; gap: 6px; } .md-catx-btn { align-self: flex-start; } .md-catx-fail { margin: 0; padding-left: 18px; max-height: 160px; overflow-y: auto; }
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
      .conv-link { cursor: pointer; }
      .conv-link:hover, .conv-link:focus-visible { text-decoration: underline; color: var(--accent, inherit); outline: none; }
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
      .fw-badge.draft { background: #fef9c3; color: #854d0e; } /* 2.16.3 */
      .fw-switch:disabled { opacity: .45; cursor: not-allowed; }
      .fw-draft-tip { color: #854d0e; }
      .vb-missing { margin: 4px 0 0; padding-left: 18px; font-weight: 600; }
      .act-box { gap: var(--s-2); border-color: var(--accent); }
      .act-count { font-weight: 600; color: var(--fg); }
      /* 2.12.6: ligar/desligar mais simples */
      .act-text { font-weight: 600; color: var(--fg); }
      .act-adv > summary { cursor: pointer; font-size: var(--fs-1); color: var(--muted); font-weight: 600; }
      .act-adv[open] > summary { margin-bottom: var(--s-1); }
      .fw-footer { display: flex; flex-direction: column; gap: var(--s-2); margin-top: var(--s-2); }
      .fw-safety-line { font-size: var(--fs-1); color: var(--muted); }
      .fw-save-off { background: var(--bg2); }
      .fw-state { font-weight: 700; color: var(--ok); }
      .fw-state.test { color: var(--warn); }
      .fw-switch { flex: none; position: relative; width: 34px; height: 20px; padding: 0; border: none; border-radius: 999px; background: var(--border); cursor: pointer; transition: background .15s; }
      .fw-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: left .15s; }
      .fw-switch[aria-checked="true"] { background: var(--ok); }
      .fw-switch[aria-checked="true"]::after { left: 16px; }
      .fw-switch:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 2px; }
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
      /* ═══ 2.9.2: localização, produto, catálogo, contato, Pix ═══ */
      .rp-card { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-2); border-radius: var(--r-md); background: var(--card); border: 1px solid var(--border); min-width: 0; }
      .rp-ico { flex: none; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: var(--r-sm); background: var(--bg2); font-size: var(--fs-icon); }
      .rp-thumb { flex: none; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: var(--r-sm); overflow: hidden; background: var(--bg2); font-size: var(--fs-icon); }
      .rp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .rp-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .rp-t { font-weight: 600; font-size: var(--fs-2); overflow-wrap: anywhere; }
      .rp-s { font-size: var(--fs-1); color: var(--muted); overflow-wrap: anywhere; }
      .rp-link { font-size: var(--fs-1); color: var(--accent); overflow-wrap: anywhere; }
      .rp-ed { display: flex; flex-direction: column; gap: var(--s-2); }
      .rp-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
      .rp-pick { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-2); border-radius: var(--r-md); border: 1px dashed var(--border); }
      .rp-list { display: flex; flex-direction: column; gap: var(--s-1); max-height: 260px; overflow-y: auto; }
      .rp-prow, .rp-crow { display: block; width: 100%; padding: 0; border: none; background: none; text-align: left; color: inherit; cursor: pointer; border-radius: var(--r-md); }
      .rp-prow.sel .rp-card { border-color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); }
      .rp-prow:hover .rp-card, .rp-prow:focus-visible .rp-card { border-color: var(--accent); }
      .rp-crow { display: flex; justify-content: space-between; gap: var(--s-2); padding: var(--s-1) var(--s-2); font-size: var(--fs-2); }
      .rp-crow:hover, .rp-crow:focus-visible { background: var(--accent-soft); }
      .rp-crow span { color: var(--muted); }
      .ed-varhint.err { color: var(--err); }
      /* ═══ 2.10.0: follow-up ═══ */
      .ed-follow { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; padding: var(--s-2); border-radius: var(--r-md); border: 1px solid var(--border); }
      .ed-check { display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--fs-2); font-weight: 600; cursor: pointer; }
      /* ═══ 2.12.1: erro com motivo + atalhos ═══ */
      .panel.cz-hdr-hide .qbtns .sale-quick { display: none !important; }
      .lerr { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 2px var(--s-1); min-width: 0; }
      .lerr-retry { padding: 1px 8px; border-radius: var(--r-pill); border: 1px solid color-mix(in srgb, currentColor 45%, transparent); background: var(--card); color: var(--fg); font-size: var(--fs-1); font-weight: 600; cursor: pointer; }
      .lerr-retry:hover { border-color: var(--accent); color: var(--accent-text); }
      .lerr-det { font-size: var(--fs-1); color: var(--muted); max-width: 100%; }
      .lerr-det summary { cursor: pointer; }
      .lerr-why { color: var(--fg); margin-top: 2px; }
      .lerr-raw { font-size: 11px; word-break: break-all; opacity: .8; }
      .cname-err { flex-basis: 100%; }
      /* ═══ 2.13.0: construtor visual (tela ampla, fundo claro sempre) ═══ */
      .vb {
        --bg: #ffffff; --bg2: #f4f6f8; --card: #ffffff; --fg: #111b21; --fg2: #3b4a54; --muted: #5f6f7a; --border: #dfe4e8; --border-strong: #c3ccd3;
        --hover: #f3f5f6; --ok: #15803d; --ok-soft: rgba(34,197,94,.10); --err: #dc2626; --err-soft: rgba(239,68,68,.08); --accent-text: #c2410c;
        position: fixed; inset: 0; z-index: 2147483600; display: flex; flex-direction: column; background: var(--bg2); color: var(--fg);
        font-size: var(--fs-3);
      }
      .vb[hidden] { display: none !important; }
      .vb-topwrap { flex: none; background: var(--bg); border-bottom: 1px solid var(--border); box-shadow: 0 1px 3px rgba(11,20,26,.06); }
      .vb-top { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: var(--s-3) var(--s-4); flex-wrap: wrap; }
      .vb-tl, .vb-tr { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; min-width: 0; }
      .vb-brand { font-weight: 700; color: var(--accent-text); white-space: nowrap; }
      .vb-name { height: var(--field-h); min-width: 220px; max-width: 360px; padding: 0 var(--s-2); border: 1px solid var(--border-strong); border-radius: var(--r-md); background: var(--bg); color: var(--fg); font: inherit; font-size: var(--fs-4); font-weight: 600; }
      .vb-name.vb-bad { border-color: var(--err); box-shadow: 0 0 0 3px var(--err-soft); }
      .vb-msg { padding: var(--s-2) var(--s-4); font-size: var(--fs-2); color: var(--ok); }
      .vb-msg.err { color: var(--err); font-weight: 600; background: var(--err-soft); }
      .vb .bbtn { background: var(--bg); color: var(--fg); border: 1px solid var(--border-strong); }
      .vb .bbtn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
      .vb-body { flex: 1; display: flex; min-height: 0; position: relative; }
      .vb-canvas { flex: 1; overflow: auto; padding: var(--s-6) var(--s-6) 80px; }
      .vb-inner { display: flex; flex-direction: column; align-items: center; min-width: max-content; margin: 0 auto; }
      .vb-note { max-width: 560px; margin-bottom: var(--s-3); padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; font-size: var(--fs-2); }
      .vb-zoom { position: absolute; left: var(--s-4); bottom: var(--s-4); display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: var(--r-lg); background: var(--bg); border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(11,20,26,.10); }
      .vb-zbtn { min-width: 28px; height: 28px; padding: 0 6px; border: none; border-radius: var(--r-sm); background: transparent; font-weight: 700; color: var(--fg); }
      .vb-zbtn:hover { background: var(--hover); }
      .vb-zval { min-width: 42px; text-align: center; font-size: var(--fs-2); color: var(--muted); }
      .vb-col { display: flex; flex-direction: column; align-items: center; }
      .vb-box { width: 260px; padding: var(--s-2) var(--s-3); border-radius: var(--r-lg); background: var(--card); border: 1.5px solid var(--border-strong); box-shadow: 0 1px 2px rgba(11,20,26,.06); cursor: pointer; text-align: left; position: relative; }
      .vb-box:hover { border-color: var(--accent); }
      .vb-box.vb-sel { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
      .vb-box.vb-bad { border-color: var(--err); background: #fff5f5; }
      .vb-bh { display: flex; align-items: center; gap: 6px; font-size: var(--fs-1); font-weight: 800; letter-spacing: .04em; color: var(--muted); }
      .vb-bi { font-size: 14px; }
      .vb-btxt { margin-top: 2px; font-weight: 600; color: var(--fg); overflow-wrap: anywhere; }
      .vb-bx { margin-top: 2px; font-size: var(--fs-1); color: var(--muted); }
      .vb-berr { margin-top: 4px; font-size: var(--fs-2); font-weight: 700; color: var(--err); }
      .vb-start { border-color: var(--accent); background: #fff7ed; width: 300px; }
      .vb-start .vb-bh { color: var(--accent-text); }
      .vb-esperar { border-color: #7c3aed; }
      .vb-esperar .vb-bh { color: #6d28d9; }
      .vb-pausa .vb-bh { color: #0369a1; }
      .vb-etiqueta .vb-bh { color: #0f766e; }
      .vb-fim { width: 140px; text-align: center; border-radius: var(--r-pill); background: #f1f5f9; border-color: #cbd5e1; cursor: default; }
      .vb-fim:not(.vb-auto) { cursor: pointer; }
      .vb-fim .vb-bh { justify-content: center; color: #475569; }
      .vb-fim .vb-btxt { font-weight: 400; font-size: var(--fs-1); color: var(--muted); }
      .vb-conn { display: flex; flex-direction: column; align-items: center; position: relative; }
      .vb-wire { width: 2px; height: 14px; background: #b6c0c8; }
      .vb-arrow { position: relative; height: 12px; }
      .vb-arrow::after { content: ""; position: absolute; left: -4px; bottom: -6px; border: 5px solid transparent; border-top: 6px solid #b6c0c8; }
      .vb-plus { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 1.5px solid #b6c0c8; background: var(--bg); color: var(--muted); font-weight: 800; line-height: 1; }
      .vb-plus:hover, .vb-plus.on { border-color: var(--accent); color: #fff; background: var(--accent); }
      .vb-menu { position: absolute; top: 40px; z-index: 5; display: flex; flex-direction: column; min-width: 200px; padding: 4px; border-radius: var(--r-lg); background: var(--bg); border: 1px solid var(--border); box-shadow: 0 12px 32px rgba(11,20,26,.18); }
      .vb-mi { text-align: left; padding: 8px 10px; border: none; border-radius: var(--r-md); background: transparent; color: var(--fg); font-weight: 600; }
      .vb-mi:hover:not(:disabled) { background: var(--hover); }
      .vb-mi:disabled { opacity: .5; cursor: not-allowed; }
      .vb-mi-x { color: var(--muted); font-weight: 400; border-top: 1px solid var(--border); border-radius: 0; margin-top: 2px; }
      .vb-split { display: flex; gap: var(--s-5); align-items: flex-start; margin-top: var(--s-2); padding-top: var(--s-2); border-top: 2px solid #b6c0c8; }
      .vb-lane { display: flex; flex-direction: column; align-items: center; padding: var(--s-2); border-radius: var(--r-lg); border-top: 4px solid; }
      .vb-lane.vb-yes { border-color: var(--ok); background: var(--ok-soft); }
      .vb-lane.vb-no { border-color: var(--err); background: var(--err-soft); }
      .vb-lh { font-weight: 800; font-size: var(--fs-2); padding: 2px 10px; border-radius: var(--r-pill); background: var(--bg); }
      .vb-yes > .vb-lh { color: var(--ok); }
      .vb-no > .vb-lh { color: var(--err); }
      .vb-side { flex: none; width: 360px; max-width: 42vw; overflow-y: auto; padding: var(--s-4); background: var(--bg); border-left: 1px solid var(--border); display: flex; flex-direction: column; gap: var(--s-2); }
      .vb-sh { font-size: var(--fs-4); font-weight: 800; }
      .vb-sub { color: var(--muted); font-size: var(--fs-2); }
      .vb-red { color: var(--err) !important; font-weight: 700; }
      .vb-field { display: flex; flex-direction: column; gap: 4px; padding-top: var(--s-2); border-top: 1px solid var(--border); }
      .vb-fl { font-size: var(--fs-1); font-weight: 800; letter-spacing: .04em; color: var(--muted); text-transform: uppercase; }
      .vb-radios { display: flex; flex-direction: column; gap: 2px; }
      .vb-chips { display: flex; flex-wrap: wrap; gap: 4px; }
      .vb-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--r-pill); background: #eef2f5; font-size: var(--fs-2); }
      .vb-chip.fixed { background: #fee2e2; color: #991b1b; font-weight: 600; }
      .vb-chip-x { border: none; background: transparent; padding: 0 2px; color: var(--muted); }
      .vb-mlist { display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--r-md); padding: 4px; }
      .vb-mitem { display: flex; justify-content: space-between; gap: 8px; text-align: left; padding: 6px 8px; border: none; border-radius: var(--r-sm); background: transparent; color: var(--fg); }
      .vb-mitem:hover { background: var(--hover); }
      .vb-mitem.on { background: var(--accent-soft); font-weight: 700; }
      .vb-mk { color: var(--muted); font-size: var(--fs-1); white-space: nowrap; }
      .vb-prev { display: flex; flex-direction: column; gap: 4px; padding: var(--s-2); border-radius: var(--r-md); background: #e7fbe3; border: 1px solid #c6efbe; }
      .vb-pline { display: flex; gap: 6px; font-size: var(--fs-2); }
      .vb-pk { flex: none; font-weight: 700; color: var(--ok); }
      .vb-pt { white-space: pre-wrap; overflow-wrap: anywhere; }
      .vb-del { margin-top: var(--s-3); color: var(--err) !important; }
      .vb-modal-bg { position: absolute; inset: 0; z-index: 10; display: flex; align-items: flex-start; justify-content: center; padding-top: 10vh; background: rgba(11,20,26,.35); }
      .vb-modal { width: min(720px, 92vw); max-height: 78vh; overflow-y: auto; display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-5); border-radius: var(--r-lg); background: var(--bg); box-shadow: 0 12px 32px rgba(11,20,26,.25); }
      .vb-m-on, .vb-m-test, .vb-m-close { width: min(480px, 92vw); }
      .vb-simcols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
      .vb-simcol { display: flex; flex-direction: column; gap: 4px; padding: var(--s-2); border-radius: var(--r-md); border-top: 4px solid; }
      .vb-sim-nunca { border-color: var(--err); background: var(--err-soft); }
      .vb-sim-primeiro { border-color: var(--ok); background: var(--ok-soft); }
      .vb-ev { display: flex; gap: 8px; font-size: var(--fs-2); }
      .vb-evt { flex: none; width: 92px; color: var(--muted); font-variant-numeric: tabular-nums; }
      .vb-ev-enviar .vb-evx { font-weight: 700; }
      .vb-ev-respondeu .vb-evx { color: var(--ok); font-weight: 700; }
      .vb-ev-nao .vb-evx { color: var(--err); }
      .vb-ev-fim .vb-evx { color: var(--muted); font-style: italic; }
      .vb-tpls { flex: 1; overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: var(--s-3); padding: var(--s-6); }
      .vb-h { margin: 0; font-size: 20px; }
      .vb-tgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--s-3); width: min(1000px, 100%); }
      /* 2.13.2: horários */
      .vb-time { width: 110px !important; }
      .vb-days { display: flex; flex-wrap: wrap; gap: 4px; }
      .vb-day { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: var(--r-pill); background: #eef2f5; font-size: var(--fs-2); cursor: pointer; }
      .vb-dlimit { width: 140px !important; }
      /* 2.14.3: horário por dia da semana */
      .wk { display: flex; flex-direction: column; gap: 4px; }
      .wk-head { display: flex; justify-content: flex-end; }
      .wk-row { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; border-top: 1px solid #eef2f5; }
      .wk-day { flex: 0 0 64px; display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: var(--fs-2); padding-top: 6px; cursor: pointer; }
      .wk-cells { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      .wk-win { display: inline-flex; align-items: center; gap: 4px; }
      .wk-closed { color: var(--muted); font-size: var(--fs-2); padding-top: 6px; }
      .wk-off .wk-day { color: var(--muted); }
      .wk-warn { padding: 2px 6px; }
      /* 2.14.1: "⋯" Mais opções */
      .more-wrap { position: relative; display: inline-flex; }
      .more-btn { min-width: 34px; padding-left: 8px; padding-right: 8px; font-weight: 700; letter-spacing: 1px; }
      .more-menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 60; display: flex; flex-direction: column; min-width: 230px; padding: 4px; background: #fff; border: 1px solid #e2e8f0; border-radius: var(--r-md); box-shadow: 0 8px 24px rgba(15, 23, 42, .14); }
      .more-menu[hidden] { display: none; }
      .more-item { text-align: left; padding: 8px 10px; border: 0; background: none; border-radius: 6px; font: inherit; font-size: var(--fs-2); color: inherit; cursor: pointer; white-space: nowrap; }
      .more-item:hover, .more-item:focus-visible { background: #f1f5f9; outline: none; }
      .more-item[disabled] { opacity: .5; cursor: default; }
      .fw-listhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      /* 2.14.0: disparos */
      .dp-speed { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
      .dp-speed-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px; }
      .dp-var { display: flex; gap: 6px; align-items: flex-start; flex-wrap: wrap; }
      .dp-var .dp-var-text { flex: 1 1 220px; }
      .dp-pv-text { white-space: pre-wrap; font-size: var(--fs-2); padding: 6px 0; }
      .dp-adv summary { cursor: pointer; }
      .dp-vrow { font-size: var(--fs-2); }
      /* 2.13.4: "+ Nova etiqueta…" ali mesmo */
      .lc-form { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; width: 100%; margin-top: 4px; padding: 8px; border: 1px dashed var(--line, #cbd5e1); border-radius: var(--r-md); background: #f8fafc; }
      .lc-form .lc-name { flex: 1 1 160px; min-width: 120px; }
      .lc-colors { display: flex; flex-wrap: wrap; gap: 4px; }
      .lc-color { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
      .lc-color[aria-pressed="true"] { border-color: #111827; box-shadow: 0 0 0 2px #fff inset; }
      .lc-msg { flex-basis: 100%; font-size: var(--fs-1); color: var(--muted); }
      .lc-msg:empty { display: none; }
      .lc-msg.err { color: #b91c1c; }
      .vb-warn { padding: 6px 8px; border-radius: var(--r-md); background: #fef9c3; border: 1px solid #fde047; color: #854d0e; font-size: var(--fs-2); font-weight: 600; }
      .vb-tpl { display: flex; flex-direction: column; gap: 6px; padding: var(--s-4); border-radius: var(--r-lg); background: var(--bg); border: 1.5px solid var(--border-strong); text-align: left; color: var(--fg); }
      .vb-tpl:hover:not(:disabled) { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
      .vb-tname { font-weight: 800; font-size: var(--fs-4); }
      .vb-thelp { color: var(--muted); font-size: var(--fs-2); }
      @media (max-width: 900px) { .vb-side { width: 300px; } .vb-simcols { grid-template-columns: 1fr; } }
      /* ═══ 2.12.0: sequências ═══ */
      .sq-list { display: flex; flex-direction: column; gap: var(--s-2); }
      .sq-node { display: flex; flex-direction: column; gap: var(--s-1); padding: var(--s-2); border-radius: var(--r-md); border: 1px solid var(--border); background: var(--card); }
      .sq-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); }
      .sq-title { font-weight: 700; font-size: var(--fs-2); }
      .sq-ctl { display: inline-flex; gap: 2px; }
      .sq-esperar { border-color: var(--accent); }
      .sq-branches { display: grid; grid-template-columns: 1fr; gap: var(--s-2); margin-top: var(--s-1); }
      .panel:not(.w-narrow) .sq-branches { grid-template-columns: 1fr 1fr; }
      .sq-branch { padding: var(--s-2); border-radius: var(--r-md); border-left: 4px solid; min-width: 0; }
      .sq-yes { border-color: var(--ok); background: var(--ok-soft); }
      .sq-no { border-color: var(--err); background: var(--err-soft); }
      .sq-btitle { font-weight: 700; font-size: var(--fs-2); margin-bottom: var(--s-1); }
      .sq-end { font-size: var(--fs-1); color: var(--muted); font-weight: 600; }
      .sq-add { flex-wrap: wrap; }
      .sq-stats .sq-yes, .sq-stats .sq-no { background: none; padding: 0; border: none; }
      .sq-stats .sq-yes { color: var(--ok); }
      .sq-stats .sq-no { color: var(--err); }
      .cseq { margin: 0 var(--s-3) var(--s-2); display: flex; flex-direction: column; gap: var(--s-1); }
      .cseq[hidden] { display: none; }
      .cseq-line { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); flex-wrap: wrap; padding: var(--s-1) var(--s-2); border-radius: var(--r-md); background: var(--accent-soft); font-size: var(--fs-1); font-weight: 600; }
      .cseq-btns { display: inline-flex; gap: var(--s-1); }
      .cdel { margin: 0 var(--s-3) var(--s-2); display: flex; flex-direction: column; gap: 2px; padding: var(--s-1) var(--s-2); border-radius: var(--r-md); background: var(--bg2); font-size: var(--fs-1); }
      .cdel[hidden] { display: none; }
      .cdel-t { font-weight: 700; color: var(--muted); }
      .cdel-row { display: flex; gap: 6px; align-items: baseline; text-align: left; border: 0; background: none; padding: 2px 0; font: inherit; color: inherit; cursor: pointer; min-width: 0; }
      .cdel-row:hover .cdel-p { text-decoration: underline; }
      .cdel-k { font-weight: 600; flex: none; }
      .cdel-p { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
      .panel.sec-labels .cdel, .panel.sec-sched .cdel, .panel.sec-disparos .cdel, .panel.sec-vendas .cdel, .panel.sec-midias .cdel, .panel.editing .cdel, .panel.diag .cdel { display: none; }
      .panel.sec-labels .cseq, .panel.sec-sched .cseq, .panel.sec-disparos .cseq, .panel.sec-vendas .cseq, .panel.sec-midias .cseq, .panel.editing .cseq, .panel.diag .cseq { display: none; }
      /* ═══ 2.11.0: automações mais simples ═══ */
      .fw-models { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--s-2); }
      button.fw-model { text-align: left; cursor: pointer; font: inherit; color: inherit; display: flex; flex-direction: column; gap: var(--s-1); }
      button.fw-model:hover, button.fw-model:focus-visible { border-color: var(--accent); outline: none; }
      .fw-blank { border-style: dashed; }
      .fw-more { margin-top: var(--s-2); }
      .fw-more > summary { cursor: pointer; font-size: var(--fs-2); font-weight: 600; color: var(--accent-text); }
      .fw-steps { display: flex; gap: var(--s-1); list-style: none; margin: 0 0 var(--s-2); padding: 0; flex-wrap: wrap; }
      .fw-steps li { flex: 1; min-width: 60px; padding: var(--s-1) var(--s-2); border-radius: var(--r-pill); background: var(--bg2); color: var(--muted); font-size: var(--fs-1); font-weight: 700; text-align: center; }
      .fw-steps li.on { background: var(--accent); color: var(--on-accent); }
      .fw-steps li.done { background: var(--accent-soft); color: var(--accent-text); }
      .fw-q { font-weight: 600; font-size: var(--fs-3); }
      .fw-sentence { font-size: var(--fs-2); line-height: 1.45; }
      .fw-stats { display: flex; gap: var(--s-3); flex-wrap: wrap; font-size: var(--fs-1); color: var(--muted); font-weight: 600; }
      .fw-stage { gap: var(--s-2); }
      .fw-msgpick { display: flex; flex-direction: column; gap: var(--s-1); }
      .fw-info { display: inline-flex; flex-direction: column; vertical-align: middle; }
      .fw-lbl { display: inline-flex; align-items: center; gap: var(--s-1); flex-wrap: wrap; }
      .fw-i { width: 16px; height: 16px; padding: 0; border-radius: 50%; border: 1px solid var(--muted); background: transparent; color: var(--muted); font-size: 10px; font-weight: 700; font-style: italic; line-height: 1; cursor: help; }
      .fw-i:hover, .fw-i:focus-visible { border-color: var(--accent); color: var(--accent-text); outline: none; }
      .fw-tip { margin-top: var(--s-1); padding: var(--s-1) var(--s-2); border-radius: var(--r-sm); background: var(--bg2); font-size: var(--fs-1); font-weight: 400; color: var(--fg); max-width: 300px; }
      .fw-invalid { outline: 2px solid var(--err); outline-offset: 2px; border-radius: var(--r-sm); }
      .fw-errmsg { color: var(--err); font-size: var(--fs-1); font-weight: 600; }
      .ed-forauto { border-left: 3px solid var(--accent); padding-left: var(--s-2); }
      /* ═══ 2.10.5: venda do ERP ligada à compra do 📈 ═══ */
      .cv-link { display: flex; flex-direction: column; gap: var(--s-1); margin-top: var(--s-1); }
      .cv-linkrow, .cv-salerow { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); flex-wrap: wrap; }
      .cv-linked { font-weight: 600; color: var(--ok); font-size: var(--fs-2); }
      .cv-sale { font-size: var(--fs-2); min-width: 0; overflow-wrap: anywhere; }
      .cv-link .bbtn { min-height: var(--hit); }
      /* ═══ 2.10.4: prévia — tirar partes deste envio ═══ */
      .pv-pt { display: flex; flex-direction: column; gap: var(--s-1); padding: var(--s-1) var(--s-2) var(--s-2); border-radius: var(--r-md); border: 1px solid var(--border); background: var(--card); }
      .pv-pt.off { opacity: .55; border-style: dashed; }
      .pv-pt.off .bubble, .pv-pt.off .pv-doc, .pv-pt.off .rp-card { text-decoration: line-through; }
      .pv-pt.off .pv-media, .pv-pt.off .pv-albx, .pv-pt.off .rp-card { filter: grayscale(1); }
      .pv-ph { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); min-height: 22px; }
      .pv-pl { margin: 0; }
      .pv-x { flex: none; width: 22px; height: 22px; padding: 0; border: none; border-radius: var(--r-pill); background: transparent; color: var(--muted); font-size: 12px; line-height: 1; cursor: pointer; }
      .pv-x:hover, .pv-x:focus-visible { background: var(--err-soft); color: var(--err); outline: none; }
      .pv-offnote { font-size: var(--fs-1); color: var(--muted); font-weight: 600; }
      .pv-undo { padding: 0; border: none; background: none; color: var(--accent-text); font: inherit; text-decoration: underline; cursor: pointer; }
      .pv-albx { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: var(--s-1); }
      .pv-cell { position: relative; aspect-ratio: 1; border-radius: var(--r-sm); overflow: hidden; background: var(--bg2); }
      .pv-cell.off .alb-thumb { opacity: .3; filter: grayscale(1); }
      .pv-fx { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; padding: 0; border: none; border-radius: var(--r-pill); background: rgba(0,0,0,.6); color: #fff; font-size: 11px; cursor: pointer; }
      .pv-fx:hover, .pv-fx:focus-visible { background: var(--err); outline: none; }
      .pv-cell.off .pv-fx { background: var(--accent); }
      .pv-total { font-size: var(--fs-1); color: var(--muted); font-weight: 600; }
      .pv-send:disabled { opacity: .5; cursor: default; }
      /* ═══ 2.10.2: painel personalizável ═══ */
      .ptop { flex: 0 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; }
      .panel.sec-msg.top-limited .ptop { max-height: var(--top-max); }
      .psplit { flex: none; position: relative; z-index: 3; height: 10px; margin: -5px 0; cursor: row-resize; touch-action: none; }
      .psplit::after { content: ""; position: absolute; left: var(--s-3); right: var(--s-3); top: 4px; height: 2px; border-radius: 2px; background: var(--accent); opacity: 0; transition: opacity .15s; }
      .psplit:hover::after, .psplit:focus-visible::after, .panel.splitting .psplit::after { opacity: 1; }
      .psplit:focus-visible { outline: none; }
      .panel:not(.sec-msg) .psplit, .panel.editing .psplit, .panel.diag .psplit { display: none; }
      .panel.splitting, .panel.splitting * { cursor: row-resize !important; user-select: none !important; }
      .cs-toggle { flex: none; align-self: center; width: 20px; height: 20px; padding: 0; margin: 0 -2px 0 -4px; border: none; border-radius: var(--r-xs); background: transparent; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
      .cs-toggle svg { width: 14px; height: 14px; transition: transform .15s; }
      .cs-toggle[aria-expanded="true"] svg { transform: rotate(90deg); }
      .cz[hidden], .cname[hidden] { display: none !important; }
      .cs-toggle:hover { color: var(--fg); background: var(--bg2); }
      .cs-toggle:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
      .cs-sum { display: none; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-2); color: var(--muted); }
      .cs-sum b { color: var(--fg); font-weight: 600; }
      .cs-collapsed > .cs-holder > :not(.cs-toggle):not(.cs-sum), .cs-holder.cs-collapsed > :not(.cs-toggle):not(.cs-sum) { display: none !important; }
      .cs-collapsed > .cs-holder > .cs-sum, .cs-holder.cs-collapsed > .cs-sum { display: block; }
      .tools.cs-collapsed .filters { display: none; }
      .tools.cs-collapsed .trow { padding-bottom: var(--s-2); }
      .trow > .cs-toggle + .search { flex: 1 1 calc(100% - 30px); }
      .status.cs-collapsed { padding-top: var(--s-1); padding-bottom: var(--s-1); }
      .panel.cz-no-venda .qbtns .sale-quick:not(.conv-quick), .panel.cz-no-compra .qbtns .conv-quick:not(.auto-quick), .panel.cz-no-automacao .qbtns .auto-quick, .panel.cz-no-proxima .qbtns .next-chat { display: none !important; }
      .next-chat { margin: 0; min-height: var(--hit); padding: 0 var(--s-2); border-radius: var(--r-pill); border: 1px solid color-mix(in srgb, currentColor 45%, transparent); background: var(--card); color: var(--fg); font-size: var(--fs-1); font-weight: 600; white-space: nowrap; cursor: pointer; }
      .next-chat:hover { border-color: var(--accent); color: var(--accent-text); }
      .next-chat[hidden] { display: none; }
      .chip.cz-more { border-style: dashed; color: var(--muted); }
      .vd-name-opts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: -2px 0 8px; }
      .vd-name-opts .chip { padding: 1px 8px; font-size: var(--fs-1); }
      .vd-name-sep { color: var(--muted); font-size: var(--fs-1); }
      .cz { position: absolute; top: 52px; right: var(--s-2); left: var(--s-2); z-index: 20; max-height: calc(100vh - 70px); overflow-y: auto; padding: var(--s-3); border-radius: var(--r-lg); background: var(--card); border: 1px solid var(--border); box-shadow: var(--sh-3); display: flex; flex-direction: column; gap: var(--s-3); animation: fadeIn .12s ease both; }
      .cz-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); font-weight: 700; font-size: var(--fs-3); }
      .cz-grp { display: flex; flex-direction: column; gap: var(--s-1); }
      .cz-grp > .cz-t { font-size: var(--fs-1); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
      .cz-opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 2px var(--s-2); }
      .cz-opt { display: flex; align-items: center; gap: var(--s-2); min-height: 28px; font-size: var(--fs-2); cursor: pointer; }
      .cz-opt input { margin: 0; accent-color: var(--accent); }
      .cz-opt.fixed { opacity: .6; cursor: default; }
      .cz-seg { display: inline-flex; padding: 2px; border-radius: var(--r-md); background: var(--bg2); gap: 2px; align-self: flex-start; }
      .cz-seg button { padding: 4px var(--s-3); border: none; border-radius: var(--r-sm); background: transparent; color: var(--muted); font-size: var(--fs-2); font-weight: 600; cursor: pointer; }
      .cz-seg button.on { background: var(--card); color: var(--accent-text); box-shadow: 0 1px 3px var(--shadow); }
      .cz-note { font-size: var(--fs-1); color: var(--muted); }
      .cz-foot { display: flex; justify-content: space-between; gap: var(--s-2); padding-top: var(--s-2); border-top: 1px solid var(--border); }
      /* densidade compacta: menos espaço, texto nunca abaixo de 11 px */
      .panel.dense { --fs-1: 11px; --fs-2: 11px; --fs-3: 12px; --fs-4: 14px; --s-1: 3px; --s-2: 6px; --s-3: 9px; --s-4: 12px; --s-5: 15px; --s-6: 18px; --hit: 24px; --field-h: 28px; }
      .panel.dense .head { padding: 8px 6px 8px 12px; }
      .panel.dense .pnav > button, .panel.dense .pmore { min-height: 38px; }
      .panel.dense .pnav > button svg, .panel.dense .pmore svg { width: 16px; height: 16px; }
      .panel.dense .card { padding-top: 6px; padding-bottom: 6px; }
      .panel.dense .chip { padding-top: 2px; padding-bottom: 2px; min-height: 24px; }
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
      <aside class="panel sec-msg" aria-label="Mensagens">
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
        <div class="ptop">
        <div class="status warn"><span class="dot"></span><span class="txt"></span><span class="qbtns"><button class="sale-quick" type="button" title="Registrar venda desta conversa" hidden>💰 Venda</button><button class="sale-quick conv-quick" type="button" title="Enviar compra desta conversa para o Facebook" hidden>📈 Compra p/ Facebook</button><button class="sale-quick conv-quick auto-quick" type="button" title="Adicionar esta conversa a uma automação" hidden>🔁 Automação</button><button class="next-chat" type="button" title="Abrir a conversa logo abaixo desta na lista" hidden>Próxima ▼</button></span></div>
        <div class="labels">
          <span class="lbl">Etiquetas CRM</span>
          <div class="chips"></div>
          <button class="add" type="button" title="Marcar etiquetas CRM" aria-label="Marcar etiquetas CRM" aria-haspopup="true" aria-expanded="false" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>
          <div class="lmenu" role="menu" hidden></div>
        </div>
        <div class="cname" role="group" aria-label="Nome para mensagens" hidden></div>
        <div class="cbuy" hidden>💰 compra enviada</div>
        <div class="cseq" hidden></div>
        <div class="cdel" hidden></div>
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
        </div>
        <div class="psplit" role="separator" aria-orientation="horizontal" aria-label="Espaço do topo do painel" tabindex="0" title="Arraste para mudar o espaço do topo · duplo clique volta ao padrão"></div>
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
    panel.classList.toggle('sec-msg', state.section === 'mensagens'); // 2.10.2: divisória do topo só em Mensagens
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
      statusEl.classList.add('ok'); statusEl.classList.remove('warn'); // 2.10.2: classList (mantém o recolhido)
      statusTxt.textContent = `Conversa: ${fullName || 'contato sem nome'}`;
    } else {
      statusEl.classList.add('warn'); statusEl.classList.remove('ok');
      statusTxt.textContent = conv ? 'Esta conversa não tem caixa de mensagem' : 'Abra uma conversa para enviar';
    }
    statusTxt.title = statusTxt.textContent;
    if (prevFirst !== null && prevFirst !== state.ctx.firstName) refreshOpenBubble();
    onConversationIdentity(state.ctx.identity);
    renderSaleQuick();
    scheduleChatCheck();
    csRefreshSums(); // 2.10.2: resumo das seções recolhidas (só as recolhidas)
    if (pz.ready) renderNextBtn(); // 2.10.3
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
    // 2.12.1: 3 tentativas; se falhar, o motivo aparece na linha do nome (antes ficava "—" sem dizer nada)
    try { r = await globalThis.TspEngine.withRetry(() => call('getChatName', { chatId })); chatNames.readErr.delete(chatId); } catch (e) { r = null; chatNames.readErr.set(chatId, String((e && e.message) || e)); }
    if (!r) return chatNames.map.get(chatId) || null;
    chatNames.available = r.available !== false;
    if (r.available === false) return null;
    const v = { name: r.name || null, source: r.source || null };
    chatNames.map.set(chatId, v);
    return v;
  }
  // nome do {nome} para um envio (agendado, disparo, automação): à mão → da venda → aprendido → vazio; sem a tabela, o de antes
  async function nameForChat(chatId, fallback = '') {
    if (chatNames.available === false) return fallback || '';
    const v = await loadChatName(chatId);
    if (chatNames.available === false) return fallback || '';
    return (v && v.name) || '';
  }
  // 2.13.3: a venda gravou o nome "da venda" (o servidor nunca troca o definido à mão): mostra já
  function chatNameFromSaleResult(chatId, r) {
    if (!r || !r.name || !CHAT_ID_OK.test(chatId || '')) return;
    chatNames.map.set(chatId, { name: r.name, source: r.source || 'venda' });
    if (chatNames.current === chatId) { state.ctx = getContext(); renderNameRow(); refreshOpenBubble(); }
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
    try { loadChatSequence(chatId).catch(() => {}); } catch { /* 2.12.0: ainda iniciando */ }
    try { delLoadChat(chatId).catch(() => {}); } catch { /* 2.15.0: ainda iniciando */ }
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
  // 2.12.1: antes, a fila da ponte era esvaziada e uma gravação que falhava (rede, extensão reiniciando,
  // aba com a versão velha da extensão) perdia o nome para sempre. Agora fica guardado e tenta de novo.
  const nameLearner = globalThis.TspEngine.createNameLearner({
    save: async (chatId, name) => {
      const r = await globalThis.TspEngine.withRetry(() => call('setChatName', { chatId, name, source: 'aprendido' }));
      if (!r) throw new Error('Sem resposta da extensão');
      return r;
    },
    blocked: (chatId) => learnBlocked(chatId),
  });
  let learnBusy = false;
  async function learnFlush(opts) {
    if (learnBusy) return;
    learnBusy = true;
    try {
      const done = await nameLearner.flush(opts);
      done.forEach(({ chatId, result: r }) => { chatNames.map.set(chatId, { name: r.name || null, source: r.source || null }); chatNames.readErr.delete(chatId); });
      const cur = chatNames.current;
      if (cur && (done.some((d) => d.chatId === cur) || nameLearner.error(cur))) { state.ctx = getContext(); renderNameRow(); refreshOpenBubble(); }
    } finally { learnBusy = false; }
  }
  async function learnTick() {
    if (chatNames.available === false) return;
    let got = null;
    try { got = await waRequest('myMessages', {}, { timeout: 2000 }); } catch { got = null; }
    if (Array.isArray(got) && got.length) nameLearner.push(got);
    if (nameLearner.size()) await learnFlush();
  }
  setInterval(() => { learnTick().catch(() => {}); }, 4000);
  // descobre já se a tabela existe (sem ela, o {nome} funciona como antes)
  call('getChatName', { chatId: '1@c.us' }).then((r) => { if (r && chatNames.available === null) chatNames.available = r.available !== false; }).catch(() => {});

  // "Nome: Fernanda ✏️" na área de cima (perto das etiquetas CRM)
  const cn = { editing: false, busy: false };
  // 2.10.2: a linha é refeita a cada mudança; a setinha de recolher volta junto
  function renderNameRow() {
    renderNameRowInner();
    csDecorate('nome');
  }
  function renderNameRowInner() {
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
    if (v.name) box.append(el('span', 'cname-src', v.source === 'manual' ? 'definido por você' : v.source === 'venda' ? 'da venda' : 'aprendido da sua mensagem'));
    // 2.12.1: o que deu errado, com o motivo e "Tentar de novo"
    const lerr = nameLearner.error(chatId);
    const rerr = !lerr && !chatNames.map.has(chatId) ? chatNames.readErr.get(chatId) : null;
    if (lerr || rerr) {
      const raw = lerr ? lerr.detail : rerr;
      const line = el('span', 'lerr cname-err');
      line.append(el('span', 'none', lerr ? `Não consegui gravar o nome aprendido “${lerr.name}”` : 'Não consegui ler o nome desta conversa'));
      const retry = el('button', 'lerr-retry', 'Tentar de novo');
      retry.type = 'button';
      retry.addEventListener('click', () => {
        if (lerr) { learnFlush({ force: true, only: chatId }).catch(() => {}); return; }
        chatNames.readErr.delete(chatId);
        renderNameRow();
        loadChatName(chatId).then(() => { if (chatNames.current === chatId) { state.ctx = getContext(); renderNameRow(); refreshOpenBubble(); } });
      });
      const det = el('details', 'lerr-det');
      det.append(el('summary', null, 'Detalhes'), el('div', 'lerr-why', globalThis.TspEngine.errorReason(raw)), el('div', 'lerr-raw', raw || ''));
      line.append(retry, det);
      box.append(line);
    }
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
      state.convErrorMsg = '';
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
      // 2.12.1: 3 tentativas (rede, Supabase lento, extensão reiniciando); o motivo real fica nos detalhes
      const ids = await globalThis.TspEngine.withRetry(() => call('getContactLabels', { identity: identityPayload(identity) }));
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
        state.convErrorMsg = '';
      }
    } catch (e) {
      if (state.convKey === key) { state.convError = true; state.convErrorMsg = String((e && e.message) || e); }
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
      if (state.convError && !state.convLoading) lchipsEl.append(convErrorEl());
      else if (!applied.length) lchipsEl.append(el('span', 'none', state.convLoading ? '…' : 'Nenhuma'));
    }
    laddBtn.hidden = !canLabel(identity);
    if (state.menuOpen) renderMenu();
    renderConvTab();
    try { if (hdr.pop) hdrPopList(); } catch { /* 2.12.1: atalhos ainda iniciando */ }
  }

  // 2.12.1: "Não consegui carregar" com o motivo real (Detalhes) e "Tentar de novo"
  function convErrorEl(text = 'Não consegui carregar') {
    const box = el('span', 'lerr');
    box.append(el('span', 'none', text));
    const retry = el('button', 'lerr-retry', 'Tentar de novo');
    retry.type = 'button';
    retry.addEventListener('click', (e) => { e.stopPropagation(); retryConvLabels(); });
    const det = el('details', 'lerr-det');
    det.append(el('summary', null, 'Detalhes'), el('div', 'lerr-why', globalThis.TspEngine.errorReason(state.convErrorMsg)), el('div', 'lerr-raw', state.convErrorMsg || ''));
    det.addEventListener('click', (e) => e.stopPropagation());
    box.append(retry, det);
    return box;
  }
  function retryConvLabels() {
    if (!state.convKey) return;
    state.convError = false;
    state.convErrorMsg = '';
    state.convLoading = true;
    renderLabelsRow();
    loadConvLabels(state.convKey);
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
    if (!warning && state.convError) ltChips.append(convErrorEl('Não consegui carregar as etiquetas CRM desta conversa.'));
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
      // 2.14.4: abre a conversa (função única); sem telefone, coloca o nome na busca do WhatsApp (como antes)
      b.classList.add('conv-link');
      b.title = c.phone ? 'Abrir conversa' : 'Colocar na busca do WhatsApp';
      b.append(el('span', 'n', c.name || formatPhone(c.phone) || '—'));
      if (c.phone && c.name) b.append(el('span', 'p', formatPhone(c.phone)));
      else if (!c.phone) b.append(el('span', 'p byname', 'só pelo nome'));
      b.addEventListener('click', () => openConversation({ phone: c.phone, chatId: c.chat_id || null, name: c.name }, { noTarget: () => searchClientInWhatsApp(c) }));
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

  // 2.14.4: UMA função para "abrir conversa" em toda a extensão (Quadro, lista de clientes da etiqueta, Agendados,
  // Disparos, automações, Resultados e vendas). A ponte abre pelo id (carregada, arquivada, não carregada, @lid) e
  // depois pelo telefone; só se tudo falhar aparece o aviso com o número e "Copiar número".
  const phoneOfChatId = (id) => { const m = /^(\d{8,15})@c\.us$/.exec(String(id || '')); return m ? m[1] : null; };
  let convOpening = false;
  async function openConversation(target, { notify = toast, onOpened = null, noTarget = null } = {}) {
    const t = target || {};
    const chatId = typeof t.chatId === 'string' && /^[0-9]+@(c\.us|lid)$/.test(t.chatId) ? t.chatId : null;
    const digits = String(t.phone || '').replace(/\D/g, '');
    const phone = /^\d{8,15}$/.test(digits) ? digits : phoneOfChatId(chatId);
    if (!chatId && !phone && noTarget) { noTarget(); return false; }
    if (convOpening) return false;
    if (chatId || phone) {
      convOpening = true;
      try {
        const r = await waRequest('openChat', { chatId, phone }, { timeout: 25000 });
        if (r && r.opened) { if (onOpened) onOpened(); return true; }
      } catch { /* aviso abaixo */ } finally { convOpening = false; }
    }
    const who = t.name || (phone ? formatPhone(phone) : '') || 'este contato';
    if (phone) notify(`Não consegui abrir a conversa de ${who} no WhatsApp Web. Número: ${formatPhone(phone)}`, 'error', 10000, { label: 'Copiar número', onClick: async () => { notify(await copyToClipboard(phone) ? `Número copiado: ${phone}` : 'Não consegui copiar o número.', 'info', 4000); } });
    else notify(`Não consegui abrir a conversa de ${who} no WhatsApp Web (sem número salvo). Procure pelo nome.`, 'error', 8000);
    return false;
  }
  // Nome ou número clicável (mão + "Abrir conversa"); o clique não chega ao cartão/linha de fora
  function convLink(node, target, opts) {
    node.classList.add('conv-link');
    node.title = 'Abrir conversa';
    node.tabIndex = 0;
    node.setAttribute('role', 'link');
    const go = (e) => { e.stopPropagation(); e.preventDefault(); openConversation(typeof target === 'function' ? target() : target, typeof opts === 'function' ? opts() : opts); };
    node.addEventListener('click', go);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    return node;
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
  // 2.10.2: os filtros desligados no Personalizar ficam atrás de "+ filtros"
  pz.moreChip = el('button', 'chip cz-more', '+ filtros');
  pz.moreChip.type = 'button';
  pz.moreChip.addEventListener('click', () => { pz.filtersOpen = !pz.filtersOpen; renderFilters(); });
  filtersEl.appendChild(pz.moreChip);

  function renderFilters() {
    if (Rich.isRich(state.filter) && !state.richAvailable) state.filter = 'tudo';
    const shown = new Set(['tudo', ...pz.prefs.filters]);
    let hiddenAvail = 0;
    filtersEl.querySelectorAll('.chip[data-id]').forEach((c) => {
      const id = c.dataset.id;
      const avail = !(Rich.isRich(id) && !state.richAvailable); // 2.9.2: só com a migration
      const pick = shown.has(id) || id === state.filter; // o filtro em uso sempre aparece
      if (avail && !pick) hiddenAvail++;
      c.hidden = !avail || (!pick && !pz.filtersOpen);
      const active = id === state.filter;
      c.classList.toggle('active', active);
      c.setAttribute('aria-pressed', String(active));
    });
    if (pz.moreChip) {
      pz.moreChip.hidden = !hiddenAvail;
      pz.moreChip.textContent = pz.filtersOpen ? '− filtros' : `+ filtros (${hiddenAvail})`;
      pz.moreChip.setAttribute('aria-expanded', String(pz.filtersOpen));
    }
    csRefreshSums();
  }

  // ── 2.10.2: painel personalizável ──────────────────────────────────────────
  const E2P = globalThis.TspEngine;
  const ptopEl = shadow.querySelector('.ptop');
  const psplitEl = shadow.querySelector('.psplit');
  // blocos do topo: block = o que recolhe; holder = onde ficam a setinha e o resumo (uma linha)
  const CS_BLOCKS = {
    conv: { title: 'Conversa', block: () => statusEl, holder: () => statusEl },
    etiquetas: { title: 'Etiquetas CRM', block: () => labelsEl, holder: () => labelsEl },
    nome: { title: 'Nome', block: () => shadow.querySelector('.cname'), holder: () => shadow.querySelector('.cname') },
    busca: { title: 'Busca e filtros', block: () => shadow.querySelector('.tools'), holder: () => shadow.querySelector('.tools .trow') },
  };
  const csText = (node) => [...node.childNodes].filter((n) => !(n.classList && (n.classList.contains('cs-toggle') || n.classList.contains('cs-sum') || n.classList.contains('lmenu'))))
    .map((n) => (n.textContent || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
  function csSummary(key) {
    if (key === 'conv') return ['Conversa', statusEl.querySelector('.txt').textContent.replace(/^Conversa:\s*/, '') || '—'];
    if (key === 'etiquetas') {
      const names = [...labelsEl.querySelectorAll('.chips > *')].map((c) => (c.textContent || '').trim()).filter(Boolean);
      return ['Etiquetas CRM', names.length ? names.join(', ') : csText(labelsEl.querySelector('.chips')) || 'nenhuma'];
    }
    if (key === 'nome') { const b = CS_BLOCKS.nome.block(); return ['Nome', b ? csText(b).replace(/^Nome:\s*/, '').replace(/✏️/g, '').trim() || '—' : '—']; }
    const f = (FILTERS.find(([id]) => id === state.filter) || [null, 'Tudo'])[1];
    return ['Busca e filtros', `${f}${state.search.trim() ? ` · "${state.search.trim()}"` : ''}`];
  }
  function csDecorate(key) {
    if (!pz.ready) return; // ainda iniciando (o módulo é montado logo abaixo)
    const cfg = CS_BLOCKS[key];
    const block = cfg.block();
    const holder = cfg.holder();
    if (!block || !holder) return;
    holder.classList.add('cs-holder');
    let btn = holder.querySelector(':scope > .cs-toggle');
    if (!btn) {
      btn = el('button', 'cs-toggle');
      btn.type = 'button';
      btn.addEventListener('click', (e) => { e.stopPropagation(); pz.prefs.collapsed[key] = !pz.prefs.collapsed[key]; savePrefs(); csApply(key); });
      holder.prepend(btn);
    }
    if (!holder.querySelector(':scope > .cs-sum')) holder.append(el('div', 'cs-sum'));
    csApply(key);
  }
  function csApply(key) {
    const cfg = CS_BLOCKS[key];
    const block = cfg.block();
    const holder = cfg.holder();
    if (!block || !holder) return;
    const collapsed = !!pz.prefs.collapsed[key];
    block.classList.toggle('cs-collapsed', collapsed);
    const btn = holder.querySelector(':scope > .cs-toggle');
    if (btn) {
      if (!btn.firstChild) btn.innerHTML = svg('chevron'); // ▸ recolhido · ▾ aberto (gira pelo CSS)
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.title = `${collapsed ? 'Abrir' : 'Recolher'}: ${cfg.title}`;
      btn.setAttribute('aria-label', btn.title);
    }
    if (collapsed) csSum(key);
  }
  function csSum(key) {
    const holder = CS_BLOCKS[key].holder();
    const box = holder && holder.querySelector(':scope > .cs-sum');
    if (!box) return;
    const [t, v] = csSummary(key);
    const text = `${t}: ${v}`;
    if (box.title === text) return;
    box.title = text;
    box.textContent = '';
    box.append(el('b', null, `${t}: `), v);
  }
  function csRefreshSums() {
    if (!pz.ready) return;
    Object.keys(CS_BLOCKS).forEach((k) => { if (pz.prefs.collapsed[k]) csSum(k); });
  }

  // Abas: as ligadas ficam na barra (na ordem de sempre), as outras em "Mais"; Mensagens nunca some
  const pmoreWrap = shadow.querySelector('.pmore-wrap');
  const tabKey = (b) => b.dataset.sec || (b.classList.contains('pboard') ? 'quadro' : null);
  function applyTabs() {
    const nav = shadow.querySelector('.pnav');
    E2P.PANEL_TABS.forEach((k) => {
      const b = navBtns.find((x) => tabKey(x) === k);
      if (!b) return;
      if (pz.prefs.tabs[k]) nav.insertBefore(b, pmoreWrap);
      else pmenuEl.append(b);
    });
    pmoreWrap.hidden = !pmenuEl.querySelector('button');
    renderPanelNav();
  }

  // Altura do topo (divisória arrastável); duplo clique volta ao padrão (sem limite)
  function applyTopH() {
    const on = pz.prefs.topH != null;
    panel.classList.toggle('top-limited', on);
    if (on) panel.style.setProperty('--top-max', `${pz.prefs.topH}px`);
    else panel.style.removeProperty('--top-max');
    psplitEl.setAttribute('aria-valuenow', String(Math.round(ptopEl.getBoundingClientRect().height)));
  }
  function setTopH(h, save = true) {
    pz.prefs.topH = h == null ? null : E2P.clampTopH(h, panel.getBoundingClientRect().height);
    applyTopH();
    if (save) savePrefs();
  }
  let splitDrag = null;
  psplitEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    splitDrag = { y: e.clientY, h: ptopEl.getBoundingClientRect().height };
    panel.classList.add('splitting');
    try { psplitEl.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
  });
  psplitEl.addEventListener('pointermove', (e) => { if (splitDrag) setTopH(splitDrag.h + (e.clientY - splitDrag.y), false); });
  const endSplit = () => { if (!splitDrag) return; splitDrag = null; panel.classList.remove('splitting'); savePrefs(); };
  psplitEl.addEventListener('pointerup', endSplit);
  psplitEl.addEventListener('pointercancel', endSplit);
  psplitEl.addEventListener('lostpointercapture', endSplit);
  psplitEl.addEventListener('dblclick', (e) => { e.preventDefault(); setTopH(null); });
  psplitEl.addEventListener('keydown', (e) => {
    const cur = ptopEl.getBoundingClientRect().height;
    if (e.key === 'ArrowUp') { e.preventDefault(); setTopH(cur - 16); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setTopH(cur + 16); }
    else if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); setTopH(null); }
  });

  function applyPrefs() {
    applyTabs();
    panel.classList.toggle('dense', pz.prefs.density === 'compacta');
    E2P.PANEL_CONV_BTNS.forEach((k) => panel.classList.toggle(`cz-no-${k}`, !pz.prefs.convBtns[k]));
    panel.classList.toggle('cz-hdr-hide', pz.prefs.hdr.on && pz.prefs.hdrHidePanel); // 2.12.1
    try { hdrTick(); hdrApplyVisibility(); } catch { /* 2.12.1: atalhos ainda iniciando */ }
    try { delSyncConfig(); } catch { /* 2.15.0: ainda iniciando */ }
    Object.keys(CS_BLOCKS).forEach(csDecorate);
    applyTopH();
    renderFilters();
    if (pz.open) renderCustomize();
  }
  function savePrefs() { storageSet({ panelPrefs: pz.prefs }); }
  function setPrefs(next) { pz.prefs = E2P.normPanelPrefs(next); savePrefs(); applyPrefs(); }

  // "Personalizar" (cabeçalho): liga/desliga abas, filtros, botões da conversa e densidade
  const TAB_LABEL = { midias: 'Mídias', etiquetas: 'Etiquetas', vendas: 'Vendas', conversoes: 'Conversões', quadro: 'Quadro', agendados: 'Agendados', disparos: 'Disparos', follows: 'Automações' };
  const CONV_LABEL = { venda: '💰 Venda', compra: '📈 Compra p/ Facebook', automacao: '🔁 Automação', proxima: 'Próxima conversa ▼' };
  function czCheck(label, checked, onChange, { fixed = false } = {}) {
    const l = el('label', `cz-opt${fixed ? ' fixed' : ''}`);
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.disabled = fixed;
    if (!fixed) cb.addEventListener('change', () => onChange(cb.checked));
    l.append(cb, label);
    return l;
  }
  function czGroup(title, note, items) {
    const g = el('div', 'cz-grp');
    g.append(el('div', 'cz-t', title));
    const opts = el('div', 'cz-opts');
    items.forEach((x) => opts.append(x));
    g.append(opts);
    if (note) g.append(el('div', 'cz-note', note));
    return g;
  }
  function renderCustomize() {
    if (!pz.el) {
      pz.el = el('div', 'cz');
      pz.el.setAttribute('role', 'dialog');
      pz.el.setAttribute('aria-label', 'Personalizar o painel');
      pz.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); setCustomizeOpen(false); } });
      panel.append(pz.el);
    }
    const p = pz.prefs;
    const box = pz.el;
    box.textContent = '';
    const head = el('div', 'cz-head');
    head.append(el('span', null, 'Personalizar o painel'), iconButton('x', 'Fechar', () => setCustomizeOpen(false), 'cz-close'));
    box.append(head);
    const set = (fn) => { const next = JSON.parse(JSON.stringify(p)); fn(next); setPrefs(next); };
    box.append(czGroup('Abas do menu', 'As desligadas ficam em "Mais". Mensagens sempre aparece.', [
      czCheck('Mensagens', true, null, { fixed: true }),
      ...E2P.PANEL_TABS.map((k) => czCheck(TAB_LABEL[k], p.tabs[k], (v) => set((n) => { n.tabs[k] = v; }))),
    ]));
    const filterIds = FILTERS.map(([id]) => id).filter((id) => id !== 'tudo' && !(Rich.isRich(id) && !state.richAvailable));
    box.append(czGroup('Filtros das Mensagens', 'Os desligados continuam no chip "+ filtros". Tudo sempre aparece.', [
      czCheck('Tudo', true, null, { fixed: true }),
      ...filterIds.map((id) => czCheck((FILTERS.find(([x]) => x === id) || [id, id])[1], p.filters.includes(id), (v) => set((n) => { n.filters = v ? [...n.filters, id] : n.filters.filter((x) => x !== id); }))),
    ]));
    box.append(czGroup('Botões da conversa', 'Próxima conversa ▼ abre a conversa logo abaixo da aberta na lista.', E2P.PANEL_CONV_BTNS.map((k) => czCheck(CONV_LABEL[k], p.convBtns[k], (v) => set((n) => { n.convBtns[k] = v; })))));
    // 2.12.1: atalhos no cabeçalho da conversa do WhatsApp
    const HDR_LABEL = { venda: '💰 Venda', compra: '📈 Compra p/ Facebook', agendar: '⏰ Agendar mensagem', etiqueta: '🏷️ Etiqueta CRM' };
    const hdrOn = czCheck('Atalhos no cabeçalho da conversa', p.hdr.on, (v) => set((n) => { n.hdr.on = v; }));
    hdrOn.dataset.czHdr = 'on';
    const hdrItems = E2P.PANEL_HDR_BTNS.map((k) => {
      const c = czCheck(HDR_LABEL[k], p.hdr[k], (v) => set((n) => { n.hdr[k] = v; }));
      c.dataset.czHdr = k;
      if (!p.hdr.on) c.querySelector('input').disabled = true;
      return c;
    });
    const hdrHide = czCheck('Esconder do painel 💰 Venda, 📈 Compra p/ Facebook e 🔁 Automação', p.hdrHidePanel, (v) => set((n) => { n.hdrHidePanel = v; }));
    hdrHide.dataset.czHdr = 'hide';
    if (!p.hdr.on) hdrHide.querySelector('input').disabled = true;
    box.append(czGroup('Atalhos no cabeçalho da conversa', 'Ícones no topo da conversa do WhatsApp, à esquerda do vídeo/ligação (só em conversa individual). Se o WhatsApp mudar e o cabeçalho não for achado, os botões continuam no painel.', [hdrOn, ...hdrItems, hdrHide]));
    box.append(czGroup('Lista de conversas', 'Depois de você enviar, se a lista do WhatsApp pular para o topo, ela volta para onde você estava. Se você rolar ou clicar na lista, não mexe.', [
      czCheck('Manter a posição da lista de conversas ao enviar', p.keepListPos, (v) => set((n) => { n.keepListPos = v; })),
    ]));
    // 2.15.0: cópia local das mensagens recebidas (para ver as apagadas/editadas)
    const delClear = el('button', 'bbtn cz-delclear', 'Apagar tudo agora');
    delClear.type = 'button';
    delClear.addEventListener('click', () => clearDeletedCopies(delClear));
    box.append(czGroup('Mensagens apagadas e editadas', 'Guarda só neste computador (nunca no servidor) uma cópia das mensagens que o cliente manda em conversa individual: texto, miniatura e arquivos de até 5 MB. Some sozinha depois de 7 dias (no máximo 200 MB). Quando o cliente apagar ou editar, aparece "👁 Ver mensagem apagada" ou "✏️ Ver original" na conversa.', [
      czCheck('Guardar mensagens apagadas', p.keepDeleted, (v) => set((n) => { n.keepDeleted = v; })),
      delClear,
    ]));
    const dg = el('div', 'cz-grp');
    dg.append(el('div', 'cz-t', 'Densidade'));
    const seg = el('div', 'cz-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Densidade');
    [['confortavel', 'Confortável'], ['compacta', 'Compacta']].forEach(([v, t]) => {
      const b = el('button', p.density === v ? 'on' : '', t);
      b.type = 'button';
      b.dataset.czDensity = v;
      b.setAttribute('aria-pressed', String(p.density === v));
      b.addEventListener('click', () => set((n) => { n.density = v; }));
      seg.append(b);
    });
    dg.append(seg);
    box.append(dg);
    const foot = el('div', 'cz-foot');
    const reset = el('button', 'bbtn', 'Voltar ao padrão');
    reset.type = 'button';
    reset.addEventListener('click', () => { pz.filtersOpen = false; setPrefs(E2P.defaultPanelPrefs()); });
    const done = el('button', 'bbtn primary', 'Pronto');
    done.type = 'button';
    done.addEventListener('click', () => setCustomizeOpen(false));
    foot.append(reset, done);
    box.append(el('div', 'cz-note', 'Seções do topo: use a setinha ▸/▾ de cada uma. Espaço do topo: arraste a linha entre o topo e a lista (duplo clique volta ao padrão). Tudo fica só neste computador.'), foot);
  }
  function setCustomizeOpen(open) {
    pz.open = open;
    czBtn.classList.toggle('on', open);
    czBtn.setAttribute('aria-expanded', String(open));
    if (open) { renderCustomize(); pz.el.hidden = false; pz.el.querySelector('input:not([disabled]), button')?.focus(); }
    else if (pz.el) { pz.el.hidden = true; czBtn.focus(); }
  }
  const czBtn = iconButton('sliders', 'Personalizar o painel', () => setCustomizeOpen(!pz.open), 'cz-open');
  czBtn.setAttribute('aria-haspopup', 'dialog');
  czBtn.setAttribute('aria-expanded', 'false');
  actions.prepend(czBtn);
  shadow.addEventListener('click', (e) => { if (pz.open && pz.el && !e.composedPath().includes(pz.el) && !e.composedPath().includes(czBtn)) setCustomizeOpen(false); });
  pz.ready = true;

  // ── 2.10.3: manter a posição da lista de conversas ao enviar + "Próxima ▼" ──
  // Guarda onde VOCÊ deixou a lista (#pane-side ou o que rola dentro dele). Depois de um envio seu (Enter na
  // caixa, botão de enviar ou envio da extensão), se a lista pular para o topo em até 2 s sem você mexer nela,
  // volta para lá (+ 1 linha). Sem a lista na página: não faz nada.
  const lkScrolls = (e) => !!e && e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY);
  function lkPane() {
    if (lk.el && lk.el.isConnected) return lk.el;
    lk.el = null;
    if (Date.now() - (lk.missAt || 0) < 2000) return null; // não achou há pouco: não procura de novo a cada rolagem
    const side = document.getElementById('pane-side');
    if (!side) { lk.missAt = Date.now(); return null; }
    if (lkScrolls(side)) lk.el = side;
    else {
      const inner = [...side.querySelectorAll('div')].slice(0, 400).find(lkScrolls);
      let up = side.parentElement;
      for (let i = 0; !inner && up && i < 4; i++, up = up.parentElement) if (lkScrolls(up)) { lk.el = up; break; }
      if (inner) lk.el = inner;
    }
    if (!lk.el) lk.missAt = Date.now();
    return lk.el;
  }
  const lkRows = (pane) => [...pane.querySelectorAll('[role="listitem"], [role="row"]')].filter((r) => r.getBoundingClientRect().height >= 20);
  function lkRowH(pane) {
    const r = lkRows(pane)[0];
    return r ? r.getBoundingClientRect().height : 72;
  }
  const lkInPane = (t) => { const p = lkPane(); return !!(p && t && t.nodeType === 1 && (p.contains(t) || t.contains(p))); };
  function lkArm() {
    if (!pz.prefs.keepListPos) return;
    lk.armAt = Date.now();
    lk.restores = 0;
  }
  const lkUser = () => { lk.userAt = Date.now(); };
  const lkScroll = () => { lk.userAt = Date.now(); lk.scrollAt = lk.userAt; };
  // suas mexidas na lista: roda do mouse, toque, teclado na lista, clique/arrasto da barra
  document.addEventListener('wheel', (e) => { if (lkInPane(e.target)) lkScroll(); }, { capture: true, passive: true });
  document.addEventListener('touchmove', (e) => { if (lkInPane(e.target)) lkScroll(); }, { capture: true, passive: true });
  // clique na lista (abrir conversa) = mexida sua; segurando e arrastando (barra) = rolagem sua
  document.addEventListener('pointerdown', (e) => { if (lkInPane(e.target)) { lk.pointer = true; lkUser(); } }, { capture: true, passive: true });
  document.addEventListener('pointerup', () => { lk.pointer = false; }, { capture: true, passive: true });
  document.addEventListener('keydown', (e) => {
    if (/^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(e.key) && lkInPane(e.target)) lkScroll();
    // envio manual: Enter (sem Shift) na caixa de mensagem com texto
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const box = e.target && e.target.closest ? e.target.closest('footer [contenteditable="true"]') : null;
    if (box && !box.closest('#side') && (box.textContent || '').trim()) lkArm();
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('footer button, footer [role="button"], footer [data-icon]') : null;
    if (!b || b.closest('#side')) return;
    const icon = b.matches('[data-icon]') ? b : b.querySelector('[data-icon]');
    const name = (icon && icon.getAttribute('data-icon')) || '';
    const label = (b.getAttribute('aria-label') || '').trim().toLowerCase();
    if (/send/.test(name) || /^(enviar|send)$/.test(label)) lkArm();
  }, true);
  // rolagem da lista: sua = guarda; pulo para o topo logo depois do seu envio = volta
  document.addEventListener('scroll', (e) => {
    const pane = lkPane();
    if (!pane || e.target !== pane) return;
    const now = Date.now();
    if (lk.pointer) lkScroll(); // arrastando a barra
    if (now - lk.scrollAt < 600) { lk.saved = pane.scrollTop; return; }
    if (!E2P.listShouldRestore({ enabled: pz.prefs.keepListPos, now, armAt: lk.armAt, userAt: lk.userAt, scrollTop: pane.scrollTop, saved: lk.saved, restores: lk.restores })) return;
    lk.restores++;
    const to = E2P.listRestoreTarget({ saved: lk.saved, rowH: lkRowH(pane), scrollHeight: pane.scrollHeight, clientHeight: pane.clientHeight });
    pane.scrollTop = to;
    lk.saved = to;
  }, { capture: true, passive: true });

  // "Próxima ▼": abre a conversa logo abaixo da aberta na lista (sem você rolar)
  const nextBtn = shadow.querySelector('.next-chat');
  const lkSelected = (rows) => rows.find((r) => r.getAttribute('aria-selected') === 'true' || r.querySelector('[aria-selected="true"]'));
  function lkOpenRow(row) {
    const target = row.querySelector('[role="gridcell"], [tabindex="-1"], [tabindex="0"]') || row;
    const r = target.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + Math.min(40, r.width / 2), clientY: r.top + r.height / 2 };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => target.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, { ...at, pointerId: 1, isPrimary: true }) : new MouseEvent(t, at)));
  }
  function nextConversation(retry = true) {
    const pane = lkPane() || document.getElementById('pane-side');
    if (!pane) { toast('Não achei a lista de conversas do WhatsApp.', 'warn', 4000); return; }
    const rows = lkRows(pane).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const cur = lkSelected(rows);
    const curTop = cur ? cur.getBoundingClientRect().top : -Infinity;
    const next = rows.find((r) => r !== cur && r.getBoundingClientRect().top > curTop + 2);
    if (!next) {
      // a de baixo ainda não está desenhada: desce uma linha e tenta de novo uma vez
      if (retry && lkScrolls(pane)) { pane.scrollTop += lkRowH(pane); setTimeout(() => nextConversation(false), 180); return; }
      toast('Não há conversa abaixo desta na lista.', 'warn', 3000);
      return;
    }
    const pr = pane.getBoundingClientRect();
    const nr = next.getBoundingClientRect();
    if (nr.bottom > pr.bottom || nr.top < pr.top) { pane.scrollTop += nr.bottom > pr.bottom ? nr.bottom - pr.bottom : nr.top - pr.top; lk.saved = pane.scrollTop; }
    lk.armAt = 0; // abrir conversa não é envio
    lkOpenRow(next);
  }
  if (nextBtn) nextBtn.addEventListener('click', () => nextConversation());
  function renderNextBtn() { if (nextBtn) nextBtn.hidden = !document.getElementById('pane-side'); }

  queueMicrotask(applyPrefs); // depois do script inteiro iniciar (renderPanelNav usa o Quadro, declarado mais abaixo)

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
    if (typeof lib.richAvailable === 'boolean') { state.richAvailable = lib.richAvailable; renderFilters(); } // 2.9.2
    if (typeof lib.followAvailable === 'boolean') state.followAvailable = lib.followAvailable; // 2.10.0
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
    } else if (Rich.isRich(state.filter)) {
      list = list.filter((i) => partsOf(i).some((p) => p.type === state.filter)); // 2.9.2: em qualquer parte
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
    if (Rich.isRich(item.type)) return `${Rich.LABEL[item.type]} · ${Rich.summary(partsOf(item)[0])}`; // 2.9.2
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
    if (Rich.isRich(item.type)) type.textContent = Rich.EMOJI[item.type]; // 2.9.2
    else type.innerHTML = svg(ICONS[item.type] ? item.type : 'documento');
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
    // 2.10.4: todas as partes, na ordem, como vão chegar (mídia, álbum, cartão e texto editável), cada uma com ✕
    const slot = el('div', 'bubble-slot');
    fillBubble(slot, item);
    pv.append(slot);
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

  // Como cada parte vai ficar na conversa aberta. 2.10.4: cada parte (e cada foto do álbum) ganha um ✕ que a tira
  // SÓ deste envio ("Não vai ser enviada · desfazer"); a mensagem salva não muda.
  const pvState = (item) => {
    if (!pvEdits.has(item.id)) pvEdits.set(item.id, { name: null, texts: {}, skip: [], skipFiles: {} });
    const st = pvEdits.get(item.id);
    st.skip = st.skip || [];
    st.skipFiles = st.skipFiles || {};
    return st;
  };
  function pvPartLabel(p) {
    if (Array.isArray(p.files) && p.files.length > 1) return `Várias imagens (${p.files.length})`;
    if (Rich.isRich(p.type)) return Rich.LABEL[p.type];
    if (p.type === 'documento') return 'PDF';
    if (p.type === 'audio') return 'Áudio';
    return (TYPES[p.type] && TYPES[p.type].label) || p.type;
  }
  function pvMediaEl(p, i) {
    const media = el('div', 'pv-media loading sk');
    getBlobUrl(partAsItem(p, i)).then((url) => {
      const tag = p.type === 'imagem' ? 'img' : p.type === 'video' ? 'video' : 'audio';
      const m = document.createElement(tag);
      m.src = url;
      if (tag === 'img') m.alt = p.file_name || '';
      else { m.controls = true; m.preload = 'metadata'; }
      media.className = 'pv-media';
      media.append(m);
    }).catch((e) => {
      media.className = 'pv-note';
      media.textContent = `Não foi possível carregar a prévia: ${e.message}`;
    });
    return media;
  }
  function fillBubble(slot, item) {
    slot.textContent = '';
    slot.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
    const st = pvState(item);
    const rerender = () => fillBubble(slot, item);
    const detected = state.ctx ? state.ctx.firstName : '';
    const all = partsOf(item);
    const parts = textPartsOf(item);
    const textIdx = new Set(parts.map(({ i }) => i));
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
    const multi = all.length > 1;
    all.forEach((p, i) => {
      const off = st.skip.includes(i);
      const box = el('div', `pv-pt${off ? ' off' : ''}`);
      box.dataset.part = String(i);
      const head = el('div', 'pv-ph');
      const album = Array.isArray(p.files) && p.files.length > 1;
      const albumBefore = album && !!(p.files[0] && p.files[0].caption_before);
      const extra = textIdx.has(i) && p.type !== 'texto' ? (album ? (albumBefore ? ' · mensagem antes das fotos' : ' · mensagem depois das fotos') : Rich.isRich(p.type) ? ' · texto junto' : ' · legenda') : '';
      head.append(el('span', 'pv-part pv-pl', `${multi ? `Parte ${i + 1} · ` : ''}${pvPartLabel(p)}${extra}`));
      if (!off) {
        const x = el('button', 'pv-x', '✕');
        x.type = 'button';
        x.title = 'Não enviar esta parte agora';
        x.setAttribute('aria-label', `Não enviar a parte ${i + 1} agora`);
        x.addEventListener('click', (e) => { e.stopPropagation(); st.skip.push(i); rerender(); });
        head.append(x);
      }
      box.append(head);
      if (off) {
        const note = el('div', 'pv-offnote', 'Não vai ser enviada · ');
        const undo = el('button', 'pv-undo', 'desfazer');
        undo.type = 'button';
        undo.setAttribute('aria-label', `Desfazer: enviar a parte ${i + 1}`);
        undo.addEventListener('click', (e) => {
          e.stopPropagation();
          st.skip = st.skip.filter((x) => x !== i);
          if (album && (st.skipFiles[i] || []).length >= p.files.length) delete st.skipFiles[i];
          rerender();
        });
        note.append(undo);
        box.append(note);
      }
      if (Rich.isRich(p.type)) box.append(richPreviewEl(p));
      else if (album) box.append(pvAlbumEl(p, i, st, off, rerender));
      else if (p.type === 'documento' && p.file_name) {
        const doc = el('div', 'pv-doc');
        doc.innerHTML = svg('documento');
        doc.firstChild.style.color = TYPES.documento.color;
        doc.append(`${p.file_name}${p.file_size != null ? ` · ${formatSize(p.file_size)}` : ''}`);
        box.append(doc);
      } else if (['imagem', 'video', 'audio'].includes(p.type) && p.file_url) box.append(pvMediaEl(p, i));
      if (textIdx.has(i)) {
        const bubble = el('div', 'bubble');
        bubble.dataset.part = String(i);
        if (!off) {
          bubble.setAttribute('contenteditable', 'plaintext-only');
          bubble.setAttribute('role', 'textbox');
          bubble.setAttribute('aria-label', `Texto da parte ${i + 1} (editável só nesta conversa)`);
        }
        if (st.texts[i] != null) bubble.textContent = st.texts[i];
        else {
          renderTemplate(bubble, p.body, st.name || detected);
          unresolved += bubble.querySelectorAll('.var:not(.name-slot)').length;
        }
        bubble.addEventListener('input', () => { st.texts[i] = bubbleText(bubble, st.name || detected); });
        box.append(bubble);
      }
      slot.append(box);
    });
    const notes = [];
    if (usesName) notes.push(detected ? `{nome} trocado por "${detected}".` : 'Sem nome para esta conversa: digite acima ou deixe vazio (o trecho do nome some).');
    if (unresolved) notes.push('Em laranja: variáveis que você troca à mão antes de enviar.');
    if (parts.length) notes.push('Você pode editar o texto aqui: vale só para este envio.');
    notes.push('✕ tira a parte (ou a foto) só deste envio.');
    if (usesName && !(st.name || detected) && chatNames.available !== false) slot.append(el('div', 'pv-warn', 'Sem nome para esta conversa (vai sair sem nome)'));
    if (notes.length) slot.append(el('div', 'pv-note', notes.join(' ')));
    const plan = globalThis.TspEngine.previewSendPlan(all, st.skip, st.skipFiles);
    slot.append(el('div', 'pv-total', plan.empty ? 'Nenhuma parte para enviar' : `${plan.parts.length} de ${all.length} parte${all.length === 1 ? '' : 's'} · tempo total ~${plan.seconds}s`));
    const row = el('div', 'ed-add');
    const go = el('button', 'btn primary pv-send', plan.empty ? 'Nada para enviar' : 'Enviar só nesta conversa');
    go.type = 'button';
    go.disabled = plan.empty;
    go.addEventListener('click', (e) => { e.stopPropagation(); sendEditedPreview(item, slot); });
    const restore = el('button', 'btn pv-restore', 'Restaurar');
    restore.type = 'button';
    restore.addEventListener('click', (e) => { e.stopPropagation(); pvEdits.delete(item.id); rerender(); });
    row.append(go, restore);
    slot.append(row);
  }
  // álbum da prévia: todas as fotos, cada uma com ✕ (tira só aquela foto deste envio) ou ↺ (volta)
  function pvAlbumEl(p, i, st, partOff, rerender) {
    const grid = el('div', 'pv-albx');
    const gone = new Set(st.skipFiles[i] || []);
    p.files.forEach((f, k) => {
      const cell = el('div', `pv-cell${gone.has(k) ? ' off' : ''}`);
      cell.append(albumThumb(f, k, `pv-${i}-${k}`));
      if (!partOff) {
        const b = el('button', 'pv-fx', gone.has(k) ? '↺' : '✕');
        b.type = 'button';
        b.title = gone.has(k) ? 'Enviar esta foto de novo' : 'Não enviar esta foto agora';
        b.setAttribute('aria-label', `${b.title} (foto ${k + 1} da parte ${i + 1})`);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const set = new Set(st.skipFiles[i] || []);
          if (set.has(k)) set.delete(k); else set.add(k);
          st.skipFiles[i] = [...set];
          if (set.size >= p.files.length && !st.skip.includes(i)) st.skip.push(i); // tirou todas: a parte sai
          rerender();
        });
        cell.append(b);
      }
      grid.append(cell);
    });
    return grid;
  }

  async function sendEditedPreview(item, slot) {
    if (state.busyId || seq) { toast('Já tem um envio em andamento. Espere terminar ou clique em Parar.', 'warn', 5000); return; }
    if (!getContext().conv) { toast('Abra uma conversa', 'warn'); return; }
    const st = await waStatusForSend();
    if (!st || !st.ready) { toast('O WhatsApp ainda não está pronto para enviar. Tente de novo em instantes.', 'warn', 6000); return; }
    const chatId = await openIndividualChat();
    if (!chatId) return;
    const name = previewName(item);
    const pst = pvState(item);
    const edited = partsOf(item).map((p, i) => {
      if (!(p.type === 'texto' || (p.type !== 'audio' && p.body))) return p;
      const bubble = slot.querySelector(`.bubble[data-part="${i}"]`);
      return { ...p, body: bubble ? bubbleText(bubble, name) : fillVars(p.body || '', name) };
    });
    // 2.10.4: só as partes (e fotos) que ficaram; o "esperar"/"digitando" das tiradas não conta
    const plan = globalThis.TspEngine.previewSendPlan(edited, pst.skip, pst.skipFiles);
    if (plan.empty) { toast('Nada para enviar: você tirou todas as partes.', 'warn', 5000); return; }
    const parts = plan.parts;
    if (parts.some((p) => p.type === 'texto' && !String(p.body || '').trim())) { toast('Uma parte de texto ficou vazia.', 'warn', 5000); return; }
    state.busyId = item.id;
    setSendButtonsDisabled(true);
    try {
      const noLearn = !name && globalThis.TspEngine.previewSendPlan(partsOf(item), pst.skip, pst.skipFiles).parts.some((p) => globalThis.TspEngine.hasNameVar(p.body)); // 2.9.1
      const res = await runSequence({ parts, chatId, firstName: name, noLearn });
      sequenceToast(res, parts.length);
      // etiquetas "Ao enviar" continuam valendo com partes tiradas (as escolhidas saíram e pelo menos uma foi enviada)
      if (globalThis.TspEngine.sendLabelsApply(res)) { registerUse(item); applyItemLabels(item, targetForOpenChat(chatId)); logQuickSend(chatId, item.id); }
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

  // 2.9.2: cartão como vai chegar (localização, produto, catálogo, contato, Pix)
  function richPreviewEl(p, { compact = false } = {}) {
    const d = p.data || {};
    const card = el('div', `rp-card rp-${p.type}`);
    const ico = el('span', 'rp-ico', Rich.EMOJI[p.type]);
    const body = el('div', 'rp-body');
    const line = (cls, text) => { if (text) body.append(el('div', cls, text)); };
    if (p.type === 'produto') {
      const th = el('div', 'rp-thumb');
      if (d.image_url) {
        const img = document.createElement('img');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { th.textContent = Rich.EMOJI.produto; }, { once: true });
        img.src = d.image_url;
        th.append(img);
      } else th.textContent = Rich.EMOJI.produto; // produto sem foto
      card.append(th);
      line('rp-t', d.name || 'Produto do catálogo');
      line('rp-s', d.price);
      if (!compact) line('rp-link', 'wa.me/p/… (link do produto, com prévia)');
    } else if (p.type === 'localizacao') {
      card.append(ico);
      line('rp-t', d.name || 'Localização');
      line('rp-s', d.address);
      if (d.lat !== '' && d.lat != null && d.lng !== '' && d.lng != null) {
        const a = el('a', 'rp-link', `${d.lat}, ${d.lng} · abrir no mapa`);
        a.href = Rich.mapsUrl(d.lat, d.lng);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        body.append(a);
      }
    } else if (p.type === 'catalogo') {
      card.append(ico);
      line('rp-t', 'Catálogo no WhatsApp');
      line('rp-s', 'Veja os nossos produtos (cartão do seu catálogo)');
    } else if (p.type === 'contato') {
      card.append(ico);
      line('rp-t', d.name || 'Contato');
      line('rp-s', Rich.fmtPhone(d.phone));
      line('rp-link', 'Conversar · Adicionar contato');
    } else if (p.type === 'pix') {
      card.append(ico);
      line('rp-t', 'Chave Pix');
      line('rp-s', `${Rich.pixTypeLabel(d.key_type)}: ${d.key || '—'}`);
      line('rp-s', d.name ? `Recebedor: ${d.name}` : '');
      line('rp-link', 'Copiar chave Pix');
    }
    card.append(body);
    return card;
  }

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
    // 2.9.2: localização, produto, catálogo, contato e Pix (a ponte monta e confere antes de enviar)
    if (Rich.isRich(part.type)) {
      const text = Rich.allowsText(part.type) && part.body ? fillVars(part.body, firstName).slice(0, SEQ_TEXT_MAX) : '';
      const rich = { kind: part.type, data: part.data || {}, text };
      if (newChat) { await campaignSend(rich); return; }
      await waRequest('sendRich', { chatId, ...rich, typingMs: typingMs || 0 }, { id: reqId, timeout: (typingMs || 0) + 60000 });
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
    const extMark = markExtSend(chatId); // 2.10.0: o que a extensão envia não conta como "você digitou"
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
          lkArm(); // 2.10.3: a lista do WhatsApp pode pular para o topo depois deste envio
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
      extMark.done();
    }
  }

  function sequenceToast(res, total) {
    if (res.status === 'ok' && res.failedFiles && res.failedFiles.length) { toast(`Enviado, mas não consegui enviar: ${res.failedFiles.join(', ')}.`, 'warn', 10000); return; }
    if (res.status === 'ok') { toast(total > 1 ? `Enviado: ${total} partes.` : 'Enviado.', 'ok', 4000); return; }
    if (res.status === 'stopped') { toast(`Parado: ${res.sent} de ${total} enviada${res.sent === 1 ? '' : 's'}.`, 'warn', 6000); return; }
    if (res.stage === 'sending' && (res.code === 'pix_failed' || res.code === 'rich_failed')) {
      toast(`Parte ${res.failedAt}: ${res.message}`, 'error', 12000); // 2.9.2: erro claro do tipo novo
    } else if (res.stage === 'sending') {
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
      if (res.status === 'ok') { registerUse(item); applyItemLabels(item, targetForOpenChat(chatId)); logQuickSend(chatId, item.id); }
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
      // 2.13.1: antes, confere onde a mensagem está em uso (agendamento pendente, automação/régua, disparo)
      const lines = globalThis.TspEngine.itemUsageLines(itemMenu.usage);
      if (itemMenu.checking) {
        box.append(el('div', 'q loading del-check', 'Conferindo onde esta mensagem é usada…'), btn('Cancelar', () => { itemMenu = null; renderList(); }));
        return box;
      }
      if (lines.length) {
        const why = el('div', 'q del-inuse');
        lines.forEach((l) => {
          why.append(el('div', 'del-head', l.head));
          const ul = el('ul', 'del-list');
          l.items.slice(0, 10).forEach((t) => ul.append(el('li', null, t)));
          if (l.items.length > 10) ul.append(el('li', null, `e mais ${l.items.length - 10}…`));
          why.append(ul);
        });
        why.append(el('div', 'del-hint', 'Cancele ou troque antes de excluir.'));
        box.append(why, btn('Fechar', () => { itemMenu = null; renderList(); }));
        return box;
      }
      box.append(el('div', 'q', `Excluir "${item.title}"? ${isMultiPart(item) ? 'As partes somem junto. ' : ''}Os arquivos continuam guardados.`));
      if (itemMenu.error) {
        const er = el('div', 'del-err');
        er.append(el('div', null, itemMenu.error.text));
        const det = el('details', 'del-det');
        det.append(el('summary', null, 'Detalhes'), el('div', 'del-raw', itemMenu.error.detail));
        er.append(det);
        box.append(er);
      }
      box.append(btn('Excluir', () => deleteLibraryItem(item), 'danger'), btn('Cancelar', () => { itemMenu = null; renderList(); }));
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
    box.append(btn('Excluir', () => askDeleteItem(item), 'danger'));
    return box;
  }

  // 2.13.1: "Excluir": primeiro confere onde a mensagem está em uso (se não der para conferir, deixa tentar: o banco
  // confere de novo antes de apagar)
  async function askDeleteItem(item) {
    const menu = { id: item.id, mode: 'delete', checking: true, usage: null, error: null };
    itemMenu = menu;
    renderList();
    try { menu.usage = await call('itemUsage', { id: item.id }); } catch (e) { menu.error = { text: globalThis.TspEngine.friendlyDeleteError(e.message), detail: e.message }; }
    menu.checking = false;
    if (itemMenu === menu) renderList();
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
      // 2.13.1: em uso (alguém agendou/usou agora) → mostra onde; outro erro → frase clara + "Detalhes" com o técnico
      const menu = itemMenu && itemMenu.id === item.id ? itemMenu : (itemMenu = { id: item.id, mode: 'delete' });
      if (/Mensagem em uso/.test(e.message)) {
        try { menu.usage = await call('itemUsage', { id: item.id }); } catch { /* fica a frase */ }
      }
      if (!globalThis.TspEngine.itemInUse(menu.usage)) menu.error = { text: globalThis.TspEngine.friendlyDeleteError(e.message), detail: e.message };
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
      // 2.9.2: dados da localização/produto/contato/Pix (cópia; o original só muda ao salvar)
      data: Rich.isRich(p.type) ? { ...Rich.empty(p.type), ...(p.data || {}) } : null,
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
  // 2.9.2: tipos novos só com a migration (data) e se a WA-JS desta conta envia (state.waRich; sem resposta = mostra)
  const richOk = (t) => !!state.richAvailable && !(state.waRich && state.waRich[t] === false);
  const edTypes = (cur) => [
    ...(state.albumAvailable || cur === 'album' ? [...ED_TYPES.slice(0, 2), ['album', 'Várias imagens'], ...ED_TYPES.slice(2)] : ED_TYPES),
    ...Rich.TYPES.filter((t) => richOk(t) || cur === t).map((t) => [t, `${Rich.EMOJI[t]} ${Rich.LABEL[t]}`]),
  ];
  function refreshWaRich(rerender) {
    waRequest('richInfo', {}, { timeout: 2000 }).then((r) => {
      if (!r || !r.types) return;
      const before = JSON.stringify(state.waRich || null);
      state.waRich = r.types;
      if (JSON.stringify(r.types) !== before && rerender) rerender();
    }).catch(() => {});
  }
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

  // ── 2.9.2: editor das partes Localização, Produto, Catálogo, Contato e Chave Pix ──
  const catalog = { loading: false, products: null, reason: null, at: 0 };
  const CATALOG_REASON = {
    unavailable: 'Esta versão da biblioteca não lê o catálogo.', not_business: 'Catálogo só existe em conta WhatsApp Business.',
    no_me: 'Não consegui ler o seu número no WhatsApp.', failed: 'Não consegui ler o catálogo agora. Tente de novo.',
    not_ready: 'O WhatsApp ainda não está pronto. Tente de novo em instantes.',
  };
  function loadCatalog(force = false) {
    if (catalog.loading || (!force && catalog.products && Date.now() - catalog.at < 5 * 60 * 1000)) return Promise.resolve();
    catalog.loading = true;
    return waRequest('catalogProducts', {}, { timeout: 20000 })
      .then((r) => { catalog.products = (r && r.products) || []; catalog.reason = r && !r.ok ? r.reason : null; catalog.at = Date.now(); })
      .catch((e) => { catalog.products = []; catalog.reason = e && e.code === 'not_ready' ? 'not_ready' : 'failed'; catalog.at = 0; })
      .finally(() => { catalog.loading = false; });
  }

  function richField(labelText, value, onInput, { placeholder = '', maxLength = 100, aria = labelText, inputMode = null } = {}) {
    const l = el('label', 'ed-field', labelText);
    const input = el('input', 'ed-title');
    input.type = 'text';
    input.maxLength = maxLength;
    input.value = value == null ? '' : String(value);
    input.placeholder = placeholder;
    if (inputMode) input.inputMode = inputMode;
    input.setAttribute('aria-label', aria);
    input.addEventListener('input', () => onInput(input.value));
    l.append(input);
    return { label: l, input };
  }
  function richTextField(p, i, placeholder) {
    const cap = el('textarea', 'ed-caption');
    cap.maxLength = 4096;
    cap.rows = 2;
    cap.value = p.body || '';
    cap.placeholder = placeholder;
    cap.setAttribute('aria-label', `Texto junto (parte ${i + 1})`);
    cap.addEventListener('input', () => { p.body = cap.value; });
    return [cap, varButtons(cap, (v) => { p.body = v; }, i)];
  }

  function richEditorEl(p, i, ctx) {
    const wrap = el('div', 'rp-ed');
    const d = p.data || (p.data = Rich.empty(p.type));
    const n = i + 1;
    if (p.type === 'localizacao') {
      const status = el('div', 'ed-varhint', 'Cole o link do Google Maps: a latitude e a longitude são preenchidas sozinhas.');
      const link = richField('Link do Google Maps', '', () => {}, { placeholder: 'Cole o link do Google Maps', maxLength: 2000, aria: `Link do Google Maps (parte ${n})` });
      const name = richField('Nome do local', d.name, (v) => { d.name = v; }, { placeholder: 'Ex.: Triumph Store', aria: `Nome do local (parte ${n})` });
      const addr = richField('Endereço', d.address, (v) => { d.address = v; }, { placeholder: 'Rua, número, bairro, cidade', maxLength: 200, aria: `Endereço (parte ${n})` });
      const lat = richField('Latitude', d.lat, (v) => { d.lat = v.trim(); }, { placeholder: '-23.5505', maxLength: 20, aria: `Latitude (parte ${n})`, inputMode: 'decimal' });
      const lng = richField('Longitude', d.lng, (v) => { d.lng = v.trim(); }, { placeholder: '-46.6333', maxLength: 20, aria: `Longitude (parte ${n})`, inputMode: 'decimal' });
      link.input.addEventListener('input', () => {
        const v = link.input.value.trim();
        status.classList.remove('err');
        if (!v) { status.textContent = 'Cole o link do Google Maps: a latitude e a longitude são preenchidas sozinhas.'; return; }
        const c = Rich.parseMapsLink(v);
        const place = Rich.placeNameFromLink(v);
        if (place && !d.name) { d.name = place; name.input.value = place; }
        if (c) {
          d.lat = String(c.lat); d.lng = String(c.lng);
          lat.input.value = d.lat; lng.input.value = d.lng;
          status.textContent = `Coordenadas encontradas: ${c.lat}, ${c.lng}.`;
        } else {
          status.classList.add('err');
          status.textContent = Rich.isShortMapsLink(v)
            ? 'Link curto (maps.app.goo.gl) não traz as coordenadas: abra o link no navegador, copie o endereço completo da barra e cole aqui, ou digite a latitude e a longitude.'
            : 'Não achei as coordenadas neste link. Digite a latitude e a longitude (no Google Maps: clique com o botão direito no ponto e copie os números).';
        }
      });
      const coords = el('div', 'rp-row');
      coords.append(lat.label, lng.label);
      wrap.append(link.label, status, name.label, addr.label, coords);
    } else if (p.type === 'produto') {
      if (d.product_id) wrap.append(richPreviewEl({ type: 'produto', data: d }));
      const btn = el('button', 'ed-mini', p.picking ? 'Fechar a lista' : d.product_id ? 'Trocar produto' : 'Escolher produto');
      btn.type = 'button';
      btn.disabled = ctx.saving();
      btn.setAttribute('aria-label', `Escolher produto do catálogo (parte ${n})`);
      btn.addEventListener('click', () => {
        p.picking = !p.picking;
        if (p.picking && !catalog.products) loadCatalog().then(() => ctx.rerender());
        ctx.rerender();
      });
      wrap.append(btn);
      if (p.picking) wrap.append(productPickerEl(p, i, ctx));
      wrap.append(...richTextField(p, i, 'Texto junto (opcional; vai na mesma mensagem, antes do link do produto)'));
      wrap.append(el('div', 'ed-varhint', 'Vai o link do produto (wa.me/p/…) com a prévia: foto, nome e preço. A WA-JS 4.7.2 não tem envio direto do cartão de produto.'));
    } else if (p.type === 'catalogo') {
      wrap.append(richPreviewEl({ type: 'catalogo', data: d }));
      wrap.append(...richTextField(p, i, 'Texto junto (opcional)'));
      wrap.append(el('div', 'ed-varhint', 'Envia o cartão do catálogo inteiro do seu WhatsApp Business.'));
    } else if (p.type === 'contato') {
      const name = richField('Nome', d.name, (v) => { d.name = v; }, { placeholder: 'Nome do contato', maxLength: 60, aria: `Nome do contato (parte ${n})` });
      const phone = richField('Telefone', d.phone, (v) => { d.phone = v; }, { placeholder: '(11) 99999-9999', maxLength: 25, aria: `Telefone do contato (parte ${n})`, inputMode: 'tel' });
      const pickBtn = el('button', 'ed-mini', p.picking ? 'Fechar contatos' : 'Escolher dos contatos do WhatsApp');
      pickBtn.type = 'button';
      pickBtn.disabled = ctx.saving();
      pickBtn.addEventListener('click', () => { p.picking = !p.picking; ctx.rerender(); });
      wrap.append(name.label, phone.label, pickBtn);
      if (p.picking) wrap.append(contactPickerEl(p, i, ctx, name.input, phone.input));
    } else if (p.type === 'pix') {
      const tl = el('label', 'ed-field', 'Tipo da chave');
      const sel = el('select', 'ed-cat');
      sel.setAttribute('aria-label', `Tipo da chave Pix (parte ${n})`);
      Rich.PIX_KEY_TYPES.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = d.key_type === v; sel.append(o); });
      sel.addEventListener('change', () => { d.key_type = sel.value; });
      tl.append(sel);
      const key = richField('Chave', d.key, (v) => { d.key = v; }, { placeholder: 'CPF, CNPJ, telefone, e-mail ou chave aleatória', maxLength: 80, aria: `Chave Pix (parte ${n})` });
      const name = richField('Nome do recebedor', d.name, (v) => { d.name = v; }, { placeholder: 'Como aparece no Pix', maxLength: 60, aria: `Nome do recebedor (parte ${n})` });
      wrap.append(tl, key.label, name.label, el('div', 'ed-varhint', 'Só funciona em conta WhatsApp Business. Se o WhatsApp não aceitar, aparece um erro e a parte não é enviada.'));
    }
    return wrap;
  }

  function productPickerEl(p, i, ctx) {
    const box = el('div', 'rp-pick');
    if (catalog.loading && !catalog.products) { box.append(el('div', 'ed-note', 'Lendo o seu catálogo…')); return box; }
    const list = catalog.products || [];
    if (!list.length) {
      box.append(el('div', 'ed-note', catalog.reason ? CATALOG_REASON[catalog.reason] || CATALOG_REASON.failed : 'Nenhum produto no seu catálogo.'));
      const again = el('button', 'ed-mini', 'Tentar de novo');
      again.type = 'button';
      again.addEventListener('click', () => { loadCatalog(true).then(() => ctx.rerender()); ctx.rerender(); });
      box.append(again);
      return box;
    }
    const q = el('input', 'ed-title');
    q.type = 'search';
    q.placeholder = `Buscar entre ${list.length} produto${list.length === 1 ? '' : 's'}`;
    q.setAttribute('aria-label', `Buscar produto (parte ${i + 1})`);
    const rows = el('div', 'rp-list');
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      rows.textContent = '';
      const shown = list.filter((x) => !term || x.name.toLowerCase().includes(term) || x.id.includes(term)).slice(0, 60);
      if (!shown.length) rows.append(el('div', 'ed-note', 'Nenhum produto com esse nome.'));
      shown.forEach((x) => {
        const b = el('button', `rp-prow${p.data && p.data.product_id === x.id ? ' sel' : ''}`);
        b.type = 'button';
        b.setAttribute('aria-label', `Escolher ${x.name}${x.price ? `, ${x.price}` : ''}`);
        b.append(richPreviewEl({ type: 'produto', data: { name: x.name, price: x.price, image_url: x.image_url } }, { compact: true }));
        b.addEventListener('click', () => {
          p.data = { product_id: x.id, name: x.name, price: x.price, image_url: x.image_url };
          p.picking = false;
          ctx.msg('');
          ctx.rerender();
        });
        rows.append(b);
      });
    };
    q.addEventListener('input', draw);
    const reload = el('button', 'ed-mini', 'Atualizar lista');
    reload.type = 'button';
    reload.addEventListener('click', () => { loadCatalog(true).then(() => ctx.rerender()); });
    box.append(q, rows, reload);
    draw();
    return box;
  }

  function contactPickerEl(p, i, ctx, nameIn, phoneIn) {
    const box = el('div', 'rp-pick');
    const q = el('input', 'ed-title');
    q.type = 'search';
    q.placeholder = 'Buscar contato salvo (nome ou número)';
    q.setAttribute('aria-label', `Buscar contato (parte ${i + 1})`);
    const rows = el('div', 'rp-list');
    let timer = null;
    let reqN = 0;
    const search = () => {
      const n = ++reqN;
      rows.textContent = '';
      rows.append(el('div', 'ed-note', 'Buscando…'));
      waRequest('contactSearch', { q: q.value }, { timeout: 8000 }).then((list) => {
        if (n !== reqN) return;
        rows.textContent = '';
        if (!Array.isArray(list) || !list.length) { rows.append(el('div', 'ed-note', 'Nenhum contato salvo com esse nome.')); return; }
        list.forEach((c) => {
          const b = el('button', 'rp-crow');
          b.type = 'button';
          b.append(el('b', null, c.name), el('span', null, Rich.fmtPhone(c.phone)));
          b.addEventListener('click', () => {
            p.data = { ...(p.data || {}), name: c.name, phone: c.phone };
            nameIn.value = c.name;
            phoneIn.value = Rich.fmtPhone(c.phone);
            p.picking = false;
            ctx.rerender();
          });
          rows.append(b);
        });
      }).catch(() => { if (n === reqN) { rows.textContent = ''; rows.append(el('div', 'ed-note', 'Não consegui ler os contatos do WhatsApp agora.')); } });
    };
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
    box.append(q, rows);
    search();
    return box;
  }

  // valida a parte nova; devolve a parte pronta para gravar ou lança "Parte N: …"
  function richPartForSave(p, i) {
    let data;
    try { data = Rich.normalize(p.type, p.data); } catch (e) { throw new Error(`Parte ${i + 1}: ${e.message}.`); }
    return { type: p.type, body: Rich.allowsText(p.type) && String(p.body || '').trim() ? p.body : null, data, wait_seconds: p.wait_seconds, typing_seconds: p.typing_seconds };
  }

  function edFileMime(type, file) {
    let m = (file.type || '').toLowerCase();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!m || m === 'application/octet-stream') m = type === 'audio' ? ED_EXT_MIME[ext] || '' : MIME_BY_EXT[ext] || '';
    if (type === 'audio' && m === 'video/webm') m = 'audio/webm';
    return m;
  }

  // 2.11.0: returnTo(itemId|null) = aberto de uma automação ("+ Criar mensagem aqui" / "Editar esta mensagem"):
  // ao salvar volta para a automação com a mensagem escolhida; Cancelar volta sem mudar nada
  function openEditor(item = null, { duplicate = false, categoryId = null, returnTo = null } = {}) {
    closeEditorState();
    const cats = state.categories;
    ed = {
      returnTo,
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
      // 2.10.0: "Esta mensagem é um follow-up" + etapa (para o painel do ERP)
      follow_step: item && Number.isInteger(item.follow_step) ? item.follow_step : null,
      saving: false, msg: '', error: false, duplicate,
    };
    state.view = 'editor';
    if (!Array.isArray(state.waLabels)) refreshBar().then(() => { if (state.view === 'editor' && ed) renderEditor(); }).catch(() => {});
    if (state.richAvailable) refreshWaRich(() => { if (state.view === 'editor' && ed) renderEditor(); }); // 2.9.2
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
    const back = ed && ed.returnTo;
    closeEditorState();
    showList();
    if (back) back(null); // 2.11.0: veio de uma automação: volta para ela
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
      Object.assign(p, { type: typeSel.value, file: null, localUrl: null, file_url: null, file_name: null, file_size: null, files: typeSel.value === 'album' ? [] : undefined, picking: false, data: Rich.isRich(typeSel.value) ? Rich.empty(typeSel.value) : null });
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
    } else if (Rich.isRich(p.type)) {
      box.append(richEditorEl(p, i, ctx)); // 2.9.2
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
    if (ed.returnTo) wrap.append(el('div', 'ed-note ed-forauto', 'Mensagem para a automação: ao salvar, ela já fica escolhida e você volta para a automação. Cancelar volta sem mudar nada.')); // 2.11.0
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
    // 2.10.0: follow-up (o painel do ERP mostra o funil Follow 1 → 2 → 3…); automações que enviam esta mensagem herdam
    if (state.followAvailable || ed.follow_step != null) {
      const fu = el('div', 'ed-follow');
      const lbl = el('label', 'ed-check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = ed.follow_step != null;
      cb.disabled = ed.saving;
      cb.addEventListener('change', () => { ed.follow_step = cb.checked ? (ed.follow_step || 1) : null; renderEditor(); });
      lbl.append(cb, ' Esta mensagem é um follow-up');
      fu.append(lbl);
      if (ed.follow_step != null) {
        const stepSel = el('select', 'ed-cat');
        stepSel.setAttribute('aria-label', 'Etapa do follow-up');
        for (let n = 1; n <= 10; n++) { const o = el('option', null, `Etapa ${n}`); o.value = String(n); o.selected = ed.follow_step === n; stepSel.append(o); }
        stepSel.addEventListener('change', () => { ed.follow_step = Number(stepSel.value); });
        fu.append(stepSel);
      }
      fu.append(el('div', 'ed-varhint', 'Para o painel de resultados do ERP (funil Follow 1 → 2 → 3). Automações que enviam esta mensagem contam como esta etapa.'));
      wrap.append(fu);
    }
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
    actionsRow.append(mk(ed.saving ? 'Salvando…' : ed.returnTo ? 'Salvar e voltar para a automação' : 'Salvar', 'primary', () => saveEditor(false)),
      ...(ed.returnTo ? [] : [mk('Salvar e enviar', '', () => saveEditor(true))]), mk('Cancelar', '', () => closeEditor()));
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
      if (Rich.isRich(p.type)) { try { richPartForSave(p, i); } catch (e) { return e.message; } continue; } // 2.9.2
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
        if (Rich.isRich(p.type)) { parts.push(richPartForSave(p, i)); continue; } // 2.9.2
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
        ...(state.followAvailable || current.follow_step != null ? { follow_step: current.follow_step } : {}), // 2.10.0
        ...(current.on_send_add_wa_label_id || current.on_send_remove_wa_label_id
          ? { on_send_add_wa_label_id: current.on_send_add_wa_label_id || null, on_send_remove_wa_label_id: current.on_send_remove_wa_label_id === REMOVE_ALL ? null : current.on_send_remove_wa_label_id || null }
          : current.id && state.items.some((x) => x.id === current.id && (x.on_send_add_wa_label_id || x.on_send_remove_wa_label_id))
            ? { on_send_add_wa_label_id: null, on_send_remove_wa_label_id: null } : {}),
      });
      await reloadLibrary().catch(() => {});
      if (ed !== current) return;
      const back = current.returnTo; // 2.11.0
      current.returnTo = null;
      closeEditor();
      toast('Mensagem salva.', 'ok', 3000);
      if (back) { back(res.id); return; }
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
    const f = el('label', 'ed-field');
    f.append(label, input); // 2.11.0: o rótulo pode ser texto ou elemento (com o (i))
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
        main.append(convLink(el('div', 'sc-who', row.chat_name || 'Conversa'), { chatId: row.chat_id, name: row.chat_name }), el('div', 'sc-prev', schedPreview(row)));
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
      chatLabels: (p) => waRequest('chatLabels', p, { timeout: 5000 }), // 2.12.0: "Todas menos a que vai colocar" (WhatsApp)
      labels: () => waRequest('labels', {}, { timeout: 5000 }), // 2.13.0: o "Não enviar" do WhatsApp nunca sai nem recebe
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
    campaignJob: (api, ctx) => campaignJob(api, ctx),
    runCampaignJob: (job, helpers) => runCampaignJob(job, helpers),
    leaseWork: async () => { await adAttributionTick(); await contactAutoTick(); await panelTick().catch(() => {}); },
  });

  // ── Disparos (2.0.0-D2): o motor só pega alvos de disparos que o usuário iniciou ──

  // 2.14.0: entre os disparos rodando, o primeiro que pode mandar agora: horário do disparo (ou o geral),
  // intervalo sorteado dele, pausa a cada N envios e o limite por hora/dia dele somado com as automações
  const campNext = new Map(); // campaignId → { last, nextAt } (intervalo sorteado uma vez por envio)
  const campWait = new Map(); // campaignId → motivo de estar esperando (para a lista)
  async function campaignJob(api, ctx = {}) {
    let r = null;
    try { r = await api('nextCampaignTarget'); } catch { r = null; }
    if (!r || !r.target) return null;
    const list = Array.isArray(r.all) && r.all.length ? r.all : [{ campaign: r.campaign, target: r.target, sent: 0, lastSentAt: null }];
    const now = ctx.now || Date.now();
    for (const x of list) {
      const c = x.campaign;
      const last = Number(x.lastSentAt) || 0;
      let n = campNext.get(c.id);
      if (!n || n.last !== last) { n = { last, nextAt: last ? last + E.campaignGapMs(c.speed) : 0 }; campNext.set(c.id, n); }
      // fora do horário geral só segue o disparo com horário próprio (os outros esperam o geral)
      const sp = E.campaignSpeed(c.speed);
      if (ctx.outside && !sp.schedule) { campWait.set(c.id, 'fora do horário'); continue; }
      const g = E.campaignGate({ speed: c.speed, sent: x.sent, lastSentAt: last, nextAt: n.nextAt, counts: ctx.counts || { hour: 0, day: 0 }, now, settings: ctx.settings || motor.state.settings });
      if (!g.ok) { campWait.set(c.id, g.reason); continue; }
      campWait.delete(c.id);
      return { kind: 'disparo', campaign: c, target: x.target, sent: x.sent };
    }
    return null;
  }

  const finishTarget = (id, status, reason) => call('finishTarget', { id, status, reason }).catch(() => null);
  const isWaAudience = (c) => !!(c && c.audience && c.audience.source === 'whatsapp');

  // 2.14.0: etiquetas do WhatsApp depois de enviar ("Todas menos a que vou colocar"; "Não enviar" nunca sai)
  async function campaignWaAfter(chatId, actions) {
    const adds = actions.filter((a) => a.type === 'adicionar_etiqueta_wa').map((a) => String(a.wa_label_id));
    const removes = actions.filter((a) => a.type === 'remover_etiqueta_wa');
    if (!adds.length && !removes.length) return;
    if (!Array.isArray(state.waLabels)) await refreshBar().catch(() => {});
    const noSendWa = (id) => isNoSendWa(waLabelById(id));
    let cur = null;
    if (removes.some((a) => a.wa_label_id === E.SALE_WA_ALL || a.wa_label_id === '__todas__')) {
      const r = await waRequest('chatLabels', { chatId }, { timeout: 5000 }).catch(() => null);
      cur = (r && r.labelIds) || [];
      for (const id of E.removeAllExcept(cur, adds, noSendWa)) await motor.setWaLabel(chatId, { remove: id });
    }
    for (const a of removes) if (a.wa_label_id !== '__todas__' && !noSendWa(a.wa_label_id)) await motor.setWaLabel(chatId, { remove: String(a.wa_label_id) });
    for (const id of adds) await motor.setWaLabel(chatId, { add: id });
    refreshBar().catch(() => {});
  }
  async function campaignCrmAfter(campaign, contactId, noSendId) {
    const acts = campaign.after_actions || [];
    const adds = acts.filter((a) => a.type === 'adicionar_etiqueta' || a.type === 'mover').map((a) => a.label_id);
    for (const a of acts) {
      try {
        if (a.type === 'adicionar_etiqueta') await call('followAdd', { contactId, labelId: a.label_id });
        else if (a.type === 'remover_etiqueta' && a.label_id === '__todas__') {
          const ids = await call('contactLabelIds', { contactId });
          for (const id of E.removeAllExcept(ids, adds, (x) => x === noSendId)) await call('followReserve', { contactId, labelId: id });
        } else if (a.type === 'remover_etiqueta') { if (a.label_id !== noSendId) await call('followReserve', { contactId, labelId: a.label_id }); }
        else if (a.type === 'mover') {
          if (campaign.label_id) await call('followReserve', { contactId, labelId: campaign.label_id });
          await call('followAdd', { contactId, labelId: a.label_id });
        }
      } catch { /* a próxima ação segue */ }
    }
  }

  async function runCampaignJob({ campaign, target, sent = 0 }, h) {
    // 2.14.0: qual variação sai neste envio (alternada / aleatória / porcentagem, pela ordem dos envios)
    const variant = E.pickVariant(sent, campaign.variants);
    const entry = { source: 'disparo', source_id: campaign.id, contact_id: target.contact_id || null, chat_id: target.chat_id || null, item_id: campaign.item_id || null, ...(E.variantCount(campaign.variants) > 1 ? { variant } : {}) };
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
    // 2.14.0: "Não enviar" do WhatsApp de novo (conversa carregada)
    if (loaded && (info.chats[target.chat_id].labels || []).some((id) => isNoSendWa(waLabelById(String(id))))) return skip('Não enviar');
    const replied = (campaign.filters || []).find((x) => x.type === 'respondeu_recente');
    const lastIn = loaded ? info.chats[target.chat_id].lastIn : null;
    if (replied && lastIn && Date.now() - lastIn * 1000 <= replied.days * 86400000) return skip(`respondeu nos últimos ${replied.days} dias`);
    let newChat = false;
    if (!loaded) {
      // Conversa não carregada: com público do WhatsApp ela EXISTE (está na etiqueta), só não está na lista; nos
      // outros, só com "Permitir conversas novas". Sempre só número (@c.us); a ponte confere com queryExists.
      if (!(isWaAudience(campaign) || campaign.allow_new_chats) || !/^\d{8,15}@c\.us$/.test(target.chat_id)) return skip('conversa não carregada');
      newChat = true;
    }
    const claimed = await call('claimTarget', { id: target.id }).catch(() => null);
    if (!claimed) return { attempted: false }; // outra aba pegou
    const logId = await h.logStart(entry);
    let res;
    try {
      const base = exclusive || partsOf(item);
      const parts = E.spinParts(E.variantParts(base, campaign.variants, variant)); // variação + {Oi|Olá}
      res = await runSequence({ parts, chatId: target.chat_id, firstName: await nameForChat(target.chat_id, E.firstNameOf(target.name)), label: 'Disparo', newChat });
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
      // Depois de enviar (2.2.0; 2.14.0: CRM e WhatsApp, "todas menos a que vou colocar"): só para quem recebeu
      const acts = campaign.after_actions || [];
      let contactId = target.contact_id;
      const crmActs = acts.filter((x) => !String(x.type).endsWith('_wa'));
      if (!contactId && crmActs.length) {
        // público do WhatsApp sem contato no CRM: cria/acha pelo telefone para poder etiquetar
        try { contactId = (await call('saleContactLabels', { chatId: target.chat_id, name: target.name || '', phone: null, addLabelId: null, removeLabelIds: [] })).contactId; } catch { contactId = null; }
      }
      if (contactId && crmActs.length) { await campaignCrmAfter({ ...campaign, after_actions: crmActs }, contactId, h.noSendLabelId); afterLabelChange(); }
      try { await campaignWaAfter(target.chat_id, acts); } catch { /* etiquetas do WhatsApp: a próxima segue */ }
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
  const v214Ready = () => motor.state.campaignsV214 === true; // 2.14.0
  const AFTER_LABEL = {
    adicionar_etiqueta: 'Colocar etiqueta CRM', remover_etiqueta: 'Tirar etiqueta CRM', mover: 'Mover (tira a do disparo e põe outra)',
    adicionar_etiqueta_wa: 'Colocar etiqueta do WhatsApp', remover_etiqueta_wa: 'Tirar etiqueta do WhatsApp',
  };
  const FILTER_LABEL = { tem_etiqueta: 'também tem a etiqueta', nao_tem_etiqueta: 'NÃO tem a etiqueta', respondeu_recente: 'excluir quem respondeu nos últimos (dias)' };
  const DP_ALL = '__todas__';
  const DP_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function openCampaignForm(c) {
    const start = c && c.start_at ? new Date(c.start_at) : null;
    const hasParts = !!(c && Array.isArray(c.parts) && c.parts.length);
    const sp = c && c.speed ? { ...E.CAMP_PRESETS.normal, ...c.speed } : { preset: 'normal', ...E.CAMP_PRESETS.normal };
    if (!sp.schedule) sp.schedule = { mode: 'geral' };
    const vr = c && c.variants && Array.isArray(c.variants.list) ? c.variants : null;
    dp.form = {
      id: c ? c.id : null, name: c ? c.name : '', label_id: c ? c.label_id || '' : '', item_id: c ? c.item_id || '' : '',
      audience: c && c.audience && c.audience.source === 'whatsapp' ? 'whatsapp' : 'crm',
      wa_label_id: c && c.audience && c.audience.wa_label_id ? String(c.audience.wa_label_id) : '',
      waCount: null, waCountFor: null,
      mode: !v2Ready() ? 'salva' : hasParts ? 'exclusiva' : c && c.item_id ? 'salva' : 'exclusiva',
      parts: hasParts ? c.parts.map(edPart) : [edPart({ type: 'texto' })],
      after_actions: c && Array.isArray(c.after_actions) ? c.after_actions.map((x) => ({ ...x })) : [],
      filters: c && Array.isArray(c.filters) ? c.filters.map((x) => ({ source: x.source === 'whatsapp' ? 'whatsapp' : 'crm', ...x })) : [],
      when: start ? 'data' : 'agora', date: start ? dateInput(start) : '', time: start ? timeInput(start) : '',
      allow_new_chats: c ? !!c.allow_new_chats : false, skip_recent_days: c ? Number(c.skip_recent_days) || 0 : 0,
      advanced: !!(c && Number(c.skip_recent_days) > 0),
      speed: sp,
      variants: { mode: vr && vr.mode ? vr.mode : 'alternada', list: vr ? vr.list.map((x) => ({ text: x.text })) : [], weights: vr && Array.isArray(vr.weights) ? vr.weights.slice() : [] },
      pv: { v: 0, seed: 1 },
      quick: { category_id: state.categories.length ? state.categories[0].id : '', title: '', saving: false },
      msg: '', err: false, saving: false,
    };
    dp.view = 'new';
    renderDisparos();
    // 2.14.0: etiquetas do WhatsApp frescas para as listas (redesenha só se mudaram)
    const form = dp.form;
    const before = JSON.stringify(state.waLabels);
    bar.lastAt = 0;
    refreshBar().catch(() => {}).then(() => { if (dp.form === form && dp.view === 'new' && JSON.stringify(state.waLabels) !== before) renderDisparos(); });
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

  // 2.14.0: "N contatos nesta etiqueta" (TODAS as conversas da etiqueta do WhatsApp, inclusive não carregadas)
  async function dpWaCount(f) {
    const id = f.wa_label_id;
    if (!id || f.waCountFor === id) return;
    f.waCountFor = id;
    f.waCount = 'lendo';
    renderDisparos();
    let n = null;
    try { const r = await waRequest('labelAllChats', { labelId: id }, { timeout: 20000 }); n = ((r && r.chats) || []).length; } catch { n = 'erro'; }
    if (dp.form !== f || f.wa_label_id !== id) return;
    f.waCount = n;
    renderDisparos();
  }

  // Lista de etiqueta CRM ou WhatsApp (com "+ Nova etiqueta…") e, se pedir, "Todas menos a que vou colocar"
  function dpTypedLabel(src, value, onChange, aria, { all = false } = {}) {
    const sel = src === 'whatsapp' ? waLabelSelect(value || '', aria, 'Escolha a etiqueta do WhatsApp…') : labelSelect(value || '', { empty: 'Escolha a etiqueta CRM…', aria });
    if (all) {
      const o = el('option', null, 'Todas menos a que vou colocar (nunca "Não enviar")');
      o.value = DP_ALL;
      o.selected = value === DP_ALL;
      const firstReal = [...sel.options].find((x) => !x.classList.contains('lc-opt'));
      sel.insertBefore(o, firstReal ? firstReal.nextSibling : null);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  const dpSrcSelect = (value, aria, onChange) => {
    const s0 = el('select', 'ed-cat');
    s0.setAttribute('aria-label', aria);
    [['crm', 'CRM'], ['whatsapp', 'WhatsApp']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = value === v; o.disabled = v === 'whatsapp' && !v214Ready(); s0.append(o); });
    s0.addEventListener('change', () => onChange(s0.value));
    return s0;
  };

  // Partes que a prévia/o envio usam (mensagem exclusiva ou a salva)
  const dpBaseParts = (f) => (f.mode === 'exclusiva' ? f.parts.map((p) => ({ type: p.type, body: p.body })) : (() => { const it = state.items.find((i) => i.id === f.item_id); return it ? partsOf(it) : []; })());

  function renderCampaignForm() {
    const f = dp.form;
    // 2.14.0: as listas do WhatsApp precisam das etiquetas: pede uma vez e redesenha quando chegarem
    if (!Array.isArray(state.waLabels) && !f.waAsked) {
      f.waAsked = true;
      (async () => {
        for (let k = 0; k < 12 && !Array.isArray(state.waLabels) && dp.form === f; k++) {
          await refreshBar().catch(() => {});
          if (!Array.isArray(state.waLabels)) await new Promise((r) => setTimeout(r, 1500));
        }
        if (dp.form === f && dp.view === 'new' && Array.isArray(state.waLabels)) renderDisparos();
      })();
    }
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', f.id ? 'EDITAR DISPARO' : 'NOVO DISPARO'));
    const name = el('input', 'ed-title');
    name.maxLength = 60;
    name.value = f.name;
    name.placeholder = 'Ex.: Black Friday clientes';
    name.addEventListener('input', () => { f.name = name.value; });
    sec.append(schedField('Nome', name));

    // Para quem: etiqueta CRM ou do WhatsApp (2.14.0)
    const who = el('div', 'sc-row dp-who');
    who.append(dpSrcSelect(f.audience, 'Público: tipo de etiqueta', (v) => { f.audience = v; f.waCountFor = null; renderDisparos(); }));
    if (f.audience === 'whatsapp') {
      who.append(dpTypedLabel('whatsapp', f.wa_label_id, (v) => { f.wa_label_id = v; f.waCountFor = null; dpWaCount(f); }, 'Etiqueta do WhatsApp do disparo'));
    } else {
      const lab = labelSelect(f.label_id, { empty: 'Escolha a etiqueta CRM…', aria: 'Etiqueta CRM do disparo' });
      lab.addEventListener('change', () => { f.label_id = lab.value; });
      who.append(lab);
    }
    sec.append(schedField('Para quem', who));
    if (f.audience === 'whatsapp') {
      if (f.wa_label_id && f.waCountFor !== f.wa_label_id) setTimeout(() => dpWaCount(f), 0);
      const cnt = f.waCount === 'lendo' ? 'Contando as conversas da etiqueta…' : f.waCount === 'erro' ? 'Não consegui ler a etiqueta no WhatsApp agora.' : typeof f.waCount === 'number' ? `${f.waCount} contato${f.waCount === 1 ? '' : 's'} nesta etiqueta` : '';
      sec.append(el('div', 'crm-intro dp-wacount', cnt ? `${cnt} (todas as conversas com a etiqueta, inclusive as não carregadas e as arquivadas).` : 'Todas as conversas com a etiqueta, inclusive as não carregadas e as arquivadas.'));
    }

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
      sec.append(el('div', 'crm-intro', 'Não cria nada em Mensagens. {nome} vira o primeiro nome; Olá{, nome}! some sem nome. {Oi|Olá|Oiii} sorteia uma palavra a cada envio.'));
      f.parts.forEach((p, i) => sec.append(edPartEl(p, i, dpCtx())));
      const add = el('div', 'ed-add');
      add.append(el('span', null, '+ Adicionar:'));
      edTypes().forEach(([v, t]) => {
        const b0 = fbtn('ed-mini', t, () => { f.parts.push(v === 'album' ? { ...edPart({ type: 'imagem' }), type: 'album', files: [] } : edPart({ type: v })); renderDisparos(); });
        b0.disabled = f.saving || f.parts.length >= ED_MAX_PARTS;
        add.append(b0);
      });
      sec.append(add);
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
      it.addEventListener('change', () => { f.item_id = it.value; renderDisparos(); });
      sec.append(it);
    }

    // Variações (2.14.0): versões alternativas do TEXTO
    sec.append(el('div', 'crm-sub', 'Variações da mensagem'));
    const V = f.variants;
    if (!v214Ready()) sec.append(el('div', 'ed-note', 'Variações: atualize o banco para usar este recurso.'));
    else {
      sec.append(el('div', 'crm-intro', 'A mensagem acima é a variação 1. Cada "+ Variação" troca só o texto (as fotos, áudios e o resto continuam iguais).'));
      V.list.forEach((x, i) => {
        const row = el('div', 'fw-variant dp-var');
        row.append(el('div', 'crm-sub', `Variação ${i + 2}`));
        const ta = el('textarea', 'ed-body dp-var-text');
        ta.rows = 3;
        ta.maxLength = 4096;
        ta.value = x.text;
        ta.placeholder = 'Outro jeito de dizer a mesma coisa. Pode usar {nome} e {Oi|Olá}.';
        ta.setAttribute('aria-label', `Texto da variação ${i + 2}`);
        ta.addEventListener('input', () => { x.text = ta.value; });
        const rm = fbtn('ed-mini', '✕', () => { V.list.splice(i, 1); V.weights.splice(i + 1, 1); renderDisparos(); });
        rm.setAttribute('aria-label', `Tirar a variação ${i + 2}`);
        row.append(ta, rm);
        sec.append(row);
      });
      const addV = fbtn('ed-mini dp-var-add', '+ Variação', () => {
        const base = dpBaseParts(f).find((p) => p.type === 'texto');
        V.list.push({ text: base ? String(base.body || '') : '' });
        renderDisparos();
      });
      addV.disabled = V.list.length >= 5;
      sec.append(addV);
      if (V.list.length) {
        const mr = el('div', 'sc-row dp-var-mode');
        [['alternada', 'Alternada (1ª, 2ª, 1ª…)'], ['aleatoria', 'Aleatória'], ['porcentagem', 'Por porcentagem']].forEach(([m, t]) => {
          const l = el('label', 'sc-radio');
          const r = el('input');
          r.type = 'radio';
          r.name = 'dp-varmode';
          r.value = m;
          r.checked = V.mode === m;
          r.addEventListener('change', () => {
            V.mode = m;
            if (m === 'porcentagem' && V.weights.length !== V.list.length + 1) { const k = V.list.length + 1; V.weights = Array.from({ length: k }, (_, j) => Math.floor(100 / k) + (j < 100 % k ? 1 : 0)); }
            renderDisparos();
          });
          l.append(r, ` ${t}`);
          mr.append(l);
        });
        sec.append(mr);
        if (V.mode === 'porcentagem') {
          const wr = el('div', 'sc-row');
          for (let j = 0; j <= V.list.length; j++) {
            const n = numberInput(V.weights[j] ?? 0, 0, 100, `Porcentagem da variação ${j + 1}`);
            n.addEventListener('input', () => { V.weights[j] = Math.floor(Number(n.value) || 0); });
            wr.append(el('span', null, `${j + 1}ª`), n, el('span', null, '%'));
          }
          sec.append(wr);
        }
      }
    }
    // Prévia com "Ver outra variação" (e um novo sorteio das {a|b})
    const k = E.variantCount(V.list.length ? V : null);
    const pvBox = el('div', 'fw-test dp-preview');
    const seed = f.pv.seed;
    let x0 = seed;
    const rnd = () => { x0 = (x0 * 9301 + 49297) % 233280; return x0 / 233280; };
    const pvParts = E.spinParts(E.variantParts(dpBaseParts(f), V.list.length ? V : null, Math.min(f.pv.v, k - 1)), rnd);
    const txt = pvParts.filter((p) => p.type === 'texto').map((p) => fillVars(p.body || '', 'Maria')).join('\n\n') || '(sem texto)';
    pvBox.append(el('div', 'crm-sub', `Prévia${k > 1 ? ` · variação ${Math.min(f.pv.v, k - 1) + 1} de ${k}` : ''} (para “Maria”)`), el('div', 'dp-pv-text', txt));
    const other = fbtn('ed-mini dp-pv-next', 'Ver outra variação', () => { f.pv.v = (f.pv.v + 1) % k; f.pv.seed = (f.pv.seed * 7 + 13) % 233280 || 1; renderDisparos(); });
    pvBox.append(other);
    sec.append(pvBox);

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

    // Público (filtros: CRM ou WhatsApp)
    sec.append(el('div', 'crm-sub', 'Público (além da etiqueta principal)'));
    f.filters.forEach((flt, i) => {
      const row = el('div', 'fw-variant');
      row.append(el('div', 'crm-sub', FILTER_LABEL[flt.type]));
      if (flt.type === 'respondeu_recente') {
        const n = numberInput(flt.days || 7, 1, 365, `Dias do filtro ${i + 1}`);
        n.addEventListener('input', () => { flt.days = Math.floor(Number(n.value) || 0); });
        row.append(n);
      } else {
        const r2 = el('div', 'sc-row');
        r2.append(dpSrcSelect(flt.source || 'crm', `Filtro ${i + 1}: tipo de etiqueta`, (v) => { flt.source = v; flt.label_id = ''; flt.wa_label_id = ''; renderDisparos(); }));
        if (flt.source === 'whatsapp') r2.append(dpTypedLabel('whatsapp', flt.wa_label_id, (v) => { flt.wa_label_id = v; }, `Etiqueta do filtro ${i + 1}`));
        else r2.append(dpLabelPicker(flt.label_id, (v) => { flt.label_id = v; }, `Etiqueta do filtro ${i + 1}`));
        row.append(r2);
      }
      const rm = fbtn('ed-mini', '✕', () => { f.filters.splice(i, 1); renderDisparos(); });
      rm.setAttribute('aria-label', 'Remover filtro');
      row.append(rm);
      sec.append(row);
    });
    const addF = el('div', 'ed-add');
    [['tem_etiqueta', '+ também tem a etiqueta'], ['nao_tem_etiqueta', '+ NÃO tem a etiqueta'], ['respondeu_recente', '+ excluir quem respondeu nos últimos X dias']].forEach(([t, label]) => {
      const b0 = fbtn('ed-mini', label, () => { f.filters.push(t === 'respondeu_recente' ? { type: t, days: 7 } : { type: t, source: 'crm', label_id: '' }); renderDisparos(); });
      b0.disabled = !v2Ready() || f.filters.length >= 10;
      addF.append(b0);
    });
    sec.append(addF, el('div', 'crm-intro', 'Quem tem a etiqueta "Não enviar" (CRM ou WhatsApp) nunca recebe.'));
    if (f.audience !== 'whatsapp') {
      const nl = el('label', 'sc-radio');
      const nc = el('input');
      nc.type = 'checkbox';
      nc.checked = f.allow_new_chats;
      nc.addEventListener('change', () => { f.allow_new_chats = nc.checked; });
      nl.append(nc, 'Permitir conversas novas');
      sec.append(nl, el('div', 'crm-intro', 'Desligado (recomendado): só conversas já carregadas no WhatsApp Web; as outras ficam "pulado". Ligado: manda também para números que nunca falaram com você, depois de conferir que o número tem WhatsApp.'));
    }

    // Depois de enviar (CRM e WhatsApp)
    sec.append(el('div', 'crm-sub', 'Depois de enviar (só para quem recebeu com sucesso)'));
    f.after_actions.forEach((x, i) => {
      const row = el('div', 'fw-variant');
      const type = el('select', 'ed-cat');
      type.setAttribute('aria-label', `Depois de enviar ${i + 1}`);
      Object.entries(AFTER_LABEL).forEach(([kk, t]) => {
        const o = el('option', null, `${i + 1}. ${t}`);
        o.value = kk;
        o.selected = x.type === kk;
        o.disabled = (kk.endsWith('_wa') && !v214Ready()) || (kk === 'mover' && f.audience === 'whatsapp');
        type.append(o);
      });
      type.addEventListener('change', () => { x.type = type.value; x.label_id = ''; x.wa_label_id = ''; renderDisparos(); });
      row.append(type);
      const isWa = x.type.endsWith('_wa');
      const isRemove = x.type === 'remover_etiqueta' || x.type === 'remover_etiqueta_wa';
      if (isWa) row.append(dpTypedLabel('whatsapp', x.wa_label_id, (v) => { x.wa_label_id = v; }, `Etiqueta depois de enviar ${i + 1}`, { all: isRemove }));
      else if (isRemove) row.append(dpTypedLabel('crm', x.label_id, (v) => { x.label_id = v; }, `Etiqueta depois de enviar ${i + 1}`, { all: true }));
      else row.append(dpLabelPicker(x.label_id, (v) => { x.label_id = v; }, `Etiqueta depois de enviar ${i + 1}`));
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
    sec.append(addA, el('div', 'crm-intro', '"Não enviar" nunca é tirada.'));

    // Velocidade e segurança (2.14.0)
    sec.append(dpSpeedSection(f));

    // Opções avançadas: "excluir quem recebeu qualquer envio automático nos últimos X dias" (desligado por padrão)
    const adv = el('details', 'dp-adv');
    adv.open = f.advanced;
    adv.addEventListener('toggle', () => { f.advanced = adv.open; });
    adv.append(el('summary', 'crm-sub', 'Opções avançadas'));
    const rl = el('label', 'sc-radio');
    const rc = el('input');
    rc.type = 'checkbox';
    rc.className = 'dp-recent-on';
    rc.checked = f.skip_recent_days > 0;
    rc.addEventListener('change', () => { f.skip_recent_days = rc.checked ? 7 : 0; renderDisparos(); });
    rl.append(rc, ' Excluir quem recebeu qualquer envio automático nos últimos…');
    adv.append(rl);
    if (f.skip_recent_days > 0) {
      const recent = numberInput(f.skip_recent_days, 1, 90, 'Excluir quem recebeu envio automático nos últimos (dias)');
      recent.addEventListener('input', () => { f.skip_recent_days = Math.max(1, Math.floor(Number(recent.value) || 0)); });
      adv.append(el('div', 'sc-row'), recent, el('span', null, ' dias'));
    }
    adv.append(el('div', 'crm-intro', 'Serve para não somar follow-up + disparo para a mesma pessoa no mesmo dia. Desligado, quem recebeu um follow-up também recebe o disparo. "Não enviar" continua sempre fora.'));
    sec.append(adv);

    const actions = el('div', 'ed-add');
    // 2.14.1: "Salvar" (vai para a revisão, como antes) + "⋯" com Simular; Cancelar continua para sair
    const save = fbtn('bbtn primary dp-save', f.saving ? 'Salvando…' : 'Salvar', () => saveCampaignForm());
    save.title = 'Salva e abre a revisão (nada é enviado sem "Iniciar disparo")';
    save.disabled = f.saving;
    actions.append(save, fbtn('bbtn', 'Cancelar', () => { dp.view = 'list'; renderDisparos(); }),
      moreMenu([{ cls: 'dp-sim', text: 'Simular', fn: () => simulateCampaignForm() }], 'Mais opções do disparo'));
    sec.append(actions, el('div', `ed-msg dp-msg${f.err ? ' err' : ''}`, f.msg));
    dtabEl.append(sec);
  }

  // "Velocidade e segurança": Bem seguro / Normal / Personalizado, limite duro, aviso amarelo e a previsão
  function dpSpeedSection(f) {
    const box = el('div', 'dp-speed');
    box.append(el('div', 'crm-sub', 'Velocidade e segurança'));
    const sp = f.speed;
    if (!v214Ready()) { box.append(el('div', 'ed-note', 'Velocidade própria do disparo: atualize o banco. Até lá valem o horário geral e os limites gerais.')); return box; }
    const r0 = el('div', 'sc-row dp-presets');
    [['seguro', 'Bem seguro'], ['normal', 'Normal'], ['personalizado', 'Personalizado']].forEach(([p, t]) => {
      const l = el('label', 'sc-radio');
      const r = el('input');
      r.type = 'radio';
      r.name = 'dp-speed';
      r.value = p;
      r.checked = sp.preset === p;
      r.addEventListener('change', () => { if (p !== 'personalizado') Object.assign(sp, E.CAMP_PRESETS[p]); sp.preset = p; renderDisparos(); });
      l.append(r, ` ${t}`);
      r0.append(l);
    });
    box.append(r0);
    if (sp.preset === 'personalizado') {
      const g = el('div', 'dp-speed-grid');
      const field = (key, label, min, max) => {
        const n = numberInput(sp[key], min, max, label);
        n.addEventListener('change', () => { sp[key] = n.value === '' ? '' : Math.floor(Number(n.value)); renderDisparos(); });
        g.append(schedField(label, n));
      };
      field('min_s', 'Intervalo mínimo (s)', 1, 3600);
      field('max_s', 'Intervalo máximo (s)', 1, 3600);
      field('per_hour', 'Máximo por hora', 1, 1000);
      field('per_day', 'Máximo por dia', 1, 5000);
      field('pause_min', 'Pausar (minutos)', 0, 240);
      field('pause_every', 'a cada N envios', 0, 500);
      box.append(g);
      // dias e horário próprios (ou o geral)
      const sc = sp.schedule || (sp.schedule = { mode: 'geral' });
      const hr = el('div', 'sc-row');
      [['geral', `Horário geral (${E.scheduleText(motor.state.settings)})`], ['personalizado', 'Dias e horário próprios']].forEach(([m, t]) => {
        const l = el('label', 'sc-radio');
        const r = el('input');
        r.type = 'radio';
        r.name = 'dp-sched';
        r.value = m;
        r.checked = (sc.mode || 'geral') === m;
        r.addEventListener('change', () => {
          if (m === 'geral') sp.schedule = { mode: 'geral' };
          else { const gs = motor.state.settings || {}; sp.schedule = { mode: 'personalizado', days: [...(gs.business_days || [1, 2, 3, 4, 5])], windows: [{ start: String(gs.business_start || '09:00').slice(0, 5), end: String(gs.business_end || '18:00').slice(0, 5) }] }; }
          renderDisparos();
        });
        l.append(r, ` ${t}`);
        hr.append(l);
      });
      box.append(hr);
      if (sc.mode === 'personalizado') {
        const days = el('div', 'vb-days');
        DP_DAYS.forEach((nm, d) => {
          const l = el('label', 'vb-day');
          const c = el('input');
          c.type = 'checkbox';
          c.checked = (sc.days || []).includes(d);
          c.setAttribute('aria-label', `Disparo: ${nm}`);
          c.addEventListener('change', () => { sc.days = c.checked ? [...new Set([...(sc.days || []), d])].sort() : (sc.days || []).filter((x) => x !== d); renderDisparos(); });
          l.append(c, nm);
          days.append(l);
        });
        box.append(days);
        (sc.windows || []).forEach((w, i) => {
          const r = el('div', 'sc-row');
          const t1 = el('input', 'ed-title vb-time');
          t1.type = 'time';
          t1.value = w.start;
          t1.setAttribute('aria-label', `Disparo, faixa ${i + 1}: início`);
          t1.addEventListener('change', () => { w.start = t1.value; renderDisparos(); });
          const t2 = el('input', 'ed-title vb-time');
          t2.type = 'time';
          t2.value = w.end;
          t2.setAttribute('aria-label', `Disparo, faixa ${i + 1}: fim`);
          t2.addEventListener('change', () => { w.end = t2.value; renderDisparos(); });
          r.append(el('span', null, 'das'), t1, el('span', null, 'às'), t2);
          if (sc.windows.length > 1) r.append(fbtn('ed-mini', '✕', () => { sc.windows.splice(i, 1); renderDisparos(); }));
          box.append(r);
        });
        if ((sc.windows || []).length < 6) box.append(fbtn('ed-mini', '+ outra faixa', () => { sc.windows.push({ start: '14:00', end: '18:00' }); renderDisparos(); }));
      }
    }
    const cut = E.campaignSpeedClamped(sp);
    box.append(el('div', 'crm-intro dp-speed-text', `${E.campaignSpeedText(sp, motor.state.settings)}.`));
    box.append(el('div', 'crm-intro', `Limite de segurança, que nenhum disparo passa: intervalo mínimo de ${E.CAMP_HARD.min_s} s, ${E.CAMP_HARD.per_hour} por hora e ${E.CAMP_HARD.per_day} por dia. Os limites por hora/dia contam o disparo SOMADO com as automações e agendados (o maior risco é a soma), e os limites gerais também valem.`));
    if (cut.length) box.append(el('div', 'vb-warn dp-cut', `⚠ Acima do limite de segurança: vai valer ${cut.join(', ')}.`));
    if (E.campaignSpeedRisk(sp)) box.append(el('div', 'vb-warn dp-risk', '⚠ Mais rápido que o "Normal": aumenta o risco de o WhatsApp bloquear o número.'));
    const n = f.audience === 'whatsapp' && typeof f.waCount === 'number' ? f.waCount : null;
    if (n != null) box.append(el('div', 'fw-count dp-forecast', E.forecastText(n, E.campaignForecast(n, sp, motor.state.settings, Date.now()), Date.now())));
    return box;
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
      if (Rich.isRich(p.type)) { out.push(richPartForSave(p, i)); continue; } // 2.9.2
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
    if (String(JSON.stringify([f.after_actions, f.filters])).includes('"new:')) throw new Error('Crie as etiquetas que faltam (botão "Criar agora").');
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
      parts = upload ? await partsForSave(f.parts, dpMsg) : f.parts.map((p, i) => (Rich.isRich(p.type) ? richPartForSave(p, i) : { type: p.type, body: p.type === 'audio' ? null : p.body, file_url: p.file_url || (p.file ? 'pendente' : null), file_name: p.file_name, file_size: p.file_size, wait_seconds: p.wait_seconds, typing_seconds: p.typing_seconds }));
    }
    const v2 = v2Ready();
    const v214 = v214Ready();
    const wa = v214 && f.audience === 'whatsapp';
    if (wa && !f.wa_label_id) throw new Error('Escolha a etiqueta do WhatsApp.');
    const sp = f.speed;
    const speed = !v214 ? undefined : sp.preset === 'personalizado'
      ? { preset: 'personalizado', min_s: sp.min_s, max_s: sp.max_s, per_hour: sp.per_hour, per_day: sp.per_day, pause_every: sp.pause_every || 0, pause_min: sp.pause_every ? sp.pause_min : 0, ...(sp.schedule && sp.schedule.mode === 'personalizado' ? { schedule: sp.schedule } : {}) }
      : { preset: sp.preset };
    const V = f.variants;
    const variants = v214 && V.list.length ? { mode: V.mode, list: V.list.map((x) => ({ text: x.text })), ...(V.mode === 'porcentagem' ? { weights: V.weights.slice(0, V.list.length + 1) } : {}) } : null;
    return {
      name: f.name, label_id: wa ? null : f.label_id || null, item_id: exclusive ? null : f.item_id || null, start_at, allow_new_chats: wa ? false : f.allow_new_chats,
      skip_recent_days: f.skip_recent_days,
      ...(v2 ? {
        parts,
        after_actions: f.after_actions.map((x) => (x.type.endsWith('_wa') ? { type: x.type, wa_label_id: x.wa_label_id || null } : { type: x.type, label_id: x.label_id || null })),
        filters: f.filters.map((x) => (x.type === 'respondeu_recente' ? { type: x.type, days: x.days } : x.source === 'whatsapp' ? { type: x.type, source: 'whatsapp', wa_label_id: x.wa_label_id || null } : { type: x.type, label_id: x.label_id || null })),
      } : {}),
      ...(v214 ? { audience: wa ? { source: 'whatsapp', wa_label_id: f.wa_label_id } : null, speed, variants } : {}),
    };
  }

  // 2.14.0: o que só o WhatsApp sabe (o servidor não vê as etiquetas do WhatsApp): TODAS as conversas da
  // etiqueta do público e dos filtros (inclusive não carregadas e arquivadas) e quem está em "Não enviar"
  async function campaignWaCtx(c) {
    const needs = isWaAudience(c) || (c.filters || []).some((x) => x.source === 'whatsapp');
    if (!Array.isArray(state.waLabels)) await refreshBar().catch(() => {});
    const labels = Array.isArray(state.waLabels) ? state.waLabels : null;
    if (!labels) { if (needs) throw new Error('o WhatsApp ainda não respondeu (etiquetas do WhatsApp indisponíveis)'); return null; }
    const read = async (id) => { const r = await waRequest('labelAllChats', { labelId: String(id) }, { timeout: 20000 }); return (r && r.chats) || []; };
    const keysOf = (list) => list.flatMap((x) => [x.id, x.phone ? `${x.phone}@c.us` : null]).filter(Boolean);
    const out = { sets: {}, noSend: [], names: {} };
    try {
      if (isWaAudience(c)) out.audience = (await read(c.audience.wa_label_id)).map((x) => ({ id: x.id, name: x.name || null, phone: x.phone || null }));
      for (const x of c.filters || []) {
        if (x.source !== 'whatsapp' || out.sets[x.wa_label_id]) continue;
        out.sets[x.wa_label_id] = keysOf(await read(x.wa_label_id));
        out.names[x.wa_label_id] = (waLabelById(String(x.wa_label_id)) || {}).name || 'do WhatsApp';
      }
      const no = labels.find(isNoSendWa);
      if (no) out.noSend = keysOf(await read(no.id));
    } catch (e) {
      if (needs) throw new Error(`não consegui ler as etiquetas do WhatsApp (${e.message})`);
      return null;
    }
    return out;
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
    if (Rich.isRich(first.type)) return `[${Rich.LABEL[first.type]}] ${Rich.summary(first)}${text ? ` · ${firstWords(text, 10)}` : ''}`; // 2.9.2
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
        if (!(isWaAudience(campaign) || campaign.allow_new_chats) || !/^\d{8,15}@c\.us$/.test(t.chat_id || '')) return { ...t, send: false, reason: 'conversa não carregada' };
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
      const pv = await call('simulateCampaign', { campaign: { ...campaign, parts: campaign.parts && campaign.parts.map((p) => (p.file_url === 'pendente' ? { ...p, file_url: null, type: 'texto', body: p.body || `[${p.type}]` } : p)) }, wa: await campaignWaCtx(campaign) });
      dp.sim = { from: 'new', campaign, ...(await runSimulation(campaign, pv)) };
      dp.view = 'simulate';
      renderDisparos();
    } catch (e) {
      dpMsg(`Não consegui simular: ${e.message}`, true);
    }
  }

  async function simulateSaved(c) {
    try {
      const pv = await call('previewCampaign', { id: c.id, wa: await campaignWaCtx(c) });
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
    box.append(el('div', 'dp-forecast', E.forecastText(sim.sending, E.campaignForecast(sim.sending, sim.campaign.speed, motor.state.settings, Date.now()), Date.now())));
    sec.append(box);
    sim.rows.slice(0, 200).forEach((r) => {
      const line = el('div', `sc-item fw-sim ${r.send ? 'ok' : 'skip'}`);
      const main = el('div', 'sc-main');
      main.append(convLink(el('div', 'sc-who', r.name || 'Contato'), { chatId: r.chat_id, phone: r.phone, name: r.name }), el('div', 'sc-prev', r.send ? `${r.newChat ? '(conversa nova) ' : ''}${r.preview}` : `pulado: ${r.reason}`));
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
      const wa = await campaignWaCtx(c);
      const pv = await call('previewCampaign', { id: c.id, wa });
      const chatIds = pv.chatIds || [];
      const loaded = new Set();
      for (let i = 0; i < chatIds.length; i += 500) {
        try {
          const r = await waRequest('chatsInfo', { chatIds: chatIds.slice(i, i + 500), keywords: [] }, { timeout: 8000 });
          Object.keys((r && r.chats) || {}).forEach((id) => loaded.add(id));
        } catch { /* sem WhatsApp pronto: conta como não carregada */ }
      }
      const notLoaded = chatIds.filter((id) => !loaded.has(id));
      const newOk = c.allow_new_chats || isWaAudience(c) ? notLoaded.filter((id) => /@c\.us$/.test(id)).length : 0;
      const notLoadedSkip = notLoaded.length - newOk;
      dp.confirm = { campaign: c, loading: false, pv, wa, loaded: loaded.size, newOk, notLoadedSkip, sending: loaded.size + newOk };
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
    const audName = isWaAudience(c) ? `do WhatsApp ${(waLabelById(String(c.audience.wa_label_id)) || {}).name || ''}`.trim() : labelName(c.label_id);
    const lines = [
      `Na etiqueta ${audName}: ${pv.total} contato${pv.total === 1 ? '' : 's'}`,
      `Vão receber: ${cf.sending}${cf.newOk ? (isWaAudience(c) ? ` (${cf.newOk} em conversa que não está carregada agora)` : ` (${cf.newOk} em conversa nova, se o número tiver WhatsApp)`) : ''}`,
    ];
    const skips = Object.entries(pv.skipped || {});
    if (cf.notLoadedSkip) skips.push(['conversa não carregada no WhatsApp Web', cf.notLoadedSkip]);
    const skipTotal = skips.reduce((a, [, n]) => a + n, 0);
    lines.push(`Pulados: ${skipTotal}${skips.length ? ` (${skips.map(([r, n]) => `${r}: ${n}`).join('; ')})` : ''}`);
    lines.push(`Mensagem: ${Array.isArray(c.parts) && c.parts.length ? `exclusiva deste disparo (${c.parts.length} parte${c.parts.length === 1 ? '' : 's'})` : itemTitle(c.item_id)}`);
    if (E.variantCount(c.variants) > 1) lines.push(`Variações: ${E.variantCount(c.variants)} (${{ alternada: 'alternadas', aleatoria: 'aleatórias', porcentagem: `por porcentagem: ${(c.variants.weights || []).map((w) => `${w}%`).join(' / ')}` }[c.variants.mode] || 'alternadas'})`);
    lines.push(`Velocidade: ${E.campaignSpeedText(c.speed, motor.state.settings)}`);
    lines.push(`Previsão: ${E.forecastText(cf.sending, E.campaignForecast(cf.sending, c.speed, motor.state.settings, c.start_at && Date.parse(c.start_at) > Date.now() ? Date.parse(c.start_at) : Date.now()), Date.now())}`);
    lines.push(c.start_at && Date.parse(c.start_at) > Date.now() ? `Começa em ${schedWhen(c.start_at)} (no horário comercial)` : 'Começa agora (no horário comercial)');
    const box = el('div', 'fw-test');
    lines.forEach((l) => box.append(el('div', null, l)));
    sec.append(box);
    if (E.campaignSpeedRisk(c.speed)) sec.append(el('div', 'vb-warn dp-risk', '⚠ Mais rápido que o "Normal": aumenta o risco de o WhatsApp bloquear o número.'));
    sec.append(el('div', 'ed-note', MASS_WARNING));
    const actions = el('div', 'ed-add');
    const go = fbtn('bbtn primary dp-start', dp.busy ? 'Iniciando…' : 'Iniciar disparo', () => startCampaignNow(c, cf.wa));
    go.disabled = dp.busy || !cf.sending;
    // 2.14.1: Simular no "⋯"; a previsão fica ao lado de "Iniciar disparo", sem precisar simular
    actions.append(go, fbtn('bbtn', 'Voltar', () => { dp.view = 'list'; refreshDisparos(); }),
      moreMenu([{ cls: 'dp-sim', text: 'Simular', fn: () => simulateSaved(c) }], 'Mais opções do disparo'));
    const startAt = c.start_at && Date.parse(c.start_at) > Date.now() ? Date.parse(c.start_at) : Date.now();
    sec.append(actions, el('div', 'fw-count dp-forecast dp-forecast-start', E.forecastText(cf.sending, E.campaignForecast(cf.sending, c.speed, motor.state.settings, startAt), Date.now())));
    dtabEl.append(sec);
  }

  async function startCampaignNow(c, waRead) {
    if (dp.busy) return;
    dp.busy = true;
    renderDisparos();
    try {
      // a foto é tirada agora: lê o WhatsApp de novo (a etiqueta pode ter mudado desde a confirmação)
      const wa = await campaignWaCtx(c).catch((e) => { if (waRead === undefined) throw e; return waRead; });
      const r = await call('startCampaign', { id: c.id, wa });
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
      const [r, vs] = await Promise.all([
        call('campaignTargets', { id: c.id, offset: prev.length, limit: 200 }),
        more || E.variantCount(c.variants) <= 1 ? Promise.resolve(null) : call('campaignVariantStats', { id: c.id }).catch(() => null),
      ]);
      dp.detail = { campaign: c, loading: false, targets: [...prev, ...r.targets], hasMore: r.hasMore, variants: more && dp.detail ? dp.detail.variants : vs };
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
    const waitWhy = campWait.get(d.campaign.id);
    if (waitWhy && d.campaign.status === 'rodando') sec.append(el('div', 'crm-intro dp-wait', `Esperando: ${waitWhy}.`));
    // 2.14.0: resultado por variação
    if (d.variants && d.variants.available && d.variants.rows.length) {
      const vt = el('div', 'fw-test dp-vstats');
      vt.append(el('div', 'crm-sub', 'Por variação'));
      d.variants.rows.forEach((v) => vt.append(el('div', 'dp-vrow', `Variação ${v.variant + 1}: ${v.sent} enviada${v.sent === 1 ? '' : 's'} · ${v.repliedPct == null ? '—' : `${Math.round(v.repliedPct * 100)}%`} responderam · ${v.sales} venda${v.sales === 1 ? '' : 's'}${v.revenue ? ` (R$ ${v.revenue.toFixed(2).replace('.', ',')})` : ''}`)));
      sec.append(vt);
    }
    if (d.error) sec.append(el('div', 'ed-msg err', d.error));
    if (!d.loading && !d.targets.length) sec.append(el('div', 'lt-none', 'Nenhum alvo.'));
    d.targets.forEach((t) => {
      const line = el('div', `sc-item st-${t.status}`);
      const main = el('div', 'sc-main');
      main.append(convLink(el('div', 'sc-who', t.name || 'Contato'), { chatId: t.chat_id, name: t.name }), el('div', 'sc-prev', t.reason || (t.sent_at ? `enviado ${schedWhen(t.sent_at)}` : '')));
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
    loadFollowStats();
  }
  async function loadFollowStats(force = false) {
    if (!automationsReady() || fl.statsBusy || (!force && fl.statsAt && Date.now() - fl.statsAt < 60 * 1000)) return;
    fl.statsBusy = true;
    const ids = motor.state.automations.map((a) => a.id).slice(0, 100);
    const seqIds = motor.state.automations.filter((a) => a.kind === 'sequencia').map((a) => a.id).slice(0, 100);
    const ignoredItems = motor.state.automations.filter((a) => a.active && a.activated_at && !a.include_existing && E.waTriggerLabelOf(a))
      .map((a) => ({ automationId: a.id, labelId: E.waTriggerLabelOf(a), activatedAt: a.activated_at })).slice(0, 100);
    const [queue, sent, seq, ignored] = await Promise.all([
      motor.queueCounts().catch(() => null),
      ids.length ? call('automationSentCounts', { automationIds: ids }).catch(() => null) : {},
      seqIds.length ? call('seqStats', { automationIds: seqIds }).catch(() => null) : {},
      ignoredItems.length ? call('nativeLabelIgnored', { items: ignoredItems }).catch(() => null) : {},
    ]);
    fl.stats = { queue: queue || {}, sent: sent || {}, seq: seq || {}, ignored: ignored || {} };
    fl.statsAt = Date.now();
    fl.statsBusy = false;
    if (fl.open && fl.view === 'list') renderFollows();
  }

  const fbtn = (cls, text, onClick) => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  // ── 2.14.1: "⋯" (Mais opções) discreto no canto: os itens menos usados, funcionando igual ──
  // items: [{ cls, text, fn, disabled }] (itens falsos são ignorados). Fecha ao escolher, ao clicar fora e no Esc.
  function moreMenu(items, aria = 'Mais opções') {
    const wrap = el('span', 'more-wrap');
    const btn = el('button', 'bbtn more-btn', '⋯');
    btn.type = 'button';
    btn.title = 'Mais opções';
    btn.setAttribute('aria-label', aria);
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    const menu = el('div', 'more-menu');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const outside = (e) => { if (!e.composedPath().includes(wrap)) close(); };
    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
    }
    items.filter(Boolean).forEach((it) => {
      const b = el('button', `more-item ${it.cls || ''}`.trim(), it.text);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.disabled = !!it.disabled;
      b.addEventListener('click', (e) => { e.stopPropagation(); close(); it.fn(); });
      menu.append(b);
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!menu.hidden) { close(); return; }
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outside, true);
      const first = menu.querySelector('.more-item:not([disabled])');
      if (first) first.focus();
    });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); e.stopPropagation(); close(); btn.focus(); } });
    wrap.append(btn, menu);
    return wrap;
  }

  // ── 2.13.4: "+ Nova etiqueta…" em qualquer lista de etiquetas (uma função só, usada em todas) ──
  // Primeira opção da lista. Escolhendo, abre ali mesmo nome + cor com "Criar"/"Cancelar" (a lista volta ao que
  // estava, ninguém vê a opção). Criada, a etiqueta já fica escolhida NAQUELA lista (dispara o "change" normal da
  // lista, então quem a usa grava como se você tivesse escolhido). Nome repetido: "Já existe" e escolhe a existente.
  // CRM: createLabel. WhatsApp: WA-JS labels.addNewLabel (só WhatsApp Business; sem isso a opção diz por quê).
  const LC_NEW = '__nova_etiqueta__';
  const LC_PALETTE = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#6b7280'];
  const lcWa = { info: null, loading: null }; // { available, reason, colors }
  function lcWaInfo() {
    if (lcWa.info || lcWa.loading) return lcWa.loading || Promise.resolve(lcWa.info);
    lcWa.loading = waRequest('labelColors', {}, { timeout: 5000 })
      .then((r) => { lcWa.info = r && typeof r === 'object' ? r : { available: false, reason: 'no_function', colors: [] }; })
      .catch((e) => { lcWa.info = e && e.code === 'unknown_type' ? { available: false, reason: 'no_function', colors: [] } : null; })
      .finally(() => { lcWa.loading = null; });
    // "ainda não está pronto" não fica guardado: pergunta de novo na próxima vez
    return lcWa.loading.then(() => { const i = lcWa.info; if (i && i.reason === 'not_ready') lcWa.info = null; return i; });
  }
  const lcWaReason = (info) => (!info ? '' : info.reason === 'not_business' ? 'só no WhatsApp Business' : info.reason === 'no_function' ? 'esta versão do WhatsApp Web não deixa criar' : info.reason === 'not_ready' ? 'o WhatsApp ainda não está pronto' : '');
  // sel: o <select>; kinds: ['crm'] | ['wa'] | ['crm', 'wa']; waPrefix: valor das opções do WhatsApp numa lista mista ('wa:')
  function withLabelCreate(sel, { kinds = ['crm'], waPrefix = '' } = {}) {
    const mixed = kinds.length > 1;
    const opts = kinds.map((k) => {
      const o = el('option', 'lc-opt', mixed ? (k === 'wa' ? '+ Nova etiqueta do WhatsApp…' : '+ Nova etiqueta CRM…') : '+ Nova etiqueta…');
      o.value = `${LC_NEW}${k}`;
      o.dataset.kind = k;
      return o;
    });
    sel.prepend(...opts);
    const waOpt = opts.find((o) => o.dataset.kind === 'wa');
    const markWa = (info) => {
      if (!waOpt || !info || info.available) return;
      waOpt.disabled = true;
      waOpt.textContent = `${waOpt.textContent} (indisponível: ${lcWaReason(info)})`;
    };
    if (waOpt) { if (lcWa.info) markWa(lcWa.info); else lcWaInfo().then(markWa).catch(() => {}); }
    let prev = sel.value;
    // a lista pode ter sido escolhida pelo código depois de montada: guarda o valor de verdade ao focar
    sel.addEventListener('focus', () => { if (!sel.value.startsWith(LC_NEW)) prev = sel.value; });
    sel.addEventListener('change', (e) => {
      if (!sel.value.startsWith(LC_NEW)) { prev = sel.value; return; }
      e.stopImmediatePropagation(); // quem usa a lista nunca vê a opção "+ Nova etiqueta…"
      const kind = sel.value.slice(LC_NEW.length);
      sel.value = prev;
      lcOpenForm(sel, kind, waPrefix);
    }, true);
    return sel;
  }
  function lcPick(sel, value) {
    if (![...sel.options].some((o) => o.value === value)) {
      const l = value.startsWith('wa:') || sel.dataset.lcKind === 'wa' ? waLabelById(value.replace(/^wa:/, '')) : state.labels.find((x) => x.id === value);
      const o = el('option', null, l ? l.name : value);
      o.value = value;
      sel.append(o);
    }
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function lcOpenForm(sel, kind, waPrefix) {
    const old = sel.parentElement && sel.parentElement.querySelector(':scope > .lc-form');
    if (old) old.remove();
    const wa = kind === 'wa';
    const form = el('div', 'lc-form');
    form.setAttribute('role', 'group');
    form.setAttribute('aria-label', wa ? 'Nova etiqueta do WhatsApp' : 'Nova etiqueta CRM');
    const name = el('input', 'ed-title lc-name');
    name.type = 'text';
    name.maxLength = wa ? 25 : 40;
    name.placeholder = wa ? 'Nome da etiqueta do WhatsApp' : 'Nome da etiqueta CRM';
    name.setAttribute('aria-label', 'Nome da nova etiqueta');
    const colors = el('div', 'lc-colors');
    const msg = el('div', 'lc-msg');
    let color = null;
    const paint = (list) => {
      colors.textContent = '';
      color = list[wa ? 0 : 5] || list[0] || null;
      list.forEach((c) => {
        const b = el('button', 'lc-color');
        b.type = 'button';
        b.style.background = c;
        b.setAttribute('aria-label', `Cor ${c}`);
        b.setAttribute('aria-pressed', String(c === color));
        b.addEventListener('click', () => { color = c; colors.querySelectorAll('.lc-color').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
        colors.append(b);
      });
    };
    let busy = false;
    const close = () => { form.remove(); try { sel.focus(); } catch { /* */ } };
    const create = async () => {
      if (busy) return;
      const nm = name.value.replace(/\s+/g, ' ').trim();
      if (!nm) { msg.textContent = 'Escreva o nome.'; msg.className = 'lc-msg err'; name.focus(); return; }
      const val = (id) => (wa ? `${waPrefix}${id}` : id);
      const existing = wa ? waLabelByName(nm) : state.labels.find((l) => l.name.toLowerCase() === nm.toLowerCase());
      if (existing) {
        toast(`Já existe a etiqueta “${existing.name}”: escolhi a existente.`, 'info', 4000);
        form.remove();
        lcPick(sel, val(existing.id));
        return;
      }
      busy = true;
      go.disabled = true;
      go.textContent = 'Criando…';
      msg.textContent = '';
      try {
        let id;
        if (wa) {
          const r = await waRequest('labelCreate', { name: nm, color }, { timeout: 15000 });
          if (r && Array.isArray(r.labels)) state.waLabels = r.labels;
          id = r && r.label && r.label.id;
          try { renderBar(); renderWaTab(); } catch { /* ainda iniciando */ }
        } else {
          try { id = (await call('createLabel', { name: nm, color: color || '#3b82f6' })).id; } catch (e) {
            await syncLabels().catch(() => {});
            const again = state.labels.find((l) => l.name.toLowerCase() === nm.toLowerCase());
            if (!again) throw e;
            toast(`Já existe a etiqueta “${again.name}”: escolhi a existente.`, 'info', 4000);
            form.remove();
            lcPick(sel, again.id);
            return;
          }
          await syncLabels().catch(() => {});
        }
        if (!id) throw new Error('a etiqueta não voltou');
        toast(`Etiqueta “${nm}” criada${wa ? ' no WhatsApp' : ''} e escolhida.`, 'success', 3000);
        form.remove();
        lcPick(sel, val(String(id)));
      } catch (e) {
        busy = false;
        go.disabled = false;
        go.textContent = 'Criar';
        msg.textContent = `Não consegui criar: ${e.message}`;
        msg.className = 'lc-msg err';
      }
    };
    const go = fbtn('ed-mini primary lc-create', 'Criar', create);
    const no = fbtn('ed-mini lc-cancel', 'Cancelar', close);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
    form.append(name, colors, go, no, msg);
    sel.after(form);
    if (wa) {
      paint(lcWa.info && lcWa.info.colors && lcWa.info.colors.length ? lcWa.info.colors : []);
      lcWaInfo().then((info) => {
        if (!form.isConnected) return;
        if (info && info.available === false) { msg.textContent = `Não dá para criar etiqueta do WhatsApp aqui: ${lcWaReason(info)}.`; msg.className = 'lc-msg err'; go.disabled = true; return; }
        if (info && info.colors && info.colors.length && !colors.children.length) paint(info.colors);
      }).catch(() => {});
    } else paint(LC_PALETTE);
    setTimeout(() => name.focus(), 0);
  }

  function labelSelect(value, { empty = null, aria, create = true } = {}) {
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
    return create ? withLabelCreate(sel, { kinds: ['crm'] }) : sel; // 2.13.4
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
    row.append(p, fbtn('bbtn fw-settings', 'Horário geral e limites de segurança', () => { if (state.section !== 'follows') setSection('follows'); openSettings(); }));
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

  // 2.11.0: frases em vez de termos técnicos (o (i) de cada um explica mais)
  const TRIGGER_LABEL = {
    sem_resposta: 'Não respondeu à sua mensagem por algum tempo', entrou_etiqueta: 'Algum tempo depois de entrar na etiqueta',
    respondeu: 'O cliente respondeu', dia_hora: 'Num dia e hora fixos da semana', venda_registrada: 'Uma venda foi registrada pela conversa (💰)',
  };
  const TRIGGER_INFO = {
    sem_resposta: 'Conta em tempo corrido, a partir da sua última mensagem. Se o cliente responder antes, não manda. O envio respeita o horário de envio (mude em "Horário geral e limites").',
    entrou_etiqueta: 'Conta o tempo corrido (dia e noite) desde que o contato entrou na etiqueta, mesmo que vocês tenham conversado no meio.',
    respondeu: 'Roda quando a última mensagem da conversa é do cliente.',
    dia_hora: 'Nos dias e na hora escolhidos, uma vez por dia, para cada contato da etiqueta.',
    venda_registrada: 'Uma vez para cada venda registrada pelo 💰 da conversa. Dá para esperar alguns dias antes de mandar.',
  };
  const ACTION_LABEL = {
    enviar: 'Enviar mensagem', adicionar_etiqueta: 'Colocar uma etiqueta CRM', remover_etiqueta: 'Tirar uma etiqueta CRM', mover: 'Mover para outra etiqueta CRM (tira a do gatilho)',
    adicionar_etiqueta_wa: 'Colocar uma etiqueta do WhatsApp', remover_etiqueta_wa: 'Tirar uma etiqueta do WhatsApp', parar: 'Parar aqui',
  };
  const ACTION_INFO = {
    enviar: 'Manda uma mensagem rápida (pode ter várias partes: texto, áudio, fotos…). Escolha uma pronta ou crie aqui.',
    mover: 'Tira o contato da etiqueta do gatilho e coloca na escolhida (ex.: Follow Up 1 → Follow Up 2).',
    parar: 'As ações depois desta não rodam.',
  };
  const COND_LABEL = { tem_etiqueta: 'Só se tiver a etiqueta CRM', nao_tem_etiqueta: 'Só se NÃO tiver a etiqueta CRM', anuncio: 'Só se veio do anúncio com a palavra', parada_max_dias: 'Só se a conversa estiver parada há no máximo (dias)' };
  const NEW_LABEL = 'new:';
  const automationsReady = () => motor.state.available === true && motor.state.automationsAvailable === true;
  const activeAutomations = () => motor.state.automations.filter((a) => a.active);
  // 2.5.0: etiquetas do WhatsApp (nativas) no gatilho e nas ações
  const waLabelName = (id) => { const l = waLabelById(String(id)); return l ? l.name : `etiqueta ${id}`; };
  const summaryOf = (a) => E.automationSummary(a, { labelName: (id) => (String(id).startsWith(NEW_LABEL) ? String(id).slice(NEW_LABEL.length) : labelName(id)), waLabelName, itemTitle, settings: motor.state.settings });

  // 2.11.0: "Quando …, se …: faz …" numa frase
  function automationSentence(a) {
    if (a.kind === 'sequencia') return seqSentence(a); // 2.12.0
    const s = summaryOf(a);
    const low = (t) => t.charAt(0).toLowerCase() + t.slice(1);
    const se = s.se === 'Sem condições' ? '' : ` e ${low(s.se.replace(/^Se /, 'se '))}`;
    return `${s.quando}${se}: ${low(s.entao.replace(/^Então /, ''))}.`;
  }

  function automationCard(a) {
    const card = el('div', `fw-card${a.active ? ' on' : ''}`);
    const head = el('div', 'fw-head');
    // 2.12.6: interruptor (ligar abre a confirmação; desligar é na hora)
    const sw = el('button', 'fw-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', a.active ? 'true' : 'false');
    sw.setAttribute('aria-label', `${a.active ? 'Desligar' : 'Ligar'} ${a.name}`);
    sw.title = a.active ? 'Desligar' : 'Ligar';
    sw.addEventListener('click', () => toggleAutomation(a));
    // 2.16.3: rascunho incompleto (desligado): selo "RASCUNHO · faltam N itens" e o interruptor não liga
    const missing = !a.active && a.kind === 'sequencia' ? vbMissing({ def: a.sequence || {}, name: a.name }) : [];
    if (missing.length) {
      sw.disabled = true;
      sw.classList.add('fw-switch-off');
      sw.title = `Complete antes de ligar: ${missing.join('; ')}`;
      sw.setAttribute('aria-label', `${a.name}: rascunho, complete antes de ligar`);
    }
    head.append(sw, el('span', 'fw-name', a.name), missing.length
      ? el('span', 'fw-badge draft', `RASCUNHO · falta${missing.length === 1 ? '' : 'm'} ${missing.length} ite${missing.length === 1 ? 'm' : 'ns'}`)
      : el('span', `fw-badge${a.active ? ' on' : ''}`, a.active ? 'LIGADA' : 'DESLIGADA'));
    if (a.test_chat_id) head.append(el('span', 'fw-badge test', 'EM TESTE')); // 2.8.8
    card.append(head);
    if (missing.length) card.append(el('div', 'crm-intro fw-draft-tip', `Para ligar, complete: ${missing.join('; ')}. Toque em Editar.`));
    if (a.test_chat_id) card.append(el('div', 'crm-intro', `Em teste: roda só para ${testChatLabel(a.test_chat_id)}; ignora todos os outros.`));
    const ign = fl.stats && fl.stats.ignored ? fl.stats.ignored[a.id] : null; // 2.12.5
    if (Number.isFinite(ign)) card.append(el('div', 'crm-intro fw-ignored', `Ignorados por já estarem na etiqueta: ${ign}`));
    if (a.active && a.activated_at) card.append(el('div', 'crm-intro', `Vale daqui pra frente: desde ${new Date(a.activated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${a.include_existing ? ' (incluiu quem já estava na etiqueta)' : ''}.`));
    // 2.11.0: uma frase só
    card.append(el('div', 'fw-txt fw-sentence', automationSentence(a)));
    if (a.kind === 'sequencia') card.append(seqStatsEl(a)); // 2.12.0: quantos em cada passo e saídas por ✅/❌
    const qc = a.kind === 'sequencia' ? null : fl.stats && fl.stats.queue ? fl.stats.queue[a.id] : null;
    const sent = fl.stats && fl.stats.sent ? fl.stats.sent[a.id] : null;
    const st = el('div', 'fw-stats');
    if (a.kind !== 'sequencia') st.append(el('span', null, a.active ? (qc ? `Na fila agora: ${qc.waiting + qc.ready}${qc.ready ? ` (${qc.ready} prontos)` : ''}` : fl.stats ? 'Na fila agora: 0' : 'Na fila agora: …') : 'Na fila: — (desligada)'),
      el('span', null, `Já receberam: ${sent == null ? (fl.stats ? '—' : '…') : sent}`));
    card.append(st);
    const actions = el('div', 'ed-add');
    const confirmKey = `del:${a.id}`;
    actions.append(
      // 2.13.0: abrem no construtor visual (as que não dá para desenhar: editor antigo, com o aviso)
      fbtn('ed-mini fw-edit', 'Editar', () => vbOpen(a)),
      fbtn('ed-mini', 'Duplicar', () => vbOpen({ ...a, id: null, name: `${a.name} (cópia)`.slice(0, 60), active: false, test_chat_id: null })),
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
      act.busy = true;
      try {
        const base = await baselineWaLabel(a).catch(() => null); // 2.12.5 (a regra da ponte protege mesmo se falhar)
        await call('setAutomationActive', { id: a.id, active: true, includeExisting: !!act.include });
        fl.activating = null;
        fl.statsAt = 0; // 2.12.5: "ignorados" de novo
        await motor.loadAutomations();
        flash(act.include ? 'Automação ligada (incluindo quem já estava na etiqueta).' : `Automação ligada: vale para quem entrar daqui pra frente.${baselineText(base)}`);
      } catch (e) { act.err = e.message; act.busy = false; }
      renderFollows();
      renderFootPause();
    }, () => { fl.activating = null; renderFollows(); }));
    return card;
  }

  async function toggleAutomation(a) {
    // ligar: mostra antes quem já está na etiqueta (e NÃO vai receber); desligar: na hora
    if (!a.active) { fl.activating = { id: a.id, include: false, info: null, advanced: false }; renderFollows(); loadActivationInfo(a); return; }
    try {
      await call('setAutomationActive', { id: a.id, active: false });
      await motor.loadAutomations();
      flash(`"${a.name}" desligada.`);
    } catch (e) { flash(`Não consegui mudar: ${e.message}`, true); }
    renderFollows();
    renderFootPause();
  }

  // ── 2.8.8: ativar = vale daqui pra frente ──
  const LABEL_TRIGGERS = ['sem_resposta', 'entrou_etiqueta', 'respondeu'];
  function testChatLabel(chatId) {
    const c = (fl.recentChats || []).find((x) => x.id === chatId);
    return c && c.name ? `${c.name} (${chatId.split('@')[0]})` : chatId.split('@')[0];
  }
  // quem já está na etiqueta do gatilho (CRM pelo banco; WhatsApp: 2.12.5 TODAS as conversas da etiqueta, não só as
  // carregadas na lista). Também para a sequência que começa por etiqueta do WhatsApp.
  async function loadActivationInfo(a) {
    const act = (fl.view === 'edit' && fl.edit && fl.edit.activation) || fl.activating || (fl.edit && fl.edit.activation);
    const waLabel = E.waTriggerLabelOf(a);
    if (!act || (!waLabel && !LABEL_TRIGGERS.includes(a.trigger_type))) return;
    let list = null;
    try {
      if (waLabel) {
        const r = await waRequest('labelAllChats', { labelId: waLabel }, { timeout: 15000 });
        list = (r && r.chats ? r.chats : []).map((c) => ({ name: c.name || null, phone: c.phone || (/@c\.us$/.test(c.id) ? c.id.split('@')[0] : null) }));
      } else if (a.trigger_label_id && !String(a.trigger_label_id).startsWith(NEW_LABEL)) {
        list = await call('automationExisting', { labelId: a.trigger_label_id });
      } else list = [];
    } catch (e) { act.infoErr = e.message; list = null; }
    act.info = list;
    renderFollows();
  }
  // 2.12.5: etiqueta do WhatsApp: registra agora TODAS as conversas que estão nela como "já estavam" (ao ligar ou ao
  // trocar o gatilho/etiqueta). Devolve { total, label } ou null (gatilho sem etiqueta do WhatsApp).
  async function baselineWaLabel(a) {
    const labelId = E.waTriggerLabelOf(a);
    if (!labelId) return null;
    const r = await waRequest('labelAllChats', { labelId }, { timeout: 15000 });
    const chats = (r && r.chats) || [];
    await call('nativeLabelBaseline', { labelId, chats: chats.slice(0, 5000) });
    return { total: chats.length, label: waLabelName(labelId) };
  }
  // "23 contatos com a etiqueta Cliente ficaram de fora"
  const baselineText = (b) => (b && b.total ? ` ${b.total} contato${b.total === 1 ? '' : 's'} com a etiqueta ${b.label} ficaram de fora.` : '');

  // 2.12.6: confirmação única de "ligar" (interruptor da lista, "Salvar e ligar" e "Ligar para todos" do editor):
  // "Ligar 'Nome'? Vale só para quem entrar na etiqueta X a partir de agora. N contatos que já estão nela não vão
  // receber." [Ligar] [Cancelar]. Incluir quem já está fica em "Opções avançadas" (desmarcado).
  function activationLabelName(a) {
    const wa = E.waTriggerLabelOf(a);
    if (wa) return waLabelName(wa);
    if (a.kind === 'sequencia') {
      const s = a.sequence && a.sequence.start;
      return s && s.type === 'etiqueta' && s.label_id ? labelName(s.label_id) : null;
    }
    if (!LABEL_TRIGGERS.includes(a.trigger_type) || !a.trigger_label_id) return null;
    return String(a.trigger_label_id).startsWith(NEW_LABEL) ? String(a.trigger_label_id).slice(NEW_LABEL.length) : labelName(a.trigger_label_id);
  }
  const activationNeedsInfo = (a) => (a.kind !== 'sequencia' && LABEL_TRIGGERS.includes(a.trigger_type)) || !!E.waTriggerLabelOf(a);
  function activationText(a, n) {
    const kind = a.kind === 'sequencia' ? 'outro' : a.trigger_type === 'dia_hora' ? 'dia_hora' : a.trigger_type === 'venda_registrada' ? 'venda' : 'etiqueta';
    return E.activationSentence({ name: a.name, label: activationLabelName(a), kind, n: activationNeedsInfo(a) ? n : null });
  }
  function activationEl(a, act, onConfirm, onCancel) {
    const box = el('div', 'fw-block act-box');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', `Ligar ${a.name || 'automação'}`);
    const needs = activationNeedsInfo(a);
    const n = act.info ? act.info.length : null;
    box.append(el('div', 'act-text', activationText(a, n)));
    if (needs && n == null) box.append(el('div', 'lt-none loading', act.infoErr ? `Não consegui ver quem já está na etiqueta: ${act.infoErr}` : 'Contando quem já está na etiqueta…'));
    if (n) {
      const adv = el('details', 'act-adv');
      adv.open = !!act.advanced;
      adv.addEventListener('toggle', () => { act.advanced = adv.open; });
      adv.append(el('summary', null, 'Opções avançadas'));
      const lab = el('label', 'sc-radio');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!act.include;
      cb.setAttribute('aria-label', 'Incluir também quem já está na etiqueta');
      cb.addEventListener('change', () => { act.include = cb.checked; act.advanced = true; renderFollows(); });
      lab.append(cb, ` Incluir também quem já está na etiqueta (${n})`);
      adv.append(lab);
      if (act.include) {
        adv.append(el('div', 'ed-note', `Estes ${n} vão receber${n > 50 ? ' (mostrando 50)' : ''}:`));
        const ul = el('ul', 'act-list');
        act.info.slice(0, 50).forEach((c) => ul.append(el('li', null, [c.name, c.phone].filter(Boolean).join(' · ') || 'sem nome')));
        adv.append(ul);
      }
      box.append(adv);
    }
    const row = el('div', 'ed-add');
    const go = el('button', 'bbtn primary act-go', act.include && n ? `Ligar e incluir ${n}` : 'Ligar');
    go.type = 'button';
    go.disabled = (needs && n == null && !act.infoErr) || !!act.busy;
    go.addEventListener('click', onConfirm);
    const no = el('button', 'bbtn act-no', 'Cancelar');
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
    ftabEl.append(el('div', 'crm-intro', 'Automações: quando algo acontece com um contato de uma etiqueta (ou com quem você adicionou pelo 🔁), a extensão manda a mensagem e mexe nas etiquetas por você, uma vez por entrada. Só no horário comercial, com o WhatsApp Web aberto e nunca para quem tem "Não enviar".'));
    if (motor.state.available === null) { ftabEl.append(el('div', 'lt-none loading', 'Carregando…')); return; }
    if (!automationsReady()) {
      ftabEl.append(el('div', 'ed-note', 'Atualize o banco para usar este recurso.'));
      if (motor.state.available === true) ftabEl.append(el('div', 'crm-intro', 'As réguas de follow da 2.0.0 continuam rodando até a atualização.'));
      return;
    }
    if (fl.view === 'templates') { renderTemplates(); return; }
    if (fl.view === 'wizard' && fl.wiz) { renderWizard(); return; } // 2.11.0
    if (fl.view === 'seq' && fl.seq) { renderSeqEditor(); return; } // 2.12.0
    if (fl.view === 'edit') { renderAutomationEditor(); return; }
    if (fl.view === 'settings') { renderSettings(); return; }
    if (fl.view === 'simulate') { renderSimulation(); return; }
    if (fl.view === 'history') { renderHistory(); return; }
    if (fl.view === 'conversa') { renderChatAutomations(); return; }

    renderFollowsTop(ftabEl);
    if (!fl.statsAt) queueMicrotask(() => loadFollowStats()); // 2.11.0: números da lista (de novo depois de salvar)
    if (fl.msg) ftabEl.append(el('div', `ed-msg${fl.msgErr ? ' err' : ''}`, fl.msg));
    const list = el('section', 'crmsec');
    // 2.14.1: o que era a seção "Ferramentas" fica no "⋯" do título (funciona igual)
    const head = el('div', 'wt-head fw-listhead');
    head.append(el('span', null, 'AUTOMAÇÕES'), moreMenu([
      { cls: 'fw-tool-sim', text: 'Simular', fn: () => openSimulation() },
      { cls: 'fw-tool-test', text: 'Testar com a conversa aberta', fn: () => testOpenChat() },
      { cls: 'fw-tool-hist', text: 'Histórico', fn: () => openHistory() },
      { cls: 'fw-tool-add', text: '🔁 Adicionar a conversa aberta a uma automação', fn: () => openChatAutomations() },
    ], 'Mais opções das automações'));
    list.append(head);
    if (fl.test) {
      const t = el('div', 'fw-test');
      fl.test.forEach((line) => t.append(el('div', null, line)));
      list.append(t);
    }
    const items = [...motor.state.automations].sort((a, b) => (a.position || 0) - (b.position || 0));
    if (!items.length) list.append(el('div', 'lt-none', fl.loading ? 'Carregando…' : 'Nenhuma automação ainda.'));
    items.forEach((a) => list.append(automationCard(a)));
    list.append(fbtn('fw-card fw-new', '+ Nova automação', () => vbOpen(null))); // 2.13.0: construtor visual
    ftabEl.append(list);
  }

  // ── Modelos prontos (só preenchem o editor; nada é criado sem Salvar) ──

  const labelIdByName = (name) => { const l = state.labels.find((x) => x.name.toLowerCase() === String(name).toLowerCase()); return l ? l.id : null; };
  const labelRef = (name) => labelIdByName(name) || `${NEW_LABEL}${name}`;

  // (i): explicação curta, abre e fecha no clique
  function infoTip(text) {
    const wrap = el('span', 'fw-info');
    const b = el('button', 'fw-i', 'i');
    b.type = 'button';
    b.title = text;
    b.setAttribute('aria-label', `Explicação: ${text}`);
    b.setAttribute('aria-expanded', 'false');
    const tip = el('div', 'fw-tip', text);
    tip.hidden = true;
    b.addEventListener('click', (e) => { e.stopPropagation(); tip.hidden = !tip.hidden; b.setAttribute('aria-expanded', String(!tip.hidden)); });
    wrap.append(b, tip);
    return wrap;
  }
  const withInfo = (text, info) => { const t = el('span', 'fw-lbl'); t.append(text); if (info) t.append(infoTip(info)); return t; };

  // 2.11.0: mensagem da ação: escolher pronta, criar aqui (o MESMO editor das mensagens rápidas) ou editar a escolhida
  // 2.13.0: onBack = volta para o construtor visual (sempre, com ou sem mensagem salva)
  async function openMessageEditorFor(apply, item = null, onBack = null) {
    let cat = state.categories.find((c) => c.name.trim().toLowerCase() === 'automações');
    if (!cat && !item) {
      try {
        const c = await call('createCategory', { name: 'Automações' });
        await reloadLibrary().catch(() => {});
        cat = state.categories.find((x) => x.id === c.id) || c;
      } catch (e) { flash(`Não consegui criar a categoria "Automações": ${e.message}`, true); renderFollows(); if (onBack) onBack(); return; }
    }
    const back = (itemId) => {
      setSection('follows');
      if (itemId) apply(itemId);
      renderFollows();
      if (onBack) onBack(itemId);
    };
    setSection('mensagens');
    openEditor(item, { categoryId: cat ? cat.id : null, returnTo: back });
  }
  function msgPickerEl(value, onPick, { aria = 'Mensagem', empty = 'Escolha uma mensagem pronta…', invalid = '' } = {}) {
    const box = el('div', `fw-msgpick${invalid ? ' fw-invalid' : ''}`);
    const sel = itemSelect(value, { empty, aria });
    sel.addEventListener('change', () => { onPick(sel.value); renderFollows(); });
    const row = el('div', 'ed-add');
    row.append(fbtn('ed-mini fw-newmsg', '+ Criar mensagem aqui', () => openMessageEditorFor((id) => onPick(id))));
    const cur = value && state.items.find((i) => i.id === value);
    if (cur) row.append(fbtn('ed-mini fw-editmsg', 'Editar esta mensagem', () => openMessageEditorFor((id) => onPick(id), cur)));
    box.append(sel, row);
    if (cur) box.append(el('div', 'crm-intro', `${itemTitle(cur.id)}${isMultiPart(cur) ? ` · ${cur.parts.length} partes` : ''}`));
    if (invalid) box.append(el('div', 'fw-errmsg', invalid));
    return box;
  }

  // ── 2.12.0: SEQUÊNCIA (respondeu / não respondeu) ──
  const SEQ_START = { lead: 'Lead novo chamou', etiqueta: 'Entrou na etiqueta', venda: 'Venda registrada (💰)', manual: 'Adicionei manualmente (🔁 Automação da conversa)' };
  const SEQ_ORIGIN = { todos: 'todos os leads', anuncio: 'só leads de anúncio', organico: 'só leads orgânicos' };
  const seqLabelName = (src, id) => (src === 'whatsapp' ? waLabelName(id) : String(id || '').startsWith(NEW_LABEL) ? String(id).slice(NEW_LABEL.length) : labelName(id));
  function seqStartText(st) {
    if (!st) return '?';
    if (st.type === 'lead') return `quando um lead novo chama (${SEQ_ORIGIN[st.origin || 'todos']})`;
    if (st.type === 'etiqueta') return `quando entra na etiqueta “${seqLabelName(st.source, st.source === 'whatsapp' ? st.wa_label_id : st.label_id)}”`;
    if (st.type === 'venda') return `quando uma venda é registrada pela conversa${st.label_id ? ` (só quem está em “${seqLabelName('crm', st.label_id)}”)` : ''}`;
    return 'quando você adiciona a conversa pelo 🔁';
  }
  function seqSentence(a) {
    const def = a.sequence || {};
    const idx = E.seqIndex(def);
    const n = [...idx.values()];
    const sends = n.filter((e) => e.node.type === 'enviar').length;
    const waits = n.filter((e) => e.node.type === 'esperar').length;
    return `Sequência: começa ${seqStartText(def.start)}; ${sends} mensage${sends === 1 ? 'm' : 'ns'} e ${waits} espera${waits === 1 ? '' : 's'} de resposta.`;
  }
  function seqStatsEl(a) {
    const box = el('div', 'fw-stats sq-stats');
    const st = fl.stats && fl.stats.seq ? fl.stats.seq[a.id] : null;
    if (!st) { box.append(el('span', null, fl.stats ? 'Ninguém entrou ainda.' : 'Carregando os números…')); return box; }
    const nodes = Object.entries(st.nodes || {});
    box.append(el('span', null, `Agora: ${st.active}`));
    nodes.forEach(([id, k]) => box.append(el('span', 'sq-at', `${E.seqNodeLabel(a.sequence, id, { itemTitle })}: ${k}`)));
    box.append(el('span', 'sq-yes', `Saíram por ✅: ${st.yes}`), el('span', 'sq-no', `por ❌: ${st.no}`));
    return box;
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function openSeqEditor(a, templateKey = null) {
    const def = a && a.sequence ? clone(a.sequence) : E.seqTemplate(templateKey === 'lead_followup' ? 'lead_followup' : 'blank');
    fl.seq = {
      id: a ? a.id : null, name: a ? a.name : templateKey === 'lead_followup' ? 'Follow-up de lead novo' : 'Sequência', active: !!(a && a.active), wasActive: !!(a && a.id && a.active),
      testOn: !!(a && a.test_chat_id), test_chat_id: (a && a.test_chat_id) || '', def, msg: '', err: false, triedSave: false, invalid: [],
    };
    fl.view = 'seq';
    if (!Array.isArray(state.waLabels)) refreshBar().then(() => { if (fl.view === 'seq') renderFollows(); }).catch(() => {});
    renderFollows();
  }
  const seqNew = (type) => {
    const id = E.seqId();
    if (type === 'enviar') return { id, type, item_id: '' };
    if (type === 'etiqueta') return { id, type, op: 'colocar', source: 'crm', label_id: '' };
    if (type === 'esperar') return { id, type, amount: 1, unit: 'dias', yes: [], no: [] };
    if (type === 'ir') return { id, type, to: '' };
    return { id, type: 'fim' };
  };
  // título curto de um passo (para "Continuar para…")
  function seqNodeTitle(def, id) {
    const e = E.seqIndex(def).get(id);
    if (!e) return '?';
    const n = e.node;
    if (n.type === 'enviar') return `Mandar “${n.item_id ? itemTitle(n.item_id) : '(sem mensagem)'}”`;
    if (n.type === 'esperar') return `Esperar resposta (${n.amount} ${n.unit})`;
    if (n.type === 'etiqueta') return `${n.op === 'tirar' ? 'Tirar' : 'Colocar'} etiqueta`;
    return n.type === 'fim' ? 'Fim' : 'Continuar';
  }
  function seqLabelPick(n, label) {
    const box = el('div', 'sc-row');
    const src = el('select', 'ed-cat');
    src.setAttribute('aria-label', `${label}: tipo de etiqueta`);
    [['crm', 'CRM'], ['whatsapp', 'WhatsApp']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = (n.source || 'crm') === v; src.append(o); });
    src.addEventListener('change', () => { n.source = src.value; n.label_id = ''; n.wa_label_id = ''; renderFollows(); });
    box.append(src);
    if (n.source === 'whatsapp') {
      const ws = waLabelSelect(n.wa_label_id || '', label);
      ws.addEventListener('change', () => { n.wa_label_id = ws.value; });
      box.append(ws);
    } else box.append(labelPicker(n.label_id, (v) => { n.label_id = v; }, { aria: label }));
    return box;
  }
  function seqListEl(f, list, depth) {
    const wrap = el('div', 'sq-list');
    const bad = (id) => (f.invalid || []).filter((x) => x.node === id).map((x) => x.msg).join(' ');
    list.forEach((n, i) => {
      const node = el('div', `sq-node sq-${n.type}`);
      node.dataset.node = n.id;
      const head = el('div', 'sq-head');
      const title = { enviar: '✉️ Enviar mensagem', etiqueta: '🏷️ Etiqueta', esperar: '⏳ Esperar resposta', fim: '⏹ Fim (sai da automação)', ir: '↪ Continuar para…' }[n.type] || n.type;
      head.append(el('span', 'sq-title', title));
      const ctl = el('span', 'sq-ctl');
      const up = fbtn('ed-mini', '↑', () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); renderFollows(); });
      up.disabled = i === 0;
      up.setAttribute('aria-label', 'Subir passo');
      const down = fbtn('ed-mini', '↓', () => { list.splice(i + 1, 0, list.splice(i, 1)[0]); renderFollows(); });
      down.disabled = i === list.length - 1;
      down.setAttribute('aria-label', 'Descer passo');
      const rm = fbtn('ed-mini', '✕', () => { list.splice(i, 1); renderFollows(); });
      rm.setAttribute('aria-label', 'Remover passo');
      ctl.append(up, down, rm);
      head.append(ctl);
      node.append(head);
      if (n.type === 'enviar') {
        node.append(msgPickerEl(n.item_id, (id) => { n.item_id = id; }, { aria: `Mensagem do passo ${i + 1}` }));
        if (n.hint && !n.item_id) node.append(el('div', 'ed-note', `Sugestão: ${n.hint}.`));
      } else if (n.type === 'etiqueta') {
        const op = el('select', 'ed-cat');
        op.setAttribute('aria-label', 'Colocar ou tirar');
        [['colocar', 'Colocar'], ['tirar', 'Tirar']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = n.op === v; op.append(o); });
        op.addEventListener('change', () => { n.op = op.value; if (n.op === 'tirar') delete n.remove_others; renderFollows(); });
        node.append(op, seqLabelPick(n, 'Etiqueta do passo'));
        if (n.op !== 'tirar') {
          const l = el('label', 'sc-radio');
          const cb = el('input');
          cb.type = 'checkbox';
          cb.checked = !!n.remove_others;
          cb.addEventListener('change', () => { n.remove_others = cb.checked; });
          l.append(cb, ' Tirar todas as outras (menos a que vai colocar)');
          node.append(l);
        }
      } else if (n.type === 'esperar') {
        const r = el('div', 'sc-row');
        const amount = numberInput(n.amount, 1, 8760, 'Quanto tempo esperar');
        amount.addEventListener('input', () => { n.amount = Math.floor(Number(amount.value) || 0); });
        const unit = el('select', 'ed-cat');
        unit.setAttribute('aria-label', 'Unidade');
        ['minutos', 'horas', 'dias'].forEach((u) => { const o = el('option', null, u); o.value = u; o.selected = n.unit === u; unit.append(o); });
        unit.addEventListener('change', () => { n.unit = unit.value; });
        r.append(el('span', null, 'por'), amount, unit);
        node.append(r);
        const l = el('label', 'sc-radio');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!n.after_mine;
        cb.addEventListener('change', () => { n.after_mine = cb.checked; });
        l.append(cb, ' Contar a partir da MINHA última mensagem (espera você responder antes)');
        node.append(l, infoTip('Respondeu = o cliente mandou qualquer mensagem depois do nosso último envio desta sequência. Se você mandar outra mensagem durante a espera, o tempo recomeça dela.'));
        const yes = el('div', 'sq-branch sq-yes');
        yes.append(el('div', 'sq-btitle', '✅ Respondeu'), seqListEl(f, n.yes, depth + 1));
        const no = el('div', 'sq-branch sq-no');
        no.append(el('div', 'sq-btitle', '❌ Não respondeu'), seqListEl(f, n.no, depth + 1));
        const branches = el('div', 'sq-branches');
        branches.append(yes, no);
        node.append(branches);
      } else if (n.type === 'ir') {
        const sel = el('select', 'ed-cat');
        sel.setAttribute('aria-label', 'Continuar para');
        const none = el('option', null, 'Escolha o passo…');
        none.value = '';
        sel.append(none);
        [...E.seqIndex(f.def).keys()].filter((id) => id !== n.id).forEach((id) => { const o = el('option', null, seqNodeTitle(f.def, id)); o.value = id; o.selected = n.to === id; sel.append(o); });
        sel.addEventListener('change', () => { n.to = sel.value; });
        node.append(sel);
      }
      const m = bad(n.id);
      if (m) { node.classList.add('fw-invalid'); node.append(el('div', 'fw-errmsg', m)); }
      wrap.append(node);
    });
    const last = list[list.length - 1];
    if (!last || (last.type !== 'fim' && last.type !== 'ir')) wrap.append(el('div', 'sq-end', '↳ Fim (sai da automação)'));
    const add = el('div', 'ed-add sq-add');
    [['enviar', '+ Mensagem'], ['etiqueta', '+ Etiqueta'], ['esperar', '+ Esperar resposta'], ['fim', '+ Fim'], ['ir', '+ Continuar para…']].forEach(([t, txt]) => {
      const b = fbtn(`ed-mini sq-add-${t}`, txt, () => { list.push(seqNew(t)); renderFollows(); });
      if (t === 'esperar' && depth >= E.SEQ_MAX_DEPTH) { b.disabled = true; b.title = `No máximo ${E.SEQ_MAX_DEPTH} esperas uma dentro da outra`; }
      add.append(b);
    });
    wrap.append(add);
    return wrap;
  }
  function renderSeqEditor() {
    const f = fl.seq;
    if (f.triedSave) f.invalid = E.seqValidate(f.def);
    const sec = el('section', 'crmsec fw-editor sq-editor');
    sec.append(el('div', 'wt-head', f.id ? 'EDITAR SEQUÊNCIA' : 'NOVA SEQUÊNCIA'));
    sec.append(el('div', 'crm-intro', 'De cima para baixo, como uma receita. Cada "Esperar resposta" abre dois caminhos: ✅ Respondeu e ❌ Não respondeu.'));
    const name = el('input', 'ed-title');
    name.maxLength = 60;
    name.value = f.name;
    name.setAttribute('aria-label', 'Nome da sequência');
    name.addEventListener('input', () => { f.name = name.value; });
    sec.append(schedField('Nome', name));
    // Começo
    const st = f.def.start;
    const start = el('div', 'fw-block sq-start');
    start.append(el('div', 'fw-k', 'COMEÇO (QUEM ENTRA)'));
    const type = el('select', 'ed-cat');
    type.setAttribute('aria-label', 'Quem entra');
    Object.entries(SEQ_START).forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = st.type === v; type.append(o); });
    type.addEventListener('change', () => { f.def.start = { type: type.value, ...(type.value === 'lead' ? { origin: 'todos' } : type.value === 'etiqueta' ? { source: 'crm', label_id: '' } : {}) }; renderFollows(); });
    start.append(type);
    if (st.type === 'lead') {
      const o = el('select', 'ed-cat');
      o.setAttribute('aria-label', 'Quais leads');
      Object.entries(SEQ_ORIGIN).forEach(([v, t]) => { const op = el('option', null, t); op.value = v; op.selected = (st.origin || 'todos') === v; o.append(op); });
      o.addEventListener('change', () => { st.origin = o.value; });
      start.append(o, el('div', 'crm-intro', 'Automático: a 1ª mensagem de uma conversa nova (registrada pela extensão), sem precisar de etiqueta.'));
    } else if (st.type === 'etiqueta') start.append(seqLabelPick(st, 'Etiqueta de quem entra'));
    else if (st.type === 'venda') start.append(schedField('Só quem estiver na etiqueta CRM (opcional)', labelPicker(st.label_id || '', (v) => { st.label_id = v; }, { empty: '(qualquer cliente)', aria: 'Etiqueta (opcional)' })));
    else start.append(el('div', 'crm-intro', 'Entra quem você adicionar pela conversa: botão 🔁 Automação → Adicionar à automação.'));
    start.append(el('div', 'ed-note', 'Só vale daqui pra frente: quem já estava antes de ligar não entra.'));
    const sbad = (f.invalid || []).filter((x) => x.node === 'start').map((x) => x.msg).join(' ');
    if (sbad) { start.classList.add('fw-invalid'); start.append(el('div', 'fw-errmsg', sbad)); }
    sec.append(start);
    sec.append(el('div', 'crm-intro', 'Esperas em tempo corrido (5 dias = 5 dias de calendário). Se o envio cair fora do horário de envio, espera o próximo horário permitido.')); // 2.14.2
    const steps = el('div', 'fw-block');
    steps.append(el('div', 'fw-k', 'PASSOS'));
    steps.append(seqListEl(f, f.def.steps, 1));
    sec.append(steps);
    // ligar / testar
    const on = el('label', 'sc-radio');
    const ocb = el('input');
    ocb.type = 'checkbox';
    ocb.checked = f.active;
    ocb.addEventListener('change', () => { f.active = ocb.checked; });
    on.append(ocb, ' Ligada');
    const test = el('label', 'sc-radio');
    const tcb = el('input');
    tcb.type = 'checkbox';
    tcb.checked = f.testOn;
    tcb.addEventListener('change', async () => {
      f.testOn = tcb.checked;
      if (f.testOn && !fl.recentChats) { try { fl.recentChats = await waRequest('recentChats', { limit: 30 }, { timeout: 6000 }); } catch { fl.recentChats = []; } }
      renderFollows();
    });
    test.append(tcb, ' Testar comigo (só a conversa escolhida)');
    sec.append(on, test);
    if (f.testOn) {
      const sel = el('select', 'ed-cat');
      sel.setAttribute('aria-label', 'Conversa de teste');
      const none = el('option', null, (fl.recentChats || []).length ? 'Escolha a conversa de teste…' : 'Nenhuma conversa carregada no WhatsApp');
      none.value = '';
      sel.append(none);
      (fl.recentChats || []).forEach((c) => { const o = el('option', null, c.name || c.id.split('@')[0]); o.value = c.id; o.selected = c.id === f.test_chat_id; sel.append(o); });
      sel.addEventListener('change', () => { f.test_chat_id = sel.value; });
      sec.append(sel);
    }
    sec.append(el('div', 'crm-intro', 'Segurança de sempre: nunca para "Não enviar" (sai da sequência), limites por hora/dia, horário comercial e o WhatsApp Web aberto.'));
    const row = el('div', 'ed-add');
    const save = fbtn('bbtn primary sq-save', fl.saving ? 'Salvando…' : 'Salvar', () => saveSeq());
    save.disabled = fl.saving;
    row.append(save, fbtn('bbtn', 'Cancelar', () => { fl.seq = null; backToList(); }));
    sec.append(row, el('div', `ed-msg${f.err ? ' err' : ''}`, f.msg));
    ftabEl.append(sec);
  }
  async function saveSeq() {
    const f = fl.seq;
    if (!f || fl.saving) return;
    f.triedSave = true;
    const problems = E.seqValidate(f.def);
    if (!String(f.name || '').trim()) problems.unshift({ node: 'name', msg: 'Dê um nome para a sequência.' });
    if (f.testOn && !f.test_chat_id) problems.unshift({ node: 'test', msg: 'Escolha a conversa de teste.' });
    if (problems.length) {
      f.msg = problems.length === 1 ? problems[0].msg : `${problems[0].msg} (e mais ${problems.length - 1} marcado${problems.length === 2 ? '' : 's'} em vermelho)`;
      f.err = true;
      renderFollows();
      const first = ftabEl.querySelector('.fw-invalid');
      if (first) first.scrollIntoView({ block: 'center' });
      return;
    }
    fl.saving = true;
    f.msg = '';
    renderFollows();
    try {
      const def = clone(f.def);
      // etiquetas que ainda não existem ("new:Nome"): cria agora
      const fake = [{ trigger_label_id: def.start.label_id || null, actions: [] }];
      E.seqIndex(def).forEach(({ node: n }) => { if (n.type === 'etiqueta' && n.source !== 'whatsapp') fake[0].actions.push(n); });
      await resolveNewLabels(fake);
      if (def.start.label_id) def.start.label_id = fake[0].trigger_label_id;
      E.seqIndex(def).forEach(({ node: n }) => { if (n.hint) delete n.hint; });
      const base = f.active ? await baselineWaLabel({ kind: 'sequencia', sequence: def }).catch(() => null) : null; // 2.12.5
      await call('saveAutomation', { id: f.id || undefined, automation: { kind: 'sequencia', name: f.name, active: f.active, sequence: def, test_chat_id: f.testOn ? f.test_chat_id : null }, includeExisting: false });
      await motor.loadAutomations();
      fl.statsAt = 0;
      flash(f.active ? (f.testOn ? 'Sequência ligada em teste: só a conversa escolhida.' : `Sequência ligada: vale para quem entrar daqui pra frente.${baselineText(base)}`) : 'Sequência salva (desligada).');
      fl.seq = null;
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

  // painel da conversa: "Na automação X · passo: esperando resposta (faltam 1h20)"
  const cseq = { chatId: null, runs: [], busy: false };
  async function loadChatSequence(chatId) {
    const box = shadow.querySelector('.cseq');
    cseq.chatId = chatId;
    if (!box) return;
    if (!chatId || motor.state.sequencesAvailable !== true) { box.hidden = true; cseq.runs = []; return; }
    let runs = [];
    try { runs = await call('seqChatRuns', { chatId }); } catch { runs = []; }
    if (cseq.chatId !== chatId) return;
    cseq.runs = Array.isArray(runs) ? runs : [];
    renderChatSequence();
  }
  function renderChatSequence() {
    const box = shadow.querySelector('.cseq');
    if (!box) return;
    box.textContent = '';
    box.hidden = !cseq.runs.length;
    cseq.runs.forEach((r) => {
      const def = r.automation.sequence || {};
      const run = { ...r, due_at: Date.parse(r.due_at || '') || null };
      const line = el('div', 'cseq-line');
      line.append(el('span', 'cseq-t', `🔁 Na automação ${r.automation.name} · passo: ${E.seqDescribe(def, run, Date.now(), { itemTitle })}`));
      const e = E.seqIndex(def).get(r.node);
      const btns = el('span', 'cseq-btns');
      const out = fbtn('ed-mini cseq-out', 'Tirar da automação', () => chatSeqAction(r, 'sair'));
      btns.append(out);
      if (e && e.node.type === 'esperar') btns.append(fbtn('ed-mini cseq-skip', 'Pular espera', () => chatSeqAction(r, 'pular')));
      btns.querySelectorAll('button').forEach((b) => { b.disabled = cseq.busy; });
      line.append(btns);
      box.append(line);
    });
  }
  async function chatSeqAction(r, action) {
    if (cseq.busy) return;
    cseq.busy = true;
    renderChatSequence();
    try {
      await call('seqRunAction', { id: r.id, action });
      toast(action === 'sair' ? `Conversa tirada de "${r.automation.name}".` : 'Espera pulada: no próximo ciclo segue pelo ❌ Não respondeu.', 'ok', 4000);
    } catch (e) { toast(e.message, 'error', 5000); }
    cseq.busy = false;
    await loadChatSequence(cseq.chatId);
  }
  setInterval(() => { if (state.open && cseq.chatId && cseq.runs.length && !document.hidden) renderChatSequence(); }, 30 * 1000); // "faltam…" anda sozinho

  // ── 2.15.0: ver mensagens apagadas e editadas ──
  // A cópia fica SÓ neste computador (deleted-store.js, pela ponte; nunca no Supabase). Aqui: liga/desliga, lista da
  // conversa aberta (painel), selo "👁 Ver mensagem apagada" / "✏️ Ver original" junto da mensagem no WhatsApp e a
  // janela que mostra o conteúdo original. Se a ponte não tiver os eventos ou falhar, nada aparece (sem erro).
  const dl = { chatId: null, items: [], busy: false, cfg: null, view: null };
  const DEL_KIND = { texto: 'texto', imagem: '📷 imagem', video: '🎥 vídeo', audio: '🎤 áudio', documento: '📄 documento', figurinha: 'figurinha', localizacao: '📍 localização', contato: '👤 contato' };
  function delSyncConfig() {
    const on = !!pz.prefs.keepDeleted;
    if (dl.cfg === on) return;
    dl.cfg = on;
    waRequest('deletedConfig', { on }, { timeout: 5000 }).catch(() => { dl.cfg = null; });
  }
  async function delLoadChat(chatId) {
    dl.chatId = chatId || null;
    if (!dl.chatId) { dl.items = []; renderDeleted(); return; }
    let res = null;
    try { res = await waRequest('deletedList', { chatId: dl.chatId }, { timeout: 8000 }); } catch { res = null; }
    if (dl.chatId !== chatId) return;
    dl.items = res && Array.isArray(res.items) ? res.items : [];
    renderDeleted();
    decorateDeleted();
  }
  async function delTick() {
    if (dl.busy || document.hidden) return;
    dl.busy = true;
    try {
      delSyncConfig();
      let ch = [];
      try { ch = await waRequest('deletedChanges', {}, { timeout: 5000 }); } catch { ch = []; }
      if (Array.isArray(ch) && dl.chatId && ch.some((x) => x && x.chatId === dl.chatId)) await delLoadChat(dl.chatId);
      else decorateDeleted();
    } finally { dl.busy = false; }
  }
  setInterval(() => { delTick().catch(() => {}); }, 3000);
  const delLabel = (m) => (m.revokedAt ? '👁 apagada' : '✏️ editada');
  function renderDeleted() {
    const box = shadow.querySelector('.cdel');
    if (!box) return;
    box.textContent = '';
    box.hidden = !dl.items.length;
    if (!dl.items.length) return;
    box.append(el('div', 'cdel-t', 'Mensagens apagadas/editadas nesta conversa (últimos 7 dias)'));
    dl.items.slice(0, 20).forEach((m) => {
      const b = el('button', 'cdel-row');
      b.type = 'button';
      b.title = m.revokedAt ? 'Ver mensagem apagada' : 'Ver original';
      b.append(el('span', 'cdel-k', `${delLabel(m)} · ${formatChatDate(m.t)}`), el('span', 'cdel-p', m.preview || DEL_KIND[m.kind] || 'mensagem'));
      b.addEventListener('click', () => openDeletedView(m.id));
      box.append(b);
    });
    if (dl.items.length > 20) box.append(el('div', 'cdel-t', `+ ${dl.items.length - 20} mais antigas`));
  }
  // Selo junto da mensagem no WhatsApp (a linha da mensagem tem data-id = id da mensagem)
  function decorateDeleted() {
    const main = document.getElementById('main');
    if (!main) return;
    const want = new Map(dl.items.map((m) => [m.id, m]));
    main.querySelectorAll('.tsp-del-badge').forEach((b) => { if (!want.has(b.dataset.id)) b.remove(); });
    want.forEach((m, id) => {
      let row = null;
      try { row = main.querySelector(`[data-id="${CSS.escape(id)}"]`); } catch { row = null; }
      if (!row) return;
      const label = m.revokedAt ? '👁 Ver mensagem apagada' : '✏️ Ver original';
      const old = row.querySelector('.tsp-del-badge');
      if (old) { if (old.textContent !== label) old.textContent = label; return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tsp-del-badge';
      b.dataset.id = id;
      b.textContent = label;
      b.title = 'Cópia guardada só neste computador';
      b.style.cssText = 'display:inline-block;margin:2px 8px 4px;padding:2px 10px;border:1px solid #b9c3c9;border-radius:12px;background:#fff;color:#111b21;font:600 12px/1.6 Segoe UI,Helvetica,Arial,sans-serif;cursor:pointer;position:relative;z-index:1';
      b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openDeletedView(id); });
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      row.append(b);
    });
  }
  async function clearDeletedCopies(btn) {
    if (btn) btn.disabled = true;
    try {
      await waRequest('deletedClear', {}, { timeout: 15000 });
      dl.items = [];
      renderDeleted();
      decorateDeleted();
      toast('Cópias das mensagens apagadas: tudo apagado deste computador.', 'ok', 4000);
    } catch {
      toast('Não consegui apagar agora: espere o WhatsApp carregar e tente de novo.', 'error', 6000);
    } finally { if (btn) btn.disabled = false; }
  }
  // Janela com o conteúdo original (fora do painel: funciona com o painel fechado)
  function closeDeletedView() {
    const v = dl.view;
    dl.view = null;
    if (!v) return;
    v.urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ok */ } });
    v.host.remove();
  }
  async function openDeletedView(id) {
    closeDeletedView();
    let r = null;
    try { r = await waRequest('deletedGet', { id }, { timeout: 15000 }); } catch { r = null; }
    if (!r) { toast('Não achei a cópia dessa mensagem (mais de 7 dias ou apagada).', 'warn', 5000); return; }
    const host = document.createElement('div');
    host.id = 'tsp-del-view';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    const sh = host.attachShadow({ mode: 'open' });
    const v = { host, urls: [] };
    dl.view = v;
    const st = document.createElement('style');
    st.textContent = `.bg{position:fixed;inset:0;background:rgba(11,20,26,.55);display:flex;align-items:center;justify-content:center;padding:16px;font:14px/1.45 Segoe UI,Helvetica,Arial,sans-serif;color:#111b21}
      .box{background:#fff;border-radius:12px;max-width:min(520px,100%);max-height:90vh;overflow:auto;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:10px}
      .h{display:flex;justify-content:space-between;gap:12px;align-items:center;font-weight:700}
      .x{border:0;background:#f0f2f5;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer}
      .lbl{font-size:12px;font-weight:700;color:#667781;text-transform:uppercase}
      .txt{white-space:pre-wrap;word-break:break-word;background:#f0f2f5;border-radius:8px;padding:8px 10px}
      .ed{white-space:pre-wrap;word-break:break-word;border-left:3px solid #d9fdd3;padding:4px 8px}
      img,video{max-width:100%;max-height:60vh;border-radius:8px;display:block}
      audio{width:100%}.note{font-size:12px;color:#667781}a{color:#027eb5}`;
    const bg = document.createElement('div');
    bg.className = 'bg';
    const box = document.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', r.revokedAt ? 'Mensagem apagada' : 'Mensagem original');
    const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const h = mk('div', 'h');
    const when = r.t ? new Date(r.t * 1000) : null;
    h.append(mk('span', null, `${r.revokedAt ? '👁 Mensagem apagada pelo cliente' : '✏️ Mensagem editada pelo cliente'}${when ? ` · ${schedWhen(when.toISOString())}` : ''}`));
    const x = mk('button', 'x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fechar');
    x.addEventListener('click', closeDeletedView);
    h.append(x);
    box.append(h, mk('div', 'lbl', r.edits && r.edits.length ? 'Original' : 'Conteúdo'));
    const url = r.media instanceof ArrayBuffer && r.media.byteLength ? URL.createObjectURL(new Blob([r.media], { type: r.mime || 'application/octet-stream' })) : null;
    if (url) v.urls.push(url);
    const thumb = typeof r.thumb === 'string' && /^data:image\/jpeg;base64,/.test(r.thumb) ? r.thumb : null;
    const img = (src) => { const i = mk('img'); i.src = src; i.alt = 'imagem original'; return i; };
    if (r.kind === 'imagem' || r.kind === 'figurinha') { if (url || thumb) box.append(img(url || thumb)); }
    else if (r.kind === 'video') { if (url) { const vd = mk('video'); vd.controls = true; vd.src = url; box.append(vd); } else if (thumb) box.append(img(thumb)); }
    else if (r.kind === 'audio') { if (url) { const a = mk('audio'); a.controls = true; a.src = url; box.append(a); } }
    else if (r.kind === 'documento') {
      if (url) { const a = mk('a', null, `⬇ ${r.filename || 'documento'}`); a.href = url; a.download = r.filename || 'documento'; box.append(a); } else if (thumb) box.append(img(thumb));
      if (!url) box.append(mk('div', 'txt', `📄 ${r.filename || 'documento'}`));
    }
    const text = r.body || r.caption || '';
    if (text) box.append(mk('div', 'txt', text));
    if (['imagem', 'video', 'audio', 'documento', 'figurinha'].includes(r.kind) && !url) box.append(mk('div', 'note', 'O arquivo não foi guardado (acima de 5 MB ou não deu para baixar)' + (thumb ? '; esta é a miniatura.' : '.')));
    if (r.edits && r.edits.length) {
      box.append(mk('div', 'lbl', r.edits.length > 1 ? 'Editada para (em ordem)' : 'Editada para'));
      r.edits.forEach((e) => box.append(mk('div', 'ed', `${e.body || '(vazio)'}${e.at ? `  · ${schedWhen(new Date(e.at).toISOString())}` : ''}`)));
    }
    box.append(mk('div', 'note', 'Cópia guardada só neste computador por 7 dias.'));
    bg.append(box);
    bg.addEventListener('click', (e) => { if (e.target === bg) closeDeletedView(); });
    host.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeDeletedView(); } });
    sh.append(st, bg);
    document.body.append(host);
    x.focus();
  }

  // ══ 2.13.0: CONSTRUTOR VISUAL de automações (em cascata) ══════════════════════════════════════════
  // Tela ampla por cima do WhatsApp Web (fundo claro): COMEÇA → caixas ligadas por linhas, de cima para baixo; "+"
  // entre duas caixas insere outra; clicar numa caixa abre a edição no quadro da direita. Usa o motor das
  // sequências (2.12.0: o mesmo jsonb, só daqui pra frente, limites, horário, Não enviar, até 5 níveis).
  // Automações antigas que dá para desenhar abrem aqui (E.seqFromAutomation); as outras ficam no editor antigo.
  const VB_TYPES = {
    enviar: { icon: '✉', title: 'ENVIAR MENSAGEM' }, pausa: { icon: '⏳', title: 'ESPERAR' }, esperar: { icon: '❓', title: 'ESPERAR RESPOSTA' },
    etiqueta: { icon: '🏷', title: 'ETIQUETA' }, fim: { icon: '⏹', title: 'FIM' }, ir: { icon: '↪', title: 'CONTINUAR EM' },
  };
  const VB_TEMPLATES = [
    ['followup3', 'Régua de follow-up (3 etapas)', 'Entra na etiqueta Follow Up 1 → Follow 1 → espera resposta até o dia 1 desde a entrada → ✅ Em atendimento / ❌ Follow 2 → até o dia 3 → ❌ Follow 3 → até o dia 6 → ❌ Frio.'],
    ['posvenda', 'Pós-venda', 'Venda registrada (💰) → espera até o dia 7 desde a entrada → envia o pedido de avaliação → fim.'],
    ['lead_sumiu', 'Lead novo que sumiu', 'Lead novo chamou, você respondeu e ele sumiu por 1 dia → envia "ainda tem interesse?" → até o dia 3 desde a entrada → ✅ Em atendimento / ❌ Frio.'],
    ['vazio', 'Em branco', 'Só o COMEÇA e o FIM: monte do seu jeito com o "+".'],
  ];
  const VB_TPL_NAME = { followup3: 'Régua de follow-up', posvenda: 'Pós-venda', lead_sumiu: 'Lead novo que sumiu', vazio: 'Nova automação' };
  const vb = { el: null, f: null };
  const vbLabelName = (id, src = 'crm') => (src === 'whatsapp' ? waLabelName(id) : String(id || '').startsWith(NEW_LABEL) ? String(id).slice(NEW_LABEL.length) : labelName(id));
  const vbIsNoSend = (name) => E.foldName ? E.foldName(name) === 'nao enviar' : String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === 'nao enviar';
  const vbItemByTitle = (t) => state.items.find((i) => String(i.title || '').trim().toLowerCase() === String(t || '').trim().toLowerCase());
  // modelo: etiquetas que já existem pelo nome; mensagens com o mesmo título da sugestão já ficam escolhidas
  function vbFillTemplate(def) {
    const fix = (o, k) => { if (String(o[k] || '').startsWith(NEW_LABEL)) { const id = labelIdByName(String(o[k]).slice(NEW_LABEL.length)); if (id) o[k] = id; } };
    if (def.start) fix(def.start, 'label_id');
    E.seqIndex(def).forEach(({ node: n }) => {
      if (n.type === 'etiqueta' && n.source !== 'whatsapp') fix(n, 'label_id');
      if (n.type === 'enviar' && !n.item_id && n.hint) { const it = vbItemByTitle(n.hint); if (it) n.item_id = it.id; }
    });
    return def;
  }
  function vbOpen(a = null, { template = null, legacyReason = null } = {}) {
    let def = null;
    let converted = false;
    if (a) {
      const r = E.seqFromAutomation(a);
      if (!r.def) { openAutomationEditor(a); if (fl.edit) fl.edit.legacyNote = `Editor antigo: ${r.reason}.`; renderFollows(); return; }
      def = r.def;
      converted = a.kind !== 'sequencia';
    } else if (template) def = vbFillTemplate(E.seqTemplate(template));
    vb.f = {
      mode: def ? 'edit' : 'templates', id: a ? a.id : null, name: a ? a.name : template ? VB_TPL_NAME[template] : '', def, converted, legacyReason,
      wasActive: !!(a && a.id && a.active), testOn: !!(a && a.test_chat_id), test_chat_id: (a && a.test_chat_id) || '', include: !!(a && a.include_existing),
      sel: def ? 'start' : null, zoom: 1, insert: null, triedSave: false, invalid: [], msg: '', err: false, existing: null, existingKey: '', modal: null, dirty: false, saving: false,
    };
    if (a && !a.active && def && vbProblems(vb.f).length) vb.f.showErrors = true; // 2.16.3: rascunho continua em vermelho
    if (!Array.isArray(state.waLabels)) refreshBar().then(() => { if (vb.f) vbRender(); }).catch(() => {});
    vbRender();
  }
  function vbClose(force = false) {
    const f = vb.f;
    if (f && f.dirty && !force) { f.modal = { kind: 'close' }; vbRender(); return; }
    vb.f = null;
    if (vb.el) { vb.el.remove(); vb.el = null; }
    renderFollows();
  }
  function vbProblems(f) {
    const def = E.seqNormalize(f.def);
    const out = E.seqValidate(def);
    E.seqIndex(f.def).forEach(({ node: n }) => {
      if (n.type === 'etiqueta' && n.op === 'tirar' && (n.source === 'whatsapp' ? vbIsNoSend(waLabelName(n.wa_label_id)) : n.label_id && n.label_id === motor.state.noSendLabelId)) out.push({ node: n.id, msg: '"Não enviar" nunca sai.' });
    });
    if (!String(f.name || '').trim()) out.unshift({ node: 'name', msg: 'Dê um nome para a automação.' });
    return out;
  }
  const vbBad = (f, id) => (f.triedSave || f.showErrors ? (f.invalid || []).filter((x) => x.node === id).map((x) => x.msg) : []);
  // 2.16.3: "Follow 3: escolha ou crie a mensagem" — nome da caixa (a sugestão do modelo, "Mensagem 2"…) + o que falta
  function vbMissing(f, probs) {
    const def = f.def || {};
    const list = probs || vbProblems(f);
    const sends = [...E.seqIndex(def).values()].filter((e) => e.node.type === 'enviar').map((e) => e.node.id);
    const titleOf = (id) => {
      if (id === 'name') return 'Nome';
      if (id === 'start') return 'COMEÇA';
      const e = E.seqIndex(def).get(id);
      if (!e) return 'Caixa';
      const n = e.node;
      if (n.type === 'enviar') return n.hint || (n.item_id ? itemTitle(n.item_id) : `Mensagem ${sends.indexOf(n.id) + 1}`);
      return (VB_TYPES[n.type] || { title: n.type }).title;
    };
    const low = (t) => String(t).charAt(0).toLowerCase() + String(t).slice(1).replace(/\.$/, '');
    return list.map((x) => `${titleOf(x.node)}: ${low(x.msg)}`);
  }  function vbStartText(st) {
    if (!st || !st.type) return 'Escolha quando começa';
    return `Começa ${seqStartText(st)}`;
  }
  function vbSentence(n) {
    if (n.type === 'enviar') return n.item_id ? `Envia “${itemTitle(n.item_id)}”` : n.hint ? `Escolha a mensagem (sugestão: ${n.hint})` : 'Escolha a mensagem';
    // 2.13.2: "· envia só entre 14:00 e 18:00" quando a etapa tem faixa
    const wtxt = n.send_window ? ` · ${E.windowText(n.send_window)}` : '';
    // 2.16.0: "Espera até 3 dias depois de entrar · dia 3 desde a entrada"
    if (E.seqFromEntry(n)) return `${n.type === 'pausa' ? 'Espera' : 'Espera resposta'} até ${unitWord(n.amount, n.unit)} depois de entrar · ${E.sinceEntryText(n)}${wtxt}`;
    if (n.type === 'pausa') return `Espera ${E.seqNodeLabel({ steps: [n] }, n.id).replace(/^Esperando /, '')}${wtxt}`;
    if (n.type === 'esperar') return `Espera resposta por até ${E.seqNodeLabel({ steps: [n] }, n.id).replace(/^Esperando resposta \((.*)\)$/, '$1')}${n.after_mine ? ', contando da SUA última mensagem' : ''}${wtxt}`;
    if (n.type === 'etiqueta') {
      const id = n.source === 'whatsapp' ? n.wa_label_id : n.label_id;
      if (!id) return 'Escolha a etiqueta';
      return `${n.op === 'tirar' ? 'Tira' : 'Coloca'} a etiqueta “${vbLabelName(id, n.source)}”${n.source === 'whatsapp' ? ' (WhatsApp)' : ''}${n.op !== 'tirar' && n.remove_others ? ' e tira todas as outras' : ''}`;
    }
    if (n.type === 'ir') return `Continua em: ${seqNodeTitle(vb.f.def, n.to)}`;
    return 'Termina a automação para essa pessoa';
  }
  const unitWord = (amount, unit) => { const k = Number(amount) || 0; return `${k} ${unit === 'minutos' ? (k === 1 ? 'minuto' : 'minutos') : unit === 'horas' ? (k === 1 ? 'hora' : 'horas') : k === 1 ? 'dia' : 'dias'}`; };
  function vbNew(type) {
    const id = E.seqId();
    if (type === 'enviar') return { id, type, item_id: '' };
    // 2.16.2: caixa nova conta desde a ENTRADA (as já salvas, sem from, continuam "depois da etapa anterior")
    if (type === 'pausa') return { id, type, amount: 1, unit: 'dias', from: 'entrada' };
    if (type === 'esperar') return { id, type, amount: 1, unit: 'dias', from: 'entrada', yes: [], no: [] };
    if (type === 'etiqueta') return { id, type, op: 'colocar', source: 'crm', label_id: '' };
    return { id, type: 'fim' };
  }
  const vbChange = () => { if (vb.f) { vb.f.dirty = true; if (vb.f.triedSave || vb.f.showErrors) vb.f.invalid = vbProblems(vb.f); } };

  function vbRender() {
    const f = vb.f;
    if (!f) return;
    const root = shadow.querySelector('.root');
    if (!vb.el) {
      vb.el = el('div', 'vb');
      vb.el.setAttribute('role', 'dialog');
      vb.el.setAttribute('aria-modal', 'true');
      vb.el.setAttribute('aria-label', 'Construtor de automação');
      // Esc: fecha o quadro aberto (menu do "+", simulação…) ou a tela; as teclas não vão para o WhatsApp
      vb.el.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key !== 'Escape' || !vb.f) return;
        if (vb.f.modal && vb.f.modal.kind !== 'close') vb.f.modal = null; else if (vb.f.insert) vb.f.insert = null; else { vbClose(); return; }
        vbRender();
      });
      root.append(vb.el);
    }
    const canvas = vb.el.querySelector('.vb-canvas');
    const keep = canvas ? { top: canvas.scrollTop, left: canvas.scrollLeft } : null;
    vb.el.textContent = '';
    if (f.triedSave || f.showErrors) f.invalid = vbProblems(f);
    vb.el.append(vbTop(f));
    if (f.mode === 'templates') { vb.el.append(vbTemplatesEl(f)); return; }
    const body = el('div', 'vb-body');
    const cv = el('div', 'vb-canvas');
    const zoom = el('div', 'vb-zoom');
    const zb = (t, aria, fn) => { const b = fbtn('vb-zbtn', t, fn); b.setAttribute('aria-label', aria); return b; };
    zoom.append(zb('−', 'Diminuir', () => { f.zoom = Math.max(0.4, Math.round((f.zoom - 0.1) * 10) / 10); vbRender(); }), el('span', 'vb-zval', `${Math.round(f.zoom * 100)}%`),
      zb('+', 'Aumentar', () => { f.zoom = Math.min(1.6, Math.round((f.zoom + 0.1) * 10) / 10); vbRender(); }), zb('↺', 'Tamanho normal (100%)', () => { f.zoom = 1; vbRender(); }));
    const inner = el('div', 'vb-inner');
    inner.style.zoom = String(f.zoom);
    if (f.converted) inner.append(el('div', 'vb-note', 'Esta automação foi feita no editor antigo e foi desenhada aqui. Ao salvar, ela passa a rodar como régua do construtor visual (vale daqui pra frente a partir de quando for ligada).'));
    inner.append(vbStartBox(f), vbFlow(f, f.def.steps, 1));
    cv.append(inner);
    body.append(cv, zoom, vbSide(f));
    vb.el.append(body);
    if (f.modal) vb.el.append(vbModal(f));
    if (keep) { cv.scrollTop = keep.top; cv.scrollLeft = keep.left; }
  }
  function vbTop(f) {
    const top = el('div', 'vb-top');
    const name = el('input', 'vb-name');
    name.maxLength = 60;
    name.value = f.name;
    name.placeholder = 'Nome da automação';
    name.setAttribute('aria-label', 'Nome da automação');
    name.addEventListener('input', () => { f.name = name.value; f.dirty = true; });
    if (vbBad(f, 'name').length) name.classList.add('vb-bad');
    const left = el('div', 'vb-tl');
    left.append(el('span', 'vb-brand', '🔁 Automação'), name);
    if (f.testOn && f.wasActive) left.append(el('span', 'fw-badge test', 'EM TESTE'));
    else if (f.wasActive) left.append(el('span', 'fw-badge on', 'LIGADA'));
    const right = el('div', 'vb-tr');
    const b = (cls, text, fn) => { const x = fbtn(cls, text, fn); x.disabled = !!f.saving; return x; };
    if (f.mode === 'edit') {
      if (f.wasActive) {
        right.append(b('bbtn primary vb-save', f.saving ? 'Salvando…' : 'Salvar', () => vbSave('keep')), b('bbtn vb-save-disable', 'Salvar e desligar', () => vbSave('off')));
        if (f.testOn) right.append(b('bbtn vb-all', 'Ligar para todos', () => vbAskOn('todos')));
      } else {
        right.append(b('bbtn vb-save-off', f.saving ? 'Salvando…' : 'Salvar desligada', () => vbSave('off')), b('bbtn primary vb-save-on', 'Salvar e ligar', () => vbAskOn('on')));
      }
    }
    right.append(fbtn('bbtn vb-close', 'Fechar', () => vbClose()));
    // 2.14.1: Simular e Testar comigo ficam no "⋯" (funcionam igual)
    if (f.mode === 'edit') {
      right.append(moreMenu([
        { cls: 'vb-sim', text: 'Simular', fn: () => { f.modal = { kind: 'sim' }; vbRender(); }, disabled: !!f.saving },
        !f.wasActive && { cls: 'vb-test', text: 'Testar comigo', fn: () => vbAskTest(), disabled: !!f.saving },
      ], 'Mais opções da automação'));
    }
    top.append(left, right);
    const wrap = el('div', 'vb-topwrap');
    wrap.append(top);
    if (f.msg) {
      const m = el('div', `vb-msg${f.err ? ' err' : ''}`, f.msg);
      if (f.err && f.missing && f.missing.length) { const ul = el('ul', 'vb-missing'); f.missing.forEach((t) => ul.append(el('li', null, t))); m.append(ul); }
      wrap.append(m);
    }
    return wrap;
  }
  function vbTemplatesEl(f) {
    const box = el('div', 'vb-tpls');
    box.append(el('h2', 'vb-h', 'Nova automação'), el('div', 'vb-sub', 'Escolha um modelo já desenhado (depois é só trocar as mensagens) ou comece em branco.'));
    const grid = el('div', 'vb-tgrid');
    VB_TEMPLATES.forEach(([key, title, help]) => {
      const c = el('button', 'vb-tpl');
      c.type = 'button';
      c.dataset.tpl = key;
      c.append(el('div', 'vb-tname', title), el('div', 'vb-thelp', help));
      if (motor.state.sequencesAvailable !== true) { c.disabled = true; c.append(el('div', 'vb-thelp vb-red', 'Atualize o banco (migration 20261106210000).')); }
      c.addEventListener('click', () => { const ff = vb.f; ff.def = vbFillTemplate(E.seqTemplate(key)); ff.name = VB_TPL_NAME[key]; ff.mode = 'edit'; ff.sel = 'start'; ff.dirty = true; vbRender(); });
      grid.append(c);
    });
    box.append(grid);
    const legacy = fbtn('ed-mini vb-legacy', 'Mais modelos (editor antigo)', () => { vbClose(true); fl.view = 'templates'; renderFollows(); });
    box.append(legacy);
    return box;
  }
  // 2.16.2: aviso amarelo (sempre visível, não impede salvar): espera "desde a entrada" que não passa da anterior
  const vbOrderWarn = (f, id) => E.seqEntryOrderWarnings(f && f.def).filter((w) => w.node === id).map((w) => w.msg);
  // caixa (cartão) do desenho
  function vbCard(f, { id, kind, title, icon, text, extra = [], sel }) {
    const c = el('div', `vb-box vb-${kind}${sel ? ' vb-sel' : ''}`);
    c.dataset.node = id;
    c.setAttribute('role', 'button');
    c.tabIndex = 0;
    const head = el('div', 'vb-bh');
    head.append(el('span', 'vb-bi', icon), el('span', 'vb-bt', title));
    c.append(head, el('div', 'vb-btxt', text));
    extra.forEach((x) => c.append(el('div', 'vb-bx', x)));
    const bad = vbBad(f, id);
    if (bad.length) { c.classList.add('vb-bad'); c.append(el('div', 'vb-berr', bad.join(' '))); }
    vbOrderWarn(f, id).forEach((m) => c.append(el('div', 'vb-warn vb-order-warn', m)));
    const pick = () => { f.sel = id; f.insert = null; vbRender(); };
    c.addEventListener('click', pick);
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    return c;
  }
  function vbStartBox(f) {
    const st = f.def.start || {};
    const ex = (st.exclude || []).map((x) => vbLabelName(x.source === 'whatsapp' ? x.wa_label_id : x.label_id, x.source));
    return vbCard(f, {
      id: 'start', kind: 'start', icon: '▶', title: 'COMEÇA', text: vbStartText(st), sel: f.sel === 'start',
      extra: [st.type === 'etiqueta' && f.include ? 'Quem entra: também quem já está na etiqueta' : 'Quem entra: só quem se encaixar daqui pra frente',
        E.scheduleSentence(f.def, motor.state.settings), // 2.13.2
        'Esperas em tempo corrido', `Nunca para quem tem: Não enviar${ex.length ? `, ${ex.join(', ')}` : ''}`],
    });
  }
  function vbConn(f, list, i, { last = false } = {}) {
    const c = el('div', 'vb-conn');
    c.append(el('span', 'vb-wire'));
    const plus = fbtn('vb-plus', '+', (e) => { e.stopPropagation(); f.insert = { list, i, last }; f.sel = null; vbRender(); });
    plus.setAttribute('aria-label', 'Inserir uma caixa aqui');
    const open = f.insert && f.insert.list === list && f.insert.i === i;
    if (open) plus.classList.add('on');
    c.append(plus);
    if (open) {
      const menu = el('div', 'vb-menu');
      menu.setAttribute('role', 'menu');
      const depth = vbDepthOf(f, list);
      [['enviar', '✉ Enviar mensagem'], ['pausa', '⏳ Esperar'], ['esperar', '❓ Esperar resposta'], ['etiqueta', '🏷 Etiqueta'], ...(last ? [['fim', '⏹ Fim']] : [])].forEach(([t, txt]) => {
        const m = fbtn(`vb-mi vb-mi-${t}`, txt, (e) => {
          e.stopPropagation();
          const node = E.seqInsert(list, i, vbNew(t));
          f.insert = null;
          f.sel = node.id;
          vbChange();
          vbRender();
        });
        m.setAttribute('role', 'menuitem');
        if (t === 'esperar' && depth >= E.SEQ_MAX_DEPTH) { m.disabled = true; m.title = `No máximo ${E.SEQ_MAX_DEPTH} "esperar resposta" um dentro do outro`; }
        menu.append(m);
      });
      menu.append(fbtn('vb-mi vb-mi-x', 'Cancelar', (e) => { e.stopPropagation(); f.insert = null; vbRender(); }));
      c.append(menu);
    }
    c.append(el('span', 'vb-wire vb-arrow'));
    return c;
  }
  // em que nível (quantos "esperar resposta" por cima) está a lista
  function vbDepthOf(f, list) {
    if (list === f.def.steps) return 0;
    let d = 0;
    E.seqIndex(f.def).forEach((e) => { if (e.node.type === 'esperar' && (e.node.yes === list || e.node.no === list)) d = e.depth; });
    return d;
  }
  function vbFlow(f, list, depth) {
    const col = el('div', 'vb-col');
    list.forEach((n, i) => {
      col.append(vbConn(f, list, i));
      const t = VB_TYPES[n.type] || { icon: '•', title: n.type };
      col.append(vbCard(f, { id: n.id, kind: n.type, icon: t.icon, title: t.title, text: vbSentence(n), sel: f.sel === n.id }));
      if (n.type === 'esperar') {
        const split = el('div', 'vb-split');
        const lane = (cls, label, sub) => { const l = el('div', `vb-lane ${cls}`); l.append(el('div', 'vb-lh', label), vbFlow(f, sub, depth + 1)); return l; };
        split.append(lane('vb-yes', '✅ Se responder', n.yes), lane('vb-no', '❌ Se não responder', n.no));
        col.append(split);
      }
    });
    const last = list[list.length - 1];
    if (!last || !['fim', 'ir', 'esperar'].includes(last.type)) {
      col.append(vbConn(f, list, list.length, { last: true }));
      // todo caminho termina em FIM (posto sozinho ao salvar)
      const fim = el('div', 'vb-box vb-fim vb-auto');
      fim.append(el('div', 'vb-bh', '⏹ FIM'), el('div', 'vb-btxt', 'Termina aqui (automático)'));
      col.append(fim);
    }
    return col;
  }

  // ── quadro da direita: edição da caixa escolhida ──
  function vbSide(f) {
    const side = el('aside', 'vb-side');
    if (f.sel === 'start') { vbSideStart(f, side); return side; }
    const e = f.sel ? E.seqIndex(f.def).get(f.sel) : null;
    if (!e) {
      side.append(el('div', 'vb-sh', 'Como montar'), el('div', 'vb-sub', 'Clique numa caixa para editar. Use o "+" entre duas caixas para inserir uma nova ali.'),
        el('div', 'vb-sub', '❓ Esperar resposta abre dois caminhos: ✅ Se responder e ❌ Se não responder. Cada caminho termina em FIM.'));
      const probs = f.invalid || [];
      if ((f.triedSave || f.showErrors) && probs.length) side.append(el('div', 'vb-sub vb-red', `${probs.length} caixa${probs.length === 1 ? '' : 's'} em vermelho para completar.`));
      return side;
    }
    const n = e.node;
    const t = VB_TYPES[n.type] || { icon: '', title: n.type };
    side.append(el('div', 'vb-sh', `${t.icon} ${t.title}`));
    const bad = vbBad(f, n.id);
    if (bad.length) side.append(el('div', 'vb-sub vb-red', bad.join(' ')));
    vbOrderWarn(f, n.id).forEach((m) => side.append(el('div', 'vb-warn vb-order-warn vb-side-warn', m)));
    if (n.type === 'enviar') vbSideSend(f, n, side);
    else if (n.type === 'pausa' || n.type === 'esperar') {
      side.append(el('div', 'vb-sub', n.type === 'pausa' ? 'Espera e segue para a próxima caixa (responda ou não).' : 'Espera até esse tempo. Se o cliente mandar qualquer mensagem, segue por ✅; se não, por ❌.'));
      // 2.13.2: ⏳ "esperar X tempo" ou "esperar até o próximo [dia] às HH:MM"
      if (n.type === 'pausa') {
        const modes = el('div', 'vb-radios vb-pmode');
        [['tempo', 'Esperar um tempo'], ['ate', 'Esperar até o próximo dia e hora']].forEach(([v, txt]) => {
          const l = el('label', 'sc-radio');
          const r0 = el('input');
          r0.type = 'radio';
          r0.name = `vb-pm-${n.id}`;
          r0.value = v;
          r0.checked = (n.mode || 'tempo') === v;
          r0.addEventListener('change', () => {
            if (v === 'ate') { n.mode = 'ate'; n.until_day = n.until_day ?? 'qualquer'; n.until_time = n.until_time || '10:00'; } else { delete n.mode; delete n.until_day; delete n.until_time; n.amount = n.amount || 1; n.unit = n.unit || 'dias'; }
            vbChange(); vbRender();
          });
          l.append(r0, ` ${txt}`);
          modes.append(l);
        });
        side.append(modes);
      }
      if (n.type === 'pausa' && n.mode === 'ate') {
        const r = el('div', 'sc-row');
        const day = el('select', 'ed-cat');
        day.setAttribute('aria-label', 'Dia da semana');
        [['qualquer', 'próximo dia'], ...['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'].map((d, i) => [String(i), `próximo(a) ${d}`])].forEach(([v, t]) => {
          const o = el('option', null, t); o.value = v; o.selected = String(n.until_day ?? 'qualquer') === v; day.append(o);
        });
        day.addEventListener('change', () => { n.until_day = day.value === 'qualquer' ? 'qualquer' : Number(day.value); vbChange(); vbRender(); });
        const tm = el('input', 'ed-title vb-time');
        tm.type = 'time';
        tm.value = n.until_time || '';
        tm.setAttribute('aria-label', 'Hora');
        tm.addEventListener('change', () => { n.until_time = tm.value; vbChange(); vbRender(); });
        r.append(el('span', null, 'até o'), day, el('span', null, 'às'), tm);
        side.append(r);
      } else {
        const r = el('div', 'sc-row');
        const amount = numberInput(n.amount, 1, 8760, n.type === 'pausa' ? 'Quanto tempo esperar' : 'Esperar resposta por até');
        amount.addEventListener('input', () => { n.amount = Math.floor(Number(amount.value) || 0); vbChange(); vbRefreshBox(f, n); });
        const unit = el('select', 'ed-cat');
        unit.setAttribute('aria-label', 'Unidade');
        ['minutos', 'horas', 'dias'].forEach((u) => { const o = el('option', null, u); o.value = u; o.selected = n.unit === u; unit.append(o); });
        unit.addEventListener('change', () => { n.unit = unit.value; vbChange(); vbRender(); });
        r.append(amount, unit);
        side.append(r);
        // 2.16.0: contar depois da etapa anterior (como sempre) ou desde que a pessoa ENTROU na automação
        const from = el('div', 'vb-radios vb-from');
        [['anterior', n.type === 'pausa' ? 'depois da etapa anterior' : 'a partir desta etapa'], ['entrada', 'depois que a pessoa ENTROU na automação']].forEach(([v, txt]) => {
          const l = el('label', 'sc-radio');
          const r0 = el('input');
          r0.type = 'radio';
          r0.name = `vb-from-${n.id}`;
          r0.value = v;
          r0.checked = (n.from === 'entrada' ? 'entrada' : 'anterior') === v;
          r0.addEventListener('change', () => { if (v === 'entrada') { n.from = 'entrada'; delete n.after_mine; } else delete n.from; vbChange(); vbRender(); });
          l.append(r0, ` ${txt}`);
          from.append(l);
        });
        side.append(el('div', 'vb-fl', 'Contar o tempo'), from);
        if (n.from === 'entrada') side.append(el('div', 'vb-sub vb-from-help', `Até ${unitWord(n.amount, n.unit)} depois que a pessoa entrou (${E.sinceEntryText(n)}). Se esse momento já passou (ex.: entrou no meio da régua), segue na hora; se cair fora do horário de envio, espera o próximo horário permitido.`));
      }
      // 2.13.2: "Depois da espera, enviar só entre HH:MM e HH:MM" (fora da faixa: espera a próxima)
      const wl = el('label', 'sc-radio');
      const wcb = el('input');
      wcb.type = 'checkbox';
      wcb.className = 'vb-win-on';
      wcb.checked = !!n.send_window;
      wcb.addEventListener('change', () => { if (wcb.checked) n.send_window = { start: '09:00', end: '18:00' }; else delete n.send_window; vbChange(); vbRender(); });
      wl.append(wcb, n.type === 'pausa' ? ' Depois da espera, enviar só entre…' : ' O envio seguinte (✅ ou ❌) só entre…');
      side.append(wl);
      if (n.send_window) {
        const r = el('div', 'sc-row vb-win');
        const t1 = el('input', 'ed-title vb-time');
        t1.type = 'time';
        t1.value = n.send_window.start;
        t1.setAttribute('aria-label', 'Enviar a partir de');
        t1.addEventListener('change', () => { n.send_window.start = t1.value; vbChange(); vbRender(); });
        const t2 = el('input', 'ed-title vb-time');
        t2.type = 'time';
        t2.value = n.send_window.end;
        t2.setAttribute('aria-label', 'Enviar até');
        t2.addEventListener('change', () => { n.send_window.end = t2.value; vbChange(); vbRender(); });
        r.append(t1, el('span', null, 'e'), t2);
        side.append(r, el('div', 'vb-sub', 'Se cair fora dessa faixa, espera a próxima (e o horário da automação também vale).'));
        if (E.scheduleOutsideCommon({ steps: [n] })) side.append(el('div', 'vb-warn', '⚠ Mensagem fora do horário comum (08:00–21:00) pode incomodar.'));
      }
      if (n.type === 'esperar' && n.from !== 'entrada') {
        const l = el('label', 'sc-radio');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!n.after_mine;
        cb.addEventListener('change', () => { n.after_mine = cb.checked; vbChange(); vbRender(); });
        l.append(cb, ' Contar a partir da MINHA última mensagem (espera você responder antes)');
        side.append(l);
      }
    } else if (n.type === 'etiqueta') {
      const ops = el('div', 'vb-radios');
      [['colocar', 'Colocar'], ['tirar', 'Tirar']].forEach(([v, txt]) => {
        const l = el('label', 'sc-radio');
        const r = el('input');
        r.type = 'radio';
        r.name = `vb-op-${n.id}`;
        r.checked = (n.op || 'colocar') === v;
        r.addEventListener('change', () => { n.op = v; if (v === 'tirar') delete n.remove_others; vbChange(); vbRender(); });
        l.append(r, ` ${txt}`);
        ops.append(l);
      });
      side.append(ops, vbLabelField(n, 'Etiqueta', () => { vbChange(); vbRender(); }));
      if (n.op !== 'tirar') {
        const l = el('label', 'sc-radio');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!n.remove_others;
        cb.addEventListener('change', () => { n.remove_others = cb.checked; vbChange(); vbRender(); });
        l.append(cb, ' Tirar de todas as outras (menos a que vou colocar)');
        side.append(l);
      }
      side.append(el('div', 'vb-sub', '"Não enviar" nunca sai.'));
    } else if (n.type === 'fim') side.append(el('div', 'vb-sub', 'Termina a automação para essa pessoa.'));
    else if (n.type === 'ir') side.append(el('div', 'vb-sub', `Volta para: ${seqNodeTitle(f.def, n.to)}. (Feito no editor antigo.)`));
    if (n.type !== 'fim' || e.list.length > 1 || e.parent) {
      const del = fbtn('bbtn vb-del', n.type === 'esperar' ? 'Excluir (com os dois caminhos)' : 'Excluir esta caixa', () => { E.seqRemove(f.def, n.id); f.sel = null; vbChange(); vbRender(); });
      side.append(del);
    }
    return side;
  }
  // só o texto da caixa (sem redesenhar tudo, para não perder o cursor do campo)
  function vbRefreshBox(f, n) {
    const box = vb.el && vb.el.querySelector(`.vb-box[data-node="${n.id}"] .vb-btxt`);
    if (box) box.textContent = vbSentence(n);
    // 2.16.2: o tempo mudou → os avisos "seguiria na hora" desta e das próximas caixas também
    if (!vb.el) return;
    vb.el.querySelectorAll('.vb-order-warn').forEach((x) => x.remove());
    const warns = E.seqEntryOrderWarnings(f.def);
    warns.forEach((w) => { const c = vb.el.querySelector(`.vb-box[data-node="${w.node}"]`); if (c) c.append(el('div', 'vb-warn vb-order-warn', w.msg)); });
    const sw = warns.filter((w) => w.node === n.id);
    const head = vb.el.querySelector('.vb-side .vb-sh');
    if (head && f.sel === n.id) sw.slice().reverse().forEach((w) => { const x = el('div', 'vb-warn vb-order-warn vb-side-warn', w.msg); const red = head.nextElementSibling && head.nextElementSibling.classList.contains('vb-red') ? head.nextElementSibling : head; red.after(x); });
  }
  // etiqueta CRM ou do WhatsApp (a que entra, a da caixa ETIQUETA e as de "Nunca para quem tem")
  function vbLabelField(o, label, onDone, { idKey = 'label_id', waKey = 'wa_label_id' } = {}) {
    const box = el('div', 'vb-field');
    box.append(el('div', 'vb-fl', label));
    const row = el('div', 'sc-row');
    const src = el('select', 'ed-cat');
    src.setAttribute('aria-label', `${label}: tipo`);
    [['crm', 'CRM'], ['whatsapp', 'WhatsApp']].forEach(([v, t]) => { const op = el('option', null, t); op.value = v; op.selected = (o.source || 'crm') === v; src.append(op); });
    src.addEventListener('change', () => { o.source = src.value; o[idKey] = ''; o[waKey] = ''; if (o.source === 'crm') delete o[waKey]; else delete o[idKey]; onDone(); });
    row.append(src);
    if (o.source === 'whatsapp') {
      const ws = waLabelSelect(o[waKey] || '', label);
      ws.addEventListener('change', () => { o[waKey] = ws.value; onDone(); });
      row.append(ws);
    } else row.append(labelPicker(o[idKey] || '', (v) => { o[idKey] = v; }, { aria: label, rerender: onDone, onError: (m) => { vb.f.msg = m; vb.f.err = true; } }));
    box.append(row);
    return box;
  }
  function vbSideStart(f, side) {
    const st = f.def.start;
    side.append(el('div', 'vb-sh', '▶ COMEÇA'), el('div', 'vb-sub', 'Quando a pessoa…'));
    const bad = vbBad(f, 'start');
    if (bad.length) side.append(el('div', 'vb-sub vb-red', bad.join(' ')));
    const types = el('div', 'vb-radios');
    [['etiqueta', 'entrar numa etiqueta'], ['lead', 'chamar pela primeira vez (lead novo)'], ['venda', 'tiver uma venda registrada (💰)'], ['manual', 'for adicionada por mim (🔁 na conversa)']].forEach(([v, txt]) => {
      const l = el('label', 'sc-radio');
      const r = el('input');
      r.type = 'radio';
      r.name = 'vb-start';
      r.checked = st.type === v;
      r.addEventListener('change', () => {
        const exclude = st.exclude;
        f.def.start = { type: v, ...(v === 'lead' ? { origin: 'todos' } : v === 'etiqueta' ? { source: 'crm', label_id: '' } : {}), ...(exclude ? { exclude } : {}) };
        f.include = false;
        vbChange();
        vbRender();
      });
      l.append(r, ` ${txt}`);
      types.append(l);
    });
    side.append(types);
    if (st.type === 'etiqueta') side.append(vbLabelField(st, 'Etiqueta', () => { f.existing = null; vbChange(); vbRender(); }));
    if (st.type === 'lead') {
      const o = el('select', 'ed-cat');
      o.setAttribute('aria-label', 'Quais leads');
      [['todos', 'todos'], ['anuncio', 'só de anúncio'], ['organico', 'só orgânico']].forEach(([v, t]) => { const op = el('option', null, t); op.value = v; op.selected = (st.origin || 'todos') === v; o.append(op); });
      o.addEventListener('change', () => { st.origin = o.value; vbChange(); vbRender(); });
      side.append(schedField('Quais leads', o));
    }
    if (st.type === 'venda') side.append(schedField('Só quem estiver na etiqueta CRM (opcional)', labelPicker(st.label_id || '', (v) => { st.label_id = v; if (!v) delete st.label_id; }, { empty: '(qualquer cliente)', aria: 'Etiqueta (opcional)', rerender: () => { vbChange(); vbRender(); } })));
    if (st.type === 'manual') side.append(el('div', 'vb-sub', 'Entra quem você adicionar pela conversa: botão 🔁 → Adicionar à automação.'));
    // Quem entra
    const who = el('div', 'vb-field');
    who.append(el('div', 'vb-fl', 'Quem entra'));
    const canInclude = st.type === 'etiqueta' && !!(st.source === 'whatsapp' ? st.wa_label_id : st.label_id) && !String(st.label_id || '').startsWith(NEW_LABEL);
    [[false, 'só quem se encaixar daqui pra frente'], [true, 'também quem já está']].forEach(([v, txt]) => {
      const l = el('label', 'sc-radio');
      const r = el('input');
      r.type = 'radio';
      r.name = 'vb-who';
      r.checked = !!f.include === v;
      r.disabled = v && !canInclude;
      r.addEventListener('change', () => { f.include = v; vbChange(); vbRender(); if (v) vbLoadExisting(f); });
      l.append(r, ` ${txt}`);
      who.append(l);
    });
    if (!canInclude && st.type !== 'etiqueta') who.append(el('div', 'vb-sub', '"Também quem já está" só vale para quem entra por etiqueta.'));
    if (f.include && canInclude) {
      if (f.existing == null || f.existingKey !== vbStartKey(st)) { who.append(el('div', 'lt-none loading', 'Contando quem já está na etiqueta…')); queueMicrotask(() => vbLoadExisting(f)); } else {
        who.append(el('div', 'vb-sub', `${f.existing.length} já est${f.existing.length === 1 ? 'á' : 'ão'} na etiqueta e vão entrar${f.existing.length > 50 ? ' (mostrando 50)' : ''}:`));
        const ul = el('ul', 'act-list vb-exist');
        f.existing.slice(0, 50).forEach((c) => ul.append(el('li', null, [c.name, c.phone].filter(Boolean).join(' · ') || 'sem nome')));
        who.append(ul);
      }
    }
    side.append(who);
    // horário e exclusões
    side.append(vbScheduleField(f));
    side.append(el('div', 'vb-sub vb-corrido', 'Esperas em tempo corrido (5 dias = 5 dias de calendário; 2 horas = 2 horas). Se o envio cair fora do horário de envio, espera o próximo horário permitido.')); // 2.14.2
    const ex = el('div', 'vb-field');
    ex.append(el('div', 'vb-fl', 'Nunca para quem tem a etiqueta'));
    const chips = el('div', 'vb-chips');
    chips.append(el('span', 'vb-chip fixed', 'Não enviar (sempre)'));
    (st.exclude || []).forEach((x, i) => {
      const id = x.source === 'whatsapp' ? x.wa_label_id : x.label_id;
      if (!id) return;
      const c = el('span', 'vb-chip', `${vbLabelName(id, x.source)}${x.source === 'whatsapp' ? ' (WhatsApp)' : ''}`);
      const rm = fbtn('vb-chip-x', '✕', () => { st.exclude.splice(i, 1); if (!st.exclude.length) delete st.exclude; vbChange(); vbRender(); });
      rm.setAttribute('aria-label', `Tirar ${vbLabelName(id, x.source)}`);
      c.append(rm);
      chips.append(c);
    });
    ex.append(chips);
    const pend = (st.exclude || []).find((x) => !(x.source === 'whatsapp' ? x.wa_label_id : x.label_id));
    if (pend) ex.append(vbLabelField(pend, 'Outra etiqueta', () => { vbChange(); vbRender(); }));
    else ex.append(fbtn('ed-mini vb-ex-add', '+ outra etiqueta', () => { st.exclude = [...(st.exclude || []), { source: 'crm', label_id: '' }]; vbChange(); vbRender(); }));
    side.append(ex);
  }
  // 2.14.3: tabela da semana (Seg…Dom, um embaixo do outro): liga/desliga ("fechado"), início e fim, "+ faixa" para
  // mais de uma faixa no mesmo dia, "Copiar para os dias úteis" (segunda → terça a sexta) e o aviso amarelo por linha
  function weekTable(week, onChange, { prefix = '' } = {}) {
    const box = el('div', 'wk');
    const clone = () => week.map((ws) => (ws || []).map((x) => ({ ...x })));
    const head = el('div', 'wk-head');
    const copy = fbtn('ed-mini wk-copy', 'Copiar para os dias úteis', () => onChange(E.copyToWeekdays(clone())));
    copy.title = 'Copia a linha de segunda para terça, quarta, quinta e sexta';
    head.append(copy);
    box.append(head);
    E.WEEK_ORDER.forEach((d) => {
      const ws = week[d] || [];
      const name = E.DAY_CAP[d];
      const row = el('div', `wk-row${ws.length ? '' : ' wk-off'}`);
      row.dataset.day = String(d);
      const l = el('label', 'wk-day');
      const c = el('input');
      c.type = 'checkbox';
      c.checked = ws.length > 0;
      c.setAttribute('aria-label', `${prefix}${name}: aberto`);
      c.addEventListener('change', () => {
        const w = clone();
        // ligando: as faixas do dia aberto mais perto (ou 09:00–18:00)
        const near = E.WEEK_ORDER.map((x) => w[x]).find((x) => x && x.length);
        w[d] = c.checked ? (near ? near.map((x) => ({ ...x })) : [{ start: '09:00', end: '18:00' }]) : [];
        onChange(w);
      });
      l.append(c, ` ${name}`);
      row.append(l);
      const cells = el('div', 'wk-cells');
      if (!ws.length) cells.append(el('span', 'wk-closed', 'fechado'));
      ws.forEach((x, i) => {
        const r = el('div', 'wk-win');
        const t1 = el('input', 'ed-title vb-time');
        t1.type = 'time';
        t1.value = x.start;
        t1.setAttribute('aria-label', `${prefix}${name}, faixa ${i + 1}: início`);
        t1.addEventListener('change', () => { const w = clone(); w[d][i].start = t1.value; onChange(w); });
        const t2 = el('input', 'ed-title vb-time');
        t2.type = 'time';
        t2.value = x.end;
        t2.setAttribute('aria-label', `${prefix}${name}, faixa ${i + 1}: fim`);
        t2.addEventListener('change', () => { const w = clone(); w[d][i].end = t2.value; onChange(w); });
        r.append(t1, el('span', null, '–'), t2);
        if (ws.length > 1) { const xb = fbtn('ed-mini wk-del', '✕', () => { const w = clone(); w[d].splice(i, 1); onChange(w); }); xb.setAttribute('aria-label', `${prefix}${name}: tirar a faixa ${i + 1}`); r.append(xb); }
        cells.append(r);
      });
      if (ws.length && ws.length < 6) {
        const add = fbtn('ed-mini wk-add', '+ faixa', () => {
          const w = clone();
          const last = w[d][w[d].length - 1];
          const lm = last && /^\d\d:\d\d$/.test(last.end) ? Number(last.end.slice(0, 2)) : 12;
          const st = Math.min(22, lm + 2);
          w[d].push({ start: `${String(st).padStart(2, '0')}:00`, end: `${String(Math.min(23, st + 4)).padStart(2, '0')}:00` });
          onChange(w);
        });
        add.setAttribute('aria-label', `${prefix}${name}: + faixa`);
        cells.append(add);
      }
      if (E.rowOutsideCommon(ws)) cells.append(el('span', 'vb-warn wk-warn', '⚠ fora do horário comum (08:00–21:00): pode incomodar'));
      row.append(cells);
      box.append(row);
    });
    return box;
  }

  // 2.13.2: "Horário de envio" da automação: o geral (padrão) ou personalizado (dias + faixas) e o limite por dia
  const VB_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  function vbScheduleField(f) {
    const box = el('div', 'vb-field vb-sched');
    box.append(el('div', 'vb-fl', 'Horário de envio'));
    const sc = f.def.schedule || { mode: 'geral' };
    const custom = sc.mode === 'personalizado';
    const setSc = (patch) => { f.def.schedule = { ...(f.def.schedule || { mode: 'geral' }), ...patch }; vbChange(); vbRender(); };
    [['geral', `Usar o horário geral (${E.scheduleText(motor.state.settings)})`], ['personalizado', 'Personalizado']].forEach(([v, txt]) => {
      const l = el('label', 'sc-radio');
      const r = el('input');
      r.type = 'radio';
      r.name = 'vb-sched';
      r.value = v;
      r.checked = (custom ? 'personalizado' : 'geral') === v;
      r.addEventListener('change', () => {
        if (v === 'geral') setSc({ mode: 'geral', days: undefined, windows: undefined, week: undefined });
        // 2.14.3: começa com o horário geral, dia por dia
        else setSc({ mode: 'personalizado', days: undefined, windows: undefined, week: Array.isArray(sc.week) ? sc.week : E.weekToJson(E.normSettings(motor.state.settings).week) });
      });
      l.append(r, ` ${txt}`);
      box.append(l);
    });
    if (custom) {
      // horário salvo no formato antigo (dias marcados + as mesmas faixas): vira a tabela, com o mesmo resultado
      if (!Array.isArray(sc.week)) { f.def.schedule = E.scheduleWeekJson(sc); return vbScheduleField(f); }
      box.append(weekTable(sc.week, (w) => setSc({ week: w }), { prefix: 'Automação, ' }));
    }
    const lr = el('div', 'sc-row');
    const lim = el('input', 'ed-title vb-dlimit');
    lim.type = 'number';
    lim.min = '1';
    lim.max = '2000';
    lim.placeholder = 'sem limite próprio';
    lim.value = sc.daily_limit ? String(sc.daily_limit) : '';
    lim.setAttribute('aria-label', 'Limite desta automação por dia');
    lim.addEventListener('change', () => { const v = Math.floor(Number(lim.value)); setSc({ daily_limit: v > 0 ? v : undefined }); });
    lr.append(el('span', null, 'Limite desta automação por dia'), lim);
    box.append(lr, el('div', 'vb-sub', 'Os limites gerais por hora/dia e o intervalo entre envios valem sempre (protegem o número).'));
    return box;
  }
  const vbStartKey = (st) =>`${st.type}|${st.source || ''}|${st.label_id || ''}|${st.wa_label_id || ''}`;
  async function vbLoadExisting(f) {
    const st = f.def.start;
    const key = vbStartKey(st);
    if (f.loadingKey === key) return;
    f.loadingKey = key;
    let list = [];
    try {
      if (st.source === 'whatsapp') {
        const r = await waRequest('labelAllChats', { labelId: st.wa_label_id }, { timeout: 15000 });
        list = (r && r.chats ? r.chats : []).map((c) => ({ name: c.name || null, phone: c.phone || (/@c\.us$/.test(c.id) ? c.id.split('@')[0] : null) }));
      } else if (st.label_id && !String(st.label_id).startsWith(NEW_LABEL)) list = await call('automationExisting', { labelId: st.label_id });
    } catch (e) { list = []; f.msg = `Não consegui ver quem já está na etiqueta: ${e.message}`; f.err = true; }
    f.loadingKey = '';
    if (vb.f !== f) return;
    f.existing = Array.isArray(list) ? list : [];
    f.existingKey = key;
    vbRender();
  }
  // ✉: mensagem pronta (busca + prévia) ou "+ Criar mensagem aqui" (o mesmo editor das mensagens rápidas)
  const VB_PART = { texto: 'Texto', audio: 'Áudio', foto: 'Foto', imagem: 'Foto', video: 'Vídeo', documento: 'PDF/arquivo', album: 'Álbum', localizacao: 'Localização', produto: 'Produto', catalogo: 'Catálogo', contato: 'Contato', pix: 'Pix' };
  function vbSideSend(f, n, side) {
    const cur = n.item_id && state.items.find((i) => i.id === n.item_id);
    if (n.hint && !n.item_id) side.append(el('div', 'vb-sub', `Sugestão: ${n.hint}.`));
    const q = el('input', 'ed-title vb-search');
    q.type = 'search';
    q.placeholder = 'Buscar mensagem pronta…';
    q.setAttribute('aria-label', 'Buscar mensagem pronta');
    q.value = f.msgQuery || '';
    const list = el('div', 'vb-mlist');
    const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const fill = () => {
      list.textContent = '';
      const words = fold(q.value).split(/\s+/).filter(Boolean);
      const items = state.items.filter((i) => { const t = fold(`${i.title} ${i.body || ''}`); return words.every((w) => t.includes(w)); }).slice(0, 40);
      if (!items.length) list.append(el('div', 'vb-sub', state.items.length ? 'Nenhuma mensagem com essa busca.' : 'Nenhuma mensagem pronta ainda.'));
      items.forEach((i) => {
        const b = fbtn(`vb-mitem${i.id === n.item_id ? ' on' : ''}`, '', () => { n.item_id = i.id; delete n.hint; vbChange(); vbRender(); });
        b.append(el('span', 'vb-mt', i.title), el('span', 'vb-mk', isMultiPart(i) ? `${i.parts.length} partes` : (VB_PART[i.type] || i.type || '')));
        list.append(b);
      });
    };
    q.addEventListener('input', () => { f.msgQuery = q.value; fill(); });
    fill();
    side.append(q, list);
    const row = el('div', 'ed-add');
    row.append(fbtn('ed-mini vb-newmsg', '+ Criar mensagem aqui', () => vbMessageEditor(f, n, null)));
    if (cur) row.append(fbtn('ed-mini vb-editmsg', 'Editar esta mensagem', () => vbMessageEditor(f, n, cur)));
    side.append(row);
    if (cur) {
      const pv = el('div', 'vb-prev');
      pv.append(el('div', 'vb-fl', `Prévia: ${cur.title}`));
      partsOf(cur).slice(0, 8).forEach((p) => {
        const line = el('div', 'vb-pline');
        line.append(el('span', 'vb-pk', VB_PART[p.type] || p.type));
        const txt = p.body ? fillVars(String(p.body), 'Maria').slice(0, 300) : p.file_name || '';
        if (txt) line.append(el('span', 'vb-pt', txt));
        pv.append(line);
      });
      side.append(pv);
    }
  }
  function vbMessageEditor(f, n, item) {
    if (vb.el) vb.el.hidden = true;
    openMessageEditorFor((id) => { n.item_id = id; delete n.hint; vbChange(); }, item, () => { if (vb.f === f && vb.el) { vb.el.hidden = false; vbRender(); } });
  }

  // ── Simular · Testar comigo · Salvar e ligar ──
  function vbCheck(f) {
    f.showErrors = true;
    f.invalid = vbProblems(f);
    if (!f.invalid.length) { f.msg = ''; f.err = false; f.missing = null; return true; }
    const n = f.invalid.length;
    // 2.16.3: a lista do que falta ("Follow 3: escolha ou crie a mensagem"); a 1ª caixa vermelha fica à vista
    f.missing = vbMissing(f, f.invalid);
    f.msg = `Para ${f.checkFor || 'ligar'}, falta${n === 1 ? '' : 'm'} ${n} ite${n === 1 ? 'm' : 'ns'}:`;
    f.err = true;
    const firstNode = f.invalid.find((x) => x.node !== 'name');
    if (firstNode) f.sel = firstNode.node;
    vbRender();
    const bad = vb.el && vb.el.querySelector('.vb-box.vb-bad');
    if (bad) bad.scrollIntoView({ block: 'center', inline: 'center' });
    return false;
  }
  function vbAskOn(mode) {
    const f = vb.f;
    f.checkFor = 'ligar';
    if (!vbCheck(f)) return;
    f.modal = { kind: 'on', mode };
    vbRender();
    const st = f.def.start;
    if (st.type === 'etiqueta' && (f.existing == null || f.existingKey !== vbStartKey(st))) vbLoadExisting(f);
  }
  async function vbAskTest() {
    const f = vb.f;
    f.checkFor = 'testar';
    if (!vbCheck(f)) return;
    f.modal = { kind: 'test' };
    vbRender();
    let c = null;
    try { c = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { c = null; }
    if (!fl.recentChats) { try { fl.recentChats = await waRequest('recentChats', { limit: 30 }, { timeout: 6000 }); } catch { fl.recentChats = []; } }
    if (c && c.kind === 'individual') {
      if (!(fl.recentChats || []).some((x) => x.id === c.chatId)) fl.recentChats = [{ id: c.chatId, name: c.name || null }, ...(fl.recentChats || [])];
      if (!f.test_chat_id) f.test_chat_id = c.chatId;
    }
    if (vb.f === f && f.modal && f.modal.kind === 'test') vbRender();
  }
  function vbModal(f) {
    const back = el('div', 'vb-modal-bg');
    const m = el('div', `vb-modal vb-m-${f.modal.kind}`);
    m.setAttribute('role', 'dialog');
    const close = () => { f.modal = null; vbRender(); };
    back.addEventListener('click', (e) => { if (e.target === back && !f.saving) close(); });
    if (f.modal.kind === 'close') {
      // 2.16.3: salvar como rascunho (desligada, mesmo incompleta) · descartar · continuar editando
      m.append(el('div', 'vb-sh', 'Você tem alterações não salvas'), el('div', 'vb-sub', f.wasActive
        ? 'Salve para manter (ela continua ligada; precisa estar completa) ou descarte as mudanças.'
        : 'Salve como rascunho (fica desligada, mesmo incompleta, e você termina depois) ou descarte as mudanças.'));
      const row = el('div', 'ed-add');
      row.append(fbtn('bbtn primary vb-close-save', f.wasActive ? 'Salvar (continua ligada)' : 'Salvar como rascunho', () => vbSave(f.wasActive ? 'keep' : 'off')),
        fbtn('bbtn vb-discard', 'Descartar', () => vbClose(true)), fbtn('bbtn vb-close-keep', 'Continuar editando', close));
      m.append(row);
    } else if (f.modal.kind === 'sim') {
      m.append(el('div', 'vb-sh', 'Simular'), el('div', 'vb-sub', `O que aconteceria com uma pessoa que entra agora, com a data e a hora previstas de cada envio (horário da automação, faixas das etapas e esperas). ${E.scheduleSentence(f.def, motor.state.settings)}. Os limites gerais podem atrasar um pouco. Nada é enviado.`));
      const cols = el('div', 'vb-simcols');
      // 2.13.2: datas e horas de verdade (a partir de agora)
      const opt = { itemTitle: (id) => (id ? itemTitle(id) : '(sem mensagem)'), labelName: (id, src) => (id ? vbLabelName(id, src) : '(sem etiqueta)'), startAt: Date.now(), settings: motor.state.settings };
      const whenTxt = (ms) => new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace('.', '');
      [['nunca', 'Se nunca responder'], ['primeiro', 'Se responder no 1º passo']].forEach(([sc, title]) => {
        const col = el('div', `vb-simcol vb-sim-${sc}`);
        col.append(el('div', 'vb-fl', title));
        E.seqSimulate(E.seqNormalize(f.def), sc, opt).forEach((ev) => {
          const r = el('div', `vb-ev vb-ev-${ev.kind}`);
          const t = el('span', 'vb-evt', `dia ${ev.day || 0} · ${ev.when != null ? whenTxt(ev.when) : E.simAtText(ev.at)}`); // 2.16.0: dia desde a entrada
          t.title = E.simAtText(ev.at);
          r.append(t, el('span', 'vb-evx', ev.text));
          col.append(r);
        });
        cols.append(col);
      });
      m.append(cols, fbtn('bbtn vb-simclose', 'Fechar', close));
    } else if (f.modal.kind === 'test') {
      m.append(el('div', 'vb-sh', 'Testar comigo'), el('div', 'vb-sub', 'Liga EM TESTE: só a conversa escolhida recebe; todos os outros são ignorados. Para valer para todos depois, use "Ligar para todos".'));
      const opts = [['', 'Escolha a conversa…'], ...(fl.recentChats || []).map((c) => [c.id, c.name || c.id.split('@')[0]])];
      if (f.test_chat_id && !opts.some(([v]) => v === f.test_chat_id)) opts.push([f.test_chat_id, f.test_chat_id.split('@')[0]]);
      const sel = el('select', 'ed-cat vb-testchat');
      sel.setAttribute('aria-label', 'Conversa de teste');
      opts.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = v === (f.test_chat_id || ''); sel.append(o); });
      sel.addEventListener('change', () => { f.test_chat_id = sel.value; });
      const row = el('div', 'ed-add');
      const go = fbtn('bbtn primary vb-test-go', f.saving ? 'Ligando…' : 'Ligar em teste', () => { if (!f.test_chat_id) { f.msg = 'Escolha a conversa de teste.'; f.err = true; vbRender(); return; } vbSave('test'); });
      go.disabled = !!f.saving;
      row.append(go, fbtn('bbtn', 'Cancelar', close));
      m.append(sel, row);
    } else if (f.modal.kind === 'on') {
      const st = f.def.start;
      const byLabel = st.type === 'etiqueta';
      const n = byLabel && f.existing && f.existingKey === vbStartKey(st) ? f.existing.length : null;
      const inc = byLabel && f.include;
      m.append(el('div', 'vb-sh', `Ligar “${f.name}”?`));
      if (byLabel && n == null && !String(st.label_id || '').startsWith(NEW_LABEL)) m.append(el('div', 'lt-none loading', 'Contando quem já está na etiqueta…'));
      else if (inc) {
        m.append(el('div', 'act-text', `Vale para quem se encaixar daqui pra frente e também para ${n === 1 ? 'quem já está' : `os ${n} que já estão`} na etiqueta:`));
        const ul = el('ul', 'act-list');
        (f.existing || []).slice(0, 50).forEach((c) => ul.append(el('li', null, [c.name, c.phone].filter(Boolean).join(' · ') || 'sem nome')));
        m.append(ul);
      } else m.append(el('div', 'act-text', `Vale para quem se encaixar daqui pra frente.${n ? ` ${n} já est${n === 1 ? 'á' : 'ão'} e não ${n === 1 ? 'vai' : 'vão'} receber.` : ''}`));
      const row = el('div', 'ed-add');
      const go = fbtn('bbtn primary vb-on-go', f.saving ? 'Ligando…' : inc && n ? `Ligar e incluir ${n}` : 'Ligar', () => vbSave(f.modal.mode));
      go.disabled = !!f.saving || (byLabel && n == null && !String(st.label_id || '').startsWith(NEW_LABEL));
      row.append(go, fbtn('bbtn', 'Cancelar', close));
      m.append(row);
    }
    back.append(m);
    return back;
  }
  // Salvar. mode: 'off' (desligada), 'keep' (como está), 'on' (ligar para todos), 'todos' (sair do teste), 'test'
  async function vbSave(mode) {
    const f = vb.f;
    if (!f || f.saving) return;
    // 2.16.3: "Salvar desligada" / "Salvar e desligar" / "Salvar como rascunho" sempre salvam (rascunho)
    const draft = mode === 'off' || (mode === 'keep' && !f.wasActive);
    let missingN = 0;
    if (draft) {
      f.showErrors = true;
      f.invalid = vbProblems(f);
      missingN = f.invalid.length;
      if (f.modal && f.modal.kind === 'close') f.modal = null;
    } else {
      f.checkFor = mode === 'test' ? 'testar' : mode === 'keep' ? 'salvar ligada' : 'ligar';
      if (!vbCheck(f)) { if (f.modal) f.modal = null; vbRender(); return; }
    }
    let active = f.wasActive;
    let testOn = f.testOn;
    if (mode === 'off') active = false;
    if (mode === 'on' || mode === 'todos') { active = true; testOn = false; }
    if (mode === 'test') { active = true; testOn = true; }
    const include = (mode === 'on' || mode === 'todos') && f.def.start.type === 'etiqueta' && !!f.include;
    f.saving = true;
    vbRender();
    try {
      const def = E.seqNormalize(f.def);
      // etiquetas que ainda não existem ("new:Nome"): cria agora
      const fake = [{ trigger_label_id: def.start.label_id || null, actions: [] }];
      E.seqIndex(def).forEach(({ node: n }) => { if (n.type === 'etiqueta' && n.source !== 'whatsapp') fake[0].actions.push(n); });
      (def.start.exclude || []).forEach((x) => { if (x.source !== 'whatsapp') fake[0].actions.push(x); });
      await resolveNewLabels(fake);
      if (def.start.label_id) def.start.label_id = fake[0].trigger_label_id;
      E.seqIndex(def).forEach(({ node: n }) => { if (n.hint) delete n.hint; });
      const base = active && !testOn ? await baselineWaLabel({ kind: 'sequencia', sequence: def }).catch(() => null) : null; // 2.12.5
      const saved = await call('saveAutomation', { id: f.id || undefined, automation: { kind: 'sequencia', name: f.name.trim() || (draft ? 'Rascunho' : ''), active, sequence: def, test_chat_id: testOn ? f.test_chat_id : null }, includeExisting: include });
      if (mode === 'todos') await call('setAutomationActive', { id: (saved && saved.id) || f.id, active: true, includeExisting: include });
      await motor.loadAutomations();
      fl.statsAt = 0;
      flash({
        off: missingN ? `Rascunho salvo (desligado): falta${missingN === 1 ? '' : 'm'} ${missingN} ite${missingN === 1 ? 'm' : 'ns'} para poder ligar.` : 'Automação salva (desligada).', test: 'Ligada EM TESTE: só a conversa escolhida recebe.',
        on: include ? 'Automação ligada (incluindo quem já estava na etiqueta).' : `Automação ligada: vale para quem se encaixar daqui pra frente.${baselineText(base)}`,
        todos: include ? 'Ligada para todos (incluindo quem já estava na etiqueta).' : `Ligada para todos: vale daqui pra frente.${baselineText(base)}`,
        keep: active ? 'Automação salva (continua ligada).' : 'Automação salva.',
      }[mode]);
      vb.f = null;
      if (vb.el) { vb.el.remove(); vb.el = null; }
      backToList();
      renderFootPause();
      return;
    } catch (e) {
      f.msg = e.message;
      f.err = true;
    }
    f.saving = false;
    vbRender();
  }

  // ── 2.11.0: "+ Nova automação": modelos com passo a passo (Quem → Quando → O quê) ──
  function renderTemplates() {
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'NOVA AUTOMAÇÃO'));
    sec.append(el('div', 'crm-intro', 'Escolha um modelo: são 3 passos simples (Quem → Quando → O quê). Nada é ligado antes do fim.'));
    const grid = el('div', 'fw-models');
    E.WIZARDS.forEach((t) => {
      const card = el('button', 'fw-card fw-model');
      card.type = 'button';
      card.dataset.wizard = t.key;
      card.append(el('div', 'fw-name', t.title), el('div', 'fw-txt', t.help));
      card.addEventListener('click', () => openWizard(t.key));
      grid.append(card);
    });
    // 2.12.0: sequências (respondeu / não respondeu)
    [['seq_blank', 'Sequência (respondeu / não respondeu)', 'Monte uma receita de cima para baixo: manda, espera a resposta e segue por ✅ Respondeu ou ❌ Não respondeu (pode repetir).'],
      ['lead_followup', 'Follow-up de lead novo', 'Lead novo chamou → você responde → se não responder em 2h, Follow 1 → até o dia 1 desde a entrada → Follow 2 → até o dia 3 → Follow 3. Respondeu: "Em atendimento".']].forEach(([key, title, help]) => {
      const card = el('button', 'fw-card fw-model fw-seq');
      card.type = 'button';
      card.dataset.seq = key;
      card.append(el('div', 'fw-name', title), el('div', 'fw-txt', help));
      if (motor.state.sequencesAvailable !== true) { card.disabled = true; card.append(el('div', 'ed-note', 'Atualize o banco para usar (migration 20261106210000).')); }
      card.addEventListener('click', () => openSeqEditor(null, key));
      grid.append(card);
    });
    const blank = el('button', 'fw-card fw-model fw-blank');
    blank.type = 'button';
    blank.append(el('div', 'fw-name', 'Em branco (avançado)'), el('div', 'fw-txt', 'Abre o editor completo: qualquer gatilho, condições e ações.'));
    blank.addEventListener('click', () => openAutomationEditor(null));
    grid.append(blank);
    sec.append(grid);
    const more = el('details', 'fw-more');
    more.append(el('summary', null, 'Mais modelos (editor avançado)'));
    E.AUTOMATION_TEMPLATES.forEach((t) => {
      const card = el('div', 'fw-card');
      card.append(el('div', 'fw-name', t.title), el('div', 'fw-txt', summaryOf(templateToAutomation(t)).text));
      if (t.help) card.append(el('div', 'crm-intro', t.help));
      card.append(fbtn('ed-mini', 'Usar este modelo', () => openAutomationEditor(templateToAutomation(t), { template: t })));
      more.append(card);
    });
    sec.append(more, fbtn('bbtn', 'Voltar', () => backToList()));
    ftabEl.append(sec);
  }

  const wizardDef = (key) => E.WIZARDS.find((w) => w.key === key);
  const waLabelByName = (name) => (state.waLabels || []).find((l) => l.name.toLowerCase() === String(name).toLowerCase());
  function openWizard(key) {
    const t = wizardDef(key);
    const followup = key === 'followup';
    let trigger = { source: 'crm', id: t.label ? labelRef(t.label) : '' };
    if (t.waLabel && waLabelByName(t.waLabel) && !labelIdByName(t.label)) trigger = { source: 'whatsapp', id: String(waLabelByName(t.waLabel).id) };
    if (key === 'posvenda') trigger = { source: 'crm', id: '' };
    const n = t.stages || 1;
    fl.wiz = {
      kind: key, step: 1, name: t.title, trigger, amount: t.amount, unit: t.unit, nStages: n,
      stages: Array.from({ length: followup ? 4 : 1 }, (_, k) => ({ itemId: '', labelId: k === 0 ? trigger.id : labelRef(`Follow Up ${k + 1}`) })),
      itemId: '', moveTo: '', count: null, countErr: '', testChat: '', testing: false, saving: false, msg: '', err: false,
    };
    fl.view = 'wizard';
    if (!Array.isArray(state.waLabels)) refreshBar().then(() => { if (fl.view === 'wizard') renderFollows(); }).catch(() => {});
    renderFollows();
    loadWizardCount();
  }
  // quantos estão na etiqueta hoje (e por isso NÃO recebem: só vale para quem entrar depois de ligar)
  async function loadWizardCount() {
    const w = fl.wiz;
    if (!w || w.kind === 'posvenda') return;
    w.count = null;
    w.countErr = '';
    const t = w.trigger;
    try {
      if (!t.id || String(t.id).startsWith(NEW_LABEL)) w.count = 0;
      else if (t.source === 'whatsapp') { const r = await waRequest('labelChatIds', { labelId: String(t.id) }, { timeout: 8000 }); w.count = Number(r && r.count) || ((r && r.chats) || []).length; }
      else w.count = ((await call('automationExisting', { labelId: t.id })) || []).length;
    } catch (e) { w.countErr = e.message; }
    if (fl.wiz === w && fl.view === 'wizard') renderFollows();
  }
  const wizInput = (w) => ({
    name: w.name, trigger: w.trigger, amount: w.amount, unit: w.unit, itemId: w.itemId, moveTo: w.moveTo,
    stages: w.kind === 'followup' ? w.stages.slice(0, w.nStages).map((st, k) => ({ ...st, labelId: k === 0 ? w.trigger.id : st.labelId })) : [],
  });
  const wizNames = { labelName: (id) => (String(id).startsWith(NEW_LABEL) ? String(id).slice(NEW_LABEL.length) : labelName(id)), waLabelName, itemTitle };
  function wizStepProblem(w, step) {
    if (step >= 1 && w.kind !== 'posvenda' && !w.trigger.id) return 'Escolha a etiqueta.';
    if (step >= 2 && !(Number(w.amount) >= 1)) return 'Escolha depois de quanto tempo.';
    if (step >= 3) {
      if (w.kind === 'followup') {
        const st = w.stages.slice(0, w.nStages);
        const k = st.findIndex((x) => !x.itemId);
        if (k >= 0) return `Etapa ${k + 1}: escolha ou crie a mensagem.`;
        const j = st.findIndex((x, i) => i > 0 && !x.labelId);
        if (j >= 0) return `Etapa ${j + 1}: escolha a etiqueta.`;
      } else if (!w.itemId) return 'Escolha ou crie a mensagem.';
    }
    return '';
  }
  function renderWizard() {
    const w = fl.wiz;
    const t = wizardDef(w.kind);
    const sec = el('section', 'crmsec fw-wizard');
    sec.append(el('div', 'wt-head', t.title.toUpperCase()));
    const steps = el('ol', 'fw-steps');
    ['Quem', 'Quando', 'O quê', 'Resumo'].forEach((n, i) => { const li = el('li', w.step === i + 1 ? 'on' : w.step > i + 1 ? 'done' : '', `${i + 1}. ${n}`); if (w.step === i + 1) li.setAttribute('aria-current', 'step'); steps.append(li); });
    sec.append(steps);
    const body = el('div', 'fw-block');
    if (w.step === 1) {
      if (w.kind === 'posvenda') {
        body.append(el('div', 'fw-q', 'Quem recebe? Quem tiver uma venda registrada pela conversa (botão 💰 Venda).'));
        body.append(schedField('Só quem estiver nesta etiqueta CRM (opcional)', labelPicker(w.trigger.id, (v) => { w.trigger = { source: 'crm', id: v }; }, { empty: '(qualquer cliente)', aria: 'Etiqueta (opcional)' })));
        body.append(el('div', 'crm-intro', 'Só vendas registradas depois de ligar contam (as antigas não).'));
      } else {
        body.append(el('div', 'fw-q', w.kind === 'followup' ? 'Quem começa o follow-up? Quem estiver na etiqueta da 1ª etapa.' : 'Quem recebe? Quem estiver nesta etiqueta.'));
        const fake = { trigger_label_source: w.trigger.source, trigger_label_id: w.trigger.source === 'crm' ? w.trigger.id : '', trigger_wa_label_id: w.trigger.source === 'whatsapp' ? w.trigger.id : '', actions: [] };
        const pick = triggerPicker(fake);
        pick.querySelector('select').addEventListener('change', () => {
          w.trigger = fake.trigger_label_source === 'whatsapp' ? { source: 'whatsapp', id: fake.trigger_wa_label_id } : { source: 'crm', id: fake.trigger_label_id };
          w.stages[0].labelId = w.trigger.id;
          renderFollows();
          loadWizardCount();
        });
        body.append(schedField('Etiqueta', pick));
        const c = el('div', 'fw-count wiz-count');
        if (String(w.trigger.id || '').startsWith(NEW_LABEL)) c.textContent = 'Essa etiqueta ainda não existe: ela é criada quando você ligar.';
        else if (w.countErr) c.textContent = `Não consegui contar quem está nela: ${w.countErr}`;
        else if (w.count == null) c.textContent = w.trigger.id ? 'Contando quem está nela hoje…' : '';
        else c.textContent = `Hoje ${w.count} ${w.count === 1 ? 'pessoa está' : 'pessoas estão'} nessa etiqueta.`;
        body.append(c, el('div', 'ed-note', 'Só vale para quem ENTRAR na etiqueta depois de ligar. Quem já está nela hoje não recebe.'));
        if (w.kind === 'followup') {
          const n = el('select', 'ed-cat');
          n.setAttribute('aria-label', 'Quantas etapas');
          [1, 2, 3, 4].forEach((k) => { const o = el('option', null, `${k} etapa${k === 1 ? '' : 's'}`); o.value = String(k); o.selected = w.nStages === k; n.append(o); });
          n.addEventListener('change', () => { w.nStages = Number(n.value); renderFollows(); });
          body.append(schedField('Quantas etapas (mensagens)', n));
        }
      }
    } else if (w.step === 2) {
      const amount = numberInput(w.amount, 1, w.unit === 'horas' ? 8760 : 365, 'Quanto tempo');
      const unit = el('select', 'ed-cat');
      unit.setAttribute('aria-label', 'Unidade');
      [['horas', 'horas'], ['dias', w.kind === 'posvenda' ? 'dias' : 'dias úteis']].forEach(([v, txt]) => { const o = el('option', null, txt); o.value = v; o.selected = w.unit === v; unit.append(o); });
      const preview = el('div', 'fw-q wiz-when');
      const upd = () => { preview.textContent = w.kind === 'posvenda' ? `Manda ${wizWhenText(w)} depois da venda.` : `Se não responder em ${wizWhenText(w)}, manda.`; };
      amount.addEventListener('input', () => { w.amount = Math.floor(Number(amount.value) || 0); upd(); });
      unit.addEventListener('change', () => { w.unit = unit.value; upd(); });
      body.append(el('div', 'fw-q', w.kind === 'posvenda' ? 'Quanto tempo depois da venda?' : w.kind === 'sumido' ? 'Há quanto tempo sem responder?' : 'Depois de quanto tempo sem resposta?'));
      const r = el('div', 'sc-row');
      r.append(amount, unit);
      body.append(r, preview);
      upd();
      if (w.kind !== 'posvenda') body.append(el('div', 'crm-intro', 'Conta em tempo corrido, a partir da SUA última mensagem. Se o cliente responder antes, não manda. O envio respeita o horário de envio.'));
    } else if (w.step === 3) {
      if (w.kind === 'followup') {
        w.stages.slice(0, w.nStages).forEach((st, k) => {
          const box = el('div', 'fw-variant fw-stage');
          box.append(el('div', 'fw-k', `ETAPA ${k + 1}`));
          if (k > 0) box.append(schedField(`Etiqueta da etapa ${k + 1}`, labelPicker(st.labelId, (v) => { st.labelId = v; }, { aria: `Etiqueta da etapa ${k + 1}` })));
          box.append(schedField(`Mensagem da etapa ${k + 1}`, msgPickerEl(st.itemId, (id) => { st.itemId = id; }, { aria: `Mensagem da etapa ${k + 1}` })));
          body.append(box);
        });
        body.append(schedField('No fim, mover para (opcional)', labelPicker(w.moveTo, (v) => { w.moveTo = v; }, { empty: '(sai da última etiqueta)', aria: 'No fim, mover para' })));
      } else {
        body.append(el('div', 'fw-q', 'O que mandar?'));
        body.append(msgPickerEl(w.itemId, (id) => { w.itemId = id; }, { aria: 'Mensagem' }));
        body.append(schedField(w.kind === 'posvenda' ? 'Depois, colocar na etiqueta (opcional)' : 'Depois, mover para (opcional)', labelPicker(w.moveTo, (v) => { w.moveTo = v; }, { empty: w.kind === 'posvenda' ? '(não colocar)' : '(não mover)', aria: 'Depois, mover para' })));
      }
    } else {
      const sentence = E.wizardSentence(w.kind, wizInput(w), wizNames);
      body.append(el('div', 'fw-q', 'Resumo'), el('div', 'fw-test fw-sentence', sentence));
      const name = el('input', 'ed-title');
      name.maxLength = 50;
      name.value = w.name;
      name.setAttribute('aria-label', 'Nome da automação');
      name.addEventListener('input', () => { w.name = name.value; });
      body.append(schedField('Nome', name));
      body.append(el('div', 'crm-intro', 'Segurança de sempre: só vale para quem entrar depois de ligar, nunca para quem tem "Não enviar", respeita os limites e o horário comercial.'));
      if (w.testing) {
        const sel = el('select', 'ed-cat');
        sel.setAttribute('aria-label', 'Conversa de teste');
        const none = el('option', null, (fl.recentChats || []).length ? 'Escolha a conversa de teste…' : 'Nenhuma conversa carregada no WhatsApp');
        none.value = '';
        sel.append(none);
        (fl.recentChats || []).forEach((c) => { const o = el('option', null, c.name || c.id.split('@')[0]); o.value = c.id; o.selected = c.id === w.testChat; sel.append(o); });
        sel.addEventListener('change', () => { w.testChat = sel.value; });
        body.append(schedField('Testar só com esta conversa (a sua)', sel), el('div', 'crm-intro', 'Em teste, a automação roda só para essa conversa e ignora todo o resto. Coloque essa conversa na etiqueta para ver acontecer.'));
      }
    }
    sec.append(body);
    const problem = w.step < 4 ? '' : wizStepProblem(w, 3);
    const row = el('div', 'ed-add');
    row.append(fbtn('bbtn', w.step === 1 ? 'Voltar aos modelos' : 'Voltar', () => { if (w.step === 1) { fl.view = 'templates'; fl.wiz = null; } else w.step--; renderFollows(); }));
    if (w.step < 4) {
      row.append(fbtn('bbtn primary wiz-next', 'Próximo', () => {
        const p = wizStepProblem(w, w.step);
        if (p) { w.msg = p; w.err = true; renderFollows(); return; }
        w.msg = '';
        w.step++;
        renderFollows();
      }));
    } else {
      const busy = w.saving;
      const test = fbtn('bbtn wiz-test', w.testing ? 'Ligar em teste' : 'Testar comigo', async () => {
        if (!w.testing) {
          w.testing = true;
          if (!fl.recentChats) { try { fl.recentChats = await waRequest('recentChats', { limit: 30 }, { timeout: 6000 }); } catch { fl.recentChats = []; } }
          renderFollows();
          return;
        }
        if (!w.testChat) { w.msg = 'Escolha a conversa de teste.'; w.err = true; renderFollows(); return; }
        saveWizard({ active: true, test: true });
      });
      const on = fbtn('bbtn primary wiz-on', busy ? 'Salvando…' : 'Ligar', () => saveWizard({ active: true }));
      const off = fbtn('bbtn wiz-off', 'Salvar desligada', () => saveWizard({ active: false }));
      [test, on, off].forEach((b) => { b.disabled = busy || !!problem; });
      row.append(test, on, off);
      if (problem) w.msg = problem;
    }
    sec.append(row, el('div', `ed-msg${w.err || problem ? ' err' : ''}`, w.msg));
    ftabEl.append(sec);
  }
  const wizWhenText = (w) => { const n = Math.max(1, Math.floor(Number(w.amount) || 0)); return w.unit === 'horas' ? `${n} hora${n === 1 ? '' : 's'}` : w.kind === 'posvenda' ? `${n} dia${n === 1 ? '' : 's'}` : `${n} dia${n === 1 ? ' útil' : 's úteis'}`; };

  // cria as etiquetas que ainda não existem ("new:Nome") e troca pelo id
  async function resolveNewLabels(list) {
    const cache = {};
    const fix = async (v) => {
      if (typeof v !== 'string' || !v.startsWith(NEW_LABEL)) return v;
      const name = v.slice(NEW_LABEL.length);
      if (cache[name]) return cache[name];
      let id = labelIdByName(name);
      if (!id) {
        try { id = (await call('createLabel', { name, color: '#3b82f6' })).id; } catch { await syncLabels().catch(() => {}); id = labelIdByName(name); }
      }
      if (!id) throw new Error(`Não consegui criar a etiqueta "${name}"`);
      cache[name] = id;
      return id;
    };
    for (const a of list) {
      a.trigger_label_id = await fix(a.trigger_label_id);
      for (const x of a.actions) if (x.label_id) x.label_id = await fix(x.label_id);
    }
    if (Object.keys(cache).length) await syncLabels().catch(() => {});
    return list;
  }
  async function saveWizard({ active, test = false }) {
    const w = fl.wiz;
    if (!w || w.saving) return;
    const problem = wizStepProblem(w, 3);
    if (problem) { w.msg = problem; w.err = true; renderFollows(); return; }
    w.saving = true;
    w.msg = '';
    renderFollows();
    try {
      const list = E.wizardToAutomations(w.kind, { ...wizInput(w), testChatId: test ? w.testChat : null }, { settings: motor.state.settings });
      await resolveNewLabels(list);
      for (const a of list) {
        a.active = active;
        const bad = E.validateAutomationDraft(a, { testOn: test });
        if (bad.length) throw new Error(`${a.name}: ${bad[0].msg}`);
        if (active) fl.lastBase = (await baselineWaLabel(a).catch(() => null)) || fl.lastBase; // 2.12.5
        await call('saveAutomation', { automation: a, includeExisting: false });
      }
      await motor.loadAutomations();
      fl.statsAt = 0;
      flash(active ? (test ? `Ligada em teste: roda só para a conversa escolhida.` : `Ligada: ${E.wizardSentence(w.kind, wizInput(w), wizNames)}${baselineText(fl.lastBase)}`) : 'Automação salva (desligada).');
      fl.lastBase = null;
      fl.wiz = null;
      fl.saving = false;
      backToList();
      renderFootPause();
      return;
    } catch (e) {
      w.msg = e.message;
      w.err = true;
    }
    w.saving = false;
    renderFollows();
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
      wait_minutes_sale: src.trigger_type === 'venda_registrada' ? Number(src.wait_minutes) || 0 : 0, // 2.11.0
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
      wait_minutes: f.trigger_type === 'venda_registrada' ? (Number(f.wait_minutes_sale) > 0 ? f.wait_minutes_sale : null) : f.wait_minutes,
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
    withLabelCreate(sel, { kinds: v25 && waList.length ? ['crm', 'wa'] : ['crm'], waPrefix: 'wa:' }); // 2.13.4
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
    sel.dataset.lcKind = 'wa';
    return Array.isArray(state.waLabels) ? withLabelCreate(sel, { kinds: ['wa'] }) : sel; // 2.13.4 (carregando: depois)
  }

  function renderAutomationEditor() {
    const f = fl.edit;
    // 2.11.0: depois de tentar salvar, os problemas aparecem no lugar (e somem quando resolvidos)
    if (f.triedSave) f.invalid = E.validateAutomationDraft(editorToAutomation(f), { testOn: f.testOn });
    const bad = (where) => (f.invalid || []).filter((x) => x.where === where).map((x) => x.msg).join(' ');
    const mark = (node, where) => { const m = bad(where); if (m) { node.classList.add('fw-invalid'); node.append(el('div', 'fw-errmsg', m)); } return node; };
    const sec = el('section', 'crmsec fw-editor');
    sec.append(el('div', 'wt-head', f.id ? 'EDITAR AUTOMAÇÃO' : `NOVA AUTOMAÇÃO${f.template ? ` · MODELO: ${f.template.toUpperCase()}` : ''}`));
    if (f.legacyNote) sec.append(el('div', 'ed-note fw-legacy', `${f.legacyNote} Por isso ela abre aqui, e não no construtor visual.`)); // 2.13.0
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
    sec.append(mark(schedField('Nome', name), 'name'));
    if (f.wasActive) sec.append(el('div', `crm-intro fw-state${f.testOn ? ' test' : ''}`, f.testOn ? 'EM TESTE: liga só para a conversa escolhida.' : 'Esta automação está LIGADA.'));

    // QUANDO
    const q = el('div', 'fw-block');
    q.append(el('div', 'fw-k', 'QUANDO RODA'));
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
    if (TRIGGER_INFO[f.trigger_type]) q.append(withInfo('', TRIGGER_INFO[f.trigger_type]));
    // Ações "remover a etiqueta do gatilho" (do modelo) acompanham a etiqueta escolhida aqui
    const saleTrig = f.trigger_type === 'venda_registrada';
    if (saleTrig) q.append(schedField('Só para quem está na etiqueta CRM (opcional)', labelPicker(f.trigger_label_id, (v) => { f.trigger_label_id = v; f.actions.forEach((x) => { if (x.followsTrigger) x.label_id = v; }); }, { aria: 'Etiqueta do gatilho', empty: '(qualquer contato)' })));
    else {
      q.append(mark(schedField(withInfo('Para quem está na etiqueta (CRM ou WhatsApp)', 'A automação olha os contatos desta etiqueta. Só vale para quem entrar nela depois de ligar.'), triggerPicker(f)), 'trigger'));
      if (f.trigger_label_source === 'whatsapp') q.append(el('div', 'crm-intro', 'Etiqueta do WhatsApp: a entrada conta a partir da primeira vez que a extensão viu a conversa nela (o WhatsApp não guarda essa data). Tirou e colocou de novo: conta como nova entrada.'));
    }
    if (saleTrig) {
      // 2.11.0: esperar alguns dias depois da venda (0 = na hora)
      const days = numberInput(Math.round((Number(f.wait_minutes_sale) || 0) / 1440), 0, 90, 'Dias depois da venda');
      days.addEventListener('input', () => { f.wait_minutes_sale = Math.max(0, Math.min(90, Math.floor(Number(days.value) || 0))) * 1440; updateSummary(); });
      q.append(schedField(withInfo('Esperar quantos dias depois da venda (0 = na hora)', 'Tempo corrido desde que a venda foi registrada pelo 💰.'), days));
      q.append(el('div', 'crm-intro', 'Roda uma vez para cada venda registrada pela conversa (botão 💰 Venda).'));
    }
    if (f.trigger_type === 'sem_resposta') {
      const hours = numberInput(Math.floor(f.wait_minutes / 60), 0, 8760, 'Horas');
      const mins = numberInput(f.wait_minutes % 60, 0, 59, 'Minutos');
      const upd = () => { f.wait_minutes = (Math.max(0, Math.floor(Number(hours.value) || 0)) * 60) + Math.max(0, Math.min(59, Math.floor(Number(mins.value) || 0))); updateSummary(); };
      hours.addEventListener('input', upd);
      mins.addEventListener('input', upd);
      const r = el('div', 'sc-row');
      r.append(schedField('Sem responder por (horas, tempo corrido)', hours), schedField('e minutos', mins));
      q.append(mark(r, 'wait'), el('div', 'crm-intro', `Tempo corrido. O envio respeita o horário de envio (${E.scheduleText(motor.state.settings)}; mude em "Horário geral e limites").`));
      const older = numberInput(f.ignore_older_days, 1, 365, 'Ignorar conversas paradas há (dias)');
      older.addEventListener('input', () => { f.ignore_older_days = Math.floor(Number(older.value) || 0); });
      q.append(schedField(withInfo('Não mandar se a conversa está parada há mais de (dias)', 'Conversas muito antigas ficam de fora, para não falar com quem sumiu há meses.'), older));
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
      r.append(schedField('Quanto tempo depois de entrar', amount), schedField('unidade', unit));
      q.append(mark(r, 'wait'), el('div', 'crm-intro', 'Tempo corrido desde que o contato entrou na etiqueta (mesmo que tenham conversado no meio).'));
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
      q.append(el('div', 'crm-sub', 'Dias'), mark(days, 'days'), mark(schedField('Hora', time), 'time'), el('div', 'crm-intro', 'Cada contato da etiqueta, uma vez por dia.'));
    }
    sec.append(q);

    // SE
    const se = el('div', 'fw-block');
    se.append(withInfo(el('span', 'fw-k', 'SÓ SE (opcional)'), 'Filtros extras: todos precisam bater para a automação rodar com o contato.'));
    if (!f.conditions.length) se.append(el('div', 'lt-none', 'Sem filtros: vale para todos da etiqueta.'));
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
      se.append(mark(row, `cond:${i}`));
    });
    const addC = el('div', 'ed-add');
    [['tem_etiqueta', '+ só se tiver etiqueta'], ['nao_tem_etiqueta', '+ só se NÃO tiver etiqueta'], ['anuncio', '+ só se veio do anúncio'], ['parada_max_dias', '+ só se parada há no máx.']].forEach(([t, label]) => {
      const b = fbtn('ed-mini', label, () => { f.conditions.push(t === 'parada_max_dias' ? { type: t, days: 30 } : t === 'anuncio' ? { type: t, keyword: '' } : { type: t, label_id: '' }); renderFollows(); });
      b.disabled = f.conditions.length >= 10;
      addC.append(b);
    });
    se.append(addC);
    sec.append(se);

    // ENTÃO
    const en = el('div', 'fw-block');
    en.append(withInfo(el('span', 'fw-k', 'O QUE FAZ (em ordem)'), 'As ações rodam uma depois da outra. Se o envio falhar, as próximas não rodam.'));
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
      if (ACTION_INFO[x.type]) row.append(withInfo('', ACTION_INFO[x.type]));
      if (x.type === 'enviar') {
        // 2.11.0: escolher pronta, criar aqui ou editar a escolhida
        row.append(msgPickerEl(x.item_id, (id) => { x.item_id = id; }, { aria: `Mensagem da ação ${i + 1}`, empty: x.variants.length ? '(nenhuma se nenhuma variante bater)' : 'Escolha uma mensagem pronta…' }));
        if (x.hint && !x.item_id) row.append(el('div', 'ed-note', `Escolha ${x.hint}.`));
        // variantes ficam em "Mais opções"
        const more = el('details', 'fw-more');
        more.open = x.variants.length > 0;
        more.append(el('summary', null, `Mais opções${x.variants.length ? ` (${x.variants.length} variante${x.variants.length === 1 ? '' : 's'})` : ''}`));
        more.append(el('div', 'crm-intro', 'Variante: mandar outra mensagem para quem tem uma etiqueta ou veio de um anúncio. Sem variante que bata, vai a mensagem de cima.'));
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
          more.append(mark(vr, `variant:${i}:${j}`));
        });
        const addV = fbtn('ed-mini', '+ Variante "se tem etiqueta X, manda Y"', () => { x.variants.push({ when: 'etiqueta', label_id: '', item_id: '' }); renderFollows(); });
        addV.disabled = x.variants.length >= 10;
        more.append(addV);
        row.append(more);
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
      en.append(mark(row, `action:${i}`));
    });
    const addA = fbtn('ed-mini', '+ Ação', () => { f.actions.push({ type: 'adicionar_etiqueta', label_id: '' }); renderFollows(); });
    addA.disabled = f.actions.length >= 10;
    en.append(addA);
    sec.append(en);

    sec.append(el('div', 'crm-sub', 'Resumo'), summaryBox);
    updateSummary();
    sec.append(automationFooterEl(f)); // 2.12.6
    sec.append(el('div', `ed-msg${f.err ? ' err' : ''}`, f.msg));
    ftabEl.append(sec);
  }

  // 2.12.6: valida o editor e marca o lugar de cada problema (antes de salvar ou de abrir a confirmação)
  function editorProblems(f) {
    f.triedSave = true;
    const automation = editorToAutomation(f);
    const problems = E.validateAutomationDraft(automation, { testOn: f.testOn });
    if (problems.length) {
      f.msg = problems.length === 1 ? problems[0].msg : `${problems[0].msg} (e mais ${problems.length - 1} problema${problems.length === 2 ? '' : 's'} marcado${problems.length === 2 ? '' : 's'} em vermelho)`;
      f.err = true;
      renderFollows();
      const first = ftabEl.querySelector('.fw-invalid');
      if (first) first.scrollIntoView({ block: 'center' });
      return true;
    }
    const pending = JSON.stringify(automation).match(/"new:([^"]+)"/);
    if (pending) { f.msg = `A etiqueta "${pending[1]}" ainda não existe: clique em "Criar agora".`; f.err = true; renderFollows(); return true; }
    return false;
  }

  // "Salvar e ligar" / "Ligar para todos": valida e abre a confirmação (mesma da lista)
  function openEditorConfirm(f, mode) {
    const was = { active: f.active, testOn: f.testOn };
    f.active = true;
    f.testOn = false;
    const bad = editorProblems(f);
    f.active = was.active;
    f.testOn = was.testOn;
    if (bad) return;
    f.msg = '';
    f.err = false;
    f.testPick = false;
    f.confirm = { mode, include: false, info: null, advanced: false };
    f.activation = f.confirm; // loadActivationInfo lê daqui
    renderFollows();
    loadActivationInfo({ ...editorToAutomation(f), active: true, test_chat_id: null });
  }

  // Salvar. mode: 'off' (desligada), 'keep' (como está: ligada, ou em teste), 'on' (ligar para todos, depois da
  // confirmação), 'todos' (sair do teste e ligar para todos), 'test' (ligar só para a conversa escolhida)
  async function saveAutomationForm(mode = 'keep') {
    const f = fl.edit;
    if (!f || fl.saving) return;
    const prevState = { active: f.active, testOn: f.testOn };
    if (mode === 'off') f.active = false;
    if (mode === 'on' || mode === 'todos') { f.active = true; f.testOn = false; }
    if (mode === 'test') { f.active = true; f.testOn = true; }
    if (editorProblems(f)) { Object.assign(f, prevState); renderFollows(); return; }
    const automation = editorToAutomation(f);
    const include = (mode === 'on' || mode === 'todos') && !!(f.confirm && f.confirm.include);
    fl.saving = true;
    if (f.confirm) f.confirm.busy = true;
    f.msg = '';
    renderFollows();
    try {
      // 2.8.8: ligar (ou trocar gatilho/etiqueta de uma ligada) = vale daqui pra frente
      const base = automation.active ? await baselineWaLabel(automation).catch(() => null) : null; // 2.12.5
      const saved = await call('saveAutomation', { id: f.id || undefined, automation, includeExisting: include });
      // sair do teste e ligar para todos: o "daqui pra frente" recomeça agora
      if (mode === 'todos') await call('setAutomationActive', { id: (saved && saved.id) || f.id, active: true, includeExisting: include });
      await motor.loadAutomations();
      fl.statsAt = 0;
      const msg = {
        off: 'Automação salva (desligada).',
        test: 'Ligada EM TESTE: roda só para a conversa escolhida.',
        on: include ? 'Automação ligada (incluindo quem já estava na etiqueta).' : `Automação ligada: vale para quem entrar daqui pra frente.${baselineText(base)}`,
        todos: include ? 'Ligada para todos (incluindo quem já estava na etiqueta).' : `Ligada para todos: vale para quem entrar daqui pra frente.${baselineText(base)}`,
        keep: automation.active ? 'Automação salva (continua ligada).' : 'Automação salva.',
      }[mode];
      flash(msg);
      fl.saving = false;
      backToList();
      renderFootPause();
      return;
    } catch (e) {
      f.msg = e.message;
      f.err = true;
      if (f.confirm) f.confirm.busy = false;
    }
    fl.saving = false;
    renderFollows();
  }

  // 2.12.6: rodapé do editor: uma linha de segurança e só os botões de salvar.
  //   desligada: [Salvar desligada] [Salvar e ligar] [Testar comigo] · ligada: [Salvar] [Salvar e desligar]
  //   em teste: [Salvar] [Salvar e desligar] [Ligar para todos]
  function automationFooterEl(f) {
    const box = el('div', 'fw-footer');
    box.append(el('div', 'fw-safety-line', 'Só vale para quem entrar depois de ligar. Nunca envia para "Não enviar".'));
    if (f.confirm) {
      box.append(activationEl({ ...editorToAutomation(f), active: true }, f.confirm, () => saveAutomationForm(f.confirm.mode), () => { f.confirm = null; f.activation = null; renderFollows(); }));
      return box;
    }
    if (f.testPick) { box.append(testPickEl(f)); return box; }
    const row = el('div', 'ed-add fw-save-row');
    const b = (cls, text, fn) => { const x = fbtn(cls, text, fn); x.disabled = !!fl.saving; return x; };
    if (f.wasActive) {
      row.append(b('bbtn primary fw-save', fl.saving ? 'Salvando…' : 'Salvar', () => saveAutomationForm('keep')), b('bbtn fw-save-disable', 'Salvar e desligar', () => saveAutomationForm('off')));
      if (f.testOn) row.append(b('bbtn fw-all', 'Ligar para todos', () => openEditorConfirm(f, 'todos')));
    } else {
      row.append(b('bbtn fw-save-off', fl.saving ? 'Salvando…' : 'Salvar desligada', () => saveAutomationForm('off')), b('bbtn primary fw-save-on', 'Salvar e ligar', () => openEditorConfirm(f, 'on')),
        b('bbtn fw-test-me', 'Testar comigo', () => openTestPick(f)));
    }
    row.append(fbtn('bbtn', 'Cancelar', () => backToList()));
    box.append(row);
    return box;
  }

  // "Testar comigo": escolhe a conversa (a aberta já vem escolhida) e liga só para ela
  async function openTestPick(f) {
    f.testPick = true;
    f.msg = '';
    renderFollows();
    let c = null;
    try { c = await waRequest('activeChat', {}, { timeout: 2000 }); } catch { c = null; }
    if (!fl.recentChats) { try { fl.recentChats = await waRequest('recentChats', { limit: 30 }, { timeout: 6000 }); } catch { fl.recentChats = []; } }
    if (c && c.kind === 'individual') {
      if (!(fl.recentChats || []).some((x) => x.id === c.chatId)) fl.recentChats = [{ id: c.chatId, name: c.name || null }, ...(fl.recentChats || [])];
      if (!f.test_chat_id) f.test_chat_id = c.chatId;
    }
    if (fl.edit === f && f.testPick) renderFollows();
  }
  function testPickEl(f) {
    const box = el('div', 'fw-block act-box fw-testpick');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Testar comigo');
    box.append(el('div', 'act-text', 'Ligar EM TESTE: roda só para esta conversa e ignora todos os outros. Para valer para todos depois, use "Ligar para todos".'));
    const opts = [['', 'Escolha a conversa…'], ...(fl.recentChats || []).map((c) => [c.id, `${c.name || c.id.split('@')[0]}`])];
    if (f.test_chat_id && !opts.some(([v]) => v === f.test_chat_id)) opts.push([f.test_chat_id, f.test_chat_id.split('@')[0]]);
    const sel = el('select', 'ed-cat');
    sel.setAttribute('aria-label', 'Conversa de teste');
    opts.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = v === (f.test_chat_id || ''); sel.append(o); });
    sel.addEventListener('change', () => { f.test_chat_id = sel.value; });
    const row = el('div', 'ed-add');
    const go = fbtn('bbtn primary fw-test-go', fl.saving ? 'Ligando…' : 'Ligar em teste', () => saveAutomationForm('test'));
    go.disabled = !!fl.saving;
    row.append(go, fbtn('bbtn', 'Cancelar', () => { f.testPick = false; renderFollows(); }));
    box.append(sel, row);
    return box;
  }

  // ── Limites e horário ──

  function openSettings() {
    const s = motor.state.settings || E.DEFAULT_SETTINGS;
    fl.settingsForm = {
      max_per_hour: s.max_per_hour, max_per_day: s.max_per_day, min_interval_s: s.min_interval_s, max_interval_s: s.max_interval_s,
      business_week: E.weekToJson(E.normSettings(s).week), msg: '', err: false, // 2.14.3: por dia da semana
    };
    fl.view = 'settings';
    renderFollows();
  }

  function renderSettings() {
    const f = fl.settingsForm;
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'HORÁRIO GERAL E LIMITES DE SEGURANÇA'));
    sec.append(el('div', 'crm-intro', 'O horário geral é o padrão das automações (cada automação pode ter o próprio horário na caixa ▶ COMEÇA do construtor) e o horário de disparos e agendados. Os limites por hora/dia e o intervalo valem SEMPRE, para tudo que sai sozinho somado (protegem o número).'));
    const num = (key, label, min, max) => {
      const i = numberInput(f[key], min, max, label);
      i.addEventListener('input', () => { f[key] = Math.floor(Number(i.value) || 0); });
      return schedField(label, i);
    };
    const r1 = el('div', 'sc-row');
    r1.append(num('max_per_hour', 'Máx. por hora', 1, 200), num('max_per_day', 'Máx. por dia', 1, 2000));
    const r2 = el('div', 'sc-row');
    r2.append(num('min_interval_s', 'Intervalo mín. (s)', 10, 3600), num('max_interval_s', 'Intervalo máx. (s)', 10, 3600));
    const wkBox = el('div', 'wk-general');
    const drawWeek = () => {
      wkBox.textContent = '';
      wkBox.append(el('div', 'crm-intro wk-sum', E.weekSummary(E.weekFromJson(f.business_week) || [[], [], [], [], [], [], []])),
        weekTable(f.business_week, (w) => { f.business_week = w; drawWeek(); }, { prefix: 'Geral, ' }));
    };
    drawWeek();
    sec.append(r1, r2, el('div', 'crm-sub', 'Horário de envio (por dia da semana)'), wkBox);
    const actions = el('div', 'ed-add');
    actions.append(fbtn('bbtn primary', 'Salvar', async () => {
      const patch = { ...f };
      delete patch.msg;
      delete patch.err;
      try {
        await motor.saveSettings(patch);
        flash('Horário geral e limites salvos.');
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
      main.append(convLink(el('div', 'sc-who', `${r.contact.name || r.contact.phone || 'Contato'} · ${(r.automation || r.flow).name}`), { chatId: r.contact.chat_id || (r.chat && r.chat.id) || null, phone: r.contact.phone, name: r.contact.name }), el('div', 'sc-prev', t.text));
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
    const mine = automations.filter((a) => a.kind !== 'sequencia' && a.trigger_type !== 'venda_registrada' && E.automationEntry(a, contact));
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
    // 2.16.0: toda régua (sequência) aceita entrar à mão, no começo ou numa etapa ("começar no: Follow 4")
    [...motor.state.automations].filter((a) => (a.kind === 'sequencia' ? a.sequence && a.sequence.start && Array.isArray(a.sequence.steps) : a.trigger_type !== 'venda_registrada')).sort((a, b) => (a.position || 0) - (b.position || 0)).forEach((a) => {
      const o = el('option', null, `${a.name}${a.active ? '' : ' (desligada)'}`);
      o.value = a.id;
      o.selected = a.id === c.pick;
      sel.append(o);
    });
    sel.addEventListener('change', () => { c.pick = sel.value; c.step = ''; renderFollows(); });
    const add = fbtn('bbtn primary fl-add-go', c.busy ? 'Adicionando…' : 'Adicionar', () => enrollOpenChat());
    add.disabled = c.busy || !c.v25;
    row.append(sel);
    sec.append(row);
    const picked = motor.state.automations.find((x) => x.id === c.pick);
    if (picked && picked.kind === 'sequencia') {
      const steps = E.seqSendSteps(E.seqNormalize(picked.sequence));
      const r2 = el('div', 'sc-row');
      const ss = el('select', 'ed-cat fl-add-step');
      ss.setAttribute('aria-label', 'Começar no');
      [['', 'o começo (entra agora)'], ...steps.map((s) => {
        const n = (E.seqIndex(picked.sequence).get(s.node) || {}).node || {};
        return [s.node, `Follow ${s.n} · “${n.item_id ? itemTitle(n.item_id) : 'sem mensagem'}” (dia ${s.day})`];
      })].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = v === (c.step || ''); ss.append(o); });
      ss.addEventListener('change', () => { c.step = ss.value; renderFollows(); });
      r2.append(el('span', null, 'Começar no:'), ss);
      sec.append(r2);
      if (c.step) {
        const st = steps.find((s) => s.node === c.step);
        sec.append(el('div', 'crm-intro', `Entra como se tivesse entrado há ${st ? E.simAtText(st.at).replace(/^\+/, '') : '?'} (o tempo desta etapa): ela sai assim que estiver no horário de envio e as próximas seguem a contagem normal.`));
        const modes = el('div', 'vb-radios fl-add-mode');
        [['agora', 'Enviar esta etapa agora'], ['marcado', 'No horário marcado']].forEach(([v, txt]) => {
          const l = el('label', 'sc-radio');
          const r0 = el('input');
          r0.type = 'radio';
          r0.name = 'fl-add-mode';
          r0.value = v;
          r0.checked = (c.mode || 'agora') === v;
          r0.addEventListener('change', () => { c.mode = v; });
          l.append(r0, ` ${txt}`);
          modes.append(l);
        });
        sec.append(modes);
        // 4. pode estar em várias réguas; entrando por etapa, pergunta (marcado por padrão)
        const lo = el('label', 'sc-radio');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.className = 'fl-add-leave';
        cb.checked = c.leaveOthers !== false;
        cb.addEventListener('change', () => { c.leaveOthers = cb.checked; });
        lo.append(cb, ' Tirar das outras réguas?');
        sec.append(lo);
      }
    }
    const r3 = el('div', 'sc-row');
    r3.append(add);
    sec.append(r3);
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
    // 2.16.0: régua (sequência) que não começa "adicionada por mim", ou numa etapa: o percurso nasce na etapa escolhida
    if (a.kind === 'sequencia' && (c.step || !(a.sequence.start && a.sequence.start.type === 'manual'))) {
      try {
        const plan = E.seqManualPlan(E.seqNormalize(a.sequence), c.step || null, { now: Date.now(), mode: c.mode || 'agora' });
        if (!plan || !plan.node) throw new Error('essa etapa não existe mais');
        const r = await call('seqManualEnter', { automationId: a.id, chatId: open.chatId, plan, leaveOthers: !!c.step && c.leaveOthers !== false });
        const st = c.step ? E.seqSendSteps(E.seqNormalize(a.sequence)).find((s) => s.node === c.step) : null;
        c.msg = `Conversa adicionada a "${a.name}"${st ? ` no Follow ${st.n}${(c.mode || 'agora') === 'agora' ? ' (sai assim que estiver no horário de envio)' : ' (no horário marcado)'}` : ' a partir de agora'}.${r && r.left ? ` Saiu de ${r.left} outra${r.left === 1 ? '' : 's'} régua${r.left === 1 ? '' : 's'}.` : ''}${a.active ? '' : ' A automação está desligada: ligue para rodar.'}`;
        c.err = false;
      } catch (e) {
        c.msg = `Não consegui adicionar: ${e.message}`;
        c.err = true;
      }
      c.busy = false;
      await loadChatAutomations();
      loadChatSequence(open.chatId);
      return;
    }
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
      main.append(convLink(el('div', 'sc-who', r.name || 'Contato'), { chatId: r.chat_id, phone: r.phone, name: r.name }), el('div', 'sc-prev', `${SOURCE_LABEL[r.source] || r.source}${r.reason ? ` · ${r.reason}` : ''}`));
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

  // 2.12.3: o formulário espelha a tela "Nova Venda" do ERP (src/pages/Sales.tsx): data da venda, produtos com
  // custo e preço, acessórios e itens manuais, cliente com CPF/"Colar formulário"/CEP/endereço/fornecedor, várias
  // formas de pagamento, entrega e o resumo financeiro. A origem é automática (anúncio registrado ou orgânico).
  const SALE_SECTIONS = ['produtos', 'cliente', 'pagamento', 'entrega', 'resumo', 'opcoes'];
  async function openSaleForm(opts = {}) {
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
    // automações (para "tirar de todas" depois da venda; carrega se o motor ainda não leu)
    if (!motor.state.automations.length) await motor.loadAutomations();
    // 2.12.4: etiquetas do WhatsApp (lista da barra) e a última escolha do "depois de registrar"
    if (!Array.isArray(state.waLabels)) await refreshBar().catch(() => {});
    const after = saleAfterDefaults(await saleAfterPrefs());
    const prevOpen = vs.form && vs.form.open; // seções abertas/fechadas ficam como estavam
    vs.form = {
      chatId, sale_date: TS.todayInBrazil(),
      customer_name: '', customer_phone: phone || '', customer_cpf: '', cpfDisplay: '', cpfError: '',
      items: [], accessories: [], manual: [], search: '',
      address_street: '', address_number: '', address_complement: '', city: '', neighborhood: '', state: '', zip_code: '', cepError: '', cepLoading: false,
      supplier_name: '', item_suppliers: {},
      payments: [TS.initialPayment()], payment_status: 'a_cobrar',
      delivery_type: 'motoboy', motoboy_id: '', delivery_fee: TS.DEFAULT_DELIVERY_FEE, delivery_cost: 0, delivery_notes: '',
      ad: null, map: null, addressHint: null, pasteOpen: false,
      after, // 2.12.4: { leaveAll, waAdd, waRemove, crmAdd }
      dupAsk: false,
      open: prevOpen || Object.fromEntries(SALE_SECTIONS.map((k) => [k, true])),
      // 2.10.5: aberta pelo 📈 (nenhuma venda parecida): valor da compra e a compra para ligar depois
      targetValue: Number(opts && opts.value) > 0 ? Math.round(Number(opts.value) * 100) / 100 : null, linkEventId: (opts && opts.linkEventId) || null,
    };
    const f = vs.form;
    adoptChat(chat, 'vs');
    if (!vs.catalog) await loadSaleCatalog();
    if (vs.form !== f) return; // trocou de conversa no meio: descarta
    renderVendas();
    if (chatId) {
      try {
        const info = await waRequest('chatSaleInfo', { chatId }, { timeout: 4000 });
        if (vs.form === f && info && info.ad) f.ad = info.ad;
        if (vs.form === f && info) f.saleInfo = info;
      } catch { /* sem anúncio nas mensagens carregadas */ }
      // anúncio registrado da conversa (wa_ad_attribution): a origem fica "anúncio" sozinha
      try {
        const r = await call('getAdAttribution', { chatId });
        if (vs.form === f && r && r.row) f.ad = { title: r.row.ad_title || (f.ad && f.ad.title) || null, platform: r.row.source_app || (f.ad && f.ad.platform) || null, url: r.row.source_url || (f.ad && f.ad.url) || null, registered: true };
      } catch { /* sem a tabela */ }
      // 2.6.0/2.6.3: telefone verdadeiro desta conversa (@lid pelo WhatsApp); nome: o aprendido/salvo desta
      // conversa (2.8.3) ou o do WhatsApp
      const [pn, learned] = await Promise.all([chatPhoneName(chatId), loadChatName(chatId).catch(() => null)]);
      if (vs.form === f) {
        if (!f.customer_phone && pn.phone) f.customer_phone = pn.phone;
        // 2.15.1: nome completo: o da última venda com o mesmo telefone → agenda/perfil limpo → o aprendido
        let saleName = null;
        try { const r = await call('lastSaleCustomerName', { chatId, phone: f.customer_phone }); saleName = r && r.name; } catch { saleName = null; }
        if (vs.form === f) {
          const pick = TS.customerNameChoice({ saleName, contactName: pn.contactName, pushname: pn.pushname, learned: learned && learned.name, fallback: pn.name });
          f.nameOptions = pick.options;
          if (!f.customer_name) f.customer_name = pick.value;
          f.phoneChecked = true;
        }
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
    return { phone, name, contactName: (wa && wa.contactName) || '', pushname: (wa && wa.pushname) || '' };
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

  // Itens no formato das contas (sale-calc.js = calculateTotals do ERP)
  function saleCalcInput(f) {
    const cat = vs.catalog || {};
    const items = f.items.map((it) => { const p = (cat.products || []).find((x) => x.id === it.product_id) || {}; return { ...it, category: p.category }; });
    return { items, accessories: f.accessories, manualItems: f.manual, payments: f.payments };
  }
  function saleTotals(f) {
    const cat = vs.catalog || {};
    const x = saleCalcInput(f);
    return TS.computeTotals({ ...x, delivery_type: f.delivery_type, delivery_fee: Number(f.delivery_fee) || 0, delivery_cost: Number(f.delivery_cost) || 0, cfg: cat.fees || {}, saleDate: f.sale_date });
  }

  const inputField = (label, value, onInput, { type = 'text', max = 200, aria, list, need = false, placeholder } = {}) => {
    const i = el('input', `ed-title${need ? ' need' : ''}`);
    i.type = type;
    i.maxLength = max;
    i.value = value;
    i.setAttribute('aria-label', aria || label);
    if (placeholder) i.placeholder = placeholder;
    if (list) i.setAttribute('list', list);
    i.addEventListener('input', () => onInput(i.value, i));
    return schedField(label, i);
  };
  // R$ com centavos (type=number, step 0.01, mínimo 0), como os campos do ERP
  function moneyInput(value, aria, onInput, { placeholder } = {}) {
    const i = el('input', 'ed-title');
    i.type = 'number';
    i.step = '0.01';
    i.min = '0';
    i.value = value === '' || value == null ? '' : String(value);
    if (placeholder) i.placeholder = placeholder;
    i.setAttribute('aria-label', aria);
    i.addEventListener('input', () => onInput(i.value === '' ? 0 : Math.max(0, Number(i.value) || 0)));
    return i;
  }

  const lcWaSel = (sel) => { sel.dataset.lcKind = 'wa'; return withLabelCreate(sel, { kinds: ['wa'] }); }; // 2.13.4
  function selectOf(options, value, aria, onChange) {
    const sel = el('select', 'ed-cat');
    sel.setAttribute('aria-label', aria);
    options.forEach(([k, t]) => { const o = el('option', null, t); o.value = k; o.selected = String(k) === String(value); sel.append(o); });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  // Seção recolhível do formulário (o estado fica no formulário enquanto ele estiver aberto)
  function saleSection(f, key, title, summary, build) {
    const sec = el('div', `vd-sec${f.open[key] ? '' : ' vd-closed'}`);
    sec.dataset.vdSec = key;
    const head = el('button', 'vd-sec-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', f.open[key] ? 'true' : 'false');
    head.append(el('span', 'vd-sec-arrow', f.open[key] ? '▾' : '▸'), el('span', 'vd-sec-title', title));
    const sum = el('span', 'vd-sec-sum', summary || '');
    head.append(sum);
    head.addEventListener('click', () => { f.open[key] = !f.open[key]; renderVendas(); });
    sec.append(head);
    if (f.open[key]) {
      const body = el('div', 'vd-sec-body');
      build(body, sum);
      sec.append(body);
    }
    return sec;
  }

  const productLabelErp = (p) => `${p.model}${p.color ? ` - ${p.color}` : ''}`;
  const pctLabel = (cat, f, method, brand, n) => TS.feeLabel(cat.fees || {}, method, brand, n, f.sale_date);

  function renderSaleForm() {
    const f = vs.form;
    const cat = vs.catalog || {};
    const root = el('section', 'crmsec vd-form');
    root.append(el('div', 'wt-head', 'NOVA VENDA DESTA CONVERSA'));
    if (!f.chatId) root.append(el('div', 'ed-note', 'Abra uma conversa individual no WhatsApp.'));
    if (f.targetValue) root.append(el('div', 'ed-note cv-target', `Valor da compra no 📈: ${TS.money(f.targetValue)}. O 1º produto entra com esse valor; ao registrar, a venda fica ligada à compra.`));
    if (cat.error) root.append(el('div', 'ed-msg err', `Não consegui carregar os dados do ERP: ${cat.error}`));

    // Contas ao vivo: os pedaços que mudam sem redesenhar tudo (para não perder o cursor)
    const live = [];
    const refresh = () => { const t = saleTotals(f); live.forEach((fn) => fn(t)); };

    // Data da venda
    const dr = el('div', 'sc-row vd-date');
    const d = el('input', 'ed-title');
    d.type = 'date';
    d.value = f.sale_date;
    d.setAttribute('aria-label', 'Data da venda');
    d.addEventListener('change', () => { f.sale_date = /^\d{4}-\d{2}-\d{2}$/.test(d.value) ? d.value : TS.todayInBrazil(); refresh(); });
    dr.append(schedField('Data da venda', d));
    root.append(dr);

    // ── Produtos ──
    const nItems = f.items.length + f.accessories.length + f.manual.length;
    root.append(saleSection(f, 'produtos', 'Produtos', nItems ? `${nItems} ite${nItems === 1 ? 'm' : 'ns'}` : 'nenhum item', (body, sum) => {
      const search = el('input', 'ed-title vd-search');
      search.value = f.search;
      search.placeholder = 'Digite modelo, cor ou nome do acessório...';
      search.setAttribute('aria-label', 'Buscar produto, acessório ou item manual');
      const results = el('div', 'vd-results');
      // 2.12.7: busca por pedaços de palavras (product-search.js, a mesma da Nova Venda do ERP): "pul ros go 38" acha
      // "Pulseira Aço Milanese - Rose Gold 38/41mm"; produto pelo "modelo - cor", acessório pelo nome. Enter adiciona
      // o marcado (o 1º; ↑↓ trocam), limpa a busca e o cursor volta para ela.
      const added = () => { f.search = ''; f.searchFocus = true; renderVendas(); };
      let sel = 0;
      const mark = () => [...results.querySelectorAll('button')].forEach((b, i) => { b.classList.toggle('vd-sel', i === sel); b.setAttribute('aria-selected', i === sel ? 'true' : 'false'); });
      const labelled = (cls, prefix, label, ranges, suffix, onClick) => {
        const b = fbtn(cls, prefix, onClick);
        globalThis.TspSearch.highlightParts(label, ranges).forEach((part) => b.append(part.bold ? el('b', 'vd-hit', part.text) : document.createTextNode(part.text)));
        if (suffix) b.append(document.createTextNode(suffix));
        return b;
      };
      const showResults = () => {
        results.textContent = '';
        sel = 0;
        if (!f.search.trim()) return;
        const cands = [
          ...(cat.products || []).map((p) => ({ kind: 'p', label: productLabelErp(p), createdAt: p.created_at, row: p })),
          ...(cat.accessories || []).map((a) => ({ kind: 'a', label: String(a.name || ''), createdAt: a.created_at, row: a })),
        ];
        const hits = globalThis.TspSearch ? globalThis.TspSearch.searchItems(cands, f.search, { limit: 12 }) : [];
        hits.forEach(({ item, ranges }) => {
          if (item.kind === 'p') {
            const p = item.row;
            results.append(labelled('vd-prod', '', item.label, ranges, ` · estoque ${p.current_stock} · ${TS.money(p.price)}`, () => {
              const ex = f.items.find((x) => x.product_id === p.id);
              if (ex) ex.quantity += 1;
              // 2.10.5: 1º produto com o valor da compra do 📈
              else f.items.push({ product_id: p.id, quantity: 1, unit_price: f.targetValue && !f.items.length ? f.targetValue : Number(p.price) || 0, unit_cost: Number(p.cost) || 0 });
              added();
            }));
          } else {
            const a = item.row;
            results.append(labelled('vd-prod vd-acc', 'Acessório: ', item.label, ranges, ` · custo ${TS.money(a.cost)}`, () => {
              const ex = f.accessories.find((x) => x.accessory_id === a.id);
              if (ex) ex.quantity += 1; else f.accessories.push({ accessory_id: a.id, quantity: 1, cost: Number(a.cost) || 0 });
              added();
            }));
          }
        });
        if (!hits.length) {
          results.append(fbtn('vd-prod vd-manual', `Adicionar manualmente: "${f.search.trim()}"`, () => {
            f.manual.push({ name: f.search.trim().slice(0, 100), price: 0, cost: 0, quantity: 1 });
            added();
          }));
        }
        mark();
      };
      search.addEventListener('input', () => { f.search = search.value; showResults(); });
      search.addEventListener('keydown', (e) => {
        const btns = [...results.querySelectorAll('button')];
        if (!btns.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
          mark();
          btns[sel].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') { e.preventDefault(); (btns[sel] || btns[0]).click(); }
      });
      body.append(search, results);
      showResults();
      if (f.searchFocus) { f.searchFocus = false; setTimeout(() => { if (search.isConnected) search.focus(); }, 0); }

      const subtotal = (n) => el('div', 'vd-sub', TS.money(n));
      // Produtos selecionados: Qtd · Custo (R$) · Preço venda (R$) · subtotal
      f.items.forEach((it, i) => {
        const p = (cat.products || []).find((x) => x.id === it.product_id) || { model: 'produto' };
        const row = el('div', 'fw-variant vd-item');
        row.dataset.vdItem = String(i);
        const top = el('div', 'vd-item-top');
        top.append(el('div', 'sc-who', productLabelErp(p)), el('span', 'vd-stock', p.current_stock != null ? `Estoque: ${p.current_stock}` : ''));
        const st = subtotal(it.unit_price * it.quantity);
        const r = el('div', 'sc-row');
        const q = numberInput(it.quantity, 1, Math.max(Number(p.current_stock) || 0, it.quantity, 999), `Qtd do produto ${i + 1}`);
        q.addEventListener('input', () => { it.quantity = Math.max(1, Math.floor(Number(q.value) || 1)); st.textContent = TS.money(it.unit_price * it.quantity); refresh(); });
        const c = moneyInput(it.unit_cost, `Custo do produto ${i + 1}`, (v) => { it.unit_cost = v; refresh(); });
        const pr = moneyInput(it.unit_price, `Preço venda do produto ${i + 1}`, (v) => { it.unit_price = v; st.textContent = TS.money(it.unit_price * it.quantity); refresh(); });
        r.append(schedField('Qtd', q), schedField('Custo (R$)', c), schedField('Preço venda (R$)', pr));
        const end = el('div', 'vd-item-end');
        end.append(st, fbtn('ed-mini', '✕', () => { f.items.splice(i, 1); delete f.item_suppliers[it.product_id]; renderVendas(); }));
        row.append(top, r, end);
        body.append(row);
      });
      if (f.accessories.length) body.append(el('div', 'crm-sub', 'Acessórios'));
      f.accessories.forEach((a, i) => {
        const x = (cat.accessories || []).find((y) => y.id === a.accessory_id) || { name: 'acessório' };
        const row = el('div', 'fw-variant vd-item');
        const st = subtotal(a.cost * a.quantity);
        const r = el('div', 'sc-row');
        const q = numberInput(a.quantity, 1, 999, `Qtd do acessório ${i + 1}`);
        q.addEventListener('input', () => { a.quantity = Math.max(1, Math.floor(Number(q.value) || 1)); st.textContent = TS.money(a.cost * a.quantity); refresh(); });
        const c = moneyInput(a.cost, `Custo do acessório ${i + 1}`, (v) => { a.cost = v; st.textContent = TS.money(a.cost * a.quantity); refresh(); });
        r.append(schedField('Qtd', q), schedField('Custo (R$)', c));
        const end = el('div', 'vd-item-end');
        end.append(st, fbtn('ed-mini', '✕', () => { f.accessories.splice(i, 1); renderVendas(); }));
        row.append(el('div', 'sc-who', x.name), r, end);
        body.append(row);
      });
      if (f.manual.length) body.append(el('div', 'crm-sub', 'Itens manuais'));
      f.manual.forEach((m, i) => {
        const row = el('div', 'fw-variant vd-item vd-manual-item');
        const st = subtotal(m.price * m.quantity);
        const r = el('div', 'sc-row');
        const q = numberInput(m.quantity, 1, 999, `Qtd do item manual ${i + 1}`);
        q.addEventListener('input', () => { m.quantity = Math.max(1, Math.floor(Number(q.value) || 1)); st.textContent = TS.money(m.price * m.quantity); refresh(); });
        const c = moneyInput(m.cost, `Custo do item manual ${i + 1}`, (v) => { m.cost = v; refresh(); });
        const pr = moneyInput(m.price, `Preço venda do item manual ${i + 1}`, (v) => { m.price = v; st.textContent = TS.money(m.price * m.quantity); refresh(); });
        r.append(schedField('Qtd', q), schedField('Custo (R$)', c), schedField('Preço venda (R$)', pr));
        const end = el('div', 'vd-item-end');
        end.append(st, fbtn('ed-mini', '✕', () => { f.manual.splice(i, 1); renderVendas(); }));
        const top = el('div', 'vd-item-top');
        top.append(el('div', 'sc-who', m.name), el('span', 'vd-stock', 'Item personalizado'));
        row.append(top, r, end);
        body.append(row);
      });
      live.push((t) => { sum.textContent = nItems ? `${nItems} ite${nItems === 1 ? 'm' : 'ns'} · ${TS.money(t.totalSalePrice)}` : 'nenhum item'; });
    }));

    // ── Cliente ──
    root.append(saleSection(f, 'cliente', 'Cliente', [f.customer_name, f.city].filter(Boolean).join(' · '), (body) => {
      const g = el('div', 'vd-grid2');
      g.append(inputField('Nome do cliente', f.customer_name, (v) => { f.customer_name = v; }, { max: 100, need: !!f.triedSubmit && !f.customer_name.trim() }),
        inputField('Telefone', f.customer_phone, (v) => { f.customer_phone = v; }, { max: 30, aria: 'Telefone do cliente', need: !!f.phoneChecked && !f.customer_phone, placeholder: 'Telefone (opcional)' }));
      const cpf = inputField('CPF (opcional)', f.cpfDisplay, (v, i) => {
        f.cpfDisplay = TS.formatCpf(v);
        f.customer_cpf = TS.cleanCpf(v).slice(0, 11);
        if (i.value !== f.cpfDisplay) i.value = f.cpfDisplay;
        f.cpfError = f.customer_cpf.length === 11 && !TS.validateCpf(f.customer_cpf) ? 'CPF inválido' : '';
        cpfErr.textContent = f.cpfError;
        i.classList.toggle('need', !!f.cpfError);
      }, { max: 14, aria: 'CPF do cliente', need: !!f.cpfError });
      const cpfErr = el('div', 'ed-msg err vd-cpf-err', f.cpfError);
      cpf.append(cpfErr);
      g.append(cpf);
      body.append(g);
      // 2.15.1: os nomes encontrados (conversa, agenda/perfil, venda anterior): troca com um clique
      if (Array.isArray(f.nameOptions) && f.nameOptions.length > 1) {
        const SRC = { conversa: 'nome da conversa', agenda: 'nome salvo na agenda', perfil: 'nome do perfil do WhatsApp', venda: 'nome da última venda', whatsapp: 'nome do WhatsApp' };
        const opts = el('div', 'vd-name-opts');
        opts.setAttribute('aria-label', 'Outros nomes encontrados');
        f.nameOptions.forEach((o, ix) => {
          if (ix) opts.append(el('span', 'vd-name-sep', '·'));
          const b = el('button', `chip vd-name-opt${o.name === f.customer_name ? ' active' : ''}`, o.name);
          b.type = 'button';
          b.title = `Usar o ${SRC[o.source] || 'nome'}`;
          b.addEventListener('click', () => { f.customer_name = o.name; renderVendas(); });
          opts.append(b);
        });
        body.append(opts);
      }
      // "📋 Colar formulário" (mesma leitura do ERP) e o endereço da conversa
      const tools = el('div', 'ed-add');
      tools.append(fbtn('ed-mini vd-paste-btn', '📋 Colar formulário', () => { f.pasteOpen = !f.pasteOpen; renderVendas(); if (f.pasteOpen) { const t = vtabEl.querySelector('.vd-paste'); if (t) t.focus(); } }),
        fbtn('ed-mini vd-pick-addr', 'Pegar endereço da conversa', () => pickAddressFromChat()));
      body.append(tools);
      if (f.pasteOpen) {
        const ta = el('textarea', 'ed-text vd-paste');
        ta.rows = 5;
        ta.placeholder = 'Cole o texto do formulário aqui e os campos serão preenchidos automaticamente...';
        ta.setAttribute('aria-label', 'Colar formulário do cliente');
        ta.addEventListener('paste', (e) => {
          e.preventDefault();
          const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
          applyPastedForm(text);
        });
        body.append(ta);
      }
      if (f.map) body.append(el('div', 'fw-test', `Localização: ${f.map.name || 'sem nome'} · ${f.map.url}`));
      if (f.addressHint) {
        const hint = el('div', 'fw-test');
        hint.append(el('div', null, `O cliente escreveu: "${f.addressHint}"`), fbtn('ed-mini', 'Usar como rua', () => { f.address_street = f.addressHint.slice(0, 200); f.addressHint = null; renderVendas(); }));
        body.append(hint);
      }
      const motoboy = f.delivery_type === 'motoboy';
      const g2 = el('div', 'vd-grid2');
      const cep = inputField(`CEP${f.delivery_type === 'loja_fisica' ? ' (opcional)' : ''}${f.cepLoading ? ' · buscando…' : ''}`, f.zip_code, (v, i) => {
        const clean = v.replace(/\D/g, '').slice(0, 8);
        if (i.value !== clean) i.value = clean;
        f.zip_code = clean;
        f.cepError = '';
        if (clean.length === 8) lookupSaleCep(clean);
      }, { max: 9, aria: 'CEP' });
      if (f.cepError) cep.append(el('div', 'ed-msg err', f.cepError));
      g2.append(cep, inputField('Estado (UF)', f.state, (v, i) => { f.state = v.toUpperCase().slice(0, 2); if (i.value !== f.state) i.value = f.state; }, { max: 2, aria: 'Estado (UF)' }));
      body.append(g2);
      const g3 = el('div', 'vd-grid2');
      g3.append(inputField(motoboy ? 'Rua (opcional)' : 'Rua', f.address_street, (v) => { f.address_street = v; }, { aria: 'Rua' }),
        inputField('Número', f.address_number, (v) => { f.address_number = v; }, { max: 30, aria: 'Número' }));
      body.append(g3);
      body.append(inputField('Complemento (opcional)', f.address_complement, (v) => { f.address_complement = v; }, { max: motoboy ? 200 : 18, aria: 'Complemento' }));
      const dl = (id, list) => { const x = el('datalist'); x.id = id; list.forEach((it) => { const o = el('option'); o.value = it.name; x.append(o); }); return x; };
      body.append(dl('vd-cities', cat.cities || []), dl('vd-neigh', cat.neighborhoods || []), dl('vd-suppliers', cat.suppliers || []));
      const req = f.delivery_type === 'correios' || motoboy;
      const g4 = el('div', 'vd-grid2');
      g4.append(inputField(req ? 'Cidade*' : 'Cidade', f.city, (v) => { f.city = v; }, { max: 80, list: 'vd-cities', aria: 'Cidade', need: !!f.triedSubmit && req && !f.city.trim() }),
        inputField(req ? 'Bairro*' : 'Bairro', f.neighborhood, (v) => { f.neighborhood = v; }, { max: 80, list: 'vd-neigh', aria: 'Bairro', need: !!f.triedSubmit && req && !f.neighborhood.trim() }));
      body.append(g4);
      // Fornecedor: um por smartwatch quando há 2 ou mais (como o ERP); senão um só (cria pelo nome se não existir)
      const sw = TS.smartwatchItems(saleCalcInput(f).items);
      if (sw.length >= 2) {
        body.append(el('div', 'crm-sub', 'Fornecedor por smartwatch'));
        sw.forEach((it) => {
          const p = (cat.products || []).find((x) => x.id === it.product_id) || { model: 'produto' };
          const r = el('div', 'sc-row vd-supplier-row');
          r.append(el('span', 'sc-who', productLabelErp(p)), selectOf([['', 'Selecionar fornecedor'], ...(cat.suppliers || []).map((s) => [s.id, s.name])], f.item_suppliers[it.product_id] || '', `Fornecedor de ${productLabelErp(p)}`, (v) => { f.item_suppliers[it.product_id] = v; }));
          body.append(r);
        });
      } else {
        body.append(inputField('Fornecedor', f.supplier_name, (v) => { f.supplier_name = v; }, { max: 100, list: 'vd-suppliers', aria: 'Fornecedor', placeholder: 'Selecionar fornecedor' }));
      }
    }));

    // ── Pagamento ──
    root.append(saleSection(f, 'pagamento', 'Pagamento', `${f.payments.length} forma${f.payments.length === 1 ? '' : 's'} · ${f.payment_status === 'pago' ? 'Pago' : 'A cobrar'}`, (body) => {
      f.payments.forEach((pm, i) => {
        const box = el('div', 'fw-variant vd-pay');
        box.dataset.vdPay = String(i);
        const r1 = el('div', 'sc-row');
        r1.append(selectOf(TS.PAYMENT_METHODS, pm.method, `Forma de pagamento ${i + 1}`, (v) => {
          f.payments[i] = TS.updatePayment(pm, 'method', v);
          renderVendas();
        }));
        if (pm.method !== 'outros') r1.append(moneyInput(pm.amount || '', `Valor da forma ${i + 1} (R$)`, (v) => { pm.amount = v; refresh(); }, { placeholder: 'Valor (R$)' }));
        if (f.payments.length > 1) r1.append(fbtn('ed-mini', '✕', () => { f.payments.splice(i, 1); renderVendas(); }));
        box.append(r1);
        if (TS.CARD_METHODS.includes(pm.method)) {
          const r2 = el('div', 'sc-row');
          r2.append(selectOf([['', 'Bandeira (definir depois)'], ...TS.CARD_BRANDS], pm.card_brand, `Bandeira da forma ${i + 1}`, (v) => { f.payments[i] = TS.updatePayment(pm, 'card_brand', v); renderVendas(); }));
          if (TS.INSTALLMENT_METHODS.includes(pm.method)) {
            r2.append(selectOf([['0', 'Parcelas (definir depois)'], ...(pm.card_brand ? Array.from({ length: 12 }, (_, k) => [String(k + 1), `${k + 1}x (${pctLabel(cat, f, pm.method, pm.card_brand, k + 1)})`]) : [])], String(pm.installments), `Parcelas da forma ${i + 1}`, (v) => { f.payments[i] = TS.updatePayment(pm, 'installments', Number(v) || 0); renderVendas(); }));
          }
          box.append(r2);
        }
        if (pm.method === 'outros') {
          const r3 = el('div', 'sc-row');
          r3.append(schedField('Valor Bruto (R$)', moneyInput(pm.amount || '', `Valor bruto da forma ${i + 1}`, (v) => { pm.amount = v; refresh(); }, { placeholder: 'Valor Bruto (R$)' })),
            schedField('Valor Líquido (R$)', moneyInput(pm.net_amount || '', `Valor líquido da forma ${i + 1}`, (v) => { pm.net_amount = v; refresh(); }, { placeholder: 'Valor Líquido (R$)' })));
          box.append(r3);
        }
        const fee = el('div', 'vd-fee');
        box.append(fee);
        live.push(() => {
          if (TS.CARD_METHODS.includes(pm.method) && pm.amount > 0 && pm.card_brand) {
            const v = TS.paymentFee(cat.fees || {}, pm, pm.amount, f.sale_date);
            fee.textContent = `Taxa: R$ ${v.toFixed(2)} (${pctLabel(cat, f, pm.method, pm.card_brand, pm.installments)})`;
          } else if (pm.method === 'outros' && pm.amount > 0 && (pm.net_amount || 0) > 0) {
            fee.textContent = `Taxa: R$ ${(pm.amount - (pm.net_amount || 0)).toFixed(2)} (${(((pm.amount - (pm.net_amount || 0)) / pm.amount) * 100).toFixed(2)}%)`;
          } else fee.textContent = '';
        });
        body.append(box);
      });
      body.append(fbtn('ed-mini vd-add-pay', '+ Adicionar forma de pagamento', () => { f.payments.push(TS.newPaymentEntry()); renderVendas(); }));
      const st = el('div', 'sc-row vd-paystatus');
      [['pago', 'Pago'], ['a_cobrar', 'A cobrar']].forEach(([k, t]) => {
        const b = fbtn(`ed-mini vd-ps${f.payment_status === k ? ' on' : ''}`, t, () => { f.payment_status = k; renderVendas(); });
        b.setAttribute('aria-pressed', f.payment_status === k ? 'true' : 'false');
        b.dataset.ps = k;
        st.append(b);
      });
      body.append(schedField('Status do pagamento', st));
      const alloc = el('div', 'vd-alloc');
      body.append(alloc);
      live.push((t) => {
        const a = TS.allocation(f.payments, t.totalSalePrice);
        alloc.textContent = '';
        const cls = (x) => (!a.hasAmounts ? '' : a.balanced ? ' ok' : x);
        [['Total da venda', `R$ ${t.totalSalePrice.toFixed(2)}`, ''], ['Alocado', `R$ ${a.allocated.toFixed(2)}`, cls(' warn')], ['Falta alocar', `R$ ${(a.balanced ? 0 : a.remaining).toFixed(2)}`, cls(a.remaining > 0 ? ' warn' : ' bad')]].forEach(([l, v, c]) => {
          const cell = el('div', `vd-alloc-c${c}`);
          cell.append(el('div', 'vd-alloc-l', l), el('div', 'vd-alloc-v', v));
          alloc.append(cell);
        });
      });
    }));

    // ── Entrega ──
    const dlabel = (TS.DELIVERY_TYPES.find(([k]) => k === f.delivery_type) || [null, ''])[1];
    root.append(saleSection(f, 'entrega', 'Entrega', dlabel, (body) => {
      const r = el('div', 'vd-grid2');
      r.append(schedField('Tipo de entrega', selectOf(TS.DELIVERY_TYPES, f.delivery_type, 'Tipo de entrega', (v) => { Object.assign(f, TS.deliveryChange(v)); renderVendas(); })));
      if (f.delivery_type === 'motoboy') {
        r.append(schedField('Motoboy', selectOf([['', 'Selecionar Motoboy'], ...(cat.motoboys || []).map((m) => [m.id, m.name])], f.motoboy_id, 'Motoboy', (v) => { f.motoboy_id = v; })));
        r.append(schedField('Taxa de entrega (R$)', moneyInput(f.delivery_fee, 'Taxa de entrega (R$)', (v) => { f.delivery_fee = v; refresh(); })));
      }
      if (f.delivery_type === 'correios') r.append(schedField('Custo Correios (R$)', moneyInput(f.delivery_cost, 'Custo Correios (R$)', (v) => { f.delivery_cost = v; refresh(); })));
      body.append(r);
      body.append(inputField('Observações', f.delivery_notes, (v) => { f.delivery_notes = v; }, { max: 200, aria: 'Observações da entrega', placeholder: '📝 Ex.: Deixar na portaria, Entregar para Bernardo' }));
      const vol = el('div', 'crm-intro vd-volumes');
      body.append(vol);
      live.push(() => { vol.textContent = `Volumes: ${TS.volumesOf(saleCalcInput(f).items)} (calculado automaticamente)${f.delivery_type === 'correios' ? ' · Envio padrão: Envelope até 300g | Seguro: R$150' : ''}`; });
    }));

    // ── Resumo financeiro (igual ao do ERP) ──
    root.append(saleSection(f, 'resumo', 'Resumo financeiro', '', (body, sum) => {
      const grid = el('div', 'vd-fin');
      const cell = (label, cls) => { const c = el('div', `vd-fin-c${cls ? ` ${cls}` : ''}`); const v = el('div', 'vd-fin-v'); c.append(el('div', 'vd-fin-l', label), v); grid.append(c); return v; };
      const vTotal = cell('Valor total');
      const vFee = cell('Taxa do cartão', 'bad');
      const vNet = cell('Valor recebido', 'net');
      const vProfit = cell('Lucro final', 'profit');
      const det = el('div', 'vd-fin-det');
      body.append(grid, el('div', 'vd-fin-h', 'Detalhamento de custos'), det);
      live.push((t) => {
        vTotal.textContent = `R$ ${t.totalSalePrice.toFixed(2)}`;
        vFee.textContent = `- R$ ${t.cardFee.toFixed(2)}`;
        vNet.textContent = `R$ ${t.netReceived.toFixed(2)}`;
        vProfit.textContent = `R$ ${t.profit.toFixed(2)}`;
        vProfit.parentElement.classList.toggle('neg', t.profit < 0);
        det.textContent = '';
        [['Custo produtos', t.totalProductCost], ['Custo acessórios', t.totalAccessoryCost], ...(t.totalManualCost > 0 ? [['Custo itens manuais', t.totalManualCost]] : []), ['Taxa motoboy', t.deliveryFee], ['Custo Correios', t.deliveryCost]].forEach(([l, v]) => {
          const line = el('div', 'vd-fin-line');
          line.append(el('span', null, l), el('b', null, `R$ ${v.toFixed(2)}`));
          det.append(line);
        });
        sum.textContent = `lucro R$ ${t.profit.toFixed(2)}`;
      });
    }));

    // ── Conversa (extras do chat) ──
    root.append(saleSection(f, 'opcoes', 'Conversa', f.ad ? 'origem: anúncio' : 'origem: orgânico', (body) => {
      const o = el('div', 'fw-test vd-origin');
      o.append(el('div', null, f.ad ? `Origem: anúncio${f.ad.title ? ` · ${f.ad.title}` : ''}${f.ad.platform ? ` · ${f.ad.platform}` : ''} (automática)` : 'Origem: orgânico (automática: a conversa não tem anúncio registrado)'));
      if (f.ad && f.ad.url) {
        const a = el('a', null, 'abrir anúncio');
        a.href = f.ad.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        o.append(a);
      }
      if (cat.originAvailable === false) o.append(el('div', 'ed-note', 'Origem e conversa da venda: atualize o banco para guardar (a venda é registrada mesmo assim).'));
      body.append(o);
      // 2.12.4: o que fazer DEPOIS que a venda for gravada (a última escolha fica lembrada neste computador)
      const a = f.after;
      const keep = () => { saveSaleAfterPrefs(a); };
      body.append(el('div', 'crm-sub', 'Ao registrar a venda'));
      const ml = el('label', 'sc-radio vd-after-leave');
      const mc = el('input');
      mc.type = 'checkbox';
      mc.checked = a.leaveAll;
      mc.setAttribute('aria-label', 'Tirar de todas as automações e sequências');
      mc.addEventListener('change', () => { a.leaveAll = mc.checked; keep(); });
      ml.append(mc, 'Tirar de todas as automações e sequências');
      body.append(ml);
      const wa = Array.isArray(state.waLabels) ? state.waLabels : null;
      if (wa) {
        const g = el('div', 'vd-grid2');
        g.append(schedField('Etiqueta do WhatsApp ao registrar', lcWaSel(selectOf([['', 'Nenhuma'], ...wa.map((l) => [l.id, l.name])], a.waAdd, 'Etiqueta do WhatsApp ao registrar', (v) => { a.waAdd = v; keep(); }))),
          schedField('Tirar das etiquetas do WhatsApp', lcWaSel(selectOf([['', 'Nenhuma'], [SALE_WA_ALL, 'Todas (menos a que vai colocar)'], ...wa.filter((l) => !isNoSendWa(l)).map((l) => [l.id, l.name])], a.waRemove, 'Tirar das etiquetas do WhatsApp', (v) => { a.waRemove = v; keep(); }))));
        body.append(g);
      } else body.append(el('div', 'ed-note', 'Etiquetas do WhatsApp indisponíveis agora (o WhatsApp ainda não respondeu): nada será mexido nelas.'));
      body.append(schedField('Etiqueta CRM ao registrar', withLabelCreate(selectOf([['', 'Não mexe'], ...state.labels.map((l) => [l.id, l.name])], a.crmAdd, 'Etiqueta CRM ao registrar', (v) => { a.crmAdd = v; keep(); }))));
      body.append(el('div', 'ed-varhint', 'A etiqueta "Não enviar" nunca é retirada. Nada disso é feito se a venda não for gravada.'));
    }));

    if (f.dupAsk) {
      const dup = el('div', 'fw-test');
      dup.append(el('div', 'ed-note', 'Já existe uma venda desta conversa hoje. Registrar outra?'), fbtn('bbtn primary', 'Registrar outra', () => registerSale(true)), fbtn('bbtn', 'Cancelar', () => { f.dupAsk = false; renderVendas(); }));
      root.append(dup);
    }
    const actions = el('div', 'ed-add vd-actions');
    const go = fbtn('bbtn primary vd-register', vs.busy ? 'Registrando…' : 'Registrar venda', () => registerSale(false));
    go.disabled = vs.busy || !f.chatId || (!f.items.length && !f.manual.length);
    actions.append(go, fbtn('bbtn vd-courier', 'Gerar mensagem do entregador', () => openCourier()), fbtn('bbtn', 'Cancelar', () => { vs.view = 'list'; loadChatSales(); }));
    root.append(actions, el('div', `ed-msg vd-msg${vs.err ? ' err' : ''}`, vs.msg));
    vtabEl.append(root);
    refresh();
  }

  // "📋 Colar formulário": a leitura do ERP (parsearFormulario) e, com CEP, o endereço do CEP
  function applyPastedForm(text) {
    const f = vs.form;
    if (!f) return;
    const up = TS.parseForm(text);
    Object.assign(f, up);
    if (up.customer_cpf != null) {
      f.cpfDisplay = TS.formatCpf(up.customer_cpf);
      f.cpfError = up.customer_cpf.length === 11 && !TS.validateCpf(up.customer_cpf) ? 'CPF inválido' : '';
    }
    f.pasteOpen = false;
    renderVendas();
    if (up.zip_code) lookupSaleCep(up.zip_code.replace(/\D/g, ''));
  }

  // handleCepChange do ERP: 8 dígitos → ViaCEP (pelo background) → rua, UF, cidade e bairro
  async function lookupSaleCep(cep) {
    const f = vs.form;
    if (!f || cep.length !== 8) return;
    f.cepLoading = true;
    f.cepError = '';
    let addr = null;
    try { addr = await call('lookupCep', { cep }); } catch { addr = null; }
    if (vs.form !== f) return;
    f.cepLoading = false;
    if (addr) Object.assign(f, TS.applyCep(f, addr));
    else f.cepError = 'CEP inválido';
    renderVendas();
    if (addr) { const n = vtabEl.querySelector('input[aria-label="Número"]'); if (n) n.focus(); }
  }

  async function pickAddressFromChat() {
    const f = vs.form;
    if (!f.chatId) return;
    let info = null;
    try { info = await waRequest('chatSaleInfo', { chatId: f.chatId }, { timeout: 4000 }); } catch { info = null; }
    if (!info) { vs.msg = 'Não consegui ler a conversa.'; vs.err = true; renderVendas(); return; }
    if (info.location) {
      f.map = { url: TS.mapUrl(info.location.lat, info.location.lng), name: info.location.name || null };
      // o mapa vai nas observações (o ERP não tem campo de mapa)
      if (f.map.url && !f.delivery_notes.includes(f.map.url)) f.delivery_notes = [f.delivery_notes.trim(), `Mapa: ${f.map.url}`].filter(Boolean).join(' · ').slice(0, 200);
    }
    if (info.addressText) f.addressHint = info.addressText;
    vs.msg = info.location || info.addressText ? '' : 'Nenhuma localização ou endereço nas mensagens carregadas.';
    vs.err = false;
    renderVendas();
  }

  // O que a extensão manda gravar (o background confere tudo e grava como o handleSubmit do ERP)
  function salePayload(f) {
    return {
      sale_date: f.sale_date,
      customer_name: f.customer_name, customer_phone: f.customer_phone, customer_cpf: f.customer_cpf,
      items: f.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, unit_cost: i.unit_cost })),
      accessories: f.accessories.map((a) => ({ accessory_id: a.accessory_id, quantity: a.quantity, cost: a.cost })),
      manual_items: f.manual.map((m) => ({ name: m.name, price: m.price, cost: m.cost, quantity: m.quantity })),
      payments: f.payments.map((pm) => ({ ...pm })), payment_status: f.payment_status,
      delivery_type: f.delivery_type, motoboy_id: f.motoboy_id || null, delivery_fee: f.delivery_fee, delivery_cost: f.delivery_cost, delivery_notes: f.delivery_notes,
      city: f.city, neighborhood: f.neighborhood, address_street: f.address_street, address_number: f.address_number,
      address_complement: f.address_complement, state: f.state, zip_code: f.zip_code,
      supplier_name: f.supplier_name, item_suppliers: f.item_suppliers,
      wa_chat_id: f.chatId, ad: f.ad ? { title: f.ad.title || null, platform: f.ad.platform || f.ad.sourceType || null, url: f.ad.url || null } : null,
    };
  }

  async function registerSale(confirmedDup) {
    const f = vs.form;
    if (vs.busy || !f || !f.chatId) return;
    f.triedSubmit = true;
    const x = saleCalcInput(f);
    const problem = TS.validateSale({ form: f, items: x.items, manualItems: x.manualItems, payments: x.payments });
    if (problem) { vs.msg = problem; vs.err = true; renderVendas(); return; }
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
      let res;
      try { res = await call('createSaleFromChat', { sale: salePayload(f) }); } catch (e) {
        // 2.12.4: a venda não foi gravada: nada de etiqueta nem de automação
        vs.msg = `Não consegui registrar a venda: ${e.message}. Nenhuma etiqueta ou automação foi mexida.`;
        vs.err = true;
        vs.busy = false;
        renderVendas();
        return;
      }
      chatNameFromSaleResult(f.chatId, res && res.chatName); // 2.13.3
      if (f.linkEventId) call('linkSaleToPurchase', { eventId: f.linkEventId, saleId: res.id, fillPhone: false }).then(() => cv.links.delete(f.linkEventId)).catch(() => {}); // 2.10.5
      vs.done = { id: res.id, total: res.total, tinyFailed: res.tinyFailed, after: null };
      vs.view = 'done';
      vs.busy = false;
      renderVendas();
      // 2.12.4: só agora (venda gravada) as escolhas de "Ao registrar a venda", cada parte com o seu resultado
      const done = vs.done;
      done.after = await applySaleAfter(f);
      motor.state.lastEvalAt = 0; // automações "venda registrada" no próximo ciclo
      if (vs.done === done) renderVendas();
      return;
    } catch (e) {
      vs.msg = `Não consegui registrar: ${e.message}`;
      vs.err = true;
    }
    vs.busy = false;
    renderVendas();
  }

  // ── 2.12.4: depois de registrar a venda (💰) ──
  // leaveAll: tira de todas as automações (menos as de "venda registrada") e sequências (menos as que começam pela
  // venda); waAdd/waRemove: etiquetas do WhatsApp Business (waRemove '' = nenhuma, SALE_WA_ALL = todas menos a que vai
  // colocar); crmAdd: etiqueta CRM ('' = não mexe). "Não enviar" nunca sai. A última escolha fica em chrome.storage.local.
  const SALE_WA_ALL = globalThis.TspEngine.SALE_WA_ALL;
  const SALE_AFTER_KEY = 'saleAfterPrefs';
  const isNoSendWa = (l) => !!l && String(l.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'nao enviar';
  const saleAfterDefaults = (saved) => globalThis.TspEngine.saleAfterDefaults(saved, state.waLabels, state.labels);
  function saleAfterPrefs() {
    return new Promise((resolve) => {
      try { chrome.storage.local.get([SALE_AFTER_KEY], (r) => resolve((r && r[SALE_AFTER_KEY]) || null)); } catch { resolve(null); }
    });
  }
  function saveSaleAfterPrefs(a) { storageSet({ [SALE_AFTER_KEY]: { leaveAll: !!a.leaveAll, waAdd: a.waAdd || '', waRemove: a.waRemove || '', crmAdd: a.crmAdd || '' } }); }


  async function applySaleAfter(f) {
    const a = f.after || {};
    const out = [];
    // cada parte: ok (com o que fez) ou falhou (com o motivo); quiet = não mostra quando dá certo
    const part = async (label, fn, quiet = false) => {
      try { const r = await fn(); if (!quiet) out.push({ label, ok: true, detail: typeof r === 'string' ? r : '' }); } catch (e) { out.push({ label, ok: false, detail: String((e && e.message) || e) }); }
    };
    // 1. contato da conversa (gatilho "venda registrada") e a etiqueta CRM escolhida
    await part(a.crmAdd ? `Etiqueta CRM "${labelName(a.crmAdd)}"` : 'Contato da conversa no CRM', async () => {
      await call('saleContactLabels', { chatId: f.chatId, name: f.customer_name, phone: f.customer_phone, addLabelId: a.crmAdd || null, removeLabelIds: [] });
      afterLabelChange();
      return 'colocada';
    }, !a.crmAdd);
    // 2. automações e sequências
    if (a.leaveAll) await part('Tirar de todas as automações e sequências', () => leaveAllAutomations(f.chatId));
    // 3. etiquetas do WhatsApp
    if (a.waAdd || a.waRemove) await part('Etiquetas do WhatsApp', () => applySaleWaLabels(f.chatId, a.waAdd, a.waRemove));
    return out;
  }

  async function leaveAllAutomations(chatId) {
    let n = 0;
    // sequências ativas desta conversa (as que começam pela venda continuam)
    const runs = await call('seqChatRuns', { chatId }).catch((e) => { if (/Atualize o banco/.test(e.message)) return []; throw e; });
    for (const r of runs || []) {
      const start = r.automation && r.automation.sequence && r.automation.sequence.start;
      if (start && start.type === 'venda') continue;
      await call('seqRunAction', { id: r.id, action: 'sair' });
      n++;
    }
    // automações (etiqueta CRM, etiqueta do WhatsApp ou adicionada pelo 🔁), menos as de "venda registrada"
    if (!motor.state.automations.length) await motor.loadAutomations();
    const st = await call('chatAutomationState', { identity: null, chatId });
    const contact = st && st.contact;
    if (contact && st.v25) {
      const ran = new Set(st.ranKeys || []);
      for (const auto of motor.state.automations) {
        if (auto.kind === 'sequencia' || auto.trigger_type === 'venda_registrada') continue;
        const entry = E.automationEntry(auto, contact);
        if (!entry) continue;
        const labelEntry = E.automationEntry(auto, contact, { ignoreEnrollment: true });
        const enrollmentId = entry.via === 'inscricao' ? contact.enrollmentIds[auto.id] : undefined;
        const entryKey = labelEntry && !ran.has(`${auto.id}:${contact.id}:fora@${labelEntry.key}`) ? labelEntry.key : undefined;
        if (!enrollmentId && entryKey === undefined) continue; // já tirada
        await call('leaveAutomation', { automationId: auto.id, contactId: contact.id, enrollmentId, entryKey });
        n++;
      }
    }
    return n ? `tirada de ${n}` : 'não estava em nenhuma';
  }

  async function applySaleWaLabels(chatId, add, remove) {
    if (!Array.isArray(state.waLabels)) await refreshBar().catch(() => {});
    if (!Array.isArray(state.waLabels)) throw new Error('o WhatsApp não respondeu (etiquetas indisponíveis)');
    let now = [];
    if (remove === SALE_WA_ALL) {
      const r = await waRequest('chatLabels', { chatId }, { timeout: 5000 });
      now = (r && r.labelIds) || [];
    }
    // tira só o que pode (nunca "Não enviar" nem a que vai colocar) e põe a escolhida
    const plan = globalThis.TspEngine.saleWaPlan({ waAdd: add, waRemove: remove }, state.waLabels, now);
    if (plan.missing) throw new Error('a etiqueta escolhida não existe mais no WhatsApp');
    const addId = plan.add;
    const toRemove = plan.remove;
    const done = [];
    for (const id of toRemove) {
      if (!(await motor.setWaLabel(chatId, { remove: id }))) throw new Error(`não consegui tirar "${(waLabelById(id) || {}).name || id}"${done.length ? ` (já fiz: ${done.join(', ')})` : ''}`);
      done.push(`tirou "${(waLabelById(id) || {}).name || id}"`);
    }
    if (addId) {
      if (!(await motor.setWaLabel(chatId, { add: addId }))) throw new Error(`não consegui colocar "${waLabelById(addId).name}"${done.length ? ` (já fiz: ${done.join(', ')})` : ''}`);
      done.push(`colocou "${waLabelById(addId).name}"`);
    }
    refreshBar().catch(() => {});
    return done.join(', ') || 'nada a mudar';
  }

  function renderSaleDone() {
    const sec = el('section', 'crmsec');
    sec.append(el('div', 'wt-head', 'VENDA REGISTRADA'));
    sec.append(el('div', 'fw-test vd-done', `Venda registrada (Em separação). Finalize no ERP. Total ${TS.money(vs.done.total)}.`));
    const url = erpLink({ pagina: 'historico', venda: vs.done.id });
    if (url) sec.append(erpAnchor('Abrir esta venda no ERP', url, 'bbtn primary vd-open'));
    else sec.append(el('div', 'crm-intro', 'No ERP: Histórico de Vendas.'));
    if (vs.done.tinyFailed) sec.append(el('div', 'ed-note', 'O estoque do Tiny não confirmou a atualização: confira no ERP.'));
    // 2.12.4: o que foi feito depois da venda, parte por parte
    const box = el('div', 'vd-after');
    if (!vs.done.after) box.append(el('div', 'lt-none loading', 'Aplicando as etiquetas e as automações…'));
    else if (!vs.done.after.length) box.append(el('div', 'crm-intro', 'Nada a mexer em etiquetas ou automações.'));
    else {
      vs.done.after.forEach((x) => {
        const line = el('div', `vd-after-line ${x.ok ? 'ok' : 'err'}`, `${x.ok ? '✓' : '✗'} ${x.label}${x.detail ? `: ${x.detail}` : ''}`);
        line.dataset.ok = x.ok ? '1' : '0';
        box.append(line);
      });
      if (vs.done.after.some((x) => !x.ok)) box.append(el('div', 'ed-note', 'A venda está gravada; só a parte marcada com ✗ não foi feita. Faça essa parte à mão na conversa.'));
    }
    sec.append(box);
    sec.append(fbtn('bbtn', 'Gerar mensagem do entregador', () => openCourier()), fbtn('bbtn', 'Voltar', () => { vs.view = 'list'; loadChatSales(); }));
    vtabEl.append(sec);
  }

  // ── Mensagem do entregador (só monta o texto; enviar é um clique). 2.12.3: sem a linha de horário ──
  async function openCourier() {
    const f = vs.form;
    if (!f) return;
    const cat = vs.catalog || {};
    const t = saleTotals(f);
    const notes = String(f.delivery_notes || '').trim();
    const text = TS.courierMessage({
      customer_name: f.customer_name, customer_phone: f.customer_phone, address_street: f.address_street, address_number: f.address_number,
      address_complement: f.address_complement, neighborhood: f.neighborhood, city: f.city,
      items: [...f.items.map((i) => { const p = (cat.products || []).find((x) => x.id === i.product_id); return { quantity: i.quantity, name: p ? productLabel(p) : 'produto' }; }), ...f.manual.map((m) => ({ quantity: m.quantity, name: m.name }))],
      total: t.totalSalePrice, payment_method: (f.payments[0] || {}).method, payment_status: f.payment_status,
      notes, map_url: f.map && !notes.includes(f.map.url) ? f.map.url : null,
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
      const line = fbtn('sc-item vd-sale conv-link', '', () => openConversation({ chatId: s.wa_chat_id, name: s.customer_name }));
      line.title = 'Abrir conversa';
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

  // ── 2.15.3: exportar o catálogo do WhatsApp Business (só leitura; não envia nada nem muda o catálogo) ──
  // A ponte lê os produtos visíveis e baixa cada foto; o background sobe em wa-media/catalog/<id>/ (sem duplicar,
  // pelo sha256) e grava o retrato em system_config (wa_catalog_snapshot). Falha num produto: segue os outros.
  const catx = { busy: false, step: '', result: null, error: '', last: undefined };
  const CATX_REASON = {
    unavailable: 'Esta versão do WhatsApp não deixa ler o catálogo.',
    not_business: 'Esta conta não é WhatsApp Business (sem catálogo).',
    no_me: 'Não consegui ler o número da loja no WhatsApp.',
    failed: 'O WhatsApp não devolveu o catálogo. Tente de novo em alguns segundos.',
  };
  const CATX_MIN_PX = 600; // 2.16.1: foto aceita = lado maior com pelo menos 600 px (a miniatura da lista tem 100)
  const catxWhen = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''; };
  function bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  // só o bloco do catálogo (a busca e a grade não piscam durante a exportação)
  function refreshCatx() {
    if (!md.open || !mtabEl) return;
    const cur = mtabEl.querySelector('.md-catx');
    if (cur) cur.replaceWith(renderCatalogExport());
  }
  async function loadCatalogInfo() {
    if (catx.last !== undefined) return;
    catx.last = null;
    try { catx.last = await call('catalogSnapshotInfo'); } catch { catx.last = null; }
    refreshCatx();
  }
  async function exportCatalog() {
    if (catx.busy) return;
    Object.assign(catx, { busy: true, step: 'Lendo o catálogo do WhatsApp…', result: null, error: '' });
    refreshCatx();
    try {
      let r = null;
      try { r = await waRequest('catalogExport', {}, { timeout: 10 * 60 * 1000 }); } catch (e) { throw new Error(e.code === 'not_ready' ? 'O WhatsApp ainda está carregando. Tente de novo em alguns segundos.' : e.message); }
      if (!r || !r.ok) throw new Error(CATX_REASON[r && r.reason] || CATX_REASON.failed);
      const products = [];
      const failed = (r.warnings || []).slice();
      const noBig = []; // produtos que ficaram sem nenhuma foto grande
      let photos = 0;
      for (let i = 0; i < r.products.length; i++) {
        const p = r.products[i];
        catx.step = `Produto ${i + 1} de ${r.products.length}: ${p.name}`;
        refreshCatx();
        const images = [];
        const errs = [];
        const small = []; // 2.16.1: só miniatura (lado maior < CATX_MIN_PX): não sobe
        for (const src of p.images || []) {
          try {
            const img = await waRequest('catalogImage', { url: src }, { timeout: 60000 });
            if (!img || !img.data || !img.data.byteLength) throw new Error('Não consegui baixar a foto do catálogo');
            const w = Number(img.width) || 0;
            const h = Number(img.height) || 0;
            if (Math.max(w, h) < CATX_MIN_PX) { small.push(w && h ? `${w}x${h} px` : 'tamanho não identificado'); continue; }
            const up = await call('uploadCatalogImage', { productId: p.id, base64: bufToBase64(img.data), mime: img.mime });
            images.push({ url: up.url, source: src, sha256: up.sha256, size: up.size, mime: up.mime, width: w, height: h, reused: !!up.reused });
          } catch (e) { errs.push(e.message || 'erro'); }
        }
        photos += images.length;
        if (small.length) {
          (images.length ? failed : noBig).push({ id: p.id, name: p.name, error: images.length
            ? `${small.length} foto${small.length === 1 ? '' : 's'} só em miniatura (${small[0]}), não exportada${small.length === 1 ? '' : 's'}`
            : `sem foto grande: o WhatsApp só deu miniatura (${small[0]})` });
        }
        if (errs.length) failed.push({ id: p.id, name: p.name, error: `${errs.length} de ${(p.images || []).length} foto${(p.images || []).length === 1 ? '' : 's'} não exportada${errs.length === 1 ? '' : 's'}: ${errs[0]}` });
        products.push({ ...p, images });
      }
      catx.step = 'Gravando o retrato do catálogo…';
      refreshCatx();
      failed.unshift(...noBig);
      const saved = await call('saveCatalogSnapshot', { snapshot: { phone: r.me, products, failed } });
      catx.result = { products: saved.product_count, photos, at: saved.exported_at, failed, noBig: noBig.length, removed: saved.removed || 0, reused: products.reduce((n, p) => n + p.images.filter((x) => x.reused).length, 0) };
      catx.last = { exported_at: saved.exported_at, product_count: saved.product_count, image_count: saved.image_count, failed: failed.length };
    } catch (e) {
      catx.error = e.message || 'Erro ao exportar';
    }
    catx.busy = false;
    catx.step = '';
    refreshCatx();
  }
  function renderCatalogExport() {
    const sec = el('section', 'crmsec md-catx');
    sec.append(el('div', 'wt-head', 'CATÁLOGO DO WHATSAPP'));
    sec.append(el('div', 'crm-intro', 'Copia os produtos visíveis do seu catálogo (nome, descrição, preços, link, coleção e todas as fotos) para o wa-media e guarda um retrato no banco. Só lê: não muda o catálogo e não envia nada para ninguém.'));
    const b = fbtn('bbtn md-catx-btn', catx.busy ? 'Exportando…' : 'Exportar catálogo do WhatsApp', () => exportCatalog());
    b.disabled = catx.busy;
    sec.append(b);
    if (catx.busy && catx.step) sec.append(el('div', 'md-up md-catx-step', catx.step));
    if (catx.error) sec.append(el('div', 'md-up err md-catx-err', `Não consegui exportar: ${catx.error}`));
    const r = catx.result;
    if (r) {
      sec.append(el('div', 'ed-msg md-catx-done', `${r.products} produto${r.products === 1 ? '' : 's'} e ${r.photos} foto${r.photos === 1 ? '' : 's'} exportado${r.products + r.photos === 1 ? '' : 's'} em ${catxWhen(r.at)}${r.reused ? ` (${r.reused} já estava${r.reused === 1 ? '' : 'm'} no wa-media, não subi${r.reused === 1 ? 'u' : 'ram'} de novo)` : ''}.`));
      if (r.removed) sec.append(el('div', 'md-up md-catx-removed', `${r.removed} foto${r.removed === 1 ? '' : 's'} antiga${r.removed === 1 ? '' : 's'} (miniatura) apagada${r.removed === 1 ? '' : 's'} do wa-media.`));
      if (r.noBig) sec.append(el('div', 'md-up warn md-catx-nobig', `${r.noBig} produto${r.noBig === 1 ? '' : 's'} sem foto grande (só miniatura): veja abaixo.`));
      if (r.failed.length) {
        sec.append(el('div', 'md-up warn', `Com problema (${r.failed.length}):`));
        const ul = el('ul', 'md-catx-fail');
        r.failed.slice(0, 50).forEach((f) => ul.append(el('li', 'md-up err', `${f.name || f.id}: ${f.error}`)));
        sec.append(ul);
      }
    } else if (catx.last && catx.last.exported_at && !catx.busy) {
      sec.append(el('div', 'md-up md-catx-last', `Última exportação: ${catxWhen(catx.last.exported_at)} · ${catx.last.product_count} produto${catx.last.product_count === 1 ? '' : 's'} e ${catx.last.image_count} foto${catx.last.image_count === 1 ? '' : 's'}`));
    }
    return sec;
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
    mtabEl.append(renderCatalogExport()); // 2.15.3
    loadCatalogInfo();
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
        logQuickSend(chatId, null); // 2.10.0
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

  // ── 2.12.1: atalhos no cabeçalho da conversa (💰 📈 ⏰ 🏷️ à esquerda do vídeo/ligação do WhatsApp) ──
  // Ficam no DOM do WhatsApp (fora do painel). Uma verificação leve a cada 1,2 s (uma consulta ao DOM, só com a aba
  // visível) reinsere quando o WhatsApp troca de conversa ou recria o cabeçalho. Sem os ícones do WhatsApp (mudou o
  // WhatsApp), não faz nada: os botões continuam no painel.
  const HDR_DEFS = [
    ['venda', '💰', 'Registrar venda desta conversa'],
    ['compra', '📈', 'Enviar compra desta conversa para o Facebook'],
    ['agendar', '⏰', 'Agendar mensagem nesta conversa'],
    ['etiqueta', '🏷️', 'Etiquetas CRM desta conversa'],
  ];
  const HDR_ANCHORS = [
    '[data-icon="video-call"]', '[data-icon="video-call-refreshed"]', '[data-icon="voice-call"]', '[data-icon="voice-call-refreshed"]',
    'button[aria-label*="vídeo" i]', 'button[aria-label*="video" i]', 'button[aria-label*="ligar" i]', 'button[aria-label*="ligação" i]', 'button[aria-label*="call" i]',
    '[role="button"][aria-label*="vídeo" i]', '[role="button"][aria-label*="video" i]', '[role="button"][aria-label*="ligar" i]', '[role="button"][aria-label*="call" i]',
    '[data-icon="search-alt"]', '[data-icon="search-refreshed"]', 'button[aria-label*="pesquisar" i]', 'button[aria-label*="search" i]', '[role="button"][aria-label*="pesquisar" i]',
    '[data-icon="menu"]',
  ].join(',');
  const hdr = { el: null, btn: null, pop: null, popShadow: null, listEl: null, footEl: null, q: '', creating: false, msg: '', kind: null, kindFor: null, title: null };
  function hdrStyle() {
    if (document.getElementById('tsp-hdr-style')) return;
    const st = document.createElement('style');
    st.id = 'tsp-hdr-style';
    st.textContent = '.tsp-hdr{display:inline-flex;align-items:center;gap:2px;flex:none;margin-right:2px}'
      + '.tsp-hdr[hidden],.tsp-hdr-b[hidden]{display:none!important}'
      + '.tsp-hdr-b{display:inline-flex;align-items:center;justify-content:center;border:0;margin:0;padding:0;border-radius:50%;background:transparent;cursor:pointer;line-height:1;color:inherit;font-family:inherit}'
      + '.tsp-hdr-b:hover,.tsp-hdr-b[aria-expanded="true"]{background:rgba(128,128,128,.2)}'
      + '.tsp-hdr-b:focus-visible{outline:2px solid #25d366;outline-offset:1px}';
    (document.head || document.documentElement).append(st);
  }
  function hdrAnchor(header) {
    const a = header.querySelector(HDR_ANCHORS);
    if (!a || (hdr.el && hdr.el.contains(a))) return null;
    const btn = a.closest('button,[role="button"]') || a;
    if (!header.contains(btn)) return null;
    let item = btn;
    while (item.parentElement && item.parentElement !== header && item.parentElement.children.length === 1) item = item.parentElement;
    return { btn, item };
  }
  // grupo? a WA-JS responde quando está pronta; senão, pelo DOM (mensagens @g.us)
  function hdrKind(header) {
    if (hdr.kind && hdr.kindFor === hdr.title) return hdr.kind;
    const main = header.closest('#main') || document;
    return main.querySelector('[data-id*="@g.us"]') ? 'grupo' : 'individual';
  }
  function hdrSize(box, size) {
    const px = Math.round(Math.min(48, Math.max(28, size || 40)));
    box.querySelectorAll('.tsp-hdr-b').forEach((b) => { b.style.width = `${px}px`; b.style.height = `${px}px`; b.style.fontSize = `${Math.round(px * 0.48)}px`; });
  }
  function hdrBuild(size) {
    const box = document.createElement('div');
    box.className = 'tsp-hdr';
    box.dataset.tsp = 'hdr';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Atalhos da extensão');
    HDR_DEFS.forEach(([k, icon, tip]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tsp-hdr-b';
      b.dataset.hdr = k;
      b.title = tip;
      b.setAttribute('aria-label', tip);
      b.textContent = icon;
      if (k === 'etiqueta') { b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false'); }
      box.append(b);
    });
    // o clique não chega no cabeçalho do WhatsApp (que abriria os dados do contato)
    ['mousedown', 'pointerdown', 'mouseup', 'pointerup', 'click', 'dblclick'].forEach((t) => box.addEventListener(t, (e) => {
      e.stopPropagation();
      if (t !== 'click') return;
      e.preventDefault();
      const b = e.target && e.target.closest ? e.target.closest('.tsp-hdr-b') : null;
      if (b) hdrAction(b.dataset.hdr, b);
    }));
    hdrSize(box, size);
    return box;
  }
  function hdrApplyVisibility() {
    if (!hdr.el) return;
    const p = pz.prefs.hdr;
    const header = hdr.el.closest('header');
    const group = header ? hdrKind(header) === 'grupo' : false;
    hdr.el.hidden = !p.on || group; // só em conversa individual
    hdr.el.querySelectorAll('.tsp-hdr-b').forEach((b) => { b.hidden = !p[b.dataset.hdr]; });
    if (hdr.el.hidden && hdr.pop) hdrPopClose();
  }
  function hdrTick() {
    const header = document.querySelector('#main header');
    if (!pz.prefs.hdr.on || !header) {
      if (hdr.el) hdr.el.remove();
      if (hdr.pop) hdrPopClose();
      return;
    }
    const t = header.querySelector('span[dir="auto"][title]');
    const title = t ? t.title : header.textContent.slice(0, 80);
    if (title !== hdr.title) { hdr.title = title; hdr.kind = null; hdr.kindFor = null; hdrPopClose(); hdrAskKind(title); }
    if (hdr.el && header.contains(hdr.el)) { hdrApplyVisibility(); return; }
    const at = hdrAnchor(header);
    if (!at) { if (hdr.el) hdr.el.remove(); return; }
    hdrStyle();
    const size = at.btn.getBoundingClientRect().height;
    if (!hdr.el) hdr.el = hdrBuild(size); else hdrSize(hdr.el, size);
    at.item.parentElement.insertBefore(hdr.el, at.item);
    hdrApplyVisibility();
  }
  async function hdrAskKind(title) {
    let c = null;
    try { c = await waRequest('activeChat', {}, { timeout: 1500 }); } catch { c = null; }
    if (hdr.title !== title || !c || (c.kind !== 'grupo' && c.kind !== 'individual')) return;
    hdr.kind = c.kind;
    hdr.kindFor = title;
    hdrApplyVisibility();
  }
  setInterval(() => { if (!document.hidden) { try { hdrTick(); } catch { /* WhatsApp mudou: não faz nada */ } } }, 1200);

  function hdrAction(k, btn) {
    if (k === 'etiqueta') { if (hdr.pop) hdrPopClose(); else hdrPopOpen(btn); return; }
    hdrPopClose();
    if (!state.open) setOpen(true); else updateContext();
    if (k === 'venda') { setSection('vendas'); openSaleForm(); }
    else if (k === 'compra') { setSection('conversoes'); openConversionForm(); }
    else if (k === 'agendar') setSection('agendados');
  }

  // 🏷️: lista suspensa ali mesmo (etiquetas CRM em 1 clique, busca e "+ Nova etiqueta")
  const hdrNorm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function hdrPopOpen(btn) {
    hdrPopClose();
    updateContext(); // conversa aberta e as etiquetas dela, mesmo com o painel fechado
    if (!state.labelsLoaded || !state.labels.length) syncLabels().then(() => hdrPopList()).catch(() => hdrPopList());
    const host = document.createElement('div');
    host.id = 'tsp-hdr-pop';
    host.style.cssText = 'position:fixed;z-index:2147483646;top:0;left:0';
    // o que se digita aqui não vai para o WhatsApp
    ['keydown', 'keyup', 'keypress', 'input', 'paste', 'mousedown', 'pointerdown', 'click'].forEach((t) => host.addEventListener(t, (e) => e.stopPropagation()));
    const sh = host.attachShadow({ mode: 'open' });
    const head = document.querySelector('#main header');
    const bg = head ? getComputedStyle(head).backgroundColor : '';
    const rgb = (bg.match(/\d+/g) || [255, 255, 255]).map(Number);
    const dark = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] < 110;
    const st = document.createElement('style');
    st.textContent = ':host{all:initial}'
      + '.pop{--bg:#fff;--fg:#111b21;--bd:#d1d7db;--mut:#667781;--hv:#f0f2f5;width:280px;max-height:min(440px,70vh);display:flex;flex-direction:column;background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.25);font:14px/1.35 "Segoe UI",Helvetica,Arial,sans-serif;overflow:hidden}'
      + '.pop.dark{--bg:#233138;--fg:#e9edef;--bd:#3b4a54;--mut:#aebac1;--hv:#2a3942}'
      + '.hd{padding:10px 12px 6px;font-weight:700;font-size:13px;color:var(--mut)}'
      + 'input{margin:0 12px 6px;padding:7px 10px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit;outline:none}'
      + 'input:focus{border-color:#25d366}'
      + '.list{overflow-y:auto;flex:1;min-height:0}'
      + '.opt{display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}'
      + '.opt:hover,.opt:focus-visible{background:var(--hv);outline:none}'
      + '.dot{width:12px;height:12px;border-radius:50%;flex:none}'
      + '.nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.ck{color:#25d366;font-weight:700}'
      + '.ft{border-top:1px solid var(--bd);padding:4px 0}'
      + '.new{color:#00a884;font-weight:600}'
      + '.msg{padding:8px 12px;color:var(--mut);font-size:13px}'
      + '.err{color:#e5484d}'
      + '.retry{margin:0 12px 8px;padding:4px 10px;border:1px solid var(--bd);border-radius:999px;background:none;color:inherit;font:inherit;font-size:13px;cursor:pointer}';
    const box = el('div', `pop${dark ? ' dark' : ''}`);
    box.setAttribute('role', 'menu');
    box.setAttribute('aria-label', 'Etiquetas CRM desta conversa');
    const ident = state.ctx && state.ctx.identity;
    box.append(el('div', 'hd', `ETIQUETAS CRM${ident && ident.name ? ` · ${ident.name}` : ''}`));
    const input = el('input');
    input.type = 'search';
    input.placeholder = 'Buscar ou criar etiqueta…';
    input.setAttribute('aria-label', 'Buscar etiqueta CRM');
    input.addEventListener('input', () => { hdr.q = input.value; hdr.msg = ''; hdrPopList(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); hdrPopClose(); if (hdr.btn) hdr.btn.focus(); }
      if (e.key === 'Enter') { e.preventDefault(); const first = hdr.listEl && hdr.listEl.querySelector('.opt'); if (first) first.click(); else hdrNewLabel(); }
    });
    hdr.listEl = el('div', 'list');
    hdr.footEl = el('div', 'ft');
    box.append(input, hdr.listEl, hdr.footEl);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); hdrPopClose(); if (hdr.btn) hdr.btn.focus(); } });
    sh.append(st, box);
    hdr.pop = host;
    hdr.popShadow = sh;
    hdr.btn = btn;
    hdr.q = '';
    hdr.msg = '';
    document.body.append(host);
    btn.setAttribute('aria-expanded', 'true');
    hdrPopList();
    hdrPopPlace();
    setTimeout(() => input.focus(), 0);
  }
  function hdrPopPlace() {
    if (!hdr.pop || !hdr.btn) return;
    const r = hdr.btn.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - 288, r.right - 280));
    hdr.pop.style.left = `${Math.round(left)}px`;
    hdr.pop.style.top = `${Math.round(r.bottom + 6)}px`;
  }
  function hdrPopList() {
    if (!hdr.pop || !hdr.listEl) return;
    const list = hdr.listEl;
    const foot = hdr.footEl;
    list.textContent = '';
    foot.textContent = '';
    const identity = state.ctx && state.ctx.identity;
    if (!canLabel(identity)) {
      list.append(el('div', 'msg', identity && identity.kind === 'group' ? 'Grupos não recebem etiquetas.' : 'Não consegui identificar a conversa.'));
      return;
    }
    if (state.convError && !state.convLoading) {
      list.append(el('div', 'msg err', `Não consegui carregar as etiquetas desta conversa: ${globalThis.TspEngine.errorReason(state.convErrorMsg)}`));
      const b = el('button', 'retry', 'Tentar de novo');
      b.type = 'button';
      b.addEventListener('click', () => retryConvLabels());
      list.append(b);
      return;
    }
    if (state.convLoading || (!state.labelsLoaded && !state.labels.length)) { list.append(el('div', 'msg', 'Carregando…')); return; }
    const q = hdrNorm(hdr.q);
    const all = visibleCrmLabels();
    const shown = all.filter((l) => !q || hdrNorm(l.name).includes(q));
    shown.forEach((l) => {
      const on = state.convLabelIds.includes(l.id);
      const opt = el('button', 'opt');
      opt.type = 'button';
      opt.dataset.labelId = l.id;
      opt.setAttribute('role', 'menuitemcheckbox');
      opt.setAttribute('aria-checked', String(on));
      const dot = el('span', 'dot');
      dot.style.background = l.color;
      opt.append(dot, el('span', 'nm', l.name), el('span', 'ck', on ? '✓' : ''));
      opt.title = on ? `Desmarcar "${l.name}"` : `Marcar "${l.name}"`;
      opt.addEventListener('click', () => toggleLabel(l.id));
      list.append(opt);
    });
    if (!shown.length) list.append(el('div', 'msg', all.length ? 'Nenhuma etiqueta com esse nome.' : 'Nenhuma etiqueta CRM ainda.'));
    const name = String(hdr.q || '').replace(/\s+/g, ' ').trim();
    const exists = name && all.some((l) => hdrNorm(l.name) === hdrNorm(name));
    const nb = el('button', 'opt new', hdr.creating ? 'Criando…' : name && !exists ? `+ Nova etiqueta “${name}”` : '+ Nova etiqueta');
    nb.type = 'button';
    nb.disabled = hdr.creating;
    nb.addEventListener('click', () => hdrNewLabel());
    foot.append(nb);
    if (hdr.msg) foot.append(el('div', `msg${hdr.msgErr ? ' err' : ''}`, hdr.msg));
  }
  async function hdrNewLabel() {
    const name = String(hdr.q || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) {
      hdr.msg = 'Digite o nome da nova etiqueta no campo acima.';
      hdr.msgErr = false;
      hdrPopList();
      const i = hdr.popShadow && hdr.popShadow.querySelector('input');
      if (i) i.focus();
      return;
    }
    const same = state.labels.find((l) => hdrNorm(l.name) === hdrNorm(name));
    if (same) { if (!state.convLabelIds.includes(same.id)) toggleLabel(same.id); return; }
    hdr.creating = true;
    hdrPopList();
    try {
      const created = await call('createLabel', { name, color: '#3b82f6' });
      await syncLabels().catch(() => {});
      hdr.q = '';
      const i = hdr.popShadow && hdr.popShadow.querySelector('input');
      if (i) i.value = '';
      hdr.msg = `Etiqueta CRM “${name}” criada e marcada.`;
      hdr.msgErr = false;
      if (created && created.id && !state.convLabelIds.includes(created.id)) toggleLabel(created.id);
    } catch (e) {
      hdr.msg = `Não consegui criar: ${globalThis.TspEngine.errorReason(e.message)}`;
      hdr.msgErr = true;
    }
    hdr.creating = false;
    hdrPopList();
  }
  function hdrPopClose() {
    if (!hdr.pop) return;
    hdr.pop.remove();
    hdr.pop = null;
    hdr.popShadow = null;
    hdr.listEl = null;
    hdr.footEl = null;
    if (hdr.btn) hdr.btn.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('mousedown', (e) => {
    if (!hdr.pop) return;
    const path = e.composedPath();
    if (!path.includes(hdr.pop) && !(hdr.el && path.includes(hdr.el))) hdrPopClose();
  }, true);
  window.addEventListener('resize', () => hdrPopPlace());

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

  // ── 2.10.5: Venda do ERP ligada à Compra do 📈 ──
  // Compra REAL enviada → procura a venda no ERP: pelo telefone desta conversa (7 dias; achou 1 = liga sozinha;
  // mais de 1 = você escolhe), senão pelo valor (±10%, 3 dias, vendas sem telefone ou com outro). Nenhuma: lança no 💰.
  // Ligar só preenche wa_chat_id (e o telefone vazio) da venda; "Desligar" desfaz só isso.
  cv.links = new Map(); // eventId → { loading, data, msg, err, busy, noAuto }
  const saleShort = (sv) => `#${String(sv.id).slice(0, 8)}`;
  const saleDay = (sv) => { const t = Date.parse(sv.sale_date); if (!Number.isFinite(t)) return ''; const d = new Date(t); return `${two(d.getDate())}/${two(d.getMonth() + 1)}`; };
  const saleLabel = (sv) => (sv.missing ? `${saleShort(sv)} (venda apagada ou sem acesso)` : `${saleShort(sv)} · ${sv.customer_name || 'cliente sem nome'} · ${TS.money(sv.total_sale_price || 0)}`);
  function linkSet(ev, patch) {
    cv.links.set(ev.eventId, { ...(cv.links.get(ev.eventId) || {}), ...patch });
    if (cv.open) renderConversoes();
  }
  async function loadSaleLink(ev, allowAuto, msg = '') {
    if (cv.linkOff) return;
    linkSet(ev, { loading: true, msg: '', err: false });
    let r = null;
    try { r = await call('purchaseSaleLink', { eventId: ev.eventId }); } catch (e) { linkSet(ev, { loading: false, data: null, msg: e.message, err: true }); return; }
    if (!r || r.available === false) { cv.linkOff = true; linkSet(ev, { loading: false, data: { available: false } }); return; } // sem a migration: some
    const chatId = (r.event && r.event.chat_id) || ev.chatId;
    const phone = ev.phone || (/^\d+@c\.us$/.test(chatId || '') ? chatId.split('@')[0] : '');
    const value = Number(r.event && r.event.value) || Number(ev.value) || 0;
    const m = r.linked ? { byPhone: [], byValue: [] } : globalThis.TspEngine.matchSalesForPurchase({ sales: r.sales, chatId, phone, value, taken: r.taken });
    const data = { linked: r.linked, byPhone: m.byPhone, byValue: m.byValue, value, chatId, phone };
    const st = cv.links.get(ev.eventId) || {};
    if (!data.linked && m.byPhone.length === 1 && allowAuto && !st.noAuto) { await doLinkSale(ev, data, m.byPhone[0], false, true); return; }
    linkSet(ev, { loading: false, data, msg });
  }
  async function doLinkSale(ev, data, sale, fillPhone, auto = false) {
    linkSet(ev, { busy: true, msg: '' });
    try {
      const r = await call('linkSaleToPurchase', { eventId: ev.eventId, saleId: sale.id, phone: fillPhone ? globalThis.TspEngine.salePhoneOf(data.phone) : null, fillPhone });
      chatNameFromSaleResult(data.chatId || chatNames.current, r && r.chatName); // 2.13.3
      linkSet(ev, { busy: false, loading: false, data: { ...data, linked: r.linked, byPhone: [], byValue: [] }, msg: auto ? 'Ligada sozinha: era a única venda com o telefone desta conversa.' : 'Ligada ✓', err: false });
    } catch (e) { linkSet(ev, { busy: false, loading: false, data, msg: e.message, err: true }); }
  }
  async function doUnlinkSale(ev) {
    linkSet(ev, { busy: true, msg: '' });
    try { await call('unlinkSaleFromPurchase', { eventId: ev.eventId }); } catch (e) { linkSet(ev, { busy: false, msg: e.message, err: true }); return; }
    linkSet(ev, { busy: false, noAuto: true }); // não liga sozinha de novo a mesma venda
    await loadSaleLink(ev, false, 'Desligada. Escolha a venda certa ou deixe sem ligar.');
  }
  function launchSaleFor(ev, data) {
    if (chatNames.current && data.chatId && chatNames.current !== data.chatId) { linkSet(ev, { msg: 'Abra a conversa desta compra para lançar a venda.', err: true }); return; }
    if (!state.open) setOpen(true);
    setSection('vendas');
    openSaleForm({ value: data.value, linkEventId: ev.eventId });
  }
  // ev: { eventId, chatId, phone?, value, sale? (já ligada, do histórico) }. auto: procura sozinha (📈 da conversa).
  function saleLinkEl(ev, { auto = false } = {}) {
    if (cv.linkOff) return null;
    const st = cv.links.get(ev.eventId);
    if (st && st.data && st.data.available === false) return null;
    const box = el('div', 'fw-test cv-link');
    box.dataset.event = ev.eventId;
    box.append(el('div', 'fw-k', 'VENDA DO ERP'));
    const btn = (cls, text, fn) => { const b = fbtn(cls, text, fn); b.disabled = !!(st && (st.busy || st.loading)); return b; };
    const linkedEl = (sv) => { const l = el('div', 'cv-linkrow'); l.append(el('div', 'cv-linked', `Venda do ERP ligada: ${saleLabel(sv)}`), btn('bbtn cv-unlink', 'Desligar', () => doUnlinkSale(ev))); return l; };
    if (!st) {
      if (ev.sale) box.append(linkedEl(ev.sale));
      else if (auto) { queueMicrotask(() => loadSaleLink(ev, true)); box.append(el('div', 'lt-none loading', 'Procurando a venda no ERP…')); }
      else box.append(el('div', 'sc-prev', 'Nenhuma venda do ERP ligada.'), btn('bbtn cv-findsale', 'Ligar à venda do ERP', () => loadSaleLink(ev, true)));
      return box;
    }
    if (st.loading) box.append(el('div', 'lt-none loading', 'Procurando a venda no ERP…'));
    else if (st.data) {
      const d = st.data;
      const saleRow = (sv, fill) => {
        const row = el('div', 'cv-salerow');
        row.append(el('div', 'cv-sale', `${sv.customer_name || 'cliente sem nome'} · ${saleDay(sv)} · ${TS.money(sv.total_sale_price || 0)}${sv.customer_phone ? '' : ' · sem telefone'}`),
          btn('bbtn primary cv-pick', 'É esta', () => doLinkSale(ev, d, sv, fill)));
        return row;
      };
      if (d.linked) box.append(linkedEl(d.linked));
      else if (d.byPhone.length) {
        box.append(el('div', 'sc-prev', d.byPhone.length === 1 ? 'Achei 1 venda do ERP com o telefone desta conversa (últimos 7 dias). É esta compra?' : `Achei ${d.byPhone.length} vendas do ERP com o telefone desta conversa (últimos 7 dias). Qual é esta compra?`));
        d.byPhone.forEach((sv) => box.append(saleRow(sv, false)));
      } else if (d.byValue.length) {
        box.append(el('div', 'sc-prev', `Não achei pelo telefone. Vendas dos últimos 3 dias com valor parecido (${TS.money(d.value)} ±10%):`));
        d.byValue.forEach((sv) => box.append(saleRow(sv, true)));
        box.append(el('div', 'ed-note', 'Escolhendo, a venda fica ligada a esta conversa (e ganha o telefone dela, se estiver sem).'));
      } else {
        box.append(el('div', 'sc-prev', 'Nenhuma venda parecida no ERP (telefone desta conversa nos últimos 7 dias, ou valor ±10% nos últimos 3).'),
          btn('bbtn primary cv-launch', 'Lançar venda no ERP', () => launchSaleFor(ev, d)));
      }
    } else box.append(btn('bbtn cv-findsale', 'Tentar de novo', () => loadSaleLink(ev, true)));
    if (st.msg) box.append(el('div', `ed-msg${st.err ? ' err' : ''}`, st.msg));
    return box;
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
          ad: { title: found.title, sourceId: found.sourceId, sourceApp: found.platform || found.sourceApp, sourceUrl: found.sourceUrl, thumbnailUrl: found.thumbnailUrl, mediaType: found.mediaType, conversionSource: found.conversionSource, ctwaClid: found.ctwaClid } }] }).catch(() => {});
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
      sourceType: null, sourceApp: r.source_app || null, conversionSource: r.conversion_source || null, mediaType: r.media_type || null, thumbnailUrl: r.thumbnail_url || null,
      platform: /insta/.test(app) ? 'Instagram' : /face|fb/.test(app) ? 'Facebook' : null, conversionData: null, ctwaClid: clid,
      clidInfo: clid ? { field: 'salvo no banco', path: '-', length: clid.length, mask: `${clid.slice(0, 6)}…${clid.slice(-4)}` } : null, clidCandidates: [], keys: [],
      firstMessageAt: r.first_message_at ? Math.floor(Date.parse(r.first_message_at) / 1000) : null,
    };
  }

  // ── 2.10.0: painel de resultados do ERP ──
  // Só a aba com a trava: pega da ponte as mensagens novas das conversas (só conversa, lado e hora) e grava
  // leads novos (wa_leads), o que você digitou (wa_send_log origin 'manual') e a 1ª resposta do cliente
  // depois de cada envio nosso (wa_replies). Espera 45 s para os envios de outras abas/PCs já estarem
  // gravados. Sem a migration: para até recarregar.
  // 2.12.8: grava também a atividade de TODAS as conversas individuais (wa_chat_activity: última mensagem, de
  // quem, dias em que o cliente/a loja falaram, lead novo), no máximo 1 vez por conversa a cada 30 s. Ao abrir,
  // varre as conversas com mensagem nas últimas 72 h (activityScan da ponte, inclusive as que não estão na tela)
  // e grava os leads novos delas em wa_leads. Sem a migration 20261109120000: só a atividade para.
  const pnl = { off: false, scanned: false, actOff: false, pending: [], tracker: globalThis.TspEngine.convTracker(), act: globalThis.TspEngine.activityBuffer(30 * 1000) };
  const PANEL_DELAY_MS = 45 * 1000;
  const extSends = new Map(); // chatId → [{ from, to }] (ms) dos envios da extensão nesta aba
  function markExtSend(chatId) {
    if (!chatId) return { done() {} };
    const span = { from: Date.now() - 5000, to: Infinity };
    const list = (extSends.get(chatId) || []).filter((s) => s.to === Infinity || Date.now() - s.to < 10 * 60 * 1000).slice(-9);
    list.push(span);
    extSends.set(chatId, list);
    return { done() { span.to = Date.now() + 60 * 1000; } };
  }
  const isExtSend = (chatId, t) => (extSends.get(chatId) || []).some((s) => t * 1000 >= s.from && t * 1000 <= s.to);
  async function panelBatch(type, list, size) {
    for (let i = 0; i < list.length; i += size) await call(type, { items: list.slice(i, i + size) });
  }
  async function panelTick() {
    if (pnl.off) return;
    // 2.12.8: varredura da abertura (72 h, todas as conversas individuais), uma vez por abertura. Roda por fora
    // (pode levar até ~1,5 min carregando mensagens antigas) para não segurar o motor de envios.
    if (!pnl.scanned && !pnl.scanning) {
      pnl.scanning = waRequest('activityScan', {}, { timeout: 150000 }).then((scan) => {
        if (!scan || !scan.scanned) return;
        pnl.scanned = true;
        (Array.isArray(scan.leads) ? scan.leads : []).forEach((e) => pnl.pending.push({ ...e, at: 0 }));
        pnl.act.add(Array.isArray(scan.items) ? scan.items : []);
      }).catch(() => {}).finally(() => { pnl.scanning = null; });
    }
    let got = null;
    try { got = await waRequest('convEvents', {}, { timeout: 20000 }); } catch { got = null; }
    const now = Date.now();
    (got && Array.isArray(got.events) ? got.events : []).forEach((e) => pnl.pending.push({ ...e, at: e.scan ? 0 : now }));
    if (pnl.pending.length > 5000) pnl.pending.splice(0, pnl.pending.length - 5000);
    const ready = pnl.pending.filter((e) => now - e.at >= PANEL_DELAY_MS);
    pnl.pending = pnl.pending.filter((e) => now - e.at < PANEL_DELAY_MS);
    const out = ready.length ? pnl.tracker.ingest(ready, isExtSend) : { leads: [], manual: [], replies: [], activity: [] };
    pnl.act.add(out.activity);
    try {
      if (out.leads.length) await panelBatch('saveLeads', out.leads, 500);
      if (out.manual.length) await panelBatch('logManualSends', out.manual, 200);
      if (out.replies.length) await panelBatch('recordReplies', out.replies, 200);
      if (out.activity.length) await panelBatch('touchLeads', out.activity.map((a) => ({ chatId: a.chatId, t: a.lastAt })), 200); // 2.12.2 (depois dos leads)
    } catch (e) {
      if (e.message === 'Atualize o banco para usar este recurso') pnl.off = true;
    }
    await activityFlush(now);
  }
  // no máximo 1 gravação por conversa a cada 30 s (o resto espera na fila, juntando o que chegar)
  async function activityFlush(now = Date.now()) {
    if (pnl.actOff) return;
    const batch = pnl.act.take(now);
    if (!batch.length) return;
    try {
      for (let i = 0; i < batch.length; i += 500) {
        const r = await call('saveChatActivity', { items: batch.slice(i, i + 500) });
        if (r && r.missing) { pnl.actOff = true; return; }
      }
    } catch { pnl.act.putBack(batch); }
  }
  // envio pelo painel (seta, prévia, mídia): registra como mensagem rápida (sem a migration, não faz nada)
  const logQuickSend = (chatId, itemId) => call('logQuickSend', { chat_id: chatId, item_id: itemId || null }).catch(() => {});

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
    // 2.10.5: a última compra REAL já enviada desta conversa e a venda do ERP dela
    const lastBuy = (f.history || []).find((h) => h.event_name !== 'Contact' && !h.test && h.status === 'enviado');
    const lk = lastBuy && saleLinkEl({ eventId: lastBuy.event_id, chatId: f.chatId, phone: f.phone, value: Number(lastBuy.value) }, { auto: true });
    if (lk) sec.append(lk);
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
      // 2.10.5: compra real → liga à venda do ERP
      const fd = cv.form;
      const lk = !cv.done.test && fd && saleLinkEl({ eventId: fd.eventId, chatId: fd.chatId, phone: fd.phone, value: cv.done.value }, { auto: true });
      if (lk) sec.append(lk);
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
      main.append(convLink(el('div', 'sc-who', `${h.contact_name || 'Cliente'} · ${h.event_name === 'Contact' ? 'Contato (lead de anúncio)' : TS.money(h.value)}`), { chatId: h.chat_id, phone: h.phone, name: h.contact_name }),
        el('div', 'sc-prev', `${h.ad_title ? `anúncio: ${h.ad_title}` : 'sem anúncio'} · ${h.method === 'business_messaging' ? 'WhatsApp (clique do anúncio)' : 'chat (telefone)'}${h.test ? ' · teste' : ''}${h.error ? ` · ${h.error}` : ''}`));
      const side = el('div', 'sc-side');
      side.append(el('span', 'sc-when', schedWhen(h.created_at)), el('span', 'sc-status', h.status));
      if (cv.bought && h.chat_id && cv.bought.has(h.chat_id)) main.append(el('span', 'cv-bought', '💰 compra enviada'));
      // 2.10.5: compra real → venda do ERP ligada (ou "Ligar à venda do ERP")
      if (h.linkAvailable && h.event_name !== 'Contact' && !h.test && h.status === 'enviado') {
        const lk = saleLinkEl({ eventId: h.event_id, chatId: h.chat_id, value: Number(h.value), sale: h.sale });
        if (lk) main.append(lk);
      }
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
      convLink(name, () => crmCardTarget(c), () => boardOpenOpts());
      name.title = c.hasNote ? `Abrir conversa · ${title} (tem nota)` : `Abrir conversa · ${title}`;
      const ph = el('div', 'bprev', c.phone ? (c.name ? formatPhone(c.phone) : '') : 'só pelo nome');
      if (c.phone && c.name) convLink(ph, () => crmCardTarget(c), () => boardOpenOpts());
      main.append(name, ph);
      const date = el('span', 'bdate', formatChatDate(isoSeconds(c.addedAt)));
      date.title = 'Entrou nesta etiqueta CRM';
      side.append(date);
    } else {
      const name = el('div', 'bcname', c.name || '—');
      convLink(name, () => ({ chatId: c.id, name: c.name }), () => boardOpenOpts());
      name.title = `Abrir conversa${c.name ? ` · ${c.name}` : ''}`;
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
    const open = () => (c.crm ? openCrmCard(c) : openBoardChat(c.id, c.name));
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

  // 2.14.4: o Quadro abre pela função única openConversation (também conversa não carregada, arquivada e @lid)
  function boardOpenOpts() { return { notify: boardToast, onOpened: closeBoard }; }
  function crmCardTarget(c) { return { phone: c.phone, chatId: c.chat_id || null, name: c.name || null }; }
  async function openBoardChat(chatId, name = null) {
    if (board.opening) return;
    board.opening = true;
    boardStatus('');
    try { await openConversation({ chatId, name }, boardOpenOpts()); } finally { board.opening = false; }
  }

  // Cartão do CRM: abre a conversa pelo telefone do contato (carregada ou não)
  async function openCrmCard(c) {
    if (board.opening) return;
    board.opening = true;
    boardStatus('');
    try { await openConversation(crmCardTarget(c), boardOpenOpts()); } finally { board.opening = false; }
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
    chrome.storage.local.get(['library', 'labels', 'collapsed', 'lastUsed', 'themePref', 'panelSection', 'panelWidth', 'panelPrefs'], (saved) => {
      saved = saved || {};
      if (Number.isFinite(saved.panelWidth)) { state.panelW = saved.panelWidth; applyPanelWidth(saved.panelWidth); } // 2.8.4
      if (saved.panelPrefs) { pz.prefs = globalThis.TspEngine.normPanelPrefs(saved.panelPrefs); applyPrefs(); } // 2.10.2
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
