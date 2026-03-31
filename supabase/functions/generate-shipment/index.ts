import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ShippingFrom {
  postal_code: string;
}

interface ShippingTo {
  name: string;
  postal_code: string;
  address: string;
  number: string;
  district: string;
  city: string;
  state_abbr: string;
  phone: string;
  email: string;
  document: string;
}

interface ShippingPackage {
  weight: number;
  width: number;
  height: number;
  length: number;
}

interface ShippingProduct {
  name: string;
  quantity: number;
  unitary_value: number;
}

interface SuperFreteRequest {
  from: ShippingFrom;
  to: ShippingTo;
  service: string;
  packages: ShippingPackage[];
  options: {
    insurance_value: number;
  };
  products: ShippingProduct[];
  invoice: {
    key: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const SUPERFRETE_TOKEN = Deno.env.get("SUPERFRETE_API_TOKEN");

    console.log("=== Super Frete Authentication Debug ===");
    console.log("Token exists:", !!SUPERFRETE_TOKEN);
    console.log("Token length:", SUPERFRETE_TOKEN?.length || 0);

    if (!SUPERFRETE_TOKEN) {
      console.error("SUPERFRETE_API_TOKEN não encontrado no backend");
      return new Response(
        JSON.stringify({
          success: false,
          error: "SUPERFRETE_API_TOKEN não encontrado no backend",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const incomingPayload = await req.json();

    const sanitizeCEP = (cep: string): string => {
      return cep.replace(/\D/g, '');
    };

    const sanitizedFromCEP = sanitizeCEP(incomingPayload.from.postal_code);
    const sanitizedToCEP = sanitizeCEP(incomingPayload.to.postal_code);

    const products: ShippingProduct[] = (incomingPayload.products || []).map((p: any) => ({
      name: p.name || "Produto",
      quantity: p.quantity || 1,
      unitary_value: p.unitary_value || 100,
    }));

    if (products.length === 0) {
      products.push({
        name: "Produto",
        quantity: 1,
        unitary_value: 100,
      });
    }

    const payload: SuperFreteRequest = {
      from: {
        postal_code: sanitizedFromCEP,
      },
      to: {
        name: incomingPayload.to.name,
        postal_code: sanitizedToCEP,
        address: incomingPayload.to.address,
        number: incomingPayload.to.number,
        district: incomingPayload.to.district,
        city: incomingPayload.to.city,
        state_abbr: incomingPayload.to.state_abbr,
        phone: incomingPayload.to.phone || "21900000000",
        email: incomingPayload.to.email || "cliente@email.com",
        document: incomingPayload.to.document || "00000000000",
      },
      service: "1",
      packages: [
        {
          weight: incomingPayload.packages?.[0]?.weight || 0.3,
          width: incomingPayload.packages?.[0]?.width || 15,
          height: incomingPayload.packages?.[0]?.height || 2,
          length: incomingPayload.packages?.[0]?.length || 16,
        },
      ],
      options: {
        insurance_value: incomingPayload.options?.insurance_value || 150,
      },
      products,
      invoice: {
        key: "",
      },
    };

    console.log("Payload final sendo enviado:", JSON.stringify(payload, null, 2));

    console.log("=== Making request to Super Frete API ===");
    console.log("URL: https://api.superfrete.com/v1/shipments");
    console.log("Method: POST");
    console.log("Authorization header configured: Bearer [TOKEN]");

    const response = await fetch("https://api.superfrete.com/v1/shipments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPERFRETE_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    console.log("=== Super Frete Response ===");
    console.log("Response Status:", response.status);
    console.log("Response Headers:", Object.fromEntries(response.headers.entries()));

    const contentType = response.headers.get("content-type");
    let responseData;

    if (contentType && contentType.includes("application/json")) {
      responseData = await response.json();
      console.log("Super Frete Response Data (JSON):", JSON.stringify(responseData, null, 2));
    } else {
      const textResponse = await response.text();
      console.error("=== Super Frete returned non-JSON response ===");
      console.error("Response Status:", response.status);
      console.error("Content-Type:", contentType);
      console.error("SuperFrete raw response:", textResponse);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Super Frete retornou uma resposta inválida (não-JSON). Verifique as credenciais e o formato da requisição.",
          debug: {
            status: response.status,
            contentType: contentType || "none",
            response: textResponse.substring(0, 500),
          },
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!response.ok) {
      console.error("Super Frete API Error:", {
        status: response.status,
        statusText: response.statusText,
        data: responseData,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: responseData.message || `Erro ao gerar etiqueta: ${response.status}`,
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        tracking_code: responseData.tracking_code,
        label_url: responseData.label_url,
        id: responseData.id,
        status: responseData.status,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in generate-shipment function:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido ao gerar etiqueta",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
