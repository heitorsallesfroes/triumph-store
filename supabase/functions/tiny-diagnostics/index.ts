import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const TOKEN = Deno.env.get("TINY_API_TOKEN")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Collect all tiny_ids from Tiny's smartwatch search
  const tinySmartIds = new Set<number>();
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const r = await fetch("https://api.tiny.com.br/api2/produtos.pesquisa.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${TOKEN}&pesquisa=smartwatch&formato=JSON&situacao=A&pagina=${pagina}`,
    });
    const data = JSON.parse(await r.text());
    if (data?.retorno?.status === "OK") {
      totalPaginas = parseInt(data?.retorno?.numero_paginas) || 1;
      for (const item of data.retorno.produtos || []) {
        if (item?.produto?.id) tinySmartIds.add(parseInt(item.produto.id));
      }
    }
    pagina++;
  } while (pagina <= totalPaginas);

  // 2. Find products in DB that match those tiny_ids but have wrong category
  const { data: toFix } = await supabase
    .from('products')
    .select('id, model, color, category, tiny_id')
    .in('tiny_id', [...tinySmartIds])
    .neq('category', 'smartwatch');

  if (!toFix || toFix.length === 0) {
    return new Response(JSON.stringify({ message: "Nenhum produto para corrigir.", tinyIds: tinySmartIds.size }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Update them all to category: 'smartwatch'
  const idsToFix = toFix.map((p: any) => p.id);
  const { error: updateError, count } = await supabase
    .from('products')
    .update({ category: 'smartwatch' })
    .in('id', idsToFix);

  // 4. Verify
  const { data: afterFix } = await supabase
    .from('products')
    .select('id, model, color, category')
    .in('id', idsToFix);

  return new Response(JSON.stringify({
    tinySmartIds: tinySmartIds.size,
    fixed: toFix.length,
    updateError,
    updatedProducts: afterFix?.map((p: any) => `${p.model} ${p.color} → ${p.category}`),
  }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
