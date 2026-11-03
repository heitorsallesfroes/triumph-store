// Edge Function: evento de compra (Purchase) para o Facebook pela API de Conversões.
// Só para usuário LOGADO (o JWT do Authorization é conferido no Supabase Auth; a chave anon sozinha
// é recusada). Secrets: META_ACCESS_TOKEN, META_DATASET_ID e, opcionais, META_WABA_ID e
// META_TEST_EVENT_CODE. A lógica fica em event.ts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handle } from "./event.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const out = await handle(req.method, req.headers.get("Authorization"), body, {
    env: {
      META_ACCESS_TOKEN: Deno.env.get("META_ACCESS_TOKEN"),
      META_DATASET_ID: Deno.env.get("META_DATASET_ID"),
      META_WABA_ID: Deno.env.get("META_WABA_ID"),
      META_TEST_EVENT_CODE: Deno.env.get("META_TEST_EVENT_CODE"),
    },
    getUser: async (jwt) => {
      const { data, error } = await admin.auth.getUser(jwt);
      return error || !data || !data.user ? null : { id: data.user.id };
    },
    findEvent: async (eventId) => {
      const { data } = await admin.from("wa_conversion_events").select("status, events_received").eq("event_id", eventId).maybeSingle();
      return data || null;
    },
    insertRow: async (row) => {
      await admin.from("wa_conversion_events").upsert(row, { onConflict: "event_id" });
    },
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
  });
  return new Response(JSON.stringify(out.json), { status: out.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
