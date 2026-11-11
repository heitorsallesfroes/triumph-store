// Visão geral do Instagram → cartão "Funil Instagram → WhatsApp → venda" do período: comentários e DMs recebidos →
// DMs automáticas → cliques nos links /l/ → conversas no WhatsApp (frase/código do Instagram) → vendas → R$.
import { useEffect, useState } from 'react';
import { lastDays } from '../../lib/igLinksDb';
import { funnelOf, type Funnel } from '../../lib/igAuto';
import { IG_AUTO_MIGRATION, loadClicksByLink, loadConvSales, loadReceived, loadRuns } from '../../lib/igAutoDb';
import { ORANGE, box, eyebrow, money, muted, pct } from './igStyles';

export default function IgFunnel({ days }: { days: number }) {
  const [f, setF] = useState<{ funnel: Funnel; missing: boolean } | null>(null);
  useEffect(() => {
    let off = false;
    setF(null);
    const r = lastDays(days);
    Promise.all([loadReceived(r), loadRuns(r), loadClicksByLink(r), loadConvSales(r)]).then(([rec, runs, clicks, cv]) => {
      if (off) return;
      setF({ missing: rec.missing, funnel: funnelOf({ comments: rec.comments, dmsIn: rec.dmsIn, runs, clicks: [...clicks.values()].reduce((a, b) => a + b, 0), convs: cv.convs }) });
    }).catch(() => { if (!off) setF({ missing: true, funnel: funnelOf({ comments: 0, dmsIn: 0, runs: [], clicks: 0, convs: [] }) }); });
    return () => { off = true; };
  }, [days]);
  const steps: [string, string, string | null][] = f ? [
    ['Comentários e DMs recebidos', String(f.funnel.received), `${f.funnel.comments} comentários · ${f.funnel.dmsIn} DMs`],
    ['DMs automáticas', String(f.funnel.autoDms), f.funnel.received ? `${pct(f.funnel.autoDms / f.funnel.received)} dos recebidos` : null],
    ['Cliques nos links', String(f.funnel.clicks), null],
    ['Conversas no WhatsApp', String(f.funnel.conversations), f.funnel.autoDms ? `${pct(f.funnel.conversations / f.funnel.autoDms)} das DMs` : null],
    ['Vendas', String(f.funnel.sales), f.funnel.conversations ? `${pct(f.funnel.buyers / f.funnel.conversations)} das conversas` : null],
    ['Faturamento', money(f.funnel.revenue), null],
  ] : [];
  return (
    <div style={{ ...box, marginBottom: 16 }} data-testid="ig-funnel">
      <div style={eyebrow}>Funil Instagram → WhatsApp → venda · {days} dias</div>
      {!f && <div style={{ ...muted, marginTop: 8 }}>Carregando…</div>}
      {f && f.missing && <div style={{ ...muted, marginTop: 6 }}>Aplique a migration {IG_AUTO_MIGRATION} para contar comentários, DMs e DMs automáticas.</div>}
      {f && (
        <div className="igf" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 10 }}>
          {steps.map(([k, v, sub], i) => (
            <div key={k} style={{ borderLeft: `3px solid ${ORANGE}`, opacity: 1 - i * 0.06, padding: '4px 10px' }} data-testid="ig-funnel-step">
              <div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{k}</div>
              {sub && <div style={muted}>{sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
