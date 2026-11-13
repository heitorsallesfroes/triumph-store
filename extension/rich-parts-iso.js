// cópia de rich-parts.js para o mundo isolado; o Chrome não injeta o mesmo arquivo em dois content_scripts — mantenha idênticos
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
  // 2.18.9: o Catálogo vai como o WhatsApp manda à mão: TEXTO com o link wa.me/c/<meu número> e a prévia do link
  const CATALOG_TEXT = 'Acesse este link para ver nosso catálogo no WhatsApp:';
  const catalogLink = (phone) => `https://wa.me/c/${digits(phone)}`;
  // legenda da parte antes do link (linha de cima); sem legenda, a frase do WhatsApp e o link na mesma linha
  const catalogBody = (caption, phone) => {
    const c = typeof caption === 'string' ? caption.trim() : '';
    return c ? `${c}\n${catalogLink(phone)}` : `${CATALOG_TEXT} ${catalogLink(phone)}`;
  };

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
      catalogo: hasFn(chat, 'sendTextMessage') && biz !== false, // 2.18.9: texto com o link wa.me/c/…
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
  // 2.16.14: textos curtos para o diagnóstico (nunca dados de cliente)
  const brief = (v, n = 160) => { try { return String(v == null ? '' : v).slice(0, n); } catch { return ''; } };
  const errText = (e) => brief((e && (e.message || e.code)) || e || 'erro', 200);
  function safeJson(v) { try { return JSON.stringify(v); } catch { return String(v); } }
  const plain = (v) => (v == null ? null : typeof v === 'number' || typeof v === 'boolean' ? v : typeof v === 'string' ? brief(v, 300) : brief(safeJson(v), 300));

  // 2.16.14: o que uma leitura do produto trouxe (preço, oferta e datas, fotos e os nomes dos campos)
  function productReadInfo(o) {
    if (!o || typeof o !== 'object') return null;
    const sp = pick(o, ['sale_price', 'salePrice']);
    const imgs = [];
    const direct = pick(o, ['imageCdnUrl', 'image_cdn_url', 'image_url']);
    if (typeof direct === 'string') imgs.push(direct);
    const list = pick(o, ['image_cdn_urls', 'imageCdnUrls']);
    if (Array.isArray(list)) list.slice(0, 4).forEach((x) => { if (x) imgs.push(`${x.key ? `${x.key}: ` : ''}${x.value || x.url || ''}`); });
    let keys = [];
    try { keys = Object.keys(o.attributes && typeof o.attributes === 'object' ? o.attributes : o).slice(0, 50); } catch { keys = []; }
    return {
      priceAmount1000: plain(pick(o, ['priceAmount1000', 'price_amount1000'])), price: plain(pick(o, ['price'])), currency: plain(pick(o, ['currency'])),
      salePriceAmount1000: plain(pick(o, ['salePriceAmount1000', 'sale_price_amount1000'])),
      salePriceStartDate: plain(pick(o, ['salePriceStartDate', 'sale_price_start_date'])), salePriceEndDate: plain(pick(o, ['salePriceEndDate', 'sale_price_end_date'])),
      sale_price: plain(sp), images: imgs.map((u) => brief(u, 300)), keys,
    };
  }
  const hasSaleFields = (o) => !!o && (pick(o, ['salePriceAmount1000', 'sale_price_amount1000']) != null || !!pick(o, ['sale_price', 'salePrice']));

  // 2.16.14: preço/oferta da prévia juntando as leituras ao vivo (getProductById e o catálogo carregado no WhatsApp) e,
  // em último caso, o que ficou salvo na parte. Oferta só quando válida (menor que o cheio e dentro das datas).
  const sameMoney = (a, b) => String(a || '').replace(/\s/g, ' ') === String(b || '').replace(/\s/g, ' '); // Intl usa espaço fixo
  function productOffer(live, saved) {
    let base = null;
    let liveSale = false;
    const all = live.map((s) => (s && s.o ? normalizeProduct(s.o) : null));
    const img = (all.find((n) => n && n.image_url) || {}).image_url || (saved && saved.image_url) || null; // foto de qualquer leitura
    for (let i = 0; i < live.length; i++) {
      const s = live[i];
      const n = all[i];
      if (!n) continue;
      if (n.full_price) return { name: n.name, price: n.price, full_price: n.full_price, image_url: n.image_url || img, from: s.tag };
      if (hasSaleFields(s.o)) liveSale = true; // a leitura tem os campos da oferta, mas ela não vale agora
      if (!base) base = { ...n, from: s.tag };
    }
    const sv = saved || {};
    const mk = (p) => ({ name: (base && base.name) || sv.name || 'Produto', price: p.price || '', full_price: p.full_price || '', image_url: (base && base.image_url) || img, from: p.from });
    // a parte guardou uma oferta e o cheio dela bate com o preço lido agora: usa a oferta salva
    if (!liveSale && sv.full_price && sv.price && (!base || !base.price || sameMoney(base.price, sv.full_price))) return mk({ price: sv.price, full_price: sv.full_price, from: base ? `${base.from}+salvo` : 'salvo' });
    if (base) return mk({ price: base.price || sv.price || '', full_price: '', from: base.from });
    return mk({ price: sv.price || '', full_price: sv.full_price || '', from: 'salvo' });
  }

  // 2.16.13: miniatura GRANDE da prévia, como o WhatsApp Web faz nas prévias em alta (thumbnailHQ): a foto do catálogo
  // vira JPEG e sobe pelo upload de miniatura do próprio WhatsApp (functions.uploadThumbnail). Nenhum servidor de fora.
  // 2.16.14: cada passo diz por que falhou (trace.hq); tamanho mínimo igual ao da WA-JS (140 x 100).
  async function hqThumbnail(wpp, url, trace = {}) {
    const W = wpp && wpp.whatsapp;
    const up = W && W.functions && W.functions.uploadThumbnail;
    const OD = W && W.OpaqueData;
    const B64 = W && W.Base64;
    if (typeof up !== 'function' || !OD || typeof OD.createFromBase64Jpeg !== 'function' || !B64 || typeof B64.encodeB64 !== 'function') {
      trace.hq = `indisponível (uploadThumbnail: ${typeof up}, OpaqueData: ${!!OD}, Base64: ${!!B64})`;
      return null;
    }
    if (!url) { trace.hq = 'produto sem foto'; return null; }
    const big = await thumbnail(url, 800);
    if (!big) { trace.hq = 'a foto não carregou no navegador (rede ou CORS)'; return null; }
    if (big.width < 140 || big.height < 100) { trace.hq = `foto pequena demais (${big.width}x${big.height})`; return null; }
    const small = await thumbnail(url, 140);
    try {
      const data = await OD.createFromBase64Jpeg(big.data);
      const key = new Uint8Array(32);
      (globalThis.crypto || crypto).getRandomValues(key);
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const r = await withTimeout(up({ thumbnail: data, mediaType: 'thumbnail-link', mediaKeyInfo: { key: B64.encodeB64(key), timestamp: Math.floor(Date.now() / 1000) },
        uploadOrigin: 1, forwardedFromWeb: false, signal: ctl ? ctl.signal : undefined, timeout: 5000, isViewOnce: false }), 10000);
      const e = r && r.mediaEntry;
      if (!e || !e.mediaKey || !e.directPath) { trace.hq = `upload sem mediaEntry (campos: ${brief(Object.keys(r || {}).join(','), 120)})`; return null; }
      trace.hq = `ok (${big.width}x${big.height})`;
      return { thumbnail: (small || big).data, thumbnailHQ: big.data, mediaKey: e.mediaKey, mediaKeyTimestamp: e.mediaKeyTimestamp, thumbnailDirectPath: e.directPath,
        thumbnailSha256: r.filehash, thumbnailEncSha256: e.encFilehash, thumbnailWidth: big.width, thumbnailHeight: big.height };
    } catch (err) { trace.hq = `upload falhou: ${errText(err)}`; return null; }
  }

  // 2.16.13: envio NATIVO do produto (o mesmo cartão do catálogo: foto grande, preço de oferta com o cheio riscado e
  // "Ver"), pela função que o WhatsApp Web usa ao compartilhar um produto (WPP.whatsapp.functions.sendProductToChat).
  // Só vale se uma mensagem NOVA nossa aparecer na conversa; senão, a reserva (link com prévia) vai no lugar.
  const mineIds = (chat) => { try { return new Set(chat.msgs.getModelsArray().filter((m) => m && m.id && m.id.fromMe).map((m) => String(m.id._serialized || m.id.id || m.id))); } catch { return new Set(); } };
  const newMine = (chat, before) => { try { return chat.msgs.getModelsArray().filter((m) => m && m.id && m.id.fromMe && !before.has(String(m.id._serialized || m.id.id || m.id))); } catch { return []; } };
  const catalogModel = (W, me, productId) => { try { const cat = W.CatalogStore && W.CatalogStore.get(me.wid); const col = cat && cat.productCollection; return col && typeof col.get === 'function' ? col.get(productId) || null : null; } catch { return null; } };
  const chatOf = (wpp, chatId) => { try { return (wpp.chat && typeof wpp.chat.get === 'function' && wpp.chat.get(chatId)) || (wpp.whatsapp && wpp.whatsapp.ChatStore && wpp.whatsapp.ChatStore.get(chatId)) || null; } catch { return null; } };
  // 2.16.14: existe a função? qual a aridade e a assinatura (para o diagnóstico)
  function nativeInfo(wpp) {
    const W = wpp && wpp.whatsapp;
    const fn = W && W.functions && W.functions.sendProductToChat;
    if (typeof fn !== 'function') return { exists: false, arity: null, signature: null };
    let sig = '';
    try { sig = brief(String(Function.prototype.toString.call(fn)).split('{')[0].replace(/\s+/g, ' ').trim(), 120); } catch { sig = ''; }
    return { exists: true, arity: fn.length, signature: sig || null };
  }
  async function nativeProduct(wpp, chatId, productId, me, trace = {}) {
    const W = wpp && wpp.whatsapp;
    const fn = W && W.functions && W.functions.sendProductToChat;
    trace.native = { ...nativeInfo(wpp), attempts: [] };
    if (typeof fn !== 'function') { trace.native.skipped = 'WPP.whatsapp.functions.sendProductToChat não existe'; return null; }
    let model = catalogModel(W, me, productId);
    if (!model && hasFn(wpp.catalog, 'getMyCatalog')) { try { await withTimeout(wpp.catalog.getMyCatalog(), 8000); } catch { /* sem catálogo carregado */ } model = catalogModel(W, me, productId); }
    const chat = chatOf(wpp, chatId);
    if (!model) { trace.native.skipped = 'o produto não está no catálogo carregado no WhatsApp (CatalogStore)'; return null; }
    if (!chat || !chat.msgs) { trace.native.skipped = 'conversa não carregada'; return null; }
    return async (waitMs = 6000) => {
      const before = mineIds(chat);
      const orders = [[model, chat], [chat, model]]; // a ordem dos parâmetros muda entre versões do WhatsApp Web
      for (let k = 0; k < orders.length; k++) {
        let threw = null;
        let ret;
        try { ret = await withTimeout(Promise.resolve().then(() => fn(...orders[k])), 15000); } catch (e) { threw = e || new Error('erro'); }
        let got = false;
        for (let i = 0; i < (threw ? 1000 : waitMs) / 200; i++) { if (newMine(chat, before).length) { got = true; break; } await sleepMs(200); }
        trace.native.attempts.push({ order: k + 1, params: k === 0 ? '(produto, conversa)' : '(conversa, produto)',
          result: got ? 'ok: mensagem nova na conversa' : threw ? `erro: ${errText(threw)}` : `nenhuma mensagem nova (a função devolveu ${brief(ret === undefined ? 'undefined' : safeJson(ret), 80)})` });
        if (got) return true;
        if (!threw) return false; // não deu erro e nada apareceu: não tenta de novo (evita mandar duas vezes)
      }
      return false;
    };
  }

  // 2.16.14: o que a mensagem do link ficou tendo depois de enviada (a prévia que vale é a que está na mensagem)
  function sentLinkInfo(m) {
    if (!m) return null;
    const g = (k) => { try { return m[k] !== undefined ? m[k] : m.attributes ? m.attributes[k] : undefined; } catch { return undefined; } };
    return { type: plain(g('type')), subtype: plain(g('subtype')), title: plain(g('title')), description: plain(g('description')), canonicalUrl: plain(g('canonicalUrl')),
      richPreviewType: plain(g('richPreviewType')), thumbnail: !!g('thumbnail'), thumbnailHQ: !!g('thumbnailHQ'), thumbnailDirectPath: !!g('thumbnailDirectPath') };
  }

  // 2.16.14: leitura do produto para o diagnóstico (nada é enviado)
  async function productDiag(wpp, productId) {
    const id = String(productId == null ? '' : productId).trim();
    if (!PRODUCT_ID_RE.test(id)) throw preErr('invalid_data', 'Produto inválido');
    const me = myUser(wpp);
    const W = wpp && wpp.whatsapp;
    const out = { product_id: id, read: {}, native: nativeInfo(wpp), hqAvailable: !!(W && W.functions && typeof W.functions.uploadThumbnail === 'function' && W.OpaqueData && W.Base64) };
    let fresh = null;
    if (hasFn(wpp.catalog, 'getProductById')) {
      try { fresh = await withTimeout(wpp.catalog.getProductById(String(me.wid._serialized || me.wid), id), 15000); out.read.getProductById = productReadInfo(fresh) || 'vazio'; } catch (e) { out.read.getProductById = `erro: ${errText(e)}`; }
    } else out.read.getProductById = 'função não existe';
    let model = catalogModel(W, me, id);
    if (!model && hasFn(wpp.catalog, 'getMyCatalog')) { try { await withTimeout(wpp.catalog.getMyCatalog(), 8000); } catch { /* sem catálogo */ } model = catalogModel(W, me, id); }
    out.read.catalogModel = model ? productReadInfo(model) : 'não está no catálogo carregado (CatalogStore)';
    out.native.modelLoaded = !!model;
    const offer = productOffer([{ tag: 'getProductById', o: fresh }, { tag: 'catalogo', o: model }], null);
    out.chosen = { name: offer.name, price: offer.price, full_price: offer.full_price || null, description: productDescription(offer), from: offer.from, image_url: offer.image_url || null };
    return out;
  }

  // 2.18.9: id da mensagem enviada (para acompanhar os tracinhos depois). A WA-JS devolve { id } na maioria dos envios;
  // no Produto (e se faltar), a 1ª mensagem NOVA nossa que apareceu na conversa.
  const msgIdOf = (m) => { try { const id = m && m.id; return id ? String(id._serialized || id) : null; } catch { return null; } };
  function tracked(wpp, chatId, fn) {
    return async () => {
      const chat = chatOf(wpp, chatId);
      const before = chat ? mineIds(chat) : null;
      const r = await fn();
      let id = r && typeof r === 'object' && typeof r.id === 'string' && r.id ? r.id : null;
      if (!id && chat && before) id = msgIdOf(newMine(chat, before)[0]);
      const base = r && typeof r === 'object' && typeof r.tspVia === 'string' ? r : {};
      return id ? { ...base, tspMsgId: id.slice(0, 200) } : base;
    };
  }
  // 2.18.9: tracinhos da parte especial: ack (0 relógio, 1 um tracinho, 2 entregue, 3 lida) e se outras mensagens
  // NOSSAS da mesma conversa (de 10 min antes em diante) chegaram (ack >= 2). Só leitura.
  function ackStatus(wpp, chatId, msgId) {
    const chat = chatOf(wpp, chatId);
    let list = [];
    try { list = chat ? chat.msgs.getModelsArray() : []; } catch { list = []; }
    const m = list.find((x) => msgIdOf(x) === msgId);
    if (!m) return { found: false };
    const t = Number(m.t) || 0;
    const ack = Number(m.ack);
    const others = list.filter((x) => { try { return x && x.id && x.id.fromMe && msgIdOf(x) !== msgId && (Number(x.t) || 0) >= t - 600; } catch { return false; } });
    return { found: true, ack: Number.isFinite(ack) ? ack : null, others: others.length, othersDelivered: others.some((x) => Number(x.ack) >= 2) };
  }
  // depois dos 2 minutos: 'warn' = continua em 1 tracinho (ou no relógio) enquanto as outras mensagens chegaram
  function ackVerdict(st) {
    if (!st || !st.found || st.ack == null) return 'unknown';
    if (st.ack >= 2) return 'ok';
    if (st.ack >= 0 && st.ack <= 1 && st.othersDelivered) return 'warn';
    return 'unknown';
  }

  async function prepareSend(wpp, chatId, part, opts) {
    return tracked(wpp, chatId, await prepareRaw(wpp, chatId, part, opts));
  }
  async function prepareRaw(wpp, chatId, { kind, data, text }, opts) {
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
      // 2.18.9: sendCatalogMessage ficava em 1 tracinho e não chegava; agora é o mesmo formato do envio à mão:
      // texto (legenda ou a frase do WhatsApp) + https://wa.me/c/<meu número>, com a prévia do link da WA-JS
      if (!hasFn(wpp.chat, 'sendTextMessage')) throw preErr('rich_unavailable', 'Catálogo: esta versão da WA-JS não envia texto');
      if (av.business === false) throw preErr('catalog_unavailable', 'Catálogo só existe em conta WhatsApp Business');
      const body = catalogBody(caption, me.user);
      return () => wpp.chat.sendTextMessage(chatId, body, { ...o, linkPreview: true });
    }
    // produto (2.16.13): 1) envio NATIVO do catálogo; 2) reserva automática: o link do produto com a prévia montada
    // aqui (título = nome, descrição = "R$ 629,00 · de R$ 709,00", foto grande pelo upload do WhatsApp; sem ela, a
    // pequena). Nos dois, o preço é o de OFERTA quando o catálogo tiver.
    if (!hasFn(wpp.chat, 'sendRawMessage')) throw preErr('rich_unavailable', 'Produto: esta versão da WA-JS não envia o link do produto');
    if (av.business === false) throw preErr('catalog_unavailable', 'Produto do catálogo só existe em conta WhatsApp Business');
    let fresh = null;
    try { fresh = hasFn(wpp.catalog, 'getProductById') ? await withTimeout(wpp.catalog.getProductById(String(me.wid._serialized || me.wid), d.product_id), 15000) : null; } catch { fresh = null; }
    // 2.16.14: cada envio de Produto registra o que aconteceu (vai para o log da extensão; sem dados de cliente)
    const trace = { product_id: d.product_id, at: new Date().toISOString() };
    const native = await nativeProduct(wpp, chatId, d.product_id, me, trace).catch((e) => { trace.native = { ...(trace.native || {}), skipped: `erro: ${errText(e)}` }; return null; });
    const model = catalogModel(wpp.whatsapp, me, d.product_id);
    const prod = productOffer([{ tag: 'getProductById', o: fresh }, { tag: 'catalogo', o: model }], d);
    trace.read = { getProductById: fresh ? productReadInfo(fresh) : 'sem resposta', catalogModel: model ? productReadInfo(model) : 'não carregado' };
    trace.chosen = { name: prod.name, price: prod.price, full_price: prod.full_price || null, from: prod.from };
    const url = productLink(d.product_id, me.user);
    const linkSend = async () => {
      const rv = (trace.reserve = {});
      const th = (await hqThumbnail(wpp, prod.image_url, rv).catch((e) => { rv.hq = `upload falhou: ${errText(e)}`; return null; }))
        || (await thumbnail(prod.image_url).then((t) => (t ? { thumbnail: t.data, thumbnailHeight: t.height, thumbnailWidth: t.width } : null)));
      // 2.16.14: a prévia é SEMPRE a montada aqui (título, descrição com a oferta, miniatura), no mesmo formato da
      // prévia da WA-JS; linkPreview: false para a biblioteca não trocar pela prévia que ela buscaria.
      const raw = {
        type: 'chat', subtype: 'url', richPreviewType: 0, doNotPlayInline: true, matchedText: url, canonicalUrl: url, body: caption ? `${caption}\n${url}` : url,
        title: prod.name, description: productDescription(prod), ...(th || {}),
      };
      rv.thumbnail = th ? (th.thumbnailHQ ? 'grande (thumbnailHQ)' : 'pequena') : 'sem miniatura (a foto não carregou)';
      rv.sent = { title: raw.title, description: raw.description, thumbnail: !!raw.thumbnail, thumbnailHQ: !!raw.thumbnailHQ };
      const chat = chatOf(wpp, chatId);
      const before = chat ? mineIds(chat) : null;
      await wpp.chat.sendRawMessage(chatId, raw, { ...o, linkPreview: false });
      if (chat && before) {
        await sleepMs(300);
        const m = newMine(chat, before).find((x) => { try { return String(x.body || (x.attributes && x.attributes.body) || '').includes(url); } catch { return false; } });
        const fin = sentLinkInfo(m);
        rv.final = fin || 'mensagem não encontrada na conversa';
        rv.previewAccepted = !!fin && fin.title === raw.title && fin.description === raw.description && fin.thumbnail === !!raw.thumbnail;
      }
      return { tspVia: th && th.thumbnailHQ ? 'link-grande' : 'link', tspTrace: trace };
    };
    return async () => {
      if (native && (await native().catch((e) => { trace.native.attempts.push({ result: `erro: ${errText(e)}` }); return false; }))) {
        if (caption && hasFn(wpp.chat, 'sendTextMessage')) await wpp.chat.sendTextMessage(chatId, caption, o);
        trace.via = 'nativo';
        return { tspVia: 'nativo', tspTrace: trace };
      }
      const r = await linkSend();
      trace.via = r.tspVia;
      return r;
    };
  }

  root.TspRich = Object.freeze({
    TYPES, LABEL, EMOJI, COLOR, PIX_KEY_TYPES,
    isRich, allowsText, empty, normalize, summary, mirrorText, fmtPhone, pixTypeLabel, normPhone,
    parseMapsLink, placeNameFromLink, isShortMapsLink, productLink, mapsUrl, CATALOG_TEXT, catalogLink, catalogBody, ackStatus, ackVerdict, normalizeProduct, priceLabel, saleAmountOf, productDescription, productOffer, productReadInfo,
    availability, prepareSend, productDiag,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
