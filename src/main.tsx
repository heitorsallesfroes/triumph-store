import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import AuthGate from './components/AuthGate';
import './index.css';
import { instalarRecargaDeChunk } from './lib/chunkReload';
import { isPageDirty } from './lib/erpRefresh';

// versão nova publicada com a página aberta: import dinâmico que falha recarrega uma vez (ou avisa)
instalarRecargaDeChunk({ digitando: isPageDirty });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>
);
