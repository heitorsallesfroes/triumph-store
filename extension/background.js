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
  // Editor de mensagens (1.9.0): cada uma valida a entrada em supabase-api.js
  saveItem:        (m) => WaApi.saveItem({ id: m.id, category_id: m.category_id, title: m.title, parts: m.parts }),
  deleteItem:      (m) => WaApi.deleteItem({ id: m.id }),
  createCategory:  (m) => WaApi.createCategory({ name: m.name }),
  renameCategory:  (m) => WaApi.renameCategory({ id: m.id, name: m.name }),
  deleteCategory:  (m) => WaApi.deleteCategory({ id: m.id }),
  uploadFile:      (m) => WaApi.uploadFile({ partType: m.partType, base64: m.base64, mime: m.mime, fileName: m.fileName }),
  // Agendamentos (1.9.0)
  fetchSchedules:  ()  => WaApi.fetchSchedules(),
  createSchedule:  (m) => WaApi.createSchedule({ chat_id: m.chat_id, chat_name: m.chat_name, item_id: m.item_id, body: m.body, send_at: m.send_at }),
  cancelSchedule:  (m) => WaApi.cancelSchedule({ id: m.id }),
  dueSchedules:    ()  => WaApi.dueSchedules(),
  claimSchedule:   (m) => WaApi.claimSchedule({ id: m.id }),
  finishSchedule:  (m) => WaApi.finishSchedule({ id: m.id, status: m.status, error_code: m.error_code }),
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
