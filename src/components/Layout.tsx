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
  Settings,
  Zap,
  Receipt,
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const menuGroups = [
  {
    label: 'PRINCIPAL',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'sales', label: 'Nova Venda', icon: ShoppingCart },
      { id: 'history', label: 'Histórico de Vendas', icon: History },
      { id: 'logistics', label: 'Logística', icon: Truck },
    ],
  },
  {
    label: 'ESTOQUE',
    items: [
      { id: 'products', label: 'Produtos', icon: Package },
      { id: 'stock', label: 'Controle de Estoque', icon: Warehouse },
      { id: 'accessories', label: 'Acessórios / Brindes', icon: Gift },
    ],
  },
  {
    label: 'OPERAÇÕES',
    items: [
      { id: 'motoboys', label: 'Motoboys', icon: Bike },
      { id: 'marketing', label: 'Marketing / Ads', icon: TrendingUp },
      { id: 'costs', label: 'Custos Operacionais', icon: Receipt },
      { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    label: 'GESTÃO',
    items: [
      { id: 'resumo', label: 'Resumo Mensal', icon: BarChart3 },
      { id: 'settings', label: 'Configurações', icon: Settings },
    ],
  },
];

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="flex h-screen" style={{ background: '#0a0a0f' }}>

      {/* Sidebar */}
      <aside className="w-56 flex flex-col flex-shrink-0" style={{ background: '#0d0d14', borderRight: '1px solid #1a1a2a' }}>

        {/* Logo */}
        <div className="px-5 py-5" style={{ borderBottom: '1px solid #1a1a2a' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: '#f5c518', color: '#0a0a0f' }}>
              T
            </div>
            <div>
              <p className="font-bold text-sm text-white leading-none">Triumph Store</p>
              <p className="text-xs mt-0.5" style={{ color: '#5a5a7a' }}>Sistema ERP</p>
            </div>
          </div>
        </div>

        {/* Data */}
        <div className="px-5 py-3" style={{ borderBottom: '1px solid #1a1a2a' }}>
          <p className="text-xs capitalize" style={{ color: '#5a5a7a' }}>{dateStr}</p>
        </div>

        {/* Menu */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {menuGroups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-3 mb-2 text-xs font-semibold tracking-widest" style={{ color: '#3a3a5a' }}>
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left"
                      style={{
                        background: isActive ? '#1a1a2e' : 'transparent',
                        color: isActive ? '#f5c518' : '#6a6a8a',
                        borderLeft: isActive ? '2px solid #f5c518' : '2px solid transparent',
                      }}
                      onMouseEnter={e => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.background = '#13131f';
                          (e.currentTarget as HTMLElement).style.color = '#a0a0c0';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.color = '#6a6a8a';
                        }
                      }}
                    >
                      <Icon size={16} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Rodapé */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid #1a1a2a' }}>
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg" style={{ background: '#111118' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#f5c518', color: '#0a0a0f' }}>
              TS
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">Triumph Store</p>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <p className="text-xs" style={{ color: '#5a5a7a' }}>Conectado</p>
              </div>
            </div>
            <Zap size={13} style={{ color: '#f5c518' }} />
          </div>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-auto" style={{ background: '#0a0a0f' }}>
        {/* Topbar */}
        <div className="px-8 py-3 flex items-center justify-end" style={{ borderBottom: '1px solid #1a1a2a', background: '#0d0d14' }}>
          <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: '#111118', border: '1px solid #1a1a2a', color: '#6a6a8a' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Ao vivo
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}