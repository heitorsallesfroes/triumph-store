import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function obterProdutoTiny(id: string, token: string) {
  const response = await fetch("https://api.tiny.com.br/api2/produto.obter.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `token=${token}&id=${id}&formato=JSON`,
  });
  const data = await response.json();
  if (data?.retorno?.status === "OK") return data.retorno.produto;
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
    const body = await req.json();
    const { sale_id } = body;

    if (!sale_id) throw new Error("sale_id é obrigatório");

    const { data: sale, error: saleError } = await supabase
      .from("sales").select("*").eq("id", sale_id).single();

    if (saleError || !sale) throw new Error("Venda não encontrada");

    const { data: saleItems } = await supabase
      .from("sale_items")
      .select("*, products(model, color, sku, tiny_id)")
      .eq("sale_id", sale_id);

    if (!saleItems || saleItems.length === 0) throw new Error("Nenhum item encontrado na venda");

    const itens: any[] = [];
    for (const item of saleItems) {
      const product = item.products;
      if (!product) continue;

      let ncm = "91021110";
      if (product.tiny_id) {
        const produtoTiny = await obterProdutoTiny(product.tiny_id.toString(), TINY_TOKEN);
        if (produtoTiny?.ncm) ncm = produtoTiny.ncm.replace(/\D/g, "");
      }

      itens.push({
        item: {
          codigo: product.sku || "",
          descricao: `${product.model} ${product.color}`,
          tipo: "P",
          ncm,
          unidade: "Pç",
          quantidade: item.quantity,
          valor_unitario: item.unit_price.toFixed(2),
        }
      });
    }

    const hoje = new Date().toLocaleDateString("pt-BR");
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + ":00";

    const nota = {
      nota_fiscal: {
        natureza_operacao: "Venda de mercadorias de terceiros para consumidor final",
        data_emissao: hoje,
        data_entrada_saida: hoje,
        hora_entrada_saida: hora,
        cliente: {
          nome: sale.customer_name,
          tipo_pessoa: "F",
          cpf_cnpj: (sale.customer_cpf || "").replace(/\D/g, ""),
          endereco: sale.address_street || "",
          numero: sale.address_number || "S/N",
          complemento: sale.address_complement || "",
          bairro: sale.neighborhood || "",
          cep: (sale.zip_code || "").replace(/\D/g, ""),
          cidade: sale.city || "",
          uf: (sale.state || "RJ").toUpperCase(),
        },
        itens,
        frete_por_conta: "R",
        forma_pagamento: "dinheiro",
      }
    };

    console.log("Payload NF:", JSON.stringify(nota));

    const incluirResponse = await fetch("https://api.tiny.com.br/api2/nota.fiscal.incluir.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${TINY_TOKEN}&nota=${encodeURIComponent(JSON.stringify(nota))}&formato=JSON`,
    });

    const incluirData = await incluirResponse.json();
    console.log("Incluir NF:", JSON.stringify(incluirData));

    if (incluirData?.retorno?.status !== "OK") {
      const erro = incluirData?.retorno?.registros?.registro?.erros?.[0]?.erro
        || incluirData?.retorno?.erros?.[0]?.erro
        || JSON.stringify(incluirData?.retorno)
        || "Erro ao incluir nota fiscal";
      throw new Error(erro);
    }

    const notaId = incluirData?.retorno?.registros?.registro?.id;
    if (!notaId) throw new Error("ID da nota não retornado: " + JSON.stringify(incluirData));

    const emitirResponse = await fetch("https://api.tiny.com.br/api2/nota.fiscal.emitir.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${TINY_TOKEN}&id=${notaId}&enviarEmail=N&formato=JSON`,
    });

    const emitirData = await emitirResponse.json();
    console.log("Emitir NF:", JSON.stringify(emitirData));

    if (emitirData?.retorno?.status !== "OK") {
      const erro = emitirData?.retorno?.erros?.[0]?.erro || "Erro ao emitir nota fiscal";
      throw new Error(erro);
    }

    const nfData = emitirData?.retorno?.nota_fiscal;

    // Log completo para identificar o campo exato da URL retornado pelo Tiny
    console.log("nfData completo:", JSON.stringify(nfData));
    console.log("Campos disponíveis em nfData:", nfData ? Object.keys(nfData) : "nfData é null/undefined");

    // Tenta campos conhecidos; fallback para URL do Tiny via ID da nota
    const nfeUrl =
      nfData?.link_acesso ||
      nfData?.linkNFe ||
      nfData?.link_nfe ||
      nfData?.link ||
      nfData?.url ||
      nfData?.danfe_url ||
      (nfData?.id ? `https://erp.olist.com/notas_fiscais#edit/${nfData.id}` : null);

    console.log("nfe_url resolvida:", nfeUrl);

    // Salva o ID numérico da nota em nfe_chave para montar a URL de acesso
    const notaNumericId = nfData?.id ? String(nfData.id) : null;

    await supabase.from("sales").update({
      nfe_url: nfeUrl,
      nfe_chave: notaNumericId,
      nfe_status: "emitida",
    }).eq("id", sale_id);

    return new Response(
      JSON.stringify({ success: true, nfe_url: nfeUrl, nfe_chave: notaNumericId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});