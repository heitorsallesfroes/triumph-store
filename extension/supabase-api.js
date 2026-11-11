// Acesso ao Supabase (REST + Storage) usado pelo background.
// Escreve só a pedido de um clique no painel: wa_items.usage_count (+1), as etiquetas CRM
// (wa_labels, wa_contacts, wa_contact_labels) e a biblioteca pelo editor (wa_categories, wa_items,
// wa_item_parts e arquivos novos no bucket wa-media) e os agendamentos (wa_schedules: criar e cancelar
// por clique; o executor do painel reserva e marca o resultado dos que o usuário agendou).
// 2.0.0: motor de envios (wa_settings, wa_send_log), réguas de follow (wa_flows, wa_flow_variants)
// e disparos (wa_campaigns, wa_campaign_targets): configurar só por clique; o motor do painel reserva,
// registra e troca as etiquetas da régua dos contatos que entraram nela.
(function (root) {
  // Mensagens entre background e página têm limite (~64 MB); o arquivo vai em base64 (+33%).
  const MAX_FILE_BYTES = 40 * 1024 * 1024;
  const BUCKET = 'wa-media';

  function cfg() {
    if (!root.WA_CONFIG || !root.WA_CONFIG.SUPABASE_URL || !root.WA_CONFIG.SUPABASE_ANON_KEY) {
      throw new Error('config.js sem SUPABASE_URL / SUPABASE_ANON_KEY');
    }
    return root.WA_CONFIG;
  }

  // 1.9.1: com sessão (auth.js) vai o Bearer do usuário; sem sessão, a chave anon como antes
  function supaFetch(url, init = {}) {
    if (root.WaAuth && typeof root.WaAuth.authFetch === 'function') return root.WaAuth.authFetch(url, init);
    const { SUPABASE_ANON_KEY } = cfg();
    return fetch(url, { ...init, headers: { ...(init.headers || {}), apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  }

  async function restRaw(path, init = {}) {
    const { SUPABASE_URL } = cfg();
    const res = await supaFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  // 2.4.1 (desempenho): duas leituras iguais ao mesmo tempo viram uma só (inclusive de abas
  // diferentes, porque tudo passa por este background) e as listas que mudam pouco (etiquetas,
  // biblioteca, configurações) ficam 45 s em memória. Qualquer gravação limpa a memória.
  const READ_CACHE_MS = 45 * 1000;
  const CACHED_READ = /^(wa_labels|wa_categories|wa_items|wa_item_parts|wa_settings|system_config)\?/;
  const readCache = new Map();
  const inflight = new Map();
  const copy = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  function clearReadCache() { readCache.clear(); }

  async function rest(path, init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    if (method !== 'GET' || init.body !== undefined) {
      readCache.clear();
      try { return await restRaw(path, init); } finally { readCache.clear(); }
    }
    const hit = readCache.get(path);
    if (hit && Date.now() - hit.at < READ_CACHE_MS) return copy(hit.data);
    let p = inflight.get(path);
    if (!p) {
      p = restRaw(path, init).then((data) => {
        if (CACHED_READ.test(path)) readCache.set(path, { data, at: Date.now() });
        return data;
      }).finally(() => inflight.delete(path));
      inflight.set(path, p);
    }
    return copy(await p);
  }

  // Todas as linhas, em páginas de 1000 (o Supabase corta cada resposta em 1000). path com order.
  async function restAll(path, max = 50000) {
    const out = [];
    for (let off = 0; off < max; off += 1000) {
      const rows = await rest(`${path}&limit=1000&offset=${off}`);
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  const ITEM_COLUMNS = 'id,category_id,type,title,body,file_url,file_name,file_size,usage_count,position,created_at';
  const ITEM_ORDER = 'order=position.asc,created_at.asc';

  // Pede também record_seconds; se a coluna ainda não existe no banco (erro 400), busca sem ela
  // 2.1.0: pede também as etiquetas "ao enviar"; sem essas colunas (migration 20261103150000) busca sem elas
  const ON_SEND_COLUMNS = 'on_send_add_label_id,on_send_remove_label_id';
  // 2.7.1: etiquetas do WhatsApp "ao enviar" (migration 20261105120000); sem elas, busca sem
  const ON_SEND_WA_COLUMNS = 'on_send_add_wa_label_id,on_send_remove_wa_label_id';
  // 2.8.6: "tirar de todas" (migration 20261105180000); sem elas, busca sem
  const ON_SEND_ALL_COLUMNS = 'on_send_remove_all_crm,on_send_remove_all_wa';
  // Coluna opcional que o banco disser que não existe sai da consulta, e tenta de novo
  let itemOptionalCols = []; // 2.8.6: colunas opcionais que a última leitura conseguiu pedir
  async function fetchItems() {
    let optional = ['record_seconds', ...ON_SEND_COLUMNS.split(','), ...ON_SEND_WA_COLUMNS.split(','), ...ON_SEND_ALL_COLUMNS.split(','), 'follow_step'];
    // cada grupo "ao enviar" (CRM, WhatsApp, tirar de todas) vem junto na sua migration
    const group = (c) => (c.startsWith('on_send_remove_all_') ? 'on_send_all' : c.startsWith('on_send_') ? (c.includes('_wa_') ? 'on_send_wa' : 'on_send_crm') : c);
    for (;;) {
      try {
        const rows = await rest(`wa_items?select=${[ITEM_COLUMNS, ...optional].join(',')}&${ITEM_ORDER}`);
        itemOptionalCols = optional.slice();
        return rows;
      } catch (err) {
        const gone = /^Supabase 400:/.test(err.message) ? optional.filter((c) => new RegExp(`\\b${c}\\b`).test(err.message)) : [];
        if (!gone.length) throw err;
        optional = optional.filter((c) => !gone.some((g) => group(g) === group(c)));
      }
    }
  }

  // Tabela nova ainda não criada no banco (migration não aplicada)
  const missingTable = (err, table) => /^Supabase (400|404):/.test(err.message)
    && new RegExp(`\\b${table}\\b`).test(err.message) && /PGRST205|42P01|does not exist|Could not find the table/.test(err.message);

  const PART_COLUMNS = 'id,item_id,position,type,body,file_url,file_name,file_size,wait_seconds,typing_seconds';

  // Partes de todos os itens; null = tabela wa_item_parts ainda não existe.
  // 2.8.7: pede também files (álbum; migration 20261105190000); sem a coluna, busca sem ela.
  // 2.9.2: pede também data (tipos novos; migration 20261106120000); sem a coluna, busca sem ela.
  let partFilesCol = false;
  let partDataCol = false;
  async function fetchParts() {
    let optional = ['files', 'data'];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const rows = await rest(`wa_item_parts?select=${PART_COLUMNS}${optional.map((c) => `,${c}`).join('')}&order=item_id.asc,position.asc&limit=10000`);
        partFilesCol = optional.includes('files');
        partDataCol = optional.includes('data');
        return rows;
      } catch (err) {
        // coluna nova que ainda não existe ("column wa_item_parts.data does not exist"): busca sem ela.
        // Vem antes do teste da tabela, porque a mensagem da coluna também tem "does not exist".
        const gone = /^Supabase 400:/.test(err.message) ? optional.filter((c) => new RegExp(`column\\s+[\\w."]*\\b${c}\\b`).test(err.message)) : [];
        if (gone.length) { optional = optional.filter((c) => !gone.includes(c)); continue; }
        if (missingTable(err, 'wa_item_parts')) return null;
        const loose = /^Supabase 400:/.test(err.message) ? optional.filter((c) => new RegExp(`\\b${c}\\b`).test(err.message)) : [];
        if (!loose.length) throw err;
        optional = optional.filter((c) => !loose.includes(c));
      }
    }
    return null;
  }

  async function fetchLibrary() {
    const [categories, items, parts] = await Promise.all([
      rest('wa_categories?select=id,name,position,created_at&order=position.asc,created_at.asc'),
      fetchItems(),
      fetchParts(),
    ]);
    if (parts) {
      const byItem = new Map();
      parts.forEach((p) => {
        if (!byItem.has(p.item_id)) byItem.set(p.item_id, []);
        byItem.get(p.item_id).push(p);
      });
      items.forEach((i) => {
        const list = (byItem.get(i.id) || []).sort((a, b) => a.position - b.position);
        if (list.length) i.parts = list;
        // 2.9.2: 1ª parte de um tipo novo: wa_items guarda 'texto' com um resumo; o painel vê o tipo de verdade
        if (list.length && Rich.isRich(list[0].type)) { i.type = list[0].type; i.body = list[0].body || null; }
      });
    }
    // 2.8.6: a opção "Todas (menos a que vai colocar)" só aparece com as colunas no banco
    // (sem consulta extra: vale se a leitura das mensagens conseguiu pedir as colunas novas)
    return {
      categories, items, partsAvailable: parts !== null, removeAllAvailable: itemOptionalCols.includes('on_send_remove_all_crm'),
      albumAvailable: parts !== null && partFilesCol, richAvailable: parts !== null && partDataCol,
      followAvailable: itemOptionalCols.includes('follow_step'), // 2.10.0
    };
  }

  async function incrementUsage(id) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('id inválido');
    const rows = await rest(`wa_items?select=usage_count&id=eq.${id}`);
    if (!rows.length) throw new Error('Item não encontrado');
    const usage_count = (rows[0].usage_count || 0) + 1;
    await rest(`wa_items?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ usage_count }),
    });
    return usage_count;
  }

  // Só baixa arquivos do bucket wa-media do próprio projeto
  function isAllowedFileUrl(url) {
    return typeof url === 'string' && url.startsWith(`${cfg().SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`);
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  async function fetchFile(url) {
    if (!isAllowedFileUrl(url)) throw new Error('URL de arquivo não permitida');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download falhou (${res.status})`);
    const tooBig = 'Arquivo acima de 40 MB: grande demais para anexar pela extensão';
    if (Number(res.headers.get('content-length') || 0) > MAX_FILE_BYTES) throw new Error(tooBig);
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_BYTES) throw new Error(tooBig);
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim() || 'application/octet-stream';
    return { base64: toBase64(buffer), mime, size: buffer.byteLength };
  }

  // ── Etiquetas ──────────────────────────────────────────────────────────────
  // Contato = só nome e telefone (dígitos). Nunca grava texto de mensagem.

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const eq = (value) => `eq.${encodeURIComponent(value)}`;
  const nameKey = (name) => `nome:${name.toLowerCase().replace(/\s+/g, ' ').trim()}`;
  // 2.16.12: nome da agenda cortado no limite (100) ao salvar e ao comparar, em vez de recusar a identificação
  const NAME_MAX = 100;
  const cutName = (s) => (typeof s === 'string' && s.trim() ? s.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX).trim() : null);

  // chatId (2.0.0): id da conversa individual, quando a extensão sabe (só é gravado se a coluna existir)
  const IDENTITY_CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
  function checkIdentity(identity) {
    const { key, phone, name, chatId } = identity || {};
    const cleanName = cutName(name);
    const chat = typeof chatId === 'string' && IDENTITY_CHAT_RE.test(chatId) ? chatId : null;
    if (typeof key !== 'string') throw new Error('Identificação inválida');
    if (key.startsWith('tel:')) {
      if (!/^\d{8,15}$/.test(phone || '') || key !== `tel:${phone}`) throw new Error('Telefone inválido');
      return { key, phone, name: cleanName, chatId: chat };
    }
    // 2.16.12: nome longo (agenda com mais de 100 letras): a chave e o nome valem cortados no limite
    const keyName = key.startsWith('nome:') ? cutName(key.slice(5)) : null;
    const nm = cleanName || keyName;
    if (!nm || !keyName || nameKey(keyName) !== nameKey(nm)) throw new Error('Identificação inválida');
    // telefone conhecido da conversa (@lid pelo cache do WhatsApp): só para achar o contato, nunca vira chave de nome
    const lookupPhone = typeof phone === 'string' && /^\d{8,15}$/.test(phone) ? phone : null;
    return { key: nameKey(nm), phone: null, name: nm, chatId: chat, lookupPhone };
  }

  // Coluna nova ainda não criada no banco: o PostgREST responde 400 citando o nome dela
  const missingColumn = (err, column) => /^Supabase 400:/.test(err.message) && new RegExp(`\\b${column}\\b`).test(err.message);

  // Pede também hidden; sem a coluna, nenhuma etiqueta fica oculta
  async function fetchLabels() {
    const base = 'wa_labels?select=id,name,color,position';
    const order = '&order=position.asc,created_at.asc';
    try {
      return await rest(`${base},hidden${order}`);
    } catch (err) {
      if (missingColumn(err, 'hidden')) return rest(base + order);
      throw err;
    }
  }

  // 2.16.12: SEMPRE nesta ordem: o mesmo chat_id → o mesmo telefone (do @c.us, ou do @lid pelo cache do WhatsApp) →
  // só então a chave (telefone ou nome) → um contato salvo antes só pelo mesmo nome (para promover).
  // Com chat_id ou telefone conhecido, nunca cria outro contato se já existe um com eles. by: como achou.
  async function findContact(id) {
    const chatCol = id.chatId ? await chatIdColumn().catch(() => false) : false;
    const ph = id.phone || id.lookupPhone || (id.chatId ? phoneOfChat(id.chatId) : null) || null;
    if (chatCol) {
      const byChat = await rest(`wa_contacts?select=id,key,phone,chat_id&chat_id=eq.${encodeURIComponent(id.chatId)}&order=created_at.asc&limit=5`);
      // 2.6.3: o mesmo chat_id com o telefone de outra pessoa não vale
      const ok = byChat.find((r) => !r.phone || !ph || r.phone === ph);
      if (ok) return { ...ok, by: 'chat' };
    }
    if (ph) {
      const byPhone = await rest(`wa_contacts?select=id,key,phone${chatCol ? ',chat_id' : ''}&phone=eq.${ph}&order=created_at.asc&limit=1`);
      if (byPhone.length) return { ...byPhone[0], by: 'phone' };
    }
    const rows = await rest(`wa_contacts?select=id,key,phone&key=${eq(id.key)}`);
    if (rows.length) return { ...rows[0], by: id.key.startsWith('tel:') ? 'phone' : 'name' };
    if (id.phone && id.name) {
      const byName = await rest(`wa_contacts?select=id,key,phone&key=${eq(nameKey(id.name))}&phone=is.null`);
      if (byName.length) return { ...byName[0], promotable: true, by: 'name' };
    }
    return null;
  }

  async function labelIdsOf(contactId) {
    const rows = await rest(`wa_contact_labels?select=label_id&contact_id=eq.${contactId}`);
    return rows.map((r) => r.label_id);
  }

  async function getContactLabels(identity) {
    const contact = await findContact(checkIdentity(identity));
    return contact ? labelIdsOf(contact.id) : [];
  }
  // 2.16.12: as etiquetas e COMO a conversa foi reconhecida (chat / phone / name / null), para o aviso do painel
  async function contactLabelsMatch(identity) {
    const contact = await findContact(checkIdentity(identity));
    return { ids: contact ? await labelIdsOf(contact.id) : [], by: contact ? contact.by || null : null };
  }

  // Só é chamado ao aplicar uma etiqueta: abrir a conversa não grava nada
  async function ensureContact(id) {
    const found = await findContact(id);
    if (found && !found.promotable) return found;
    const now = new Date().toISOString();
    if (found) {
      const rows = await rest(`wa_contacts?id=eq.${found.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ key: id.key, phone: id.phone, name: id.name, updated_at: now }),
      });
      return rows[0];
    }
    const rows = await rest('wa_contacts?on_conflict=key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ key: id.key, name: cutName(id.name), phone: id.phone, updated_at: now }),
    });
    return rows[0];
  }

  // ── 2.16.12: juntar contatos duplicados (mesmo chat_id ou mesmo telefone) no mais antigo ──
  // Move etiquetas (sem duplicar, com a data de entrada mais antiga), nota, nome (prefere o da agenda: o do contato
  // criado pelo nome da conversa), percursos de automação, inscrições, régua, disparos e envios; depois apaga o
  // duplicado. Contatos sem par não são tocados. Pura: groupDuplicates (testada em tests/dupmerge.test.cjs).
  function groupDuplicates(rows) {
    const parent = new Map(rows.map((r) => [r.id, r.id]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const join = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };
    const first = new Map();
    rows.forEach((r) => {
      const ph = r.phone ? String(r.phone).replace(/\D/g, '') : '';
      [r.chat_id ? `c:${r.chat_id}` : null, ph.length >= 8 ? `p:${ph}` : null].filter(Boolean).forEach((k) => { if (first.has(k)) join(first.get(k), r.id); else first.set(k, r.id); });
    });
    const groups = new Map();
    rows.forEach((r) => { const g = find(r.id); groups.set(g, [...(groups.get(g) || []), r]); });
    const age = (r) => { const t = Date.parse(r.created_at || ''); return Number.isFinite(t) ? t : Infinity; };
    return [...groups.values()].filter((l) => l.length > 1).map((l) => {
      const sorted = [...l].sort((a, b) => age(a) - age(b) || String(a.id).localeCompare(String(b.id)));
      return { keep: sorted[0], dups: sorted.slice(1) };
    });
  }
  // o que muda no contato que fica: telefone/conversa/nota/nome que ele não tinha
  function mergedFields(keep, dups) {
    const all = [keep, ...dups];
    const phone = keep.phone || (dups.find((d) => d.phone) || {}).phone || null;
    const chatId = keep.chat_id || (dups.find((d) => d.chat_id) || {}).chat_id || null;
    const agenda = all.find((c) => typeof c.key === 'string' && c.key.startsWith('nome:') && c.name);
    const name = cutName((agenda && agenda.name) || keep.name || (dups.find((d) => d.name) || {}).name || null);
    const notes = [...new Set(all.map((c) => (typeof c.notes === 'string' ? c.notes.trim() : '')).filter(Boolean))].join('\n').slice(0, 2000) || null;
    return { phone, chat_id: chatId, name, notes, key: phone ? `tel:${phone}` : keep.key };
  }
  async function mergeDuplicateContacts() {
    const hasChat = await chatIdColumn().catch(() => false);
    const hasNotes = await hasColumn('wa_contacts', 'notes').catch(() => false);
    const rows = await restAll(`wa_contacts?select=id,key,name,phone,created_at${hasChat ? ',chat_id' : ''}${hasNotes ? ',notes' : ''}&order=created_at.asc`);
    const groups = groupDuplicates(rows);
    let merged = 0;
    const errors = [];
    const tryRest = async (path, opt) => { try { await rest(path, opt); return true; } catch { return false; } };
    for (const { keep, dups } of groups) {
      try {
        const ids = dups.map((d) => d.id);
        // etiquetas: sem duplicar, mantendo a data de entrada mais antiga
        const labels = await rest(`wa_contact_labels?select=contact_id,label_id,created_at&contact_id=in.(${[keep.id, ...ids].join(',')})`);
        const best = new Map();
        labels.forEach((l) => { const cur = best.get(l.label_id); if (!cur || String(l.created_at) < String(cur.created_at)) best.set(l.label_id, l); });
        const keepHas = new Map(labels.filter((l) => l.contact_id === keep.id).map((l) => [l.label_id, l]));
        for (const [labelId, l] of best) {
          if (!keepHas.has(labelId)) {
            await rest('wa_contact_labels?on_conflict=contact_id,label_id', json('POST', 'resolution=ignore-duplicates,return=minimal', { contact_id: keep.id, label_id: labelId, created_at: l.created_at }));
          } else if (String(l.created_at) < String(keepHas.get(labelId).created_at)) {
            await rest(`wa_contact_labels?contact_id=eq.${keep.id}&label_id=eq.${labelId}`, json('PATCH', 'return=minimal', { created_at: l.created_at }));
          }
        }
        for (const d of ids) {
          // percursos de automação (único por automação + contato + gatilho) e inscrições (uma ativa por automação)
          for (const r of await rest(`wa_automation_runs?select=id,automation_id,run_key&contact_id=eq.${d}`).catch(() => [])) {
            const clash = await rest(`wa_automation_runs?select=id&contact_id=eq.${keep.id}&automation_id=eq.${r.automation_id}&run_key=eq.${encodeURIComponent(r.run_key)}&limit=1`).catch(() => []);
            if (!clash.length) await tryRest(`wa_automation_runs?id=eq.${r.id}`, json('PATCH', 'return=minimal', { contact_id: keep.id }));
          }
          for (const e of await rest(`wa_automation_enrollments?select=id,automation_id,removed_at&contact_id=eq.${d}`).catch(() => [])) {
            const clash = e.removed_at ? [] : await rest(`wa_automation_enrollments?select=id&contact_id=eq.${keep.id}&automation_id=eq.${e.automation_id}&removed_at=is.null&limit=1`).catch(() => []);
            if (!clash.length) await tryRest(`wa_automation_enrollments?id=eq.${e.id}`, json('PATCH', 'return=minimal', { contact_id: keep.id }));
          }
          for (const t of ['wa_sequence_runs', 'wa_campaign_targets', 'wa_send_log']) await tryRest(`${t}?contact_id=eq.${d}`, json('PATCH', 'return=minimal', { contact_id: keep.id }));
        }
        const f = mergedFields(keep, dups);
        await rest(`wa_contacts?id=in.(${ids.join(',')})`, { method: 'DELETE' }); // antes de trocar a chave (key é única)
        const patch = { name: f.name, phone: f.phone, key: f.key, updated_at: new Date().toISOString() };
        if (hasChat) patch.chat_id = f.chat_id;
        if (hasNotes) patch.notes = f.notes;
        await rest(`wa_contacts?id=eq.${keep.id}`, json('PATCH', 'return=minimal', patch));
        merged += ids.length;
      } catch (e) { errors.push(String((e && e.message) || e)); }
    }
    return { merged, groups: groups.length, errors: errors.slice(0, 5) };
  }

  // Marca ou desmarca uma etiqueta; devolve as etiquetas do contato depois da mudança
  async function setContactLabel({ identity, labelId, on }) {
    const id = checkIdentity(identity);
    if (typeof labelId !== 'string' || !UUID_RE.test(labelId)) throw new Error('Etiqueta inválida');
    if (on) {
      const contact = await ensureContact(id);
      if (id.chatId) await rememberChatId(contact, id.chatId).catch(() => {});
      await rest('wa_contact_labels?on_conflict=contact_id,label_id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ contact_id: contact.id, label_id: labelId }),
      });
      return labelIdsOf(contact.id);
    }
    const contact = await findContact(id);
    if (!contact) return [];
    await rest(`wa_contact_labels?contact_id=eq.${contact.id}&label_id=eq.${labelId}`, { method: 'DELETE' });
    return labelIdsOf(contact.id);
  }

  // ── Aba Etiquetas (só leitura) ─────────────────────────────────────────────

  // Total de linhas sem baixá-las (HEAD + Prefer: count=exact → Content-Range "*/N")
  const countInflight = new Map();
  function countRows(path) {
    let p = countInflight.get(path);
    if (!p) {
      p = countRowsRaw(path).finally(() => countInflight.delete(path));
      countInflight.set(path, p);
    }
    return p;
  }

  async function countRowsRaw(path) {
    const { SUPABASE_URL } = cfg();
    const res = await supaFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact' },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const total = Number((res.headers.get('content-range') || '').split('/')[1]);
    if (!Number.isFinite(total)) throw new Error('Contagem indisponível');
    return total;
  }

  // { labelId: quantidade de clientes }
  async function fetchLabelCounts() {
    const labels = await rest('wa_labels?select=id');
    const counts = await Promise.all(labels.map((l) => countRows(`wa_contact_labels?label_id=eq.${l.id}`)));
    return Object.fromEntries(labels.map((l, i) => [l.id, counts[i]]));
  }

  // Busca por nome (contém, sem diferenciar maiúsculas) ou por trecho do telefone
  function clientSearchFilter(search) {
    const text = String(search || '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!text) return '';
    const parts = [`name.ilike.*${text}*`];
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 3) parts.push(`phone.like.*${digits}*`);
    return `&contact.or=${encodeURIComponent(`(${parts.join(',')})`)}`;
  }

  // Clientes de uma etiqueta, mais recentes primeiro, em páginas (máx. 200, abaixo do limite de 1000).
  // A nota nunca sai daqui: vira só hasNote (sem a coluna notes, hasNote = false).
  async function fetchLabelClients({ labelId, offset = 0, limit = 50, search = '' }) {
    if (typeof labelId !== 'string' || !UUID_RE.test(labelId)) throw new Error('Etiqueta inválida');
    const off = Math.max(0, Math.floor(Number(offset) || 0));
    const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
    const query = (cols) => rest(
      `wa_contact_labels?select=created_at,contact:wa_contacts!inner(${cols})` +
      `&label_id=eq.${labelId}&order=created_at.desc,contact_id.asc&offset=${off}&limit=${lim + 1}` +
      clientSearchFilter(search),
    );
    let rows;
    try {
      rows = await query('id,key,name,phone,notes');
    } catch (err) {
      if (!missingColumn(err, 'notes')) throw err;
      rows = await query('id,key,name,phone');
    }
    return {
      clients: rows.slice(0, lim).map((r) => ({
        id: r.contact.id,
        name: r.contact.name,
        phone: r.contact.phone,
        byName: String(r.contact.key).startsWith('nome:'),
        addedAt: r.created_at || null,
        hasNote: typeof r.contact.notes === 'string' && r.contact.notes.trim() !== '',
      })),
      hasMore: rows.length > lim,
    };
  }

  // ── Etiquetas CRM: gerenciar (só a pedido de um clique no painel) ─────────

  const PALETTE = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#6b7280'];
  const NOTE_MAX = 2000;
  const LABEL_NAME_MAX = 40;
  const NOTES_MISSING = 'Nota disponível após atualizar o banco';
  const HIDDEN_MISSING = 'Ocultar disponível após atualizar o banco';
  const json = (method, prefer, body) => ({
    method,
    headers: { 'Content-Type': 'application/json', Prefer: prefer },
    body: JSON.stringify(body),
  });

  function checkUuid(id, what = 'Etiqueta inválida') {
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new Error(what);
    return id;
  }

  function checkLabelName(name) {
    const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
    if (!clean || clean.length > LABEL_NAME_MAX) throw new Error(`Nome da etiqueta CRM: 1 a ${LABEL_NAME_MAX} caracteres`);
    return clean;
  }

  function checkColor(color) {
    const c = typeof color === 'string' ? color.toLowerCase() : '';
    if (!PALETTE.includes(c)) throw new Error('Cor fora da paleta');
    return c;
  }

  const duplicateName = (err) => /^Supabase 409:/.test(err.message) || /duplicate key|23505/.test(err.message);

  // Quais colunas novas (migration 20261031120000) já existem no banco
  async function hasColumn(table, column) {
    try {
      await rest(`${table}?select=${column}&limit=1`);
      return true;
    } catch (err) {
      if (missingColumn(err, column)) return false;
      throw err;
    }
  }

  async function fetchSchema() {
    const [hidden, notes] = await Promise.all([hasColumn('wa_labels', 'hidden'), hasColumn('wa_contacts', 'notes')]);
    return { hidden, notes };
  }

  async function createLabel({ name, color }) {
    const clean = checkLabelName(name);
    const c = checkColor(color);
    const last = await rest('wa_labels?select=position&order=position.desc&limit=1');
    const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
    try {
      const rows = await rest('wa_labels', json('POST', 'return=representation', { name: clean, color: c, position }));
      const l = rows[0];
      return { id: l.id, name: l.name, color: l.color, position: l.position };
    } catch (err) {
      if (duplicateName(err)) throw new Error('Já existe uma etiqueta CRM com esse nome');
      throw err;
    }
  }

  async function updateLabel({ id, name, color, hidden, position }) {
    checkUuid(id);
    const patch = {};
    if (name !== undefined) patch.name = checkLabelName(name);
    if (color !== undefined) patch.color = checkColor(color);
    if (hidden !== undefined) {
      if (typeof hidden !== 'boolean') throw new Error('Valor inválido');
      patch.hidden = hidden;
    }
    if (position !== undefined) {
      if (!Number.isInteger(position) || position < 0 || position > 100000) throw new Error('Posição inválida');
      patch.position = position;
    }
    if (!Object.keys(patch).length) throw new Error('Nada para mudar');
    try {
      await rest(`wa_labels?id=eq.${id}`, json('PATCH', 'return=minimal', patch));
    } catch (err) {
      if (patch.hidden !== undefined && missingColumn(err, 'hidden')) throw new Error(HIDDEN_MISSING);
      if (duplicateName(err)) throw new Error('Já existe uma etiqueta CRM com esse nome');
      throw err;
    }
    return true;
  }

  // Apaga as marcações e a etiqueta. Contatos nunca são apagados.
  async function deleteLabel({ id }) {
    checkUuid(id);
    await rest(`wa_contact_labels?label_id=eq.${id}`, { method: 'DELETE' });
    await rest(`wa_labels?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  // Grava position = ordem da lista
  async function reorderLabels({ ids }) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 200) throw new Error('Lista inválida');
    ids.forEach((id) => checkUuid(id));
    if (new Set(ids).size !== ids.length) throw new Error('Lista inválida');
    for (let i = 0; i < ids.length; i++) {
      await rest(`wa_labels?id=eq.${ids[i]}`, json('PATCH', 'return=minimal', { position: i }));
    }
    return true;
  }

  // Nota do contato aberto (só leitura; não cria contato)
  async function getContactNote(identity) {
    const id = checkIdentity(identity);
    if (!(await hasColumn('wa_contacts', 'notes'))) return { available: false, note: '' };
    const found = await findContact(id);
    if (!found) return { available: true, note: '' };
    const rows = await rest(`wa_contacts?select=notes&id=eq.${found.id}`);
    return { available: true, note: (rows[0] && rows[0].notes) || '' };
  }

  // Grava a nota (cria o contato se ainda não existir). Texto vazio apaga a nota.
  async function setContactNote({ identity, note }) {
    const id = checkIdentity(identity);
    if (typeof note !== 'string' || note.length > NOTE_MAX) throw new Error(`Nota: até ${NOTE_MAX} caracteres`);
    if (!(await hasColumn('wa_contacts', 'notes'))) throw new Error(NOTES_MISSING);
    const text = note.trim();
    const contact = await ensureContact(id);
    await rest(`wa_contacts?id=eq.${contact.id}`, json('PATCH', 'return=minimal', { notes: text || null, updated_at: new Date().toISOString() }));
    return { note: text };
  }

  // Valor para filtro in.(...) do PostgREST, entre aspas
  const inList = (values) => encodeURIComponent(`(${values.map((v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`);

  // Copiar do WhatsApp: até 100 contatos por vez para uma etiqueta CRM.
  // Contatos novos são criados (nome e telefone); os que já existem não são alterados.
  async function bulkAddContactsToLabel({ labelId, contacts }) {
    checkUuid(labelId);
    if (!Array.isArray(contacts) || !contacts.length || contacts.length > 100) throw new Error('Lote inválido (1 a 100 contatos)');
    const byKey = new Map();
    contacts.forEach((c) => {
      const id = checkIdentity(c);
      if (!byKey.has(id.key)) byKey.set(id.key, id);
    });
    const list = [...byKey.values()];
    await rest('wa_contacts?on_conflict=key', json('POST', 'resolution=ignore-duplicates,return=minimal',
      list.map((c) => ({ key: c.key, name: c.name, phone: c.phone }))));
    const hasChatCol = list.some((c) => c.chatId) && (await chatIdColumn());
    const rows = await rest(`wa_contacts?select=id,key${hasChatCol ? ',chat_id' : ''}&key=in.${inList(list.map((c) => c.key))}`);
    // 2.0.0: grava o id da conversa de quem ainda não tem (ou mudou)
    if (hasChatCol) {
      const want = new Map(list.filter((c) => c.chatId).map((c) => [c.key, c.chatId]));
      for (const r of rows) {
        if (want.has(r.key) && r.chat_id !== want.get(r.key)) await rememberChatId(r, want.get(r.key)).catch(() => {});
      }
    }
    const ids = rows.map((r) => r.id);
    if (!ids.length) return { added: 0, addedTel: 0, addedName: 0, already: 0 };
    const existing = await rest(`wa_contact_labels?select=contact_id&label_id=eq.${labelId}&contact_id=in.${inList(ids)}`);
    const had = new Set(existing.map((r) => r.contact_id));
    const fresh = rows.filter((r) => !had.has(r.id));
    if (fresh.length) {
      await rest('wa_contact_labels?on_conflict=contact_id,label_id', json('POST', 'resolution=ignore-duplicates,return=minimal',
        fresh.map((r) => ({ contact_id: r.id, label_id: labelId }))));
    }
    const addedTel = fresh.filter((r) => String(r.key).startsWith('tel:')).length;
    return { added: fresh.length, addedTel, addedName: fresh.length - addedTel, already: had.size };
  }

  // Quadro CRM: põe na etiqueta de destino e depois tira da de origem (o contato nunca fica sem as duas)
  async function moveContactLabel({ contactId, from, to }) {
    checkUuid(contactId, 'Contato inválido');
    checkUuid(from);
    checkUuid(to);
    if (from === to) throw new Error('Mesma etiqueta');
    await rest('wa_contact_labels?on_conflict=contact_id,label_id', json('POST', 'resolution=ignore-duplicates,return=minimal',
      { contact_id: contactId, label_id: to }));
    await rest(`wa_contact_labels?contact_id=eq.${contactId}&label_id=eq.${from}`, { method: 'DELETE' });
    return true;
  }

  // Todos os contatos de uma etiqueta (páginas de 200), para o CSV
  async function fetchAllLabelClients({ labelId }) {
    checkUuid(labelId);
    const all = [];
    for (let offset = 0; offset < 100000; offset += 200) {
      const page = await fetchLabelClients({ labelId, offset, limit: 200 });
      page.clients.forEach((c) => all.push({ name: c.name, phone: c.phone, byName: c.byName }));
      if (!page.hasMore) break;
    }
    return all;
  }

  // ── Biblioteca: editor do painel (1.9.0). Só a pedido de um clique; tudo validado aqui ──

  const Rich = root.TspRich; // 2.9.2 (rich-parts.js, carregado antes pelo background)
  const ITEM_TYPES = ['texto', 'audio', 'imagem', 'video', 'documento', ...Rich.TYPES];
  const MAX_PARTS = 10;
  const TEXT_MAX = 4096;
  const TITLE_MAX = 80;
  const CATEGORY_MAX = 60;
  const PARTS_MISSING = 'Atualize o banco para usar este recurso';
  // Tipos de arquivo aceitos no upload, por tipo de parte
  const UPLOAD_MIME = {
    imagem: ['image/jpeg', 'image/png', 'image/webp'],
    video: ['video/mp4'],
    audio: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm'],
    documento: ['application/pdf'],
  };

  const cleanText = (v, max, what) => {
    const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    if (!t || t.length > max) throw new Error(`${what}: 1 a ${max} caracteres`);
    return t;
  };
  const intIn = (v, min, max, what) => {
    if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${what}: ${min} a ${max}`);
    return v;
  };

  function checkPart(p, index) {
    const n = index + 1;
    if (!p || typeof p !== 'object' || !ITEM_TYPES.includes(p.type)) throw new Error(`Parte ${n}: tipo inválido`);
    const wait_seconds = intIn(p.wait_seconds ?? 0, 0, 600, `Parte ${n}: esperar`);
    const typing_seconds = intIn(p.typing_seconds ?? 0, 0, 60, `Parte ${n}: digitando`);
    if (p.type === 'texto') {
      if (typeof p.body !== 'string' || !p.body.trim() || p.body.length > TEXT_MAX) throw new Error(`Parte ${n}: texto de 1 a ${TEXT_MAX} caracteres`);
      return { type: 'texto', body: p.body, file_url: null, file_name: null, file_size: null, wait_seconds, typing_seconds };
    }
    // 2.9.2: localização, produto, catálogo, contato e Pix: os dados vão em data (jsonb)
    if (Rich.isRich(p.type)) {
      let data;
      try { data = Rich.normalize(p.type, p.data); } catch (e) { throw new Error(`Parte ${n}: ${e.message}`); }
      let body = null;
      if (Rich.allowsText(p.type) && typeof p.body === 'string' && p.body.trim()) {
        if (p.body.length > TEXT_MAX) throw new Error(`Parte ${n}: texto até ${TEXT_MAX} caracteres`);
        body = p.body;
      }
      return { type: p.type, body, file_url: null, file_name: null, file_size: null, wait_seconds, typing_seconds, data };
    }
    // 2.8.7: álbum = parte 'imagem' com até 10 arquivos (fotos e vídeos MP4); a parte guarda o 1º arquivo
    let files = null;
    if (p.files != null) {
      if (p.type !== 'imagem' || !Array.isArray(p.files) || p.files.length < 1 || p.files.length > ALBUM_MAX) throw new Error(`Parte ${n}: de 1 a ${ALBUM_MAX} fotos/vídeos`);
      files = p.files.map((f, k) => {
        if (!f || !isAllowedFileUrl(f.file_url)) throw new Error(`Parte ${n}: arquivo ${k + 1} inválido`);
        const fsz = f.file_size == null ? null : Number(f.file_size);
        if (fsz != null && (!Number.isFinite(fsz) || fsz < 0 || fsz > MAX_FILE_BYTES)) throw new Error(`Parte ${n}: arquivo ${k + 1} acima de 40 MB`);
        // 2.8.9: caption_before (só no 1º arquivo) = a legenda vai como texto ANTES das fotos (padrão: depois)
        return { file_url: f.file_url, file_name: typeof f.file_name === 'string' && f.file_name.trim() ? f.file_name.trim().slice(0, 200) : 'arquivo', file_size: fsz, kind: f.kind === 'video' ? 'video' : 'imagem', ...(k === 0 && f.caption_before === true ? { caption_before: true } : {}) };
      });
      p = { ...p, file_url: files[0].file_url, file_name: files[0].file_name, file_size: files[0].file_size };
    }
    if (!isAllowedFileUrl(p.file_url)) throw new Error(`Parte ${n}: arquivo inválido`);
    const file_name = typeof p.file_name === 'string' && p.file_name.trim() ? p.file_name.trim().slice(0, 200) : 'arquivo';
    const size = p.file_size == null ? null : Number(p.file_size);
    if (size != null && (!Number.isFinite(size) || size < 0 || size > MAX_FILE_BYTES)) throw new Error(`Parte ${n}: arquivo acima de 40 MB`);
    let body = null;
    if (p.type !== 'audio' && typeof p.body === 'string' && p.body.trim()) {
      if (p.body.length > TEXT_MAX) throw new Error(`Parte ${n}: legenda até ${TEXT_MAX} caracteres`);
      body = p.body;
    }
    return { type: p.type, body, file_url: p.file_url, file_name, file_size: size, wait_seconds, typing_seconds, ...(files ? { files } : {}) };
  }
  const ALBUM_MAX = 10;

  async function partsTableExists() {
    try {
      await rest('wa_item_parts?select=id&limit=1');
      return true;
    } catch (err) {
      if (missingTable(err, 'wa_item_parts')) return false;
      throw err;
    }
  }

  // Cria ou edita um item. A parte 1 é espelhada nos campos do wa_items (para o ERP continuar mostrando algo).
  // Sem a tabela de partes: só item de 1 parte (campos do wa_items, como antes).
  const WA_LABEL_ID_RE = /^[\w.:@-]{1,40}$/;
  const waLabelId = (v) => {
    if (v == null || v === '') return null;
    const s = String(v);
    if (!WA_LABEL_ID_RE.test(s)) throw new Error('Etiqueta do WhatsApp inválida');
    return s;
  };

  async function saveItem({ id, category_id, title, parts, on_send_add_label_id, on_send_remove_label_id, on_send_add_wa_label_id, on_send_remove_wa_label_id, on_send_remove_all_crm, on_send_remove_all_wa, follow_step }) {
    if (id !== undefined && id !== null) checkUuid(id, 'Item inválido');
    checkUuid(category_id, 'Categoria inválida');
    const cleanTitle = cleanText(title, TITLE_MAX, 'Título');
    if (!Array.isArray(parts) || !parts.length || parts.length > MAX_PARTS) throw new Error(`De 1 a ${MAX_PARTS} partes`);
    const list = parts.map(checkPart);
    // 2.1.0: etiquetas CRM "ao enviar" (opcionais; só gravadas se as colunas existirem)
    const addLabel = on_send_add_label_id == null || on_send_add_label_id === '' ? null : checkUuid(on_send_add_label_id, 'Etiqueta inválida');
    const removeLabel = on_send_remove_label_id == null || on_send_remove_label_id === '' ? null : checkUuid(on_send_remove_label_id, 'Etiqueta inválida');
    if (addLabel && addLabel === removeLabel) throw new Error('Escolha etiquetas diferentes para colocar e tirar');
    const wantsLabels = on_send_add_label_id !== undefined || on_send_remove_label_id !== undefined;
    const labelCols = wantsLabels && (await probe('wa_items.on_send', () => hasColumn('wa_items', 'on_send_add_label_id')));
    if ((addLabel || removeLabel) && !labelCols) throw new Error('Atualize o banco para usar este recurso');
    // 2.7.1: etiquetas do WhatsApp "ao enviar" (id como texto; só gravadas se as colunas existirem)
    const addWa = waLabelId(on_send_add_wa_label_id);
    const removeWa = waLabelId(on_send_remove_wa_label_id);
    if (addWa && addWa === removeWa) throw new Error('Escolha etiquetas do WhatsApp diferentes para colocar e tirar');
    const wantsWa = on_send_add_wa_label_id !== undefined || on_send_remove_wa_label_id !== undefined;
    const waCols = wantsWa && (await probe('wa_items.on_send_wa', () => hasColumn('wa_items', 'on_send_add_wa_label_id')));
    if ((addWa || removeWa) && !waCols) throw new Error('Atualize o banco para usar este recurso');
    // 2.8.6: "Todas (menos a que vai colocar)"
    const allCrm = on_send_remove_all_crm === true;
    const allWa = on_send_remove_all_wa === true;
    const wantsAll = on_send_remove_all_crm !== undefined || on_send_remove_all_wa !== undefined;
    const allCols = wantsAll && (await probe('wa_items.remove_all', () => hasColumn('wa_items', 'on_send_remove_all_crm')));
    if ((allCrm || allWa) && !allCols) throw new Error('Atualize o banco para usar este recurso');
    // 2.10.0: "Esta mensagem é um follow-up" + etapa (null = não é); só gravado com a coluna
    if (follow_step != null && !(Number.isInteger(follow_step) && follow_step >= 1 && follow_step <= 20)) throw new Error('Etapa do follow-up: 1 a 20');
    const stepCol = follow_step !== undefined && (await probe('wa_items.follow_step', () => hasColumn('wa_items', 'follow_step')));
    if (follow_step != null && !stepCol) throw new Error('Atualize o banco para usar este recurso');
    const hasTable = await partsTableExists();
    if (!hasTable && list.length > 1) throw new Error(PARTS_MISSING);
    // 2.9.2: tipos novos só com a coluna data (e a regra do tipo trocada, na mesma migration)
    const anyData = list.some((p) => p.data);
    if (anyData && !(hasTable && (await probe('wa_item_parts.data', () => hasColumn('wa_item_parts', 'data'))))) throw new Error(PARTS_MISSING);
    const first = list[0];
    // 1ª parte de um tipo novo: wa_items fica como texto com o resumo (a regra do tipo em wa_items não muda)
    const mirror = Rich.isRich(first.type) ? { type: 'texto', body: Rich.mirrorText(first) } : { type: first.type, body: first.body };
    const fields = {
      category_id, title: cleanTitle, type: mirror.type, body: mirror.body,
      file_url: first.file_url, file_name: first.file_name, file_size: first.file_size,
      ...(labelCols ? { on_send_add_label_id: addLabel, on_send_remove_label_id: removeLabel } : {}),
      ...(waCols ? { on_send_add_wa_label_id: addWa, on_send_remove_wa_label_id: removeWa } : {}),
      ...(allCols ? { on_send_remove_all_crm: allCrm, on_send_remove_all_wa: allWa, ...(allCrm && labelCols ? { on_send_remove_label_id: null } : {}), ...(allWa && waCols ? { on_send_remove_wa_label_id: null } : {}) } : {}),
      ...(stepCol ? { follow_step: follow_step ?? null } : {}),
    };
    if (stepCol) followSteps.at = 0; // o próximo envio relê as etapas
    let itemId = id;
    if (itemId) {
      const rows = await rest(`wa_items?id=eq.${itemId}`, json('PATCH', 'return=representation', fields));
      if (!rows.length) throw new Error('Item não encontrado');
    } else {
      const last = await rest(`wa_items?select=position&category_id=eq.${category_id}&order=position.desc&limit=1`);
      const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
      const rows = await rest('wa_items', json('POST', 'return=representation', { ...fields, position }));
      itemId = rows[0].id;
    }
    if (hasTable) {
      await rest(`wa_item_parts?item_id=eq.${itemId}`, { method: 'DELETE' });
      // 2.8.7: com álbum, todas as linhas levam files (o PostgREST pede as mesmas chaves em todas)
      const anyFiles = list.some((p) => p.files);
      if (anyFiles && !(await probe('wa_item_parts.files', () => hasColumn('wa_item_parts', 'files')))) throw new Error('Atualize o banco para usar este recurso');
      await rest('wa_item_parts', json('POST', 'return=minimal', list.map((p, i) => ({ ...p, ...(anyFiles ? { files: p.files || null } : {}), ...(anyData ? { data: p.data || null } : {}), item_id: itemId, position: i }))));
    }
    return { id: itemId };
  }

  // 2.13.1: onde a mensagem rápida está em uso e impede a exclusão: agendamentos PENDENTES, automações/réguas
  // (ações, variantes e caixas ✉ do construtor), réguas de follow antigas (wa_flows) e disparos não terminados.
  // Tabela/coluna que não existir é pulada (sem ela, não tem como estar em uso ali).
  const CAMPAIGN_OPEN = ['rascunho', 'agendada', 'rodando', 'pausada'];
  async function itemUsage({ id }) {
    checkUuid(id, 'Item inválido');
    const safe = async (fn) => { try { return await fn(); } catch { return []; } };
    const uses = (v) => JSON.stringify(v || null).includes(`"${id}"`);
    const [schedules, autos, flows, variants, campaigns] = await Promise.all([
      safe(() => rest(`wa_schedules?select=id,chat_id,chat_name,send_at&item_id=eq.${id}&status=eq.pendente&order=send_at.asc&limit=50`)),
      safe(() => restAll('wa_automations?select=id,name,active,kind,actions,sequence&order=id.asc')),
      safe(() => rest(`wa_flows?select=id,name,active&item_id=eq.${id}&limit=50`)),
      safe(() => rest(`wa_flow_variants?select=flow_id&item_id=eq.${id}&limit=200`)),
      safe(() => rest(`wa_campaigns?select=id,name,status&item_id=eq.${id}&status=in.(${CAMPAIGN_OPEN.join(',')})&limit=50`)),
    ]);
    const flowIds = [...new Set([...flows.map((f) => f.id), ...variants.map((v) => v.flow_id)])];
    const flowRows = flowIds.length ? await safe(() => rest(`wa_flows?select=id,name,active&id=in.${inList(flowIds)}`)) : [];
    return {
      schedules: schedules.map((s) => ({ id: s.id, chatId: s.chat_id, chatName: s.chat_name || null, sendAt: s.send_at })),
      automations: autos.filter((a) => uses(a.actions) || uses(a.sequence)).map((a) => ({ id: a.id, name: a.name, active: !!a.active, kind: a.kind === 'sequencia' ? 'sequencia' : 'automacao' })),
      flows: flowRows.map((f) => ({ id: f.id, name: f.name, active: !!f.active })),
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status })),
    };
  }
  const usageCount = (u) => u.schedules.length + u.automations.length + u.flows.length + u.campaigns.length;

  // Apaga o item; as partes vão junto (on delete cascade). Arquivos no Storage ficam.
  // 2.13.1: em uso (agendamento pendente, automação, régua, disparo) → não apaga e diz onde (err.usage)
  async function deleteItem({ id }) {
    checkUuid(id, 'Item inválido');
    const usage = await itemUsage({ id });
    if (usageCount(usage)) throw Object.assign(new Error('Mensagem em uso'), { code: 'em_uso', usage });
    await rest(`wa_items?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  async function createCategory({ name }) {
    const clean = cleanText(name, CATEGORY_MAX, 'Nome da categoria');
    const last = await rest('wa_categories?select=position&order=position.desc&limit=1');
    const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
    const rows = await rest('wa_categories', json('POST', 'return=representation', { name: clean, position }));
    return { id: rows[0].id, name: rows[0].name, position: rows[0].position };
  }

  async function renameCategory({ id, name }) {
    checkUuid(id, 'Categoria inválida');
    const clean = cleanText(name, CATEGORY_MAX, 'Nome da categoria');
    await rest(`wa_categories?id=eq.${id}`, json('PATCH', 'return=minimal', { name: clean }));
    return true;
  }

  // Sem withItems: só apaga categoria vazia. 2.8.2: withItems apaga a categoria e as mensagens dela (as partes vão
  // junto; arquivos no Storage e mídias da biblioteca ficam).
  async function deleteCategory({ id, withItems = false }) {
    checkUuid(id, 'Categoria inválida');
    const items = await rest(`wa_items?select=id&category_id=eq.${id}`);
    if (items.length && withItems !== true) throw new Error('A categoria tem mensagens: mova ou exclua as mensagens antes');
    if (items.length) await rest(`wa_items?category_id=eq.${id}`, { method: 'DELETE' });
    await rest(`wa_categories?id=eq.${id}`, { method: 'DELETE' });
    return { deleted: true, items: items.length };
  }

  // 2.8.5: arrastar mensagens: categoria e ordem (ids na ordem nova da categoria de destino)
  async function moveItems({ categoryId, ids }) {
    checkUuid(categoryId, 'Categoria inválida');
    if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw new Error('Ordem inválida');
    ids.forEach((x) => checkUuid(x, 'Item inválido'));
    for (let i = 0; i < ids.length; i++) await rest(`wa_items?id=eq.${ids[i]}`, json('PATCH', 'return=minimal', { category_id: categoryId, position: i }));
    return true;
  }

  // 2.8.2: ordem das categorias (2.8.5: pelo arraste)
  async function reorderCategories({ ids }) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 200) throw new Error('Ordem inválida');
    ids.forEach((x) => checkUuid(x, 'Categoria inválida'));
    for (let i = 0; i < ids.length; i++) await rest(`wa_categories?id=eq.${ids[i]}`, json('PATCH', 'return=minimal', { position: i }));
    return true;
  }

  const sanitizeFileName = (name) => String(name || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'arquivo';

  function fromBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Grava no bucket público wa-media (caminho <uuid>/<nome-sanitizado>), como o ERP
  async function uploadFile({ partType, base64, mime, fileName }) {
    const allowed = UPLOAD_MIME[partType];
    if (!allowed) throw new Error('Tipo de parte inválido');
    const m = typeof mime === 'string' ? mime.toLowerCase().split(';')[0].trim() : '';
    if (!allowed.includes(m)) throw new Error('Tipo de arquivo não aceito');
    if (typeof base64 !== 'string' || !base64) throw new Error('Arquivo vazio');
    if (base64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4) throw new Error('Arquivo acima de 40 MB');
    const bytes = fromBase64(base64);
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('Arquivo acima de 40 MB');
    return storeBytes(bytes, m, fileName);
  }

  // Grava os bytes no bucket wa-media (o mesmo upload de sempre) e devolve o endereço público
  async function storeBytes(bytes, m, fileName) {
    const { SUPABASE_URL } = cfg();
    const path = `${crypto.randomUUID()}/${sanitizeFileName(fileName)}`;
    const res = await supaFetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': m, 'x-upsert': 'false' },
      body: bytes,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upload falhou (${res.status}): ${text.slice(0, 120)}`);
    }
    return {
      file_url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`,
      file_name: typeof fileName === 'string' && fileName.trim() ? fileName.trim().slice(0, 200) : 'arquivo',
      file_size: bytes.length,
    };
  }

  // ── 2.7.0: Biblioteca de mídias (wa_media_folders + wa_media; migration 20261105090000) ──
  // Os arquivos ficam no mesmo bucket wa-media. sha256 (calculado aqui, dos bytes) evita subir o mesmo
  // arquivo duas vezes. Sem as tabelas: "Atualize o banco para usar este recurso".
  const MEDIA_TABLES = ['wa_media', 'wa_media_folders'];
  const MEDIA_TYPES = ['imagem', 'video', 'audio', 'documento'];
  const MB = 1024 * 1024;
  const MEDIA_LIMITS = { imagem: 5 * MB, audio: 16 * MB, video: 16 * MB, documento: 20 * MB };
  const MEDIA_COLS = 'id,folder_id,type,title,caption,file_url,file_name,file_size,mime,sha256,usage_count,position,created_at';
  const MEDIA_QUOTA_BYTES = 1024 * MB; // 1 GB (só para o aviso de espaço)

  async function mediaRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (tableMissing(err, MEDIA_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }
  async function mediaRestAll(path) {
    try {
      return await restAll(path);
    } catch (err) {
      if (tableMissing(err, MEDIA_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  async function sha256Of(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  const mediaTitleOf = (fileName) => String(fileName || 'arquivo').replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'arquivo';

  async function fetchMediaLibrary() {
    const [folders, media] = await Promise.all([
      mediaRestAll('wa_media_folders?select=id,name,position,created_at&order=position.asc,created_at.asc'),
      mediaRestAll(`wa_media?select=${MEDIA_COLS}&order=created_at.desc,id.asc`),
    ]);
    const used = media.reduce((sum, m) => sum + (Number(m.file_size) || 0), 0);
    return { folders, media, used, quota: MEDIA_QUOTA_BYTES };
  }

  async function createMediaFolder({ name }) {
    const n = cleanText(name, 60, 'Nome da pasta');
    const last = await mediaRest('wa_media_folders?select=position&order=position.desc&limit=1');
    const rows = await mediaRest('wa_media_folders', json('POST', 'return=representation', { name: n, position: last.length ? (Number(last[0].position) || 0) + 1 : 0 }));
    return rows[0];
  }
  async function renameMediaFolder({ id, name }) {
    checkUuid(id, 'Pasta inválida');
    await mediaRest(`wa_media_folders?id=eq.${id}`, json('PATCH', 'return=minimal', { name: cleanText(name, 60, 'Nome da pasta') }));
    return true;
  }
  // Apagar a pasta não apaga as mídias: elas ficam "sem pasta" (on delete set null)
  async function deleteMediaFolder({ id }) {
    checkUuid(id, 'Pasta inválida');
    await mediaRest(`wa_media?folder_id=eq.${id}`, json('PATCH', 'return=minimal', { folder_id: null }));
    await mediaRest(`wa_media_folders?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }
  async function reorderMediaFolders({ ids }) {
    if (!Array.isArray(ids) || ids.length > 200) throw new Error('Lista inválida');
    for (let i = 0; i < ids.length; i++) {
      checkUuid(ids[i], 'Pasta inválida');
      await mediaRest(`wa_media_folders?id=eq.${ids[i]}`, json('PATCH', 'return=minimal', { position: i }));
    }
    return true;
  }

  // Sobe um arquivo para a biblioteca. Mesmo arquivo (sha256) já salvo: não sobe de novo e devolve o que existe.
  // enforceLimits=false: arquivo vindo do editor de mensagens (vale o limite de sempre, 40 MB).
  async function uploadMedia({ type, base64, mime, fileName, title, caption, folderId, enforceLimits = true }) {
    if (!MEDIA_TYPES.includes(type)) throw new Error('Tipo de mídia inválido');
    const m = typeof mime === 'string' ? mime.toLowerCase().split(';')[0].trim() : '';
    if (!UPLOAD_MIME[type].includes(m)) throw new Error('Tipo de arquivo não aceito');
    if (typeof base64 !== 'string' || !base64) throw new Error('Arquivo vazio');
    const limit = enforceLimits === false ? MAX_FILE_BYTES : MEDIA_LIMITS[type];
    if (base64.length > Math.ceil(limit / 3) * 4 + 4) throw new Error(`Arquivo acima de ${Math.round(limit / MB)} MB`);
    const bytes = fromBase64(base64);
    if (!bytes.length) throw new Error('Arquivo vazio');
    if (bytes.length > limit) throw new Error(`Arquivo acima de ${Math.round(limit / MB)} MB`);
    const folder = folderId == null || folderId === '' ? null : checkUuid(folderId, 'Pasta inválida');
    const sha = await sha256Of(bytes);
    const same = await mediaRest(`wa_media?select=${MEDIA_COLS}&sha256=eq.${sha}`);
    if (same.length) return { duplicate: true, media: same[0] };
    const file = await storeBytes(bytes, m, fileName);
    const last = await mediaRest('wa_media?select=position&order=position.desc&limit=1');
    const row = {
      folder_id: folder, type, title: title ? cleanText(title, 120, 'Título') : mediaTitleOf(file.file_name), caption: clip(caption, 4096),
      file_url: file.file_url, file_name: file.file_name, file_size: file.file_size, mime: m, sha256: sha, usage_count: 0,
      position: last.length ? (Number(last[0].position) || 0) + 1 : 0,
    };
    try {
      const rows = await mediaRest('wa_media', json('POST', 'return=representation', row));
      return { duplicate: false, media: rows[0] };
    } catch (err) {
      // Outra aba subiu o mesmo arquivo no mesmo instante (índice único do sha256)
      if (/^Supabase 409:/.test(err.message)) {
        const again = await mediaRest(`wa_media?select=${MEDIA_COLS}&sha256=eq.${sha}`);
        if (again.length) return { duplicate: true, media: again[0] };
      }
      throw err;
    }
  }

  async function updateMedia({ id, title, caption, folderId }) {
    checkUuid(id, 'Mídia inválida');
    const patch = {};
    if (title !== undefined) patch.title = cleanText(title, 120, 'Título');
    if (caption !== undefined) patch.caption = typeof caption === 'string' && caption.trim() ? caption.slice(0, 4096) : null;
    if (folderId !== undefined) patch.folder_id = folderId == null || folderId === '' ? null : checkUuid(folderId, 'Pasta inválida');
    if (!Object.keys(patch).length) throw new Error('Nada para mudar');
    const rows = await mediaRest(`wa_media?id=eq.${id}`, json('PATCH', 'return=representation', patch));
    if (!rows.length) throw new Error('Mídia não encontrada');
    return rows[0];
  }

  async function incrementMediaUsage({ id }) {
    checkUuid(id, 'Mídia inválida');
    const rows = await mediaRest(`wa_media?select=usage_count&id=eq.${id}`);
    if (!rows.length) return 0;
    const n = (Number(rows[0].usage_count) || 0) + 1;
    await mediaRest(`wa_media?id=eq.${id}`, json('PATCH', 'return=minimal', { usage_count: n }));
    return n;
  }

  // Onde o arquivo está em uso: mensagens rápidas (item ou parte), disparos (mensagem exclusiva) e
  // automações que enviam essas mensagens rápidas
  async function mediaUsage({ id }) {
    checkUuid(id, 'Mídia inválida');
    const rows = await mediaRest(`wa_media?select=id,file_url&id=eq.${id}`);
    if (!rows.length) throw new Error('Mídia não encontrada');
    const url = rows[0].file_url;
    const enc = encodeURIComponent(url);
    const itemIds = new Set();
    (await rest(`wa_items?select=id&file_url=eq.${enc}`)).forEach((r) => itemIds.add(r.id));
    try { (await rest(`wa_item_parts?select=item_id&file_url=eq.${enc}`)).forEach((r) => itemIds.add(r.item_id)); } catch (err) { if (!missingTable(err, 'wa_item_parts')) throw err; }
    const items = itemIds.size ? await rest(`wa_items?select=id,title&id=in.${inList([...itemIds])}`) : [];
    let campaigns = [];
    if ((await campaignsTables()) && (await campaignsV2())) {
      campaigns = await rest(`wa_campaigns?select=id,name&parts=cs.${encodeURIComponent(JSON.stringify([{ file_url: url }]))}`);
    }
    let automations = [];
    if (itemIds.size && (await automationTables())) {
      const all = await autoRestAll(`wa_automations?select=id,name,actions&order=id.asc`);
      automations = all.filter((a) => [...itemIds].some((iid) => JSON.stringify(a.actions || []).includes(iid))).map((a) => ({ id: a.id, name: a.name }));
    }
    return {
      inUse: items.length + campaigns.length + automations.length > 0,
      items: items.map((x) => x.title), campaigns: campaigns.map((x) => x.name), automations: automations.map((x) => x.name),
    };
  }

  // Apagar: só se nada estiver usando. O arquivo sai do bucket se nenhuma outra mídia apontar para ele.
  async function deleteMedia({ id }) {
    const usage = await mediaUsage({ id });
    if (usage.inUse) return { deleted: false, usage };
    const rows = await mediaRest(`wa_media?select=id,file_url&id=eq.${id}`);
    if (!rows.length) return { deleted: true };
    const url = rows[0].file_url;
    await mediaRest(`wa_media?id=eq.${id}`, { method: 'DELETE' });
    const others = await mediaRest(`wa_media?select=id&file_url=eq.${encodeURIComponent(url)}&limit=1`);
    if (!others.length && isAllowedFileUrl(url)) {
      const { SUPABASE_URL } = cfg();
      const path = url.slice(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`.length);
      try { await supaFetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE' }); } catch { /* o registro já saiu; o arquivo fica */ }
    }
    return { deleted: true };
  }

  // Importa as mídias que já estão nas mensagens rápidas (sem subir de novo: mesmo file_url; sha256 vazio).
  // Não muda nada nas mensagens.
  const MIME_OF_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', pdf: 'application/pdf' };
  async function importMediaFromItems() {
    const have = new Set((await mediaRestAll('wa_media?select=file_url&order=id.asc')).map((r) => r.file_url));
    const items = await restAll('wa_items?select=id,title,type,file_url,file_name,file_size&order=id.asc');
    const titleOf = new Map(items.map((i) => [i.id, i.title]));
    const found = [];
    items.forEach((i) => { if (MEDIA_TYPES.includes(i.type) && i.file_url) found.push({ type: i.type, file_url: i.file_url, file_name: i.file_name, file_size: i.file_size, title: i.title, caption: null }); });
    try {
      const parts = await restAll('wa_item_parts?select=id,item_id,type,body,file_url,file_name,file_size,position&file_url=not.is.null&order=id.asc');
      parts.forEach((p) => { if (MEDIA_TYPES.includes(p.type) && p.file_url) found.push({ type: p.type, file_url: p.file_url, file_name: p.file_name, file_size: p.file_size, title: titleOf.get(p.item_id) || p.file_name, caption: p.type === 'audio' ? null : p.body || null }); });
    } catch (err) { if (!missingTable(err, 'wa_item_parts')) throw err; }
    const rows = [];
    const seen = new Set(have);
    found.forEach((f) => {
      if (!isAllowedFileUrl(f.file_url) || seen.has(f.file_url)) return;
      seen.add(f.file_url);
      const ext = String(f.file_name || f.file_url).split('.').pop().toLowerCase();
      rows.push({
        folder_id: null, type: f.type, title: mediaTitleOf(f.title || f.file_name), caption: f.caption ? String(f.caption).slice(0, 4096) : null,
        file_url: f.file_url, file_name: f.file_name ? String(f.file_name).slice(0, 200) : null, file_size: Number.isFinite(Number(f.file_size)) ? Number(f.file_size) : null,
        mime: MIME_OF_EXT[ext] || null, sha256: null, usage_count: 0, position: 0,
      });
    });
    for (let i = 0; i < rows.length; i += 200) await mediaRest('wa_media', json('POST', 'return=minimal', rows.slice(i, i + 200)));
    return { added: rows.length, already: found.length - rows.length };
  }

  // ── Agendamentos (1.9.0): criados por um clique; enviados pelo executor do painel na hora marcada ──

  const SCHED_CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
  const SCHED_COLUMNS = 'id,chat_id,chat_name,item_id,body,send_at,status,error_code,sent_at,created_at';
  const SCHED_FINAL = ['enviada', 'falhou', 'cancelada', 'expirada'];
  const SCHED_MISSING = 'Atualize o banco para usar este recurso';

  async function schedRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (missingTable(err, 'wa_schedules')) throw new Error(SCHED_MISSING);
      throw err;
    }
  }

  // Pendentes (e "enviando") + últimos 3 dias; sem a tabela: { available: false }
  async function fetchSchedules() {
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    try {
      const [pending, recent] = await Promise.all([
        schedRest(`wa_schedules?select=${SCHED_COLUMNS}&status=in.(pendente,enviando)&order=send_at.asc&limit=200`),
        schedRest(`wa_schedules?select=${SCHED_COLUMNS}&status=in.(${SCHED_FINAL.join(',')})&send_at=gte.${encodeURIComponent(since)}&order=send_at.desc&limit=100`),
      ]);
      return { available: true, pending, recent };
    } catch (err) {
      if (err.message === SCHED_MISSING) return { available: false, pending: [], recent: [] };
      throw err;
    }
  }

  async function createSchedule({ chat_id, chat_name, item_id, body, send_at }) {
    if (typeof chat_id !== 'string' || !SCHED_CHAT_RE.test(chat_id)) throw new Error('Conversa inválida (só conversas individuais)');
    const name = typeof chat_name === 'string' && chat_name.trim() ? chat_name.trim().replace(/\s+/g, ' ').slice(0, 100) : null;
    const hasItem = item_id !== undefined && item_id !== null;
    if (hasItem) checkUuid(item_id, 'Mensagem salva inválida');
    let text = null;
    if (!hasItem) {
      if (typeof body !== 'string' || !body.trim() || body.length > TEXT_MAX) throw new Error(`Mensagem: 1 a ${TEXT_MAX} caracteres`);
      text = body;
    }
    const when = Date.parse(send_at);
    if (typeof send_at !== 'string' || !Number.isFinite(when)) throw new Error('Data e hora inválidas');
    if (when < Date.now() - 60 * 1000) throw new Error('Escolha uma data e hora no futuro');
    if (when > Date.now() + 366 * 24 * 3600 * 1000) throw new Error('No máximo 1 ano para frente');
    const rows = await schedRest('wa_schedules', json('POST', 'return=representation', {
      chat_id, chat_name: name, item_id: hasItem ? item_id : null, body: text, send_at: new Date(when).toISOString(), status: 'pendente',
    }));
    return { id: rows[0].id };
  }

  // Só cancela se ainda estiver pendente
  async function cancelSchedule({ id }) {
    checkUuid(id, 'Agendamento inválido');
    const rows = await schedRest(`wa_schedules?id=eq.${id}&status=eq.pendente`, json('PATCH', 'return=representation', { status: 'cancelada' }));
    return { cancelled: rows.length > 0 };
  }

  // Pendentes com horário vencido (mais antigos primeiro)
  async function dueSchedules() {
    const now = new Date().toISOString();
    return schedRest(`wa_schedules?select=${SCHED_COLUMNS}&status=eq.pendente&send_at=lte.${encodeURIComponent(now)}&order=send_at.asc&limit=20`);
  }

  // Reserva: só uma aba/PC consegue passar de 'pendente' para 'enviando' (o filtro status=eq.pendente garante)
  async function claimSchedule({ id }) {
    checkUuid(id, 'Agendamento inválido');
    const rows = await schedRest(`wa_schedules?id=eq.${id}&status=eq.pendente`, json('PATCH', 'return=representation', { status: 'enviando' }));
    return rows.length ? rows[0] : null;
  }

  // Resultado final. 'expirada' só sai de 'pendente'; os outros, de 'enviando'.
  async function finishSchedule({ id, status, error_code }) {
    checkUuid(id, 'Agendamento inválido');
    if (!SCHED_FINAL.includes(status)) throw new Error('Status inválido');
    if (error_code != null && (typeof error_code !== 'string' || !/^[a-z_]{1,40}$/.test(error_code))) throw new Error('Código inválido');
    const from = status === 'expirada' ? 'pendente' : 'enviando';
    const patch = { status, error_code: error_code || null };
    if (status === 'enviada') patch.sent_at = new Date().toISOString();
    const rows = await schedRest(`wa_schedules?id=eq.${id}&status=eq.${from}`, json('PATCH', 'return=representation', patch));
    return { updated: rows.length > 0 };
  }

  // ── Motor de envios (2.0.0-D1): configurações, trava, histórico e réguas (follows) ──
  // Tudo validado aqui. Sem as tabelas (migration 20261103130000): { available: false } ou
  // "Atualize o banco para usar este recurso".

  const ENGINE_MISSING = 'Atualize o banco para usar este recurso';
  const ENGINE_TABLES = ['wa_settings', 'wa_flows', 'wa_flow_variants', 'wa_send_log'];
  const CAMPAIGN_TABLES = ['wa_campaigns', 'wa_campaign_targets'];
  const SETTINGS_COLUMNS = 'id,paused_all,max_per_hour,max_per_day,min_interval_s,max_interval_s,business_start,business_end,business_days,runner_id,lease_until,updated_at';
  const RUNNER_RE = /^[a-z0-9]{4,40}$/;
  const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const SEND_SOURCES = ['follow', 'disparo', 'agendado'];
  // 2.10.0: 'manual' e 'rapida' também vão para wa_send_log (painel); limites, intervalo, histórico e
  // "pular quem recebeu" continuam só com os envios automáticos
  const AUTO_SOURCES = 'source=in.(follow,disparo,agendado)';
  const ORIGIN_OF = { follow: 'automacao', disparo: 'disparo', agendado: 'agendada', manual: 'manual', rapida: 'rapida' };
  const SEND_STATUS = ['enviando', 'enviado', 'falhou', 'pulado'];
  const REASON_MAX = 60;

  // Tabela que não existe: o PostgREST responde 404 (PGRST205) ou 400/42P01
  const tableMissing = (err, tables) => /^Supabase (400|404):/.test(err.message)
    && (tables.some((t) => new RegExp(`\\b${t}\\b`).test(err.message)) || /^Supabase 404:/.test(err.message));

  async function engineRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (tableMissing(err, ENGINE_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  // Colunas/tabelas novas: "sim" fica guardado; "não" é testado de novo depois de 5 min
  const probeCache = new Map();
  async function probe(key, fn, retryMs = 5 * 60 * 1000) {
    const hit = probeCache.get(key);
    if (hit && (hit.value || Date.now() - hit.at < retryMs)) return hit.value;
    let value = false;
    try { value = await fn(); } catch { value = false; }
    probeCache.set(key, { value, at: Date.now() });
    return value;
  }
  const chatIdColumn = () => probe('wa_contacts.chat_id', () => hasColumn('wa_contacts', 'chat_id'));
  const campaignsTables = () => probe('campaigns', async () => {
    try {
      await rest('wa_campaigns?select=id&limit=1');
      await rest('wa_campaign_targets?select=id&limit=1');
      return true;
    } catch (err) {
      if (tableMissing(err, CAMPAIGN_TABLES)) return false;
      throw err;
    }
  });

  // Grava o id da conversa do contato (quando a extensão sabe e a coluna existe)
  async function rememberChatId(contact, chatId) {
    if (!contact || !chatId || contact.chat_id === chatId) return;
    if (!(await chatIdColumn())) return;
    await rest(`wa_contacts?id=eq.${contact.id}`, json('PATCH', 'return=minimal', { chat_id: chatId }));
  }

  // 2.14.3: horário geral por dia da semana (system_config, chave wa_business_week; sem migration)
  const WEEK_KEY = 'wa_business_week';
  async function businessWeek() {
    try {
      const rows = await rest(`system_config?select=key,value&key=eq.${WEEK_KEY}`);
      const v = rows.length ? JSON.parse(rows[0].value) : null;
      return Array.isArray(v) && v.length === 7 ? checkWeek(v, 'Horário geral') : null;
    } catch { return null; }
  }
  const withWeek = async (row) => { if (!row) return row; const w = await businessWeek(); return w ? { ...row, business_week: w } : row; };
  async function getEngineSettings() {
    let rows;
    try {
      rows = await rest(`wa_settings?select=${SETTINGS_COLUMNS}&id=eq.1`);
    } catch (err) {
      if (tableMissing(err, ['wa_settings'])) return { available: false };
      throw err;
    }
    if (!rows.length) {
      await rest('wa_settings?on_conflict=id', json('POST', 'resolution=ignore-duplicates,return=minimal', { id: 1 }));
      rows = await rest(`wa_settings?select=${SETTINGS_COLUMNS}&id=eq.1`);
    }
    if (!rows.length) return { available: false };
    const campaigns = await campaignsTables();
    return {
      available: true, settings: await withWeek(rows[0]), campaigns, campaignsV2: campaigns && (await campaignsV2()), campaignsV214: campaigns && (await campaignsV214()), automations: await automationTables(),
      salesOrigin: await salesOrigin(),
      automationsV25: await automationsV25(),
      sequences: await automationsV212(), // 2.12.0
    };
  }

  const hmOf = (v) => String(v || '').slice(0, 5);

  async function updateEngineSettings(patch) {
    const p = patch || {};
    const out = {};
    if (p.paused_all !== undefined) {
      if (typeof p.paused_all !== 'boolean') throw new Error('Valor inválido');
      out.paused_all = p.paused_all;
    }
    if (p.max_per_hour !== undefined) out.max_per_hour = intIn(p.max_per_hour, 1, 200, 'Envios por hora');
    if (p.max_per_day !== undefined) out.max_per_day = intIn(p.max_per_day, 1, 2000, 'Envios por dia');
    if (p.min_interval_s !== undefined) out.min_interval_s = intIn(p.min_interval_s, 10, 3600, 'Intervalo mínimo (s)');
    if (p.max_interval_s !== undefined) out.max_interval_s = intIn(p.max_interval_s, 10, 3600, 'Intervalo máximo (s)');
    if (p.business_start !== undefined && p.business_week === undefined) {
      if (!HM_RE.test(p.business_start)) throw new Error('Início do expediente inválido');
      out.business_start = p.business_start;
    }
    if (p.business_end !== undefined && p.business_week === undefined) {
      if (!HM_RE.test(p.business_end)) throw new Error('Fim do expediente inválido');
      out.business_end = p.business_end;
    }
    let week = null;
    if (p.business_week !== undefined) {
      week = checkWeek(p.business_week, 'Horário geral');
      // resumo nos campos antigos (quem lê só eles continua vendo algo certo): dias abertos, primeiro início, último fim
      const flat = week.flat();
      out.business_days = week.map((ws, d) => (ws.length ? d : null)).filter((d) => d != null);
      out.business_start = flat.map((x) => x.start).sort()[0];
      out.business_end = flat.map((x) => x.end).sort().pop();
    }
    if (p.business_days !== undefined && !week) {
      const days = Array.isArray(p.business_days) ? [...new Set(p.business_days)] : null;
      if (!days || !days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Escolha pelo menos um dia');
      out.business_days = days.sort((a, b) => a - b);
    }
    if (!Object.keys(out).length) throw new Error('Nada para mudar');
    const current = (await getEngineSettings());
    if (!current.available) throw new Error(ENGINE_MISSING);
    const merged = { ...current.settings, ...out };
    if (merged.min_interval_s > merged.max_interval_s) throw new Error('O intervalo mínimo não pode passar do máximo');
    if (hmOf(merged.business_start) >= hmOf(merged.business_end)) throw new Error('O expediente precisa terminar depois de começar');
    const rows = await engineRest(`wa_settings?id=eq.1&select=${SETTINGS_COLUMNS}`,
      json('PATCH', 'return=representation', { ...out, updated_at: new Date().toISOString() }));
    if (week) await rest('system_config?on_conflict=key', json('POST', 'resolution=merge-duplicates,return=minimal', { key: WEEK_KEY, value: JSON.stringify(week), updated_at: new Date().toISOString() }));
    return { settings: await withWeek(rows[0]) };
  }

  // Trava: só assume se ninguém tem, se venceu, ou se já é nossa
  async function claimLease({ runnerId, ttlS }) {
    if (typeof runnerId !== 'string' || !RUNNER_RE.test(runnerId)) throw new Error('Identificador inválido');
    const ttl = intIn(ttlS, 30, 300, 'Tempo da trava');
    const now = new Date();
    const nowIso = now.toISOString();
    const until = new Date(now.getTime() + ttl * 1000).toISOString();
    const cond = encodeURIComponent(`(lease_until.is.null,lease_until.lt."${nowIso}",runner_id.eq."${runnerId}")`);
    // 2.4.1: a renovação devolve as configurações (o motor não precisa lê-las de novo) e, sem a
    // trava, não faz a segunda leitura
    const rows = await engineRest(`wa_settings?id=eq.1&or=${cond}&select=${SETTINGS_COLUMNS}`,
      json('PATCH', 'return=representation', { runner_id: runnerId, lease_until: until }));
    if (rows.length && rows[0].runner_id === runnerId) return { held: true, lease_until: rows[0].lease_until, settings: await withWeek(rows[0]) };
    return { held: false, lease_until: null };
  }

  async function countRows2(path) {
    try {
      return await countRows(path);
    } catch (err) {
      if (/^Supabase 40[04]/.test(err.message)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  // Envios que contam nos limites: tudo menos 'pulado'
  async function sendCounts({ hourSince, daySince }) {
    const h = Date.parse(hourSince);
    const d = Date.parse(daySince);
    if (!Number.isFinite(h) || !Number.isFinite(d)) throw new Error('Data inválida');
    const base = `wa_send_log?${AUTO_SOURCES}&status=neq.pulado&created_at=gte.`;
    const [hour, day] = await Promise.all([
      countRows2(base + encodeURIComponent(new Date(h).toISOString())),
      countRows2(base + encodeURIComponent(new Date(d).toISOString())),
    ]);
    return { hour, day };
  }

  // Momento do último envio (para respeitar o intervalo depois de recarregar a página)
  async function lastSendAt() {
    const rows = await engineRest(`wa_send_log?select=created_at&${AUTO_SOURCES}&status=neq.pulado&order=created_at.desc&limit=1`);
    return { at: rows.length ? rows[0].created_at : null };
  }

  const optUuid = (v, what) => {
    if (v === undefined || v === null) return null;
    return checkUuid(v, what);
  };
  const cleanReason = (v) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, REASON_MAX) : null);

  async function logSend({ source, source_id, contact_id, chat_id, item_id, status, reason, variant }) {
    if (!SEND_SOURCES.includes(source)) throw new Error('Origem inválida');
    if (!SEND_STATUS.includes(status)) throw new Error('Status inválido');
    const chat = chat_id == null ? null : (typeof chat_id === 'string' && SCHED_CHAT_RE.test(chat_id) ? chat_id : null);
    const item = optUuid(item_id, 'Mensagem inválida');
    const panel = await panelCols(); // 2.10.0: origem e etapa do follow-up (só com a migration)
    const rows = await engineRest('wa_send_log', json('POST', 'return=representation', {
      source, source_id: optUuid(source_id, 'Origem inválida'), contact_id: optUuid(contact_id, 'Contato inválido'),
      chat_id: chat, item_id: item, status, reason: cleanReason(reason),
      ...(panel ? { origin: ORIGIN_OF[source], follow_step: await followStepOf(item) } : {}),
      ...(source === 'disparo' && variant != null && (await sendVariantCol()) ? { variant: intIn(Number(variant), 0, 5, 'Variação') } : {}), // 2.14.0
    }));
    return { id: rows[0].id };
  }

  // ── 2.10.0: registros do painel de resultados (wa_leads, wa_replies, origin/follow_step em wa_send_log) ──
  const PANEL_MISSING = 'Atualize o banco para usar este recurso';
  const panelCols = () => probe('wa_send_log.origin', () => hasColumn('wa_send_log', 'origin'));
  const panelTables = () => probe('wa_replies', async () => {
    try { await rest('wa_replies?select=id&limit=1'); await rest('wa_leads?select=id&limit=1'); return true; } catch (err) {
      if (tableMissing(err, ['wa_replies', 'wa_leads'])) return false;
      throw err;
    }
  });
  async function panelReady() {
    if (!(await panelCols()) || !(await panelTables())) throw new Error(PANEL_MISSING);
  }
  // etapa do follow-up de cada mensagem rápida (relida a cada 5 min)
  const followSteps = { map: new Map(), at: 0 };
  const stepOf = (v) => (Number.isInteger(v) && v >= 1 && v <= 20 ? v : null);
  async function followStepOf(itemId) {
    if (!itemId) return null;
    if (Date.now() - followSteps.at > 5 * 60 * 1000) {
      try {
        const rows = await rest('wa_items?select=id,follow_step');
        followSteps.map = new Map(rows.map((r) => [r.id, stepOf(r.follow_step)]));
      } catch { /* sem a coluna: sem etapa */ }
      followSteps.at = Date.now();
    }
    return followSteps.map.get(itemId) ?? null;
  }
  const PANEL_CHAT_RE = /^[0-9]+@(c\.us|lid)$/;
  const isoOfSec = (t) => { const n = Number(t); if (!Number.isFinite(n) || n <= 0) throw new Error('Data inválida'); return new Date(Math.round(n * 1000)).toISOString(); };
  const panelPhone = (v) => (typeof v === 'string' && /^\d{8,15}$/.test(v) ? v : null);
  const short = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
  const eqIso = (ms) => encodeURIComponent(new Date(ms).toISOString());

  // Leads novos (1ª mensagem da conversa); a mesma conversa de novo não muda nada
  async function saveLeads({ items }) {
    if (!Array.isArray(items) || items.length > 500) throw new Error('Lista inválida');
    await panelReady();
    const rows = [];
    const seen = new Set();
    for (const it of items) {
      if (!it || !PANEL_CHAT_RE.test(it.chatId || '') || seen.has(it.chatId)) continue;
      seen.add(it.chatId);
      const adId = short(it.ad && it.ad.id, 100);
      const adTitle = short(it.ad && it.ad.title, 200);
      rows.push({ chat_id: it.chatId, phone: panelPhone(it.phone), first_message_at: isoOfSec(it.t), origin: it.ad ? 'anuncio' : 'organico', ad_id: adId, ad_title: adTitle });
    }
    if (rows.length) await rest('wa_leads?on_conflict=chat_id', json('POST', 'resolution=ignore-duplicates,return=minimal', rows));
    return { saved: rows.length };
  }

  // Envio de mensagem rápida pelo painel (seta / prévia), já enviado. Sem a migration: não registra (como antes).
  async function logQuickSend({ chat_id, item_id }) {
    if (!(await panelCols())) return { id: null };
    if (!PANEL_CHAT_RE.test(chat_id || '')) throw new Error('Conversa inválida');
    const item = optUuid(item_id, 'Mensagem inválida');
    const rows = await engineRest('wa_send_log', json('POST', 'return=representation', {
      source: 'rapida', origin: 'rapida', chat_id, item_id: item, status: 'enviado', follow_step: await followStepOf(item),
    }));
    return { id: rows[0].id };
  }

  // Mensagens que você digitou no WhatsApp (uma por "vez de falar" da loja). Pula se já houver envio
  // registrado na conversa 3 min antes/depois (mensagem rápida, agendada etc. de outra aba ou PC).
  const NEAR_MS = 3 * 60 * 1000;
  async function logManualSends({ items }) {
    if (!Array.isArray(items) || items.length > 200) throw new Error('Lista inválida');
    await panelReady();
    let saved = 0;
    for (const it of items) {
      if (!it || !PANEL_CHAT_RE.test(it.chatId || '')) continue;
      const at = Date.parse(isoOfSec(it.t));
      const near = await rest(`wa_send_log?select=id&chat_id=eq.${encodeURIComponent(it.chatId)}&status=eq.enviado&created_at=gte.${eqIso(at - NEAR_MS)}&created_at=lte.${eqIso(at + NEAR_MS)}&limit=1`);
      if (near.length) continue;
      await rest('wa_send_log', json('POST', 'return=minimal', { source: 'manual', origin: 'manual', chat_id: it.chatId, status: 'enviado', created_at: new Date(at).toISOString() }));
      saved++;
    }
    return { saved };
  }

  // 1ª resposta do cliente depois do último envio nosso (até 7 dias antes). phone: também acha o envio
  // gravado com o número (@c.us) quando a mensagem chega pela conversa @lid. Já respondido: nada muda.
  const REPLY_WINDOW_MS = 7 * 24 * 3600 * 1000;
  async function recordReplies({ items }) {
    if (!Array.isArray(items) || items.length > 200) throw new Error('Lista inválida');
    await panelReady();
    let saved = 0;
    for (const it of items) {
      if (!it || !PANEL_CHAT_RE.test(it.chatId || '')) continue;
      const at = Date.parse(isoOfSec(it.t));
      const phone = panelPhone(it.phone);
      const ids = [...new Set([it.chatId, phone ? `${phone}@c.us` : null].filter(Boolean))];
      const inList = encodeURIComponent(`(${ids.map((x) => `"${x}"`).join(',')})`);
      const last = await rest(`wa_send_log?select=id,created_at&chat_id=in.${inList}&status=eq.enviado&created_at=lt.${eqIso(at)}&created_at=gte.${eqIso(at - REPLY_WINDOW_MS)}&order=created_at.desc&limit=1`);
      if (!last.length) continue;
      const minutes = Math.max(0, Math.round((at - Date.parse(last[0].created_at)) / 60000));
      await rest('wa_replies?on_conflict=send_log_id', json('POST', 'resolution=ignore-duplicates,return=minimal', { chat_id: it.chatId, replied_at: new Date(at).toISOString(), send_log_id: last[0].id, minutes }));
      saved++;
    }
    return { saved };
  }

  // 2.12.2: última mensagem da conversa (wa_leads, só conversas que já são lead). Só avança (grava quando é
  // mais nova). Sem a migration 20261107120000: não grava nada (o resto segue). 2.12.8: sem o sinal de compra.
  const trackingCols = () => probe('wa_leads.last_message_at', () => hasColumn('wa_leads', 'last_message_at'));
  async function touchLeads({ items }) {
    if (!Array.isArray(items) || items.length > 200) throw new Error('Lista inválida');
    if (!(await trackingCols())) return { saved: 0, missing: true };
    let saved = 0;
    const seen = new Set();
    for (const it of items) {
      if (!it || !PANEL_CHAT_RE.test(it.chatId || '') || seen.has(it.chatId)) continue;
      seen.add(it.chatId);
      const chat = encodeURIComponent(it.chatId);
      const last = isoOfSec(it.t);
      await rest(`wa_leads?chat_id=eq.${chat}&or=(last_message_at.is.null,last_message_at.lt.${encodeURIComponent(last)})`, json('PATCH', 'return=minimal', { last_message_at: last }));
      saved++;
    }
    return { saved };
  }

  // 2.12.8: atividade de TODAS as conversas individuais (wa_chat_activity + wa_chat_activity_days). Um upsert por
  // tabela (on_conflict): os gatilhos do banco fazem a linha só avançar (migration 20261109120000). Sem a
  // migration: { missing: true } e nada é gravado (o painel para de tentar até recarregar). Nunca o texto.
  const activityTables = () => probe('wa_chat_activity', async () => {
    try { await rest('wa_chat_activity?select=chat_id&limit=1'); await rest('wa_chat_activity_days?select=chat_id&limit=1'); return true; } catch (err) {
      if (tableMissing(err, ['wa_chat_activity', 'wa_chat_activity_days'])) return false;
      throw err;
    }
  });
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const optIsoOfSec = (t) => (t == null || t === '' ? null : isoOfSec(t));
  async function saveChatActivity({ items }) {
    if (!Array.isArray(items) || items.length > 1000) throw new Error('Lista inválida');
    if (!(await activityTables())) return { saved: 0, missing: true };
    const rows = [];
    const days = [];
    const seen = new Set();
    const nowIso = new Date().toISOString();
    for (const it of items) {
      if (!it || !PANEL_CHAT_RE.test(it.chatId || '') || seen.has(it.chatId)) continue;
      let lastAt;
      try { lastAt = optIsoOfSec(it.lastAt); } catch { continue; }
      seen.add(it.chatId);
      rows.push({
        chat_id: it.chatId, phone: panelPhone(it.phone), name: short(it.name, 100), first_seen_at: nowIso,
        first_message_at: (() => { try { return optIsoOfSec(it.firstMessageAt); } catch { return null; } })(),
        last_message_at: lastAt, last_from: it.lastFrom === 'cliente' || it.lastFrom === 'loja' ? it.lastFrom : null,
        last_customer_at: (() => { try { return optIsoOfSec(it.lastCustomerAt); } catch { return null; } })(),
        is_new_lead: typeof it.isNewLead === 'boolean' ? it.isNewLead : null,
      });
      (Array.isArray(it.days) ? it.days : []).slice(0, 10).forEach((d) => {
        if (d && DAY_RE.test(d.day || '') && (d.customer || d.store)) days.push({ chat_id: it.chatId, day: d.day, from_customer: !!d.customer, from_store: !!d.store });
      });
    }
    for (let i = 0; i < rows.length; i += 500) {
      await rest('wa_chat_activity?on_conflict=chat_id', json('POST', 'resolution=merge-duplicates,return=minimal', rows.slice(i, i + 500)));
    }
    for (let i = 0; i < days.length; i += 1000) {
      await rest('wa_chat_activity_days?on_conflict=chat_id,day', json('POST', 'resolution=merge-duplicates,return=minimal', days.slice(i, i + 1000)));
    }
    return { saved: rows.length, days: days.length };
  }

  async function finishSendLog({ id, status, reason }) {
    checkUuid(id, 'Registro inválido');
    if (!SEND_STATUS.includes(status) || status === 'enviando') throw new Error('Status inválido');
    await engineRest(`wa_send_log?id=eq.${id}&status=eq.enviando`, json('PATCH', 'return=minimal', { status, reason: cleanReason(reason) }));
    return true;
  }

  const phoneOfChat = (chatId) => {
    const m = /^(\d{8,15})@c\.us$/.exec(chatId || '');
    return m ? m[1] : null;
  };

  // Contatos de um lote de conversas: { chatId: { id, name } } (por chat_id ou telefone)
  async function contactsByChats(chatIds) {
    const out = {};
    const ids = [...new Set(chatIds.filter((c) => typeof c === 'string' && SCHED_CHAT_RE.test(c)))];
    if (!ids.length) return out;
    const hasCol = await chatIdColumn();
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      if (hasCol) {
        const rows = await rest(`wa_contacts?select=id,name,chat_id&chat_id=in.${inList(part)}`);
        rows.forEach((r) => { out[r.chat_id] = { id: r.id, name: r.name }; });
      }
      const phones = part.filter((c) => !out[c]).map(phoneOfChat).filter(Boolean);
      if (phones.length) {
        const rows = await rest(`wa_contacts?select=id,name,phone&phone=in.${inList(phones)}`);
        rows.forEach((r) => { out[`${r.phone}@c.us`] = out[`${r.phone}@c.us`] || { id: r.id, name: r.name }; });
      }
    }
    return out;
  }

  // Contato da conversa e se ele tem a etiqueta (ex.: "Não enviar")
  async function chatContact({ chatId, labelId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) throw new Error('Conversa inválida');
    const found = (await contactsByChats([chatId]))[chatId];
    if (!found) return { contactId: null, hasLabel: false };
    if (!labelId) return { contactId: found.id, hasLabel: false };
    checkUuid(labelId);
    const rows = await rest(`wa_contact_labels?select=label_id&contact_id=eq.${found.id}&label_id=eq.${labelId}`);
    return { contactId: found.id, hasLabel: rows.length > 0 };
  }

  // Últimos envios automáticos com o nome do contato (só para a tela)
  async function fetchSendLog({ limit = 50 } = {}) {
    const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
    const rows = await engineRest(`wa_send_log?select=id,source,contact_id,chat_id,status,reason,created_at&${AUTO_SOURCES}&order=created_at.desc&limit=${lim}`);
    const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
    const names = {};
    const phones = {}; // 2.14.4: para abrir a conversa pelo telefone
    for (let i = 0; i < contactIds.length; i += 100) {
      const got = await rest(`wa_contacts?select=id,name,phone&id=in.${inList(contactIds.slice(i, i + 100))}`);
      got.forEach((c) => { names[c.id] = c.name || c.phone || null; phones[c.id] = c.phone || null; });
    }
    const byChat = await contactsByChats(rows.filter((r) => !r.contact_id && r.chat_id).map((r) => r.chat_id));
    return rows.map((r) => ({
      id: r.id, source: r.source, status: r.status, reason: r.reason, created_at: r.created_at,
      name: (r.contact_id && names[r.contact_id]) || (r.chat_id && byChat[r.chat_id] && byChat[r.chat_id].name) || null,
      chat_id: r.chat_id || null, phone: (r.contact_id && phones[r.contact_id]) || null,
    }));
  }

  // Etiqueta CRM "Não enviar" (cinza): cria se não existir
  const NO_SEND = 'Não enviar';
  const noSendKey = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  async function ensureNoSendLabel() {
    const find = async () => (await rest('wa_labels?select=id,name')).find((l) => noSendKey(l.name) === noSendKey(NO_SEND));
    const found = await find();
    if (found) return { id: found.id, created: false };
    try {
      const l = await createLabel({ name: NO_SEND, color: '#6b7280' });
      return { id: l.id, created: true };
    } catch (err) {
      const again = await find(); // outra aba criou ao mesmo tempo
      if (again) return { id: again.id, created: false };
      throw err;
    }
  }

  // ── Réguas (wa_flows + wa_flow_variants) ──

  const FLOW_COLUMNS = 'id,name,active,label_id,wait_minutes,item_id,next_label_id,reply_label_id,ignore_older_days,position,created_at';
  const VARIANT_COLUMNS = 'id,flow_id,position,condition,label_id,ad_keyword,item_id';

  async function fetchFlows() {
    const [flows, variants] = await Promise.all([
      engineRest(`wa_flows?select=${FLOW_COLUMNS}&order=position.asc,created_at.asc`),
      engineRest(`wa_flow_variants?select=${VARIANT_COLUMNS}&order=flow_id.asc,position.asc,id.asc&limit=1000`),
    ]);
    return flows.map((f) => ({ ...f, variants: variants.filter((v) => v.flow_id === f.id).sort((a, b) => a.position - b.position) }));
  }

  function checkVariant(v, i) {
    const n = i + 1;
    if (!v || typeof v !== 'object' || !['etiqueta', 'anuncio'].includes(v.condition)) throw new Error(`Variante ${n}: condição inválida`);
    const item_id = checkUuid(v.item_id, `Variante ${n}: escolha a mensagem`);
    if (v.condition === 'etiqueta') return { condition: 'etiqueta', label_id: checkUuid(v.label_id, `Variante ${n}: escolha a etiqueta`), ad_keyword: null, item_id };
    const kw = typeof v.ad_keyword === 'string' ? v.ad_keyword.trim().replace(/\s+/g, ' ') : '';
    if (!kw || kw.length > 60) throw new Error(`Variante ${n}: palavra do anúncio de 1 a 60 caracteres`);
    return { condition: 'anuncio', label_id: null, ad_keyword: kw, item_id };
  }

  async function saveFlow(input) {
    const f = input || {};
    if (f.id !== undefined && f.id !== null) checkUuid(f.id, 'Régua inválida');
    const row = {
      name: cleanText(f.name, 60, 'Nome da régua'),
      active: f.active === true,
      label_id: checkUuid(f.label_id, 'Escolha a etiqueta de entrada'),
      wait_minutes: intIn(f.wait_minutes, 1, 43200, 'Espera (minutos)'),
      item_id: optUuid(f.item_id, 'Mensagem inválida'),
      next_label_id: optUuid(f.next_label_id, 'Etiqueta inválida'),
      reply_label_id: optUuid(f.reply_label_id, 'Etiqueta inválida'),
      ignore_older_days: intIn(f.ignore_older_days ?? 15, 1, 365, 'Ignorar conversas paradas há (dias)'),
    };
    if (row.next_label_id === row.label_id || row.reply_label_id === row.label_id) throw new Error('A etiqueta de saída precisa ser diferente da de entrada');
    const variants = Array.isArray(f.variants) ? f.variants : [];
    if (variants.length > 10) throw new Error('No máximo 10 variantes');
    const list = variants.map(checkVariant);
    if (!row.item_id && !list.length) throw new Error('Escolha a mensagem (padrão ou uma variante)');
    let id = f.id;
    if (id) {
      const rows = await engineRest(`wa_flows?id=eq.${id}`, json('PATCH', 'return=representation', row));
      if (!rows.length) throw new Error('Régua não encontrada');
    } else {
      const last = await engineRest('wa_flows?select=position&order=position.desc&limit=1');
      const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
      const rows = await engineRest('wa_flows', json('POST', 'return=representation', { ...row, position }));
      id = rows[0].id;
    }
    await engineRest(`wa_flow_variants?flow_id=eq.${id}`, { method: 'DELETE' });
    if (list.length) {
      await engineRest('wa_flow_variants', json('POST', 'return=minimal', list.map((v, i) => ({ ...v, flow_id: id, position: i }))));
    }
    return { id };
  }

  async function setFlowActive({ id, active }) {
    checkUuid(id, 'Régua inválida');
    if (typeof active !== 'boolean') throw new Error('Valor inválido');
    const rows = await engineRest(`wa_flows?id=eq.${id}`, json('PATCH', 'return=representation', { active }));
    return { active: rows.length ? rows[0].active : null };
  }

  async function deleteFlow({ id }) {
    checkUuid(id, 'Régua inválida');
    await engineRest(`wa_flows?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  // Contatos com qualquer uma das etiquetas de entrada, com TODAS as etiquetas CRM de cada um
  async function flowCandidates({ labelIds }) {
    if (!Array.isArray(labelIds) || !labelIds.length || labelIds.length > 50) throw new Error('Lista inválida');
    labelIds.forEach((l) => checkUuid(l));
    const cols = (await chatIdColumn()) ? 'id,name,phone,chat_id' : 'id,name,phone';
    const rows = await restAll(`wa_contact_labels?select=contact_id,contact:wa_contacts!inner(${cols})&label_id=in.${inList(labelIds)}&order=contact_id.asc,label_id.asc`, 5000);
    const byId = new Map();
    rows.forEach((r) => {
      if (r.contact && !byId.has(r.contact.id)) byId.set(r.contact.id, { id: r.contact.id, name: r.contact.name || null, phone: r.contact.phone || null, chat_id: r.contact.chat_id || null, labelIds: [], links: [] });
    });
    await addContactLinks(byId);
    return [...byId.values()];
  }

  // Todas as etiquetas CRM de cada contato (labelIds) e quando entrou em cada uma (links)
  async function addContactLinks(byId) {
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i += 100) {
      // 2.1.0: created_at = quando o contato entrou na etiqueta (gatilho "entrou na etiqueta" e run_key)
      const links = await restAll(`wa_contact_labels?select=contact_id,label_id,created_at&contact_id=in.${inList(ids.slice(i, i + 100))}&order=contact_id.asc,label_id.asc`);
      links.forEach((l) => {
        const c = byId.get(l.contact_id);
        if (c) { c.labelIds.push(l.label_id); c.links.push({ label_id: l.label_id, created_at: l.created_at || null }); }
      });
    }
    return byId;
  }

  async function contactLabelIds({ contactId }) {
    checkUuid(contactId, 'Contato inválido');
    return labelIdsOf(contactId);
  }

  // Reserva do follow: só quem apagar a ligação contato↔etiqueta da régua envia
  async function followReserve({ contactId, labelId }) {
    checkUuid(contactId, 'Contato inválido');
    checkUuid(labelId);
    const rows = await rest(`wa_contact_labels?contact_id=eq.${contactId}&label_id=eq.${labelId}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    return { reserved: Array.isArray(rows) && rows.length > 0 };
  }

  async function followAdd({ contactId, labelId }) {
    checkUuid(contactId, 'Contato inválido');
    checkUuid(labelId);
    await rest('wa_contact_labels?on_conflict=contact_id,label_id', json('POST', 'resolution=ignore-duplicates,return=minimal',
      { contact_id: contactId, label_id: labelId }));
    return true;
  }

  async function followMove({ contactId, fromLabelId, toLabelId }) {
    checkUuid(fromLabelId);
    checkUuid(toLabelId);
    if (fromLabelId === toLabelId) throw new Error('Mesma etiqueta');
    const r = await followReserve({ contactId, labelId: fromLabelId });
    if (!r.reserved) return { moved: false };
    await followAdd({ contactId, labelId: toLabelId });
    return { moved: true };
  }

  // ── Disparos (2.0.0-D2): wa_campaigns + wa_campaign_targets ──
  // Nada sai sem o usuário confirmar "Iniciar disparo" (startCampaign). A lista de alvos é
  // uma "foto" da etiqueta naquele momento. Sem as tabelas: "Atualize o banco para usar este recurso".

  const CAMPAIGN_COLUMNS = 'id,name,label_id,item_id,status,start_at,allow_new_chats,skip_recent_days,created_at';
  const TARGET_STATUS = ['pendente', 'enviando', 'enviado', 'falhou', 'pulado'];
  // 2.2.0 (migration 20261103160000): mensagem exclusiva, ações depois de enviar e filtros do público
  const CAMPAIGN_V2_COLUMNS = 'parts,after_actions,filters';
  const AFTER_ACTIONS = ['adicionar_etiqueta', 'remover_etiqueta', 'mover', 'adicionar_etiqueta_wa', 'remover_etiqueta_wa'];
  const CAMPAIGN_FILTERS = ['tem_etiqueta', 'nao_tem_etiqueta', 'respondeu_recente'];
  const campaignsV2 = () => probe('wa_campaigns.v2', () => hasColumn('wa_campaigns', 'after_actions'));
  // 2.14.0 (migration 20261111120000): público por etiqueta do WhatsApp, velocidade e variações; variação no log
  const CAMPAIGN_V214_COLUMNS = 'audience,speed,variants';
  const campaignsV214 = () => probe('wa_campaigns.v214', () => hasColumn('wa_campaigns', 'speed'), 30 * 60 * 1000);
  const sendVariantCol = () => probe('wa_send_log.variant', () => hasColumn('wa_send_log', 'variant'), 30 * 60 * 1000);
  const campCols = async () => {
    let cols = CAMPAIGN_COLUMNS;
    if (await campaignsV2()) cols += `,${CAMPAIGN_V2_COLUMNS}`;
    if (await campaignsV214()) cols += `,${CAMPAIGN_V214_COLUMNS}`;
    return cols;
  };
  const ALL_LABELS = '__todas__'; // "Todas menos a que vou colocar" ("Não enviar" nunca sai)
  const CAMP_HARD = { min_s: 20, per_hour: 60, per_day: 400 };
  function checkCampaignSpeed(sp) {
    if (sp == null) return null;
    if (typeof sp !== 'object' || !['seguro', 'normal', 'personalizado'].includes(sp.preset)) throw new Error('Velocidade: escolha o modelo');
    if (sp.preset !== 'personalizado') return { preset: sp.preset };
    const num = (v, what) => { const n = Number(v); if (v === '' || v == null || !Number.isFinite(n)) throw new Error(`Velocidade: ${what}`); return Math.floor(n); };
    const min_s = num(sp.min_s, 'intervalo mínimo (s)');
    if (min_s < CAMP_HARD.min_s) throw new Error(`Velocidade: intervalo mínimo de pelo menos ${CAMP_HARD.min_s} s (limite de segurança)`);
    if (min_s > 3600) throw new Error('Velocidade: intervalo mínimo de até 3600 s');
    const max_s = num(sp.max_s, 'intervalo máximo (s)');
    if (max_s < min_s || max_s > 3600) throw new Error('Velocidade: o intervalo máximo precisa ser maior ou igual ao mínimo (até 3600 s)');
    const per_hour = num(sp.per_hour, 'máximo por hora');
    if (per_hour < 1 || per_hour > CAMP_HARD.per_hour) throw new Error(`Velocidade: no máximo ${CAMP_HARD.per_hour} por hora (limite de segurança)`);
    const per_day = num(sp.per_day, 'máximo por dia');
    if (per_day < 1 || per_day > CAMP_HARD.per_day) throw new Error(`Velocidade: no máximo ${CAMP_HARD.per_day} por dia (limite de segurança)`);
    const pause_every = sp.pause_every === '' || sp.pause_every == null ? 0 : intIn(Number(sp.pause_every), 0, 500, 'Velocidade: pausar a cada N envios');
    const pause_min = pause_every ? intIn(Number(sp.pause_min), 1, 240, 'Velocidade: minutos de pausa') : 0;
    const out = { preset: 'personalizado', min_s, max_s, per_hour, per_day, pause_every, pause_min };
    const sc = sp.schedule && typeof sp.schedule === 'object' ? sp.schedule : null;
    if (sc && sc.mode === 'personalizado') {
      const days = [...new Set((Array.isArray(sc.days) ? sc.days : []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
      if (!days.length) throw new Error('Horário do disparo: escolha pelo menos um dia');
      const windows = Array.isArray(sc.windows) ? sc.windows : [];
      if (!windows.length || windows.length > 6) throw new Error('Horário do disparo: de 1 a 6 faixas de horário');
      out.schedule = { mode: 'personalizado', days, windows: windows.map((x, i) => checkWindow(x, `Horário do disparo, faixa ${i + 1}`)) };
    }
    return out;
  }
  function checkCampaignVariants(v) {
    if (v == null || !Array.isArray(v.list) || !v.list.length) return null;
    if (v.list.length > 5) throw new Error('No máximo 5 variações');
    const list = v.list.map((x, i) => {
      const t = String((x && x.text) || '').trim();
      if (!t || t.length > 4096) throw new Error(`Variação ${i + 2}: escreva o texto (até 4096 caracteres)`);
      return { text: t };
    });
    const mode = ['alternada', 'aleatoria', 'porcentagem'].includes(v.mode) ? v.mode : 'alternada';
    const out = { mode, list };
    if (mode === 'porcentagem') {
      const w = Array.isArray(v.weights) ? v.weights : [];
      if (w.length !== list.length + 1) throw new Error('Variações: escolha a porcentagem de cada uma');
      out.weights = w.map((x, i) => intIn(Number(x), 0, 100, `Variação ${i + 1}: porcentagem`));
      if (!out.weights.reduce((a, b) => a + b, 0)) throw new Error('Variações: a soma das porcentagens precisa ser maior que zero');
    }
    return out;
  }

  async function campRestAll(path) {
    try {
      return await restAll(path);
    } catch (err) {
      if (tableMissing(err, CAMPAIGN_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  async function campRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (tableMissing(err, CAMPAIGN_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  function checkCampaignInput(c, v2 = false, v214 = false) {
    const p = c || {};
    // 2.14.0: público por etiqueta do WhatsApp (sem etiqueta CRM principal)
    const audience = p.audience && p.audience.source === 'whatsapp' ? { source: 'whatsapp', wa_label_id: checkWaLabel(p.audience.wa_label_id, 'Escolha a etiqueta do WhatsApp') } : null;
    const label_id = audience ? null : checkUuid(p.label_id, 'Escolha a etiqueta CRM');
    let usesWa = !!audience;
    // Mensagem: exclusiva do disparo (partes, como wa_item_parts) ou uma mensagem salva
    let parts = null;
    if (p.parts != null) {
      if (!Array.isArray(p.parts) || !p.parts.length || p.parts.length > MAX_PARTS) throw new Error(`Mensagem do disparo: de 1 a ${MAX_PARTS} partes`);
      parts = p.parts.map(checkPart);
    }
    const item_id = parts ? null : (p.item_id == null || p.item_id === '' ? null : checkUuid(p.item_id, 'Escolha a mensagem salva'));
    if (!parts && !item_id) throw new Error('Escreva a mensagem do disparo ou escolha uma mensagem salva');
    const after = Array.isArray(p.after_actions) ? p.after_actions : [];
    if (after.length > 10) throw new Error('No máximo 10 ações depois de enviar');
    const after_actions = after.map((a, i) => {
      if (!a || !AFTER_ACTIONS.includes(a.type)) throw new Error(`Depois de enviar, ação ${i + 1}: tipo inválido`);
      if (a.type === 'adicionar_etiqueta_wa' || a.type === 'remover_etiqueta_wa') {
        usesWa = true;
        if (a.type === 'remover_etiqueta_wa' && a.wa_label_id === ALL_LABELS) return { type: a.type, wa_label_id: ALL_LABELS };
        return { type: a.type, wa_label_id: checkWaLabel(a.wa_label_id, `Depois de enviar, ação ${i + 1}: escolha a etiqueta do WhatsApp`) };
      }
      if (a.type === 'remover_etiqueta' && a.label_id === ALL_LABELS) return { type: a.type, label_id: ALL_LABELS };
      if (a.type === 'mover' && audience) throw new Error(`Depois de enviar, ação ${i + 1}: "mover" só com público por etiqueta CRM (use colocar e tirar)`);
      const l = checkUuid(a.label_id, `Depois de enviar, ação ${i + 1}: escolha a etiqueta`);
      if (a.type === 'mover' && l === label_id) throw new Error(`Depois de enviar, ação ${i + 1}: mover para uma etiqueta diferente da do disparo`);
      return { type: a.type, label_id: l };
    });
    const fl = Array.isArray(p.filters) ? p.filters : [];
    if (fl.length > 10) throw new Error('No máximo 10 filtros');
    const filters = fl.map((f, i) => {
      if (!f || !CAMPAIGN_FILTERS.includes(f.type)) throw new Error(`Filtro ${i + 1}: tipo inválido`);
      if (f.type === 'respondeu_recente') return { type: f.type, days: intIn(f.days, 1, 365, `Filtro ${i + 1}: dias`) };
      if (f.source === 'whatsapp') {
        usesWa = true;
        const w = checkWaLabel(f.wa_label_id, `Filtro ${i + 1}: escolha a etiqueta do WhatsApp`);
        if (audience && w === audience.wa_label_id) throw new Error(`Filtro ${i + 1}: escolha uma etiqueta diferente da principal`);
        return { type: f.type, source: 'whatsapp', wa_label_id: w };
      }
      const l = checkUuid(f.label_id, `Filtro ${i + 1}: escolha a etiqueta`);
      if (l === label_id) throw new Error(`Filtro ${i + 1}: escolha uma etiqueta diferente da principal`);
      return { type: f.type, label_id: l };
    });
    if (!v2 && (parts || after_actions.length || filters.length)) throw new Error(ENGINE_MISSING);
    const speed = checkCampaignSpeed(p.speed);
    const variants = checkCampaignVariants(p.variants);
    if (!v214 && (usesWa || speed || variants)) throw new Error(ENGINE_MISSING);
    const out = {
      name: cleanText(p.name, 60, 'Nome do disparo'),
      label_id,
      item_id,
      allow_new_chats: p.allow_new_chats === true,
      skip_recent_days: intIn(p.skip_recent_days ?? 0, 0, 90, 'Pular quem recebeu nos últimos (dias)'), // 2.14.0: desligado por padrão
      start_at: null,
      ...(v2 ? { parts, after_actions, filters } : {}),
      ...(v214 ? { audience, speed, variants } : {}),
    };
    if (p.start_at !== undefined && p.start_at !== null && p.start_at !== '') {
      const t = Date.parse(p.start_at);
      if (typeof p.start_at !== 'string' || !Number.isFinite(t)) throw new Error('Data e hora inválidas');
      if (t > Date.now() + 366 * 24 * 3600 * 1000) throw new Error('No máximo 1 ano para frente');
      out.start_at = new Date(t).toISOString();
    }
    return out;
  }

  // Lista com o progresso de cada disparo (contagem por status dos alvos)
  async function fetchCampaigns() {
    const list = await campRest(`wa_campaigns?select=${await campCols()}&order=created_at.desc&limit=30`);
    const counts = Object.fromEntries(list.map((c) => [c.id, { pendente: 0, enviando: 0, enviado: 0, falhou: 0, pulado: 0 }]));
    if (list.length) {
      const rows = await campRestAll(`wa_campaign_targets?select=campaign_id,status&campaign_id=in.${inList(list.map((c) => c.id))}&order=id.asc`);
      rows.forEach((r) => { if (counts[r.campaign_id] && r.status in counts[r.campaign_id]) counts[r.campaign_id][r.status]++; });
    }
    return list.map((c) => ({ ...c, counts: counts[c.id] }));
  }

  async function saveCampaign({ id, campaign }) {
    const row = checkCampaignInput(campaign, await campaignsV2(), await campaignsV214());
    if (id !== undefined && id !== null) {
      checkUuid(id, 'Disparo inválido');
      const rows = await campRest(`wa_campaigns?id=eq.${id}&status=eq.rascunho`, json('PATCH', 'return=representation', row));
      if (!rows.length) throw new Error('Só dá para editar disparo em rascunho');
      return { id };
    }
    const rows = await campRest('wa_campaigns', json('POST', 'return=representation', { ...row, status: 'rascunho' }));
    return { id: rows[0].id };
  }

  async function deleteCampaign({ id }) {
    checkUuid(id, 'Disparo inválido');
    const rows = await campRest(`wa_campaigns?id=eq.${id}&status=in.(rascunho,concluida,cancelada)`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    if (!rows.length) throw new Error('Pause ou cancele o disparo antes de excluir');
    return true;
  }

  async function campaignById(id) {
    checkUuid(id, 'Disparo inválido');
    const rows = await campRest(`wa_campaigns?select=${await campCols()}&id=eq.${id}`);
    if (!rows.length) throw new Error('Disparo não encontrado');
    return rows[0];
  }

  // Foto da etiqueta: quem vai e quem é pulado (e por quê). Não grava nada.
  // 2.14.0: wa = o que o painel leu do WhatsApp (só ele vê as etiquetas do WhatsApp): { audience: [{ id, name,
  // phone }] (TODAS as conversas da etiqueta, inclusive não carregadas e arquivadas), sets: { waLabelId: [chatIds] }
  // (filtros), noSend: [chatIds] (etiqueta "Não enviar" do WhatsApp), names: { waLabelId: nome } }
  async function campaignSnapshot(c, wa) {
    const aud = c.audience && c.audience.source === 'whatsapp' ? c.audience : null;
    const w = wa && typeof wa === 'object' ? wa : null;
    const needWa = !!aud || (c.filters || []).some((f) => f.source === 'whatsapp');
    if (needWa && !w) throw new Error('Abra o WhatsApp Web para ler as etiquetas do WhatsApp deste disparo');
    if (!aud && !c.label_id) throw new Error('A etiqueta CRM do disparo foi excluída');
    const allLabels = await rest('wa_labels?select=id,name');
    const noSend = allLabels.find((l) => noSendKey(l.name) === noSendKey(NO_SEND));
    const labelNameOf = (id) => { const l = allLabels.find((x) => x.id === id); return l ? l.name : 'excluída'; };
    const waSets = new Map();
    const waSet = (id) => { if (!waSets.has(id)) waSets.set(id, new Set((((w && w.sets) || {})[id] || []).map(String))); return waSets.get(id); };
    const waNoSend = new Set(((w && w.noSend) || []).map(String));
    const waNameOf = (id) => String(((w && w.names) || {})[id] || 'do WhatsApp').slice(0, 30);
    let contacts;
    if (aud) {
      const seen = new Set();
      const rows = [];
      (Array.isArray(w.audience) ? w.audience : []).slice(0, 5000).forEach((x) => {
        if (!x || typeof x.id !== 'string' || !SCHED_CHAT_RE.test(x.id)) return;
        const phone = typeof x.phone === 'string' && /^\d{8,15}$/.test(x.phone) ? x.phone : null;
        const chat = /@c\.us$/.test(x.id) ? x.id : phone ? `${phone}@c.us` : null; // @lid com telefone: manda pelo número
        const key = chat || x.id;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ waKey: x.id, chat, name: x.name ? String(x.name).slice(0, 100) : phone });
      });
      const byChat = await contactsByChats(rows.map((r) => r.chat).filter(Boolean));
      const map = new Map([...new Set(Object.values(byChat).map((x) => x.id))].map((id) => [id, { id, labelIds: [], links: [] }]));
      await addContactLinks(map);
      contacts = rows.map((r) => {
        const ct = r.chat ? byChat[r.chat] : null;
        return { id: ct ? ct.id : null, name: r.name || (ct && ct.name) || null, phone: r.chat ? phoneOfChat(r.chat) : null, chat_id: r.chat, waKey: r.waKey, labelIds: ct && map.get(ct.id) ? map.get(ct.id).labelIds : [] };
      });
    } else contacts = await flowCandidates({ labelIds: [c.label_id] });
    const recent = new Set();
    if (c.skip_recent_days > 0 && contacts.length) {
      const since = new Date(Date.now() - c.skip_recent_days * 24 * 3600 * 1000).toISOString();
      const logs = await engineRest(`wa_send_log?select=contact_id,chat_id&${AUTO_SOURCES}&status=eq.enviado&created_at=gte.${encodeURIComponent(since)}&limit=50000`);
      logs.forEach((l) => { if (l.contact_id) recent.add(l.contact_id); if (l.chat_id) recent.add(l.chat_id); });
    }
    const targets = contacts.map((ct) => {
      const chat = ct.chat_id && SCHED_CHAT_RE.test(ct.chat_id) ? ct.chat_id : (ct.phone && /^\d{8,15}$/.test(ct.phone) ? `${ct.phone}@c.us` : null);
      const base = { contact_id: ct.id, chat_id: chat, name: ct.name ? String(ct.name).slice(0, 100) : (ct.phone || null) };
      const keys = [chat, ct.waKey, ct.chat_id].filter(Boolean);
      if (noSend && ct.labelIds.includes(noSend.id)) return { ...base, status: 'pulado', reason: 'Não enviar' };
      if (keys.some((k) => waNoSend.has(k))) return { ...base, status: 'pulado', reason: 'Não enviar' };
      if (!chat) return { ...base, status: 'pulado', reason: 'sem telefone' };
      for (const f of c.filters || []) {
        if (f.source === 'whatsapp') {
          const has = keys.some((k) => waSet(f.wa_label_id).has(k));
          if (f.type === 'tem_etiqueta' && !has) return { ...base, status: 'pulado', reason: `não tem a etiqueta ${waNameOf(f.wa_label_id)}`.slice(0, 60) };
          if (f.type === 'nao_tem_etiqueta' && has) return { ...base, status: 'pulado', reason: `tem a etiqueta ${waNameOf(f.wa_label_id)}`.slice(0, 60) };
          continue;
        }
        if (f.type === 'tem_etiqueta' && !ct.labelIds.includes(f.label_id)) return { ...base, status: 'pulado', reason: `não tem a etiqueta ${labelNameOf(f.label_id)}`.slice(0, 60) };
        if (f.type === 'nao_tem_etiqueta' && ct.labelIds.includes(f.label_id)) return { ...base, status: 'pulado', reason: `tem a etiqueta ${labelNameOf(f.label_id)}`.slice(0, 60) };
      }
      if (recent.has(ct.id) || recent.has(chat)) return { ...base, status: 'pulado', reason: `recebeu envio nos últimos ${c.skip_recent_days} dias` };
      return { ...base, status: 'pendente', reason: null };
    });
    const skipped = {};
    targets.filter((t) => t.status === 'pulado').forEach((t) => { skipped[t.reason] = (skipped[t.reason] || 0) + 1; });
    return { targets, total: targets.length, willSend: targets.filter((t) => t.status === 'pendente').length, skipped };
  }

  // Para a tela de confirmação: números e as conversas que vão (para conferir as carregadas)
  const previewOf = (c, snap) => ({
    total: snap.total, willSend: snap.willSend, skipped: snap.skipped, allow_new_chats: c.allow_new_chats,
    chatIds: snap.targets.filter((t) => t.status === 'pendente').map((t) => t.chat_id),
    // 2.2.0 (Simular): quem vai e quem é pulado, com nome e motivo (só para a tela)
    targets: snap.targets.slice(0, 2000).map((t) => ({ name: t.name, chat_id: t.chat_id, contact_id: t.contact_id, status: t.status, reason: t.reason })),
  });

  async function previewCampaign({ id, wa }) {
    const c = await campaignById(id);
    if (c.status !== 'rascunho') throw new Error('Este disparo já foi iniciado');
    return previewOf(c, await campaignSnapshot(c, wa));
  }

  // Simular no editor, antes de salvar: valida o formulário e tira a "foto" sem gravar nada
  async function simulateCampaign({ campaign, wa }) {
    const c = checkCampaignInput(campaign, await campaignsV2(), await campaignsV214());
    return previewOf(c, await campaignSnapshot(c, wa));
  }

  // Duplicar: rascunho igual (mensagem, ações, filtros), sem alvos
  async function duplicateCampaign({ id }) {
    const c = await campaignById(id);
    const row = {
      name: `${c.name} (cópia)`.slice(0, 60), label_id: c.label_id, item_id: c.item_id, status: 'rascunho', start_at: null,
      allow_new_chats: !!c.allow_new_chats, skip_recent_days: c.skip_recent_days,
      ...('after_actions' in c ? { parts: c.parts || null, after_actions: c.after_actions || [], filters: c.filters || [] } : {}),
      ...('speed' in c ? { audience: c.audience || null, speed: c.speed || null, variants: c.variants || null } : {}),
    };
    const rows = await campRest('wa_campaigns', json('POST', 'return=representation', row));
    return { id: rows[0].id };
  }

  // Iniciar (só a pedido do usuário, na confirmação): reserva o rascunho, grava a foto e libera
  async function startCampaign({ id, wa }) {
    const c = await campaignById(id);
    if (c.status !== 'rascunho') throw new Error('Este disparo já foi iniciado');
    if (!c.item_id && !(Array.isArray(c.parts) && c.parts.length)) throw new Error('O disparo está sem mensagem');
    const held = await campRest(`wa_campaigns?id=eq.${id}&status=eq.rascunho`, json('PATCH', 'return=representation', { status: 'pausada' }));
    if (!held.length) throw new Error('Este disparo já foi iniciado');
    let snap;
    try {
      snap = await campaignSnapshot(c, wa);
      for (let i = 0; i < snap.targets.length; i += 500) {
        await campRest('wa_campaign_targets', json('POST', 'return=minimal', snap.targets.slice(i, i + 500).map((t) => ({ ...t, campaign_id: id }))));
      }
    } catch (err) {
      await campRest(`wa_campaign_targets?campaign_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
      await campRest(`wa_campaigns?id=eq.${id}&status=eq.pausada`, json('PATCH', 'return=minimal', { status: 'rascunho' })).catch(() => {});
      throw err;
    }
    const future = c.start_at && Date.parse(c.start_at) > Date.now();
    const status = future ? 'agendada' : 'rodando';
    await campRest(`wa_campaigns?id=eq.${id}&status=eq.pausada`, json('PATCH', 'return=minimal', { status, start_at: c.start_at || new Date().toISOString() }));
    return { status, total: snap.total, willSend: snap.willSend };
  }

  const CAMPAIGN_ACTIONS = {
    pause: { from: ['rodando', 'agendada'], to: () => 'pausada' },
    resume: { from: ['pausada'], to: (c) => (c.start_at && Date.parse(c.start_at) > Date.now() ? 'agendada' : 'rodando') },
    cancel: { from: ['rascunho', 'agendada', 'rodando', 'pausada'], to: () => 'cancelada' },
  };

  async function campaignAction({ id, action }) {
    const a = Object.prototype.hasOwnProperty.call(CAMPAIGN_ACTIONS, action) ? CAMPAIGN_ACTIONS[action] : null;
    if (!a) throw new Error('Ação inválida');
    const c = await campaignById(id);
    if (!a.from.includes(c.status)) throw new Error('Não dá para fazer isso agora');
    const to = a.to(c);
    const rows = await campRest(`wa_campaigns?id=eq.${id}&status=eq.${c.status}`, json('PATCH', 'return=representation', { status: to }));
    if (!rows.length) throw new Error('O disparo mudou: atualize a lista');
    if (to === 'cancelada') {
      await campRest(`wa_campaign_targets?campaign_id=eq.${id}&status=eq.pendente`, json('PATCH', 'return=minimal', { status: 'pulado', reason: 'disparo cancelado' }));
    }
    return { status: to };
  }

  // Próximo alvo de um disparo rodando (o motor chama). Libera os agendados que chegaram na hora
  // e conclui os que acabaram. Alvo preso em "enviando" (aba fechou no meio) vira falhou, sem reenvio.
  async function nextCampaignTarget() {
    const now = new Date().toISOString();
    await campRest(`wa_campaigns?status=eq.agendada&start_at=lte.${encodeURIComponent(now)}`, json('PATCH', 'return=minimal', { status: 'rodando' }));
    const running = await campRest(`wa_campaigns?select=${await campCols()}&status=eq.rodando&order=created_at.asc&limit=10`);
    const all = []; // 2.14.0: cada disparo rodando com o próximo alvo, quantos já foram e quando foi o último
    for (const c of running) {
      const next = await campRest(`wa_campaign_targets?select=id,campaign_id,contact_id,chat_id,name,status&campaign_id=eq.${c.id}&status=eq.pendente&order=id.asc&limit=1`);
      if (next.length) {
        const [sent, last] = await Promise.all([
          countRows(`wa_campaign_targets?campaign_id=eq.${c.id}&status=eq.enviado`).catch(() => 0),
          campRest(`wa_campaign_targets?select=sent_at&campaign_id=eq.${c.id}&status=eq.enviado&order=sent_at.desc.nullslast&limit=1`).catch(() => []),
        ]);
        all.push({ campaign: c, target: next[0], sent: Number(sent) || 0, lastSentAt: last.length && last[0].sent_at ? Date.parse(last[0].sent_at) : null });
        continue;
      }
      const busy = await campRest(`wa_campaign_targets?select=id&campaign_id=eq.${c.id}&status=eq.enviando&limit=1`);
      if (busy.length) {
        await campRest(`wa_campaign_targets?campaign_id=eq.${c.id}&status=eq.enviando`, json('PATCH', 'return=minimal', { status: 'falhou', reason: 'envio não confirmado' }));
      }
      await campRest(`wa_campaigns?id=eq.${c.id}&status=eq.rodando`, json('PATCH', 'return=minimal', { status: 'concluida' }));
    }
    return all.length ? { campaign: all[0].campaign, target: all[0].target, all } : null;
  }

  // 2.14.0: resultado por variação (enviadas, responderam, vendas pela conversa em até 7 dias depois do envio)
  async function campaignVariantStats({ id }) {
    checkUuid(id, 'Disparo inválido');
    if (!(await sendVariantCol())) return { available: false, rows: [] };
    const logs = await restAll(`wa_send_log?select=id,chat_id,created_at,variant&source=eq.disparo&source_id=eq.${id}&status=eq.enviado&order=id.asc`);
    const replied = new Set();
    for (let i = 0; i < logs.length; i += 100) {
      try { (await rest(`wa_replies?select=send_log_id&send_log_id=in.${inList(logs.slice(i, i + 100).map((l) => l.id))}`)).forEach((r) => replied.add(r.send_log_id)); } catch { break; }
    }
    const sales = [];
    const chats = [...new Set(logs.map((l) => l.chat_id).filter(Boolean))];
    if (chats.length && (await salesOrigin())) {
      for (let i = 0; i < chats.length; i += 100) {
        try { sales.push(...(await rest(`sales?select=id,wa_chat_id,created_at,total_sale_price&wa_chat_id=in.${inList(chats.slice(i, i + 100))}&status=neq.cancelado&status=neq.reembolsado`))); } catch { break; }
      }
    }
    const by = new Map();
    logs.forEach((l) => {
      const v = Number(l.variant) || 0;
      const g = by.get(v) || { variant: v, sent: 0, replied: 0, sales: new Map() };
      g.sent++;
      if (replied.has(l.id)) g.replied++;
      const t = Date.parse(l.created_at);
      sales.filter((x) => x.wa_chat_id === l.chat_id && Date.parse(x.created_at) >= t && Date.parse(x.created_at) <= t + 7 * 86400000).forEach((x) => g.sales.set(x.id, x));
      by.set(v, g);
    });
    return {
      available: true,
      rows: [...by.values()].sort((a, b) => a.variant - b.variant).map((g) => ({
        variant: g.variant, sent: g.sent, replied: g.replied, repliedPct: g.sent ? g.replied / g.sent : null,
        sales: g.sales.size, revenue: [...g.sales.values()].reduce((a, x) => a + (Number(x.total_sale_price) || 0), 0),
      })),
    };
  }

  // Reserva do alvo: só sai de 'pendente' para 'enviando' uma vez
  async function claimTarget({ id }) {
    checkUuid(id, 'Alvo inválido');
    const rows = await campRest(`wa_campaign_targets?id=eq.${id}&status=eq.pendente`, json('PATCH', 'return=representation', { status: 'enviando' }));
    return rows.length ? rows[0] : null;
  }

  // Resultado: enviado/falhou saem de 'enviando'; pulado sai de 'pendente' ou 'enviando'
  async function finishTarget({ id, status, reason }) {
    checkUuid(id, 'Alvo inválido');
    if (!['enviado', 'falhou', 'pulado'].includes(status)) throw new Error('Status inválido');
    const from = status === 'pulado' ? 'in.(pendente,enviando)' : 'eq.enviando';
    const patch = { status, reason: cleanReason(reason) };
    if (status === 'enviado') patch.sent_at = new Date().toISOString();
    const rows = await campRest(`wa_campaign_targets?id=eq.${id}&status=${from}`, json('PATCH', 'return=representation', patch));
    return { updated: rows.length > 0 };
  }

  async function campaignTargets({ id, offset = 0, limit = 200 }) {
    checkUuid(id, 'Disparo inválido');
    const off = Math.max(0, Math.floor(Number(offset) || 0));
    const lim = Math.min(500, Math.max(1, Math.floor(Number(limit) || 200)));
    const rows = await campRest(`wa_campaign_targets?select=id,chat_id,name,status,reason,sent_at&campaign_id=eq.${id}&order=id.asc&offset=${off}&limit=${lim + 1}`);
    return { targets: rows.slice(0, lim), hasMore: rows.length > lim };
  }

  // ── Automações (2.1.0): wa_automations + wa_automation_runs ──
  // QUANDO (gatilho) → SE (condições) → ENTÃO (ações em ordem). Configurar só por clique (editor);
  // o motor do painel reserva (wa_automation_runs, unique) antes de executar.

  const AUTOMATION_TABLES = ['wa_automations', 'wa_automation_runs'];
  const AUTOMATION_COLUMNS = 'id,name,active,position,trigger_type,trigger_label_id,wait_minutes,schedule_days,schedule_time,conditions,actions,ignore_older_days,created_at';
  const TRIGGERS = ['sem_resposta', 'entrou_etiqueta', 'respondeu', 'dia_hora', 'venda_registrada'];
  const CONDITIONS = ['tem_etiqueta', 'nao_tem_etiqueta', 'anuncio', 'parada_max_dias'];
  const ACTIONS = ['enviar', 'adicionar_etiqueta', 'remover_etiqueta', 'mover', 'parar', 'adicionar_etiqueta_wa', 'remover_etiqueta_wa'];
  const WA_ACTIONS = ['adicionar_etiqueta_wa', 'remover_etiqueta_wa'];
  // 2.5.0 (migration 20261104120000): etiqueta do WhatsApp no gatilho, "primeira vez que viu" e inscrição manual
  const WA_LABEL_RE = /^[\w.:-]{1,40}$/;
  const AUTOMATION_V25_COLUMNS = 'trigger_label_source,trigger_wa_label_id';
  // "não" é testado de novo só a cada 30 min (2.4.1: poucas consultas); recarregar o WhatsApp testa na hora
  const automationsV25 = () => probe('automations.v25', () => hasColumn('wa_automations', 'trigger_label_source'), 30 * 60 * 1000);
  // 2.8.8 (migration 20261105200000): ativação ("só daqui pra frente"), incluir quem já estava e modo teste
  const AUTOMATION_V288_COLUMNS = 'activated_at,include_existing,test_chat_id';
  const automationsV288 = () => probe('automations.v288', () => hasColumn('wa_automations', 'activated_at'), 30 * 60 * 1000);
  // 2.12.0: sequências (migration 20261106210000): kind, sequence e a tabela wa_sequence_runs
  const automationsV212 = () => probe('automations.v212', async () => {
    if (!(await hasColumn('wa_automations', 'kind'))) return false;
    try { await rest('wa_sequence_runs?select=id&limit=1'); return true; } catch (err) { if (tableMissing(err, ['wa_sequence_runs'])) return false; throw err; }
  }, 30 * 60 * 1000);
  const autoCols = async () => {
    let cols = AUTOMATION_COLUMNS;
    if (await automationsV25()) cols += `,${AUTOMATION_V25_COLUMNS}`;
    if (await automationsV288()) cols += `,${AUTOMATION_V288_COLUMNS}`;
    if (await automationsV212()) cols += ',kind,sequence';
    return cols;
  };

  // ── 2.12.0: validação da sequência (o painel valida antes; aqui é a última barreira) ──
  const SEQ_ID_RE = /^[a-z0-9]{1,40}$/i;
  const SEQ_MAX_DEPTH = 10; // 2.16.4 (o mesmo do engine.js)
  // 2.16.3: draft = rascunho DESLIGADO: o que falta escolher (mensagem, etiqueta, destino do "Continuar em", tempo)
  // fica vazio em vez de recusar; o formato (ids, tipos, limites) continua conferido. Ligar exige tudo completo.
  function checkSequence(seq, { draft = false } = {}) {
    const opt = (fn, empty) => { if (!draft) return fn(); try { return fn(); } catch { return empty; } };
    const q = seq && typeof seq === 'object' ? seq : {};
    const st = q.start && typeof q.start === 'object' ? q.start : {};
    if (!['lead', 'etiqueta', 'venda', 'manual'].includes(st.type)) throw new Error('Sequência: escolha quem entra');
    const start = { type: st.type };
    if (st.type === 'lead') start.origin = ['todos', 'anuncio', 'organico'].includes(st.origin) ? st.origin : 'todos';
    if (st.type === 'etiqueta' || (st.type === 'venda' && st.label_id)) {
      start.source = st.source === 'whatsapp' && st.type === 'etiqueta' ? 'whatsapp' : 'crm';
      if (start.source === 'whatsapp') start.wa_label_id = opt(() => checkWaLabel(st.wa_label_id, 'Sequência: escolha a etiqueta do WhatsApp de quem entra'), '');
      else start.label_id = opt(() => checkUuid(st.label_id, 'Sequência: escolha a etiqueta de quem entra'), '');
    }
    // 2.13.0: "Nunca para quem tem a etiqueta" (o Não enviar vale sempre, não precisa estar aqui)
    if (Array.isArray(st.exclude) && st.exclude.length) {
      if (st.exclude.length > 20) throw new Error('Sequência: no máximo 20 etiquetas em "Nunca para quem tem"');
      start.exclude = st.exclude.map((x) => (x && x.source === 'whatsapp'
        ? { source: 'whatsapp', wa_label_id: opt(() => checkWaLabel(x.wa_label_id, 'Sequência: escolha a etiqueta do WhatsApp de "Nunca para quem tem"'), '') }
        : { source: 'crm', label_id: opt(() => checkUuid(x && x.label_id, 'Sequência: escolha a etiqueta de "Nunca para quem tem"'), '') }));
    }
    const ids = new Set();
    let count = 0;
    const gotos = [];
    const walk = (list, depth, what) => {
      if (!Array.isArray(list)) throw new Error(`${what}: passos inválidos`);
      return list.map((n, i) => {
        if (++count > 80) throw new Error('Sequência: no máximo 80 passos');
        const w = `${what}, passo ${i + 1}`;
        if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !SEQ_ID_RE.test(n.id) || ids.has(n.id)) throw new Error(`${w}: identificador inválido`);
        ids.add(n.id);
        if (n.type === 'enviar') return { id: n.id, type: 'enviar', item_id: opt(() => checkUuid(n.item_id, `${w}: escolha a mensagem`), '') };
        if (n.type === 'etiqueta') {
          const op = n.op === 'tirar' ? 'tirar' : 'colocar';
          const source = n.source === 'whatsapp' ? 'whatsapp' : 'crm';
          const out = { id: n.id, type: 'etiqueta', op, source };
          if (source === 'whatsapp') out.wa_label_id = opt(() => checkWaLabel(n.wa_label_id, `${w}: escolha a etiqueta do WhatsApp`), '');
          else out.label_id = opt(() => checkUuid(n.label_id, `${w}: escolha a etiqueta`), '');
          if (op === 'colocar' && n.remove_others === true) out.remove_others = true;
          return out;
        }
        // 2.13.0: ⏳ ESPERAR (só o tempo); 2.13.2: ou "até o próximo [dia] às HH:MM", e "enviar só entre"
        if (n.type === 'pausa') {
          const unit = ['minutos', 'horas', 'dias'].includes(n.unit) ? n.unit : 'horas';
          const out = n.mode === 'ate'
            ? { id: n.id, type: 'pausa', mode: 'ate', until_day: n.until_day === 'qualquer' || n.until_day == null || n.until_day === '' ? 'qualquer' : intIn(Number(n.until_day), 0, 6, `${w}: dia da semana`), until_time: checkHM(n.until_time, `${w}: a hora (HH:MM)`) }
            : { id: n.id, type: 'pausa', amount: opt(() => intIn(Number(n.amount), 1, unit === 'minutos' ? 525600 : unit === 'horas' ? 8760 : 365, `${w}: tempo de espera`), 0), unit, ...(n.from === 'entrada' ? { from: 'entrada' } : {}) }; // 2.16.0: desde a entrada
          if (n.send_window) out.send_window = checkWindow(n.send_window, `${w}: "enviar só entre"`);
          return out;
        }
        if (n.type === 'esperar') {
          // 2.16.4: até 10 "esperar resposta" um dentro do outro (o 10º ainda pode ter caixas nos caminhos); igual ao engine.js
          if (depth > SEQ_MAX_DEPTH) throw new Error(`Sequência: no máximo ${SEQ_MAX_DEPTH} esperas uma dentro da outra`);
          const unit = ['minutos', 'horas', 'dias'].includes(n.unit) ? n.unit : 'horas';
          const amount = opt(() => intIn(Number(n.amount), 1, unit === 'minutos' ? 525600 : unit === 'horas' ? 8760 : 365, `${w}: tempo de espera`), 0);
          // 2.16.0: "desde a entrada" (from) fica guardado; com ele não vale "da minha última mensagem"
          return { id: n.id, type: 'esperar', amount, unit, ...(n.from === 'entrada' ? { from: 'entrada' } : n.after_mine === true ? { after_mine: true } : {}),
            ...(n.send_window ? { send_window: checkWindow(n.send_window, `${w}: "enviar só entre"`) } : {}), // 2.13.2
            yes: walk(n.yes || [], depth + 1, `${w} (respondeu)`), no: walk(n.no || [], depth + 1, `${w} (não respondeu)`) };
        }
        if (n.type === 'fim') return { id: n.id, type: 'fim' };
        if (n.type === 'ir') { gotos.push([n.to, w]); return { id: n.id, type: 'ir', to: String(n.to || '') }; }
        throw new Error(`${w}: tipo inválido`);
      });
    };
    const steps = walk(q.steps, 1, 'Sequência');
    if (!steps.length && !draft) throw new Error('Sequência: adicione pelo menos um passo');
    if (!draft) gotos.forEach(([to, w]) => { if (!ids.has(to)) throw new Error(`${w}: escolha para onde continuar`); });
    // 2.13.2: horário de envio da automação (geral ou personalizado) e limite próprio por dia
    const sc = q.schedule && typeof q.schedule === 'object' ? q.schedule : null;
    let schedule;
    if (sc && (sc.mode === 'personalizado' || (sc.daily_limit != null && sc.daily_limit !== ''))) {
      schedule = { mode: sc.mode === 'personalizado' ? 'personalizado' : 'geral' };
      if (schedule.mode === 'personalizado') schedule.week = checkWeek(Array.isArray(sc.week) ? sc.week : weekFromOld(sc), 'Horário personalizado'); // 2.14.3
      if (sc.daily_limit != null && sc.daily_limit !== '') schedule.daily_limit = intIn(Number(sc.daily_limit), 1, 2000, 'Limite desta automação por dia');
    }
    return { start, business: false, ...(schedule ? { schedule } : {}), steps }; // 2.14.2: esperas sempre em tempo corrido
  }
  // 2.14.3: horário por dia da semana: 7 linhas (dom=0…sáb=6), cada uma com 0 a 6 faixas; linha vazia = fechado
  const WEEK_DAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function checkWeek(w, what) {
    if (!Array.isArray(w) || w.length !== 7) throw new Error(`${what}: horário da semana inválido`);
    const out = w.map((ws, d) => {
      const list = Array.isArray(ws) ? ws : [];
      if (list.length > 6) throw new Error(`${what}, ${WEEK_DAY[d]}: no máximo 6 faixas`);
      return list.map((x, i) => checkWindow(x, `${what}, ${WEEK_DAY[d]}${list.length > 1 ? ` (faixa ${i + 1})` : ''}`)).sort((a, b) => (a.start < b.start ? -1 : 1));
    });
    if (!out.some((ws) => ws.length)) throw new Error(`${what}: deixe pelo menos um dia aberto`);
    return out;
  }
  // formato antigo (dias marcados + as mesmas faixas) → semana, sem mudar o resultado
  function weekFromOld(sc) {
    const days = new Set((Array.isArray(sc && sc.days) ? sc.days : []).map(Number));
    if (!days.size) throw new Error('Horário personalizado: escolha pelo menos um dia');
    const windows = Array.isArray(sc && sc.windows) ? sc.windows : [];
    if (!windows.length || windows.length > 6) throw new Error('Horário personalizado: de 1 a 6 faixas de horário');
    const ws = windows.map((x, i) => checkWindow(x, `Horário personalizado, faixa ${i + 1}`));
    return [0, 1, 2, 3, 4, 5, 6].map((d) => (days.has(d) ? ws.map((x) => ({ ...x })) : []));
  }
  const HM2_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const checkHM = (v, what) => { if (typeof v !== 'string' || !HM2_RE.test(v)) throw new Error(what); return v; };
  const checkWindow = (x, what) => {
    const start = checkHM(x && x.start, `${what}: início (HH:MM)`);
    const end = checkHM(x && x.end, `${what}: fim (HH:MM)`);
    if (end <= start) throw new Error(`${what}: o início precisa ser antes do fim`);
    return { start, end };
  };
  // 2.13.2: envios de hoje de uma automação (limite próprio por dia)
  async function automationSentToday({ automationId, since }) {
    checkUuid(automationId, 'Automação inválida');
    const t = Date.parse(since || '');
    if (!Number.isFinite(t)) throw new Error('Data inválida');
    const count = await countRows(`wa_send_log?select=id&source=eq.follow&source_id=eq.${automationId}&status=in.(enviando,enviado)&created_at=gte.${encodeURIComponent(new Date(t).toISOString())}`);
    return { count };
  }
  const checkWaLabel = (v, what) => { if (typeof v !== 'string' || !WA_LABEL_RE.test(v)) throw new Error(what); return v; };
  const RUN_KEY_RE = /^[\w:@.+-]{1,120}$/;

  const automationTables = () => probe('automations', async () => {
    try {
      await rest('wa_automations?select=id&limit=1');
      await rest('wa_automation_runs?select=id&limit=1');
      return true;
    } catch (err) {
      if (tableMissing(err, AUTOMATION_TABLES)) return false;
      throw err;
    }
  });

  async function autoRest(path, init) {
    try {
      return await rest(path, init);
    } catch (err) {
      if (tableMissing(err, AUTOMATION_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  async function autoRestAll(path) {
    try {
      return await restAll(path);
    } catch (err) {
      if (tableMissing(err, AUTOMATION_TABLES)) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  // 2.4.1: "tem algo ativo?" para o motor: leituras mínimas (id / poucas linhas), juntas
  async function engineActivity({ automations = true, campaigns = true } = {}) {
    const nowMs = Date.now();
    const soon = encodeURIComponent(new Date(nowMs + 2 * 60 * 1000).toISOString());
    const none = () => [];
    const cols = automations ? await autoCols() : '';
    const [sch, camp, auto] = await Promise.all([
      rest(`wa_schedules?select=id&status=eq.pendente&send_at=lte.${soon}&limit=1`).catch(none),
      campaigns ? (async () => rest(`wa_campaigns?select=id,status,start_at${(await campaignsV214()) ? ',speed' : ''}&status=in.(agendada,rodando)&order=created_at.asc&limit=20`))().catch(none) : [],
      automations
        ? autoRest(`wa_automations?select=${cols}&active=eq.true&order=position.asc,created_at.asc`)
        : rest('wa_flows?select=id&active=eq.true&limit=1').catch(none),
    ]);
    const due = (c) => c.status === 'rodando' || (c.start_at && Date.parse(c.start_at) <= nowMs + 2 * 60 * 1000);
    const campaignOn = camp.some(due);
    // 2.14.0: disparo com dias e horário próprios (pode rodar fora do horário geral)
    const campaignsCustom = camp.some((c) => due(c) && c.speed && c.speed.preset === 'personalizado' && c.speed.schedule && c.speed.schedule.mode === 'personalizado');
    // 2.5.0: inscrições manuais ativas nas automações ativas (1 leitura, só se houver automação ativa)
    let enrollments = [];
    if (automations && auto.length && (await automationsV25())) enrollments = await activeEnrollments({ automationIds: auto.map((a) => a.id) }).catch(none);
    return automations
      ? { schedules: sch.length > 0, campaigns: campaignOn, campaignsCustom, automations: auto, flows: false, enrollments }
      : { schedules: sch.length > 0, campaigns: campaignOn, campaignsCustom, automations: null, flows: auto.length > 0 };
  }

  const cleanKeyword = (v, what) => {
    const kw = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    if (!kw || kw.length > 60) throw new Error(`${what}: palavra do anúncio de 1 a 60 caracteres`);
    return kw;
  };

  function checkCondition(c, i) {
    const what = `Condição ${i + 1}`;
    if (!c || typeof c !== 'object' || !CONDITIONS.includes(c.type)) throw new Error(`${what}: tipo inválido`);
    if (c.type === 'tem_etiqueta' || c.type === 'nao_tem_etiqueta') return { type: c.type, label_id: checkUuid(c.label_id, `${what}: escolha a etiqueta`) };
    if (c.type === 'anuncio') return { type: 'anuncio', keyword: cleanKeyword(c.keyword, what) };
    return { type: 'parada_max_dias', days: intIn(c.days, 1, 365, `${what}: dias`) };
  }

  function checkAction(a, i, triggerLabel, waTrigger = false) {
    const what = `Ação ${i + 1}`;
    if (!a || typeof a !== 'object' || !ACTIONS.includes(a.type)) throw new Error(`${what}: tipo inválido`);
    if (a.type === 'parar') return { type: 'parar' };
    if (WA_ACTIONS.includes(a.type)) return { type: a.type, wa_label_id: checkWaLabel(a.wa_label_id, `${what}: escolha a etiqueta do WhatsApp`) };
    if (a.type === 'enviar') {
      const variants = Array.isArray(a.variants) ? a.variants : [];
      if (variants.length > 10) throw new Error(`${what}: no máximo 10 variantes`);
      const list = variants.map((v, j) => {
        const w = `${what}, variante ${j + 1}`;
        if (!v || !['etiqueta', 'anuncio'].includes(v.when)) throw new Error(`${w}: condição inválida`);
        const item_id = checkUuid(v.item_id, `${w}: escolha a mensagem`);
        return v.when === 'etiqueta' ? { when: 'etiqueta', label_id: checkUuid(v.label_id, `${w}: escolha a etiqueta`), item_id } : { when: 'anuncio', keyword: cleanKeyword(v.keyword, w), item_id };
      });
      const item_id = a.item_id == null || a.item_id === '' ? null : checkUuid(a.item_id, `${what}: mensagem inválida`);
      if (!item_id && !list.length) throw new Error(`${what}: escolha a mensagem`);
      return { type: 'enviar', item_id, variants: list };
    }
    const label_id = checkUuid(a.label_id, `${what}: escolha a etiqueta`);
    if (a.type === 'mover' && label_id === triggerLabel) throw new Error(`${what}: mover para uma etiqueta diferente da do gatilho`);
    if (a.type === 'mover' && !triggerLabel && !waTrigger) throw new Error(`${what}: sem etiqueta no gatilho, use "adicionar etiqueta"`);
    return { type: a.type, label_id };
  }

  function checkAutomation(input) {
    const a = input || {};
    // 2.12.0: sequência (trigger 'sequencia'; os passos ficam em sequence)
    if (a.kind === 'sequencia') {
      // 2.16.3: desligada e sem conversa de teste = pode ser rascunho incompleto (ligar confere tudo)
      const draft = a.active !== true && (a.test_chat_id == null || a.test_chat_id === '');
      const sequence = checkSequence(a.sequence, { draft });
      return {
        name: draft && !String(a.name || '').trim() ? 'Rascunho' : cleanText(a.name, 60, 'Nome da automação'), active: a.active === true, kind: 'sequencia', sequence,
        trigger_type: 'sequencia', trigger_label_source: 'crm', trigger_wa_label_id: null, trigger_label_id: null,
        wait_minutes: null, schedule_days: null, schedule_time: null, ignore_older_days: 15, conditions: [], actions: [],
        test_chat_id: a.test_chat_id == null || a.test_chat_id === '' ? null : (typeof a.test_chat_id === 'string' && SCHED_CHAT_RE.test(a.test_chat_id) ? a.test_chat_id : (() => { throw new Error('Escolha a conversa de teste'); })()),
      };
    }
    if (!TRIGGERS.includes(a.trigger_type)) throw new Error('Escolha o gatilho (Quando)');
    // 2.5.0: etiqueta do gatilho do CRM (padrão) ou do WhatsApp
    const source = a.trigger_label_source === 'whatsapp' ? 'whatsapp' : 'crm';
    if (source === 'whatsapp' && a.trigger_type === 'venda_registrada') throw new Error('"Venda registrada" usa só etiqueta CRM');
    const row = {
      name: cleanText(a.name, 60, 'Nome da automação'),
      active: a.active === true,
      trigger_type: a.trigger_type,
      trigger_label_source: source,
      trigger_wa_label_id: source === 'whatsapp' ? checkWaLabel(a.trigger_wa_label_id, 'Escolha a etiqueta do WhatsApp do gatilho') : null,
      // 2.3.0: "venda registrada" não precisa de etiqueta (vale para quem teve a venda registrada pela conversa)
      trigger_label_id: source === 'whatsapp' ? null : a.trigger_type === 'venda_registrada' && (a.trigger_label_id == null || a.trigger_label_id === '')
        ? null : checkUuid(a.trigger_label_id, 'Escolha a etiqueta CRM do gatilho'),
      wait_minutes: null, schedule_days: null, schedule_time: null,
      ignore_older_days: intIn(a.ignore_older_days ?? 15, 1, 365, 'Ignorar conversas paradas há (dias)'),
      // 2.8.8: modo teste (só uma conversa)
      test_chat_id: a.test_chat_id == null || a.test_chat_id === '' ? null : (typeof a.test_chat_id === 'string' && SCHED_CHAT_RE.test(a.test_chat_id) ? a.test_chat_id : (() => { throw new Error('Escolha a conversa de teste'); })()),
    };
    if (a.trigger_type === 'sem_resposta' || a.trigger_type === 'entrou_etiqueta') row.wait_minutes = intIn(a.wait_minutes, 1, 525600, 'Espera (minutos)');
    // 2.11.0: "X dias depois da venda" (opcional; até 90 dias)
    if (a.trigger_type === 'venda_registrada' && a.wait_minutes != null && a.wait_minutes !== '' && Number(a.wait_minutes) > 0) row.wait_minutes = intIn(a.wait_minutes, 1, 129600, 'Espera depois da venda (até 90 dias)');
    if (a.trigger_type === 'dia_hora') {
      const days = Array.isArray(a.schedule_days) ? [...new Set(a.schedule_days)] : null;
      if (!days || !days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Escolha pelo menos um dia da semana');
      if (typeof a.schedule_time !== 'string' || !HM_RE.test(a.schedule_time.slice(0, 5))) throw new Error('Escolha a hora');
      row.schedule_days = days.sort((x, y) => x - y);
      row.schedule_time = a.schedule_time.slice(0, 5);
    }
    const conditions = Array.isArray(a.conditions) ? a.conditions : [];
    if (conditions.length > 10) throw new Error('No máximo 10 condições');
    row.conditions = conditions.map(checkCondition);
    const actions = Array.isArray(a.actions) ? a.actions : [];
    if (!actions.length || actions.length > 10) throw new Error('De 1 a 10 ações');
    row.actions = actions.map((x, i) => checkAction(x, i, row.trigger_label_id, source === 'whatsapp'));
    if (!row.actions.some((x) => x.type !== 'parar')) throw new Error('Escolha pelo menos uma ação');
    return row;
  }

  async function fetchAutomations() {
    return autoRest(`wa_automations?select=${await autoCols()}&order=position.asc,created_at.asc`);
  }

  // quem entra numa sequência (sem as exclusões): mudou = ligar de novo
  const startKey = (seq) => { const s = (seq && seq.start) || {}; return [s.type || null, s.origin || null, s.source || null, s.label_id || null, s.wa_label_id || null]; };
  async function saveAutomation({ id, automation, includeExisting = false }) {
    const row = checkAutomation(automation);
    const testChat = row.test_chat_id;
    delete row.test_chat_id;
    if (row.kind === 'sequencia' && !(await automationsV212())) throw new Error(ENGINE_MISSING); // 2.12.0
    if (row.trigger_type === 'venda_registrada' && !(await salesOrigin())) throw new Error(ENGINE_MISSING);
    // 2.5.0: sem a migration 20261104120000, etiqueta do WhatsApp não dá; o resto salva como antes
    if (!(await automationsV25())) {
      if (row.trigger_label_source === 'whatsapp' || row.actions.some((x) => WA_ACTIONS.includes(x.type))) throw new Error(ENGINE_MISSING);
      delete row.trigger_label_source;
      delete row.trigger_wa_label_id;
    }
    // 2.8.8: ativar (ou editar uma ativa trocando gatilho/etiqueta) = vale daqui pra frente
    const v288 = await automationsV288();
    let prev = null;
    if (id !== undefined && id !== null) {
      checkUuid(id, 'Automação inválida');
      const got = await autoRest(`wa_automations?select=${await autoCols()}&id=eq.${id}`);
      if (!got.length) throw new Error('Automação não encontrada');
      prev = got[0];
    }
    const sameTrigger = !!prev && prev.trigger_type === row.trigger_type && (prev.trigger_label_id || null) === (row.trigger_label_id || null)
      && (prev.trigger_wa_label_id || null) === (row.trigger_wa_label_id || null) && (prev.trigger_label_source || 'crm') === (row.trigger_label_source || 'crm')
      // 2.13.0: sequência ligada com outro COMEÇA (outra etiqueta/tipo) = vale daqui pra frente de novo
      && (row.kind !== 'sequencia' || JSON.stringify(startKey(prev.sequence)) === JSON.stringify(startKey(row.sequence)));
    const activating = row.active && (!prev || !prev.active || !sameTrigger);
    if ((activating || testChat) && !v288) throw new Error(ENGINE_MISSING);
    if (v288) {
      row.test_chat_id = testChat;
      if (activating) { row.activated_at = new Date().toISOString(); row.include_existing = includeExisting === true; }
    }
    if (prev) {
      const rows = await autoRest(`wa_automations?id=eq.${id}`, json('PATCH', 'return=representation', row));
      if (!rows.length) throw new Error('Automação não encontrada');
      return { id, activated: activating };
    }
    const last = await autoRest('wa_automations?select=position&order=position.desc&limit=1');
    const position = last.length ? (Number(last[0].position) || 0) + 1 : 0;
    const rows = await autoRest('wa_automations', json('POST', 'return=representation', { ...row, position }));
    return { id: rows[0].id, activated: activating };
  }

  async function setAutomationActive({ id, active, includeExisting = false }) {
    checkUuid(id, 'Automação inválida');
    if (typeof active !== 'boolean') throw new Error('Valor inválido');
    // 2.8.8: ligar = vale daqui pra frente (sem as colunas novas, não deixa ligar)
    if (active && !(await automationsV288())) throw new Error(ENGINE_MISSING);
    // 2.16.3: rascunho incompleto não liga (o painel já bloqueia; aqui é a última barreira)
    if (active) {
      const cur = await autoRest(`wa_automations?select=*&id=eq.${id}`);
      if (cur.length && cur[0].kind === 'sequencia') {
        try { checkSequence(cur[0].sequence); } catch (e) { throw new Error(`Complete a automação antes de ligar (${String(e.message).replace(/^Sequência: /, '')})`); }
      }
    }
    const patchRow = active ? { active, activated_at: new Date().toISOString(), include_existing: includeExisting === true } : { active };
    const rows = await autoRest(`wa_automations?id=eq.${id}`, json('PATCH', 'return=representation', patchRow));
    return { active: rows.length ? rows[0].active : null };
  }

  // 2.8.8: quem já está na etiqueta CRM do gatilho (para avisar e, se confirmar, incluir)
  async function automationExisting({ labelId }) {
    checkUuid(labelId, 'Etiqueta inválida');
    const cols = (await chatIdColumn()) ? 'id,name,phone,chat_id' : 'id,name,phone';
    const rows = await restAll(`wa_contact_labels?select=contact:wa_contacts!inner(${cols})&label_id=eq.${labelId}&order=contact_id.asc`, 5000);
    return rows.map((r) => ({ name: r.contact.name || null, phone: r.contact.phone || null }));
  }

  async function deleteAutomation({ id }) {
    checkUuid(id, 'Automação inválida');
    await autoRest(`wa_automations?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  // Execuções já feitas das automações (para não repetir): "automação:contato:run_key"
  // 2.11.0: quantas pessoas cada automação já atendeu (execuções gravadas; "tirado da automação" não conta)
  async function automationSentCounts({ automationIds }) {
    if (!Array.isArray(automationIds) || automationIds.length > 100) throw new Error('Lista inválida');
    const out = {};
    for (const id of automationIds) {
      checkUuid(id, 'Automação inválida');
      try { out[id] = await countRows(`wa_automation_runs?select=id&automation_id=eq.${id}&run_key=not.like.fora@*`); } catch { out[id] = null; }
    }
    return out;
  }

  // ── 2.12.0: percursos das sequências (wa_sequence_runs) ──
  const SEQ_RUN_COLS = 'id,automation_id,chat_id,contact_id,entry_key,node,status,outcome,wait_started_at,due_at,last_sent_at,skip_wait,branches,version,created_at,updated_at,ended_at';
  async function seqRest(path, init) {
    try { return await rest(path, init); } catch (err) { if (tableMissing(err, ['wa_sequence_runs'])) throw new Error(ENGINE_MISSING); throw err; }
  }
  // percursos ativos das sequências, com as etiquetas CRM de cada conversa (para o "Não enviar")
  async function seqRuns({ automationIds }) {
    if (!Array.isArray(automationIds) || automationIds.length > 100) throw new Error('Lista inválida');
    automationIds.forEach((a) => checkUuid(a, 'Automação inválida'));
    if (!automationIds.length) return [];
    const all = await restAll(`wa_sequence_runs?select=${SEQ_RUN_COLS}&automation_id=in.${inList(automationIds)}&status=eq.ativo&order=id.asc`);
    const byChat = await contactRowsByChats([...new Set(all.map((r) => r.chat_id))]);
    // 2.16.7: o contato do percurso (contact_id) primeiro: a conversa pode ter outro @lid que o chat_id do CRM
    const byId = new Map((await contactsById([...new Set(all.map((r) => r.contact_id).filter(Boolean))])).map((c) => [c.id, c]));
    const contactOf = (r) => (r.contact_id && byId.get(r.contact_id)) || byChat[r.chat_id] || null;
    const runs = await seqDropDuplicates(all, contactOf);
    const ids = [...new Set([...Object.values(byChat), ...byId.values()].map((c) => c.id))];
    const labels = {};
    for (let i = 0; i < ids.length; i += 100) {
      (await restAll(`wa_contact_labels?select=contact_id,label_id&contact_id=in.${inList(ids.slice(i, i + 100))}&order=contact_id.asc,label_id.asc`))
        .forEach((l) => { (labels[l.contact_id] = labels[l.contact_id] || []).push(l.label_id); });
    }
    return runs.map((r) => { const c = contactOf(r); return { ...r, contact: c ? { id: c.id, name: c.name || null, phone: c.phone || null, labelIds: labels[c.id] || [] } : null }; });
  }
  // 2.16.5: a mesma pessoa com dois percursos ativos na mesma régua (um pelo @c.us e outro pelo @lid, troca de id do
  // WhatsApp) fica só com o mais antigo; os outros saem (status 'saiu', outcome 'id_duplicado'), sem mandar nada.
  // 2.16.7: e dois @lid diferentes do mesmo contato (contact_id ou telefone iguais)
  async function seqDropDuplicates(runs, contactOf) {
    const keyOf = (r) => {
      const c = contactOf(r);
      const phone = phoneKey(phoneOfChat(r.chat_id) || (c && c.phone) || null);
      return phone ? `tel:${phone}` : c ? `id:${c.id}` : r.contact_id ? `id:${r.contact_id}` : `chat:${r.chat_id}`;
    };
    const keep = new Map();
    const drop = [];
    [...runs].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id))).forEach((r) => {
      const k = `${r.automation_id}|${keyOf(r)}`;
      if (!keep.has(k)) keep.set(k, r);
      else if (keep.get(k).chat_id !== r.chat_id) drop.push(r); // mesmo id duas vezes (entradas diferentes): não mexe
    });
    if (!drop.length) return runs;
    const gone = new Set();
    for (const r of drop) {
      try { const res = await seqUpdateRun({ id: r.id, version: r.version, patch: { status: 'saiu', outcome: 'id_duplicado' } }); if (res.ok) gone.add(r.id); } catch { /* próximo ciclo */ }
    }
    return runs.filter((r) => !gone.has(r.id));
  }
  // cria os percursos de quem entrou (a mesma entrada nunca duplica)
  async function seqCreateRuns({ items }) {
    if (!Array.isArray(items) || items.length > 500) throw new Error('Lista inválida');
    const rows = items.filter((it) => it && SCHED_CHAT_RE.test(it.chat_id || '') && RUN_KEY_RE.test(it.entry_key || '')).map((it) => ({
      automation_id: checkUuid(it.automation_id, 'Automação inválida'), chat_id: it.chat_id, entry_key: it.entry_key,
      contact_id: it.contact_id ? checkUuid(it.contact_id, 'Contato inválido') : null, node: typeof it.node === 'string' && it.node.length <= 40 ? it.node : null,
      // 2.16.0: created_at = quando a pessoa ENTROU (1ª mensagem do lead, entrada na etiqueta, venda, inscrição); conta o
      // "até X depois de entrar". Sem a hora (ou no futuro): agora, como antes.
      ...(enteredIso(it.entered_at) ? { created_at: enteredIso(it.entered_at) } : {}),
    }));
    const fresh = rows.length ? await seqSamePersonFilter(rows, items) : [];
    if (fresh.length) await seqRest('wa_sequence_runs?on_conflict=automation_id,chat_id,entry_key', json('POST', 'resolution=ignore-duplicates,return=minimal', fresh));
    return { created: fresh.length, skipped: rows.length - fresh.length };
  }
  // 2.16.7: a mesma pessoa em OUTRA conversa (dois @lid, ou @c.us ↔ @lid) já tem percurso nesta régua, ativo ou que
  // terminou por resposta nas últimas 24 h (mesmo contact_id ou mesmo telefone) → não cria outro (mandaria o Follow 1
  // de novo). A mesma conversa segue como antes (a mesma entrada nunca duplica; entrada nova = percurso novo).
  // Também preenche o contact_id que faltava (pelo chat_id / telefone).
  const SEQ_SAME_PERSON_MS = 24 * 3600 * 1000;
  async function seqSamePersonFilter(rows, items) {
    const phoneIn = new Map(items.map((it) => [`${it.automation_id}|${it.chat_id}`, typeof it.phone === 'string' ? it.phone : null]));
    const autoIds = [...new Set(rows.map((r) => r.automation_id))];
    const since = encodeURIComponent(new Date(Date.now() - SEQ_SAME_PERSON_MS).toISOString());
    const old = await restAll(`wa_sequence_runs?select=id,automation_id,chat_id,contact_id&automation_id=in.${inList(autoIds)}&or=(status.eq.ativo,and(outcome.eq.respondeu,ended_at.gte.${since}))&order=id.asc`);
    const byChat = await contactRowsByChats([...new Set([...rows, ...old].map((r) => r.chat_id))]);
    const byId = new Map((await contactsById([...new Set([...rows, ...old].map((r) => r.contact_id).filter(Boolean))])).map((c) => [c.id, c]));
    const person = (r, ph) => {
      const c = (r.contact_id && byId.get(r.contact_id)) || byChat[r.chat_id] || null;
      return { cid: (c && c.id) || r.contact_id || null, tel: phoneKey(phoneOfChat(r.chat_id) || (c && c.phone) || ph || null) };
    };
    const seen = new Map(); // automação → [{ chat, cid, tel }]
    const add = (aid, p) => { if (!seen.has(aid)) seen.set(aid, []); seen.get(aid).push(p); };
    old.forEach((r) => add(r.automation_id, { chat: r.chat_id, ...person(r, null) }));
    const out = [];
    for (const r of rows) {
      const p = person(r, phoneIn.get(`${r.automation_id}|${r.chat_id}`));
      const dup = (seen.get(r.automation_id) || []).some((o) => o.chat !== r.chat_id && ((p.cid && o.cid === p.cid) || (p.tel && o.tel === p.tel)));
      if (dup) continue;
      if (!r.contact_id && p.cid) r.contact_id = p.cid;
      add(r.automation_id, { chat: r.chat_id, ...p });
      out.push(r);
    }
    return out;
  }
  const enteredIso = (ms) => { const t = Number(ms); return Number.isFinite(t) && t > 0 && t <= Date.now() + 60000 ? new Date(t).toISOString() : null; };
  // 2.16.0: entrar à mão numa régua (🔁 / "Adicionar à automação"), no começo ou no meio (plan = E.seqManualPlan):
  // cria o percurso já na etapa escolhida, com created_at = a entrada "de há X tempo". Quem já estava nesta régua sai
  // (entra de novo do ponto escolhido); leaveOthers: sai também das outras réguas ativas.
  async function seqManualEnter({ automationId, chatId, plan, leaveOthers, phone }) {
    checkUuid(automationId, 'Automação inválida');
    if (!SCHED_CHAT_RE.test(chatId || '')) throw new Error('Conversa inválida');
    const p = plan || {};
    if (typeof p.node !== 'string' || !p.node || p.node.length > 40) throw new Error('Etapa inválida');
    if (p.branches !== undefined && (!Array.isArray(p.branches) || p.branches.length > 50)) throw new Error('Caminhos inválidos');
    const autos = await autoRest(`wa_automations?select=id,kind&id=eq.${automationId}`);
    if (!autos.length || autos[0].kind !== 'sequencia') throw new Error('Automação não encontrada');
    const runs = await seqRest(`wa_sequence_runs?select=id,automation_id,version&chat_id=eq.${encodeURIComponent(chatId)}&status=eq.ativo`);
    // 2.16.7: a mesma pessoa nesta régua por OUTRA conversa (outro @lid, ou c.us ↔ lid) também recomeça daqui
    try {
      const same = await seqRest(`wa_sequence_runs?select=id,automation_id,version,chat_id,contact_id&automation_id=eq.${automationId}&status=eq.ativo&chat_id=neq.${encodeURIComponent(chatId)}`);
      if (same.length) {
        const byChat = await contactRowsByChats([chatId, ...same.map((r) => r.chat_id)]);
        const byId = new Map((await contactsById([...new Set(same.map((r) => r.contact_id).filter(Boolean))])).map((c) => [c.id, c]));
        const me = byChat[chatId] || null;
        const myTel = phoneKey(phoneOfChat(chatId) || (me && me.phone) || (typeof phone === 'string' ? phone : null));
        same.forEach((r) => {
          const c = (r.contact_id && byId.get(r.contact_id)) || byChat[r.chat_id] || null;
          const tel = phoneKey(phoneOfChat(r.chat_id) || (c && c.phone) || null);
          if ((me && c && c.id === me.id) || (myTel && tel === myTel)) runs.push(r);
        });
      }
    } catch { /* sem isso: como antes */ }
    let left = 0;
    for (const r of runs) {
      const same = r.automation_id === automationId;
      if (!same && !leaveOthers) continue;
      const res = await seqUpdateRun({ id: r.id, version: r.version, patch: { status: 'saiu', outcome: same ? 'reentrou' : 'outra_regua' } });
      if (res.ok && !same) left++;
    }
    // 2.16.7: sem contato com este chat_id, o do telefone desta conversa (o @lid pode ser outro que o do CRM)
    let found = (await contactsByChats([chatId]))[chatId] || null;
    if (!found && phoneOfChat(chatId) == null && typeof phone === 'string') { try { found = await contactByPhone(phone); } catch { found = null; } }
    const row = {
      automation_id: automationId, chat_id: chatId, entry_key: `manual@${Date.now()}`, contact_id: found ? found.id : null,
      node: p.node, status: 'ativo', version: 0, created_at: enteredIso(p.entered_at) || new Date().toISOString(),
      wait_started_at: Number.isFinite(Number(p.wait_started_at)) && p.wait_started_at != null ? new Date(Number(p.wait_started_at)).toISOString() : null,
      skip_wait: p.skip_wait === true,
      branches: (p.branches || []).map((b) => ({ node: String(b.node).slice(0, 40), result: b.result === 'sim' ? 'sim' : 'nao', at: Number(b.at) || null })),
    };
    const rows = await seqRest('wa_sequence_runs', json('POST', 'return=representation', row));
    return { ok: true, run: rows[0] || null, left };
  }
  // avança um percurso SÓ se ninguém mexeu antes (version): evita envio duplicado entre abas/PCs
  async function seqUpdateRun({ id, version, patch }) {
    checkUuid(id, 'Percurso inválido');
    if (!Number.isInteger(version) || version < 0) throw new Error('Versão inválida');
    const p = patch || {};
    const out = { version: version + 1, updated_at: new Date().toISOString() };
    if (p.node !== undefined) out.node = p.node == null ? null : String(p.node).slice(0, 40);
    if (p.status !== undefined) { if (!['ativo', 'fim', 'saiu'].includes(p.status)) throw new Error('Status inválido'); out.status = p.status; if (p.status !== 'ativo') out.ended_at = new Date().toISOString(); }
    if (p.outcome !== undefined) out.outcome = p.outcome == null ? null : String(p.outcome).slice(0, 30);
    ['wait_started_at', 'due_at', 'last_sent_at'].forEach((k) => { if (p[k] !== undefined) out[k] = p[k] == null ? null : new Date(Number(p[k])).toISOString(); });
    if (p.skip_wait !== undefined) out.skip_wait = p.skip_wait === true;
    if (p.branches !== undefined) { if (!Array.isArray(p.branches) || p.branches.length > 50) throw new Error('Caminhos inválidos'); out.branches = p.branches.map((b) => ({ node: String(b.node).slice(0, 40), result: b.result === 'sim' ? 'sim' : 'nao', at: Number(b.at) || null })); }
    const rows = await seqRest(`wa_sequence_runs?id=eq.${id}&version=eq.${version}`, json('PATCH', 'return=representation', out));
    return { ok: rows.length === 1, run: rows[0] || null };
  }
  // respostas dos clientes (wa_replies, 2.10.0) dessas conversas desde "since"; sem a tabela: nenhuma
  async function seqReplies({ chatIds, since }) {
    const ids = (Array.isArray(chatIds) ? chatIds : []).filter((c) => SCHED_CHAT_RE.test(c || '')).slice(0, 1000);
    const t = Date.parse(since || '');
    if (!ids.length || !Number.isFinite(t)) return {};
    const out = {};
    try {
      for (let i = 0; i < ids.length; i += 100) {
        (await restAll(`wa_replies?select=chat_id,replied_at&chat_id=in.${inList(ids.slice(i, i + 100))}&replied_at=gte.${encodeURIComponent(new Date(t).toISOString())}&order=chat_id.asc,replied_at.asc`))
          .forEach((r) => { (out[r.chat_id] = out[r.chat_id] || []).push(Date.parse(r.replied_at)); });
      }
    } catch { return {}; }
    return out;
  }
  // leads novos (wa_leads, 2.10.0) desde "since" (a ativação)
  async function seqLeads({ since }) {
    const t = Date.parse(since || '');
    if (!Number.isFinite(t)) return [];
    try {
      return await rest(`wa_leads?select=chat_id,phone,first_message_at,origin&first_message_at=gte.${encodeURIComponent(new Date(t).toISOString())}&order=first_message_at.asc&limit=500`);
    } catch { return []; }
  }
  // painel da conversa: em que sequência ela está
  async function seqChatRuns({ chatId }) {
    if (!SCHED_CHAT_RE.test(chatId || '') || !(await automationsV212())) return [];
    const runs = await seqRest(`wa_sequence_runs?select=${SEQ_RUN_COLS}&chat_id=eq.${encodeURIComponent(chatId)}&status=eq.ativo&order=created_at.desc&limit=10`);
    if (!runs.length) return [];
    const autos = await autoRest(`wa_automations?select=id,name,sequence,test_chat_id&id=in.${inList([...new Set(runs.map((r) => r.automation_id))])}`);
    const byId = new Map(autos.map((a) => [a.id, a]));
    return runs.filter((r) => byId.has(r.automation_id)).map((r) => ({ ...r, automation: byId.get(r.automation_id) }));
  }
  // 2.16.7: avisos da régua nesta conversa (últimos 7 dias): a caixa ETIQUETA não achou o contato
  const LABEL_MISS = 'etiqueta não aplicada: contato não encontrado';
  async function seqLabelWarnings({ chatId }) {
    if (!SCHED_CHAT_RE.test(chatId || '')) return [];
    const since = encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString());
    const rows = await engineRest(`wa_send_log?select=source_id,reason,created_at&source=eq.follow&status=eq.pulado&chat_id=eq.${encodeURIComponent(chatId)}&reason=eq.${encodeURIComponent(LABEL_MISS)}&created_at=gte.${since}&order=created_at.desc&limit=5`);
    return rows.map((r) => ({ automation_id: r.source_id || null, reason: r.reason, at: r.created_at }));
  }
  // 2.16.7: abriu a conversa e o telefone dela já tem contato com OUTRO chat_id (o WhatsApp deu outro @lid para a mesma
  // pessoa): o contato passa a apontar para esta conversa (a que a pessoa usa agora). Nunca cria contato.
  async function adoptChatId({ chatId, phone }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) throw new Error('Conversa inválida');
    const ph = phoneOfChat(chatId) || (typeof phone === 'string' ? phone.replace(/\D/g, '') : '');
    if (!/^\d{8,15}$/.test(ph) || !(await chatIdColumn())) return { changed: false };
    if ((await rest(`wa_contacts?select=id&chat_id=eq.${encodeURIComponent(chatId)}&limit=1`)).length) return { changed: false };
    const rows = await contactsByPhones([ph]);
    const c = rows.find((r) => r.phone === ph) || rows[0];
    if (!c || c.chat_id === chatId) return { changed: false };
    await rest(`wa_contacts?id=eq.${c.id}`, json('PATCH', 'return=minimal', { chat_id: chatId }));
    return { changed: true, contactId: c.id, from: c.chat_id || null };
  }
  // 2.16.8: "Pular espera" clicado: dados do banco (iguais em qualquer computador) para a previsão do envio
  // (E.seqSkipForecast): lugar aproximado na fila (percursos ativos prontos para mandar — espera pulada ou prazo
  // vencido —, na ordem em que o motor lê: id), envios automáticos na última hora e hoje, o último envio e o mais
  // antigo da última hora (quando o limite por hora libera) e os envios de hoje desta régua (limite próprio).
  async function seqSkipInfo({ runId, automationId, hourSince, daySince }) {
    checkUuid(runId, 'Percurso inválido');
    checkUuid(automationId, 'Automação inválida');
    const h = Date.parse(hourSince || '');
    const d = Date.parse(daySince || '');
    if (!Number.isFinite(h) || !Number.isFinite(d)) throw new Error('Data inválida');
    const nowIso = encodeURIComponent(new Date().toISOString());
    const ready = await restAll(`wa_sequence_runs?select=id&status=eq.ativo&or=(skip_wait.eq.true,due_at.lte.${nowIso})&order=id.asc`);
    const i = ready.findIndex((r) => r.id === runId);
    const base = `wa_send_log?${AUTO_SOURCES}&status=neq.pulado&created_at=gte.`;
    const hIso = encodeURIComponent(new Date(h).toISOString());
    const [hour, day, last, oldest, seq] = await Promise.all([
      countRows2(base + hIso), countRows2(base + encodeURIComponent(new Date(d).toISOString())), lastSendAt(),
      engineRest(`wa_send_log?select=created_at&${AUTO_SOURCES}&status=neq.pulado&created_at=gte.${hIso}&order=created_at.asc&limit=1`),
      automationSentToday({ automationId, since: new Date(d).toISOString() }),
    ]);
    return {
      position: i >= 0 ? i + 1 : ready.length + 1, ready: ready.length, counts: { hour, day },
      lastSentAt: Date.parse((last && last.at) || '') || null, oldestHourAt: oldest.length ? Date.parse(oldest[0].created_at) || null : null,
      sentTodaySeq: seq ? seq.count : null,
    };
  }
  async function seqRunAction({ id, action }) {
    checkUuid(id, 'Percurso inválido');
    const rows = await seqRest(`wa_sequence_runs?select=id,version&id=eq.${id}&status=eq.ativo`);
    if (!rows.length) throw new Error('A conversa não está mais nesta automação');
    const patch = action === 'sair' ? { status: 'saiu', outcome: 'manual' } : action === 'pular' ? { skip_wait: true } : null;
    if (!patch) throw new Error('Ação inválida');
    const r = await seqUpdateRun({ id, version: rows[0].version, patch });
    if (!r.ok) throw new Error('Mudou agora há pouco: tente de novo');
    return { ok: true };
  }
  // lista: quantos em cada passo agora e quantos saíram por ✅ / ❌
  // 2.16.5: direto do banco (igual em qualquer computador, com ou sem o motor nesta aba). Antes dependia da checagem
  // "o banco tem sequências?" guardada por 30 min: uma falha passageira nela virava "Ninguém entrou ainda". Agora só
  // "sem a tabela" devolve vazio; outro erro sobe (o painel mantém os últimos números).
  async function seqStats({ automationIds }) {
    if (!Array.isArray(automationIds) || automationIds.length > 100) return {};
    automationIds.forEach((a) => checkUuid(a, 'Automação inválida'));
    if (!automationIds.length) return {};
    let runs;
    try {
      runs = await restAll(`wa_sequence_runs?select=automation_id,node,status,outcome&automation_id=in.${inList(automationIds)}&order=id.asc`);
    } catch (err) { if (tableMissing(err, ['wa_sequence_runs'])) return {}; throw err; }
    const out = {};
    runs.forEach((r) => {
      const o = out[r.automation_id] || (out[r.automation_id] = { nodes: {}, active: 0, yes: 0, no: 0, other: 0 });
      if (r.status === 'ativo') { o.active++; o.nodes[r.node || 'inicio'] = (o.nodes[r.node || 'inicio'] || 0) + 1; }
      else if (r.outcome === 'respondeu') o.yes++;
      else if (r.outcome === 'nao_respondeu') o.no++;
      else o.other++;
    });
    return out;
  }

  async function automationRuns({ automationIds, contactIds }) {
    if (!Array.isArray(automationIds) || automationIds.length > 100) throw new Error('Lista inválida');
    automationIds.forEach((a) => checkUuid(a, 'Automação inválida'));
    if (!automationIds.length) return [];
    // 2.4.1: com a lista de contatos, só as execuções deles (filtro no banco, em lotes de 100)
    const base = `wa_automation_runs?select=automation_id,contact_id,run_key&automation_id=in.${inList(automationIds)}`;
    let rows = [];
    if (Array.isArray(contactIds)) {
      if (contactIds.length > 5000) throw new Error('Lista inválida');
      contactIds.forEach((c) => checkUuid(c, 'Contato inválido'));
      const ids = [...new Set(contactIds)];
      for (let i = 0; i < ids.length; i += 100) {
        rows.push(...await autoRestAll(`${base}&contact_id=in.${inList(ids.slice(i, i + 100))}&order=id.asc`));
      }
    } else {
      rows = await autoRestAll(`${base}&order=id.asc`);
    }
    return rows.map((r) => `${r.automation_id}:${r.contact_id}:${r.run_key}`);
  }

  // Reserva: só quem conseguir gravar a linha (unique) executa
  async function automationReserve({ automationId, contactId, runKey }) {
    checkUuid(automationId, 'Automação inválida');
    checkUuid(contactId, 'Contato inválido');
    if (typeof runKey !== 'string' || !RUN_KEY_RE.test(runKey)) throw new Error('Execução inválida');
    const rows = await autoRest('wa_automation_runs?on_conflict=automation_id,contact_id,run_key',
      json('POST', 'resolution=ignore-duplicates,return=representation', { automation_id: automationId, contact_id: contactId, run_key: runKey }));
    return { reserved: rows.length > 0, id: rows.length ? rows[0].id : null };
  }

  // Nada foi enviado (erro antes do envio): libera para tentar de novo mais tarde
  async function automationUnreserve({ id }) {
    checkUuid(id, 'Execução inválida');
    await autoRest(`wa_automation_runs?id=eq.${id}`, { method: 'DELETE' });
    return true;
  }

  // ── 2.5.0: etiqueta do WhatsApp no gatilho ("primeira vez que viu") e "Adicionar à automação" ──
  // wa_native_label_seen: uma linha por conversa + etiqueta nativa. Saiu: removed_at. Voltou depois:
  // a mesma linha recomeça (first_seen_at novo, removed_at vazio) e conta como entrada nova.

  const v25OrMissing = async () => { if (!(await automationsV25())) throw new Error(ENGINE_MISSING); };
  const clipName = (v) => (typeof v === 'string' && v.trim() && !/^[+\d\s().-]+$/.test(v) ? v.trim().replace(/\s+/g, ' ').slice(0, 100) : null);
  function checkChats(list, max) {
    if (!Array.isArray(list) || list.length > max) throw new Error('Lista inválida');
    return list.map((c) => {
      const chatId = c && (c.chatId || c.id);
      if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) throw new Error('Conversa inválida');
      const phone = typeof c.phone === 'string' && /^\d{8,15}$/.test(c.phone) ? c.phone : null; // 2.6.0: telefone de conversa @lid
      const lid = typeof c.lid === 'string' && /^\d+@lid$/.test(c.lid) && c.lid !== chatId ? c.lid : null; // 2.16.5: @lid de um @c.us
      return { chatId, name: clipName(c.name), phone, lid };
    });
  }

  // Conversa sem contato no CRM: cria (telefone pelo id @c.us, ou o nome) e grava chat_id, como já é feito
  async function ensureChatContacts(chats) {
    if (!chats.length) return;
    const found = await contactsByChats(chats.map((c) => c.chatId));
    const hasCol = await chatIdColumn();
    const at = new Date().toISOString();
    const rows = [];
    const keys = new Set();
    chats.forEach((c) => {
      if (found[c.chatId]) return;
      const phone = phoneOfChat(c.chatId) || c.phone || null;
      const key = phone ? `tel:${phone}` : c.name ? nameKey(c.name) : null;
      if (!key || keys.has(key)) return;
      keys.add(key);
      rows.push({ key, name: c.name, phone: phone || null, updated_at: at, ...(hasCol ? { chat_id: c.chatId } : {}) });
    });
    for (let i = 0; i < rows.length; i += 200) {
      await rest('wa_contacts?on_conflict=key', json('POST', 'resolution=ignore-duplicates,return=minimal', rows.slice(i, i + 200)));
    }
    // Já existia só pelo nome (sem telefone e sem conversa): liga a conversa a ele
    if (hasCol) {
      for (const r of rows.filter((x) => !x.phone)) {
        await rest(`wa_contacts?key=${eq(r.key)}&phone=is.null&chat_id=is.null`, json('PATCH', 'return=minimal', { chat_id: r.chat_id }));
      }
    }
  }

  // 2.12.5: "entrou em" de cada conversa na etiqueta nativa (first_seen_at), à prova de falhas:
  //   - entrada CONFIRMADA (a extensão viu a conversa sem a etiqueta e depois com ela, ou a própria extensão pôs a
  //     etiqueta): a hora de agora;
  //   - conversa que já tinha SAÍDO da etiqueta (removed_at) e aparece nela de novo: logo depois da saída vista
  //     (só passa da ativação se a saída foi vista depois de ligar);
  //   - conversa vista pela 1ª vez já com a etiqueta (contato antigo que só carregou agora, ligar a automação):
  //     WA_BASELINE_AT = "já estava" (nunca passa da ativação; "incluir quem já estava" continua valendo).
  const WA_BASELINE_AT = '2000-01-01T00:00:00.000Z';
  async function upsertSeen(labelId, chats, atOf) {
    const now = new Date().toISOString();
    for (let i = 0; i < chats.length; i += 500) {
      await rest('wa_native_label_seen?on_conflict=chat_id,wa_label_id', json('POST', 'resolution=merge-duplicates,return=minimal',
        chats.slice(i, i + 500).map((c) => ({ chat_id: c.chatId, wa_label_id: labelId, first_seen_at: atOf(c), last_seen_at: now, removed_at: null }))));
    }
  }
  async function markGone(labelId, chatIds) {
    const at = new Date().toISOString();
    for (let i = 0; i < chatIds.length; i += 100) {
      await rest(`wa_native_label_seen?wa_label_id=eq.${encodeURIComponent(labelId)}&chat_id=in.${inList(chatIds.slice(i, i + 100))}&removed_at=is.null`,
        json('PATCH', 'return=minimal', { removed_at: at, last_seen_at: at }));
    }
  }
  // hora de entrada de uma conversa nova na lista (sem linha ativa)
  const afterRemoval = (iso) => new Date(Date.parse(iso) + 1000).toISOString();
  const entryAt = (confirmed, removedAt) => (confirmed ? new Date().toISOString() : removedAt ? afterRemoval(removedAt) : WA_BASELINE_AT);
  // 2.16.5: a MESMA pessoa pode aparecer com dois ids (o WhatsApp troca @c.us ↔ @lid). Identifica pelo telefone:
  //   - id canônico = o @lid (o da conversa, ou o que o WA-JS mapeia para o @c.us); sem @lid conhecido, o próprio id;
  //   - outros ids da pessoa = o @c.us do telefone + os @lid de contatos do CRM com esse telefone.
  // Se um outro id da pessoa já tem linha nesta etiqueta (ativa, ou que saiu nas últimas 24 h), NÃO é entrada nova:
  // a linha passa para o id canônico (mantém first_seen_at, "já estava" continua "já estava") e a pessoa conta como presente.
  const SWAP_WINDOW_MS = 24 * 3600 * 1000;
  const MASS_CONFIRMED_MAX = 20; // mais que isto de uma vez na mesma etiqueta: "já estava" (proteção)
  const canonOf = (c) => (/@lid$/.test(c.chatId) ? c.chatId : c.lid || c.chatId);
  const preferLid = (a, b) => (/@lid$/.test(a) ? a : /@lid$/.test(b) ? b : a);
  const phoneOf = (c) => phoneOfChat(c.chatId) || c.phone || null;
  function canonList(list, confirmedOf) {
    const by = new Map();
    list.forEach((c) => {
      const id = canonOf(c);
      const phone = phoneOf(c);
      const prev = by.get(id);
      const alts = new Set(prev ? prev.alts : []);
      if (c.chatId !== id) alts.add(c.chatId);
      if (phone && `${phone}@c.us` !== id) alts.add(`${phone}@c.us`);
      by.set(id, { ...(prev || c), chatId: id, phone: (prev && prev.phone) || phone, name: (prev && prev.name) || c.name, alts, confirmed: !!(prev && prev.confirmed) || !!confirmedOf(c), viaAlt: !!(prev && prev.viaAlt) || c.chatId !== id });
    });
    return [...by.values()];
  }
  // @lid de contatos do CRM com estes telefones (telefone → [chat_id])
  async function lidsByPhones(phones) {
    const out = new Map();
    const list = [...new Set(phones.filter(Boolean))];
    if (!list.length || !(await chatIdColumn())) return out;
    for (let i = 0; i < list.length; i += 100) {
      (await rest(`wa_contacts?select=phone,chat_id&phone=in.${inList(list.slice(i, i + 100))}&chat_id=not.is.null`))
        .forEach((r) => { if (/@lid$/.test(r.chat_id || '')) { if (!out.has(r.phone)) out.set(r.phone, []); out.get(r.phone).push(r.chat_id); } });
    }
    return out;
  }
  async function seenRows(labelId, chatIds) {
    const out = new Map();
    const ids = [...new Set(chatIds)];
    for (let i = 0; i < ids.length; i += 100) {
      (await rest(`wa_native_label_seen?select=chat_id,first_seen_at,removed_at&wa_label_id=eq.${encodeURIComponent(labelId)}&chat_id=in.${inList(ids.slice(i, i + 100))}`))
        .forEach((r) => out.set(r.chat_id, r));
    }
    return out;
  }
  const samePersonRow = (r, t) => !!r && (!r.removed_at || t - Date.parse(r.removed_at) < SWAP_WINDOW_MS);
  // a linha de outro id da mesma pessoa passa para o id canônico (first_seen_at mantido); as dos outros ids saem
  async function moveSeen(labelId, moves) {
    if (!moves.length) return;
    const now = new Date().toISOString();
    for (let i = 0; i < moves.length; i += 500) {
      await rest('wa_native_label_seen?on_conflict=chat_id,wa_label_id', json('POST', 'resolution=merge-duplicates,return=minimal',
        moves.slice(i, i + 500).map((m) => ({ chat_id: m.to, wa_label_id: labelId, first_seen_at: m.first_seen_at, last_seen_at: now, removed_at: null }))));
    }
    const old = [...new Set(moves.flatMap((m) => m.from))];
    for (let i = 0; i < old.length; i += 100) {
      await rest(`wa_native_label_seen?wa_label_id=eq.${encodeURIComponent(labelId)}&chat_id=in.${inList(old.slice(i, i + 100))}`, { method: 'DELETE' });
    }
  }
  // fresh: linhas novas (baseline delas = "já estava"); present: ids canônicos de quem já tinha linha (inclusive por
  // outro id); moved: linhas que mudaram de id; guarded: confirmadas tratadas como "já estava" pela proteção
  async function registerFresh(labelId, list, confirmedOf, { guard = false } = {}) {
    const none = { fresh: [], baseline: 0, present: new Set(), moved: 0, guarded: 0 };
    if (!list.length) return none;
    const people = canonList(list, confirmedOf);
    const byPhone = await lidsByPhones(people.map((p) => p.phone));
    people.forEach((p) => (byPhone.get(p.phone) || []).forEach((l) => { if (l !== p.chatId) p.alts.add(l); }));
    const rows = await seenRows(labelId, people.flatMap((p) => [p.chatId, ...p.alts]));
    const t = Date.now();
    const present = new Set();
    const moves = [];
    const fresh = [];
    const removedOf = new Map();
    people.forEach((p) => {
      const own = rows.get(p.chatId);
      if (own && !own.removed_at) { present.add(p.chatId); return; } // já estava: não muda a data de entrada
      const alias = [...p.alts].map((a) => rows.get(a)).find((r) => samePersonRow(r, t));
      if (alias) {
        // mesma pessoa com outro id: não é entrada nova (fica no @lid, se um dos dois for @lid)
        const to = preferLid(p.chatId, alias.chat_id);
        const from = [p.chatId, ...p.alts].filter((x) => x !== to && rows.has(x));
        if (to !== alias.chat_id || alias.removed_at || from.length) moves.push({ to, from, first_seen_at: alias.first_seen_at });
        present.add(to);
        return;
      }
      // chegou por outro id (ex.: @c.us) e a linha do id canônico saiu há pouco (a própria troca de id): volta igual
      if (own && p.viaAlt && samePersonRow(own, t)) { moves.push({ to: p.chatId, from: [], first_seen_at: own.first_seen_at }); present.add(p.chatId); return; }
      if (own && own.removed_at) removedOf.set(p.chatId, own.removed_at);
      fresh.push(p);
    });
    await moveSeen(labelId, moves);
    if (!fresh.length) return { ...none, present, moved: moves.length };
    // 2.16.5: proteção: muitas entradas "confirmadas" de uma vez na mesma etiqueta = troca de id em massa (sincronização)
    const confirmedN = fresh.filter((p) => p.confirmed).length;
    const guarded = guard && confirmedN > MASS_CONFIRMED_MAX ? confirmedN : 0;
    await ensureChatContacts(fresh);
    const at = new Map(fresh.map((c) => [c.chatId, guarded ? WA_BASELINE_AT : entryAt(c.confirmed, removedOf.get(c.chatId))]));
    await upsertSeen(labelId, fresh, (c) => at.get(c.chatId));
    return { fresh, baseline: [...at.values()].filter((x) => x === WA_BASELINE_AT).length, present, moved: moves.length, guarded };
  }

  // Eventos chat.update_label (add/remove) que a aba com a trava juntou, em ordem. confirmed = a ponte viu a conversa
  // sem a etiqueta antes (ou a extensão pôs). Uma saída no lote também confirma a volta.
  async function nativeLabelEvents({ events }) {
    await v25OrMissing();
    if (!Array.isArray(events) || events.length > 200) throw new Error('Lista inválida');
    const last = new Map();
    events.forEach((e) => {
      const [c] = checkChats([e], 1);
      const labelId = checkWaLabel(e && e.labelId, 'Etiqueta inválida');
      if (!['add', 'remove'].includes(e.type)) throw new Error('Evento inválido');
      const k = `${labelId}|${c.chatId}`;
      const prev = last.get(k);
      const confirmed = e.type === 'add' && (e.confirmed === true || !!(prev && (prev.type === 'remove' || prev.confirmed)));
      last.set(k, { ...c, labelId, type: e.type, confirmed });
    });
    let added = 0;
    let removed = 0;
    let baseline = 0;
    let moved = 0;
    const guarded = [];
    const labels = [...new Set([...last.values()].map((e) => e.labelId))];
    for (const labelId of labels) {
      const evs = [...last.values()].filter((e) => e.labelId === labelId);
      const adds = evs.filter((e) => e.type === 'add');
      let gone = evs.filter((e) => e.type === 'remove').map((e) => e.chatId);
      if (adds.length) {
        const r = await registerFresh(labelId, adds, (c) => c.confirmed, { guard: true });
        added += r.fresh.length - r.baseline;
        baseline += r.baseline;
        moved += r.moved;
        if (r.guarded) guarded.push({ labelId, count: r.guarded });
        // 2.16.5: saída de um id e entrada de outro da mesma pessoa no mesmo lote = troca de id, não saída
        const here = new Set([...r.present, ...r.fresh.map((c) => c.chatId)]);
        gone = gone.filter((id) => !here.has(id));
      }
      if (gone.length) { await markGone(labelId, gone); removed += gone.length; }
    }
    return { added, removed, baseline, moved, guarded };
  }

  // Varredura de uma etiqueta nativa: quem está nela agora (lista do WhatsApp Web). Quem aparece sem linha ativa
  // NUNCA conta como entrada de agora (não foi visto entrando): "já estava", ou logo depois da saída que foi vista.
  // Quem saiu ganha removed_at (só com a lista completa).
  async function nativeLabelSweep({ labelId, chats, complete }) {
    await v25OrMissing();
    checkWaLabel(labelId, 'Etiqueta inválida');
    const list = checkChats(chats, 5000);
    // 2.16.5: compara pelo id canônico (o @lid, quando conhecido); qualquer id da pessoa na lista conta como presente
    const current = new Map(list.map((c) => [canonOf(c), c]));
    const ids = new Set(list.flatMap((c) => [c.chatId, canonOf(c), ...(phoneOf(c) ? [`${phoneOf(c)}@c.us`] : [])]));
    const rows = await restAll(`wa_native_label_seen?select=chat_id&wa_label_id=eq.${encodeURIComponent(labelId)}&removed_at=is.null&order=chat_id.asc`);
    const active = new Set(rows.map((r) => r.chat_id));
    const candidates = [...current.entries()].filter(([id]) => !active.has(id)).map(([, c]) => c);
    const r = await registerFresh(labelId, candidates, () => false);
    const here = new Set([...ids, ...r.present, ...r.fresh.map((c) => c.chatId)]);
    const gone = complete === true ? [...active].filter((id) => !here.has(id)) : [];
    if (gone.length) await markGone(labelId, gone);
    return { added: r.fresh.length - r.baseline, removed: gone.length, total: current.size, baseline: r.baseline, moved: r.moved };
  }

  // 2.12.5: ao ligar (ou trocar o gatilho/etiqueta): TODAS as conversas que estão na etiqueta agora ficam
  // registradas como "já estavam". Devolve quantas estão na etiqueta e quantas foram registradas agora.
  async function nativeLabelBaseline({ labelId, chats }) {
    await v25OrMissing();
    checkWaLabel(labelId, 'Etiqueta inválida');
    const list = checkChats(chats, 5000);
    const r = await registerFresh(labelId, list, () => false);
    return { total: list.length, registered: r.fresh.length };
  }

  // 2.12.5: "ignorados por já estarem na etiqueta": quem está na etiqueta agora e entrou antes de ligar
  async function nativeLabelIgnored({ items }) {
    await v25OrMissing();
    if (!Array.isArray(items) || items.length > 100) throw new Error('Lista inválida');
    const out = {};
    for (const it of items) {
      const id = checkUuid(it && it.automationId, 'Automação inválida');
      const labelId = checkWaLabel(it.labelId, 'Etiqueta inválida');
      const t = Date.parse(it.activatedAt || '');
      if (!Number.isFinite(t)) continue;
      out[id] = await countRows(`wa_native_label_seen?wa_label_id=eq.${encodeURIComponent(labelId)}&removed_at=is.null&first_seen_at=lt.${encodeURIComponent(new Date(t).toISOString())}`);
    }
    return out;
  }

  const contactCols = async () => ((await chatIdColumn()) ? 'id,name,phone,chat_id' : 'id,name,phone');
  const blankCandidate = (r, chatId = null) => ({ id: r.id, name: r.name || null, phone: r.phone || null, chat_id: r.chat_id || chatId || null, labelIds: [], links: [], waSeen: {}, enrolled: {}, enrollmentIds: {} });
  async function contactsById(ids) {
    const out = [];
    const cols = await contactCols();
    for (let i = 0; i < ids.length; i += 100) out.push(...await rest(`wa_contacts?select=${cols}&id=in.${inList(ids.slice(i, i + 100))}`));
    return out;
  }

  // Contatos completos (id, nome, telefone, chat_id) de um lote de conversas, numa leitura (+ telefone se faltar)
  async function contactRowsByChats(chatIds) {
    const out = {};
    const ids = [...new Set(chatIds.filter((c) => typeof c === 'string' && SCHED_CHAT_RE.test(c)))];
    const hasCol = await chatIdColumn();
    const cols = await contactCols();
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      if (hasCol) (await rest(`wa_contacts?select=${cols}&chat_id=in.${inList(part)}`)).forEach((r) => { out[r.chat_id] = r; });
      const phones = part.filter((c) => !out[c]).map(phoneOfChat).filter(Boolean);
      if (phones.length) (await rest(`wa_contacts?select=${cols}&phone=in.${inList(phones)}`)).forEach((r) => { const k = `${r.phone}@c.us`; if (!out[k]) out[k] = r; });
    }
    return out;
  }

  // 2.16.7: variações do telefone (com e sem o 55 do Brasil) e o contato com ele (o de número igual primeiro)
  const phoneVariants = (ph) => {
    const d = String(ph || '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(d)) return [];
    return [...new Set([d, /^55\d{10,11}$/.test(d) ? d.slice(2) : /^\d{10,11}$/.test(d) ? `55${d}` : d])];
  };
  async function contactsByPhones(phones) {
    const vs = [...new Set(phones.flatMap(phoneVariants))];
    const out = [];
    const cols = await contactCols();
    for (let i = 0; i < vs.length; i += 100) out.push(...await rest(`wa_contacts?select=${cols}&phone=in.${inList(vs.slice(i, i + 100))}&order=id.asc`));
    return out;
  }
  const phoneKey = (ph) => { const v = phoneVariants(ph); return v.length ? v.find((x) => /^55\d{10,11}$/.test(x)) || v[0] : null; };
  async function contactByPhone(ph) {
    const rows = await contactsByPhones([ph]);
    return rows.find((r) => r.phone === String(ph).replace(/\D/g, '')) || rows[0] || null;
  }

  // Contatos das conversas que estão nas etiquetas nativas dos gatilhos (com waSeen = "entrou em")
  async function nativeLabelCandidates({ waLabelIds }) {
    await v25OrMissing();
    if (!Array.isArray(waLabelIds) || !waLabelIds.length || waLabelIds.length > 50) throw new Error('Lista inválida');
    waLabelIds.forEach((l) => checkWaLabel(l, 'Etiqueta inválida'));
    const seen = await restAll(`wa_native_label_seen?select=chat_id,wa_label_id,first_seen_at&wa_label_id=in.${inList(waLabelIds)}&removed_at=is.null&order=chat_id.asc,wa_label_id.asc`, 20000);
    const chatIds = [...new Set(seen.map((r) => r.chat_id))];
    if (!chatIds.length) return [];
    let byChat = await contactRowsByChats(chatIds);
    const missing = chatIds.filter((c) => !byChat[c]);
    if (missing.length) {
      await ensureChatContacts(missing.map((chatId) => ({ chatId, name: null })));
      byChat = { ...byChat, ...(await contactRowsByChats(missing)) };
    }
    const byId = new Map();
    seen.forEach((r) => {
      const c = byChat[r.chat_id];
      if (!c) return;
      if (!byId.has(c.id)) byId.set(c.id, blankCandidate(c, r.chat_id));
      const x = byId.get(c.id);
      x.waSeen[r.wa_label_id] = r.first_seen_at;
      if (!x.chat_id) x.chat_id = r.chat_id;
    });
    await addContactLinks(byId);
    return [...byId.values()];
  }

  async function activeEnrollments({ automationIds }) {
    await v25OrMissing();
    if (!Array.isArray(automationIds) || automationIds.length > 100) throw new Error('Lista inválida');
    automationIds.forEach((a) => checkUuid(a, 'Automação inválida'));
    if (!automationIds.length) return [];
    return restAll(`wa_automation_enrollments?select=id,automation_id,contact_id,chat_id,enrolled_at&removed_at=is.null&automation_id=in.${inList(automationIds)}&order=id.asc`, 20000);
  }

  // Contatos inscritos à mão (enrolled = { automação: enrolled_at })
  async function enrollmentCandidates({ enrollments }) {
    await v25OrMissing();
    if (!Array.isArray(enrollments) || enrollments.length > 20000) throw new Error('Lista inválida');
    const list = enrollments.map((e) => ({
      id: checkUuid(e && e.id, 'Inscrição inválida'), automation_id: checkUuid(e.automation_id, 'Automação inválida'),
      contact_id: checkUuid(e.contact_id, 'Contato inválido'), enrolled_at: typeof e.enrolled_at === 'string' ? e.enrolled_at : null,
      chat_id: typeof e.chat_id === 'string' && SCHED_CHAT_RE.test(e.chat_id) ? e.chat_id : null,
    }));
    if (!list.length) return [];
    const byId = new Map((await contactsById([...new Set(list.map((e) => e.contact_id))])).map((c) => [c.id, blankCandidate(c)]));
    list.forEach((e) => {
      const c = byId.get(e.contact_id);
      if (!c || !e.enrolled_at) return;
      c.enrolled[e.automation_id] = e.enrolled_at;
      c.enrollmentIds[e.automation_id] = e.id;
      if (!c.chat_id && e.chat_id) c.chat_id = e.chat_id;
    });
    await addContactLinks(byId);
    return [...byId.values()];
  }

  // "Adicionar à automação" (botão 🔁): o contato da conversa entra a partir de AGORA. Cria o contato se preciso.
  async function enrollContact({ automationId, identity, chatId, name }) {
    await v25OrMissing();
    checkUuid(automationId, 'Automação inválida');
    const chat = typeof chatId === 'string' && SCHED_CHAT_RE.test(chatId) ? chatId : null;
    let contactId = null;
    if (identity) {
      const id = checkIdentity({ ...identity, chatId: identity.chatId || chat });
      const contact = await ensureContact(id);
      if (id.chatId) await rememberChatId(contact, id.chatId).catch(() => {});
      contactId = contact && contact.id;
    } else if (chat) {
      await ensureChatContacts([{ chatId: chat, name: clipName(name) }]);
      const found = (await contactsByChats([chat]))[chat];
      contactId = found ? found.id : null;
    }
    if (!contactId) throw new Error('Não achei o contato desta conversa');
    const autos = await autoRest(`wa_automations?select=id,trigger_type&id=eq.${automationId}`);
    if (!autos.length) throw new Error('Automação não encontrada');
    if (autos[0].trigger_type === 'venda_registrada') throw new Error('"Venda registrada" não aceita inscrição manual');
    const open = await rest(`wa_automation_enrollments?select=id,enrolled_at&automation_id=eq.${automationId}&contact_id=eq.${contactId}&removed_at=is.null`);
    if (open.length) return { enrolled: false, already: true, contactId, id: open[0].id, enrolled_at: open[0].enrolled_at };
    try {
      const rows = await rest('wa_automation_enrollments', json('POST', 'return=representation',
        { automation_id: automationId, contact_id: contactId, chat_id: chat, enrolled_at: new Date().toISOString() }));
      return { enrolled: true, contactId, id: rows[0].id, enrolled_at: rows[0].enrolled_at };
    } catch (err) {
      // Outra aba inscreveu no mesmo instante (índice único das inscrições ativas)
      if (/^Supabase 409:/.test(err.message)) return { enrolled: false, already: true, contactId };
      throw err;
    }
  }

  // "Tirar desta automação": encerra a inscrição e/ou marca a entrada atual pela etiqueta como "não rodar"
  async function leaveAutomation({ automationId, contactId, enrollmentId, entryKey }) {
    await v25OrMissing();
    checkUuid(automationId, 'Automação inválida');
    checkUuid(contactId, 'Contato inválido');
    let done = false;
    if (enrollmentId) {
      checkUuid(enrollmentId, 'Inscrição inválida');
      await rest(`wa_automation_enrollments?id=eq.${enrollmentId}&automation_id=eq.${automationId}&removed_at=is.null`,
        json('PATCH', 'return=minimal', { removed_at: new Date().toISOString() }));
      done = true;
    }
    if (entryKey !== undefined && entryKey !== null) {
      const runKey = `fora@${entryKey}`;
      if (typeof entryKey !== 'string' || !RUN_KEY_RE.test(runKey)) throw new Error('Entrada inválida');
      await autoRest('wa_automation_runs?on_conflict=automation_id,contact_id,run_key',
        json('POST', 'resolution=ignore-duplicates,return=minimal', { automation_id: automationId, contact_id: contactId, run_key: runKey }));
      done = true;
    }
    if (!done) throw new Error('Nada para tirar');
    return { left: true };
  }

  // Tela da conversa: o contato (sem criar), etiquetas CRM, etiquetas nativas vistas, inscrições e execuções
  async function chatAutomationState({ identity, chatId }) {
    const chat = typeof chatId === 'string' && SCHED_CHAT_RE.test(chatId) ? chatId : null;
    const v25 = await automationsV25();
    let ref = null;
    if (identity) {
      const found = await findContact(checkIdentity(identity));
      if (found && !found.promotable) ref = found;
    }
    if (!ref && chat) ref = (await contactsByChats([chat]))[chat] || null;
    const waSeen = {};
    if (v25 && chat) {
      const rows = await rest(`wa_native_label_seen?select=wa_label_id,first_seen_at&chat_id=eq.${encodeURIComponent(chat)}&removed_at=is.null`);
      rows.forEach((r) => { waSeen[r.wa_label_id] = r.first_seen_at; });
    }
    if (!ref) return { v25, contact: null, waSeen, ranKeys: [] };
    const [c] = await contactsById([ref.id]);
    if (!c) return { v25, contact: null, waSeen, ranKeys: [] };
    const byId = await addContactLinks(new Map([[c.id, blankCandidate(c, chat)]]));
    const contact = byId.get(c.id);
    contact.waSeen = waSeen;
    if (v25) {
      const enr = await rest(`wa_automation_enrollments?select=id,automation_id,enrolled_at&contact_id=eq.${c.id}&removed_at=is.null`);
      enr.forEach((e) => { contact.enrolled[e.automation_id] = e.enrolled_at; contact.enrollmentIds[e.automation_id] = e.id; });
    }
    const runs = await autoRestAll(`wa_automation_runs?select=automation_id,contact_id,run_key&contact_id=eq.${c.id}&order=id.asc`);
    return { v25, contact, waSeen, ranKeys: runs.map((r) => `${r.automation_id}:${r.contact_id}:${r.run_key}`) };
  }

  // ── Mensagem rápida que etiqueta (2.1.0) ──
  // Depois que a mensagem INTEIRA saiu: põe/tira o contato das etiquetas CRM do item.
  // Acha o contato pelo id, pela conversa aberta (identity) ou pelo id da conversa; cria se preciso.
  async function applySendLabels({ addLabelId, removeLabelId, removeAll = false, contactId, identity, chatId, name }) {
    const add = addLabelId == null || addLabelId === '' ? null : checkUuid(addLabelId, 'Etiqueta inválida');
    const remove = removeLabelId == null || removeLabelId === '' ? null : checkUuid(removeLabelId, 'Etiqueta inválida');
    const all = removeAll === true;
    if (!add && !remove && !all) return { applied: false };
    let contact = null;
    if (contactId) {
      contact = { id: checkUuid(contactId, 'Contato inválido') };
    } else if (identity) {
      const id = checkIdentity(identity);
      contact = await ensureContact(id);
      if (id.chatId) await rememberChatId(contact, id.chatId).catch(() => {});
    } else if (typeof chatId === 'string' && SCHED_CHAT_RE.test(chatId)) {
      const found = (await contactsByChats([chatId]))[chatId];
      if (found) contact = { id: found.id };
      else {
        const phone = phoneOfChat(chatId);
        const nm = typeof name === 'string' && name.trim() && !/^[+\d\s().-]+$/.test(name) ? name.trim().replace(/\s+/g, ' ').slice(0, 100) : null;
        if (phone) contact = await ensureContact({ key: `tel:${phone}`, phone, name: nm });
        else if (nm) contact = await ensureContact({ key: nameKey(nm), phone: null, name: nm });
        if (contact) await rememberChatId(contact, chatId).catch(() => {});
      }
    }
    if (!contact) return { applied: false };
    if (all) {
      // 2.8.6: tira de todas as etiquetas CRM, menos a que vai colocar e a "Não enviar" (bloqueio do motor)
      const now = await labelIdsOf(contact.id);
      const keep = new Set([add].filter(Boolean));
      if (now.length) {
        const rows = await rest(`wa_labels?select=id,name&id=in.(${now.join(',')})`);
        rows.filter((l) => isNoSendName(l.name)).forEach((l) => keep.add(l.id));
      }
      const out = now.filter((x) => !keep.has(x));
      if (out.length) await rest(`wa_contact_labels?contact_id=eq.${contact.id}&label_id=in.(${out.join(',')})`, { method: 'DELETE' });
    } else if (remove) await rest(`wa_contact_labels?contact_id=eq.${contact.id}&label_id=eq.${remove}`, { method: 'DELETE' });
    if (add) await followAdd({ contactId: contact.id, labelId: add });
    return { applied: true, contactId: contact.id, labelIds: await labelIdsOf(contact.id) };
  }

  // 2.8.6: "Não enviar" (com ou sem acento/maiúsculas) nunca sai pelo "tirar de todas"
  const isNoSendName = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'nao enviar';

  // Nome salvo no CRM para o contato da conversa aberta (para o {nome})
  async function getContactName(identity) {
    const found = await findContact(checkIdentity(identity));
    if (!found) return { name: null };
    const rows = await rest(`wa_contacts?select=name&id=eq.${found.id}`);
    return { name: rows.length ? rows[0].name || null : null };
  }

  // ── Venda pela conversa (2.3.0) ──
  // Grava nas tabelas do ERP EXATAMENTE como a tela "Nova Venda" (src/pages/Sales.tsx): sales,
  // sale_items, sale_accessories, status 'em_separacao', estoque baixado na criação (como o ERP) e o
  // Tiny avisado pela mesma Edge Function. Nunca grava finalized_at (o trigger do banco faz isso ao
  // finalizar no ERP). Os cálculos ficam em sale-calc.js (cópia dos do ERP). Só a pedido do clique.

  const SALE = () => root.TspSale;
  const salesOrigin = () => probe('sales.wa_chat_id', () => hasColumn('sales', 'wa_chat_id'));
  const FEE_KEY_RE = /^fee_(vm|ea)_(debit|credit_\d{1,2})$|^fee_link_(vm|ea)_credit_\d{1,2}$|^fee_link_start_date$/; // 2.6.1/2.6.2: + taxas e data do link
  const clip = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
  const clipText = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const numIn = (v, min, max, what) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${what}: valor inválido`);
    return Math.round(n * 100) / 100;
  };

  async function feeConfig() {
    const rows = await rest('system_config?select=key,value');
    return Object.fromEntries(rows.filter((r) => FEE_KEY_RE.test(r.key)).map((r) => [r.key, r.value]));
  }

  // Listas do ERP para o formulário (produtos com estoque, preço e custo, acessórios, motoboys, fornecedores,
  // cidades, bairros, taxas)
  async function erpCatalog() {
    const [products, accessories, motoboys, suppliers, cities, neighborhoods, fees, originAvailable] = await Promise.all([
      rest('products?select=id,model,color,category,price,cost,current_stock,created_at&order=model.asc&limit=5000'),
      rest('accessories?select=id,name,cost,created_at&order=name.asc&limit=2000'),
      rest('motoboys?select=id,name&order=name.asc'),
      rest('suppliers?select=id,name&order=name.asc&limit=2000').catch(() => []), // 2.12.3
      rest('cities?select=id,name&order=name.asc&limit=5000'),
      rest('neighborhoods?select=id,name&order=name.asc&limit=10000'),
      feeConfig(),
      salesOrigin(),
    ]);
    return { products, accessories, motoboys, suppliers, cities, neighborhoods, fees, originAvailable, erpUrl: (root.WA_CONFIG && root.WA_CONFIG.ERP_URL) || null };
  }

  // Cidade/bairro novos entram na lista do ERP (o ERP faz o mesmo ao salvar a venda)
  async function ensurePlace(table, name) {
    if (!name) return;
    const rows = await rest(`${table}?select=id,name`);
    if (rows.some((r) => String(r.name).toLowerCase() === name.toLowerCase())) return;
    try {
      await rest(table, json('POST', 'return=minimal', { name }));
    } catch (err) {
      if (!/duplicate|23505|409/.test(err.message)) throw err;
    }
  }

  // 2.12.3: a venda chega como a tela "Nova Venda" do ERP: data da venda, produtos com custo (editável),
  // acessórios com custo, itens manuais, CPF, fornecedor (ou um por smartwatch), várias formas de pagamento.
  const SALE_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const realDay = (d) => SALE_DAY_RE.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
  function checkPayments(s, S) {
    const methods = S.PAYMENT_METHODS.map(([k]) => k);
    // pedido antigo (uma forma só): como o estado inicial do ERP, valor 0
    const list = Array.isArray(s.payments) ? s.payments
      : s.payment_method ? [{ method: s.payment_method, card_brand: s.card_brand, installments: s.installments, amount: 0 }] : [];
    if (!list.length || list.length > 6) throw new Error('Escolha a forma de pagamento');
    return list.map((pm, i) => {
      const p = pm || {};
      if (!methods.includes(p.method)) throw new Error(`Forma de pagamento ${i + 1} inválida`);
      const card = S.CARD_METHODS.includes(p.method);
      const out = {
        method: p.method,
        card_brand: card && S.CARD_BRANDS.some(([k]) => k === p.card_brand) ? p.card_brand : '',
        installments: S.INSTALLMENT_METHODS.includes(p.method) ? intIn(Number(p.installments) || 0, 0, 12, 'Parcelas') : 0,
        amount: numIn(p.amount ?? 0, 0, 1000000, `Valor da forma de pagamento ${i + 1}`),
      };
      if (p.net_amount != null && p.net_amount !== '') out.net_amount = numIn(p.net_amount, 0, 1000000, `Valor líquido da forma de pagamento ${i + 1}`);
      return out;
    });
  }

  function checkSaleInput(s) {
    const S = SALE();
    const deliveryTypes = S.DELIVERY_TYPES.map(([k]) => k);
    if (!deliveryTypes.includes(s.delivery_type)) throw new Error('Tipo de entrega inválido');
    const payments = checkPayments(s, S);
    const rawItems = Array.isArray(s.items) ? s.items : [];
    const rawManual = Array.isArray(s.manual_items) ? s.manual_items : [];
    if (rawItems.length > 30 || rawManual.length > 30) throw new Error('Itens demais');
    const merged = new Map();
    rawItems.forEach((it, i) => {
      const id = checkUuid(it && it.product_id, `Produto ${i + 1} inválido`);
      const quantity = intIn(Number(it.quantity), 1, 999, `Quantidade do produto ${i + 1}`);
      const unit_price = numIn(it.unit_price, 0, 1000000, `Preço do produto ${i + 1}`);
      const unit_cost = it.unit_cost == null || it.unit_cost === '' ? null : numIn(it.unit_cost, 0, 1000000, `Custo do produto ${i + 1}`);
      // Como o ERP: o mesmo produto de novo soma na quantidade
      if (merged.has(id)) merged.get(id).quantity += quantity;
      else merged.set(id, { product_id: id, quantity, unit_price, unit_cost });
    });
    const accs = Array.isArray(s.accessories) ? s.accessories : [];
    if (accs.length > 30) throw new Error('Acessórios demais');
    const accessories = accs.map((a, i) => ({
      accessory_id: checkUuid(a && a.accessory_id, `Acessório ${i + 1} inválido`),
      quantity: intIn(Number(a.quantity), 1, 999, `Quantidade do acessório ${i + 1}`),
      cost: a.cost == null || a.cost === '' ? null : numIn(a.cost, 0, 1000000, `Custo do acessório ${i + 1}`),
    }));
    const manualItems = rawManual.map((m, i) => {
      const name = clip(m && m.name, 100);
      if (!name) throw new Error(`Nome do item manual ${i + 1}`);
      return { name, price: numIn(m.price, 0, 1000000, `Preço do item "${name}"`), cost: numIn(m.cost ?? 0, 0, 1000000, `Custo do item "${name}"`), quantity: intIn(Number(m.quantity), 1, 999, `Quantidade do item "${name}"`) };
    });
    const cpf = S.cleanCpf(s.customer_cpf).slice(0, 11);
    const day = typeof s.sale_date === 'string' && realDay(s.sale_date) ? s.sale_date : S.todayInBrazil();
    const form = {
      sale_date: day,
      customer_name: clip(s.customer_name, 100) || '',
      customer_phone: clip(s.customer_phone, 30),
      customer_cpf: cpf || '',
      address_street: clip(s.address_street, 200),
      address_number: clip(s.address_number, 30),
      address_complement: clip(s.address_complement, 200),
      city: clip(s.city, 80) || '',
      neighborhood: clip(s.neighborhood, 80) || '',
      state: (clip(s.state, 2) || '').toUpperCase() || null,
      zip_code: clip(String(s.zip_code == null ? '' : s.zip_code).replace(/\D/g, ''), 8),
      delivery_type: s.delivery_type,
      motoboy_id: s.delivery_type === 'motoboy' && s.motoboy_id ? checkUuid(s.motoboy_id, 'Motoboy inválido') : null,
      delivery_fee: s.delivery_type === 'motoboy' ? numIn(s.delivery_fee ?? S.DEFAULT_DELIVERY_FEE, 0, 10000, 'Taxa de entrega') : 0,
      delivery_cost: s.delivery_type === 'correios' ? numIn(s.delivery_cost ?? 0, 0, 10000, 'Custo Correios') : 0,
      delivery_notes: clipText(s.delivery_notes, 1000),
      payment_status: s.payment_status === 'pago' ? 'pago' : 'a_cobrar',
    };
    const items = [...merged.values()];
    // mesmas validações do ERP (custo ainda não importa aqui)
    const err = S.validateSale({ form, items, manualItems, payments });
    if (err) throw new Error(err);
    const suppliers = {
      id: s.supplier_id ? checkUuid(s.supplier_id, 'Fornecedor inválido') : null,
      name: clip(s.supplier_name, 100),
      perItem: {},
    };
    if (s.item_suppliers && typeof s.item_suppliers === 'object') {
      Object.entries(s.item_suppliers).slice(0, 30).forEach(([pid, sid]) => { if (merged.has(pid) && sid) suppliers.perItem[pid] = checkUuid(sid, 'Fornecedor inválido'); });
    }
    const ad = s.ad && typeof s.ad === 'object' ? s.ad : null;
    const extra = {
      wa_chat_id: typeof s.wa_chat_id === 'string' && SCHED_CHAT_RE.test(s.wa_chat_id) ? s.wa_chat_id : null,
      ad: ad ? { title: clip(ad.title, 300), source: clip(ad.platform || ad.sourceType, 60), url: typeof ad.url === 'string' && /^https?:\/\/\S{1,500}$/.test(ad.url) ? ad.url : null } : null,
    };
    return { form, items, accessories, manualItems, payments, suppliers, extra };
  }

  // 2.12.3: origem automática: anúncio se a conversa tem anúncio registrado (wa_ad_attribution) ou se o
  // WhatsApp mostrou o anúncio nas mensagens; senão orgânico
  async function saleOrigin(chatId, seen) {
    let row = null;
    if (chatId) {
      try { row = (await rest(`${AD_TABLE}?select=ad_title,source_app,source_url&chat_id=eq.${encodeURIComponent(chatId)}&limit=1`))[0] || null; } catch { row = null; }
    }
    if (row) return { origin: 'anuncio', ad_source: clip(row.source_app, 60), ad_title: clip(row.ad_title, 300), ad_url: typeof row.source_url === 'string' && /^https?:\/\/\S{1,500}$/.test(row.source_url) ? row.source_url : null };
    if (seen) return { origin: 'anuncio', ad_source: seen.source, ad_title: seen.title, ad_url: seen.url };
    return { origin: 'organico', ad_source: null, ad_title: null, ad_url: null };
  }

  // Fornecedor como o ERP: 2+ smartwatches → o do 1º smartwatch; senão o escolhido, ou pelo nome (cria se não existir)
  async function resolveSupplier(sup) {
    if (sup.id) return sup.id;
    if (!sup.name) return null;
    const rows = await rest('suppliers?select=id,name&limit=5000');
    const found = rows.find((r) => String(r.name).toLowerCase() === sup.name.toLowerCase());
    if (found) return found.id;
    const created = await rest('suppliers', json('POST', 'return=representation', { name: sup.name }));
    return created[0].id;
  }

  async function createSaleFromChat({ sale }) {
    const S = SALE();
    const { form, items, accessories, manualItems, payments, suppliers, extra } = checkSaleInput(sale || {});
    // Dados frescos do banco: categoria (volumes/fornecedor), custo padrão, estoque e Tiny do produto; custo do acessório
    const products = items.length ? await rest(`products?select=id,model,color,category,price,cost,current_stock,tiny_id&id=in.${inList(items.map((i) => i.product_id))}`) : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    items.forEach((it) => { if (!byId.has(it.product_id)) throw new Error('Produto não encontrado'); });
    const accRows = accessories.length ? await rest(`accessories?select=id,name,cost&id=in.${inList(accessories.map((a) => a.accessory_id))}`) : [];
    const accById = new Map(accRows.map((a) => [a.id, a]));
    accessories.forEach((a) => { if (!accById.has(a.accessory_id)) throw new Error('Acessório não encontrado'); });
    const cfg = await feeConfig();
    // custo do item: o da tela (o ERP preenche com o custo do produto e deixa editar)
    const calcItems = items.map((it) => ({ product_id: it.product_id, quantity: it.quantity, unit_price: it.unit_price, unit_cost: it.unit_cost != null ? it.unit_cost : Number(byId.get(it.product_id).cost) || 0, category: byId.get(it.product_id).category }));
    const calcAcc = accessories.map((a) => ({ accessory_id: a.accessory_id, quantity: a.quantity, cost: a.cost != null ? a.cost : Number(accById.get(a.accessory_id).cost) || 0 }));
    const multi = S.isMultiSupplier(calcItems);
    const supplierId = multi ? null : await resolveSupplier(suppliers);
    await ensurePlace('cities', form.city);
    await ensurePlace('neighborhoods', form.neighborhood);
    const { row, saleItems, saleAccessories } = S.buildSale({ form, items: calcItems, accessories: calcAcc, manualItems, payments, cfg, supplierId, itemSuppliers: suppliers.perItem });
    if (await salesOrigin()) Object.assign(row, { wa_chat_id: extra.wa_chat_id }, await saleOrigin(extra.wa_chat_id, extra.ad));
    const created = await rest('sales', json('POST', 'return=representation', row));
    const saleId = created[0].id;
    try {
      if (saleItems.length) await rest('sale_items', json('POST', 'return=minimal', saleItems.map((x) => ({ sale_id: saleId, ...x }))));
      if (saleAccessories.length) await rest('sale_accessories', json('POST', 'return=minimal', saleAccessories.map((x) => ({ sale_id: saleId, ...x }))));
    } catch (err) {
      // Sem itens a venda ficaria errada no ERP: desfaz (o estoque ainda não foi mexido)
      await rest(`sale_items?sale_id=eq.${saleId}`, { method: 'DELETE' }).catch(() => {});
      await rest(`sale_accessories?sale_id=eq.${saleId}`, { method: 'DELETE' }).catch(() => {});
      await rest(`sales?id=eq.${saleId}`, { method: 'DELETE' }).catch(() => {});
      throw err;
    }
    // Itens manuais: como o ERP, viram produto "acessorio" (estoque 0) se ainda não existir um com o mesmo nome
    if (manualItems.length) {
      const acc = await rest('products?select=id,model&category=eq.acessorio&limit=5000').catch(() => []);
      for (const mi of manualItems) {
        const model = mi.name.trim();
        if (acc.some((p) => String(p.model || '').toLowerCase() === model.toLowerCase())) continue;
        await rest('products', json('POST', 'return=minimal', { category: 'acessorio', model, color: '', cost: mi.cost, price: mi.price, current_stock: 0 })).catch(() => {});
        acc.push({ model });
      }
    }
    // Custo editado: o ERP grava o novo custo no produto (saveProductCost)
    for (const it of calcItems) {
      if (it.unit_cost !== (Number(byId.get(it.product_id).cost) || 0)) {
        await rest(`products?id=eq.${it.product_id}`, json('PATCH', 'return=minimal', { cost: it.unit_cost })).catch(() => {});
      }
    }
    // Estoque: o ERP baixa na criação da venda (products.current_stock) e avisa o Tiny
    let tinyFailed = 0;
    for (const it of items) {
      const fresh = await rest(`products?select=current_stock,tiny_id&id=eq.${it.product_id}`);
      if (!fresh.length) continue;
      const novo = (Number(fresh[0].current_stock) || 0) - it.quantity;
      await rest(`products?id=eq.${it.product_id}`, json('PATCH', 'return=minimal', { current_stock: novo }));
      if (fresh[0].tiny_id) {
        try {
          const { SUPABASE_URL } = root.WA_CONFIG;
          const res = await supaFetch(`${SUPABASE_URL}/functions/v1/update-tiny-stock`, json('POST', 'return=minimal', { tiny_id: fresh[0].tiny_id, quantidade: novo }));
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.success) tinyFailed++;
        } catch { tinyFailed++; }
      }
    }
    const chatName = extra.wa_chat_id ? await chatNameFromSale(extra.wa_chat_id, row.customer_name) : null; // 2.13.3
    return { id: saleId, total: row.total_sale_price, status: row.status, tinyFailed, origin: row.origin || null, chatName };
  }

  // 2.12.3: fetchAddressByCep do ERP (src/lib/viaCep.ts): só o CEP (8 dígitos) sai; volta rua, bairro, cidade e UF
  async function lookupCep({ cep }) {
    const d = String(cep == null ? '' : cep).replace(/\D/g, '');
    if (d.length !== 8) return null;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || data.erro) return null;
      const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      return { logradouro: s(data.logradouro, 200), bairro: s(data.bairro, 80), localidade: s(data.localidade, 80), uf: s(data.uf, 2).toUpperCase() };
    } catch { return null; }
  }

  // Venda desta conversa nas últimas 24 h (para avisar antes de registrar outra)
  async function recentChatSale({ chatId, phone }) {
    const since = encodeURIComponent(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if (await salesOrigin()) {
      if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return { exists: false };
      const rows = await rest(`sales?select=id&wa_chat_id=eq.${encodeURIComponent(chatId)}&created_at=gte.${since}&limit=1`);
      return { exists: rows.length > 0 };
    }
    const p = clip(phone, 30);
    if (!p) return { exists: false };
    const rows = await rest(`sales?select=id&customer_phone=eq.${encodeURIComponent(p)}&created_at=gte.${since}&limit=1`);
    return { exists: rows.length > 0 };
  }

  // Últimas 20 vendas registradas pela extensão
  async function fetchChatSales() {
    if (!(await salesOrigin())) throw new Error(ENGINE_MISSING);
    return rest('sales?select=id,customer_name,total_sale_price,status,sale_date,created_at,wa_chat_id&wa_chat_id=not.is.null&order=created_at.desc&limit=20');
  }

  // Contato da conversa (cria e guarda o chat_id se preciso) + "tirar das automações e pôr em Cliente"
  async function saleContactLabels({ chatId, name, phone, addLabelId, removeLabelIds, contactId: givenId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) throw new Error('Conversa inválida');
    const add = addLabelId ? checkUuid(addLabelId, 'Etiqueta inválida') : null;
    const remove = Array.isArray(removeLabelIds) ? removeLabelIds.slice(0, 50).map((l) => checkUuid(l, 'Etiqueta inválida')) : [];
    const ph = phoneOfChat(chatId) || (typeof phone === 'string' && /^\d{8,15}$/.test(phone.replace(/\D/g, '')) ? phone.replace(/\D/g, '') : null);
    // 2.16.7 (régua): o contato do percurso vem primeiro (a conversa pode ter outro @lid que o chat_id do CRM)
    let contactId = null;
    if (givenId) contactId = (await contactsById([checkUuid(givenId, 'Contato inválido')]))[0] ? givenId : null;
    let found = contactId ? null : (await contactRowsByChats([chatId]))[chatId];
    // 2.6.3: contato com o chat_id desta conversa mas telefone de outra pessoa: não usa (evita etiquetar a pessoa errada)
    if (found && found.phone && ph && found.phone !== ph) found = null;
    if (!contactId) contactId = found && found.id;
    // 2.16.7: pelo telefone (o do @lid vem do cache do WhatsApp), sem criar outro contato
    if (!contactId && ph) { const byPh = await contactByPhone(ph); if (byPh) contactId = byPh.id; }
    if (!contactId) {
      const nm = clip(name, 100);
      const c = ph ? await ensureContact({ key: `tel:${ph}`, phone: ph, name: nm }) : nm ? await ensureContact({ key: nameKey(nm), phone: null, name: nm }) : null;
      if (!c) return { contactId: null, labelIds: [] };
      await rememberChatId(c, chatId).catch(() => {});
      contactId = c.id;
    }
    for (const l of remove) await rest(`wa_contact_labels?contact_id=eq.${contactId}&label_id=eq.${l}`, { method: 'DELETE' });
    if (add) await followAdd({ contactId, labelId: add });
    return { contactId, labelIds: await labelIdsOf(contactId) };
  }

  // Gatilho "venda registrada": contatos das vendas registradas pela extensão nos últimos dias
  async function saleTriggerCandidates({ sinceDays = 2 } = {}) {
    if (!(await salesOrigin())) return [];
    const days = intIn(Number(sinceDays) || 2, 1, 92, 'Dias'); // 2.11.0: "X dias depois da venda" (até 90)
    const since = encodeURIComponent(new Date(Date.now() - days * 86400000).toISOString());
    const sales = await rest(`sales?select=id,wa_chat_id,created_at&wa_chat_id=not.is.null&created_at=gte.${since}&order=created_at.asc&limit=500`);
    if (!sales.length) return [];
    const byChat = await contactsByChats(sales.map((s) => s.wa_chat_id));
    const ids = [...new Set(Object.values(byChat).map((c) => c.id))];
    if (!ids.length) return [];
    const cols = (await chatIdColumn()) ? 'id,name,phone,chat_id' : 'id,name,phone';
    const contacts = await rest(`wa_contacts?select=${cols}&id=in.${inList(ids)}`);
    const links = await restAll(`wa_contact_labels?select=contact_id,label_id,created_at&contact_id=in.${inList(ids)}&order=contact_id.asc,label_id.asc`);
    const info = new Map(contacts.map((c) => [c.id, { id: c.id, name: c.name || null, phone: c.phone || null, chat_id: c.chat_id || null, labelIds: [], links: [] }]));
    links.forEach((l) => { const c = info.get(l.contact_id); if (c) { c.labelIds.push(l.label_id); c.links.push({ label_id: l.label_id, created_at: l.created_at }); } });
    return sales.filter((s) => byChat[s.wa_chat_id] && info.has(byChat[s.wa_chat_id].id))
      .map((s) => ({ ...info.get(byChat[s.wa_chat_id].id), chat_id: info.get(byChat[s.wa_chat_id].id).chat_id || s.wa_chat_id, sale_id: s.id, sale_at: s.created_at }));
  }

  // ── Conversões do Facebook (2.4.0): Edge Function meta-purchase-event ──
  // A extensão só chama a função (mesmo host do Supabase, com o login do usuário). O token do
  // Facebook fica nos secrets da função; aqui não existe.

  const CONV_TABLE = 'wa_conversion_events';
  const META_FN = 'meta-purchase-event';

  async function callMetaFunction(body) {
    const { SUPABASE_URL } = cfg();
    let res;
    try {
      res = await supaFetch(`${SUPABASE_URL}/functions/v1/${META_FN}`, json('POST', 'return=minimal', body));
    } catch {
      throw new Error('Sem conexão com o servidor');
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  }

  // Função publicada? Secrets configurados? (só sim/não, nunca os valores)
  async function metaStatus() {
    const r = await callMetaFunction({ check: true });
    if (r.status === 404) return { published: false, loggedIn: null, configured: null };
    if (r.status === 401) return { published: true, loggedIn: false, configured: null };
    const c = r.data && r.data.configured;
    return { published: true, loggedIn: true, configured: c ? { token: !!c.token, dataset: !!c.dataset, waba: !!c.waba, test_code: !!c.test_code } : null };
  }

  // 2.6.0: anúncio que vai junto (Compra e Contato): id, título, app, conversionSource e o código de clique
  const adBody = (ad) => ({
    title: clip(ad.title, 200), source_id: clip(ad.source_id, 100), source_app: clip(ad.source_app, 40), conversion_source: clip(ad.conversion_source, 40),
    ctwa_clid: typeof ad.ctwa_clid === 'string' && /^[\w.:=+/-]{8,500}$/.test(ad.ctwa_clid) ? ad.ctwa_clid : null,
  });

  async function sendPurchaseEvent({ event }) {
    const e = event || {};
    if (typeof e.event_id !== 'string' || !UUID_RE.test(e.event_id)) throw new Error('Identificador do evento inválido');
    const value = Number(e.value);
    if (!Number.isFinite(value) || value <= 0 || value > 100000) throw new Error('Valor deve ser maior que 0 e até 100.000');
    if (typeof e.chat_id !== 'string' || !SCHED_CHAT_RE.test(e.chat_id)) throw new Error('Conversa inválida');
    const ad = e.ad && typeof e.ad === 'object' ? e.ad : {};
    const body = {
      chat_id: e.chat_id, phone: String(e.phone || '').replace(/\D/g, '').slice(0, 15), contact_name: clip(e.contact_name, 100),
      value: Math.round(value * 100) / 100, currency: 'BRL', event_time: Math.floor(Number(e.event_time)), event_id: e.event_id,
      description: clip(e.description, 200), test: e.test === true,
      ad: adBody(ad),
    };
    const r = await callMetaFunction(body);
    if (r.status === 404) throw new Error('A função meta-purchase-event ainda não foi publicada no Supabase');
    if (r.status === 401) throw new Error('Entre com sua conta do sistema (aviso no topo do painel)');
    if (!r.data || !r.data.ok) throw new Error((r.data && r.data.error) || `Erro ${r.status}`);
    return { events_received: r.data.events_received ?? 0, fbtrace_id: r.data.fbtrace_id || null, duplicate: !!r.data.duplicate, method: r.data.method || null, test: !!r.data.test, retried_without_clid: !!r.data.retried_without_clid };
  }

  // 2.6.0: "Contato" (lead novo de anúncio). Sem valor; a Edge Function gera o event_id pela conversa
  // (um por conversa, nunca duplica). Precisa do telefone ou do código de clique.
  async function sendContactEvent({ event }) {
    const e = event || {};
    if (typeof e.chat_id !== 'string' || !SCHED_CHAT_RE.test(e.chat_id)) throw new Error('Conversa inválida');
    const ad = e.ad && typeof e.ad === 'object' ? e.ad : {};
    const body = {
      event_name: 'Contact', chat_id: e.chat_id, phone: String(e.phone || '').replace(/\D/g, '').slice(0, 15), contact_name: clip(e.contact_name, 100),
      currency: 'BRL', event_time: Math.floor(Number(e.event_time)), test: e.test === true, ad: adBody(ad),
    };
    const r = await callMetaFunction(body);
    if (r.status === 404) throw new Error('A função meta-purchase-event ainda não foi publicada no Supabase');
    if (r.status === 401) throw new Error('Entre com sua conta do sistema (aviso no topo do painel)');
    if (!r.data || !r.data.ok) throw new Error((r.data && r.data.error) || `Erro ${r.status}`);
    return { events_received: r.data.events_received ?? 0, duplicate: !!r.data.duplicate, method: r.data.method || null, test: !!r.data.test };
  }

  // 2.6.0: interruptor do "Contato" automático, guardado em system_config (vale para todos os computadores;
  // sem migration). since = quando foi ligado: só leads que chegarem depois disso.
  const META_CONTACT_KEY = 'wa_meta_contact';
  async function metaContactConfig() {
    const rows = await rest(`system_config?select=key,value&key=eq.${META_CONTACT_KEY}`);
    let v = null;
    try { v = rows.length ? JSON.parse(rows[0].value) : null; } catch { v = null; }
    return { on: !!(v && v.on === true), since: v && typeof v.since === 'string' ? v.since : null, test: !!(v && v.test === true) };
  }
  async function setMetaContactConfig({ on, test }) {
    if (typeof on !== 'boolean' || typeof test !== 'boolean') throw new Error('Valor inválido');
    const cur = await metaContactConfig();
    const since = on ? (cur.on && cur.since ? cur.since : new Date().toISOString()) : null;
    const value = JSON.stringify({ on, since, test });
    await rest('system_config?on_conflict=key', json('POST', 'resolution=merge-duplicates,return=minimal', { key: META_CONTACT_KEY, value, updated_at: new Date().toISOString() }));
    return { on, since, test };
  }

  // ── 2.17.0: Radar — conversas sem etiqueta CRM e sem automação (SÓ LEITURA do que já existe) ──
  // Para um lote de conversas: o contato (por chat_id, telefone do @c.us ou o telefone que o WhatsApp Web tem do @lid),
  // as etiquetas CRM dele e se ele tem percurso ativo (régua: wa_sequence_runs ativo; automação: inscrição sem saída
  // em wa_automation_enrollments), só de automações ligadas. Nada é gravado.
  async function radarState({ chats }) {
    const list = (Array.isArray(chats) ? chats : []).slice(0, 300)
      .filter((c) => c && typeof c.chatId === 'string' && SCHED_CHAT_RE.test(c.chatId))
      .map((c) => ({ chatId: c.chatId, phone: typeof c.phone === 'string' && /^\d{8,15}$/.test(c.phone) ? c.phone : null }));
    const out = {};
    if (!list.length) return out;
    const byChat = await contactsByChats(list.map((c) => c.chatId));
    const missing = list.filter((c) => !byChat[c.chatId] && c.phone);
    for (let i = 0; i < missing.length; i += 100) {
      const part = missing.slice(i, i + 100);
      const rows = await rest(`wa_contacts?select=id,name,phone&phone=in.${inList(part.map((c) => c.phone))}`);
      const byPhone = new Map(rows.map((r) => [r.phone, r]));
      part.forEach((c) => { const r = byPhone.get(c.phone); if (r) byChat[c.chatId] = { id: r.id, name: r.name }; });
    }
    const contactIds = [...new Set(list.map((c) => byChat[c.chatId] && byChat[c.chatId].id).filter(Boolean))];
    const labels = new Map();
    for (let i = 0; i < contactIds.length; i += 100) {
      const rows = await rest(`wa_contact_labels?select=contact_id,label_id&contact_id=in.${inList(contactIds.slice(i, i + 100))}`);
      rows.forEach((r) => { if (!labels.has(r.contact_id)) labels.set(r.contact_id, []); labels.get(r.contact_id).push(r.label_id); });
    }
    // automações ligadas (régua e automação); sem as tabelas do motor: ninguém tem percurso
    let activeAutos = new Set();
    try { activeAutos = new Set((await rest('wa_automations?select=id&active=eq.true')).map((a) => a.id)); } catch { activeAutos = new Set(); }
    const activeContacts = new Set();
    const activeChats = new Set();
    if (activeAutos.size) {
      const chatIds = list.map((c) => c.chatId);
      const tries = [];
      if (await automationsV212().catch(() => false)) {
        for (let i = 0; i < chatIds.length; i += 100) tries.push(rest(`wa_sequence_runs?select=automation_id,chat_id,contact_id&status=eq.ativo&chat_id=in.${inList(chatIds.slice(i, i + 100))}`));
        for (let i = 0; i < contactIds.length; i += 100) tries.push(rest(`wa_sequence_runs?select=automation_id,chat_id,contact_id&status=eq.ativo&contact_id=in.${inList(contactIds.slice(i, i + 100))}`));
      }
      if (await automationsV25().catch(() => false)) {
        for (let i = 0; i < contactIds.length; i += 100) tries.push(rest(`wa_automation_enrollments?select=automation_id,chat_id,contact_id&removed_at=is.null&contact_id=in.${inList(contactIds.slice(i, i + 100))}`));
      }
      (await Promise.all(tries.map((p) => p.catch(() => [])))).flat().forEach((r) => {
        if (!activeAutos.has(r.automation_id)) return;
        if (r.contact_id) activeContacts.add(r.contact_id);
        if (r.chat_id) activeChats.add(r.chat_id);
      });
    }
    list.forEach((c) => {
      const ct = byChat[c.chatId] || null;
      out[c.chatId] = {
        contactId: ct ? ct.id : null,
        crmLabelIds: ct ? labels.get(ct.id) || [] : [],
        active: activeChats.has(c.chatId) || (!!ct && activeContacts.has(ct.id)),
      };
    });
    return out;
  }

  // Configuração e silenciados do Radar em system_config (vale em qualquer computador; sem migration)
  const RADAR_CONFIG_KEY = 'wa_radar_config';
  const RADAR_SNOOZE_KEY = 'wa_radar_snooze';
  const readConfigKey = async (key) => {
    const rows = await rest(`system_config?select=key,value&key=eq.${key}`);
    try { return rows.length ? JSON.parse(rows[0].value) : null; } catch { return null; }
  };
  const writeConfigKey = (key, v) => rest('system_config?on_conflict=key', json('POST', 'resolution=merge-duplicates,return=minimal', { key, value: JSON.stringify(v), updated_at: new Date().toISOString() }));
  const uuidList = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && UUID_RE.test(x)))].slice(0, 100);
  const waIdList = (v) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => /^[\w:.-]{1,40}$/.test(x)))].slice(0, 100);
  // 2.17.1: since = quando o Radar foi ligado (só entram conversas cuja última mensagem é depois disso; religar = nova
  // data); waAsNone = etiquetas do WhatsApp que NÃO contam como destino (qualquer outra tira a conversa do radar).
  function radarConfigOf(v) {
    const o = v && typeof v === 'object' ? v : {};
    const hours = Number(o.hours);
    const since = typeof o.since === 'string' && Date.parse(o.since) ? new Date(Date.parse(o.since)).toISOString() : null;
    return { on: o.on !== false, since, hours: Number.isFinite(hours) && hours >= 0.5 && hours <= 72 ? Math.round(hours * 2) / 2 : 2, crmAsNone: uuidList(o.crmAsNone), waAsNone: waIdList(o.waAsNone) };
  }
  async function radarConfig() {
    const raw = await readConfigKey(RADAR_CONFIG_KEY);
    const c = radarConfigOf(raw);
    // sem data de início (nunca configurado ou vindo da 2.17.0): começa agora — o que já estava parado não entra
    if (c.on && !c.since) { c.since = new Date().toISOString(); await writeConfigKey(RADAR_CONFIG_KEY, c); }
    return c;
  }
  async function setRadarConfig({ config }) {
    const cur = radarConfigOf(await readConfigKey(RADAR_CONFIG_KEY));
    const c = radarConfigOf(config);
    c.since = c.on ? (cur.on && cur.since ? cur.since : new Date().toISOString()) : null; // ligar/religar = nova data
    await writeConfigKey(RADAR_CONFIG_KEY, c);
    return c;
  }
  // silenciados: { chatId: { mode: 'none', lastT } } ("Não precisa": até chegar mensagem nova) ou
  // { mode: 'remind', until } ("Lembrar em 1 h"). Velhos (30 dias) saem sozinhos.
  const radarSnoozeOf = (v) => {
    const o = v && typeof v === 'object' ? v : {};
    const out = {};
    const old = Date.now() - 30 * 86400000;
    Object.keys(o).slice(0, 2000).forEach((k) => {
      const s = o[k];
      if (!SCHED_CHAT_RE.test(k) || !s || typeof s !== 'object') return;
      const at = Date.parse(s.at || '') || 0;
      if (at && at < old) return;
      if (s.mode === 'none' && Number.isFinite(Number(s.lastT))) out[k] = { mode: 'none', lastT: Number(s.lastT), at: s.at || null };
      else if (s.mode === 'remind' && typeof s.until === 'string' && Date.parse(s.until)) out[k] = { mode: 'remind', until: s.until, at: s.at || null };
    });
    return out;
  };
  async function radarSnooze() { return radarSnoozeOf(await readConfigKey(RADAR_SNOOZE_KEY)); }
  async function setRadarSnooze({ chatId, mode, lastT, minutes }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) throw new Error('Conversa inválida');
    const cur = await radarSnooze();
    const at = new Date().toISOString();
    if (mode === 'none') {
      if (!Number.isFinite(Number(lastT))) throw new Error('Valor inválido');
      cur[chatId] = { mode: 'none', lastT: Number(lastT), at };
    } else if (mode === 'remind') {
      const m = Math.min(24 * 60, Math.max(5, Math.floor(Number(minutes) || 60)));
      cur[chatId] = { mode: 'remind', until: new Date(Date.now() + m * 60000).toISOString(), at };
    } else if (mode === 'clear') delete cur[chatId];
    else throw new Error('Valor inválido');
    await writeConfigKey(RADAR_SNOOZE_KEY, cur);
    return cur;
  }
  // 2.17.1: "Não precisa para todas": silencia de uma vez (até chegar mensagem nova em cada uma)
  async function setRadarSnoozeMany({ items }) {
    const list = (Array.isArray(items) ? items : []).slice(0, 500).filter((x) => x && typeof x.chatId === 'string' && SCHED_CHAT_RE.test(x.chatId) && Number.isFinite(Number(x.lastT)));
    if (!list.length) throw new Error('Lista inválida');
    const cur = await radarSnooze();
    const at = new Date().toISOString();
    list.forEach((x) => { cur[x.chatId] = { mode: 'none', lastT: Number(x.lastT), at }; });
    await writeConfigKey(RADAR_SNOOZE_KEY, cur);
    return cur;
  }

  // ── 2.15.3: exportar o catálogo do WhatsApp Business (só leitura do catálogo; nada é enviado) ──
  // Fotos em wa-media/catalog/<id do produto>/<sha256>.<ext>: a mesma foto (mesmo sha256) nunca sobe duas vezes.
  // O retrato completo fica em system_config, chave wa_catalog_snapshot (sem migration).
  const CATALOG_KEY = 'wa_catalog_snapshot';
  const CATALOG_IMG_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const CATALOG_IMG_MAX = 10 * MB;
  async function uploadCatalogImage({ productId, base64, mime }) {
    const id = String(productId == null ? '' : productId);
    if (!/^\d{1,30}$/.test(id)) throw new Error('Produto inválido');
    const m = typeof mime === 'string' ? mime.toLowerCase().split(';')[0].trim() : '';
    const ext = CATALOG_IMG_MIME[m];
    if (!ext) throw new Error('Tipo de foto não aceito');
    if (typeof base64 !== 'string' || !base64) throw new Error('Foto vazia');
    if (base64.length > Math.ceil(CATALOG_IMG_MAX / 3) * 4 + 4) throw new Error('Foto acima de 10 MB');
    const bytes = fromBase64(base64);
    if (!bytes.length || bytes.length > CATALOG_IMG_MAX) throw new Error('Foto acima de 10 MB');
    const sha = await sha256Of(bytes);
    const { SUPABASE_URL } = cfg();
    const path = `catalog/${id}/${sha}.${ext}`;
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    const out = { url, path, sha256: sha, size: bytes.length, mime: m };
    // já existe (mesmo sha256 neste produto): reaproveita sem subir de novo
    try { const head = await supaFetch(url, { method: 'HEAD' }); if (head.ok) return { ...out, reused: true }; } catch { /* segue para o upload */ }
    const res = await supaFetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { 'Content-Type': m, 'x-upsert': 'false' }, body: bytes });
    if (res.ok) return { ...out, reused: false };
    const text = await res.text().catch(() => '');
    // outra aba / exportação anterior subiu no mesmo instante: o arquivo já está lá
    if (res.status === 409 || /duplicate|already exists/i.test(text)) return { ...out, reused: true };
    throw new Error(`Upload falhou (${res.status}): ${text.slice(0, 120)}`);
  }

  // O retrato é conferido e limpo aqui (o painel só manda o que leu da WA-JS e os endereços do bucket)
  const catNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v * 100) / 100 : null);
  const catText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  function checkCatalogSnapshot(snapshot) {
    const x = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const phone = String(x.phone || '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(phone)) throw new Error('Número da loja inválido');
    if (!Array.isArray(x.products) || x.products.length > 1000) throw new Error('Lista de produtos inválida');
    const bucketUrl = `${cfg().SUPABASE_URL}/storage/v1/object/public/${BUCKET}/catalog/`;
    const products = x.products.map((p) => {
      const id = String((p && p.id) || '');
      if (!/^\d{1,30}$/.test(id)) throw new Error('Produto inválido');
      const images = (Array.isArray(p.images) ? p.images : []).slice(0, 20).map((im) => ({
        url: typeof im.url === 'string' && im.url.startsWith(`${bucketUrl}${id}/`) ? im.url : null,
        source: typeof im.source === 'string' && /^https:\/\/\S{1,2000}$/.test(im.source) ? im.source : null,
        sha256: typeof im.sha256 === 'string' && /^[0-9a-f]{64}$/.test(im.sha256) ? im.sha256 : null,
        size: Number.isInteger(im.size) && im.size > 0 ? im.size : null,
        mime: CATALOG_IMG_MIME[im.mime] ? im.mime : null,
        width: Number.isInteger(im.width) && im.width > 0 && im.width < 100000 ? im.width : null, // 2.16.1
        height: Number.isInteger(im.height) && im.height > 0 && im.height < 100000 ? im.height : null,
      })).filter((im) => im.url);
      return {
        id, name: catText(p.name, 200) || 'Produto', description: catText(p.description, 5000),
        price: catNum(p.price), salePrice: catNum(p.salePrice), currency: /^[A-Z]{3}$/.test(String(p.currency || '')) ? p.currency : 'BRL',
        link: `https://wa.me/p/${id}/${phone}`,
        url: typeof p.url === 'string' && /^https:\/\/\S{1,2000}$/.test(p.url) ? p.url : null,
        retailerId: catText(p.retailerId, 100) || null,
        collections: (Array.isArray(p.collections) ? p.collections : []).map((c) => catText(c, 100)).filter(Boolean).slice(0, 20),
        images,
      };
    });
    const failed = (Array.isArray(x.failed) ? x.failed : []).slice(0, 1000).map((f) => ({ id: catText(String((f && f.id) || ''), 30), name: catText(f && f.name, 200), error: catText(f && f.error, 300) }));
    return {
      version: 1, exported_at: new Date().toISOString(), phone,
      product_count: products.length, image_count: products.reduce((n, p) => n + p.images.length, 0),
      products, failed,
    };
  }
  // 2.16.1: depois de gravar o retrato novo, as fotos do retrato anterior que saíram (as miniaturas) são apagadas de
  // catalog/<id>/ — só de produtos que ficaram com pelo menos uma foto nova (produto sem foto grande mantém as antigas).
  async function saveCatalogSnapshot({ snapshot }) {
    const v = checkCatalogSnapshot(snapshot);
    let old = null;
    try { const rows = await rest(`system_config?select=value&key=eq.${CATALOG_KEY}`); old = rows.length ? JSON.parse(rows[0].value) : null; } catch { old = null; }
    await rest('system_config?on_conflict=key', json('POST', 'resolution=merge-duplicates,return=minimal', { key: CATALOG_KEY, value: JSON.stringify(v), updated_at: v.exported_at }));
    const { SUPABASE_URL } = cfg();
    const pub = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
    const keep = new Set();
    const fresh = new Set();
    v.products.forEach((p) => { if (p.images.length) fresh.add(p.id); p.images.forEach((im) => keep.add(im.url)); });
    const stale = [];
    (old && Array.isArray(old.products) ? old.products : []).forEach((p) => {
      const id = String((p && p.id) || '');
      if (!fresh.has(id)) return;
      (Array.isArray(p.images) ? p.images : []).forEach((im) => {
        const u = im && typeof im.url === 'string' ? im.url : '';
        if (u.startsWith(`${pub}catalog/${id}/`) && !keep.has(u) && !stale.includes(u) && /^[0-9a-f]{64}\.(jpg|png|webp)$/.test(u.slice(`${pub}catalog/${id}/`.length))) stale.push(u);
      });
    });
    let removed = 0;
    for (const u of stale) {
      try { const res = await supaFetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${u.slice(pub.length)}`, { method: 'DELETE' }); if (res.ok) removed++; } catch { /* fica no bucket */ }
    }
    return { exported_at: v.exported_at, product_count: v.product_count, image_count: v.image_count, failed: v.failed.length, removed };
  }
  // Só o resumo da última exportação (data, quantos), para a aba Mídias
  async function catalogSnapshotInfo() {
    const rows = await rest(`system_config?select=value&key=eq.${CATALOG_KEY}`);
    let v = null;
    try { v = rows.length ? JSON.parse(rows[0].value) : null; } catch { v = null; }
    if (!v || typeof v !== 'object') return null;
    return { exported_at: v.exported_at || null, product_count: Number(v.product_count) || 0, image_count: Number(v.image_count) || 0, failed: Array.isArray(v.failed) ? v.failed.length : 0 };
  }

  // ── 2.8.3: nome para mensagens por conversa (wa_chat_names; migration 20261105150000) ──
  // manual = definido por você (nunca trocado pelo aprendido); aprendido = da sua mensagem ("Olá, Fernanda!!").
  const CN_TABLE = 'wa_chat_names';
  const CN_NAME_RE = /^[\p{L}][\p{L}' -]{0,39}$/u;
  async function getChatName({ chatId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return { available: true, name: null, source: null };
    try {
      const rows = await rest(`${CN_TABLE}?select=name,source&chat_id=eq.${encodeURIComponent(chatId)}&limit=1`);
      return { available: true, name: rows.length ? rows[0].name : null, source: rows.length ? rows[0].source : null };
    } catch (err) {
      if (tableMissing(err, [CN_TABLE])) return { available: false, name: null, source: null };
      throw err;
    }
  }
  // 2.13.3: primeiro nome do cliente da venda ("MARIA DA SILVA" → "Maria"; sem "Cliente" e sem números)
  function saleFirstName(full) {
    const words = String(full == null ? '' : full).normalize('NFC').replace(/[^\p{L}' -]+/gu, ' ').split(/\s+/)
      .map((w) => w.replace(/^[-']+|[-']+$/g, '')).filter((w) => w && !/^cliente$/i.test(w));
    const w = (words[0] || '').slice(0, 40);
    if (w.length < 2 || !CN_NAME_RE.test(w)) return null;
    return w.toLocaleLowerCase('pt-BR').replace(/(^|[-'])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('pt-BR'));
  }
  // grava o nome "da venda" (nunca passa por cima do definido à mão); nunca faz a venda falhar
  async function chatNameFromSale(chatId, customerName) {
    const nm = saleFirstName(customerName);
    if (!nm || typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return null;
    try { return await setChatName({ chatId, name: nm, source: 'venda' }); } catch { return null; }
  }
  async function setChatName({ chatId, name, source }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) throw new Error('Conversa inválida');
    if (source !== 'manual' && source !== 'aprendido' && source !== 'venda') throw new Error('Origem inválida');
    const clean = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 40);
    if (clean && !CN_NAME_RE.test(clean)) throw new Error('Nome inválido');
    const cur = await getChatName({ chatId });
    if (!cur.available) throw new Error(ENGINE_MISSING);
    const where = `${CN_TABLE}?chat_id=eq.${encodeURIComponent(chatId)}`;
    if (source === 'manual' && !clean) {
      await rest(where, { method: 'DELETE' });
      return { name: null, source: null };
    }
    if (!clean) return { name: cur.name, source: cur.source, skipped: true };
    // ordem: definido à mão → da venda (2.13.3) → aprendido da sua mensagem
    if (source !== 'manual' && cur.source === 'manual') return { name: cur.name, source: cur.source, skipped: true };
    if (source === 'aprendido' && cur.source === 'venda') return { name: cur.name, source: cur.source, skipped: true };
    if (cur.name === clean && cur.source === source) return { name: clean, source, skipped: true };
    await rest(`${CN_TABLE}?on_conflict=chat_id`, json('POST', 'resolution=merge-duplicates,return=minimal', { chat_id: chatId, name: clean, source, updated_at: new Date().toISOString() }));
    return { name: clean, source };
  }

  // 2.8.3: textos da {saudacao} (system_config, chave wa_greetings; sem migration)
  const GREET_KEY = 'wa_greetings';
  const GREET_DEFAULT = { manha: 'Bommmm dia', tarde: 'Uma ótima tarde', noite: 'Uma ótima noite' };
  async function getGreetings() {
    let v = null;
    try {
      const rows = await rest(`system_config?select=key,value&key=eq.${GREET_KEY}`);
      v = rows.length ? JSON.parse(rows[0].value) : null;
    } catch { v = null; }
    const pick = (k) => (v && typeof v[k] === 'string' && v[k].trim() ? v[k].trim().slice(0, 60) : GREET_DEFAULT[k]);
    return { manha: pick('manha'), tarde: pick('tarde'), noite: pick('noite') };
  }
  async function setGreetings({ manha, tarde, noite }) {
    const out = {};
    for (const [k, v] of Object.entries({ manha, tarde, noite })) {
      const c = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
      if (c.length > 60) throw new Error('Cada texto da saudação tem até 60 caracteres');
      out[k] = c || GREET_DEFAULT[k];
    }
    await rest('system_config?on_conflict=key', json('POST', 'resolution=merge-duplicates,return=minimal', { key: GREET_KEY, value: JSON.stringify(out), updated_at: new Date().toISOString() }));
    return out;
  }

  // ── 2.6.2: anúncio de onde o lead veio (wa_ad_attribution; migration 20261104160000) ──
  // Uma linha por conversa. Gravar de novo não sobrescreve: só completa o ctwa_clid se estava vazio.
  const AD_TABLE = 'wa_ad_attribution';
  const AD_COLS = 'chat_id,phone,contact_name,ad_id,ad_title,source_app,source_url,conversion_source,ctwa_clid,first_message_at,created_at';
  // 2.15.2: miniatura do criativo e tipo de mídia (migration 20261112120000; sem ela, grava como antes)
  const adThumbCols = () => probe('wa_ad_attribution.thumbnail_url', () => hasColumn(AD_TABLE, 'thumbnail_url'), 30 * 60 * 1000);
  // campos que uma gravação nova completa numa linha que já existe (só se estiverem vazios)
  const AD_FILL = ['ctwa_clid', 'source_url', 'thumbnail_url', 'media_type'];

  async function getAdAttribution({ chatId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return { row: null };
    try {
      const rows = await rest(`${AD_TABLE}?select=${AD_COLS}${(await adThumbCols()) ? ',thumbnail_url,media_type' : ''}&chat_id=eq.${encodeURIComponent(chatId)}&limit=1`);
      return { row: rows.length ? rows[0] : null };
    } catch (err) {
      if (tableMissing(err, [AD_TABLE])) return { row: null, missing: true };
      throw err;
    }
  }

  function checkAttribution(it) {
    const x = it || {};
    if (typeof x.chatId !== 'string' || !SCHED_CHAT_RE.test(x.chatId)) throw new Error('Conversa inválida');
    const ad = x.ad && typeof x.ad === 'object' ? x.ad : {};
    const url = clip(ad.sourceUrl, 500);
    const thumb = clip(ad.thumbnailUrl, 1000);
    const t = Number(x.t);
    return {
      chat_id: x.chatId,
      phone: typeof x.phone === 'string' && /^\d{8,15}$/.test(x.phone) ? x.phone : null,
      contact_name: clip(x.name, 100),
      ad_id: clip(ad.sourceId, 100), ad_title: clip(ad.title, 200), source_app: clip(ad.sourceApp, 40),
      source_url: url && /^https?:\/\//.test(url) ? url : null, conversion_source: clip(ad.conversionSource, 40),
      ctwa_clid: typeof ad.ctwaClid === 'string' && /^[\w.:=+/-]{8,500}$/.test(ad.ctwaClid) ? ad.ctwaClid : null,
      thumbnail_url: thumb && /^https:\/\/\S+$/.test(thumb) ? thumb : null,
      media_type: typeof ad.mediaType === 'string' && /^[A-Za-z_]{1,40}$/.test(ad.mediaType) ? ad.mediaType.toUpperCase() : null,
      first_message_at: Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : null,
    };
  }

  // Grava as conversas que ainda não estão na tabela; as que já estão ficam como estão (só ganham o
  // ctwa_clid, e desde a 2.15.2 o link do criativo, a miniatura e o tipo de mídia, se estavam vazios).
  // Uma leitura por lote de 100 + uma gravação por lote.
  async function saveAdAttributions({ items }) {
    if (!Array.isArray(items) || items.length > 3000) throw new Error('Lista inválida');
    const rows = [];
    const seen = new Set();
    const thumbCols = items.length ? await adThumbCols() : false;
    items.forEach((it) => {
      const r = checkAttribution(it);
      if (!thumbCols) { delete r.thumbnail_url; delete r.media_type; }
      if (!seen.has(r.chat_id)) { seen.add(r.chat_id); rows.push(r); }
    });
    const fill = AD_FILL.filter((k) => thumbCols || (k !== 'thumbnail_url' && k !== 'media_type'));
    let added = 0;
    let completed = 0;
    try {
      for (let i = 0; i < rows.length; i += 100) {
        const part = rows.slice(i, i + 100);
        const have = new Map((await rest(`${AD_TABLE}?select=chat_id,${fill.join(',')}&chat_id=in.${inList(part.map((r) => r.chat_id))}`)).map((r) => [r.chat_id, r]));
        const fresh = part.filter((r) => !have.has(r.chat_id));
        if (fresh.length) {
          await rest(`${AD_TABLE}?on_conflict=chat_id`, json('POST', 'resolution=ignore-duplicates,return=minimal', fresh));
          added += fresh.length;
        }
        for (const r of part.filter((x) => have.has(x.chat_id))) {
          const cur = have.get(r.chat_id);
          const keys = fill.filter((k) => !cur[k] && r[k]);
          if (!keys.length) continue;
          const patch = Object.fromEntries(keys.map((k) => [k, r[k]]));
          // só onde o campo ainda está vazio (outra aba pode ter gravado no meio)
          const empty = keys.map((k) => `${k}=is.null`).join('&');
          await rest(`${AD_TABLE}?chat_id=eq.${encodeURIComponent(r.chat_id)}&${empty}`, json('PATCH', 'return=minimal', { ...patch, updated_at: new Date().toISOString() }));
          completed++;
        }
      }
    } catch (err) {
      if (tableMissing(err, [AD_TABLE])) throw new Error(ENGINE_MISSING);
      throw err;
    }
    return { added, completed };
  }

  // 2.6.0: nome e telefone salvos no CRM para a conversa (sem criar nada)
  async function chatContactInfo({ chatId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return { name: null, phone: null };
    const c = (await contactRowsByChats([chatId]))[chatId];
    return { name: c && c.name ? c.name : null, phone: c && c.phone ? c.phone : null };
  }

  async function convRest(path) {
    try {
      return await rest(path);
    } catch (err) {
      if (tableMissing(err, [CONV_TABLE])) throw new Error(ENGINE_MISSING);
      throw err;
    }
  }

  // 2.6.0: event_name, se a coluna existir; senão o "Contato" vem marcado no error ("evento: Contact")
  const convEventName = () => probe('wa_conversion_events.event_name', () => hasColumn(CONV_TABLE, 'event_name'), 30 * 60 * 1000);
  async function fetchConversions({ limit = 50 } = {}) {
    const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
    const withSale = await linkCols().catch(() => false); // 2.10.5
    const cols = `event_id,chat_id,contact_name,value,ad_title,ad_id,method,test,status,events_received,error,created_at${(await convEventName()) ? ',event_name' : ''}${withSale ? ',sale_id' : ''}`;
    const rows = await convRest(`${CONV_TABLE}?select=${cols}&order=created_at.desc&limit=${lim}`);
    const saleIds = [...new Set(rows.map((r) => r.sale_id).filter(Boolean))];
    const sales = new Map();
    if (saleIds.length) (await rest(`sales?select=${SALE_LINK_COLS}&id=in.${inList(saleIds)}`)).forEach((x) => sales.set(x.id, saleSummary(x)));
    return rows.map((r) => {
      const marked = typeof r.error === 'string' && /^evento: Contact/.test(r.error);
      const error = marked ? r.error.replace(/^evento: Contact( · )?/, '') || null : r.error;
      return { ...r, event_name: r.event_name || (marked ? 'Contact' : 'Purchase'), error, linkAvailable: !!withSale, sale: r.sale_id ? sales.get(r.sale_id) || { id: r.sale_id, missing: true } : null };
    });
  }

  // Evento já enviado para esta conversa nos últimos 7 dias (para avisar antes)
  async function recentConversion({ chatId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return { exists: false };
    const since = encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString());
    try {
      const rows = await convRest(`${CONV_TABLE}?select=value,created_at,test&chat_id=eq.${encodeURIComponent(chatId)}&status=eq.enviado&value=not.is.null&test=eq.false&created_at=gte.${since}&order=created_at.desc&limit=1`); // 2.9.0: compra em teste não conta
      return rows.length ? { exists: true, value: Number(rows[0].value), at: rows[0].created_at, test: !!rows[0].test } : { exists: false };
    } catch (err) {
      if (err.message === ENGINE_MISSING) return { exists: false, missing: true };
      throw err;
    }
  }

  // ── 2.9.0: histórico por conversa, conversas com compra real, leads pendentes do Contato e contagens ──
  const convRow = (r) => {
    const marked = typeof r.error === 'string' && /^evento: Contact/.test(r.error);
    const error = marked ? r.error.replace(/^evento: Contact( · )?/, '') || null : r.error;
    return { ...r, event_name: r.event_name || (marked || r.value == null ? 'Contact' : 'Purchase'), error };
  };
  async function chatConversions({ chatId }) {
    if (typeof chatId !== 'string' || !SCHED_CHAT_RE.test(chatId)) return [];
    const cols = `event_id,value,test,status,error,created_at${(await convEventName()) ? ',event_name' : ''}`;
    const rows = await convRest(`${CONV_TABLE}?select=${cols}&chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.desc&limit=30`);
    return rows.map(convRow);
  }
  // Conversas (da lista) que já têm compra REAL enviada
  async function purchasedChats({ chatIds }) {
    const ids = [...new Set((Array.isArray(chatIds) ? chatIds : []).filter((c) => typeof c === 'string' && SCHED_CHAT_RE.test(c)))].slice(0, 200);
    if (!ids.length) return [];
    const out = new Set();
    for (let i = 0; i < ids.length; i += 100) {
      const rows = await convRest(`${CONV_TABLE}?select=chat_id&chat_id=in.${inList(ids.slice(i, i + 100))}&status=eq.enviado&test=eq.false&value=not.is.null`);
      rows.forEach((r) => out.add(r.chat_id));
    }
    return [...out];
  }
  // Leads de anúncio guardados (wa_ad_attribution) que ainda não têm "Contato" enviado: chegaram com a extensão
  // fechada ou a tentativa falhou. Só os de depois de ligar o Contato e dos últimos 7 dias (o Facebook recusa os mais velhos).
  async function pendingContactLeads({ since }) {
    const sinceMs = Math.max(Date.parse(since || '') || 0, Date.now() - 7 * 86400000 + 60000);
    let rows;
    try {
      rows = await rest(`${AD_TABLE}?select=chat_id,phone,contact_name,ad_id,ad_title,source_app,conversion_source,ctwa_clid,first_message_at&first_message_at=gte.${encodeURIComponent(new Date(sinceMs).toISOString())}&order=first_message_at.asc&limit=50`);
    } catch (err) {
      if (tableMissing(err, [AD_TABLE])) return [];
      throw err;
    }
    if (!rows.length) return [];
    let done = [];
    try { done = await convRest(`${CONV_TABLE}?select=chat_id&chat_id=in.${inList(rows.map((r) => r.chat_id))}&status=eq.enviado&value=is.null`); } catch { return []; }
    const has = new Set(done.map((r) => r.chat_id));
    return rows.filter((r) => !has.has(r.chat_id)).map((r) => ({
      chatId: r.chat_id, t: Math.floor(Date.parse(r.first_message_at) / 1000), name: r.contact_name || null, phone: r.phone || null,
      ad: { title: r.ad_title || null, sourceId: r.ad_id || null, sourceApp: r.source_app || null, conversionSource: r.conversion_source || null, ctwaClid: r.ctwa_clid || null },
    }));
  }
  // Diagnóstico da aba Conversões: leads de anúncio capturados hoje e Contatos enviados hoje (só números)
  async function conversionStats({ since }) {
    const day = encodeURIComponent(new Date(Date.parse(since) || Date.now() - 86400000).toISOString());
    let leads = [];
    try { leads = await rest(`${AD_TABLE}?select=first_message_at&first_message_at=gte.${day}&order=first_message_at.desc&limit=1000`); } catch (err) { if (!tableMissing(err, [AD_TABLE])) throw err; }
    let contacts = [];
    try { contacts = await convRest(`${CONV_TABLE}?select=event_id&status=eq.enviado&value=is.null&created_at=gte.${day}&limit=1000`); } catch { contacts = []; }
    return { leadsToday: leads.length, lastLeadAt: leads.length ? leads[0].first_message_at : null, contactsToday: contacts.length };
  }

  // Valor padrão: total da última venda desta conversa no ERP (pela conversa ou pelo telefone)
  // ── 2.10.5: ligar a Compra do 📈 (wa_conversion_events) à venda do ERP (sales) ──
  // Só preenche sales.wa_chat_id (vazio) e o telefone vazio; nunca valores, itens ou estoque. A escolha da venda
  // (telefone/valor) é feita no painel (engine.js: matchSalesForPurchase) com as vendas recentes daqui.
  const LINK_MISSING = 'Atualize o banco para usar este recurso';
  const linkCols = async () => (await salesOrigin()) && probe('wa_conversion_events.sale_id', () => hasColumn(CONV_TABLE, 'sale_id'));
  const SALE_LINK_COLS = 'id,customer_name,customer_phone,sale_date,total_sale_price,wa_chat_id,status';
  const saleSummary = (s) => (s ? { id: s.id, customer_name: s.customer_name || null, customer_phone: s.customer_phone || null, sale_date: s.sale_date, total_sale_price: Number(s.total_sale_price) || 0, wa_chat_id: s.wa_chat_id || null, status: s.status || null } : null);
  async function linkEvent(eventId) {
    if (typeof eventId !== 'string' || !UUID_RE.test(eventId)) throw new Error('Compra inválida');
    const rows = await convRest(`${CONV_TABLE}?select=event_id,chat_id,value,sale_id,sale_link_set_chat,sale_link_set_phone,test,status,created_at&event_id=eq.${eventId}&limit=1`);
    if (!rows.length) throw new Error('Compra não encontrada');
    return rows[0];
  }
  // A compra, a venda ligada (se houver) e as vendas candidatas (8 dias; o painel filtra 7 pelo telefone e 3 pelo valor)
  async function purchaseSaleLink({ eventId }) {
    if (!(await linkCols())) return { available: false };
    const ev = await linkEvent(eventId);
    const out = { available: true, event: { event_id: ev.event_id, chat_id: ev.chat_id, value: Number(ev.value) || 0, test: !!ev.test, status: ev.status, created_at: ev.created_at }, linked: null, sales: [], taken: [] };
    if (ev.sale_id) {
      const s = await rest(`sales?select=${SALE_LINK_COLS}&id=eq.${ev.sale_id}&limit=1`);
      out.linked = saleSummary(s[0]) || { id: ev.sale_id, customer_name: null, total_sale_price: 0, missing: true };
      return out;
    }
    const since = encodeURIComponent(new Date(Date.now() - 8 * 86400000).toISOString());
    const [sales, taken] = await Promise.all([
      rest(`sales?select=${SALE_LINK_COLS}&sale_date=gte.${since}&status=neq.cancelado&status=neq.reembolsado&order=sale_date.desc&limit=1000`),
      convRest(`${CONV_TABLE}?select=sale_id,event_id&sale_id=not.is.null&limit=2000`),
    ]);
    out.sales = sales.map(saleSummary);
    out.taken = taken.filter((t) => t.event_id !== eventId).map((t) => t.sale_id);
    return out;
  }
  // 2.17.2: a venda (💰) já tem Compra REAL enviada ao Facebook ligada a ela (mesmo sale_id)? Sem a coluna sale_id:
  // available: false (o painel pergunta normalmente). Só leitura.
  async function saleConversion({ saleId }) {
    if (typeof saleId !== 'string' || !UUID_RE.test(saleId)) throw new Error('Venda inválida');
    if (!(await linkCols())) return { available: false, exists: false };
    const rows = await convRest(`${CONV_TABLE}?select=event_id,value,created_at&sale_id=eq.${saleId}&status=eq.enviado&test=eq.false&limit=1`);
    return rows.length ? { available: true, exists: true, value: Number(rows[0].value) || 0, at: rows[0].created_at } : { available: true, exists: false };
  }
  // Liga: grava sale_id na compra; preenche wa_chat_id da venda (se vazio) e, se pedido, o telefone (se vazio)
  async function linkSaleToPurchase({ eventId, saleId, phone, fillPhone }) {
    if (!(await linkCols())) throw new Error(LINK_MISSING);
    if (typeof saleId !== 'string' || !UUID_RE.test(saleId)) throw new Error('Venda inválida');
    const ev = await linkEvent(eventId);
    if (ev.sale_id && ev.sale_id !== saleId) throw new Error('Esta compra já está ligada a outra venda: desligue antes');
    if (!SCHED_CHAT_RE.test(ev.chat_id || '')) throw new Error('Conversa inválida');
    const rows = await rest(`sales?select=${SALE_LINK_COLS}&id=eq.${saleId}&limit=1`);
    const sale = rows[0];
    if (!sale) throw new Error('Venda não encontrada');
    if (['cancelado', 'reembolsado'].includes(sale.status)) throw new Error('Venda cancelada ou reembolsada');
    if (sale.wa_chat_id && sale.wa_chat_id !== ev.chat_id) throw new Error('Esta venda já é de outra conversa');
    const setChat = !sale.wa_chat_id;
    if (setChat) await rest(`sales?id=eq.${saleId}&wa_chat_id=is.null`, json('PATCH', 'return=minimal', { wa_chat_id: ev.chat_id }));
    const p = typeof phone === 'string' ? phone.trim() : '';
    let setPhone = null;
    if (fillPhone === true && p && !String(sale.customer_phone || '').trim()) {
      if (!/^[\d() +-]{8,20}$/.test(p)) throw new Error('Telefone inválido');
      await rest(`sales?id=eq.${saleId}&or=(customer_phone.is.null,customer_phone.eq.)`, json('PATCH', 'return=minimal', { customer_phone: p }));
      setPhone = p;
    }
    await rest(`${CONV_TABLE}?event_id=eq.${ev.event_id}`, json('PATCH', 'return=minimal', { sale_id: saleId, sale_link_set_chat: setChat, sale_link_set_phone: setPhone }));
    const chatName = await chatNameFromSale(ev.chat_id, sale.customer_name); // 2.13.3 (📈 ou ligada sozinha pelo telefone)
    return { linked: saleSummary({ ...sale, wa_chat_id: ev.chat_id, customer_phone: setPhone || sale.customer_phone }), chatName };
  }
  // Desliga: tira o sale_id e desfaz só o que a ligação preencheu (wa_chat_id / telefone, se ainda forem os mesmos)
  async function unlinkSaleFromPurchase({ eventId }) {
    if (!(await linkCols())) throw new Error(LINK_MISSING);
    const ev = await linkEvent(eventId);
    if (ev.sale_id) {
      if (ev.sale_link_set_chat && ev.chat_id) await rest(`sales?id=eq.${ev.sale_id}&wa_chat_id=eq.${encodeURIComponent(ev.chat_id)}`, json('PATCH', 'return=minimal', { wa_chat_id: null }));
      if (ev.sale_link_set_phone) await rest(`sales?id=eq.${ev.sale_id}&customer_phone=eq.${encodeURIComponent(ev.sale_link_set_phone)}`, json('PATCH', 'return=minimal', { customer_phone: null }));
    }
    await rest(`${CONV_TABLE}?event_id=eq.${ev.event_id}`, json('PATCH', 'return=minimal', { sale_id: null, sale_link_set_chat: false, sale_link_set_phone: null }));
    return { unlinked: true };
  }

  async function lastChatSaleValue({ chatId, phone }) {
    const cols = 'total_sale_price,sale_date';
    let rows = [];
    if ((await salesOrigin()) && typeof chatId === 'string' && SCHED_CHAT_RE.test(chatId)) {
      rows = await rest(`sales?select=${cols}&wa_chat_id=eq.${encodeURIComponent(chatId)}&status=neq.cancelado&status=neq.reembolsado&order=created_at.desc&limit=1`);
    }
    const p = clip(phone, 30);
    if (!rows.length && p) rows = await rest(`sales?select=${cols}&customer_phone=eq.${encodeURIComponent(p)}&status=neq.cancelado&status=neq.reembolsado&order=created_at.desc&limit=1`);
    return rows.length ? { value: Number(rows[0].total_sale_price) || null } : { value: null };
  }

  // 2.15.1: nome da última venda do ERP com o mesmo telefone, para o nome completo do 💰. O telefone pode estar
  // gravado de vários jeitos ("5521987654321", "21987654321", "(21) 98765-4321", "+55 21 98765-4321"…).
  function salePhoneVariants(phone) {
    const d = String(phone == null ? '' : phone).replace(/\D/g, '').slice(0, 15);
    if (d.length < 10) return [];
    const local = /^55\d{10,11}$/.test(d) ? d.slice(2) : d;
    const out = [d, local, `55${local}`, `+55${local}`];
    if (/^\d{10,11}$/.test(local)) {
      const dd = local.slice(0, 2);
      const n = local.slice(2);
      const nf = `${n.slice(0, n.length - 4)}-${n.slice(-4)}`;
      out.push(`(${dd}) ${nf}`, `(${dd})${nf}`, `${dd} ${nf}`, `${dd}${nf}`, `${dd} ${n}`, `(${dd}) ${n}`, `+55 ${dd} ${nf}`, `+55 (${dd}) ${nf}`, `55 ${dd} ${nf}`);
    }
    return [...new Set(out)];
  }
  async function lastSaleCustomerName({ chatId, phone }) {
    const pick = (rows) => (rows.length ? String(rows[0].customer_name || '').replace(/\s+/g, ' ').trim().slice(0, 100) : '');
    const variants = salePhoneVariants(phone);
    let name = '';
    if (variants.length) {
      const list = variants.map((v) => `"${v}"`).join(',');
      name = pick(await rest(`sales?select=customer_name&customer_phone=in.(${encodeURIComponent(list)})&customer_name=not.is.null&order=created_at.desc&limit=1`));
    }
    if (!name && typeof chatId === 'string' && SCHED_CHAT_RE.test(chatId) && (await salesOrigin())) {
      name = pick(await rest(`sales?select=customer_name&wa_chat_id=eq.${encodeURIComponent(chatId)}&customer_name=not.is.null&order=created_at.desc&limit=1`));
    }
    return { name: name || null };
  }

  root.WaApi = {
    saleConversion, // 2.17.2
    radarState, radarConfig, setRadarConfig, radarSnooze, setRadarSnooze, setRadarSnoozeMany, // 2.17.0 (2.17.1: + em lote)
    uploadCatalogImage, saveCatalogSnapshot, catalogSnapshotInfo, checkCatalogSnapshot, // 2.15.3
    lastSaleCustomerName, salePhoneVariants,
    engineActivity, clearReadCache, automationExisting, chatConversions, purchasedChats, pendingContactLeads, conversionStats,
    nativeLabelEvents, nativeLabelSweep, nativeLabelBaseline, nativeLabelIgnored, nativeLabelCandidates, activeEnrollments, enrollmentCandidates, enrollContact,
    leaveAutomation, chatAutomationState,
    metaStatus, sendPurchaseEvent, fetchConversions, recentConversion, lastChatSaleValue,
    purchaseSaleLink, linkSaleToPurchase, unlinkSaleFromPurchase,
    sendContactEvent, metaContactConfig, setMetaContactConfig, chatContactInfo, getAdAttribution, saveAdAttributions,
    saleFirstName, erpCatalog, createSaleFromChat, lookupCep, recentChatSale, fetchChatSales, saleContactLabels, saleTriggerCandidates,
    fetchAutomations, saveAutomation, setAutomationActive, deleteAutomation, automationRuns, automationReserve, automationSentCounts,
    seqRuns, seqCreateRuns, seqManualEnter, seqUpdateRun, seqReplies, seqLeads, seqChatRuns, seqLabelWarnings, adoptChatId, seqSkipInfo, seqRunAction, seqStats, automationSentToday,
    automationUnreserve, applySendLabels, getContactName,
    campaignVariantStats, fetchCampaigns, saveCampaign, deleteCampaign, previewCampaign, startCampaign, campaignAction, nextCampaignTarget,
    claimTarget, finishTarget, campaignTargets, simulateCampaign, duplicateCampaign,
    getEngineSettings, updateEngineSettings, claimLease, sendCounts, lastSendAt, logSend, finishSendLog, fetchSendLog,
    saveLeads, logQuickSend, logManualSends, recordReplies, touchLeads, saveChatActivity,
    chatContact, ensureNoSendLabel, fetchFlows, saveFlow, setFlowActive, deleteFlow, flowCandidates, contactLabelIds,
    followReserve, followAdd, followMove, ENGINE_MISSING,
    fetchSchedules, createSchedule, cancelSchedule, dueSchedules, claimSchedule, finishSchedule,
    saveItem, deleteItem, itemUsage, createCategory, renameCategory, deleteCategory, reorderCategories, moveItems,
    getChatName, setChatName, getGreetings, setGreetings, uploadFile, partsTableExists,
    fetchMediaLibrary, createMediaFolder, renameMediaFolder, deleteMediaFolder, reorderMediaFolders, uploadMedia, updateMedia,
    incrementMediaUsage, mediaUsage, deleteMedia, importMediaFromItems,
    fetchLibrary, incrementUsage, fetchFile, isAllowedFileUrl, MAX_FILE_BYTES,
    fetchLabels, getContactLabels, setContactLabel, contactLabelsMatch, mergeDuplicateContacts, groupDuplicates, mergedFields, // 2.16.12
    fetchLabelCounts, fetchLabelClients,
    PALETTE, fetchSchema, createLabel, updateLabel, deleteLabel, reorderLabels,
    getContactNote, setContactNote, bulkAddContactsToLabel, moveContactLabel, fetchAllLabelClients,
  };
})(globalThis);
