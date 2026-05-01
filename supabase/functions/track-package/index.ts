import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tracking_code } = await req.json();
    if (!tracking_code) throw new Error("tracking_code é obrigatório");

    const token = Deno.env.get("SEURASTREIO_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Configure SEURASTREIO_TOKEN no Supabase.",
          needs_config: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const res = await fetch(
      `https://seurastreio.com.br/api/public/rastreio/${tracking_code}`,
      { headers: { "Authorization": `Bearer ${token}` } },
    );

    const body = await res.text();
    console.log(`[SeuRastreio] ${tracking_code} | status: ${res.status}`);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `SeuRastreio retornou ${res.status}`, _body: body }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = JSON.parse(body);

    if (data.status === "not_found" || !data.eventoMaisRecente) {
      return new Response(
        JSON.stringify({ success: false, error: "Objeto não encontrado.", status: "not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const evento = data.eventoMaisRecente;
    return new Response(
      JSON.stringify({
        success: true,
        status: "found",
        description: evento.descricao ?? "",
        detail: evento.detalhe ?? "",
        date: evento.data ?? "",
        location: evento.local ?? "",
        destination: evento.destino ?? "",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
