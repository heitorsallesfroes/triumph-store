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
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  const handler = msg && HANDLERS[msg.type];
  if (!handler) return;
  Promise.resolve()
    .then(() => handler(msg))
    .then(
      (data) => sendResponse({ ok: true, data }),
      (err)  => sendResponse({ ok: false, error: String((err && err.message) || err) }),
    );
  return true; // resposta assíncrona
});
