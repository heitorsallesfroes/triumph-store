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
    if (!SUPERFRETE_TOKEN) {
      throw new Error("SUPERFRETE_API_TOKEN não encontrado no backend");
    }

    const payload = await req.json();

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${SUPERFRETE_TOKEN}`,
      "User-Agent": "TriumphStore/1.0 (integracao@triumphstore.com.br)",
    };

    const cartResponse = await fetch("https://api.superfrete.com/api/v0/cart", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const cartText = await cartResponse.text();
    let cartData;
    try {
      cartData = JSON.parse(cartText);
    } catch {
      throw new Error(`SuperFrete retornou resposta inválida no carrinho: ${cartText.substring(0, 200)}`);
    }

    if (!cartResponse.ok) {
      throw new Error(cartData?.message || `Erro no carrinho: ${cartResponse.status}`);
    }

    const orderId = cartData?.id;
    if (!orderId) {
      throw new Error("ID do pedido não retornado pelo carrinho");
    }

    const checkoutResponse = await fetch("https://api.superfrete.com/api/v0/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({ orders: [orderId] }),
    });

    const checkoutText = await checkoutResponse.text();
    let checkoutData;
    try {
      checkoutData = JSON.parse(checkoutText);
    } catch {
      throw new Error(`Erro no checkout: ${checkoutText.substring(0, 200)}`);
    }

    if (!checkoutResponse.ok) {
      throw new Error(checkoutData?.message || `Erro no checkout: ${checkoutResponse.status}`);
    }

    const printResponse = await fetch("https://api.superfrete.com/api/v0/shipment/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ orders: [orderId] }),
    });

    const printText = await printResponse.text();
    let printData: Record<string, string> = {};
    try {
      printData = JSON.parse(printText);
    } catch {
      printData = {};
    }

    return new Response(
      JSON.stringify({
        success: true,
        tracking_code: checkoutData?.purchase?.orders?.[0]?.tracking ?? orderId,
        label_url: printData?.url ?? `https://api.superfrete.com/api/v0/shipment/print?orders[]=${orderId}`,
        order_id: orderId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});