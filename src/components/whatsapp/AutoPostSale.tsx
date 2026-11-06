// Aba "Pós-venda automático": venda FINALIZADA → cliente na etiqueta CRM (gatilho no banco).
import { useEffect, useState } from 'react';
import { finalizedSalesSince, loadAutoClient, loadLabels, pushPhonesToLabel, saveAutoClient, type AutoClientSettings, type PushResult, type WaLabelRow } from '../../lib/crmBridgeDb';
import { btn, btnPrimary, card, Field, input, LabelChooser, muted, Progress } from './shared';
import { SectionHeader } from './ui';

export default function AutoPostSale() {
  const [cfg, setCfg] = useState<AutoClientSettings | null>(null);
  const [labels, setLabels] = useState<WaLabelRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [labelId, setLabelId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [days, setDays] = useState(30);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<PushResult | null>(null);

  useEffect(() => {
    Promise.all([loadAutoClient(), loadLabels()]).then(([c, l]) => {
      setCfg(c);
      setLabels(l);
      setEnabled(c.enabled);
      setLabelId(c.labelId || (l.find((x) => x.name.toLowerCase() === 'cliente') || { id: '' }).id);
    }).catch(() => setCfg({ available: false, enabled: false, labelId: null }));
  }, []);

  const save = async () => {
    setMsg('');
    if (enabled && !labelId) { setMsg('Escolha a etiqueta CRM.'); setErr(true); return; }
    try {
      await saveAutoClient(enabled, labelId || null);
      setMsg(enabled ? 'Ligado: toda venda finalizada vai pôr o cliente na etiqueta.' : 'Desligado.');
      setErr(false);
    } catch (e: any) {
      setMsg(e.message || 'Não consegui salvar');
      setErr(true);
    }
  };

  const applyPast = async () => {
    setConfirming(false);
    setResult(null);
    if (!labelId) { setMsg('Escolha a etiqueta CRM.'); setErr(true); return; }
    try {
      const sales = await finalizedSalesSince(days);
      setProgress({ done: 0, total: sales.length });
      const r = await pushPhonesToLabel(sales.map((s) => ({ phone: s.customer_phone, name: s.customer_name || '' })), labelId, (done, total) => setProgress({ done, total }));
      setResult(r);
    } catch (e: any) {
      setMsg(e.message || 'Erro ao aplicar');
      setErr(true);
    }
    setProgress(null);
  };

  if (!cfg) return <div style={card}><span style={muted}>Carregando…</span></div>;
  if (!cfg.available) {
    return <div style={card}><b style={{ color: 'var(--text-primary)' }}>Atualize o banco para usar este recurso</b><p style={muted}>Aplique a migration 20261103180000_erp_crm_bridge.sql no Supabase.</p></div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader title="Pós-venda automático" subtitle="Venda finalizada no ERP → cliente na etiqueta CRM do WhatsApp" />
      <div style={card}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Quando uma venda for FINALIZADA, colocar o cliente na etiqueta CRM:
        </label>
        <div style={{ marginTop: 10 }}>
          <LabelChooser labels={labels} value={labelId} onChange={setLabelId} onCreated={(l) => setLabels((ls) => [...ls, l])} />
        </div>
        <p style={{ ...muted, marginTop: 10 }}>
          Funciona no próprio banco: vale para qualquer tela que finalize a venda. Telefones inválidos são ignorados e nunca impedem a finalização.
          Combine com a automação 'Pedido de avaliação' na extensão (entrou em Cliente há 15 dias → envia o link do Google).
        </p>
        <div style={{ marginTop: 10 }}><button type="button" style={btnPrimary} onClick={save}>Salvar</button></div>
        {msg && <p style={{ fontSize: 13, marginTop: 8, color: err ? '#ef4444' : 'var(--text-primary)' }}>{msg}</p>}
      </div>
      <div style={card}>
        <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>Aplicar também às vendas já finalizadas</b>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
          <Field label="Finalizadas nos últimos (dias)">
            <input aria-label="Dias" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Math.max(1, Math.floor(Number(e.target.value) || 1)))} style={input} />
          </Field>
          {!confirming
            ? <button type="button" style={btn} disabled={!!progress} onClick={() => setConfirming(true)}>Aplicar também às vendas finalizadas dos últimos {days} dias</button>
            : (<>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Colocar na etiqueta todos os clientes dessas vendas?</span>
              <button type="button" style={btnPrimary} onClick={applyPast}>Confirmar</button>
              <button type="button" style={btn} onClick={() => setConfirming(false)}>Cancelar</button>
            </>)}
        </div>
        {progress && <div style={{ marginTop: 10 }}><Progress done={progress.done} total={progress.total} /></div>}
        {result && (
          <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text-primary)' }}>
            Pronto: <b>{result.added}</b> adicionados · <b>{result.already}</b> já estavam · <b>{result.skipped}</b> pulados por telefone inválido
          </p>
        )}
      </div>
    </div>
  );
}
