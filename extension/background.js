// Service worker: faz as chamadas ao Supabase pelo painel (content.js),
// fora das regras de CSP/CORS da página do WhatsApp.
importScripts('config.js', 'supabase-api.js');

const HANDLERS = {
  fetchLibrary:   ()  => WaApi.fetchLibrary(),
  incrementUsage: (m) => WaApi.incrementUsage(m.id),
  fetchFile:      (m) => WaApi.fetchFile(m.url),
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
