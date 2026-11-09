// Página do teste no Chrome real: só a aba WhatsApp do ERP (Painel e Rastreamento), com o Supabase falso
// (fakeSupabase.ts entra no lugar de src/lib/supabase.ts no pacote do teste). Ver scripts/tests/waChrome.test.ts.
import { createRoot } from 'react-dom/client';
import WhatsApp from '../../../src/pages/WhatsApp';

const el = document.getElementById('root');
if (el) createRoot(el).render(<WhatsApp />);
