import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function buscarProdutosTiny(pesquisa: string, token: string) {
  const response = await fetch("https://api.tiny.com.br/api2/produtos.pesquisa.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `token=${token}&pesquisa=${pesquisa}&formato=JSON&situacao=A`,
  });
  const text = await response.text();
  const data = JSON.parse(text);
  if (data?.retorno?.status === "OK" && Array.isArray(data?.retorno?.produtos)) {
    return data.retorno.produtos.map((p: any) => p?.produto).filter((p: any) => p != null);
  }
  return [];
}

function detectarCategoria(nome: string): string {
  const nomeLower = nome.toLowerCase();
  if (nomeLower.includes("smartwatch")) return "smartwatch";
  return "acessorio";
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
    const body = await req.json().catch(() => ({}));
    const categoria = body.categoria || "todos";

    const termosBusca = categoria === "smartwatch"
      ? ["smartwatch"]
      : ["pulseira", "fone", "powerbank", "carregador", "cabo"];

    let imported = 0;
    let errors = 0;
    const processados = new Set<string>();

    for (const termo of termosBusca) {
      const produtos = await buscarProdutosTiny(termo, TINY_TOKEN);

      for (const p of produtos) {
        if (processados.has(p.id)) continue;
        processados.add(p.id);

        try {
          const nome: string = p.nome || "";
          const categoriaDetectada = categoria === "smartwatch" ? "smartwatch" : detectarCategoria(nome);

          if (categoria === "acessorio" && categoriaDetectada === "smartwatch") continue;

          const palavras = nome.split(" ");
          const cor = palavras[palavras.length - 1];
          const modelo = palavras.slice(0, -1).join(" ");

          const produto = {
            model: modelo,
            color: cor,
            supplier: "",
            cost: parseFloat(p.preco_custo) || 0,
            price: parseFloat(p.preco) || 0,
            current_stock: 0,
            minimum_stock: 0,
            tiny_id: parseInt(p.id),
            sku: p.codigo || "",
            category: categoriaDetectada,
            updated_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from("products")
            .upsert(produto, { onConflict: "tiny_id" });

          if (error) {
            console.error("Erro:", error.message);
            errors++;
          } else {
            imported++;
          }
        } catch (e) {
          errors++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, imported, errors, categoria }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});