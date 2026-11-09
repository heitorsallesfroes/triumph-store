// Backup completo (Configurações): a lista de tabelas, o resumo do arquivo e o aviso de "faz tempo".
// Sem dependências (o teste scripts/tests/backup.test.ts roda isto direto no Node).

// order = colunas para paginar sem pular nem repetir linhas (a maioria tem id).
// Toda tabela criada numa migration precisa estar aqui ou em BACKUP_EXCLUDED (o teste confere).
export const BACKUP_TABLES: { name: string; order: string[] }[] = [
  // ERP
  { name: 'products', order: ['id'] },
  { name: 'accessories', order: ['id'] },
  { name: 'sales', order: ['id'] },
  { name: 'sale_items', order: ['id'] },
  { name: 'sale_accessories', order: ['id'] },
  { name: 'small_sales', order: ['id'] },
  { name: 'suppliers', order: ['id'] },
  { name: 'supplier_orders', order: ['id'] },
  { name: 'cities', order: ['id'] },
  { name: 'neighborhoods', order: ['id'] },
  { name: 'motoboys', order: ['id'] },
  { name: 'motoboy_payments', order: ['id'] },
  { name: 'ad_spend', order: ['id'] },
  { name: 'operational_costs', order: ['id'] },
  { name: 'operational_cost_payments', order: ['id'] },
  { name: 'operational_costs_avulsos', order: ['id'] },
  { name: 'stock_orders', order: ['id'] },
  { name: 'stock_movements', order: ['id'] },
  { name: 'system_config', order: ['key'] },
  // WhatsApp / CRM
  { name: 'wa_categories', order: ['id'] },
  { name: 'wa_items', order: ['id'] },
  { name: 'wa_item_parts', order: ['id'] },
  { name: 'wa_media_folders', order: ['id'] },
  { name: 'wa_media', order: ['id'] },
  { name: 'wa_labels', order: ['id'] },
  { name: 'wa_contacts', order: ['id'] },
  { name: 'wa_contact_labels', order: ['contact_id', 'label_id'] },
  { name: 'wa_chat_names', order: ['chat_id'] },
  { name: 'wa_native_label_seen', order: ['chat_id', 'wa_label_id'] },
  { name: 'wa_schedules', order: ['id'] },
  { name: 'wa_settings', order: ['id'] },
  { name: 'wa_send_log', order: ['id'] },
  { name: 'wa_replies', order: ['id'] },
  { name: 'wa_flows', order: ['id'] },
  { name: 'wa_flow_variants', order: ['id'] },
  { name: 'wa_campaigns', order: ['id'] },
  { name: 'wa_campaign_targets', order: ['id'] },
  { name: 'wa_automations', order: ['id'] },
  { name: 'wa_automation_runs', order: ['id'] },
  { name: 'wa_automation_enrollments', order: ['id'] },
  { name: 'wa_sequence_runs', order: ['id'] },
  { name: 'wa_leads', order: ['id'] },
  { name: 'wa_ad_attribution', order: ['id'] },
  { name: 'wa_conversion_events', order: ['id'] },
  { name: 'wa_chat_activity', order: ['chat_id'] }, // 2.12.8
  { name: 'wa_chat_activity_days', order: ['chat_id', 'day'] }, // 2.12.8
];

// Tabelas das migrations que NÃO vão no backup, com o motivo. (Tabelas fora do schema public, como a cópia
// rls_backup_20261103.*, nem entram na conta: a API do Supabase não as expõe.)
export const BACKUP_EXCLUDED: Record<string, string> = {};

// Nomes das tabelas criadas em SQL de migrations (create table [if not exists] [public.]nome), sem comentários
export function tablesFromSql(sql: string): string[] {
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Set<string>();
  const re = /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"?(\w+)"?\s*\.\s*)?"?([A-Za-z_]\w*)\b"?(?!\s*\.)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    if (m[1] && m[1].toLowerCase() !== 'public') continue;
    out.add(m[2].toLowerCase());
  }
  return [...out];
}

export type BackupSummary = {
  exportDate: string;
  exportDateLocal: string;
  extensionVersion: string | null;
  tables: { name: string; rows: number }[];
  totalRows: number;
  skipped: { name: string; reason: string }[];
  mediaFiles: number | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
// "DD/MM às HH:MM" (horário do navegador)
export function formatBackupWhen(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildBackupSummary(p: {
  now: number;
  extensionVersion: string | null;
  tables: { name: string; rows: number }[];
  skipped: { name: string; reason: string }[];
  mediaFiles: number | null;
}): BackupSummary {
  const d = new Date(p.now);
  return {
    exportDate: d.toISOString(),
    exportDateLocal: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    extensionVersion: p.extensionVersion,
    tables: p.tables,
    totalRows: p.tables.reduce((s, t) => s + t.rows, 0),
    skipped: p.skipped,
    mediaFiles: p.mediaFiles,
  };
}

export const BACKUP_STALE_DAYS = 7;
export const LAST_BACKUP_KEY = 'tsp_last_backup_at';
export function isBackupStale(lastMs: number | null, now: number): boolean {
  return lastMs == null || now - lastMs > BACKUP_STALE_DAYS * 24 * 60 * 60 * 1000;
}

export function extensionVersionFromManifest(raw: string): string | null {
  try {
    const v = JSON.parse(raw).version;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}
