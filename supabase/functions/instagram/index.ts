// Edge Function "instagram": métricas da conta profissional, SÓ LEITURA (só GET na Graph API). Login do ERP obrigatório.
// Secrets: IG_ACCESS_TOKEN (obrigatório), IG_USER_ID (opcional). A lógica fica em ig.ts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handle } from "./ig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ success: false, error: "Use POST" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const out = await handle(req.headers.get("Authorization"), body, {
    token: Deno.env.get("IG_ACCESS_TOKEN"),
    igUserId: Deno.env.get("IG_USER_ID"),
    getUser: async (jwt) => {
      const { data, error } = await admin.auth.getUser(jwt);
      return error || !data || !data.user ? null : { id: data.user.id };
    },
    fetch: (url) => fetch(url, { method: "GET" }),
    now: () => Date.now(),
  });
  return new Response(JSON.stringify(out.json), { status: out.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
