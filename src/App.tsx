import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Products from './pages/Products';
import StockControl from './pages/StockControl';
import Sales from './pages/Sales';
import SalesHistory from './pages/SalesHistory';
import Motoboys from './pages/Motoboys';
import Logistics from './pages/Logistics';
import Marketing from './pages/Marketing';
import AdManager from './pages/AdManager';
import Settings from './pages/Settings';
import OperationalCosts from './pages/OperationalCosts';
import ResumoMensal from './pages/ResumoMensal';
import ResumoVendas from './pages/ResumoVendas';
import ResumoAnual from './pages/ResumoAnual';
import SmallSales from './pages/SmallSales';
import CorreiosTracking from './pages/CorreiosTracking';
import { loadSystemConfig } from './lib/systemConfig';

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [triggerFastSale, setTriggerFastSale] = useState(0);
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    loadSystemConfig().finally(() => setConfigReady(true));
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.key === 'F2' && !isTyping) {
        e.preventDefault();
        setCurrentPage('sales');
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
        return <Sales triggerFastSale={triggerFastSale} onNavigate={setCurrentPage} />;
      case 'small-sales':
        return <SmallSales />;
      case 'history':
        return <SalesHistory />;
      case 'motoboys':
        return <Motoboys />;
      case 'logistics':
        return <Logistics />;
      case 'rastreamento-sedex':
        return <CorreiosTracking />;
      case 'marketing':
        return <Marketing />;
      case 'ad-manager':
        return <AdManager />;
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
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

export default App;