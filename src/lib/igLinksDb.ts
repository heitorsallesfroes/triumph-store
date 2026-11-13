// Leitura e gravação da aba Instagram → Rastreio. Grava SÓ em ig_links (criar/editar link; nunca apaga: "Desligar"); ig_automations só é lida (as frases).
// Cliques (ig_link_clicks) e conversas (ig_link_leads) só leitura. As vendas vêm do mesmo Rastreamento da página
// WhatsApp (src/lib/waTrackingDb.ts → src/lib/waTracking.ts). Sem a migration 20261113120000: "missing" = true.
import { supabase } from './supabase';
import { fetchAllRows } from './resumoAnualCalc';
import { loadTracking } from './waTrackingDb';
import { buildConversations, businessHoursOf, conversationsIn } from './waTracking';
import { addDays, spDay, spStartOfDay, DAY_MS, type Range } from './waPanel';
import type { AutoPhrase, IgClick, IgLink, LinkConversation, LinkDraft, LinkMatch } from './igLinks';

export const IG_MIGRATION = '20261113120000_ig_links.sql';
export const IG_PHRASE_MIGRATION = '20261117120000_ig_link_phrases.sql'; // 2.18.3: frases dos links + como a conversa foi ligada
const LINK_COLS = 'id, slug, channel, code, message, media_id, media_permalink, media_caption, note, active, created_at, updated_at';
const iso = (ms: number) => new Date(ms).toISOString();

// os últimos N dias (São Paulo), terminando hoje
export function lastDays(days: number, now = Date.now()): Range {
  const toDay = spDay(now);
  const fromDay = addDays(toDay, -(days - 1));
  return { from: spStartOfDay(fromDay), to: spStartOfDay(toDay) + DAY_MS - 1, fromDay, toDay, days };
}

export async function loadLinks(): Promise<{ links: IgLink[]; missing: boolean }> {
  const { data, error } = await supabase.from('ig_links').select(LINK_COLS).order('created_at', { ascending: true });
  if (error) return { links: [], missing: true };
  return { links: (data as unknown as IgLink[]) || [], missing: false };
}

export async function saveLink(d: LinkDraft, id: string | null): Promise<IgLink> {
  const row = { ...d, note: d.note && d.note.trim() ? d.note.trim() : null, message: d.message.trim(), updated_at: new Date().toISOString() };
  const q = id ? supabase.from('ig_links').update(row).eq('id', id).select(LINK_COLS) : supabase.from('ig_links').insert(row).select(LINK_COLS);
  const { data, error } = await q;
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Já existe um link com esse apelido ou código.' : error.message);
  const out = (data as unknown as IgLink[] | null) || [];
  if (!out[0]) throw new Error('Não consegui salvar o link');
  return out[0];
}

export async function loadClicks(r: Range): Promise<IgClick[]> {
  try {
    return await fetchAllRows<IgClick>((f, t) => supabase.from('ig_link_clicks').select('link_id, created_at, device, browser')
      .gte('created_at', iso(r.from)).lte('created_at', iso(r.to)).order('created_at').range(f, t) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch { return []; }
}

// conversas que começaram por um link no período, com as vendas do ERP ligadas a elas (o mesmo Rastreamento)
export async function loadLinkConversations(r: Range): Promise<{ convs: LinkConversation[]; missing: string[] }> {
  const load = await loadTracking(r);
  const model = buildConversations(load.input, businessHoursOf(load.settings));
  const convs = conversationsIn(model, r, 'instagram')
    .filter((c) => c.periodLead && c.ig)
    .map((c) => { const ig = c.ig as { code: string; linkId?: string | null; match?: LinkMatch }; return { linkId: ig.linkId || null, code: ig.code, firstAt: c.firstAt, sales: c.sales, revenue: c.revenue, match: ig.match || 'codigo' }; });
  return { convs, missing: load.missing };
}

// frases das automações (só leitura; aba Automações), para a frase de um link não repetir a de uma automação.
// Sem a tabela ig_automations: lista vazia.
export async function loadAutoPhrases(): Promise<AutoPhrase[]> {
  try {
    const { data, error } = await supabase.from('ig_automations').select('id, name, link_mode, wa_phrase');
    if (error) return [];
    return (data as unknown as AutoPhrase[]) || [];
  } catch { return []; }
}
