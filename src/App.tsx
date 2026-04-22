import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import StockControl from './pages/StockControl';
import Sales from './pages/Sales';
import SalesHistory from './pages/SalesHistory';
import Motoboys from './pages/Motoboys';
import Logistics from './pages/Logistics';
import Reports from './pages/Reports';
import Marketing from './pages/Marketing';
import Settings from './pages/Settings';
import OperationalCosts from './pages/OperationalCosts';
import ResumoMensal from './pages/ResumoMensal';
import ResumoVendas from './pages/ResumoVendas';
import SmallSales from './pages/SmallSales';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [triggerFastSale, setTriggerFastSale] = useState(0);

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
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
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
      case 'marketing':
        return <Marketing />;
      case 'reports':
        return <Reports />;
      case 'costs':
        return <OperationalCosts />;
      case 'resumo-vendas':
        return <ResumoVendas />;
      case 'resumo':
        return <ResumoMensal />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

export default App;