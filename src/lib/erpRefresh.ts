// Botão "Atualizar" do ERP: recarrega os dados da página aberta SEM recarregar o site (página, sub-aba, período e
// filtros continuam). Cada página registra a própria função de recarregar com useErpRefresh(); a página com algo
// digitado avisa com useErpDirty(true) e o botão pergunta antes. Sem nenhuma função registrada, o App remonta a página.
import { useEffect, useRef } from 'react';

type Handler = () => unknown;
const handlers = new Set<{ run: () => unknown }>();
const dirty = new Set<symbol>();

export const hasRefreshHandlers = () => handlers.size > 0;
export const isPageDirty = () => dirty.size > 0;

// chama todas as funções registradas e espera todas terminarem (as que falharem não param as outras)
export async function runRefresh(): Promise<{ ran: number; failed: number }> {
  const list = [...handlers];
  const res = await Promise.allSettled(list.map((h) => Promise.resolve().then(() => h.run())));
  return { ran: list.length, failed: res.filter((r) => r.status === 'rejected').length };
}

// registra a função de recarregar da página/componente (usa sempre a versão mais nova, com o estado atual)
export function useErpRefresh(handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h = { run: () => ref.current() };
    handlers.add(h);
    return () => { handlers.delete(h); };
  }, []);
}

// a página tem algo digitado que o "Atualizar" pode descartar
export function useErpDirty(isDirty: boolean) {
  const id = useRef(Symbol('dirty'));
  useEffect(() => {
    const k = id.current;
    if (isDirty) dirty.add(k); else dirty.delete(k);
    return () => { dirty.delete(k); };
  }, [isDirty]);
}

// (testes) registrar sem React
export function _register(run: () => unknown) { const h = { run }; handlers.add(h); return () => handlers.delete(h); }
export function _setDirty(on: boolean, key = Symbol('t')) { if (on) dirty.add(key); else dirty.delete(key); return key; }
export function _clear() { handlers.clear(); dirty.clear(); }

// a tecla R atualiza, menos quando a pessoa está digitando num campo (ou com Ctrl/Alt/⌘)
export function isRefreshKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: unknown }): boolean {
  if (e.key !== 'r' && e.key !== 'R') return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = t && t.tagName ? String(t.tagName).toUpperCase() : '';
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable));
}
