// Edge Function "ig-webhook": webhook do Instagram (PÚBLICA — publicar com "Verify JWT" DESLIGADO: quem chama é a
// Meta). Secrets: IG_APP_SECRET (assinatura) e IG_WEBHOOK_VERIFY_TOKEN (verificação). Lógica em hook.ts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleHook } from "./hook.ts";
import { supaStore } from "./igStore.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const store = supaStore(admin);

Deno.serve(async (req: Request) => {
  const raw = new Uint8Array(await req.arrayBuffer());
  const out = await handleHook(req.method, req.url, req.headers, raw, {
    verifyToken: Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN"),
    appSecret: Deno.env.get("IG_APP_SECRET"),
    store: () => store,
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    rnd: () => Math.random(),
    // responde 200 já e termina o trabalho depois (a Meta desiste se demorar)
    background: (p) => { try { (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(p); } catch { /* sem waitUntil: a promessa segue sozinha */ } },
  });
  return new Response(out.body, { status: out.status, headers: { "Content-Type": out.contentType } });
});
