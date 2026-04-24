import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const TOKEN = Deno.env.get("TINY_API_TOKEN")!;

  const testIds = [932671818, 933381178, 929124430];

  const results: any = { obter: {}, pesquisa: null };

  // Test multiple endpoints to find which one returns stock
  const endpoints = ["estoque.pesquisa.php", "produto.obter.php"];
  const id = testIds[0];

  for (const ep of endpoints) {
    try {
      const r = await fetch(`https://api.tiny.com.br/api2/${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `token=${TOKEN}&id=${id}&formato=JSON`,
      });
      const text = await r.text();
      try {
        results.obter[ep] = JSON.parse(text);
      } catch {
        results.obter[ep] = { raw: text.substring(0, 500) };
      }
    } catch (e: any) {
      results.obter[ep] = { error: e.message };
    }
  }

  // Also check pesquisa with estoque field
  const rp = await fetch("https://api.tiny.com.br/api2/produtos.pesquisa.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `token=${TOKEN}&pesquisa=GT5+Mini&formato=JSON&situacao=A&pagina=1`,
  });
  results.pesquisa = await rp.json();

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
