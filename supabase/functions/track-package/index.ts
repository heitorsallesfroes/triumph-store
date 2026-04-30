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

// Gera um novo Bearer Token usando o código de acesso
async function generateToken(codigoAcesso: string): Promise<string | null> {
  try {
    const credentials = btoa(`${CORREIOS_CNPJ}:${codigoAcesso}`);
    const res = await fetch("https://api.correios.com.br/token/v1/autentica", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[Correios] Falha ao gerar token:", res.status, body);
      return null;
    }
    const data = await res.json();
    console.log("[Correios] Novo token gerado, expira em:", data.expiraEm);
    return data.token ?? null;
  } catch (err) {
    console.error("[Correios] Erro ao gerar token:", err);
    return null;
  }
}

// Chama a API de rastreamento com um token — retorna null se 401 (expirado)
async function callTrackingAPI(
  code: string,
  token: string,
): Promise<{ events: TrackingEvent[] | null; expired: boolean }> {
  try {
    const res = await fetch(
      `https://api.correios.com.br/srorastro/v1/objetos/${code}/eventos`,
      {
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      },
    );

    if (res.status === 401) return { events: null, expired: true };
    if (!res.ok) {
      console.error("[Correios] Tracking API erro:", res.status, await res.text());
      return { events: null, expired: false };
    }

    const data = await res.json();
    const eventos = data?.objetos?.[0]?.eventos || [];
    const events: TrackingEvent[] = eventos.map((e: any) => ({
      date: e.dtHrCriado || "",
      description: e.descricao || e.detalhe || "",
      location: [e.unidade?.endereco?.cidade, e.unidade?.endereco?.uf]
        .filter(Boolean)
        .join("/"),
    }));
    return { events, expired: false };
  } catch (err) {
    console.error("[Correios] Erro na chamada de tracking:", err);
    return { events: null, expired: false };
  }
}

// Tenta o proxy não-oficial dos Correios (fallback sem auth)
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
      date: e.dtHrCriado || "",
      description: e.descricao || "",
      location: [e.unidade?.endereco?.cidade, e.unidade?.endereco?.uf]
        .filter(Boolean)
        .join("/"),
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

    let token = Deno.env.get("CORREIOS_API_TOKEN") || null;
    const codigoAcesso = Deno.env.get("CORREIOS_CODIGO_ACESSO") || null;

    let events: TrackingEvent[] | null = null;
    let source = "";

    // 1. Tenta API oficial com token atual
    if (token) {
      const result = await callTrackingAPI(tracking_code, token);

      if (result.expired && codigoAcesso) {
        // 2. Token expirou — gera novo usando o código de acesso
        console.log("[Correios] Token expirado, renovando...");
        const newToken = await generateToken(codigoAcesso);

        if (newToken) {
          token = newToken;
          const retry = await callTrackingAPI(tracking_code, newToken);
          if (retry.events) {
            events = retry.events;
            source = "correios_oficial_token_renovado";
          }
        }
      } else if (result.events) {
        events = result.events;
        source = "correios_oficial";
      }
    } else if (codigoAcesso) {
      // Sem token salvo — gera direto do código de acesso
      console.log("[Correios] Sem token salvo, gerando do código de acesso...");
      const newToken = await generateToken(codigoAcesso);
      if (newToken) {
        const result = await callTrackingAPI(tracking_code, newToken);
        if (result.events) {
          events = result.events;
          source = "correios_oficial_gerado";
        }
      }
    }

    // 3. Fallback: proxy não-oficial
    if (!events) {
      events = await tryCorreiosProxy(tracking_code);
      if (events) source = "correios_proxy";
    }

    console.log(
      `[Tracking] ${tracking_code} | source: ${source || "none"} | events: ${events?.length ?? 0}`,
    );

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: !token && !codigoAcesso
            ? "Configure CORREIOS_API_TOKEN ou CORREIOS_CODIGO_ACESSO no Supabase."
            : "Nenhum evento de rastreamento encontrado para este código.",
          needs_config: !token && !codigoAcesso,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, events, source }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
