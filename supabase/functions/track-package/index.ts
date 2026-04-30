import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TrackingEvent {
  date: string;
  description: string;
  location: string;
}

// Tenta a API oficial dos Correios (requer CORREIOS_API_TOKEN no env)
async function tryCorreiosOfficial(code: string, token: string): Promise<TrackingEvent[] | null> {
  try {
    const res = await fetch(`https://api.correios.com.br/srorastro/v1/objetos/${code}/eventos`, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const eventos = data?.objetos?.[0]?.eventos || [];
    return eventos.map((e: any) => ({
      date: e.dtHrCriado || '',
      description: e.descricao || e.detalhe || '',
      location: [e.unidade?.endereco?.cidade, e.unidade?.endereco?.uf].filter(Boolean).join('/'),
    }));
  } catch {
    return null;
  }
}

// Tenta o proxy não-oficial dos Correios (sem auth, pode funcionar via IP do Supabase)
async function tryCorreiosProxy(code: string): Promise<TrackingEvent[] | null> {
  try {
    const res = await fetch(`https://proxyapp.correios.com.br/v1/sro-rastro/${code}`, {
      headers: {
        "Accept": "application/json",
        "Referer": "https://www.correios.com.br/",
        "Origin": "https://www.correios.com.br",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const eventos = data?.objetos?.[0]?.eventos || [];
    if (!eventos.length) return null;
    return eventos.map((e: any) => ({
      date: e.dtHrCriado || '',
      description: e.descricao || '',
      location: [e.unidade?.endereco?.cidade, e.unidade?.endereco?.uf].filter(Boolean).join('/'),
    }));
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tracking_code } = await req.json();
    if (!tracking_code) throw new Error("tracking_code é obrigatório");

    const CORREIOS_TOKEN = Deno.env.get("CORREIOS_API_TOKEN");

    let events: TrackingEvent[] | null = null;
    let source = "";

    // 1. Tenta API oficial se token disponível
    if (CORREIOS_TOKEN) {
      events = await tryCorreiosOfficial(tracking_code, CORREIOS_TOKEN);
      if (events) source = "correios_oficial";
    }

    // 2. Tenta proxy dos Correios (server-side, sem CORS)
    if (!events) {
      events = await tryCorreiosProxy(tracking_code);
      if (events) source = "correios_proxy";
    }

    console.log(`[Tracking] ${tracking_code} | source: ${source || 'none'} | events: ${events?.length ?? 0}`);

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nenhum evento encontrado. Configure CORREIOS_API_TOKEN no Supabase para usar a API oficial.",
          needs_token: !CORREIOS_TOKEN,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, events, source }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
