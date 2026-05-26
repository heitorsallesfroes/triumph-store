import { ReactNode, useState, useEffect } from 'react';
import {
  Home,
  Package,
  Warehouse,
  ShoppingCart,
  ShoppingBag,
  History,
  Bike,
  Truck,
  TrendingUp,
  Settings,
  Zap,
  Receipt,
  DollarSign,
  PackageSearch,
  Layers,
  BarChart3,
  Calendar,
  Sun,
  Moon,
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
      { id: 'home',               label: 'Início',                icon: Home          },
      { id: 'sales',              label: 'Nova Venda',            icon: ShoppingCart  },
      { id: 'small-sales',        label: 'Pequenas Vendas',       icon: ShoppingBag   },
      { id: 'history',            label: 'Histórico de Vendas',   icon: History       },
      { id: 'logistics',          label: 'Logística Motoboy',     icon: Truck         },
      { id: 'rastreamento-sedex', label: 'Rastreamento SEDEX',    icon: PackageSearch },
    ],
  },
  {
    label: 'ESTOQUE',
    items: [
      { id: 'products', label: 'Produtos',            icon: Package   },
      { id: 'stock',    label: 'Controle de Estoque', icon: Warehouse },
    ],
  },
  {
    label: 'OPERAÇÕES',
    items: [
      { id: 'motoboys',   label: 'Motoboys',                icon: Bike       },
      { id: 'marketing',  label: 'Marketing / Ads',         icon: TrendingUp },
      { id: 'ad-manager', label: 'Gerenciador de Anúncios', icon: Layers     },
      { id: 'costs',      label: 'Custos Operacionais',     icon: Receipt    },
    ],
  },
  {
    label: 'GESTÃO',
    items: [
      { id: 'resumo-vendas', label: 'Resumo de Vendas', icon: DollarSign },
      { id: 'resumo',        label: 'Relatório Mensal', icon: BarChart3  },
      { id: 'resumo-anual',  label: 'Resumo Anual',     icon: Calendar   },
      { id: 'settings',      label: 'Configurações',    icon: Settings   },
    ],
  },
];

const ORANGE     = '#f97316';
const ORANGE_DIM = 'rgba(249, 115, 22, 0.12)';

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-base)' }}>

      {/* ── Sidebar ── */}
      <aside className="w-72 flex flex-col flex-shrink-0" style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-main)' }}>

        {/* Logo + toggle */}
        <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border-main)' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0"
                style={{ background: ORANGE, color: '#fff' }}>
                T
              </div>
              <div>
                <p className="font-bold text-sm leading-none" style={{ color: ORANGE }}>Triumph Store</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Sistema ERP</p>
              </div>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              style={{
                flexShrink: 0,
                width: 32, height: 32,
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                border: '1px solid var(--border-main)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                (e.currentTarget as HTMLElement).style.color = ORANGE;
                (e.currentTarget as HTMLElement).style.borderColor = ORANGE;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-main)';
              }}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>

        {/* Data */}
        <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border-main)' }}>
          <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{dateStr}</p>
        </div>

        {/* Menu */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {menuGroups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-3 mb-2 text-xs font-bold tracking-widest" style={{ color: '#b45309' }}>
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
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left"
                      style={{
                        background:  isActive ? ORANGE_DIM : 'transparent',
                        color:       isActive ? ORANGE : 'var(--text-nav)',
                        borderLeft:  isActive ? `2px solid ${ORANGE}` : '2px solid transparent',
                      }}
                      onMouseEnter={e => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-nav-hover)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-nav)';
                        }
                      }}
                    >
                      <Icon size={16} />
                      <span className="font-medium" style={{ fontSize: '15px' }}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Rodapé */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border-main)' }}>
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg" style={{ background: 'var(--bg-inner)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: ORANGE, color: '#fff' }}>
              TS
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>Triumph Store</p>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Conectado</p>
              </div>
            </div>
            <Zap size={13} style={{ color: ORANGE }} />
          </div>
        </div>
      </aside>

      {/* ── Conteúdo ── */}
      <main className="flex-1 overflow-auto" style={{ background: 'var(--bg-base)' }}>
        {/* Topbar */}
        <div className="px-8 py-3 flex items-center justify-end"
          style={{ borderBottom: '1px solid var(--border-main)', background: 'var(--bg-topbar)' }}>
          <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full"
            style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)', color: 'var(--text-secondary)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Ao vivo
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
