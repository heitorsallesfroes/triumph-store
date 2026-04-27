import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface SaleItem {
  name: string;
  quantity: number;
  price: number;
}

export interface GenerateShippingLabelParams {
  customer_name: string;
  customer_cpf: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  items: SaleItem[];
  invoice_key?: string;
}

export interface ShippingLabelResult {
  success: boolean;
  tracking_code?: string;
  label_url?: string;
  error?: string;
}

const REMETENTE = {
  name: "Loja Triumph LTDA",
  address: "Rua Quinze de Novembro",
  number: "106",
  complement: "Rink Offices SL 908",
  district: "Centro",
  city: "Niterói",
  state_abbr: "RJ",
  postal_code: "24020125",
  document: "49923481000104",
};

export async function generateShippingLabel(
  params: GenerateShippingLabelParams
): Promise<ShippingLabelResult> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { success: false, error: 'Configuração do Supabase não encontrada' };
    }

    if (!params.street || !params.number || !params.neighborhood || !params.city || !params.state) {
      return { success: false, error: 'Preencha os dados completos para envio' };
    }

    if (!params.customer_cpf) {
      return { success: false, error: 'CPF/CNPJ do destinatário é obrigatório' };
    }

    const sanitizeCEP = (cep: string) => cep.replace(/\D/g, '');

    const products = params.items.map(item => ({
      name: item.name || 'Produto',
      quantity: item.quantity || 1,
      unitary_value: item.price || 100,
    }));

    if (products.length === 0) {
      products.push({ name: 'Smartwatch', quantity: 1, unitary_value: 100 });
    }

    const payload = {
      from: REMETENTE,
      to: {
        name: params.customer_name,
        address: params.street,
        number: params.number || "S/N",
        complement: params.complement || "",
        district: params.neighborhood || "NA",
        city: params.city,
        state_abbr: params.state.toUpperCase(),
        postal_code: sanitizeCEP(params.zip_code),
        document: params.customer_cpf.replace(/\D/g, ''),
      },
      service: 2,
      volumes: {
        height: 2,
        width: 15,
        length: 16,
        weight: 0.3,
      },
      products,
      options: {
        insurance_value: 150,
        non_commercial: !params.invoice_key,
      },
      ...(params.invoice_key ? { invoice: { key: params.invoice_key } } : {}),
      platform: "TriumphStore",
    };

    console.log('Payload enviado:', JSON.stringify(payload, null, 2));

    const apiUrl = `${SUPABASE_URL}/functions/v1/generate-shipment`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log('Resposta da edge function:', JSON.stringify(data, null, 2));

    if (!response.ok || !data.success) {
      console.error('Super Frete API Error:', data);
      return {
        success: false,
        error: data.error || `Erro ao gerar etiqueta: ${response.status}`,
      };
    }

    return {
      success: true,
      tracking_code: data.tracking_code,
      label_url: data.label_url,
    };

  } catch (error) {
    console.error('Error generating shipping label:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido ao gerar etiqueta',
    };
  }
}