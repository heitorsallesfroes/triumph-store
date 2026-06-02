import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function parseStatus(descricao: string, local: string): string {
  if (!descricao) return "Sem informação";

  const desc = descricao.toLowerCase();
  const location = local?.trim() || "";

  if (desc.includes("entregue ao destinatário") || desc.includes("objeto entregue") || desc.includes("entregue")) {
    return location ? `Entregue - ${location}` : "Entregue";
  }
  if (desc.includes("saiu para entrega") || desc.includes("saída para entrega") || desc.includes("em rota de entrega")) {
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
    return location ? `Postado - ${location}` : "Postado";
  }

  return location ? `${descricao.trim()} - ${location}` : descricao.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("SEURASTREIO_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Configure SEURASTREIO_TOKEN nos secrets da edge function." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { tracking_codes } = await req.json() as { tracking_codes: string[] };

    if (!Array.isArray(tracking_codes) || tracking_codes.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "tracking_codes deve ser um array não vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: { code: string; status: string; error?: string }[] = [];

    await Promise.all(tracking_codes.map(async (code) => {
      try {
        const res = await fetch(
          `https://seurastreio.com.br/api/public/rastreio/${encodeURIComponent(code)}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept": "application/json",
            },
            signal: AbortSignal.timeout(20000),
          },
        );

        const text = await res.text();
        console.log(`[SeuRastreio] ${code} | HTTP ${res.status}`);

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Resposta inválida do Seu Rastreio: ${text.substring(0, 120)}`);
        }

        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }

        if (data.status === "not_found" || !data.eventoMaisRecente) {
          results.push({ code, status: "Sem informação", error: undefined });
          return;
        }

        const ev = data.eventoMaisRecente;
        const statusText = parseStatus(ev.descricao ?? "", ev.local ?? "");
        results.push({ code, status: statusText });

      } catch (err) {
        results.push({
          code,
          status: "",
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }));

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
