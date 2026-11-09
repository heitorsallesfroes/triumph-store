// Página do teste do ERP inteiro (scripts/tests/erpChrome.test.ts): o App de verdade (menu, páginas, rotas, botão
// "Atualizar", aviso de versão), com o Supabase falso no lugar de src/lib/supabase.ts. Sem o AuthGate (já "logado").
import { createRoot } from 'react-dom/client';
import App from '../../../src/App';

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
