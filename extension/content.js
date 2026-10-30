// Painel lateral com a biblioteca da aba WhatsApp do ERP, dentro do WhatsApp Web.
// Nunca envia mensagens sozinho: só preenche a caixa de texto ou abre a prévia do anexo.
(() => {
  if (window.__tspWaLoaded) return;
  window.__tspWaLoaded = true;

  const PANEL_W    = 320;
  const ACCENT     = '#f97316';
  const REFRESH_MS = 5 * 60 * 1000;
  const VERSION    = (() => { try { return chrome.runtime.getManifest().version; } catch { return '?'; } })();

  // ── Ícones (traços no estilo lucide) ───────────────────────────────────────

  const ICONS = {
    zap:       '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
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
    chat:      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
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
    open: false, view: 'list', themePref: 'auto', tab: 'mensagens',
    categories: [], items: [], loaded: false, source: null, syncedAt: null,
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

  function fillVars(text, firstName) {
    return firstName ? text.replace(/\{nome\}/gi, firstName) : text;
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

  function call(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const fail = (msg) => reject(new Error(/context invalidated/i.test(msg) ? INVALIDATED_MSG : msg));
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          const err = chrome.runtime.lastError;
          if (err) return fail(err.message);
          if (!res) return fail('Sem resposta da extensão');
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

  function getContext() {
    const conv     = findConversation();
    const composer = conv ? findComposer(conv.root) : null;
    const contact  = conv ? findContact(conv.root) : null;
    const fullName = contact ? contact.text : '';
    const isNumber = !!fullName && /^[+\d\s().-]+$/.test(fullName);
    return {
      conv, composer, contact, fullName, isNumber,
      firstName: fullName && !isNumber ? fullName.split(/\s+/)[0] : '',
      identity: conv ? identifyConversation(conv.root, fullName) : null,
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

  // ── Shadow DOM e layout ────────────────────────────────────────────────────

  // Remove sobras de uma versão anterior da extensão na mesma página
  document.getElementById('tsp-wa-host')?.remove();
  document.getElementById('tsp-wa-layout')?.remove();

  // Empurra o WhatsApp para a esquerda quando o painel está aberto
  const layoutStyle = document.createElement('style');
  layoutStyle.id = 'tsp-wa-layout';
  layoutStyle.textContent = `
    html.tsp-wa-open body { width: calc(100% - ${PANEL_W}px) !important; min-width: 0 !important; }
    html.tsp-wa-open #app { max-width: calc(100vw - ${PANEL_W}px) !important; }
  `;

  const host = document.createElement('div');
  host.id = 'tsp-wa-host';
  host.style.cssText = 'all: initial; position: fixed; top: 0; right: 0; width: 0; height: 0; z-index: 2147483000;';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .root {
        --accent: ${ACCENT}; --accent-soft: rgba(249,115,22,.14);
        --ok: #16a34a; --ok-soft: rgba(34,197,94,.14); --warn: #b45309; --warn-soft: rgba(245,158,11,.16);
        --err: #dc2626; --err-soft: rgba(239,68,68,.13);
        font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px; line-height: 1.35; -webkit-font-smoothing: antialiased;
      }
      .root.light {
        --bg: #ffffff; --bg2: #f0f2f5; --card: #ffffff; --fg: #111b21; --muted: #667781; --border: #e9edef;
        --hover: #f5f6f6; --shadow: rgba(11,20,26,.14); --sk1: #eef0f2; --sk2: #f8f9fa; --bubble: #d9fdd3;
      }
      .root.dark {
        --bg: #111b21; --bg2: #202c33; --card: #182229; --fg: #e9edef; --muted: #8696a0; --border: #2a3942;
        --hover: #202c33; --shadow: rgba(0,0,0,.45); --sk1: #1f2c34; --sk2: #2a3942; --bubble: #005c4b;
        --ok: #4ade80; --warn: #fbbf24; --err: #f87171;
      }
      * { box-sizing: border-box; }
      button { font: inherit; cursor: pointer; color: inherit; }
      button:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; display: block; }
      svg.fill { fill: currentColor; stroke: none; }

      /* Botão do raio */
      .toggle {
        position: fixed; top: 0; left: calc(50% - 20px); width: 40px; height: 22px; padding: 0;
        border: none; border-radius: 0 0 10px 10px; background: var(--accent); color: #fff;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 6px var(--shadow); transition: left .22s ease, height .15s ease;
      }
      .toggle:hover { height: 27px; }
      .toggle svg { width: 13px; height: 13px; }
      .root.open .toggle { left: calc((100% - ${PANEL_W}px) / 2 - 20px); }

      /* Painel */
      .panel {
        position: fixed; top: 0; right: 0; width: ${PANEL_W}px; height: 100vh;
        background: var(--bg); color: var(--fg); border-left: 1px solid var(--border);
        display: flex; flex-direction: column; box-shadow: -2px 0 12px var(--shadow);
        transform: translateX(100%); visibility: hidden; transition: transform .22s ease, visibility .22s;
      }
      .root.open .panel { transform: none; visibility: visible; }

      .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 8px 10px 14px; }
      .brand { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 15px; letter-spacing: -.01em; }
      .logo { width: 26px; height: 26px; border-radius: 7px; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(249,115,22,.35); }
      .logo svg { width: 13px; height: 13px; }
      .actions { display: flex; gap: 1px; }

      .icon-btn { width: 30px; height: 30px; padding: 0; border: none; border-radius: 7px; background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; transition: background .15s, color .15s, opacity .15s; }
      .icon-btn:hover { background: var(--bg2); color: var(--fg); }
      .icon-btn:disabled { opacity: .35; cursor: default; }
      .icon-btn.on { color: var(--accent); background: var(--accent-soft); }

      .status { display: flex; align-items: center; gap: 7px; margin: 0 12px 8px; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 500; transition: background .2s, color .2s; }
      .status .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
      .status .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .status.ok { background: var(--ok-soft); color: var(--ok); }
      .status.warn { background: var(--warn-soft); color: var(--warn); }

      .tools { border-bottom: 1px solid var(--border); }
      .panel.diag .tools { display: none; }
      .search { margin: 0 12px 8px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-radius: 9px; background: var(--bg2); color: var(--muted); border: 1px solid transparent; transition: border-color .15s; }
      .search:focus-within { border-color: var(--accent); }
      .search input { flex: 1; min-width: 0; height: 34px; border: none; outline: none; background: transparent; color: var(--fg); font: inherit; }
      .search input::placeholder { color: var(--muted); }
      .filters { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 12px 10px; }
      .chip { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 11.5px; font-weight: 500; transition: all .15s; }
      .chip:hover { color: var(--fg); border-color: var(--muted); }
      .chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }

      .banner { display: flex; align-items: center; gap: 8px; margin: 8px 12px 0; padding: 7px 10px; border-radius: 8px; background: var(--warn-soft); color: var(--warn); font-size: 12px; }
      .banner[hidden] { display: none; }
      .banner span { flex: 1; }
      .banner button { border: none; background: transparent; padding: 0; text-decoration: underline; font-size: 12px; color: inherit; }

      .list { flex: 1; overflow-y: auto; padding: 8px 10px 10px; scrollbar-width: thin; }
      .list > * { animation: fadeIn .18s ease both; }

      /* Categorias */
      .cat { margin-bottom: 8px; border-radius: 10px; background: var(--bg2); border-left: 3px solid var(--cat); overflow: hidden; }
      .cat-head { width: 100%; display: flex; align-items: center; gap: 7px; padding: 9px 10px; border: none; background: transparent; font-weight: 650; font-size: 12.5px; text-align: left; }
      .cat-head:hover { background: color-mix(in srgb, var(--cat) 8%, transparent); }
      .cat-head .chev { width: 14px; height: 14px; color: var(--cat); transition: transform .2s ease; }
      .cat:not(.collapsed) .cat-head .chev { transform: rotate(90deg); }
      .cat-head .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .count { font-size: 11px; font-weight: 600; color: var(--cat); background: color-mix(in srgb, var(--cat) 15%, transparent); border-radius: 999px; padding: 1px 8px; }
      .cat-body { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .22s ease; }
      .cat.collapsed .cat-body { grid-template-rows: 0fr; }
      .cat-inner { min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 5px; padding: 0 6px 6px; }
      .cat.collapsed .cat-inner { padding-bottom: 0; }

      /* Cartões */
      .card { background: var(--card); border: 1px solid var(--border); border-radius: 9px; transition: border-color .15s, box-shadow .15s; }
      .card:hover, .card:focus-within, .card.pv-open { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); box-shadow: 0 1px 4px var(--shadow); }
      .flat { display: flex; flex-direction: column; gap: 6px; }
      .card-row { display: flex; align-items: center; gap: 9px; padding: 7px 6px 7px 8px; }
      .type { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .type svg { width: 15px; height: 15px; }
      .info { flex: 1; min-width: 0; }
      .info .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .info .sub { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
      .uses { font-size: 10.5px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 1px 6px; flex-shrink: 0; }
      .btns { display: flex; gap: 2px; opacity: .5; transition: opacity .15s; }
      .card:hover .btns, .card:focus-within .btns, .card.pv-open .btns, .card.busy .btns { opacity: 1; }
      .btns .send { color: var(--accent); }
      .btns .send:hover { background: var(--accent-soft); color: var(--accent); }

      /* Prévia */
      .pv-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .22s ease; }
      .card.pv-open .pv-wrap { grid-template-rows: 1fr; }
      .pv-inner { min-height: 0; overflow: hidden; }
      .pv { margin: 0 8px 8px; padding: 10px; border-radius: 8px; background: var(--bg2); display: flex; flex-direction: column; gap: 8px; }
      .pv-media img, .pv-media video { width: 100%; max-height: 200px; object-fit: contain; border-radius: 6px; background: #000; display: block; }
      .pv-media audio { width: 100%; height: 36px; display: block; }
      .pv-media.loading { height: 90px; border-radius: 6px; }
      .pv-note { font-size: 11px; color: var(--muted); }
      .pv-doc { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); font-size: 12px; word-break: break-all; }
      .bubble { align-self: flex-end; max-width: 100%; padding: 7px 9px; border-radius: 8px 0 8px 8px; background: var(--bubble); color: var(--fg); white-space: pre-wrap; word-break: break-word; line-height: 1.45; font-size: 12.5px; box-shadow: 0 1px .5px var(--shadow); }
      .var { color: var(--accent); font-weight: 700; background: var(--accent-soft); border-radius: 4px; padding: 0 2px; }

      /* Esqueleto */
      .sk-cat { margin-bottom: 8px; padding: 10px; border-radius: 10px; background: var(--bg2); display: flex; flex-direction: column; gap: 8px; }
      .sk { border-radius: 6px; background: linear-gradient(90deg, var(--sk1) 25%, var(--sk2) 50%, var(--sk1) 75%); background-size: 200% 100%; animation: shimmer 1.3s linear infinite; }
      .sk-row { display: flex; align-items: center; gap: 9px; padding: 7px; border-radius: 9px; background: var(--card); }
      .sk-ico { width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; }
      .sk-lines { flex: 1; display: flex; flex-direction: column; gap: 6px; }

      /* Estados vazio / erro */
      .empty { padding: 36px 18px; text-align: center; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .empty svg { width: 30px; height: 30px; stroke-width: 1.5; opacity: .7; }
      .empty .h { color: var(--fg); font-weight: 600; font-size: 13.5px; }
      .empty .p { font-size: 12px; max-width: 240px; word-break: break-word; }
      .empty.error svg { color: var(--err); opacity: 1; }
      .btn { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); font-size: 12px; font-weight: 600; transition: border-color .15s, background .15s; }
      .btn:hover { border-color: var(--accent); }
      .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
      .btn.primary:hover { filter: brightness(1.06); }
      .btn svg { width: 14px; height: 14px; }

      /* Diagnóstico */
      .diag-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-weight: 700; font-size: 13.5px; }
      .diag-list { display: flex; flex-direction: column; gap: 6px; }
      .diag-row { display: flex; gap: 9px; padding: 8px 10px; border-radius: 9px; background: var(--bg2); }
      .diag-ico { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
      .diag-ico svg { width: 12px; height: 12px; stroke-width: 3; }
      .diag-ico.ok { background: var(--ok-soft); color: var(--ok); }
      .diag-ico.warn { background: var(--warn-soft); color: var(--warn); }
      .diag-ico.fail { background: var(--err-soft); color: var(--err); }
      .diag-row .l { font-weight: 600; font-size: 12.5px; }
      .diag-row .v { font-size: 11.5px; color: var(--muted); word-break: break-word; margin-top: 1px; }
      .diag-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
      .diag-hint { font-size: 11px; color: var(--muted); margin-top: 10px; }

      /* Etiquetas da conversa */
      .labels { position: relative; display: flex; align-items: flex-start; gap: 8px; margin: -2px 12px 8px; font-size: 12px; }
      .labels .lbl { flex-shrink: 0; color: var(--muted); font-weight: 600; padding-top: 3px; }
      .labels .chips { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-height: 22px; }
      .labels .none { color: var(--muted); padding-top: 3px; }
      .lchip { display: inline-flex; align-items: center; max-width: 100%; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: fadeIn .15s ease both; }
      .root.dark .lchip { box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
      .labels .add { width: 24px; height: 24px; border-radius: 50%; border: 1px dashed var(--muted); background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; transition: all .15s; }
      .labels .add:hover, .labels .add.on { border-style: solid; border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
      .labels .add svg { width: 13px; height: 13px; }
      .labels .add[hidden] { display: none; }
      .name-note { margin: -4px 12px 8px 70px; font-size: 10.5px; color: var(--muted); }
      .name-note[hidden] { display: none; }
      .lmenu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 5; max-height: 280px; overflow-y: auto; padding: 4px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); box-shadow: 0 6px 20px var(--shadow); animation: fadeIn .15s ease both; }
      .lmenu[hidden] { display: none; }
      .lopt { width: 100%; display: flex; align-items: center; gap: 9px; padding: 7px 8px; border: none; border-radius: 7px; background: transparent; text-align: left; font-size: 12.5px; }
      .lopt:hover { background: var(--bg2); }
      .lopt .ldot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
      .lopt .lname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lopt .lcheck { width: 15px; height: 15px; color: var(--accent); stroke-width: 3; }
      .lmenu .lempty { padding: 10px; color: var(--muted); font-size: 12px; text-align: center; }

      /* Abas do painel */
      .tabs { display: flex; gap: 3px; margin: 0 12px 10px; padding: 3px; border-radius: 10px; background: var(--bg2); }
      .tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 8px; border: none; border-radius: 8px; background: transparent; color: var(--muted); font-size: 12.5px; font-weight: 600; transition: background .15s, color .15s; }
      .tab svg { width: 14px; height: 14px; }
      .tab:hover { color: var(--fg); }
      .tab.active { background: var(--card); color: var(--accent); box-shadow: 0 1px 3px var(--shadow); }
      .panel.tab-labels .status, .panel.tab-labels .labels, .panel.tab-labels .name-note,
      .panel.tab-labels .tools, .panel.tab-labels .banner, .panel.tab-labels .list { display: none; }

      /* Aba Etiquetas */
      .ltab { display: none; flex: 1; overflow-y: auto; padding: 0 12px 12px; scrollbar-width: thin; }
      .panel.tab-labels .ltab { display: block; }
      .lt-sec { margin-bottom: 14px; }
      .lt-title { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 2px 2px 8px; }
      .lt-conv { padding: 10px; border-radius: 10px; background: var(--bg2); }
      .lt-who { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13px; margin-bottom: 8px; min-width: 0; }
      .lt-who .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
      .lt-who .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lt-who.ok { color: var(--ok); }
      .lt-who.warn { color: var(--warn); }
      .lt-note { font-size: 10.5px; color: var(--muted); margin: -4px 0 8px; }
      .lt-note[hidden] { display: none; }
      .tchips { display: flex; flex-wrap: wrap; gap: 5px; transition: opacity .15s; }
      .tchips.loading { opacity: .6; }
      .tchip { --c: var(--accent); --on: #fff; display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 4px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600; background: transparent; color: var(--fg); border: 1.5px solid var(--c); transition: background .15s, color .15s, transform .1s; }
      .tchip:hover:not(:disabled) { background: color-mix(in srgb, var(--c) 15%, transparent); }
      .tchip:active:not(:disabled) { transform: scale(.96); }
      .tchip.on, .tchip.on:hover { background: var(--c); color: var(--on); }
      .tchip svg { width: 12px; height: 12px; stroke-width: 3; }
      .tchip .tdot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); flex-shrink: 0; }
      .tchip:disabled { opacity: .45; cursor: default; }
      .lt-none { font-size: 12px; color: var(--muted); }
      .lt-rows { display: flex; flex-direction: column; gap: 5px; }
      .lt-item { border-radius: 9px; border: 1px solid var(--border); background: var(--card); overflow: hidden; transition: border-color .15s; }
      .lt-item.open { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
      .lt-row { width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: none; background: transparent; text-align: left; font-size: 12.5px; }
      .lt-row:hover { background: var(--hover); }
      .lt-row .ldot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
      .lt-row .lname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
      .lt-row .chev { width: 14px; height: 14px; color: var(--muted); transition: transform .2s ease; }
      .lt-item.open .lt-row .chev { transform: rotate(90deg); }
      .lt-count { min-width: 24px; text-align: center; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--bg2); color: var(--muted); }
      .lt-item.open .lt-count { background: var(--accent-soft); color: var(--accent); }
      .lt-body { padding: 0 8px 8px; border-top: 1px solid var(--border); animation: fadeIn .15s ease both; }
      .lt-search { margin: 8px 0 6px; display: flex; align-items: center; gap: 8px; padding: 0 9px; border-radius: 8px; background: var(--bg2); color: var(--muted); border: 1px solid transparent; }
      .lt-search:focus-within { border-color: var(--accent); }
      .lt-search svg { width: 14px; height: 14px; }
      .lt-search input { flex: 1; min-width: 0; height: 30px; border: none; outline: none; background: transparent; color: var(--fg); font: inherit; font-size: 12px; }
      .lt-search input::placeholder { color: var(--muted); }
      .lt-clients { display: flex; flex-direction: column; gap: 1px; }
      .lt-client { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 6px 8px; border: none; border-radius: 7px; background: transparent; text-align: left; }
      .lt-client:hover { background: var(--bg2); }
      .lt-client .n { font-size: 12.5px; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lt-client .p { font-size: 11px; color: var(--muted); }
      .lt-client .p.byname { font-style: italic; color: var(--warn); }
      .lt-more { width: 100%; margin-top: 4px; padding: 6px; border: 1px dashed var(--border); border-radius: 7px; background: transparent; color: var(--accent); font-size: 12px; font-weight: 600; }
      .lt-more:hover:not(:disabled) { border-color: var(--accent); }
      .lt-more:disabled { color: var(--muted); cursor: default; }
      .lt-msg { padding: 10px 6px; font-size: 12px; color: var(--muted); text-align: center; }
      .lt-msg.err { color: var(--err); }
      .lt-msg button { margin-left: 6px; border: none; background: transparent; padding: 0; color: inherit; text-decoration: underline; font-size: 12px; }
      .lt-sk { display: flex; flex-direction: column; gap: 6px; padding: 8px 6px; }
      .lt-hint { position: sticky; bottom: 0; margin-top: 10px; padding: 9px 10px; border-radius: 9px; background: var(--card); border: 1px solid var(--accent); color: var(--fg); font-size: 12px; line-height: 1.45; box-shadow: 0 -4px 12px var(--bg); animation: fadeIn .15s ease both; }
      .lt-hint.warn { border-color: var(--warn); }
      .lt-hint[hidden] { display: none; }
      .lt-hint b { color: var(--accent); }
      .lt-hint.warn b { color: var(--warn); }
      .lt-hint .manual { margin-top: 4px; font-weight: 600; word-break: break-word; }

      /* Aviso e rodapé */
      .toast { margin: 0 12px; max-height: 0; padding: 0 10px; border-radius: 8px; font-size: 12px; opacity: 0; overflow: hidden; transition: all .2s ease; }
      .toast.show { max-height: 80px; padding: 8px 10px; margin-bottom: 8px; opacity: 1; }
      .toast.info  { background: var(--bg2); color: var(--fg); }
      .toast.ok    { background: var(--ok-soft); color: var(--ok); }
      .toast.warn  { background: var(--warn-soft); color: var(--warn); }
      .toast.error { background: var(--err-soft); color: var(--err); }
      .foot { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-top: 1px solid var(--border); font-size: 11.5px; color: var(--muted); }
      .foot .last { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .foot b { color: var(--fg); font-weight: 600; }
      .foot .ver { flex-shrink: 0; font-size: 10.5px; opacity: .8; }

      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes shimmer { to { background-position: -200% 0; } }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(3px); } }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
      }
    </style>
    <div class="root light">
      <button class="toggle" type="button" title="Mensagens (Triumph Store)" aria-label="Abrir ou fechar mensagens">${svg('zap', 'fill')}</button>
      <aside class="panel" aria-label="Mensagens">
        <header class="head">
          <div class="brand"><span class="logo">${svg('zap', 'fill')}</span>Mensagens</div>
          <div class="actions"></div>
        </header>
        <div class="tabs" role="tablist">
          <button class="tab" type="button" role="tab" data-tab="mensagens">${svg('chat')}Mensagens</button>
          <button class="tab" type="button" role="tab" data-tab="etiquetas">${svg('tag')}Etiquetas</button>
        </div>
        <div class="status warn"><span class="dot"></span><span class="txt"></span></div>
        <div class="labels">
          <span class="lbl">Etiquetas</span>
          <div class="chips"></div>
          <button class="add" type="button" title="Marcar etiquetas" aria-label="Marcar etiquetas" aria-haspopup="true" aria-expanded="false" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>
          <div class="lmenu" role="menu" hidden></div>
        </div>
        <div class="name-note" hidden title="Sem telefone visível nesta conversa: a etiqueta fica ligada ao nome do contato. Se o nome mudar, ela não acompanha.">identificado só pelo nome</div>
        <div class="tools">
          <label class="search">${svg('search')}<input type="text" placeholder="Pesquisar resposta rápida" aria-label="Pesquisar resposta rápida" /></label>
          <div class="filters" role="group" aria-label="Filtros"></div>
        </div>
        <div class="banner" hidden>${svg('wifiOff')}<span>Sem conexão: mostrando a última versão</span><button type="button">Tentar de novo</button></div>
        <div class="list"></div>
        <div class="ltab" role="tabpanel" aria-label="Etiquetas">
          <section class="lt-sec">
            <div class="lt-title">Esta conversa</div>
            <div class="lt-conv">
              <div class="lt-who warn"><span class="dot"></span><span class="txt"></span></div>
              <div class="lt-note" hidden>identificado só pelo nome</div>
              <div class="tchips"></div>
            </div>
          </section>
          <section class="lt-sec">
            <div class="lt-title">Todas as etiquetas</div>
            <div class="lt-rows"></div>
          </section>
          <div class="lt-hint" role="status" aria-live="polite" hidden></div>
        </div>
        <div class="toast" role="status" aria-live="polite"></div>
        <footer class="foot"><span class="last">Último usado: <b>—</b></span><span class="ver"></span></footer>
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
  const lastEl    = shadow.querySelector('.foot b');
  const labelsEl  = shadow.querySelector('.labels');
  const lchipsEl  = shadow.querySelector('.labels .chips');
  const laddBtn   = shadow.querySelector('.labels .add');
  const lmenuEl   = shadow.querySelector('.lmenu');
  const nameNote  = shadow.querySelector('.name-note');
  const tabBtns   = [...shadow.querySelectorAll('.tab')];
  const ltabEl    = shadow.querySelector('.ltab');
  const ltWho     = shadow.querySelector('.lt-who');
  const ltWhoTxt  = shadow.querySelector('.lt-who .txt');
  const ltNote    = shadow.querySelector('.lt-note');
  const ltChips   = shadow.querySelector('.tchips');
  const ltRowsEl  = shadow.querySelector('.lt-rows');
  const ltHint    = shadow.querySelector('.lt-hint');

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

  // Re-injeta o painel e o estilo se o WhatsApp recriar a página
  function ensureInjected() {
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (!layoutStyle.isConnected) (document.head || document.documentElement).appendChild(layoutStyle);
    const html = document.documentElement;
    if (html.classList.contains('tsp-wa-open') !== state.open) html.classList.toggle('tsp-wa-open', state.open);
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
      refreshTimer = setInterval(() => sync(), REFRESH_MS);
      sync();
      restartLabelsTabTimer();
      if (state.tab === 'etiquetas') refreshLabelsTab();
    } else {
      clearTimeout(convTimer);
      restartLabelsTabTimer();
      setMenuOpen(false);
      if (state.view === 'diag') showList();
    }
  }

  toggleBtn.addEventListener('click', () => setOpen(!state.open));

  // Teclas dentro do painel não vão para os atalhos do WhatsApp; Esc fecha
  ['keydown', 'keypress', 'keyup'].forEach((type) => panel.addEventListener(type, (e) => {
    if (type === 'keydown' && e.key === 'Escape') {
      e.preventDefault();
      if (state.menuOpen) {
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
  }

  async function loadConvLabels(key) {
    const identity = state.ctx && state.ctx.identity;
    if (!canLabel(identity) || identity.key !== key) return;
    try {
      const ids = await call('getContactLabels', { identity: identityPayload(identity) });
      convCache.set(key, ids);
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

  function renderMenu() {
    lmenuEl.textContent = '';
    if (!state.labels.length) {
      lmenuEl.append(el('div', 'lempty', state.labelsLoaded
        ? 'Nenhuma etiqueta. Crie na aba WhatsApp do ERP (Etiquetas).'
        : 'Carregando etiquetas...'));
      return;
    }
    state.labels.forEach((l) => {
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
      const ids = await call('setContactLabel', { identity: identityPayload(identity), labelId, on });
      if (pendingLabelOps === 1) apply(ids);
      afterLabelChange();
    } catch {
      apply(on ? current().filter((id) => id !== labelId) : [...current(), labelId]);
      toast('Não consegui salvar', 'error');
    } finally {
      pendingLabelOps--;
    }
  }

  // ── Abas do painel ─────────────────────────────────────────────────────────

  function setTab(tab, { persist = true } = {}) {
    state.tab = tab === 'etiquetas' ? 'etiquetas' : 'mensagens';
    panel.classList.toggle('tab-labels', state.tab === 'etiquetas');
    tabBtns.forEach((b) => {
      const active = b.dataset.tab === state.tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    if (persist) storageSet({ panelTab: state.tab });
    setMenuOpen(false);
    restartLabelsTabTimer();
    if (state.tab === 'etiquetas' && state.open) refreshLabelsTab();
  }

  tabBtns.forEach((b) => b.addEventListener('click', () => {
    if (state.view === 'diag') showList();
    setTab(b.dataset.tab);
  }));

  // ── Aba Etiquetas ──────────────────────────────────────────────────────────

  const labelsTabActive = () => state.open && state.tab === 'etiquetas';

  function restartLabelsTabTimer() {
    clearInterval(lt.timer);
    if (labelsTabActive()) lt.timer = setInterval(refreshLabelsTab, 60 * 1000);
  }

  async function refreshLabelsTab() {
    await Promise.all([syncLabels(), loadCounts()]);
    renderAllLabels();
    if (lt.openId) loadClients({ reset: true });
  }

  function afterLabelChange() {
    if (!labelsTabActive()) return;
    loadCounts();
    if (lt.openId) loadClients({ reset: true });
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

    if (!state.labels.length) {
      ltChips.append(el('span', 'lt-none', state.labelsLoaded
        ? 'Nenhuma etiqueta. Crie na aba WhatsApp do ERP (Etiquetas).'
        : 'Carregando etiquetas...'));
      return;
    }
    state.labels.forEach((l) => {
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
    if (!warning && state.convError) ltChips.append(el('span', 'lt-none', 'Não consegui carregar as etiquetas desta conversa.'));
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

  // "Todas as etiquetas": só reconstrói quando a lista muda (não tira o foco da busca)
  function renderAllLabels() {
    const labelsFailed = !state.labelsLoaded && !!state.labelsError;
    const sig = JSON.stringify([state.labelsLoaded, labelsFailed, state.labels.map((l) => [l.id, l.name, l.color]), lt.openId, !lt.counts && !!lt.countsError]);
    if (sig !== lt.rowsSig) {
      lt.rowsSig = sig;
      ltRowsEl.textContent = '';
      if (lt.openId && !state.labels.some((l) => l.id === lt.openId)) lt.openId = null;

      if (labelsFailed) {
        ltRowsEl.append(ltMessage('Não consegui carregar as etiquetas.', { error: true, retry: refreshLabelsTab }));
      } else if (!state.labelsLoaded) {
        ltRowsEl.append(ltSkeleton(3));
      } else if (!state.labels.length) {
        ltRowsEl.append(ltMessage('Nenhuma etiqueta. Crie na aba WhatsApp do ERP (Etiquetas).'));
      } else {
        if (!lt.counts && lt.countsError) {
          ltRowsEl.append(ltMessage('Não consegui carregar os contadores.', { error: true, retry: loadCounts }));
        }
        state.labels.forEach((l) => {
          const open = lt.openId === l.id;
          const item = el('div', `lt-item${open ? ' open' : ''}`);
          item.dataset.id = l.id;
          const row = el('button', 'lt-row');
          row.type = 'button';
          row.setAttribute('aria-expanded', String(open));
          const dot = el('span', 'ldot');
          dot.style.background = l.color;
          row.append(dot, el('span', 'lname', l.name), el('span', 'lt-count', '…'));
          row.insertAdjacentHTML('beforeend', svg('chevron', 'chev'));
          row.addEventListener('click', () => toggleLabelOpen(l.id));
          item.append(row);
          if (open) {
            const body = el('div', 'lt-body');
            body.append(ltSearchWrap, ltClientsEl);
            item.append(body);
          }
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

  let toastTimer = null;
  function toast(text, kind = 'info', ms = 4000) {
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.className = `toast show ${kind}`;
    if (ms) toastTimer = setTimeout(() => { toastEl.className = `toast ${kind}`; }, ms);
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
    if (state.view === 'diag') return;
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
    if (!state.items.length) {
      listEl.append(stateBox('inbox', 'Nenhuma mensagem cadastrada.', 'Cadastre na aba WhatsApp do ERP e depois tente de novo.', true));
      return;
    }

    const items = visibleItems();
    if (!items.length) {
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
      state.categories.forEach((cat) => {
        const catItems = items.filter((i) => i.category_id === cat.id);
        if (catItems.length) listEl.append(categoryEl(cat, catItems, searching));
      });
    }
    listEl.scrollTop = scroll;
  }

  function categoryEl(cat, catItems, searching) {
    const section = el('section', 'cat');
    section.style.setProperty('--cat', catColor(cat.id));
    if (!searching && state.collapsed[cat.id]) section.classList.add('collapsed');

    const head = el('button', 'cat-head');
    head.type = 'button';
    head.innerHTML = svg('chevron', 'chev');
    head.append(el('span', 'name', cat.name), el('span', 'count', String(catItems.length)));
    head.setAttribute('aria-expanded', String(!section.classList.contains('collapsed')));
    head.addEventListener('click', () => {
      const collapsed = section.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', String(!collapsed));
      state.collapsed[cat.id] = collapsed;
      storageSet({ collapsed: state.collapsed });
    });

    const body  = el('div', 'cat-body');
    const inner = el('div', 'cat-inner');
    catItems.forEach((i) => inner.append(cardEl(i)));
    body.append(inner);
    section.append(head, body);
    return section;
  }

  function subtitle(item) {
    if (item.type === 'texto') return firstWords(item.body) || 'Sem texto';
    const parts = [item.file_name, formatSize(item.file_size)].filter(Boolean);
    return parts.join(' · ') || TYPES[item.type]?.label || '';
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
    const t = el('div', 't', item.title);
    t.title = item.title;
    const sub = el('div', 'sub', subtitle(item));
    sub.title = sub.textContent;
    info.append(t, sub);
    row.append(type, info);
    if (showUses) row.append(el('span', 'uses', `${item.usage_count}x`));

    const btns = el('div', 'btns');
    const eye  = iconButton('eye', 'Prévia', () => togglePreview(item, card, eye));
    eye.setAttribute('aria-pressed', 'false');
    const send = iconButton('send', 'Colocar na conversa', () => sendItem(item, card, send), 'send');
    btns.append(eye, send);
    row.append(btns);

    const wrap  = el('div', 'pv-wrap');
    const inner = el('div', 'pv-inner');
    wrap.append(inner);
    card.append(row, wrap);

    if (state.previewId === item.id) {
      fillPreview(inner, item);
      card.classList.add('pv-open');
      eye.classList.add('on');
      eye.setAttribute('aria-pressed', 'true');
    }
    if (state.busyId === item.id) setBusy(card, send, true);
    else if (state.busyId) send.disabled = true;
    return card;
  }

  // ── Prévia ─────────────────────────────────────────────────────────────────

  function togglePreview(item, card, eye) {
    const opening = state.previewId !== item.id;
    if (state.previewId) {
      const prev = listEl.querySelector(`.card[data-id="${state.previewId}"]`);
      if (prev) {
        prev.classList.remove('pv-open');
        const prevEye = prev.querySelector('.btns .icon-btn');
        prevEye.classList.remove('on');
        prevEye.setAttribute('aria-pressed', 'false');
      }
    }
    state.previewId = opening ? item.id : null;
    if (opening) {
      fillPreview(card.querySelector('.pv-inner'), item);
      requestAnimationFrame(() => card.classList.add('pv-open'));
      eye.classList.add('on');
      eye.setAttribute('aria-pressed', 'true');
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

    if (item.body) {
      const slot = el('div', 'bubble-slot');
      fillBubble(slot, item);
      pv.append(slot);
    } else if (item.type === 'texto' || !item.file_url) {
      pv.append(el('div', 'pv-note', 'Sem conteúdo.'));
    }
    inner.append(pv);
  }

  // Como o texto vai ficar na conversa aberta
  function fillBubble(slot, item) {
    slot.textContent = '';
    slot.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
    const bubble = el('div', 'bubble');
    const firstName = state.ctx ? state.ctx.firstName : '';
    const unresolved = appendResolved(bubble, item.body, firstName);
    slot.append(bubble);
    const notes = [];
    if (/\{nome\}/i.test(item.body)) {
      notes.push(firstName ? `{nome} trocado por "${firstName}".` : '{nome} será trocado quando houver um contato com nome aberto.');
    }
    if (unresolved) notes.push('Em laranja: variáveis que você troca à mão antes de enviar.');
    if (notes.length) slot.append(el('div', 'pv-note', notes.join(' ')));
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
    listEl.querySelectorAll('.btns .send').forEach((b) => { b.disabled = busy; });
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

  async function sendItem(item, card, send) {
    if (state.busyId) return;
    const ctx = getContext();
    state.ctx = ctx;
    if (!ctx.composer) { toast('Abra uma conversa', 'warn'); return; }
    const composer = ctx.composer.el;

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
      toast('Baixando arquivo...', 'info', 0);
      const blob = await getFile(item);
      const file = new File([blob], item.file_name || 'arquivo', { type: blob.type });
      const caption = await attachFile(composer, file);
      if (!caption) {
        toast('O WhatsApp não abriu a prévia do anexo. Se ela abriu, confira antes de enviar.', 'warn', 6000);
        return;
      }
      registerUse(item);
      if (!text.trim()) {
        toast('Arquivo anexado. Confira e envie.', 'ok');
      } else if (await insertText(caption, text)) {
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
      else listEl.querySelectorAll('.btns .send').forEach((b) => { b.disabled = false; });
      if (state.filter === 'mais_usadas') renderList();
    }
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
      { label: 'Conversa detectada', status: ctx.conv ? 'ok' : 'warn', screen: ctx.conv ? `sim (${ctx.conv.via})` : 'nenhuma conversa aberta' },
      { label: 'Caixa de mensagem', status: ctx.composer ? 'ok' : (ctx.conv ? 'fail' : 'warn'), screen: ctx.composer ? `encontrada (${ctx.composer.via})` : 'não encontrada' },
      { label: 'Nome do contato', status: contact.status, screen: contact.screen, copy: contact.copy },
      { label: 'Identificação da conversa', ...identityDiag(ctx) },
      {
        label: 'Etiquetas carregadas',
        status: state.labelsLoaded ? (state.labelsError ? 'warn' : 'ok') : 'fail',
        screen: state.labelsLoaded
          ? `${state.labels.length} (${state.labelsSource === 'servidor' ? 'do servidor' : 'do cache local'}, ${timeStr(state.labelsSyncedAt)})${state.labelsError ? ` · última atualização falhou: ${state.labelsError}` : ''}`
          : `não carregadas${state.labelsError ? `: ${state.labelsError}` : ''}`,
      },
      {
        label: 'Aba Etiquetas: contadores carregados',
        status: lt.counts ? 'ok' : lt.countsError ? 'fail' : 'warn',
        screen: lt.counts
          ? `sim (${timeStr(lt.countsAt)})${lt.countsError ? ` · última atualização falhou: ${lt.countsError}` : ''}`
          : lt.countsError ? `não: ${lt.countsError}` : 'não (abra a aba Etiquetas)',
      },
      { label: 'Tema', status: 'ok', screen: `${THEME_PREFS[state.themePref].label} → ${appliedDark() ? 'escuro' : 'claro'} (WhatsApp ${whatsappIsDark() ? 'escuro' : 'claro'})` },
      { label: 'Página do WhatsApp', status: document.querySelector('#app') ? 'ok' : 'fail', screen: document.querySelector('#app') ? '#app encontrado' : '#app não encontrado' },
      { label: 'Painel na página', status: host.isConnected && layoutStyle.isConnected ? 'ok' : 'fail', screen: host.isConnected && layoutStyle.isConnected ? 'injetado' : 'faltando (será re-injetado)' },
    ];
    return rows;
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

    listEl.append(head, list, actionsRow,
      el('div', 'diag-hint', 'O texto copiado não inclui nomes de contatos nem mensagens.'));
  }

  function showDiag() {
    if (state.tab !== 'mensagens') setTab('mensagens', { persist: false });
    state.view = 'diag';
    panel.classList.add('diag');
    diagBtn.classList.add('on');
    renderBanner();
    listEl.scrollTop = 0;
    renderDiag();
    sync();
  }

  function showList() {
    state.view = 'list';
    panel.classList.remove('diag');
    diagBtn.classList.remove('on');
    renderList();
  }

  // ── Início: mostra o cache na hora ─────────────────────────────────────────

  renderThemeButton();
  renderFilters();
  renderLastUsed();
  renderLabelsRow();
  renderAllLabels();
  setTab('mensagens', { persist: false });
  renderList();
  try {
    chrome.storage.local.get(['library', 'labels', 'collapsed', 'lastUsed', 'themePref', 'panelTab'], (saved) => {
      saved = saved || {};
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
      setTab(saved.panelTab, { persist: false });
      renderThemeButton();
      applyTheme();
      renderLastUsed();
      renderList();
    });
  } catch { /* extensão recarregada */ }
})();
