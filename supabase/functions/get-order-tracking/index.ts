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
    const SUPERFRETE_TOKEN = Deno.env.get("SUPERFRETE_API_TOKEN");
    if (!SUPERFRETE_TOKEN) throw new Error("SUPERFRETE_API_TOKEN não encontrado");

    const { order_id } = await req.json();
    if (!order_id) throw new Error("order_id é obrigatório");

    const response = await fetch(`https://api.superfrete.com/api/v0/order/info/${order_id}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${SUPERFRETE_TOKEN}`,
        "User-Agent": "TriumphStore/1.0 (integracao@triumphstore.com.br)",
      },
    });

    const text = await response.text();
    console.log(`[SuperFrete] GET /order/info/${order_id} status:`, response.status);
    console.log(`[SuperFrete] GET /order/info/${order_id} response:`, text);

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Resposta inválida: ${text.substring(0, 200)}`);
    }

    if (!response.ok) {
      throw new Error(data?.message || `Erro ao buscar pedido: ${response.status}`);
    }

    // Tenta extrair o tracking_code de possíveis caminhos na resposta do SuperFrete
    const tracking_code =
      data?.tracking ??
      data?.tracking_code ??
      data?.tracking_number ??
      data?.orders?.[0]?.tracking ??
      data?.purchase?.orders?.[0]?.tracking ??
      null;

    return new Response(
      JSON.stringify({ success: true, tracking_code, _raw: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
