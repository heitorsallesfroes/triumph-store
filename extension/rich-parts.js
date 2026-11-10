// 2.9.2: tipos de parte "ricos" das mensagens rápidas (localização, produto, catálogo, contato, Pix).
// Funções puras, usadas em 3 lugares: painel (content.js), service worker (supabase-api.js, validação
// antes de gravar) e ponte da WA-JS (wa-bridge.js, monta o envio). Nada aqui faz rede ou guarda dados.
(function (root) {
  'use strict';

  const TYPES = ['localizacao', 'produto', 'catalogo', 'contato', 'pix'];
  const LABEL = { localizacao: 'Localização', produto: 'Produto', catalogo: 'Catálogo', contato: 'Contato', pix: 'Chave Pix' };
  const EMOJI = { localizacao: '📍', produto: '🛍️', catalogo: '📒', contato: '👤', pix: '💠' };
  const COLOR = { localizacao: '#0ea5e9', produto: '#f97316', catalogo: '#14b8a6', contato: '#6366f1', pix: '#10b981' };
  // texto opcional junto (vai na mesma mensagem do cartão)
  const WITH_TEXT = ['produto', 'catalogo'];
  // valores que a WA-JS 4.7.2 manda em pix_static_code.key_type
  const PIX_KEY_TYPES = [['CPF', 'CPF'], ['CNPJ', 'CNPJ'], ['PHONE', 'Telefone'], ['EMAIL', 'E-mail'], ['EVP', 'Aleatória']];

  const isRich = (t) => TYPES.includes(t);
  const allowsText = (t) => WITH_TEXT.includes(t);
  const str = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
  const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  const fail = (msg) => { throw new Error(msg); };

  function empty(type) {
    if (type === 'localizacao') return { name: '', address: '', lat: '', lng: '' };
    if (type === 'produto') return { product_id: '', name: '', price: '', image_url: '' };
    if (type === 'contato') return { name: '', phone: '' };
    if (type === 'pix') return { key_type: 'CPF', key: '', name: '' };
    return {};
  }

  // ── Google Maps: @lat,lng · ?q=lat,lng (também query=, ll=, destination=) · !3dlat!4dlng · "lat, lng" ──
  const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  function parseMapsLink(text) {
    let s = String(text || '').trim().slice(0, 2000);
    if (!s) return null;
    try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch { /* fica como veio */ }
    const tries = [
      new RegExp(`!3d${NUM}!4d${NUM}`), // o ponto exato do local (vem depois do @ da câmera)
      new RegExp(`[?&](?:q|query|ll|destination|center)=(?:loc:)?\\s*${NUM}\\s*,\\s*${NUM}`),
      new RegExp(`@${NUM},${NUM}`),
      new RegExp(`^${NUM}\\s*,\\s*${NUM}$`),
    ];
    for (const re of tries) {
      const m = re.exec(s);
      if (!m) continue;
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (inRange(lat, lng)) return { lat, lng };
    }
    return null;
  }
  // nome do local que vem no link (/maps/place/Nome+do+Lugar/...)
  function placeNameFromLink(text) {
    const m = /\/maps\/place\/([^/@?]+)/.exec(String(text || ''));
    if (!m) return '';
    let n = m[1];
    try { n = decodeURIComponent(n.replace(/\+/g, ' ')); } catch { n = n.replace(/\+/g, ' '); }
    n = str(n);
    return /^-?\d/.test(n) ? '' : n.slice(0, 100);
  }
  const isShortMapsLink = (text) => /^\s*https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(String(text || ''));

  // ── Contato / Pix ──
  // telefone do Brasil sem o 55 (10 ou 11 dígitos) ganha o 55
  function normPhone(v) {
    let d = digits(v);
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    return /^\d{12,15}$/.test(d) ? d : '';
  }
  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
  const EVP_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function normPixKey(type, key) {
    const k = String(key == null ? '' : key).trim();
    if (type === 'CPF') { const d = digits(k); return d.length === 11 ? d : fail('CPF da chave Pix: 11 números'); }
    if (type === 'CNPJ') { const d = digits(k); return d.length === 14 ? d : fail('CNPJ da chave Pix: 14 números'); }
    if (type === 'PHONE') { const d = normPhone(k); return d ? `+${d}` : fail('Telefone da chave Pix: DDD + número'); }
    if (type === 'EMAIL') return EMAIL_RE.test(k) && k.length <= 77 ? k.toLowerCase() : fail('E-mail da chave Pix inválido');
    if (type === 'EVP') return EVP_RE.test(k) ? k.toLowerCase() : fail('Chave aleatória: o código de 36 caracteres (com os tracinhos)');
    return fail('Escolha o tipo da chave Pix');
  }

  const PRODUCT_ID_RE = /^\d{1,30}$/;
  const httpsUrl = (v) => { const s = typeof v === 'string' ? v.trim() : ''; return /^https:\/\/[^\s"'<>]{1,1000}$/.test(s) ? s : ''; };

  // Valida e limpa os dados da parte; erro com mensagem curta (o chamador põe "Parte N:")
  function normalize(type, data) {
    const d = data && typeof data === 'object' ? data : {};
    if (type === 'localizacao') {
      const lat = typeof d.lat === 'string' ? Number(d.lat.replace(',', '.')) : Number(d.lat);
      const lng = typeof d.lng === 'string' ? Number(d.lng.replace(',', '.')) : Number(d.lng);
      if (d.lat === '' || d.lng === '' || d.lat == null || d.lng == null || !inRange(lat, lng)) fail('latitude (-90 a 90) e longitude (-180 a 180)');
      const name = str(d.name).slice(0, 100);
      const address = str(d.address).slice(0, 200);
      return { name, address, lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 };
    }
    if (type === 'produto') {
      const id = String(d.product_id == null ? '' : d.product_id).trim();
      if (!PRODUCT_ID_RE.test(id)) fail('escolha o produto do catálogo');
      const full = str(d.full_price).slice(0, 40); // 2.16.13: preço cheio (riscado) quando o salvo é o de oferta
      return { product_id: id, name: str(d.name).slice(0, 200), price: str(d.price).slice(0, 40), image_url: httpsUrl(d.image_url) || null, ...(full ? { full_price: full } : {}) };
    }
    if (type === 'catalogo') return {};
    if (type === 'contato') {
      const name = str(d.name);
      if (!name || name.length > 60) fail('nome do contato (1 a 60 caracteres)');
      const phone = normPhone(d.phone);
      if (!phone) fail('telefone do contato (DDD + número)');
      return { name, phone };
    }
    if (type === 'pix') {
      const key_type = PIX_KEY_TYPES.some(([v]) => v === d.key_type) ? d.key_type : fail('escolha o tipo da chave Pix');
      const key = normPixKey(key_type, d.key);
      const name = str(d.name);
      if (!name || name.length > 60) fail('nome do recebedor (1 a 60 caracteres)');
      return { key_type, key, name };
    }
    return fail('tipo inválido');
  }

  const fmtPhone = (p) => {
    const d = digits(p);
    const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : '';
  };
  const pixTypeLabel = (t) => (PIX_KEY_TYPES.find(([v]) => v === t) || [null, t || ''])[1];

  // Resumo de uma linha (lista, wa_items do ERP)
  function summary(part) {
    const t = part && part.type;
    const d = (part && part.data) || {};
    if (t === 'localizacao') return [d.name, d.address].filter(Boolean).join(' · ') || (d.lat != null && d.lat !== '' ? `${d.lat}, ${d.lng}` : 'Localização');
    if (t === 'produto') return [d.name || 'Produto do catálogo', d.price].filter(Boolean).join(' · ');
    if (t === 'catalogo') return 'Catálogo do WhatsApp';
    if (t === 'contato') return [d.name, fmtPhone(d.phone)].filter(Boolean).join(' · ') || 'Contato';
    if (t === 'pix') return d.key ? `${pixTypeLabel(d.key_type)}: ${d.key}${d.name ? ` · ${d.name}` : ''}` : 'Chave Pix';
    return '';
  }
  // texto que vai para wa_items quando a 1ª parte é de um tipo novo (o ERP mostra como texto)
  function mirrorText(part) {
    const head = `${EMOJI[part.type] || ''} ${LABEL[part.type] || ''}: ${summary(part)}`.trim();
    const body = allowsText(part.type) && part.body ? `\n${part.body}` : '';
    return `${head}${body}`.slice(0, 4096);
  }

  const productLink = (productId, phone) => `https://wa.me/p/${productId}/${digits(phone)}`;
  const mapsUrl = (lat, lng) => `https://maps.google.com/?q=${lat},${lng}`;

  // Produto como vem da WA-JS (getProducts/getProductById ou modelo do CatalogStore) → { id, name, price, image_url }
  function pick(o, keys) {
    for (const k of keys) {
      const v = o && (o[k] !== undefined ? o[k] : (o.attributes && o.attributes[k]));
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }
  function priceLabel(amount1000, currency) {
    const n = Number(amount1000);
    if (!Number.isFinite(n) || n < 0) return '';
    const cur = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : 'BRL';
    try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(n / 1000); } catch { return (n / 1000).toFixed(2); }
  }
  function imageOf(o) {
    const direct = pick(o, ['imageCdnUrl', 'image_cdn_url', 'image_url']);
    if (typeof direct === 'string') return httpsUrl(direct);
    const list = pick(o, ['image_cdn_urls', 'imageCdnUrls']);
    if (Array.isArray(list) && list.length) {
      const req = list.find((x) => x && x.key === 'requested') || list[0];
      return httpsUrl(req && (req.value || req.url));
    }
    const coll = o && typeof o.getProductImageCollectionHead === 'function' ? (() => { try { return o.getProductImageCollectionHead(); } catch { return null; } })() : null;
    const cu = coll && pick(coll, ['imageCdnUrl', 'mediaUrl']);
    return typeof cu === 'string' ? httpsUrl(cu) : '';
  }
  function normalizeProduct(o) {
    if (!o || typeof o !== 'object') return null;
    const rawId = pick(o, ['id']);
    const id = rawId && typeof rawId === 'object' && rawId._serialized ? rawId._serialized : rawId != null ? String(rawId) : '';
    if (!PRODUCT_ID_RE.test(id)) return null;
    if (pick(o, ['isHidden', 'is_hidden']) === true) return null;
    const name = str(String(pick(o, ['name']) || '')).slice(0, 200) || 'Produto';
    const currency = pick(o, ['currency']);
    let amount = pick(o, ['priceAmount1000', 'price_amount1000']);
    const raw = pick(o, ['price']);
    if (amount == null && raw != null && /^\d+$/.test(String(raw))) amount = Number(raw); // a resposta do catálogo vem em milésimos
    // 2.16.13: preço de oferta — salePriceAmount1000 (modelo do catálogo) ou sale_price { price } (getProductById/
    // queryProduct); só vale se for menor que o cheio e estiver dentro das datas da oferta (quando houver)
    const sale = saleAmountOf(o, amount);
    const full = priceLabel(amount, currency);
    const price = priceLabel(sale != null ? sale : amount, currency) || (raw != null && !/^\d+$/.test(String(raw)) ? str(String(raw)).slice(0, 40) : '');
    return { id, name, price, full_price: sale != null && full ? full : '', image_url: imageOf(o) || null };
  }
  const num1000 = (v) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
  // data da oferta: segundos, milésimos ou texto ISO; sem data = sem limite
  const whenOf = (v) => { if (v == null || v === '') return null; const n = Number(v); if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };
  function saleAmountOf(o, amount, now = Date.now()) {
    let sale = num1000(pick(o, ['salePriceAmount1000', 'sale_price_amount1000']));
    let start = whenOf(pick(o, ['salePriceStartDate', 'sale_price_start_date']));
    let end = whenOf(pick(o, ['salePriceEndDate', 'sale_price_end_date']));
    const sp = pick(o, ['sale_price', 'salePrice']);
    if (sale == null && sp && typeof sp === 'object') {
      sale = num1000(sp.price != null ? sp.price : sp.amount1000 != null ? sp.amount1000 : sp.price_amount1000);
      start = start != null ? start : whenOf(sp.start_date != null ? sp.start_date : sp.startDate);
      end = end != null ? end : whenOf(sp.end_date != null ? sp.end_date : sp.endDate);
    }
    if (sale == null) return null;
    if (amount != null && Number(sale) >= Number(amount)) return null; // "oferta" igual ou maior não é oferta
    if ((start != null && now < start) || (end != null && now > end)) return null; // fora das datas da oferta
    return sale;
  }
  // texto do cartão de prévia (reserva): "R$ 629,00 · de R$ 709,00" quando tem oferta
  const productDescription = (p) => (p.price ? (p.full_price && p.full_price !== p.price ? `${p.price} · de ${p.full_price}` : p.price) : 'Ver produto no WhatsApp');

  // ── Envio pela WA-JS (só na ponte, mundo da página) ──
  // Devolve uma função que envia (não envia nada sozinha). opts = { createChat, markIsRead } da ponte.
  // Erros de pré-checagem vêm com .richCode (a ponte mostra a mensagem e não envia nada).
  const preErr = (code, msg) => Object.assign(new Error(msg), { richCode: code });
  function myUser(wpp) {
    let wid = null;
    try { wid = wpp.conn.getMyUserId(); } catch { wid = null; }
    const user = wid && (wid.user || String(wid._serialized || wid).split('@')[0]);
    if (!wid || !/^\d{8,15}$/.test(String(user || ''))) throw preErr('no_me', 'Não consegui ler o seu número no WhatsApp');
    return { wid, user: String(user) };
  }
  const isBiz = (wpp) => { try { return wpp.profile && typeof wpp.profile.isBusiness === 'function' ? wpp.profile.isBusiness() : undefined; } catch { return undefined; } };
  const hasFn = (o, k) => !!o && typeof o[k] === 'function';

  // o que dá para usar nesta conta (undefined = não dá para saber ainda)
  function availability(wpp) {
    const chat = wpp && wpp.chat;
    const biz = isBiz(wpp);
    return {
      localizacao: hasFn(chat, 'sendLocationMessage'),
      contato: hasFn(chat, 'sendVCardContactMessage'),
      catalogo: hasFn(chat, 'sendCatalogMessage') && biz !== false,
      produto: hasFn(chat, 'sendRawMessage') && hasFn(wpp && wpp.catalog, 'getProducts') && biz !== false,
      pix: hasFn(chat, 'sendPixKeyMessage') && biz !== false,
      business: biz,
    };
  }

  // miniatura JPEG (o cartão do link do produto); falha = sem miniatura
  function thumbnail(url, size = 160) {
    return new Promise((resolve) => {
      if (!url || typeof Image === 'undefined' || typeof document === 'undefined') { resolve(null); return; }
      const img = new Image();
      const done = (v) => { clearTimeout(timer); resolve(v); };
      const timer = setTimeout(() => done(null), 8000);
      img.crossOrigin = 'anonymous';
      img.onerror = () => done(null);
      img.onload = () => {
        try {
          const k = Math.min(1, size / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * k));
          c.height = Math.max(1, Math.round(img.naturalHeight * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          done({ data: c.toDataURL('image/jpeg', 0.7).split(',', 2)[1], width: c.width, height: c.height });
        } catch { done(null); }
      };
      img.src = url;
    });
  }

  const withTimeout = (p, ms) => new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('timeout')), ms); Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

  // 2.16.13: miniatura GRANDE da prévia, como o WhatsApp Web faz nas prévias em alta (thumbnailHQ): a foto do catálogo
  // vira JPEG e sobe pelo upload de miniatura do próprio WhatsApp (functions.uploadThumbnail). Nenhum servidor de fora.
  async function hqThumbnail(wpp, url) {
    const W = wpp && wpp.whatsapp;
    const up = W && W.functions && W.functions.uploadThumbnail;
    const OD = W && W.OpaqueData;
    const B64 = W && W.Base64;
    if (typeof up !== 'function' || !OD || typeof OD.createFromBase64Jpeg !== 'function' || !B64 || typeof B64.encodeB64 !== 'function') return null;
    const big = await thumbnail(url, 800);
    if (!big || big.width < 300) return null;
    const small = await thumbnail(url, 140);
    try {
      const data = await OD.createFromBase64Jpeg(big.data);
      const key = new Uint8Array(32);
      (globalThis.crypto || crypto).getRandomValues(key);
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const r = await withTimeout(up({ thumbnail: data, mediaType: 'thumbnail-link', mediaKeyInfo: { key: B64.encodeB64(key), timestamp: Math.floor(Date.now() / 1000) },
        uploadOrigin: 1, forwardedFromWeb: false, signal: ctl ? ctl.signal : undefined, timeout: 5000, isViewOnce: false }), 10000);
      const e = r && r.mediaEntry;
      if (!e || !e.mediaKey || !e.directPath) return null;
      return { thumbnail: (small || big).data, thumbnailHQ: big.data, mediaKey: e.mediaKey, mediaKeyTimestamp: e.mediaKeyTimestamp, thumbnailDirectPath: e.directPath,
        thumbnailSha256: r.filehash, thumbnailEncSha256: e.encFilehash, thumbnailWidth: big.width, thumbnailHeight: big.height };
    } catch { return null; }
  }

  // 2.16.13: envio NATIVO do produto (o mesmo cartão do catálogo: foto grande, preço de oferta com o cheio riscado e
  // "Ver"), pela função que o WhatsApp Web usa ao compartilhar um produto (WPP.whatsapp.functions.sendProductToChat).
  // Só vale se uma mensagem NOVA nossa aparecer na conversa; senão, a reserva (link com prévia) vai no lugar.
  const mineIds = (chat) => { try { return new Set(chat.msgs.getModelsArray().filter((m) => m && m.id && m.id.fromMe).map((m) => String(m.id._serialized || m.id.id || m.id))); } catch { return new Set(); } };
  const newMine = (chat, before) => { try { return chat.msgs.getModelsArray().filter((m) => m && m.id && m.id.fromMe && !before.has(String(m.id._serialized || m.id.id || m.id))); } catch { return []; } };
  async function nativeProduct(wpp, chatId, productId, me) {
    const W = wpp && wpp.whatsapp;
    const fn = W && W.functions && W.functions.sendProductToChat;
    if (typeof fn !== 'function') return null;
    const modelOf = () => { try { const cat = W.CatalogStore && W.CatalogStore.get(me.wid); const col = cat && cat.productCollection; return col && typeof col.get === 'function' ? col.get(productId) || null : null; } catch { return null; } };
    let model = modelOf();
    if (!model && hasFn(wpp.catalog, 'getMyCatalog')) { try { await withTimeout(wpp.catalog.getMyCatalog(), 8000); } catch { /* sem catálogo carregado */ } model = modelOf(); }
    let chat = null;
    try { chat = (wpp.chat && wpp.chat.get(chatId)) || (W.ChatStore && W.ChatStore.get(chatId)) || null; } catch { chat = null; }
    if (!model || !chat || !chat.msgs) return null;
    return async (waitMs = 6000) => {
      const before = mineIds(chat);
      for (const args of [[model, chat], [chat, model]]) { // a ordem dos parâmetros muda entre versões do WhatsApp Web
        let threw = false;
        try { await withTimeout(Promise.resolve().then(() => fn(...args)), 15000); } catch { threw = true; }
        for (let i = 0; i < (threw ? 1000 : waitMs) / 200; i++) { if (newMine(chat, before).length) return true; await sleepMs(200); }
        if (!threw) return false; // não deu erro e nada apareceu: não tenta de novo (evita mandar duas vezes)
      }
      return false;
    };
  }

  async function prepareSend(wpp, chatId, { kind, data, text }, opts) {
    if (!isRich(kind)) throw preErr('invalid_kind', 'Tipo de parte inválido');
    let d;
    try { d = normalize(kind, data); } catch (e) { throw preErr('invalid_data', `${LABEL[kind]}: ${e.message}`); }
    const caption = allowsText(kind) && typeof text === 'string' && text.trim() ? text.slice(0, 4096) : '';
    const av = availability(wpp);
    const o = { ...(opts || {}) };
    if (kind === 'localizacao') {
      if (!av.localizacao) throw preErr('rich_unavailable', 'Localização: esta versão da WA-JS não envia localização');
      const loc = { ...o, lat: d.lat, lng: d.lng };
      if (d.name) loc.name = d.name;
      if (d.address) loc.address = d.address;
      return () => wpp.chat.sendLocationMessage(chatId, loc);
    }
    if (kind === 'contato') {
      if (!av.contato) throw preErr('rich_unavailable', 'Contato: esta versão da WA-JS não envia contato');
      return () => wpp.chat.sendVCardContactMessage(chatId, { id: `${d.phone}@c.us`, name: d.name }, o);
    }
    if (kind === 'pix') {
      if (!hasFn(wpp.chat, 'sendPixKeyMessage')) throw preErr('pix_unavailable', 'Chave Pix: esta versão da WA-JS não envia Pix. Nada foi enviado.');
      if (av.business === false) throw preErr('pix_unavailable', 'Chave Pix só funciona em conta WhatsApp Business. Nada foi enviado.');
      return () => wpp.chat.sendPixKeyMessage(chatId, { keyType: d.key_type, key: d.key, name: d.name }, o);
    }
    const me = myUser(wpp);
    if (kind === 'catalogo') {
      if (!hasFn(wpp.chat, 'sendCatalogMessage')) throw preErr('rich_unavailable', 'Catálogo: esta versão da WA-JS não envia catálogo');
      if (av.business === false) throw preErr('catalog_unavailable', 'Catálogo só existe em conta WhatsApp Business');
      return () => wpp.chat.sendCatalogMessage(chatId, me.wid, { ...o, title: 'Catálogo no WhatsApp', description: 'Veja os nossos produtos', ...(caption ? { textMessage: caption } : {}) });
    }
    // produto (2.16.13): 1) envio NATIVO do catálogo; 2) reserva automática: o link do produto com a prévia montada
    // aqui (título = nome, descrição = "R$ 629,00 · de R$ 709,00", foto grande pelo upload do WhatsApp; sem ela, a
    // pequena). Nos dois, o preço é o de OFERTA quando o catálogo tiver.
    if (!hasFn(wpp.chat, 'sendRawMessage')) throw preErr('rich_unavailable', 'Produto: esta versão da WA-JS não envia o link do produto');
    if (av.business === false) throw preErr('catalog_unavailable', 'Produto do catálogo só existe em conta WhatsApp Business');
    let fresh = null;
    try { fresh = hasFn(wpp.catalog, 'getProductById') ? normalizeProduct(await wpp.catalog.getProductById(String(me.wid._serialized || me.wid), d.product_id)) : null; } catch { fresh = null; }
    const prod = fresh
      ? { name: fresh.name || d.name || 'Produto', price: fresh.price || d.price || '', full_price: fresh.full_price || '', image_url: fresh.image_url || d.image_url }
      : { name: d.name || 'Produto', price: d.price || '', full_price: d.full_price || '', image_url: d.image_url };
    const url = productLink(d.product_id, me.user);
    const native = await nativeProduct(wpp, chatId, d.product_id, me).catch(() => null);
    const linkSend = async () => {
      const th = (await hqThumbnail(wpp, prod.image_url).catch(() => null)) || (await thumbnail(prod.image_url).then((t) => (t ? { thumbnail: t.data, thumbnailHeight: t.height, thumbnailWidth: t.width } : null)));
      const raw = {
        type: 'chat', subtype: 'url', richPreviewType: 0, matchedText: url, canonicalUrl: url, body: caption ? `${caption}\n${url}` : url,
        title: prod.name, description: productDescription(prod), ...(th || {}),
      };
      await wpp.chat.sendRawMessage(chatId, raw, o);
      return { tspVia: th && th.thumbnailHQ ? 'link-grande' : 'link' };
    };
    return async () => {
      if (native && (await native().catch(() => false))) {
        if (caption && hasFn(wpp.chat, 'sendTextMessage')) await wpp.chat.sendTextMessage(chatId, caption, o);
        return { tspVia: 'nativo' };
      }
      return linkSend();
    };
  }

  root.TspRich = Object.freeze({
    TYPES, LABEL, EMOJI, COLOR, PIX_KEY_TYPES,
    isRich, allowsText, empty, normalize, summary, mirrorText, fmtPhone, pixTypeLabel, normPhone,
    parseMapsLink, placeNameFromLink, isShortMapsLink, productLink, mapsUrl, normalizeProduct, priceLabel, saleAmountOf, productDescription,
    availability, prepareSend,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
