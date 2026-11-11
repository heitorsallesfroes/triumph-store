// Edge Function "ig-manage": Conectar Instagram, status/renovação do token, posts e Direct. Publicar com "Verify JWT"
// DESLIGADO (a volta do Login do Instagram chega sem login); as ações conferem o login do ERP. Lógica em manage.ts.
// Secrets: IG_APP_ID, IG_APP_SECRET (do PRODUTO Instagram no app da Meta), IG_WEBHOOK_VERIFY_TOKEN (só para mostrar
// se já foi cadastrado). Opcional: IG_ERP_URL (padrão https://triumph-store.vercel.app).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleManage } from "./manage.ts";
import { supaStore } from "../_shared/igStore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Key",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const store = supaStore(admin);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: unknown = null;
  if (req.method === "POST") { try { body = await req.json(); } catch { body = null; } }
  const out = await handleManage(req.method, req.url, req.headers, body, {
    appId: Deno.env.get("IG_APP_ID"),
    appSecret: Deno.env.get("IG_APP_SECRET"),
    verifyToken: Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN"),
    supabaseUrl: SUPABASE_URL,
    erpUrl: Deno.env.get("IG_ERP_URL") || "https://triumph-store.vercel.app",
    store,
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    getUser: async (jwt) => {
      const { data, error } = await admin.auth.getUser(jwt);
      return error || !data || !data.user ? null : { id: data.user.id };
    },
    randomHex: () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join(""),
  });
  if (out.redirect) return new Response(null, { status: 302, headers: { Location: out.redirect } });
  return new Response(JSON.stringify(out.json), { status: out.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
