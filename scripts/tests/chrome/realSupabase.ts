// Supabase SÓ DE LEITURA com os dados reais, para o teste no Chrome com REAL=1 (substitui src/lib/supabase.ts no
// pacote do teste). URL e chave anon públicas vêm de window.__REAL (o teste lê de extension/config.js).
// Cada consulta fica em window.__QUERIES (método e caminho) para o teste conferir que só houve GET/HEAD.
import { readOnlyClient } from '../realReadOnly.ts';

const g = globalThis as unknown as { __REAL: { url: string; key: string }; __QUERIES?: { method: string; path: string }[] };
export const supabase = readOnlyClient(g.__REAL.url, g.__REAL.key, (method, path) => { (g.__QUERIES = g.__QUERIES || []).push({ method, path }); });
