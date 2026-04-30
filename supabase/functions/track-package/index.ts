import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CORREIOS_CNPJ = "49923481000104";

interface TrackingEvent {
  date: string;
  description: string;
  location: string;
}

interface DebugInfo {
  has_token: boolean;
  has_codigo_acesso: boolean;
  token_generation?: { status: number; body: string };
  correios_api?: { status: number; body: string; expired: boolean };
  correios_api_retry?: { status: number; body: string };
  proxy?: { status: number; body: string };
}

async function generateToken(
  codigoAcesso: string,
): Promise<{ token: string | null; status: number; body: string }> {
  try {
    const credentials = btoa(`${CORREIOS_CNPJ}:${codigoAcesso}`);
    const res = await fetch("https://api.correios.com.br/token/v1/autentica", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    });
    const body = await res.text();
    if (!res.ok) return { token: null, status: res.status, body };
    const data = JSON.parse(body);
    console.log("[Correios] Novo token gerado, expira em:", data.expiraEm);
    return { token: data.token ?? null, status: res.status, body };
  } catch (err: any) {
    return { token: null, status: 0, body: String(err) };
  }
}

async function callTrackingAPI(
  code: string,
  token: string,
): Promise<{ events: TrackingEvent[] | null; expired: boolean; status: number; body: string }> {
  try {
    const res = await fetch(
      `https://api.correios.com.br/srorastro/v1/objetos/${code}/eventos`,
      { headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` } },
    );
    const body = await res.text();
    if (res.status === 401) return { events: null, expired: true, status: 401, body };
    if (!res.ok) return { events: null, expired: false, status: res.status, body };

    const data = JSON.parse(body);
    const eventos = data?.objetos?.[0]?.eventos || [];
    const events: TrackingEvent[] = eventos.map((e: any) => ({
      date: e.dtHrCriado || "",
      description: e.descricao || e.detalhe || "",
      location: [e.unidade?.endereco?.cidade, e.unidade?.endereco?.uf].filter(Boolean).join("/"),
    }));
    return { events, expired: false, status: res.status, body };
  } catch (err: any) {
    return { events: null, expired: false, status: 0, body: String(err) };
  }
}

async function tryCorreiosProxy(
  code: string,
): Promise<{ events: TrackingEvent[] | null; status: number; body: string }> {
  try {
    const res = await fetch(`https://proxyapp.correios.com.br/v1/sro-rastro/${code}`, {
      headers: {
        "Accept": "application/json",
        "Referer": "https://www.correios.com.br/",
        "Origin": "https://www.correios.com.br",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const body = await res.text();
    if (!res.ok) return { events: null, status: res.status, body };
    const data = JSON.parse(body);
    const eventos = data?.objetos?.[0]?.eventos || [];
    if (!eventos.length) return { events: [], status: res.status, body };
    const events: TrackingEvent[] = eventos.map((e: any) => ({
      date: e.dtHrCriado || "",
      description: e.descricao || "",
      location: [e.unidade?.endereco?.cidade, e.unidade?.endereco?.uf].filter(Boolean).join("/"),
    }));
    return { events, status: res.status, body };
  } catch (err: any) {
    return { events: null, status: 0, body: String(err) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tracking_code } = await req.json();
    if (!tracking_code) throw new Error("tracking_code é obrigatório");

    let token = Deno.env.get("CORREIOS_API_TOKEN") || null;
    const codigoAcesso = Deno.env.get("CORREIOS_CODIGO_ACESSO") || null;

    const debug: DebugInfo = {
      has_token: !!token,
      has_codigo_acesso: !!codigoAcesso,
    };

    let events: TrackingEvent[] | null = null;
    let source = "";

    // 1. Tenta API oficial com token atual
    if (token) {
      const result = await callTrackingAPI(tracking_code, token);
      debug.correios_api = { status: result.status, body: result.body, expired: result.expired };

      if (result.expired && codigoAcesso) {
        // Token expirou — gera novo
        console.log("[Correios] Token expirado, renovando...");
        const gen = await generateToken(codigoAcesso);
        debug.token_generation = { status: gen.status, body: gen.body };

        if (gen.token) {
          const retry = await callTrackingAPI(tracking_code, gen.token);
          debug.correios_api_retry = { status: retry.status, body: retry.body };
          if (retry.events) { events = retry.events; source = "correios_oficial_renovado"; }
        }
      } else if (result.events) {
        events = result.events;
        source = "correios_oficial";
      }
    } else if (codigoAcesso) {
      // Sem token — gera do código de acesso
      console.log("[Correios] Sem token, gerando do código de acesso...");
      const gen = await generateToken(codigoAcesso);
      debug.token_generation = { status: gen.status, body: gen.body };

      if (gen.token) {
        const result = await callTrackingAPI(tracking_code, gen.token);
        debug.correios_api = { status: result.status, body: result.body, expired: result.expired };
        if (result.events) { events = result.events; source = "correios_oficial_gerado"; }
      }
    }

    // 2. Fallback: proxy não-oficial
    if (!events) {
      const proxyResult = await tryCorreiosProxy(tracking_code);
      debug.proxy = { status: proxyResult.status, body: proxyResult.body };
      if (proxyResult.events?.length) { events = proxyResult.events; source = "correios_proxy"; }
    }

    console.log(`[Tracking] ${tracking_code} | source: ${source || "none"} | events: ${events?.length ?? 0}`);

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: !token && !codigoAcesso
            ? "Configure CORREIOS_API_TOKEN ou CORREIOS_CODIGO_ACESSO no Supabase."
            : "Nenhum evento encontrado.",
          needs_config: !token && !codigoAcesso,
          _debug: debug,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, events, source, _debug: debug }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
