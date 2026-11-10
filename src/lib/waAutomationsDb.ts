// Leitura da tela "Automações do WhatsApp" — SÓ SELECT (nenhum insert/update/delete), em páginas de no máximo 500
// linhas, sempre com filtro (automação, status, período ou lista de ids). Cada parte devolve { data, error }: uma
// consulta que falha vira aviso só naquela parte da tela.
// O cliente vem por parâmetro (a tela passa o supabase do ERP; o teste com os dados reais passa um cliente só de
// leitura): makeAutomationsDb(supabase).
import type { AutomationRow, ItemRow, RunRow, SendLogRow } from './waAutomations.ts';

// o mínimo do supabase-js que esta tela usa (consultas encadeadas que viram { data, error, count })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReadClient = { from: (table: string) => any };
export const PAGE = 500;
export const RUN_COLS = 'id, automation_id, chat_id, contact_id, entry_key, node, status, outcome, wait_started_at, due_at, last_sent_at, skip_wait, branches, created_at, ended_at, updated_at';
const SEND_COLS = 'id, created_at, chat_id, contact_id, item_id, status, reason, source_id';
export interface Part<T> { data: T; error: string | null }
export interface LabelRow { id: string; name: string }
export interface ContactRow { id: string; name: string | null; phone: string | null; chat_id?: string | null }
export interface Person { name: string | null; phone: string | null }
export interface AutoStats { total: number; active: number; responded: number; finished: number; other: number }
export interface Overview {
  automations: Part<AutomationRow[]>; labels: Part<LabelRow[]>; items: Part<ItemRow[]>;
  stats: Record<string, Part<AutoStats | null>>; nodes: Record<string, Part<(string | null)[]>>;
}

const msg = (e: unknown) => {
  const m = String((e as { message?: string })?.message || e || '');
  return m ? `Não consegui ler (${m.slice(0, 120)})` : 'Não consegui ler';
};
const isoDaysAgo = (days: number, now = Date.now()) => new Date(now - days * 24 * 3600 * 1000).toISOString();
const chunks = <T,>(list: T[], size: number) => { const out: T[][] = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; };

export function makeAutomationsDb(sb: ReadClient) {
  async function run<T>(q: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as T;
  }
  // páginas de 500 até `cap` linhas (a consulta precisa ter filtro e ordem)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function pages<T>(make: () => any, cap = 5000): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; from < cap; from += PAGE) {
      const rows = await run<T[]>(make().range(from, from + PAGE - 1));
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }
  async function count(make: () => unknown): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: n, error } = await (make() as any);
    if (error) throw error;
    return Number(n) || 0;
  }
  async function part<T>(fallback: T, fn: () => Promise<T>): Promise<Part<T>> {
    try { return { data: await fn(), error: null }; } catch (e) { return { data: fallback, error: msg(e) }; }
  }
  const runsTable = () => sb.from('wa_sequence_runs');

  // mensagens usadas nas automações (título, tipo, texto e arquivo para a prévia)
  async function itemsById(ids: string[]): Promise<ItemRow[]> {
    const out: ItemRow[] = [];
    for (const c of chunks([...new Set(ids.filter(Boolean))], 100)) {
      out.push(...await run<ItemRow[]>(sb.from('wa_items').select('id, title, type, body, file_url, file_name').in('id', c).limit(PAGE)));
    }
    return out;
  }
  async function statsOf(id: string): Promise<AutoStats> {
    const head = () => runsTable().select('id', { count: 'exact', head: true }).eq('automation_id', id);
    const [total, active, responded, noReply, fim] = await Promise.all([
      count(() => head()), count(() => head().eq('status', 'ativo')), count(() => head().eq('outcome', 'respondeu').neq('status', 'ativo')),
      count(() => head().eq('outcome', 'nao_respondeu').neq('status', 'ativo')), count(() => head().eq('outcome', 'fim').neq('status', 'ativo')),
    ]);
    const finished = noReply + fim;
    return { total, active, responded, finished, other: Math.max(0, total - active - responded - finished) };
  }

  // Tela inicial: automações, etiquetas, mensagens, os 4 números e em que passo estão os percursos ativos
  async function loadOverview(): Promise<Overview> {
    const automations = await part<AutomationRow[]>([], () => run(sb.from('wa_automations').select('*').order('position', { ascending: true }).limit(200)));
    const autos = automations.data;
    const itemIds: string[] = [];
    const walk = (list: { item_id?: string | null; yes?: unknown[]; no?: unknown[] }[] | undefined) => (list || []).forEach((n) => { if (n && n.item_id) itemIds.push(n.item_id); walk(n.yes as never); walk(n.no as never); });
    autos.forEach((a) => walk(a.sequence?.steps as never));
    const seqs = autos.filter((a) => a.kind === 'sequencia');
    const [labels, items, statsList, nodesList] = await Promise.all([
      part<LabelRow[]>([], () => run(sb.from('wa_labels').select('id, name').order('name', { ascending: true }).limit(PAGE))),
      part<ItemRow[]>([], () => itemsById(itemIds)),
      Promise.all(seqs.map((a) => part<AutoStats | null>(null, () => statsOf(a.id)))),
      Promise.all(seqs.map((a) => part<(string | null)[]>([], async () => (await pages<{ node: string | null }>(() => runsTable().select('node').eq('automation_id', a.id).eq('status', 'ativo').order('id', { ascending: true }))).map((r) => r.node)))),
    ]);
    const stats: Overview['stats'] = {};
    const nodes: Overview['nodes'] = {};
    seqs.forEach((a, i) => { stats[a.id] = statsList[i]; nodes[a.id] = nodesList[i]; });
    return { automations, labels, items, stats, nodes };
  }

  // Nome e telefone das pessoas dos percursos: pelo contato (contact_id), pela conversa (chat_id) e, para @lid sem
  // contato, pelo telefone que a extensão gravou em wa_leads
  async function peopleOf(runs: { chat_id: string; contact_id?: string | null }[]): Promise<{ byChat: Record<string, Person>; error: string | null }> {
    const byChat: Record<string, Person> = {};
    const byContact: Record<string, ContactRow> = {};
    try {
      const ids = [...new Set(runs.map((r) => r.contact_id).filter(Boolean) as string[])];
      for (const c of chunks(ids, 100)) (await run<ContactRow[]>(sb.from('wa_contacts').select('id, name, phone, chat_id').in('id', c).limit(PAGE))).forEach((x) => { byContact[x.id] = x; });
      runs.forEach((r) => { const c = r.contact_id ? byContact[r.contact_id] : null; if (c) byChat[r.chat_id] = { name: c.name, phone: c.phone }; });
      const missing = [...new Set(runs.map((r) => r.chat_id).filter((c) => !byChat[c]))];
      for (const c of chunks(missing, 100)) (await run<ContactRow[]>(sb.from('wa_contacts').select('id, name, phone, chat_id').in('chat_id', c).limit(PAGE))).forEach((x) => { if (x.chat_id) byChat[x.chat_id] = { name: x.name, phone: x.phone }; });
      const phones = missing.filter((c) => !byChat[c] && /@c\.us$/.test(c)).map((c) => c.split('@')[0]);
      for (const c of chunks(phones, 100)) (await run<ContactRow[]>(sb.from('wa_contacts').select('id, name, phone').in('phone', c).limit(PAGE))).forEach((x) => { if (x.phone) byChat[`${x.phone}@c.us`] = byChat[`${x.phone}@c.us`] || { name: x.name, phone: x.phone }; });
      const lids = missing.filter((c) => !byChat[c] && /@lid$/.test(c));
      for (const c of chunks(lids, 100)) (await run<{ chat_id: string; phone: string | null }[]>(sb.from('wa_leads').select('chat_id, phone').in('chat_id', c).limit(PAGE))).forEach((x) => { if (!byChat[x.chat_id]) byChat[x.chat_id] = { name: null, phone: x.phone }; });
      return { byChat, error: null };
    } catch (e) { return { byChat, error: msg(e) }; }
  }

  // Aba Pessoas / Etapas: todos em andamento (até 5000)
  const loadActive = (id: string) => part<RunRow[]>([], () => pages<RunRow>(() => runsTable().select(RUN_COLS).eq('automation_id', id).eq('status', 'ativo').order('created_at', { ascending: true })));
  // Aba Histórico: os últimos 200 encerrados no período (pela última mudança: quem foi encerrado direto no banco
  // pode não ter ended_at)
  const loadHistory = (id: string, days: number) => part<RunRow[]>([], () => run(runsTable().select(RUN_COLS).eq('automation_id', id).neq('status', 'ativo')
    .gte('updated_at', isoDaysAgo(days)).order('updated_at', { ascending: false }).limit(200)));
  // envios de cada mensagem (para a taxa de resposta por follow), no período
  const loadSentByItem = (id: string, itemIds: string[], days: number) => part<Record<string, number>>({}, async () => {
    const out: Record<string, number> = {};
    const list = [...new Set(itemIds.filter(Boolean))].slice(0, 30);
    const counts = await Promise.all(list.map((it) => count(() => sb.from('wa_send_log').select('id', { count: 'exact', head: true }).eq('source', 'follow').eq('source_id', id).eq('item_id', it).eq('status', 'enviado').gte('created_at', isoDaysAgo(days)))));
    list.forEach((it, i) => { out[it] = counts[i]; });
    return out;
  });
  // Aba Envios: uma página de 500 (mais novos primeiro)
  const loadSends = (id: string, { days, status, page = 0 }: { days: number; status?: string | null; page?: number }) => part<SendLogRow[]>([], () => {
    let q = sb.from('wa_send_log').select(SEND_COLS).eq('source', 'follow').eq('source_id', id).gte('created_at', isoDaysAgo(days));
    if (status) q = q.eq('status', status);
    return run(q.order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1));
  });
  // linha do tempo de uma pessoa: os envios desta automação para a conversa
  const loadPersonSends = (id: string, chatId: string) => part<SendLogRow[]>([], () => run(sb.from('wa_send_log').select(SEND_COLS).eq('source', 'follow').eq('source_id', id)
    .eq('chat_id', chatId).order('created_at', { ascending: true }).limit(200)));
  // Busca global: contatos pelo nome ou telefone → os percursos deles (em qualquer automação)
  const searchPeople = (q: string) => part<{ runs: RunRow[]; contacts: ContactRow[] }>({ runs: [], contacts: [] }, async () => {
    const t = q.trim().replace(/[%,()]/g, ' ').trim();
    const digits = t.replace(/\D/g, '');
    if (t.length < 2) return { runs: [], contacts: [] };
    const found = new Map<string, ContactRow>();
    if (digits.length < 4 || digits.length !== t.replace(/\s/g, '').length) (await run<ContactRow[]>(sb.from('wa_contacts').select('id, name, phone, chat_id').ilike('name', `%${t}%`).limit(20))).forEach((c) => found.set(c.id, c));
    if (digits.length >= 4) (await run<ContactRow[]>(sb.from('wa_contacts').select('id, name, phone, chat_id').ilike('phone', `%${digits}%`).limit(20))).forEach((c) => found.set(c.id, c));
    const contacts = [...found.values()];
    if (!contacts.length) return { runs: [], contacts };
    const runs = new Map<string, RunRow>();
    (await run<RunRow[]>(runsTable().select(RUN_COLS).in('contact_id', contacts.map((c) => c.id)).order('created_at', { ascending: false }).limit(PAGE))).forEach((r) => runs.set(r.id, r));
    const chats = [...new Set(contacts.flatMap((c) => [c.chat_id, c.phone ? `${c.phone}@c.us` : null]).filter(Boolean) as string[])];
    if (chats.length) (await run<RunRow[]>(runsTable().select(RUN_COLS).in('chat_id', chats).order('created_at', { ascending: false }).limit(PAGE))).forEach((r) => runs.set(r.id, r));
    return { runs: [...runs.values()], contacts };
  });

  return { loadOverview, peopleOf, loadActive, loadHistory, loadSentByItem, loadSends, loadPersonSends, searchPeople };
}
export type AutomationsDb = ReturnType<typeof makeAutomationsDb>;
