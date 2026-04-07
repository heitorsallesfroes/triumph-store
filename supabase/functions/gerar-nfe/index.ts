import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!TINY_TOKEN) throw new Error("Token do Tiny não configurado");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    const { sale_id } = await req.json();

    // Buscar dados da venda
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('*')
      .eq('id', sale_id)
      .single();

    if (saleError || !sale) throw new Error("Venda não encontrada");

    // Buscar itens da venda
    const { data: items } = await supabase
      .from('sale_items')
      .select('*, products(model, color, cost, price)')
      .eq('sale_id', sale_id);

    // Formatar data
    const saleDate = new Date(sale.sale_date);
    const dataEmissao = `${String(saleDate.getDate()).padStart(2, '0')}/${String(saleDate.getMonth() + 1).padStart(2, '0')}/${saleDate.getFullYear()}`;

    // Montar itens da NF
    const produtosNF = (items || []).map((item: any) => ({
      item: {
        descricao: `${item.products?.model || 'Produto'} ${item.products?.color || ''}`.trim(),
        unidade: "Pç",
        quantidade: item.quantity,
        valor_unitario: item.unit_price || item.products?.price || 0,
        tipo: "P",
        ncm: "91021110",
        cst: "0102",
        cfop: "5102",
      }
    }));

    // Montar XML da NF para o Tiny
    const nfeData = {
      nota: {
        data_emissao: dataEmissao,
        data_saida: dataEmissao,
        tipo: "S",
        finalidade_emissao: "1",
        natureza_operacao: "Venda de mercadorias de terceiros para consumidor final",
        forma_pagamento: "0",
        cliente: {
          nome: sale.customer_name,
          cpf_cnpj: sale.customer_cpf || "",
          endereco: sale.address_street || "",
          numero: sale.address_number || "S/N",
          complemento: sale.address_complement || "",
          bairro: sale.neighborhood || "",
          municipio: sale.city || "",
          uf: sale.state || "RJ",
          cep: (sale.zip_code || "").replace(/\D/g, ""),
          fone: (sale.customer_phone || "").replace(/\D/g, ""),
        },
        itens: produtosNF,
        parcelas: [
          {
            parcela: {
              dias: "0",
              data: dataEmissao,
              valor: sale.total_sale_price,
              obs: sale.payment_method || "pix",
            }
          }
        ]
      }
    };

    // Enviar para o Tiny
    const formData = new URLSearchParams();
    formData.append("token", TINY_TOKEN);
    formData.append("formato", "json");
    formData.append("nota", JSON.stringify(nfeData));

    const tinyResponse = await fetch("https://api.tiny.com.br/api2/nota.fiscal.incluir.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const tinyData = await tinyResponse.json();

    if (tinyData.retorno?.status === "Erro") {
      throw new Error(tinyData.retorno?.registros?.registro?.erros?.erro?.msg || "Erro ao criar NF no Tiny");
    }

    const nfeId = tinyData.retorno?.registros?.registro?.id;

    // Salvar referência da NF na venda
    if (nfeId) {
      await supabase.from('sales').update({ 
        nfe_id: nfeId,
        nfe_status: 'criada'
      }).eq('id', sale_id);
    }

    return new Response(
      JSON.stringify({ success: true, nfe_id: nfeId, data: tinyData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});