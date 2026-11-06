// Aba "Clientes → CRM": filtra as vendas, agrupa por cliente (telefone) e manda para uma etiqueta CRM.
import { useEffect, useMemo, useState } from 'react';
import { applyItemAndClientFilters, clientsCsv, type Client, type ClientFilters, type SaleItemRow, type SaleRow } from '../../lib/crmBridge';
import { loadClientSales, loadFilterOptions, loadLabels, pushClientsToLabel, type PushResult, type WaLabelRow } from '../../lib/crmBridgeDb';
import { btn, btnPrimary, card, Field, input, LabelChooser, money, muted, Progress } from './shared';
import { SectionHeader } from './ui';

const DEFAULT_FILTERS: ClientFilters = {
  period: 'last_days', days: 90, start: '', end: '', productIds: [], city: '', neighborhood: '', deliveryType: '',
  minTotal: '', maxTotal: '', minPurchases: 1, onlyFinalized: true,
};

const dateBr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export default function ClientsToCrm() {
  const [filters, setFilters] = useState<ClientFilters>(DEFAULT_FILTERS);
  const [options, setOptions] = useState<{ products: any[]; cities: any[]; neighborhoods: any[] }>({ products: [], cities: [], neighborhoods: [] });
  const [labels, setLabels] = useState<WaLabelRow[]>([]);
  const [data, setData] = useState<{ sales: SaleRow[]; items: SaleItemRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [labelId, setLabelId] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<PushResult | null>(null);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    loadFilterOptions().then(setOptions).catch(() => {});
    loadLabels().then(setLabels).catch(() => {});
  }, []);

  const set = (patch: Partial<ClientFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const search = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setData(await loadClientSales(filters));
    } catch (e: any) {
      setError(e.message || 'Erro ao buscar as vendas');
    }
    setLoading(false);
  };

  const grouped = useMemo(() => (data ? applyItemAndClientFilters(data.sales, data.items, filters) : null), [data, filters.productIds, filters.minPurchases]);
  const clients: Client[] = grouped ? grouped.clients : [];

  const send = async () => {
    if (!labelId || !clients.length) return;
    setResult(null);
    setProgress({ done: 0, total: clients.length });
    try {
      const r = await pushClientsToLabel(clients, labelId, (done, total) => setProgress({ done, total }));
      setResult({ ...r, skipped: r.skipped + (grouped ? grouped.invalidPhones : 0) });
    } catch (e: any) {
      setError(e.message || 'Erro ao gravar no CRM');
    }
    setProgress(null);
  };

  const exportCsv = () => {
    const blob = new Blob([`﻿${clientsCsv(clients)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-crm-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const productList = options.products.filter((p) => `${p.model} ${p.color || ''}`.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 50);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader title="Clientes → CRM" subtitle="Filtre as vendas do ERP e mande os clientes para uma etiqueta CRM do WhatsApp" />
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          <Field label="Período da compra">
            <select aria-label="Período" value={filters.period} onChange={(e) => set({ period: e.target.value as ClientFilters['period'] })} style={input}>
              <option value="last_days">Últimos X dias</option>
              <option value="older_than">Há mais de X dias</option>
              <option value="between">Entre datas</option>
              <option value="all">Todo o período</option>
            </select>
          </Field>
          {(filters.period === 'last_days' || filters.period === 'older_than') && (
            <Field label="Dias">
              <input aria-label="Dias" type="number" min={1} value={filters.days} onChange={(e) => set({ days: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} style={input} />
            </Field>
          )}
          {filters.period === 'between' && (<>
            <Field label="De"><input aria-label="De" type="date" value={filters.start} onChange={(e) => set({ start: e.target.value })} style={input} /></Field>
            <Field label="Até"><input aria-label="Até" type="date" value={filters.end} onChange={(e) => set({ end: e.target.value })} style={input} /></Field>
          </>)}
          <Field label="Cidade">
            <select aria-label="Cidade" value={filters.city} onChange={(e) => set({ city: e.target.value })} style={input}>
              <option value="">Todas</option>
              {options.cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Bairro">
            <select aria-label="Bairro" value={filters.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} style={input}>
              <option value="">Todos</option>
              {options.neighborhoods.map((n) => <option key={n.id} value={n.name}>{n.name}</option>)}
            </select>
          </Field>
          <Field label="Forma de entrega">
            <select aria-label="Forma de entrega" value={filters.deliveryType} onChange={(e) => set({ deliveryType: e.target.value })} style={input}>
              <option value="">Todas</option>
              <option value="motoboy">Motoboy</option>
              <option value="correios">Correios (SEDEX)</option>
              <option value="loja_fisica">Loja Física</option>
            </select>
          </Field>
          <Field label="Valor da venda mín. (R$)"><input aria-label="Valor mínimo" type="number" min={0} value={filters.minTotal} onChange={(e) => set({ minTotal: e.target.value })} style={input} /></Field>
          <Field label="Valor da venda máx. (R$)"><input aria-label="Valor máximo" type="number" min={0} value={filters.maxTotal} onChange={(e) => set({ maxTotal: e.target.value })} style={input} /></Field>
          <Field label="Quantidade de compras">
            <select aria-label="Quantidade de compras" value={filters.minPurchases} onChange={(e) => set({ minPurchases: Number(e.target.value) })} style={input}>
              <option value={1}>1 ou mais</option>
              <option value={2}>2+</option>
              <option value={3}>3+</option>
            </select>
          </Field>
          <Field label="Status">
            <select aria-label="Status" value={filters.onlyFinalized ? 'fin' : 'all'} onChange={(e) => set({ onlyFinalized: e.target.value === 'fin' })} style={input}>
              <option value="fin">Só finalizadas</option>
              <option value="all">Todas as válidas (sem canceladas/reembolsadas)</option>
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label={`Produto ou modelo${filters.productIds.length ? ` (${filters.productIds.length} escolhido${filters.productIds.length === 1 ? '' : 's'})` : ''}`}>
            <input aria-label="Buscar produto" placeholder="Buscar produto…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} style={input} />
          </Field>
          {productSearch && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {productList.map((p) => {
                const on = filters.productIds.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => set({ productIds: on ? filters.productIds.filter((x) => x !== p.id) : [...filters.productIds, p.id] })}
                    style={{ ...btn, padding: '4px 10px', fontSize: 12, borderColor: on ? '#f97316' : 'var(--border-main)', color: on ? '#f97316' : 'var(--text-primary)' }}>
                    {p.model} {p.color}
                  </button>
                );
              })}
            </div>
          )}
          {filters.productIds.length > 0 && <button type="button" style={{ ...btn, marginTop: 8, fontSize: 12 }} onClick={() => set({ productIds: [] })}>Limpar produtos</button>}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button type="button" style={btnPrimary} onClick={search} disabled={loading}>{loading ? 'Buscando…' : 'Buscar clientes'}</button>
          <button type="button" style={btn} onClick={() => { setFilters(DEFAULT_FILTERS); setData(null); }}>Limpar filtros</button>
        </div>
        {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>

      {grouped && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <div>
              <b style={{ fontSize: 15, color: 'var(--text-primary)' }}>{clients.length} cliente{clients.length === 1 ? '' : 's'}</b>
              <span style={{ ...muted, marginLeft: 10 }}>{grouped.invalidSales} venda{grouped.invalidSales === 1 ? '' : 's'} sem telefone válido (fora da lista)</span>
            </div>
            <button type="button" style={btn} onClick={exportCsv} disabled={!clients.length}>Exportar CSV</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>Enviar para etiqueta CRM</b>
            <LabelChooser labels={labels} value={labelId} onChange={setLabelId} onCreated={(l) => setLabels((ls) => [...ls, l])} />
            <div><button type="button" style={btnPrimary} disabled={!labelId || !clients.length || !!progress} onClick={send}>Enviar {clients.length} para a etiqueta</button></div>
            {progress && <Progress done={progress.done} total={progress.total} />}
            {result && (
              <p style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                Pronto: <b>{result.added}</b> adicionados à etiqueta · <b>{result.already}</b> já estavam · <b>{result.skipped}</b> pulados por telefone inválido
                {result.created ? ` · ${result.created} contatos novos no CRM` : ''}
              </p>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  {['Nome', 'Telefone', 'Compras', 'Total gasto', 'Última compra', 'Último produto'].map((h) => <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-main)' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {clients.slice(0, 500).map((c) => (
                  <tr key={c.phone} style={{ color: 'var(--text-primary)' }}>
                    <td style={{ padding: '6px 8px' }}>{c.name || '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{c.phone}</td>
                    <td style={{ padding: '6px 8px' }}>{c.purchases}</td>
                    <td style={{ padding: '6px 8px' }}>{money(c.total)}</td>
                    <td style={{ padding: '6px 8px' }}>{dateBr(c.lastDate)}</td>
                    <td style={{ padding: '6px 8px' }}>{c.lastProduct || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clients.length > 500 && <p style={{ ...muted, marginTop: 8 }}>Mostrando 500 de {clients.length} (o envio e o CSV usam todos).</p>}
          </div>
        </div>
      )}
    </div>
  );
}
