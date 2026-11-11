import { ReactNode, useState, useEffect, useRef } from 'react';
import { hasRefreshHandlers, isPageDirty, isRefreshKey, runRefresh } from '../lib/erpRefresh';
import { VERSION_CHECK_MS, watchNewVersion } from '../lib/erpVersion';
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
  MessageCircle,
  Instagram,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onRemount?: () => void; // "Atualizar" numa página que não registrou como recarregar
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
      { id: 'rastreamento-sedex', label: 'Correios',               icon: PackageSearch },
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
    label: 'CANAIS DE VENDAS',
    items: [
      { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
      { id: 'instagram', label: 'Instagram', icon: Instagram },
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

export default function Layout({ children, currentPage, onNavigate, onRemount }: LayoutProps) {
  // ── "Atualizar": recarrega os dados da página aberta sem recarregar o site (src/lib/erpRefresh.ts) ──
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const busy = useRef(false);
  const doRefresh = async (force = false) => {
    if (busy.current) return;
    if (!force && isPageDirty()) { setConfirmDiscard(true); return; }
    busy.current = true;
    setRefreshing(true);
    try {
      if (hasRefreshHandlers()) await runRefresh();
      else if (onRemount) onRemount();
    } finally {
      busy.current = false;
      setRefreshing(false);
      setRefreshedAt(Date.now());
    }
  };
  const refreshRef = useRef(doRefresh);
  refreshRef.current = doRefresh;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isRefreshKey(e) && !e.repeat) { e.preventDefault(); refreshRef.current(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // trocou de página: o "Atualizado às" era da outra
  useEffect(() => { setRefreshedAt(null); setConfirmDiscard(false); }, [currentPage]);

  // ── versão nova publicada (src/lib/erpVersion.ts): a cada 2 min e ao voltar para a aba ──
  const [newVersion, setNewVersion] = useState(false);
  useEffect(() => watchNewVersion(() => setNewVersion(true), { every: Number((globalThis as { __TSP_VERSION_MS?: number }).__TSP_VERSION_MS) || VERSION_CHECK_MS }), []);

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
            <button
              onClick={() => { supabase.auth.signOut(); }}
              title="Sair"
              aria-label="Sair"
              style={{
                flexShrink: 0,
                width: 26, height: 26,
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = ORANGE; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Conteúdo ── */}
      <main className="flex-1 overflow-auto" style={{ background: 'var(--bg-base)' }}>
        {/* Versão nova publicada: só avisa (nunca recarrega sozinho); "Atualizar" recarrega e volta para esta página */}
        {newVersion && (
          <div role="status" data-testid="erp-new-version" className="px-8 py-2 flex items-center justify-center gap-3 text-sm"
            style={{ background: ORANGE_DIM, borderBottom: `1px solid ${ORANGE}`, color: 'var(--text-primary)' }}>
            <span>Nova versão do sistema disponível</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <button type="button" onClick={() => window.location.reload()} data-testid="erp-new-version-reload"
              style={{ background: 'transparent', border: 'none', color: ORANGE, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Atualizar</button>
          </div>
        )}
        {/* Topbar */}
        <div className="px-8 py-3 flex items-center justify-end gap-2"
          style={{ borderBottom: '1px solid var(--border-main)', background: 'var(--bg-topbar)' }}>
          {refreshedAt && !refreshing && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }} data-testid="erp-refreshed-at">
              Atualizado às {new Date(refreshedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <div className="relative">
            <button type="button" onClick={() => doRefresh()} disabled={refreshing} data-testid="erp-refresh"
              title="Recarregar os dados desta página (tecla R)" aria-label="Atualizar os dados desta página"
              className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ background: 'var(--bg-inner)', border: '1px solid var(--border-main)', color: 'var(--text-secondary)', cursor: refreshing ? 'wait' : 'pointer' }}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} style={{ color: ORANGE }} />
              {refreshing ? 'Atualizando…' : 'Atualizar'}
            </button>
            {confirmDiscard && (
              <div role="dialog" aria-label="Confirmar atualização" data-testid="erp-refresh-confirm" className="absolute right-0 mt-2 p-3 rounded-lg text-sm z-50"
                style={{ width: 280, background: 'var(--bg-card)', border: '1px solid var(--border-main)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', color: 'var(--text-primary)' }}>
                <p className="mb-3">Tem coisa digitada nesta página que ainda não foi salva. Atualizar os dados mesmo assim?</p>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setConfirmDiscard(false)} className="px-3 py-1 rounded"
                    style={{ border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-secondary)' }}>Cancelar</button>
                  <button type="button" onClick={() => { setConfirmDiscard(false); doRefresh(true); }} data-testid="erp-refresh-confirm-go" className="px-3 py-1 rounded"
                    style={{ background: ORANGE, color: '#fff', border: 'none' }}>Atualizar mesmo assim</button>
                </div>
              </div>
            )}
          </div>
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
