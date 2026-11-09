import { useEffect, useState } from 'react';
import { initialTab, writeTab } from '../lib/erpRoute';
import { MessageCircle } from 'lucide-react';
import WaPanel from '../components/whatsapp/WaPanel';
import WaTracking from '../components/whatsapp/WaTracking';
import WaResults from '../components/whatsapp/WaResults';

// Página WhatsApp do ERP: só os resultados. Mensagens, etiquetas, clientes no CRM, automações (inclusive o
// pós-venda) e conversões ficam na extensão do WhatsApp Web. As tabelas e os dados das telas antigas
// (Clientes → CRM, Pós-venda automático, Resultados, Mensagens) continuam no banco; só as telas saíram.
const ORANGE = '#f97316';
// ERP 09/11: cada aba responde uma pergunta — Painel (como estou?), Rastreamento (de onde vêm e onde estão as
// conversas, como o Tintim) e Resultados (meus follow-ups funcionam?)
type PageTab = 'painel' | 'rastreamento' | 'resultados';
const PAGE_TABS: [PageTab, string][] = [['painel', 'Painel'], ['rastreamento', 'Rastreamento'], ['resultados', 'Resultados']];

export default function WhatsApp() {
  // sub-aba no endereço (?aba=rastreamento): o F5 volta para ela
  const [pageTab, setPageTab] = useState<PageTab>(() => initialTab('whatsapp', PAGE_TABS.map(([id]) => id), 'painel'));
  useEffect(() => { writeTab('whatsapp', pageTab); }, [pageTab]);
  return (
    <div>
      <div style={{ padding: '28px 32px 0', maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, margin: 0 }}>
          <MessageCircle size={28} color={ORANGE} />
          WhatsApp
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>Resultados do WhatsApp, rastreamento das conversas e eventos enviados ao Facebook</p>
        <div style={{ display: 'flex', gap: 4, marginTop: 18, borderBottom: '1px solid var(--border-main)', flexWrap: 'wrap' }}>
          {PAGE_TABS.map(([id, label]) => (
            <button key={id} onClick={() => setPageTab(id)}
              style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: 'none', marginBottom: -1,
                borderBottom: pageTab === id ? `2px solid ${ORANGE}` : '2px solid transparent',
                color: pageTab === id ? ORANGE : 'var(--text-muted)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '20px 32px 28px', maxWidth: 1200, margin: '0 auto' }}>
        {pageTab === 'painel' && <WaPanel />}
        {pageTab === 'rastreamento' && <WaTracking />}
        {pageTab === 'resultados' && <WaResults />}
      </div>
    </div>
  );
}
