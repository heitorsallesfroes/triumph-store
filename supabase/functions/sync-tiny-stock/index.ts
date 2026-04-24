import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function obterEstoqueTiny(tinyId: number, token: string): Promise<number | null> {
  const response = await fetch("https://api.tiny.com.br/api2/produto.obter.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `token=${token}&id=${tinyId}&formato=JSON`,
  });
  const data = JSON.parse(await response.text());
  if (data?.retorno?.status === "OK") {
    const estoque = data?.retorno?.produto?.estoque;
    return estoque !== undefined && estoque !== "" ? Math.round(parseFloat(estoque)) : null;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const TINY_TOKEN = Deno.env.get("TINY_API_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!TINY_TOKEN) throw new Error("TINY_API_TOKEN não encontrado");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

    const { data: products, error } = await supabase
      .from("products")
      .select("id, tiny_id, current_stock, model, color")
      .eq("category", "smartwatch")
      .not("tiny_id", "is", null);

    if (error) throw error;

    let updated = 0;
    let unchanged = 0;
    const errors: string[] = [];

    for (const product of products || []) {
      try {
        const novoEstoque = await obterEstoqueTiny(product.tiny_id, TINY_TOKEN);

        if (novoEstoque === null) {
          errors.push(`${product.model} ${product.color}: não encontrado no Tiny`);
          continue;
        }

        if (novoEstoque === product.current_stock) {
          unchanged++;
          continue;
        }

        const { error: updateError } = await supabase
          .from("products")
          .update({ current_stock: novoEstoque })
          .eq("id", product.id);

        if (updateError) {
          errors.push(`${product.model} ${product.color}: erro ao atualizar`);
        } else {
          console.log(`${product.model} ${product.color}: ${product.current_stock} → ${novoEstoque}`);
          updated++;
        }
      } catch (e) {
        errors.push(`${product.model} ${product.color}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: (products || []).length,
        updated,
        unchanged,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
