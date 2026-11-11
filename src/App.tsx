import { Fragment, useState, useEffect } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Products from './pages/Products';
import StockControl from './pages/StockControl';
import Sales from './pages/Sales';
import SalesHistory from './pages/SalesHistory';
import Motoboys from './pages/Motoboys';
import Logistics from './pages/Logistics';
import Marketing from './pages/Marketing';
import AdDashboard from './pages/AdDashboard'; // Gerenciador novo (a versão antiga fica dentro dele)
import WhatsApp from './pages/WhatsApp';
import Instagram from './pages/Instagram';
import Settings from './pages/Settings';
import OperationalCosts from './pages/OperationalCosts';
import ResumoMensal from './pages/ResumoMensal';
import ResumoVendas from './pages/ResumoVendas';
import ResumoAnual from './pages/ResumoAnual';
import SmallSales from './pages/SmallSales';
import CorreiosTracking from './pages/CorreiosTracking';
import { loadSystemConfig } from './lib/systemConfig';
import { takeErpLink } from './lib/erpLink';
import { initialRoute, parseRoute, readStored, writeRoute } from './lib/erpRoute';

function App() {
  // Página ao abrir (depois do login, o App só monta dentro do AuthGate): o link da extensão
  // (?pagina=historico&venda=<id> ou ?pagina=nova-venda&nome=...&telefone=..., lido uma vez) vale primeiro; depois a
  // página e a sub-aba do endereço (?pagina=whatsapp&aba=rastreamento, o F5 volta para elas); depois a última aberta
  // neste navegador; senão o Início. A rota do endereço é lida ANTES do link (que tira os parâmetros dele).
  const [boot] = useState(() => {
    const fromUrl = parseRoute(window.location.search);
    const link = takeErpLink();
    const route = initialRoute(link ? link.page : null, fromUrl, readStored());
    writeRoute(route);
    return { link, route };
  });
  const erpLink = boot.link;
  const [currentPage, setPage] = useState<string>(boot.route.page);
  const [focusSaleId, setFocusSaleId] = useState<string | null>(erpLink?.saleId ?? null);
  const [salePrefill, setSalePrefill] = useState<{ name: string; phone: string } | null>(erpLink?.prefill ?? null);
  // Trocar de tela pelo menu esquece o link (voltar à tela não repete o destaque nem o preenchimento) e entra no
  // histórico do navegador (voltar/avançar navegam entre as páginas do ERP)
  const setCurrentPage = (page: string) => {
    setFocusSaleId(null);
    setSalePrefill(null);
    writeRoute({ page, tab: null }, { push: true });
    setPage(page);
  };
  const [triggerFastSale, setTriggerFastSale] = useState(0);
  const [configReady, setConfigReady] = useState(false);
  // "Atualizar" sem nenhuma página registrada: remonta a página com uma chave nova
  const [remountKey, setRemountKey] = useState(0);

  useEffect(() => {
    loadSystemConfig().finally(() => setConfigReady(true));
  }, []);

  // voltar/avançar do navegador
  useEffect(() => {
    const onPop = () => {
      const r = parseRoute(window.location.search) || { page: 'home', tab: null };
      writeRoute(r);
      setFocusSaleId(null);
      setSalePrefill(null);
      setPage(r.page);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.key === 'F2' && !isTyping) {
        e.preventDefault();
        setFocusSaleId(null);
        setSalePrefill(null);
        writeRoute({ page: 'sales', tab: null }, { push: true });
        setPage('sales');
        setTriggerFastSale(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onNavigate={setCurrentPage} />;
      case 'products':
        return <Products />;
      case 'stock':
        return <StockControl />;
      case 'sales':
        return <Sales triggerFastSale={triggerFastSale} onNavigate={setCurrentPage} prefill={salePrefill} />;
      case 'small-sales':
        return <SmallSales />;
      case 'history':
        return <SalesHistory focusSaleId={focusSaleId} />;
      case 'motoboys':
        return <Motoboys />;
      case 'logistics':
        return <Logistics />;
      case 'rastreamento-sedex':
        return <CorreiosTracking />;
      case 'marketing':
        return <Marketing />;
      case 'ad-manager':
        return <AdDashboard />;
      case 'whatsapp':
        return <WhatsApp />;
      case 'instagram':
        return <Instagram />;
      case 'costs':
        return <OperationalCosts />;
      case 'resumo-vendas':
        return <ResumoVendas />;
      case 'resumo':
        return <ResumoMensal />;
      case 'resumo-anual':
        return <ResumoAnual />;
      case 'settings':
        return <Settings />;
      default:
        return <Home onNavigate={setCurrentPage} />;
    }
  };

  if (!configReady) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage} onRemount={() => setRemountKey((k) => k + 1)}>
      <Fragment key={`${currentPage}:${remountKey}`}>{renderPage()}</Fragment>
    </Layout>
  );
}

export default App;