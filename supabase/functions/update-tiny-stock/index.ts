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
    const TINY_TOKEN = Deno.env.get("TINY_API_TOKEN");
    if (!TINY_TOKEN) throw new Error("TINY_API_TOKEN não encontrado");

    const { tiny_id, quantidade } = await req.json();

    if (!tiny_id || quantidade === undefined) {
      throw new Error("Parâmetros obrigatórios: tiny_id, quantidade");
    }

    const produto = JSON.stringify({
      produto: {
        id: String(tiny_id),
        estoque: Number(quantidade),
      },
    });

    const response = await fetch("https://api.tiny.com.br/api2/produto.alterar.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${TINY_TOKEN}&produto=${encodeURIComponent(produto)}&formato=JSON`,
    });

    const data = await response.json();
    console.log(`update-tiny-stock tiny_id=${tiny_id} qty=${quantidade}:`, JSON.stringify(data));

    if (data?.retorno?.status !== "OK") {
      const erro =
        data?.retorno?.registros?.registro?.erros?.[0]?.erro ||
        data?.retorno?.erros?.[0]?.erro ||
        JSON.stringify(data?.retorno);
      throw new Error(`Tiny API error: ${erro}`);
    }

    return new Response(
      JSON.stringify({ success: true, tiny_id, quantidade }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("update-tiny-stock error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
