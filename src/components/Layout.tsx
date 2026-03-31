import { ReactNode } from 'react';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  History,
  Gift,
  Bike,
  Truck,
  BarChart3,
  TrendingUp,
  Settings
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { id: 'sales', label: 'Nova Venda', icon: ShoppingCart },
  { id: 'history', label: 'Histórico de Vendas', icon: History },
  { id: 'logistics', label: 'Logística', icon: Truck },
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'stock', label: 'Controle de Estoque', icon: Warehouse },
  { id: 'accessories', label: 'Acessórios / Brindes', icon: Gift },
  { id: 'motoboys', label: 'Motoboys', icon: Bike },
  { id: 'marketing', label: 'Marketing / Tráfego Pago', icon: TrendingUp },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  return (
    <div className="flex h-screen bg-gray-900">
      <aside className="w-64 bg-black border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-2xl font-bold text-orange-500">Triumph Store</h1>
          <p className="text-gray-400 text-sm mt-1">Sistema ERP</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
