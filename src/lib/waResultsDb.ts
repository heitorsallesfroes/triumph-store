// Leitura extra da aba WhatsApp → Resultados (além do loadPanel): gatilho das automações, os tipos escolhidos
// (system_config "wa_results_types") e o follow-up por categoria/mensagem da extensão 2.18.8
// (wa_categories.is_followup / wa_items.is_followup da migration 20261119120000 e, sem ela, system_config
// "wa_followup_marks"). Só leitura; a única gravação é a chave wa_results_types.
import { supabase } from './supabase';
import { fetchAllRows } from './resumoAnualCalc';
import { parseTypes, TYPES_KEY, type AutomationInfo, type PathType, type ResultsExtra } from './waResults';

export const MARKS_KEY = 'wa_followup_marks';

async function configValue(key: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('system_config').select('key, value').eq('key', key).maybeSingle();
    return (data && (data as { value?: string }).value) || null;
  } catch { return null; }
}
async function rowsOr<T>(table: string, cols: string, fallback: string | null): Promise<T[]> {
  try {
    return await fetchAllRows<T>((f, t) => supabase.from(table).select(cols).order('id').range(f, t) as any);
  } catch {
    if (fallback == null) return [];
    try { return await fetchAllRows<T>((f, t) => supabase.from(table).select(fallback).order('id').range(f, t) as any); } catch { return []; }
  }
}
export function parseMarks(raw: string | null): { categories: string[]; items: string[] } {
  try {
    const v = raw ? JSON.parse(raw) : null;
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : []);
    return { categories: ids(v && v.categories), items: ids(v && v.items) };
  } catch { return { categories: [], items: [] }; }
}

export async function loadResultsExtra(): Promise<ResultsExtra> {
  const [automations, cats, items, typesRaw, marksRaw] = await Promise.all([
    rowsOr<AutomationInfo>('wa_automations', 'id, name, trigger_label_source, trigger_wa_label_id', 'id, name'),
    rowsOr<{ id: string; is_followup?: boolean | null }>('wa_categories', 'id, is_followup', 'id'),
    rowsOr<{ id: string; category_id: string; is_followup?: boolean | null }>('wa_items', 'id, category_id, is_followup', 'id, category_id'),
    configValue(TYPES_KEY), configValue(MARKS_KEY),
  ]);
  const marks = parseMarks(marksRaw);
  const itemCategory: Record<string, string> = {};
  items.forEach((i) => { if (i.category_id) itemCategory[i.id] = i.category_id; });
  return {
    automations,
    types: parseTypes(typesRaw),
    followCategories: [...new Set([...cats.filter((c) => c.is_followup === true).map((c) => c.id), ...marks.categories])],
    followItems: [...new Set([...items.filter((i) => i.is_followup === true).map((i) => i.id), ...marks.items])],
    itemCategory,
  };
}

// grava SÓ a chave wa_results_types (relê antes, para não perder o que outra aba gravou)
export async function saveResultsType(id: string, type: PathType): Promise<Record<string, PathType>> {
  const cur = parseTypes(await configValue(TYPES_KEY));
  const next = { ...cur, [id]: type };
  const { error } = await supabase.from('system_config').upsert({ key: TYPES_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  return next;
}
