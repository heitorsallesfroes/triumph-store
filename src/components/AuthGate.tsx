import { ReactNode, useEffect, useState, FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Login do ERP (Supabase Auth, e-mail e senha). Sem sessão mostra só a tela de login;
// com sessão mostra o ERP. A sessão fica lembrada e é renovada pelo próprio supabase-js.
// Não há telas públicas no ERP (todas as páginas ficam atrás do login).

const ORANGE = '#f97316';

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado no Supabase.';
  if (m.includes('fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  if (m.includes('rate') || m.includes('too many')) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  return 'Não foi possível entrar. Tente de novo.';
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!email.trim() || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) setError(friendlyError(authError.message));
    } catch (err) {
      setError(friendlyError(String((err as Error)?.message || err)));
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    background: 'var(--bg-inner)',
    border: '1px solid var(--border-main)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl p-8"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-main)' }}
      >
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold flex-shrink-0"
            style={{ background: ORANGE, color: '#fff' }}>
            T
          </div>
          <div>
            <p className="font-bold leading-none" style={{ color: ORANGE }}>Triumph Store</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Sistema ERP</p>
          </div>
        </div>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }} htmlFor="login-email">
          E-mail
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 mb-4 outline-none"
          style={inputStyle}
          autoFocus
        />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }} htmlFor="login-password">
          Senha
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 mb-4 outline-none"
          style={inputStyle}
        />

        {error && (
          <p className="text-sm mb-4" role="alert" style={{ color: '#ef4444' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg py-2.5 font-semibold transition-opacity"
          style={{ background: ORANGE, color: '#fff', opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (active) setSession(data.session); })
      .finally(() => { if (active) setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return <>{children}</>;
}
