import { useEffect, useState } from 'react';
import { Download, Loader2, Save, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/resumoAnualCalc';
import {
  BACKUP_TABLES, LAST_BACKUP_KEY, buildBackupSummary, extensionVersionFromManifest, formatBackupWhen, isBackupStale,
} from '../lib/backup';
import extensionManifestRaw from '../../extension/manifest.json?raw';

import { getConfigDefaults, refreshSystemConfig } from '../lib/systemConfig';

const INSTALLMENTS = Array.from({ length: 12 }, (_, i) => i + 1);

// Backup completo: a lista de tabelas fica em src/lib/backup.ts (o teste scripts/tests/backup.test.ts confere
// que toda tabela das migrations está nela). Uma tabela de cada vez, em páginas de 1000.
const EXTENSION_VERSION = extensionVersionFromManifest(extensionManifestRaw);
const MEDIA_BUCKET = 'wa-media';

// Tabela que não existe no banco (migration não aplicada): pula e anota
const isMissingTable = (e: any) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find the table/i.test(String(e.message || '')));
const isMissingColumn = (e: any) => !!e && (e.code === '42703' || /column .* does not exist/i.test(String(e.message || '')));

const STORE_FIELDS: { key: string; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'store_name', label: 'Nome da loja', placeholder: 'Ex: Triumph Store Smartwatches' },
  { key: 'store_cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
  { key: 'store_whatsapp', label: 'WhatsApp', placeholder: '(00) 00000-0000' },
  { key: 'store_instagram', label: 'Instagram', placeholder: '@usuario' },
  { key: 'store_address', label: 'Endereço completo', placeholder: 'Rua, número, bairro, cidade - UF, CEP', multiline: true },
];

// value em formato decimal (ex: "0.0320") <-> exibido como porcentagem (ex: "3.20")
const toPercentDisplay = (raw: string) => {
  const n = Number(raw);
  return Number.isFinite(n) ? (n * 100).toFixed(2) : '0.00';
};
const fromPercentDisplay = (pct: string) => {
  const n = Number(pct);
  return Number.isFinite(n) ? (n / 100).toFixed(4) : '0';
};

export default function Settings() {
  const [isExporting, setIsExporting] = useState(false);
  const [backupProgress, setBackupProgress] = useState('');
  const [includeMedia, setIncludeMedia] = useState(false);
  // "Último backup baixado" fica guardado só neste navegador
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(() => {
    try {
      const n = Number(localStorage.getItem(LAST_BACKUP_KEY));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  });

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [storeForm, setStoreForm] = useState<Record<string, string>>({});
  const [feeForm, setFeeForm] = useState<Record<string, string>>({});
  const [packagingCost, setPackagingCost] = useState('2.00');
  const [adTaxPercent, setAdTaxPercent] = useState('13.83');
  const [linkStartDate, setLinkStartDate] = useState('2099-01-01');

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoadingConfig(true);
    try {
      const defaults = getConfigDefaults();
      const { data } = await supabase.from('system_config').select('key, value');
      const map: Record<string, string> = { ...defaults };
      (data || []).forEach(row => { map[row.key] = row.value; });

      const nextStoreForm: Record<string, string> = {};
      STORE_FIELDS.forEach(f => { nextStoreForm[f.key] = map[f.key] ?? ''; });
      setStoreForm(nextStoreForm);

      const nextFeeForm: Record<string, string> = {};
      (['vm', 'ea'] as const).forEach(brand => {
        nextFeeForm[`fee_${brand}_debit`] = toPercentDisplay(map[`fee_${brand}_debit`]);
        INSTALLMENTS.forEach(n => {
          nextFeeForm[`fee_${brand}_credit_${n}`] = toPercentDisplay(map[`fee_${brand}_credit_${n}`]);
          nextFeeForm[`fee_link_${brand}_credit_${n}`] = toPercentDisplay(map[`fee_link_${brand}_credit_${n}`]);
        });
      });
      setFeeForm(nextFeeForm);

      setPackagingCost(Number(map.packaging_cost).toFixed(2));
      setAdTaxPercent(toPercentDisplay(map.ad_tax_rate));
      setLinkStartDate(map.fee_link_start_date || '2099-01-01');
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar configurações');
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setSavedAt(null);
    try {
      const rows: { key: string; value: string }[] = [];

      STORE_FIELDS.forEach(f => rows.push({ key: f.key, value: storeForm[f.key] ?? '' }));

      (['vm', 'ea'] as const).forEach(brand => {
        rows.push({ key: `fee_${brand}_debit`, value: fromPercentDisplay(feeForm[`fee_${brand}_debit`]) });
        INSTALLMENTS.forEach(n => {
          rows.push({ key: `fee_${brand}_credit_${n}`, value: fromPercentDisplay(feeForm[`fee_${brand}_credit_${n}`]) });
          rows.push({ key: `fee_link_${brand}_credit_${n}`, value: fromPercentDisplay(feeForm[`fee_link_${brand}_credit_${n}`]) });
        });
      });

      rows.push({ key: 'packaging_cost', value: Number(packagingCost).toFixed(2) });
      rows.push({ key: 'ad_tax_rate', value: fromPercentDisplay(adTaxPercent) });
      if (/^\d{4}-\d{2}-\d{2}$/.test(linkStartDate)) rows.push({ key: 'fee_link_start_date', value: linkStartDate });

      const { error } = await supabase.from('system_config').upsert(rows, { onConflict: 'key' });
      if (error) throw error;

      await refreshSystemConfig();
      setSavedAt(Date.now());
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar configurações');
    } finally {
      setSavingConfig(false);
    }
  };

  const exportBackup = async () => {
    try {
      setIsExporting(true);
      const data: Record<string, any[]> = {};
      const tables: { name: string; rows: number }[] = [];
      const skipped: { name: string; reason: string }[] = [];

      // Uma tabela de cada vez (não pesa o banco), cada uma em páginas de 1000 (nunca corta)
      for (let i = 0; i < BACKUP_TABLES.length; i++) {
        const t = BACKUP_TABLES[i];
        const label = `Tabela ${i + 1} de ${BACKUP_TABLES.length}: ${t.name}`;
        setBackupProgress(`${label}…`);
        const fetchWith = (order: string[]) => fetchAllRows<any>((f, to) => {
          let q: any = supabase.from(t.name).select('*');
          order.forEach((c) => { q = q.order(c); });
          return q.range(f, to);
        });
        try {
          let rows: any[];
          try {
            rows = await fetchWith(t.order);
          } catch (e) {
            if (!isMissingColumn(e)) throw e;
            rows = await fetchWith([]); // tabela sem a coluna de ordem esperada
          }
          data[t.name] = rows;
          tables.push({ name: t.name, rows: rows.length });
          setBackupProgress(`${label}: ${rows.length.toLocaleString('pt-BR')} linhas`);
        } catch (e: any) {
          if (!isMissingTable(e)) throw new Error(`${t.name}: ${e?.message || e}`);
          skipped.push({ name: t.name, reason: 'tabela não existe no banco' });
        }
      }

      // Opcional: só a LISTA dos arquivos do bucket wa-media (nome, tamanho, link), num arquivo separado
      let media: { path: string; name: string; size: number | null; mimetype: string | null; updated_at: string | null; url: string }[] | null = null;
      if (includeMedia) {
        media = [];
        const folders = [''];
        while (folders.length) {
          const prefix = folders.shift() as string;
          for (let offset = 0; ; offset += 1000) {
            setBackupProgress(`Lista de mídias: ${media.length.toLocaleString('pt-BR')} arquivos…`);
            const { data: items, error } = await supabase.storage.from(MEDIA_BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
            if (error) throw new Error(`lista de mídias: ${error.message}`);
            for (const it of items || []) {
              const path = prefix ? `${prefix}/${it.name}` : it.name;
              if (!it.id) { folders.push(path); continue; } // pasta
              const meta = (it.metadata || {}) as { size?: number; mimetype?: string };
              media.push({
                path,
                name: it.name,
                size: typeof meta.size === 'number' ? meta.size : null,
                mimetype: meta.mimetype || null,
                updated_at: it.updated_at || null,
                url: supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
              });
            }
            if (!items || items.length < 1000) break;
          }
        }
      }

      const now = Date.now();
      // Resumo no começo do arquivo: data/hora, linhas por tabela e a versão da extensão
      const summary = buildBackupSummary({ now, extensionVersion: EXTENSION_VERSION, tables, skipped, mediaFiles: media ? media.length : null });
      const backup = { version: '2.1', summary, ...summary, data };

      setBackupProgress('Gerando o arquivo…');
      const day = new Date(now).toISOString().split('T')[0];
      const download = (content: unknown, filename: string) => {
        const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };
      download(backup, `triumph-store-backup-${day}.json`);
      if (media) {
        download({
          bucket: MEDIA_BUCKET,
          exportDate: summary.exportDate,
          exportDateLocal: summary.exportDateLocal,
          files: media.length,
          totalBytes: media.reduce((s, m) => s + (m.size || 0), 0),
          list: media,
        }, `triumph-store-midias-${day}.json`);
      }
      try { localStorage.setItem(LAST_BACKUP_KEY, String(now)); } catch { /* navegador sem armazenamento */ }
      setLastBackupAt(now);

      setBackupProgress(`Concluído: ${tables.length} tabelas, ${summary.totalRows.toLocaleString('pt-BR')} linhas${media ? `, ${media.length.toLocaleString('pt-BR')} arquivos de mídia na lista` : ''}${skipped.length ? ` (puladas: ${skipped.map((x) => x.name).join(', ')})` : ''}.`);
      alert('Backup exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar backup:', error);
      setBackupProgress('');
      alert('Erro ao exportar backup. Por favor, tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const inputClass = "w-full bg-gray-900 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-orange-500 focus:outline-none text-sm";

  return (
    <div className="p-8">
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold text-white mb-2">Configurações</h1>
        <p className="text-gray-400 mb-8">Gerencie as configurações do sistema</p>

        {loadingConfig ? (
          <div className="text-gray-400 mb-8">Carregando configurações...</div>
        ) : (
          <div className="bg-gray-800 rounded-lg border border-gray-700 mb-8">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-1">Dados da Loja e Taxas</h2>
              <p className="text-gray-400 text-sm">
                Esses valores alimentam o recibo de venda, o cálculo de taxa da maquininha e os relatórios financeiros.
              </p>
            </div>

            <div className="p-6 space-y-8">
              {/* Dados da Loja */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Dados da Loja</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {STORE_FIELDS.map(f => (
                    <div key={f.key} className={f.multiline ? 'md:col-span-2' : ''}>
                      <label className="block text-sm font-medium text-gray-300 mb-1.5">{f.label}</label>
                      {f.multiline ? (
                        <textarea
                          value={storeForm[f.key] ?? ''}
                          onChange={e => setStoreForm({ ...storeForm, [f.key]: e.target.value })}
                          placeholder={f.placeholder}
                          rows={2}
                          className={inputClass}
                        />
                      ) : (
                        <input
                          type="text"
                          value={storeForm[f.key] ?? ''}
                          onChange={e => setStoreForm({ ...storeForm, [f.key]: e.target.value })}
                          placeholder={f.placeholder}
                          className={inputClass}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Taxas da Maquininha */}
              <div>
                <h3 className="text-lg font-medium text-white mb-1">Taxas da Maquininha</h3>
                <p className="text-gray-500 text-xs mb-4">Percentual cobrado sobre o valor da venda, por bandeira e parcelamento.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="py-2 pr-3 font-medium">Forma</th>
                        <th className="py-2 px-3 font-medium">Visa / Mastercard</th>
                        <th className="py-2 px-3 font-medium">Elo / Amex</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-700/50">
                        <td className="py-2 pr-3 text-gray-300">Débito</td>
                        {(['vm', 'ea'] as const).map(brand => (
                          <td key={brand} className="py-2 px-3">
                            <div className="relative w-28">
                              <input
                                type="number" step="0.01" min="0"
                                value={feeForm[`fee_${brand}_debit`] ?? ''}
                                onChange={e => setFeeForm({ ...feeForm, [`fee_${brand}_debit`]: e.target.value })}
                                className={inputClass + ' pr-6'}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                            </div>
                          </td>
                        ))}
                      </tr>
                      {INSTALLMENTS.map(n => (
                        <tr key={n} className="border-b border-gray-700/50">
                          <td className="py-2 pr-3 text-gray-300">Crédito {n}x</td>
                          {(['vm', 'ea'] as const).map(brand => (
                            <td key={brand} className="py-2 px-3">
                              <div className="relative w-28">
                                <input
                                  type="number" step="0.01" min="0"
                                  value={feeForm[`fee_${brand}_credit_${n}`] ?? ''}
                                  onChange={e => setFeeForm({ ...feeForm, [`fee_${brand}_credit_${n}`]: e.target.value })}
                                  className={inputClass + ' pr-6'}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Taxas do Link de Pagamento */}
              <div>
                <h3 className="text-lg font-medium text-white mb-1">Link de pagamento</h3>
                <p className="text-gray-500 text-xs mb-4">Percentual cobrado no link de pagamento, por bandeira e parcelamento (na Rede, 1 ponto a mais que a maquininha).</p>
                <div className="mb-4 max-w-xs">
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Taxas do link valem a partir de</label>
                  <input
                    type="date"
                    value={linkStartDate}
                    onChange={e => setLinkStartDate(e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-gray-500 text-xs mt-1">Vendas por link antes dessa data continuam com a taxa do crédito.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="py-2 pr-3 font-medium">Forma</th>
                        <th className="py-2 px-3 font-medium">Visa / Mastercard</th>
                        <th className="py-2 px-3 font-medium">Elo / Amex</th>
                      </tr>
                    </thead>
                    <tbody>
                      {INSTALLMENTS.map(n => (
                        <tr key={n} className="border-b border-gray-700/50">
                          <td className="py-2 pr-3 text-gray-300">Link {n}x</td>
                          {(['vm', 'ea'] as const).map(brand => (
                            <td key={brand} className="py-2 px-3">
                              <div className="relative w-28">
                                <input
                                  type="number" step="0.01" min="0"
                                  value={feeForm[`fee_link_${brand}_credit_${n}`] ?? ''}
                                  onChange={e => setFeeForm({ ...feeForm, [`fee_link_${brand}_credit_${n}`]: e.target.value })}
                                  className={inputClass + ' pr-6'}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Outros */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Outros</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Custo de embalagem por unidade (R$)</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={packagingCost}
                      onChange={e => setPackagingCost(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Imposto sobre ads (%)</label>
                    <div className="relative">
                      <input
                        type="number" step="0.01" min="0"
                        value={adTaxPercent}
                        onChange={e => setAdTaxPercent(e.target.value)}
                        className={inputClass + ' pr-6'}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2 border-t border-gray-700">
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                >
                  {savingConfig ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save size={20} />
                      <span>Salvar Configurações</span>
                    </>
                  )}
                </button>
                {savedAt && !savingConfig && (
                  <span className="flex items-center gap-1.5 text-green-400 text-sm mt-4">
                    <CheckCircle2 size={16} /> Salvo com sucesso
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-6 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-1">Backup do Sistema</h2>
            <p className="text-gray-400 text-sm">
              Exporte todos os dados do sistema em formato JSON
            </p>
          </div>

          <div className="p-6">
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-medium text-white mb-3">Exportar Backup Completo</h3>
              <p className="text-gray-400 text-sm mb-4">
                O backup inclui todas as tabelas do sistema: vendas e itens, pequenas vendas, produtos,
                estoque, fornecedores, custos, anúncios, motoboys, configurações e todo o WhatsApp/CRM.
                Cada tabela é buscada por vez, sem cortar linhas. Use este arquivo para restaurar o sistema posteriormente.
              </p>

              <p className="text-sm text-gray-300 mb-2">
                Último backup baixado: {lastBackupAt ? formatBackupWhen(lastBackupAt) : 'nenhum neste navegador'}
              </p>
              {isBackupStale(lastBackupAt, Date.now()) && (
                <div className="mb-4 p-3 rounded border border-yellow-600 bg-yellow-900/30 text-yellow-300 text-sm">
                  {lastBackupAt ? 'Faz mais de 7 dias desde o último backup.' : 'Nenhum backup baixado neste navegador ainda.'} Baixe um agora.
                </div>
              )}

              <label className="flex items-center gap-2 mb-4 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMedia}
                  onChange={(e) => setIncludeMedia(e.target.checked)}
                  disabled={isExporting}
                  className="accent-orange-500"
                />
                Incluir lista de arquivos de mídia (nome, tamanho e link do bucket wa-media, num arquivo separado; não baixa os arquivos)
              </label>

              <button
                onClick={exportBackup}
                disabled={isExporting}
                className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Exportando...</span>
                  </>
                ) : (
                  <>
                    <Download size={20} />
                    <span>Exportar Backup</span>
                  </>
                )}
              </button>

              {backupProgress && (
                <p className="mt-3 text-sm text-gray-300">{backupProgress}</p>
              )}

              <div className="mt-4 p-4 bg-gray-800 rounded border border-gray-700">
                <p className="text-xs text-gray-400">
                  <strong className="text-gray-300">Nota:</strong> O arquivo de backup contém
                  todos os dados sensíveis do sistema. Mantenha-o em local seguro.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
