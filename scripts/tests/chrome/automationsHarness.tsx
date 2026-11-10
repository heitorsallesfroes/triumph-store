// Página do teste no Chrome real: só a aba "⚡ Automações" do ERP. O supabase do pacote é o falso (fakeSupabase.ts,
// dados em window.__DB) ou, com REAL=1, o só-leitura dos dados reais (realSupabase.ts). Ver waAutomationsChrome.test.ts.
import { createRoot } from 'react-dom/client';
import WaAutomations from '../../../src/components/whatsapp/WaAutomations';

const el = document.getElementById('root');
if (el) createRoot(el).render(<div style={{ padding: '20px clamp(16px, 3vw, 32px)', maxWidth: 1200, margin: '0 auto' }}><WaAutomations /></div>);
