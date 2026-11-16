// Contador do menu "Anotações" (tarefas de hoje + atrasadas que faltam). O Layout busca no banco ao abrir e de
// tempos em tempos; a página Anotações avisa na hora (evento) quando o número muda. Sem a migration = sem contador.
import { supabase } from './supabase';
import { dateKey } from './anotacoes';

export const BADGE_EVENT = 'erp:anotacoes-pendentes';

export async function fetchPendentesHoje(): Promise<number | null> {
  const { count, error } = await supabase
    .from('erp_tarefas')
    .select('id', { count: 'exact', head: true })
    .eq('done', false)
    .lte('due_date', dateKey(new Date()));
  return error ? null : count ?? 0;
}

export const announcePendentes = (n: number) => {
  try { window.dispatchEvent(new CustomEvent(BADGE_EVENT, { detail: n })); } catch { /* sem window */ }
};
