// extensão 2.18.1: nome salvo na AGENDA do WhatsApp de cada conversa (tabela wa_contact_names, gravada pela extensão
// só com o que o WhatsApp Web já tem na memória). Ordem do nome nas telas do WhatsApp do ERP:
//   nome da agenda → nome do CRM → nome do perfil (com "~") → número.
// Sem a tabela (migration 20261114120000 não aplicada): nenhuma linha, e as telas ficam como antes.

export interface AgendaNameRow { chat_id: string; phone: string | null; agenda_name: string | null; profile_name: string | null }
export interface AgendaNames { agenda: string | null; profile: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReadClient = { from: (table: string) => any };

// texto que é nome de verdade (não só número/símbolos)
export const isNameText = (v: string | null | undefined): v is string => typeof v === 'string' && !!v.trim() && !/^[+\d\s().-]+$/.test(v);
const clean = (v: string | null | undefined) => (isNameText(v) ? v.trim().replace(/\s+/g, ' ') : null);
const digits = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');
// chave do telefone (os 11 últimos dígitos: DDD + número), para casar @c.us, @lid com telefone e o CRM
const phoneKey = (v: string | null | undefined) => { const d = digits(v); return d.length >= 8 ? d.slice(-11) : null; };
const phoneOfCus = (chatId: string | null | undefined) => { const m = /^(\d{8,15})@c\.us$/.exec(chatId || ''); return m ? m[1] : null; };

// O nome que a tela mostra. phoneLabel = o número já formatado (último recurso).
export function displayName({ agenda, crm, profile, phoneLabel, empty = 'Sem nome' }: { agenda?: string | null; crm?: string | null; profile?: string | null; phoneLabel?: string | null; empty?: string }): string {
  const a = clean(agenda);
  if (a) return a;
  const c = clean(crm);
  if (c) return c;
  const p = clean(profile);
  if (p) return `~${p}`;
  return (phoneLabel || '').trim() || empty;
}
export type NameSource = 'agenda' | 'crm' | 'perfil' | 'telefone' | 'nenhum';
export function nameSourceOf({ agenda, crm, profile, phoneLabel }: { agenda?: string | null; crm?: string | null; profile?: string | null; phoneLabel?: string | null }): NameSource {
  return clean(agenda) ? 'agenda' : clean(crm) ? 'crm' : clean(profile) ? 'perfil' : (phoneLabel || '').trim() ? 'telefone' : 'nenhum';
}

// Telefone COMPLETO formatado: "(21) 98765-2818" (Brasil, com ou sem o 55); outro país: "+<dígitos>"; vazio: ''
export function fullPhone(raw: string | null | undefined): string {
  const d = digits(raw);
  if (!d) return '';
  const br = d.length === 13 || d.length === 12 ? (d.startsWith('55') ? d.slice(2) : null) : d.length === 11 || d.length === 10 ? d : null;
  if (br) {
    const ddd = br.slice(0, 2);
    const rest = br.slice(2);
    return rest.length === 9 ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}` : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return `+${d}`;
}

// Índice das linhas: pela conversa e pelo telefone (a mesma pessoa em @c.us e @lid)
export function agendaIndex(rows: AgendaNameRow[]) {
  const byChat = new Map<string, AgendaNameRow>();
  const byPhone = new Map<string, AgendaNameRow>();
  (rows || []).forEach((r) => {
    if (!r || !r.chat_id) return;
    byChat.set(r.chat_id, r);
    const k = phoneKey(r.phone || phoneOfCus(r.chat_id));
    // a agenda ganha do perfil: não troca uma linha com nome da agenda por outra só com perfil
    if (k && (!byPhone.has(k) || (!clean(byPhone.get(k)!.agenda_name) && clean(r.agenda_name)))) byPhone.set(k, r);
  });
  return {
    get(chatId?: string | null, phone?: string | null): AgendaNames {
      const r = (chatId && byChat.get(chatId)) || null;
      const k = phoneKey(phone || r?.phone || phoneOfCus(chatId));
      const p = k ? byPhone.get(k) || null : null;
      return { agenda: clean(r?.agenda_name) || clean(p?.agenda_name), profile: clean(r?.profile_name) || clean(p?.profile_name) };
    },
  };
}
export type AgendaIndex = ReturnType<typeof agendaIndex>;

const chunks = <T,>(list: T[], size: number) => { const out: T[][] = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; };
// Linhas dessas conversas e/ou telefones (de 100 em 100). Tabela ausente ou erro: [] (a tela cai para o CRM).
export async function loadAgendaNames(sb: ReadClient, { chatIds = [], phones = [] }: { chatIds?: (string | null | undefined)[]; phones?: (string | null | undefined)[] }): Promise<AgendaNameRow[]> {
  const cols = 'chat_id, phone, agenda_name, profile_name';
  const ids = [...new Set(chatIds.filter((c): c is string => typeof c === 'string' && /^\d+@(c\.us|lid)$/.test(c)))];
  // com e sem o 55 (a extensão grava como o WhatsApp dá; o CRM pode ter sem)
  const tels = [...new Set([...phones, ...ids.map(phoneOfCus)].map(digits).filter((d) => d.length >= 8)
    .flatMap((d) => (d.length <= 11 ? [d, `55${d}`] : d.startsWith('55') ? [d, d.slice(2)] : [d])))];
  const out = new Map<string, AgendaNameRow>();
  try {
    for (const c of chunks(ids, 100)) {
      const { data, error } = await sb.from('wa_contact_names').select(cols).in('chat_id', c).limit(500);
      if (error) return [...out.values()];
      (data || []).forEach((r: AgendaNameRow) => out.set(r.chat_id, r));
    }
    for (const c of chunks(tels, 100)) {
      const { data, error } = await sb.from('wa_contact_names').select(cols).in('phone', c).limit(500);
      if (error) return [...out.values()];
      (data || []).forEach((r: AgendaNameRow) => out.set(r.chat_id, r));
    }
  } catch { /* sem a tabela: como antes */ }
  return [...out.values()];
}
// Tudo (para telas que já leem tudo, como o Rastreamento): de 1000 em 1000, até 20 000. Sem a tabela: [].
export async function loadAllAgendaNames(sb: ReadClient, cap = 20000): Promise<AgendaNameRow[]> {
  const out: AgendaNameRow[] = [];
  try {
    for (let from = 0; from < cap; from += 1000) {
      const { data, error } = await sb.from('wa_contact_names').select('chat_id, phone, agenda_name, profile_name').order('chat_id').range(from, from + 999);
      if (error) return out;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  } catch { /* sem a tabela */ }
  return out;
}
