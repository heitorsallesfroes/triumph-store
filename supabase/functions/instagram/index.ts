// Edge Function "instagram": métricas da conta profissional, SÓ LEITURA (só GET na Graph API). Login do ERP obrigatório.
// Secrets: IG_ACCESS_TOKEN (obrigatório), IG_USER_ID (opcional). A lógica fica em ig.ts.
// Histórico (collect_stories / collect_daily): collect.ts — chamado pela rotina do banco (x-cron-key) ou por um
// usuário logado; grava ig_stories, ig_daily_account, ig_daily_media e ig_collect_log com a service role.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handle } from "./ig.ts";
import { handleCollect, type HistStore } from "./collect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Key",
};
const fail = (e: { message?: string } | null) => { if (e) throw new Error(String(e.message || e).slice(0, 300)); };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ success: false, error: "Use POST" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const deps = {
    token: Deno.env.get("IG_ACCESS_TOKEN"),
    igUserId: Deno.env.get("IG_USER_ID"),
    getUser: async (jwt: string) => {
      const { data, error } = await admin.auth.getUser(jwt);
      return error || !data || !data.user ? null : { id: data.user.id };
    },
    fetch: (url: string) => fetch(url, { method: "GET" }),
    now: () => Date.now(),
  };
  const action = body && typeof body === "object" ? String((body as { action?: unknown }).action || "") : "";
  if (action.startsWith("collect_")) {
    const store: HistStore = {
      cronKey: async () => { const { data } = await admin.from("ig_collect_keys").select("v").eq("k", "cron_key").maybeSingle(); return data ? String(data.v) : null; },
      // um por vez: a métrica que não veio nesta leitura não apaga a anterior
      upsertStories: async (rows) => { for (const r of rows) { const { error } = await admin.from("ig_stories").upsert(r, { onConflict: "id" }); fail(error); } },
      upsertDailyAccount: async (rows) => { const { error } = await admin.from("ig_daily_account").upsert(rows, { onConflict: "day" }); fail(error); },
      upsertDailyMedia: async (rows) => { const { error } = await admin.from("ig_daily_media").upsert(rows, { onConflict: "day,media_id" }); fail(error); },
      accountDays: async (from, to) => { const { data, error } = await admin.from("ig_daily_account").select("day").gte("day", from).lte("day", to); fail(error); return (data || []).map((r: { day: string }) => String(r.day)); },
      log: async (row) => { await admin.from("ig_collect_log").insert(row); },
    };
    const out = await handleCollect(req.headers.get("Authorization"), req.headers.get("x-cron-key"), body, { ...deps, store });
    return new Response(JSON.stringify(out.json), { status: out.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const out = await handle(req.headers.get("Authorization"), body, deps);
  return new Response(JSON.stringify(out.json), { status: out.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
