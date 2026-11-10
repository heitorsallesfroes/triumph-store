// Service worker: faz as chamadas ao Supabase pelo painel (content.js),
// fora das regras de CSP/CORS da página do WhatsApp.
importScripts('config.js', 'auth.js', 'sale-calc.js', 'rich-parts.js', 'supabase-api.js');

const HANDLERS = {
  fetchLibrary:   ()  => WaApi.fetchLibrary(),
  incrementUsage: (m) => WaApi.incrementUsage(m.id),
  fetchFile:      (m) => WaApi.fetchFile(m.url),
  fetchLabels:      ()  => WaApi.fetchLabels(),
  getContactLabels: (m) => WaApi.getContactLabels(m.identity),
  contactLabelsMatch: (m) => WaApi.contactLabelsMatch(m.identity), // 2.16.12: etiquetas + como achou (chat/telefone/nome)
  mergeDuplicateContacts: () => WaApi.mergeDuplicateContacts(), // 2.16.12: Mais → Manutenção
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
  saveItem:        (m) => WaApi.saveItem({ id: m.id, category_id: m.category_id, title: m.title, parts: m.parts, on_send_add_label_id: m.on_send_add_label_id, on_send_remove_label_id: m.on_send_remove_label_id, on_send_add_wa_label_id: m.on_send_add_wa_label_id, on_send_remove_wa_label_id: m.on_send_remove_wa_label_id, on_send_remove_all_crm: m.on_send_remove_all_crm, on_send_remove_all_wa: m.on_send_remove_all_wa, follow_step: m.follow_step }),
  deleteItem:      (m) => WaApi.deleteItem({ id: m.id }),
  itemUsage:       (m) => WaApi.itemUsage({ id: m.id }), // 2.13.1: onde a mensagem está em uso (antes de excluir)
  createCategory:  (m) => WaApi.createCategory({ name: m.name }),
  renameCategory:  (m) => WaApi.renameCategory({ id: m.id, name: m.name }),
  deleteCategory:  (m) => WaApi.deleteCategory({ id: m.id, withItems: m.withItems === true }),
  reorderCategories: (m) => WaApi.reorderCategories({ ids: m.ids }),
  moveItems:       (m) => WaApi.moveItems({ categoryId: m.categoryId, ids: m.ids }),
  getChatName:     (m) => WaApi.getChatName({ chatId: m.chatId }),
  setChatName:     (m) => WaApi.setChatName({ chatId: m.chatId, name: m.name, source: m.source }),
  getGreetings:    ()  => WaApi.getGreetings(),
  setGreetings:    (m) => WaApi.setGreetings({ manha: m.manha, tarde: m.tarde, noite: m.noite }),
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
  logSend:              (m) => WaApi.logSend({ source: m.source, source_id: m.source_id, contact_id: m.contact_id, chat_id: m.chat_id, item_id: m.item_id, status: m.status, reason: m.reason, variant: m.variant }),
  finishSendLog:        (m) => WaApi.finishSendLog({ id: m.id, status: m.status, reason: m.reason }),
  // 2.10.0: painel de resultados (leads, respostas, envios manuais e de mensagem rápida)
  saveLeads:            (m) => WaApi.saveLeads({ items: m.items }),
  logQuickSend:         (m) => WaApi.logQuickSend({ chat_id: m.chat_id, item_id: m.item_id }),
  logManualSends:       (m) => WaApi.logManualSends({ items: m.items }),
  recordReplies:        (m) => WaApi.recordReplies({ items: m.items }),
  touchLeads:           (m) => WaApi.touchLeads({ items: m.items }), // 2.12.2: última mensagem
  saveChatActivity:     (m) => WaApi.saveChatActivity({ items: m.items }), // 2.12.8: atividade de todas as conversas
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
  previewCampaign:      (m) => WaApi.previewCampaign({ id: m.id, wa: m.wa }),
  campaignVariantStats: (m) => WaApi.campaignVariantStats({ id: m.id }),
  startCampaign:        (m) => WaApi.startCampaign({ id: m.id, wa: m.wa }),
  campaignAction:       (m) => WaApi.campaignAction({ id: m.id, action: m.action }),
  nextCampaignTarget:   ()  => WaApi.nextCampaignTarget(),
  claimTarget:          (m) => WaApi.claimTarget({ id: m.id }),
  finishTarget:         (m) => WaApi.finishTarget({ id: m.id, status: m.status, reason: m.reason }),
  campaignTargets:      (m) => WaApi.campaignTargets({ id: m.id, offset: m.offset, limit: m.limit }),
  // Disparos 2.2.0: Simular no editor (não grava nada) e Duplicar (rascunho sem alvos)
  simulateCampaign:     (m) => WaApi.simulateCampaign({ campaign: m.campaign, wa: m.wa }),
  duplicateCampaign:    (m) => WaApi.duplicateCampaign({ id: m.id }),
  // Automações e mensagem que etiqueta (2.1.0): cada uma valida a entrada em supabase-api.js
  fetchAutomations:     ()  => WaApi.fetchAutomations(),
  saveAutomation:       (m) => WaApi.saveAutomation({ id: m.id, automation: m.automation, includeExisting: m.includeExisting === true }),
  setAutomationActive:  (m) => WaApi.setAutomationActive({ id: m.id, active: m.active, includeExisting: m.includeExisting === true }),
  automationExisting:   (m) => WaApi.automationExisting({ labelId: m.labelId }),
  chatConversions:      (m) => WaApi.chatConversions({ chatId: m.chatId }),
  purchasedChats:       (m) => WaApi.purchasedChats({ chatIds: m.chatIds }),
  pendingContactLeads:  (m) => WaApi.pendingContactLeads({ since: m.since }),
  conversionStats:      (m) => WaApi.conversionStats({ since: m.since }),
  deleteAutomation:     (m) => WaApi.deleteAutomation({ id: m.id }),
  automationRuns:       (m) => WaApi.automationRuns({ automationIds: m.automationIds, contactIds: m.contactIds }),
  automationSentCounts: (m) => WaApi.automationSentCounts({ automationIds: m.automationIds }), // 2.11.0
  // 2.12.0: sequências
  seqRuns:        (m) => WaApi.seqRuns({ automationIds: m.automationIds }),
  seqCreateRuns:  (m) => WaApi.seqCreateRuns({ items: m.items }),
  seqUpdateRun:   (m) => WaApi.seqUpdateRun({ id: m.id, version: m.version, patch: m.patch }),
  seqReplies:     (m) => WaApi.seqReplies({ chatIds: m.chatIds, since: m.since }),
  seqLeads:       (m) => WaApi.seqLeads({ since: m.since }),
  seqChatRuns:    (m) => WaApi.seqChatRuns({ chatId: m.chatId }),
  seqRunAction:   (m) => WaApi.seqRunAction({ id: m.id, action: m.action }),
  seqManualEnter: (m) => WaApi.seqManualEnter({ automationId: m.automationId, chatId: m.chatId, plan: m.plan, leaveOthers: m.leaveOthers === true, phone: m.phone }), // 2.16.0 (2.16.7: + phone)
  seqLabelWarnings: (m) => WaApi.seqLabelWarnings({ chatId: m.chatId }), // 2.16.7
  seqSkipInfo:    (m) => WaApi.seqSkipInfo({ runId: m.runId, automationId: m.automationId, hourSince: m.hourSince, daySince: m.daySince }), // 2.16.8
  adoptChatId:    (m) => WaApi.adoptChatId({ chatId: m.chatId, phone: m.phone }), // 2.16.7
  seqStats:       (m) => WaApi.seqStats({ automationIds: m.automationIds }),
  automationSentToday: (m) => WaApi.automationSentToday({ automationId: m.automationId, since: m.since }), // 2.13.2
  automationReserve:    (m) => WaApi.automationReserve({ automationId: m.automationId, contactId: m.contactId, runKey: m.runKey }),
  automationUnreserve:  (m) => WaApi.automationUnreserve({ id: m.id }),
  applySendLabels:      (m) => WaApi.applySendLabels({ addLabelId: m.addLabelId, removeLabelId: m.removeLabelId, removeAll: m.removeAll === true, contactId: m.contactId, identity: m.identity, chatId: m.chatId, name: m.name }),
  getContactName:       (m) => WaApi.getContactName(m.identity),
  // Venda pela conversa (2.3.0): só createSaleFromChat grava nas tabelas do ERP, e só pelo botão "Registrar venda"
  erpCatalog:            ()  => WaApi.erpCatalog(),
  createSaleFromChat:    (m) => WaApi.createSaleFromChat({ sale: m.sale }),
  lookupCep:             (m) => WaApi.lookupCep({ cep: m.cep }), // 2.12.3: endereço do CEP (ViaCEP, como o ERP)
  recentChatSale:        (m) => WaApi.recentChatSale({ chatId: m.chatId, phone: m.phone }),
  fetchChatSales:        ()  => WaApi.fetchChatSales(),
  saleContactLabels:     (m) => WaApi.saleContactLabels({ chatId: m.chatId, name: m.name, phone: m.phone, addLabelId: m.addLabelId, removeLabelIds: m.removeLabelIds, contactId: m.contactId }), // 2.16.7: + contactId (régua)
  saleTriggerCandidates: (m) => WaApi.saleTriggerCandidates({ sinceDays: m.sinceDays }),
  // 2.4.1: "tem algo ativo?" do motor (leituras mínimas)
  engineActivity:        (m) => WaApi.engineActivity({ automations: m.automations !== false, campaigns: m.campaigns !== false }),
  // 2.7.0: Biblioteca de mídias (cada uma valida a entrada em supabase-api.js)
  fetchMediaLibrary:     ()  => WaApi.fetchMediaLibrary(),
  // 2.15.3: exportar o catálogo do WhatsApp (fotos em wa-media/catalog/<id>/, retrato em system_config)
  uploadCatalogImage:    (m) => WaApi.uploadCatalogImage({ productId: m.productId, base64: m.base64, mime: m.mime }),
  saveCatalogSnapshot:   (m) => WaApi.saveCatalogSnapshot({ snapshot: m.snapshot }),
  catalogSnapshotInfo:   ()  => WaApi.catalogSnapshotInfo(),
  createMediaFolder:     (m) => WaApi.createMediaFolder({ name: m.name }),
  renameMediaFolder:     (m) => WaApi.renameMediaFolder({ id: m.id, name: m.name }),
  deleteMediaFolder:     (m) => WaApi.deleteMediaFolder({ id: m.id }),
  reorderMediaFolders:   (m) => WaApi.reorderMediaFolders({ ids: m.ids }),
  uploadMedia:           (m) => WaApi.uploadMedia({ type: m.mediaType, base64: m.base64, mime: m.mime, fileName: m.fileName, title: m.title, caption: m.caption, folderId: m.folderId, enforceLimits: m.enforceLimits !== false }),
  updateMedia:           (m) => WaApi.updateMedia({ id: m.id, title: m.title, caption: m.caption, folderId: m.folderId }),
  incrementMediaUsage:   (m) => WaApi.incrementMediaUsage({ id: m.id }),
  mediaUsage:            (m) => WaApi.mediaUsage({ id: m.id }),
  deleteMedia:           (m) => WaApi.deleteMedia({ id: m.id }),
  importMediaFromItems:  ()  => WaApi.importMediaFromItems(),
  // 2.5.0: etiqueta do WhatsApp no gatilho ("primeira vez que viu") e "Adicionar à automação"
  nativeLabelEvents:     (m) => WaApi.nativeLabelEvents({ events: m.events }),
  nativeLabelSweep:      (m) => WaApi.nativeLabelSweep({ labelId: m.labelId, chats: m.chats, complete: m.complete }),
  nativeLabelBaseline:   (m) => WaApi.nativeLabelBaseline({ labelId: m.labelId, chats: m.chats }), // 2.12.5
  nativeLabelIgnored:    (m) => WaApi.nativeLabelIgnored({ items: m.items }), // 2.12.5
  nativeLabelCandidates: (m) => WaApi.nativeLabelCandidates({ waLabelIds: m.waLabelIds }),
  activeEnrollments:     (m) => WaApi.activeEnrollments({ automationIds: m.automationIds }),
  enrollmentCandidates:  (m) => WaApi.enrollmentCandidates({ enrollments: m.enrollments }),
  enrollContact:         (m) => WaApi.enrollContact({ automationId: m.automationId, identity: m.identity, chatId: m.chatId, name: m.name }),
  leaveAutomation:       (m) => WaApi.leaveAutomation({ automationId: m.automationId, contactId: m.contactId, enrollmentId: m.enrollmentId, entryKey: m.entryKey }),
  chatAutomationState:   (m) => WaApi.chatAutomationState({ identity: m.identity, chatId: m.chatId }),
  // Conversões do Facebook (2.4.0): só sendPurchaseEvent manda algo, e só pelo botão "Enviar compra"
  metaStatus:            ()  => WaApi.metaStatus(),
  sendPurchaseEvent:     (m) => WaApi.sendPurchaseEvent({ event: m.event }),
  fetchConversions:      (m) => WaApi.fetchConversions({ limit: m.limit }),
  recentConversion:      (m) => WaApi.recentConversion({ chatId: m.chatId }),
  // 2.10.5: ligar a Compra do 📈 à venda do ERP
  purchaseSaleLink:       (m) => WaApi.purchaseSaleLink({ eventId: m.eventId }),
  linkSaleToPurchase:     (m) => WaApi.linkSaleToPurchase({ eventId: m.eventId, saleId: m.saleId, phone: m.phone, fillPhone: m.fillPhone }),
  unlinkSaleFromPurchase: (m) => WaApi.unlinkSaleFromPurchase({ eventId: m.eventId }),
  lastChatSaleValue:     (m) => WaApi.lastChatSaleValue({ chatId: m.chatId, phone: m.phone }),
  lastSaleCustomerName:  (m) => WaApi.lastSaleCustomerName({ chatId: m.chatId, phone: m.phone }), // 2.15.1
  // 2.6.0: "Contato" automático (lead novo de anúncio) e nome/telefone do CRM da conversa
  sendContactEvent:      (m) => WaApi.sendContactEvent({ event: m.event }),
  metaContactConfig:     ()  => WaApi.metaContactConfig(),
  setMetaContactConfig:  (m) => WaApi.setMetaContactConfig({ on: m.on, test: m.test }),
  chatContactInfo:       (m) => WaApi.chatContactInfo({ chatId: m.chatId }),
  // 2.6.2: anúncio de onde o lead veio (wa_ad_attribution)
  getAdAttribution:      (m) => WaApi.getAdAttribution({ chatId: m.chatId }),
  saveAdAttributions:    (m) => WaApi.saveAdAttributions({ items: m.items }),
  // Conta (1.9.1): a senha só segue para o Supabase Auth; o painel recebe só conectada/dica do e-mail
  authStatus:      ()  => WaAuth.status(),
  // 2.4.1: trocar de conta limpa as leituras guardadas em memória
  authSignIn:      (m) => { WaApi.clearReadCache(); return WaAuth.signIn({ email: m.email, password: m.password }).finally(() => WaApi.clearReadCache()); },
  authSignOut:     ()  => { WaApi.clearReadCache(); return WaAuth.signOut().finally(() => WaApi.clearReadCache()); },
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
