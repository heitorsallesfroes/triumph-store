// Service worker: faz as chamadas ao Supabase pelo painel (content.js),
// fora das regras de CSP/CORS da página do WhatsApp.
importScripts('config.js', 'auth.js', 'supabase-api.js');

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
  saveItem:        (m) => WaApi.saveItem({ id: m.id, category_id: m.category_id, title: m.title, parts: m.parts, on_send_add_label_id: m.on_send_add_label_id, on_send_remove_label_id: m.on_send_remove_label_id }),
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
  // Motor de envios e follows (2.0.0-D1): cada uma valida a entrada em supabase-api.js
  getEngineSettings:    ()  => WaApi.getEngineSettings(),
  updateEngineSettings: (m) => WaApi.updateEngineSettings(m.patch),
  claimLease:           (m) => WaApi.claimLease({ runnerId: m.runnerId, ttlS: m.ttlS }),
  sendCounts:           (m) => WaApi.sendCounts({ hourSince: m.hourSince, daySince: m.daySince }),
  lastSendAt:           ()  => WaApi.lastSendAt(),
  logSend:              (m) => WaApi.logSend({ source: m.source, source_id: m.source_id, contact_id: m.contact_id, chat_id: m.chat_id, item_id: m.item_id, status: m.status, reason: m.reason }),
  finishSendLog:        (m) => WaApi.finishSendLog({ id: m.id, status: m.status, reason: m.reason }),
  fetchSendLog:         (m) => WaApi.fetchSendLog({ limit: m.limit }),
  chatContact:          (m) => WaApi.chatContact({ chatId: m.chatId, labelId: m.labelId }),
  ensureNoSendLabel:    ()  => WaApi.ensureNoSendLabel(),
  fetchFlows:           ()  => WaApi.fetchFlows(),
  saveFlow:             (m) => WaApi.saveFlow(m.flow),
  setFlowActive:        (m) => WaApi.setFlowActive({ id: m.id, active: m.active }),
  deleteFlow:           (m) => WaApi.deleteFlow({ id: m.id }),
  flowCandidates:       (m) => WaApi.flowCandidates({ labelIds: m.labelIds }),
  contactLabelIds:      (m) => WaApi.contactLabelIds({ contactId: m.contactId }),
  followReserve:        (m) => WaApi.followReserve({ contactId: m.contactId, labelId: m.labelId }),
  followAdd:            (m) => WaApi.followAdd({ contactId: m.contactId, labelId: m.labelId }),
  followMove:           (m) => WaApi.followMove({ contactId: m.contactId, fromLabelId: m.fromLabelId, toLabelId: m.toLabelId }),
  // Disparos (2.0.0-D2): nada sai sem startCampaign (botão "Iniciar disparo" da confirmação)
  fetchCampaigns:       ()  => WaApi.fetchCampaigns(),
  saveCampaign:         (m) => WaApi.saveCampaign({ id: m.id, campaign: m.campaign }),
  deleteCampaign:       (m) => WaApi.deleteCampaign({ id: m.id }),
  previewCampaign:      (m) => WaApi.previewCampaign({ id: m.id }),
  startCampaign:        (m) => WaApi.startCampaign({ id: m.id }),
  campaignAction:       (m) => WaApi.campaignAction({ id: m.id, action: m.action }),
  nextCampaignTarget:   ()  => WaApi.nextCampaignTarget(),
  claimTarget:          (m) => WaApi.claimTarget({ id: m.id }),
  finishTarget:         (m) => WaApi.finishTarget({ id: m.id, status: m.status, reason: m.reason }),
  campaignTargets:      (m) => WaApi.campaignTargets({ id: m.id, offset: m.offset, limit: m.limit }),
  // Automações e mensagem que etiqueta (2.1.0): cada uma valida a entrada em supabase-api.js
  fetchAutomations:     ()  => WaApi.fetchAutomations(),
  saveAutomation:       (m) => WaApi.saveAutomation({ id: m.id, automation: m.automation }),
  setAutomationActive:  (m) => WaApi.setAutomationActive({ id: m.id, active: m.active }),
  deleteAutomation:     (m) => WaApi.deleteAutomation({ id: m.id }),
  automationRuns:       (m) => WaApi.automationRuns({ automationIds: m.automationIds }),
  automationReserve:    (m) => WaApi.automationReserve({ automationId: m.automationId, contactId: m.contactId, runKey: m.runKey }),
  automationUnreserve:  (m) => WaApi.automationUnreserve({ id: m.id }),
  applySendLabels:      (m) => WaApi.applySendLabels({ addLabelId: m.addLabelId, removeLabelId: m.removeLabelId, contactId: m.contactId, identity: m.identity, chatId: m.chatId, name: m.name }),
  getContactName:       (m) => WaApi.getContactName(m.identity),
  // Conta (1.9.1): a senha só segue para o Supabase Auth; o painel recebe só conectada/dica do e-mail
  authStatus:      ()  => WaAuth.status(),
  authSignIn:      (m) => WaAuth.signIn({ email: m.email, password: m.password }),
  authSignOut:     ()  => WaAuth.signOut(),
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
