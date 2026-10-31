// Service worker: faz as chamadas ao Supabase pelo painel (content.js),
// fora das regras de CSP/CORS da página do WhatsApp.
importScripts('config.js', 'supabase-api.js');

const HANDLERS = {
  fetchLibrary:   ()  => WaApi.fetchLibrary(),
  incrementUsage: (m) => WaApi.incrementUsage(m.id),
  fetchFile:      (m) => WaApi.fetchFile(m.url),
  fetchLabels:      ()  => WaApi.fetchLabels(),
  getContactLabels: (m) => WaApi.getContactLabels(m.identity),
  setContactLabel:  (m) => WaApi.setContactLabel({ identity: m.identity, labelId: m.labelId, on: m.on }),
  fetchLabelCounts:  ()  => WaApi.fetchLabelCounts(),
  fetchLabelClients: (m) => WaApi.fetchLabelClients({ labelId: m.labelId, offset: m.offset, limit: m.limit, search: m.search }),
  // Etiquetas CRM (1.8.0): cada uma valida a entrada em supabase-api.js
  fetchSchema:            ()  => WaApi.fetchSchema(),
  createLabel:            (m) => WaApi.createLabel({ name: m.name, color: m.color }),
  updateLabel:            (m) => WaApi.updateLabel({ id: m.id, name: m.name, color: m.color, hidden: m.hidden, position: m.position }),
  deleteLabel:            (m) => WaApi.deleteLabel({ id: m.id }),
  reorderLabels:          (m) => WaApi.reorderLabels({ ids: m.ids }),
  getContactNote:         (m) => WaApi.getContactNote(m.identity),
  setContactNote:         (m) => WaApi.setContactNote({ identity: m.identity, note: m.note }),
  bulkAddContactsToLabel: (m) => WaApi.bulkAddContactsToLabel({ labelId: m.labelId, contacts: m.contacts }),
  moveContactLabel:       (m) => WaApi.moveContactLabel({ contactId: m.contactId, from: m.from, to: m.to }),
  fetchAllLabelClients:   (m) => WaApi.fetchAllLabelClients({ labelId: m.labelId }),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  const handler = msg && typeof msg.type === 'string' && Object.prototype.hasOwnProperty.call(HANDLERS, msg.type) ? HANDLERS[msg.type] : null;
  if (!handler) return;
  Promise.resolve()
    .then(() => handler(msg))
    .then(
      (data) => sendResponse({ ok: true, data }),
      (err)  => sendResponse({ ok: false, error: String((err && err.message) || err) }),
    );
  return true; // resposta assíncrona
});
