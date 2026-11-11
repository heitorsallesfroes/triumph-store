// Edge Function "ig-link": clique de um link rastreável do Instagram → WhatsApp da loja. Pública (chave anon).
// Lógica em link.ts. Usa a service role só para ler ig_links e gravar ig_link_clicks.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { open } from "./link.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { auth: { persistSession: false } });
let hmacKey: CryptoKey | null = null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ success: false, error: "Use POST" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const out = await open(body, req.headers, {
    findLink: async (slug) => {
      const { data, error } = await admin.from("ig_links").select("id, slug, code, message, active").eq("slug", slug).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    recentClick: async (linkId, ipHash, sinceIso) => {
      const { data } = await admin.from("ig_link_clicks").select("id").eq("link_id", linkId).eq("ip_hash", ipHash).gte("created_at", sinceIso).limit(1);
      return !!(data && data.length);
    },
    insertClick: async (row) => {
      const { error } = await admin.from("ig_link_clicks").insert(row);
      if (error) throw new Error(error.message);
    },
    hmac: async (text) => {
      if (!hmacKey) hmacKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(text)));
      return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
    },
    now: () => Date.now(),
  });
  return new Response(JSON.stringify(out.json), { status: out.status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
