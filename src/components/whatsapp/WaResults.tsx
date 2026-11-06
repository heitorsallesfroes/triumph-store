// Aba "Resultados": envios automáticos (wa_send_log), vendas pela conversa, origem e conversão.
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { computeResults } from '../../lib/crmBridge';
import { loadResults } from '../../lib/crmBridgeDb';
import { ORANGE, card, money, muted } from './shared';
import { eyebrow, SectionHeader, StatCard, fmtInt, fmtMoney, fmtPct } from './ui';

const SOURCE_LABEL: Record<string, string> = { follow: 'Automações (follow)', disparo: 'Disparos', agendado: 'Agendados' };
const STATUS_ORDER = ['enviado', 'falhou', 'pulado', 'enviando'];

export default function WaResults() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ r: ReturnType<typeof computeResults>; logAvailable: boolean; originAvailable: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    loadResults(days)
      .then((raw) => setData({ r: computeResults(raw), logAvailable: raw.logAvailable, originAvailable: raw.originAvailable }))
      .catch((e) => setError(e.message || 'Erro ao carregar'));
  }, [days]);

  const box = (title: string, body: React.ReactNode) => (
    <div style={card}>
      <div style={{ ...eyebrow, marginBottom: 8 }}>{title}</div>
      {body}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader title="Resultados dos envios automáticos" subtitle="Automações, disparos e agendados (o Painel mostra tudo junto, com respostas e leads)" right={(
        <div role="group" aria-label="Período" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--bg-inner)', border: '1px solid var(--border-main)' }}>
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: days === d ? ORANGE : 'transparent', color: days === d ? '#fff' : 'var(--text-muted)' }}>{d} dias</button>
          ))}
        </div>
      )} />
      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
      {!data && !error && <span style={muted}>Carregando…</span>}
      {data && (<>
        {data.originAvailable && data.logAvailable && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <StatCard accent label="Vendas pela conversa" value={fmtMoney(data.r.chatSales.total)} sub={`${fmtInt(data.r.chatSales.count)} venda${data.r.chatSales.count === 1 ? '' : 's'} registradas pelo 💰`} />
            <StatCard label="Receberam envio automático" value={fmtInt(data.r.conversion.reached)} sub="contatos no período" />
            <StatCard label="Compraram em até 7 dias" value={fmtInt(data.r.conversion.converted)} sub={fmtPct(data.r.conversion.reached ? data.r.conversion.converted / data.r.conversion.reached : null)} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {box('ENVIOS AUTOMÁTICOS', !data.logAvailable ? <span style={muted}>Atualize o banco para usar este recurso.</span> : (
            Object.keys(data.r.bySource).length === 0 ? <span style={muted}>Nenhum envio no período.</span> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(data.r.bySource).map(([src, st]) => (
                  <div key={src} style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    <b>{SOURCE_LABEL[src] || src}</b>: {STATUS_ORDER.filter((k) => st[k]).map((k) => `${st[k]} ${k}`).join(' · ')}
                  </div>
                ))}
              </div>
            )))}
          {box('VENDAS PELA CONVERSA', !data.originAvailable ? <span style={muted}>Atualize o banco para usar este recurso.</span> : (
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}><b style={{ fontSize: 20 }}>{data.r.chatSales.count}</b> venda{data.r.chatSales.count === 1 ? '' : 's'} · {money(data.r.chatSales.total)}</div>
          ))}
          {box('VENDAS POR ORIGEM', !data.originAvailable ? <span style={muted}>Atualize o banco para usar este recurso.</span> : (
            <div style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Anúncio: <b>{data.r.origin.anuncio.count}</b> · {money(data.r.origin.anuncio.total)}</span>
              <span>Orgânico: <b>{data.r.origin.organico.count}</b> · {money(data.r.origin.organico.total)}</span>
              <span style={muted}>Sem origem (vendas feitas no ERP): {data.r.origin.semOrigem}</span>
              {data.r.topAds.length > 0 && <b style={{ marginTop: 6 }}>Top anúncios</b>}
              {data.r.topAds.map((a) => <span key={a.title}>{a.title}: {a.count} · {money(a.total)}</span>)}
            </div>
          ))}
          {box('CONVERSÃO (ATÉ 7 DIAS)', !data.logAvailable ? <span style={muted}>Atualize o banco para usar este recurso.</span> : (
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              <b style={{ fontSize: 20 }}>{data.r.conversion.converted}</b> de {data.r.conversion.reached} contatos que receberam envio automático compraram em até 7 dias
              {data.r.conversion.reached ? ` (${Math.round((data.r.conversion.converted / data.r.conversion.reached) * 100)}%)` : ''}
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{ ...eyebrow, marginBottom: 8 }}>Envios e vendas por dia</div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={data.r.daily.map((d) => ({ ...d, dia: d.day.slice(8, 10) + '/' + d.day.slice(5, 7) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="envios" name="Envios automáticos" fill={ORANGE} />
                <Bar dataKey="vendas" name="Vendas" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>)}
    </div>
  );
}
