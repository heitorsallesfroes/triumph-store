// Painel lateral com a biblioteca da aba WhatsApp do ERP, dentro do WhatsApp Web.
// Nunca envia mensagens sozinho: só preenche a caixa de texto ou abre a prévia do anexo.
(() => {
  if (window.__tspWaLoaded) return;
  window.__tspWaLoaded = true;

  const PANEL_W = 320;
  const ACCENT  = '#f97316';

  // ── Ícones (traços no estilo lucide) ───────────────────────────────────────

  const ICONS = {
    zap:       '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    eye:       '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    send:      '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    search:    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    refresh:   '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    x:         '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevron:   '<path d="m9 18 6-6-6-6"/>',
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

  const MIME_BY_EXT = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
    pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  // ── Estado ─────────────────────────────────────────────────────────────────

  const state = {
    open: false, loading: false, loaded: false, error: null,
    categories: [], items: [],
    search: '', filter: 'tudo',
    collapsed: {}, previewId: null, busyId: null, lastUsed: '',
  };
  const fileCache   = new Map(); // item.id -> Promise<Blob>
  const previewUrls = new Map(); // item.id -> blob: URL

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

  function iconButton(icon, title, onClick, cls = '') {
    const b = el('button', `icon-btn ${cls}`);
    b.type = 'button';
    b.title = title;
    b.innerHTML = svg(icon);
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function formatSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function appendWithVars(target, text) {
    text.split(/(\{[^{}\s]+\})/g).forEach((part) => {
      if (/^\{[^{}\s]+\}$/.test(part)) target.appendChild(el('span', 'var', part));
      else if (part) target.appendChild(document.createTextNode(part));
    });
  }

  function isVisible(node) {
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ── Comunicação com o background ───────────────────────────────────────────

  function call(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const invalidated = () => reject(new Error('A extensão foi atualizada. Recarregue o WhatsApp (F5).'));
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          const err = chrome.runtime.lastError;
          if (err) return /context invalidated/i.test(err.message) ? invalidated() : reject(new Error(err.message));
          if (!res) return reject(new Error('Sem resposta da extensão'));
          res.ok ? resolve(res.data) : reject(new Error(res.error));
        });
      } catch (e) {
        /context invalidated/i.test(String(e && e.message)) ? invalidated() : reject(e);
      }
    });
  }

  function storageSet(obj) {
    try { chrome.storage.local.set(obj); } catch { /* extensão recarregada */ }
  }

  // ── WhatsApp Web: conversa aberta, contato e caixas de texto ───────────────

  function getComposer() {
    const main = document.querySelector('#main');
    if (!main) return null;
    return main.querySelector('footer div[contenteditable="true"]')
      || main.querySelector('div[contenteditable="true"][role="textbox"]');
  }

  function contactName() {
    const header = document.querySelector('#main header');
    if (!header) return '';
    for (const span of header.querySelectorAll('span[dir="auto"]')) {
      const t = (span.getAttribute('title') || span.textContent || '').trim();
      if (t) return t;
    }
    return '';
  }

  // Primeiro nome do contato; vazio se o "nome" for só um número de telefone
  function contactFirstName() {
    const full = contactName();
    if (!full || /^[+\d\s().-]+$/.test(full)) return '';
    return full.split(/\s+/)[0];
  }

  function fillVars(text, firstName) {
    return firstName ? text.replace(/\{nome\}/gi, firstName) : text;
  }

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

  // Espera surgir uma caixa editável nova (a legenda da prévia de anexo)
  async function waitForNewEditable(before, composer, timeout) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      for (const node of document.querySelectorAll('[contenteditable="true"]')) {
        if (!before.has(node) && node !== composer && isVisible(node)) return node;
      }
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
    return waitForNewEditable(before, composer, 6000);
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  // ── Arquivos ───────────────────────────────────────────────────────────────

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
    if (!fileCache.has(item.id)) {
      const p = call('fetchFile', { url: item.file_url })
        .then((d) => base64ToBlob(d.base64, guessMime(item, d.mime)));
      p.catch(() => fileCache.delete(item.id));
      fileCache.set(item.id, p);
    }
    return fileCache.get(item.id);
  }

  async function getBlobUrl(item) {
    if (!previewUrls.has(item.id)) previewUrls.set(item.id, URL.createObjectURL(await getFile(item)));
    return previewUrls.get(item.id);
  }

  // ── Shadow DOM e layout ────────────────────────────────────────────────────

  // Empurra o WhatsApp para a esquerda quando o painel está aberto
  const layoutStyle = document.createElement('style');
  layoutStyle.id = 'tsp-wa-layout';
  layoutStyle.textContent = `
    html.tsp-wa-open body { width: calc(100% - ${PANEL_W}px) !important; min-width: 0 !important; }
    html.tsp-wa-open #app { max-width: calc(100vw - ${PANEL_W}px) !important; }
  `;
  (document.head || document.documentElement).appendChild(layoutStyle);

  const host = document.createElement('div');
  host.id = 'tsp-wa-host';
  host.style.cssText = 'all: initial; position: fixed; top: 0; right: 0; width: 0; height: 0; z-index: 2147483000;';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .root {
        --accent: ${ACCENT};
        font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px; line-height: 1.35;
      }
      .root.light { --bg: #ffffff; --bg2: #f0f2f5; --fg: #111b21; --muted: #667781; --border: #e9edef; --hover: #f5f6f6; --shadow: rgba(11,20,26,.14); }
      .root.dark  { --bg: #111b21; --bg2: #202c33; --fg: #e9edef; --muted: #8696a0; --border: #2a3942; --hover: #1d2930; --shadow: rgba(0,0,0,.45); }
      * { box-sizing: border-box; }
      button { font: inherit; cursor: pointer; }
      svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; display: block; }
      svg.fill { fill: currentColor; stroke: none; }

      .toggle {
        position: fixed; top: 0; left: calc(50% - 20px); width: 40px; height: 22px; padding: 0;
        border: none; border-radius: 0 0 10px 10px; background: var(--accent); color: #fff;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 6px var(--shadow); transition: left .2s ease, height .15s ease;
      }
      .toggle:hover { height: 27px; }
      .toggle svg { width: 13px; height: 13px; }
      .root.open .toggle { left: calc((100% - ${PANEL_W}px) / 2 - 20px); }

      .panel {
        position: fixed; top: 0; right: 0; width: ${PANEL_W}px; height: 100vh;
        background: var(--bg); color: var(--fg); border-left: 1px solid var(--border);
        display: flex; flex-direction: column; box-shadow: -2px 0 10px var(--shadow);
        transform: translateX(100%); visibility: hidden; transition: transform .2s ease, visibility .2s;
      }
      .root.open .panel { transform: none; visibility: visible; }

      .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 10px 10px 14px; border-bottom: 1px solid var(--border); }
      .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
      .logo { width: 24px; height: 24px; border-radius: 6px; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; }
      .logo svg { width: 12px; height: 12px; }
      .actions { display: flex; gap: 2px; }

      .icon-btn { width: 28px; height: 28px; padding: 0; border: none; border-radius: 6px; background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; }
      .icon-btn:hover { background: var(--bg2); color: var(--fg); }
      .icon-btn.on { color: var(--accent); }
      .icon-btn.send { color: var(--accent); }
      .icon-btn.send:hover { background: rgba(249,115,22,.14); color: var(--accent); }
      .icon-btn:disabled { opacity: .4; cursor: default; }

      .search { margin: 10px 12px 6px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-radius: 8px; background: var(--bg2); color: var(--muted); }
      .search input { flex: 1; min-width: 0; height: 32px; border: none; outline: none; background: transparent; color: var(--fg); font: inherit; }
      .search input::placeholder { color: var(--muted); }

      .filters { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 12px 10px; border-bottom: 1px solid var(--border); }
      .chip { padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 11.5px; }
      .chip:hover { color: var(--fg); }
      .chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }

      .list { flex: 1; overflow-y: auto; padding: 6px 0; }
      .cat-head { width: 100%; display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: none; background: transparent; color: var(--fg); font-weight: 600; font-size: 12px; text-align: left; }
      .cat-head:hover { background: var(--hover); }
      .cat-head .chev { width: 14px; height: 14px; color: var(--muted); transition: transform .15s; }
      .cat-head.expanded .chev { transform: rotate(90deg); }
      .cat-head .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .count { font-size: 11px; color: var(--muted); background: var(--bg2); border-radius: 999px; padding: 1px 7px; font-weight: 500; }

      .item { padding: 0 8px; }
      .row { display: flex; align-items: center; gap: 8px; padding: 5px 4px 5px 20px; border-radius: 8px; }
      .flat .row { padding-left: 4px; }
      .row:hover { background: var(--hover); }
      .type { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
      .type svg { width: 14px; height: 14px; }
      .title { flex: 1; min-width: 0; }
      .title .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .title .sub { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .preview { margin: 2px 4px 8px 24px; padding: 8px; border-radius: 8px; background: var(--bg2); font-size: 12px; }
      .flat .preview { margin-left: 8px; }
      .preview img, .preview video { width: 100%; max-height: 180px; object-fit: contain; border-radius: 6px; background: #000; display: block; }
      .preview audio { width: 100%; height: 34px; display: block; }
      .preview .body { white-space: pre-wrap; word-break: break-word; line-height: 1.45; }
      .preview > * + * { margin-top: 6px; }
      .preview .meta { color: var(--muted); font-size: 11px; word-break: break-all; }
      .var { color: var(--accent); font-weight: 600; }

      .msg { padding: 28px 16px; text-align: center; color: var(--muted); }
      .msg button { margin-top: 10px; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--fg); }

      .toast { display: none; margin: 0 12px 8px; padding: 8px 10px; border-radius: 8px; font-size: 12px; }
      .toast.show { display: block; }
      .toast.info  { background: var(--bg2); color: var(--fg); }
      .toast.ok    { background: rgba(34,197,94,.14); color: #16a34a; }
      .toast.warn  { background: rgba(234,179,8,.16); color: #b45309; }
      .toast.error { background: rgba(239,68,68,.14); color: #dc2626; }
      .root.dark .toast.ok   { color: #4ade80; }
      .root.dark .toast.warn { color: #facc15; }
      .root.dark .toast.error { color: #f87171; }

      .foot { padding: 9px 14px; border-top: 1px solid var(--border); font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .foot b { color: var(--fg); font-weight: 600; }

      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <div class="root light">
      <button class="toggle" type="button" title="Biblioteca Triumph Store">${svg('zap', 'fill')}</button>
      <aside class="panel">
        <header class="head">
          <div class="brand"><span class="logo">${svg('zap', 'fill')}</span>Biblioteca</div>
          <div class="actions"></div>
        </header>
        <label class="search">${svg('search')}<input type="text" placeholder="Buscar por título..." /></label>
        <div class="filters"></div>
        <div class="list"></div>
        <div class="toast"></div>
        <footer class="foot">Último usado: <b>—</b></footer>
      </aside>
    </div>
  `;

  const root      = shadow.querySelector('.root');
  const toggleBtn = shadow.querySelector('.toggle');
  const actions   = shadow.querySelector('.actions');
  const searchIn  = shadow.querySelector('.search input');
  const filtersEl = shadow.querySelector('.filters');
  const listEl    = shadow.querySelector('.list');
  const toastEl   = shadow.querySelector('.toast');
  const lastEl    = shadow.querySelector('.foot b');

  const refreshBtn = iconButton('refresh', 'Atualizar biblioteca', () => load());
  actions.append(refreshBtn, iconButton('x', 'Fechar', () => setOpen(false)));

  // ── Tema (segue o WhatsApp) ────────────────────────────────────────────────

  function detectDark() {
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

  function applyTheme() {
    const dark = detectDark();
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
  }

  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  setInterval(applyTheme, 5000);
  applyTheme();

  // ── Abrir / fechar ─────────────────────────────────────────────────────────

  function setOpen(open) {
    state.open = open;
    root.classList.toggle('open', open);
    document.documentElement.classList.toggle('tsp-wa-open', open);
    window.dispatchEvent(new Event('resize'));
    if (open) {
      applyTheme();
      if (!state.loaded && !state.loading) load();
    }
  }

  toggleBtn.addEventListener('click', () => setOpen(!state.open));

  // ── Busca e filtros ────────────────────────────────────────────────────────

  // Evita que os atalhos de teclado do WhatsApp roubem o foco da busca
  ['keydown', 'keypress', 'keyup'].forEach((t) => searchIn.addEventListener(t, (e) => e.stopPropagation()));
  searchIn.addEventListener('input', () => { state.search = searchIn.value; renderList(); });

  FILTERS.forEach(([id, label]) => {
    const chip = el('button', 'chip', label);
    chip.type = 'button';
    chip.dataset.id = id;
    chip.addEventListener('click', () => { state.filter = id; renderFilters(); renderList(); });
    filtersEl.appendChild(chip);
  });

  function renderFilters() {
    filtersEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.id === state.filter));
  }

  // ── Toast e rodapé ─────────────────────────────────────────────────────────

  let toastTimer = null;
  function toast(text, kind = 'info', ms = 4000) {
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.className = `toast show ${kind}`;
    if (ms) toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, ms);
  }

  function renderLastUsed() {
    lastEl.textContent = state.lastUsed || '—';
    lastEl.title = state.lastUsed || '';
  }

  // ── Dados ──────────────────────────────────────────────────────────────────

  async function load() {
    state.loading = true;
    state.error = null;
    refreshBtn.querySelector('svg').classList.add('spin');
    renderList();
    try {
      const { categories, items } = await call('fetchLibrary');
      state.categories = categories;
      state.items = items;
      state.loaded = true;
      fileCache.clear();
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
      previewUrls.clear();
    } catch (e) {
      state.error = e.message;
    } finally {
      state.loading = false;
      refreshBtn.querySelector('svg').classList.remove('spin');
      renderList();
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

  function message(text, retry) {
    const box = el('div', 'msg', text);
    if (retry) {
      const b = el('button', null, 'Tentar de novo');
      b.type = 'button';
      b.addEventListener('click', load);
      box.appendChild(el('br'));
      box.appendChild(b);
    }
    listEl.appendChild(box);
  }

  function renderList() {
    const scroll = listEl.scrollTop;
    listEl.textContent = '';
    if (state.error) return message(`Erro ao carregar: ${state.error}`, true);
    if (!state.loaded) return message('Carregando...');

    const items = visibleItems();
    if (!items.length) {
      return message(state.filter === 'mais_usadas' ? 'Nenhum item usado ainda.' : 'Nenhum item encontrado.');
    }

    const catName = new Map(state.categories.map((c) => [c.id, c.name]));

    if (state.filter === 'mais_usadas') {
      const flat = el('div', 'flat');
      items.forEach((i) => flat.appendChild(itemEl(i, catName.get(i.category_id))));
      listEl.appendChild(flat);
    } else {
      const searching = state.search.trim() !== '';
      state.categories.forEach((cat) => {
        const catItems = items.filter((i) => i.category_id === cat.id);
        if (!catItems.length) return;
        const expanded = searching || !state.collapsed[cat.id];

        const head = el('button', `cat-head${expanded ? ' expanded' : ''}`);
        head.type = 'button';
        head.innerHTML = svg('chevron', 'chev');
        head.append(el('span', 'name', cat.name), el('span', 'count', String(catItems.length)));
        head.addEventListener('click', () => {
          state.collapsed[cat.id] = expanded;
          storageSet({ collapsed: state.collapsed });
          renderList();
        });
        listEl.appendChild(head);
        if (expanded) catItems.forEach((i) => listEl.appendChild(itemEl(i)));
      });
    }
    listEl.scrollTop = scroll;
  }

  function itemEl(item, categoryName) {
    const cfg  = TYPES[item.type] || TYPES.documento;
    const wrap = el('div', 'item');
    const row  = el('div', 'row');

    const type = el('span', 'type');
    type.innerHTML = svg(ICONS[item.type] ? item.type : 'documento');
    type.style.color = cfg.color;
    type.style.background = `${cfg.color}22`;
    type.title = cfg.label;

    const title = el('div', 'title');
    const t = el('div', 't', item.title);
    t.title = item.title;
    title.appendChild(t);
    if (categoryName) title.appendChild(el('div', 'sub', `${categoryName} · usado ${item.usage_count}x`));

    const previewOpen = state.previewId === item.id;
    const eye = iconButton('eye', 'Prévia', () => {
      state.previewId = previewOpen ? null : item.id;
      renderList();
    }, previewOpen ? 'on' : '');

    const busy = state.busyId === item.id;
    const send = iconButton(busy ? 'refresh' : 'send', 'Colocar na conversa', () => sendItem(item), 'send');
    if (busy) send.querySelector('svg').classList.add('spin');
    send.disabled = state.busyId != null;

    row.append(type, title, eye, send);
    wrap.appendChild(row);
    if (previewOpen) wrap.appendChild(previewEl(item));
    return wrap;
  }

  function previewEl(item) {
    const box = el('div', 'preview');
    if (['imagem', 'video', 'audio'].includes(item.type) && item.file_url) {
      const media = el('div', 'meta', 'Carregando prévia...');
      box.appendChild(media);
      getBlobUrl(item).then((url) => {
        const tag = item.type === 'imagem' ? 'img' : item.type;
        const m = document.createElement(tag);
        m.src = url;
        if (tag !== 'img') { m.controls = true; m.preload = 'metadata'; }
        media.replaceWith(m);
      }).catch((e) => { media.textContent = `Não foi possível carregar a prévia: ${e.message}`; });
    }
    if (item.body) {
      const body = el('div', 'body');
      appendWithVars(body, item.body);
      box.appendChild(body);
    }
    if (item.type !== 'texto' && item.file_name) {
      box.appendChild(el('div', 'meta', `${item.file_name}${item.file_size != null ? ` · ${formatSize(item.file_size)}` : ''}`));
    }
    if (!box.childNodes.length) box.appendChild(el('div', 'meta', 'Sem conteúdo.'));
    return box;
  }

  // ── Usar um item ───────────────────────────────────────────────────────────

  function registerUse(item) {
    item.usage_count += 1;
    state.lastUsed = item.title;
    storageSet({ lastUsed: state.lastUsed });
    renderLastUsed();
    call('incrementUsage', { id: item.id })
      .then((count) => { item.usage_count = count; })
      .catch(() => { /* o contador local já foi atualizado */ });
  }

  async function sendItem(item) {
    if (state.busyId) return;
    const composer = getComposer();
    if (!composer) { toast('Abra uma conversa', 'warn'); return; }

    state.busyId = item.id;
    renderList();
    try {
      const text = fillVars(item.body || '', contactFirstName());

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
      renderList();
    }
  }

  // ── Início ─────────────────────────────────────────────────────────────────

  renderFilters();
  renderLastUsed();
  renderList();
  try {
    chrome.storage.local.get(['collapsed', 'lastUsed'], (saved) => {
      state.collapsed = (saved && saved.collapsed) || {};
      state.lastUsed  = (saved && saved.lastUsed) || '';
      renderLastUsed();
      renderList();
    });
  } catch { /* extensão recarregada */ }
})();
