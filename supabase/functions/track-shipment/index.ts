import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function parseShippingStatus(events: any[]): string {
  if (!events || events.length === 0) return "Sem informação";

  const latest = events[0];
  const desc = (latest.status || latest.description || latest.message || "").toLowerCase();
  const city  = latest.city  || latest.location || "";
  const state = latest.state || latest.uf || "";
  const location = city ? `${city}${state ? "/" + state.toUpperCase() : ""}` : "";

  if (desc.includes("entregue ao destinatário") || desc.includes("objeto entregue")) {
    const date = latest.date || latest.tracked_at || "";
    const dateStr = date ? formatDateBR(date) : "";
    return dateStr ? `Entregue - ${dateStr}` : "Entregue";
  }
  if (desc.includes("saiu para entrega") || desc.includes("saída para entrega")) {
    return location ? `Saiu para entrega - ${location}` : "Saiu para entrega";
  }
  if (
    desc.includes("em transferência") ||
    desc.includes("em transito") ||
    desc.includes("em trânsito") ||
    desc.includes("transferido") ||
    desc.includes("encaminhado")
  ) {
    return location ? `Em trânsito - ${location}` : "Em trânsito";
  }
  if (desc.includes("aguardando retirada") || desc.includes("caixa postal")) {
    return location ? `Aguardando retirada - ${location}` : "Aguardando retirada";
  }
  if (desc.includes("tentativa") || desc.includes("não entregue") || desc.includes("ausente")) {
    return location ? `Tentativa de entrega - ${location}` : "Tentativa de entrega";
  }
  if (desc.includes("devolvido") || desc.includes("devolver ao remetente")) {
    return "Devolvido ao remetente";
  }
  if (desc.includes("postado") || desc.includes("objeto postado") || desc.includes("coletado")) {
    return "Postado";
  }

  // Fallback: use the raw status trimmed, appending location if available
  const raw = (latest.status || latest.description || latest.message || "Em processamento").trim();
  return location ? `${raw} - ${location}` : raw;
}

function formatDateBR(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return dateStr;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPERFRETE_TOKEN = Deno.env.get("SUPERFRETE_API_TOKEN");
    if (!SUPERFRETE_TOKEN) {
      throw new Error("SUPERFRETE_API_TOKEN não encontrado no backend");
    }

    const { tracking_codes } = await req.json() as { tracking_codes: string[] };

    if (!Array.isArray(tracking_codes) || tracking_codes.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "tracking_codes deve ser um array não vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = {
      "Accept": "application/json",
      "Authorization": `Bearer ${SUPERFRETE_TOKEN}`,
      "User-Agent": "TriumphStore/1.0 (integracao@triumphstore.com.br)",
    };

    const results: { code: string; status: string; error?: string }[] = [];

    for (const code of tracking_codes) {
      try {
        const resp = await fetch(
          `https://api.superfrete.com/api/v0/tracking/${encodeURIComponent(code)}`,
          { method: "GET", headers }
        );

        const text = await resp.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Resposta inválida: ${text.substring(0, 150)}`);
        }

        if (!resp.ok) {
          throw new Error(data?.message || `HTTP ${resp.status}`);
        }

        // Super Frete pode retornar os eventos em data.events, data.tracking_events ou data.data
        const events: any[] =
          data?.events ??
          data?.tracking_events ??
          data?.data?.events ??
          (Array.isArray(data?.data) ? data.data : []);

        const statusText = parseShippingStatus(events);
        results.push({ code, status: statusText });
      } catch (err) {
        results.push({
          code,
          status: "",
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
