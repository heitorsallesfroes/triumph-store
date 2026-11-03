// Login da extensão (1.9.1): Supabase Auth do mesmo projeto, pela REST, só no background.
// Guarda access_token, refresh_token, expires_at e uma dica do e-mail (2 letras + domínio)
// em chrome.storage.local (nunca sync). A senha só vai no corpo do POST para /auth/v1/token
// e nunca é guardada, devolvida ou escrita no console.
// Fase 1: sem sessão a extensão continua usando a chave anon.
(function (root) {
  const KEY = 'waAuth';
  const REFRESH_MARGIN_S = 60; // renova se faltar menos de 1 minuto
  const nowS = () => Math.floor(Date.now() / 1000);

  function cfg() {
    if (!root.WA_CONFIG || !root.WA_CONFIG.SUPABASE_URL || !root.WA_CONFIG.SUPABASE_ANON_KEY) {
      throw new Error('config.js sem SUPABASE_URL / SUPABASE_ANON_KEY');
    }
    return root.WA_CONFIG;
  }

  // "heitor@hotmail.com" → "he…@hotmail.com"
  function emailHint(email) {
    const s = String(email || '');
    const at = s.lastIndexOf('@');
    if (at < 1) return '';
    return `${s.slice(0, Math.min(2, at))}…${s.slice(at)}`;
  }

  async function load() {
    try {
      const saved = await chrome.storage.local.get(KEY);
      const s = saved && saved[KEY];
      return s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string' ? s : null;
    } catch {
      return null;
    }
  }

  async function save(session) {
    await chrome.storage.local.set({ [KEY]: session });
  }

  async function clear() {
    try { await chrome.storage.local.remove(KEY); } catch { /* sem storage */ }
  }

  // Resposta do /auth/v1/token → só o que precisamos guardar
  function toSession(data, hint) {
    if (!data || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') return null;
    const expires_at = Number(data.expires_at) || (nowS() + (Number(data.expires_in) || 3600));
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at,
      email_hint: hint || emailHint(data.user && data.user.email),
    };
  }

  async function tokenRequest(grantType, body) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg();
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { res, data };
  }

  async function signIn({ email, password }) {
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!cleanEmail || cleanEmail.length > 200 || !cleanEmail.includes('@')) throw new Error('Informe um e-mail válido');
    if (typeof password !== 'string' || !password || password.length > 200) throw new Error('Informe a senha');
    let r;
    try {
      r = await tokenRequest('password', { email: cleanEmail, password });
    } catch {
      throw new Error('Sem conexão com o servidor. Tente de novo.');
    }
    if (!r.res.ok) {
      if (r.res.status === 400 || r.res.status === 401) {
        const code = String((r.data && (r.data.error_code || r.data.error || r.data.msg)) || '');
        if (/email_not_confirmed|not confirmed/i.test(code)) throw new Error('E-mail ainda não confirmado no Supabase');
        throw new Error('E-mail ou senha incorretos');
      }
      if (r.res.status === 429) throw new Error('Muitas tentativas. Aguarde um pouco.');
      throw new Error(`Não foi possível entrar (erro ${r.res.status})`);
    }
    const session = toSession(r.data, emailHint(cleanEmail));
    if (!session) throw new Error('Resposta inesperada do servidor');
    await save(session);
    return { connected: true, emailHint: session.email_hint };
  }

  // Uma renovação por vez (várias chamadas ao mesmo tempo esperam a mesma)
  let refreshing = null;

  function refresh() {
    if (!refreshing) {
      refreshing = (async () => {
        const current = await load();
        if (!current) return null;
        let r;
        try {
          r = await tokenRequest('refresh_token', { refresh_token: current.refresh_token });
        } catch {
          // Sem internet: não apaga a sessão; a chamada segue sem token
          return null;
        }
        const session = r.res.ok ? toSession(r.data, current.email_hint) : null;
        if (!session) {
          await clear();
          return null;
        }
        await save(session);
        return session;
      })().finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  // Token válido (renovado se estiver para vencer) ou null (sem sessão → chave anon)
  async function getAccessToken() {
    const s = await load();
    if (!s) return null;
    if (!(Number(s.expires_at) - nowS() > REFRESH_MARGIN_S)) {
      const fresh = await refresh();
      return fresh ? fresh.access_token : null;
    }
    return s.access_token;
  }

  // fetch para o Supabase com apikey anon + Bearer do usuário (ou anon sem sessão).
  // Um 401 com token renova a sessão e tenta mais uma vez.
  async function authFetch(url, init = {}) {
    const { SUPABASE_ANON_KEY } = cfg();
    const build = (token) => ({
      ...init,
      headers: { ...(init.headers || {}), apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}` },
    });
    const token = await getAccessToken();
    const res = await fetch(url, build(token));
    if (res.status !== 401 || !token) return res;
    const fresh = await refresh();
    return fetch(url, build(fresh ? fresh.access_token : null));
  }

  async function status() {
    const s = await load();
    return s ? { connected: true, emailHint: s.email_hint || '' } : { connected: false, emailHint: '' };
  }

  async function signOut() {
    const s = await load();
    await clear();
    if (s) {
      try {
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg();
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}` },
        });
      } catch { /* a sessão local já foi apagada */ }
    }
    return { connected: false, emailHint: '' };
  }

  root.WaAuth = { signIn, signOut, status, getAccessToken, refresh, authFetch, emailHint, STORAGE_KEY: KEY };
})(globalThis);
