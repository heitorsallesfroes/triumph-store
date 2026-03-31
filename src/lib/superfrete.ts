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
  phone?: string;
  email?: string;
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

interface SuperFreteResponse {
  id: string;
  tracking_code: string;
  label_url: string;
  status: string;
}

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
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  items: SaleItem[];
}

export interface ShippingLabelResult {
  success: boolean;
  tracking_code?: string;
  label_url?: string;
  error?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SHIPPING_DEFAULTS = {
  weight: 0.3,
  width: 15,
  height: 2,
  length: 16,
  insurance_value: 150,
};

export async function generateShippingLabel(
  params: GenerateShippingLabelParams
): Promise<ShippingLabelResult> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return {
        success: false,
        error: 'Configuração do Supabase não encontrada',
      };
    }

    if (!params.street || !params.number || !params.neighborhood || !params.city || !params.state || !params.zip_code || !params.customer_cpf) {
      return {
        success: false,
        error: 'Preencha os dados completos para envio',
      };
    }

    const sanitizeCEP = (cep: string): string => {
      return cep.replace(/\D/g, '');
    };

    const products: ShippingProduct[] = params.items.map(item => ({
      name: item.name || 'Produto',
      quantity: item.quantity || 1,
      unitary_value: item.price || 100,
    }));

    if (products.length === 0) {
      products.push({
        name: 'Produto',
        quantity: 1,
        unitary_value: 100,
      });
    }

    const requestBody: SuperFreteRequest = {
      from: {
        postal_code: sanitizeCEP('24020125'),
      },
      to: {
        name: params.customer_name,
        postal_code: sanitizeCEP(params.zip_code),
        address: params.street,
        number: params.number,
        district: params.neighborhood,
        city: params.city,
        state_abbr: params.state,
        phone: '21900000000',
        email: 'cliente@email.com',
        document: params.customer_cpf || '00000000000',
      },
      service: '1',
      packages: [
        {
          weight: SHIPPING_DEFAULTS.weight,
          width: SHIPPING_DEFAULTS.width,
          height: SHIPPING_DEFAULTS.height,
          length: SHIPPING_DEFAULTS.length,
        },
      ],
      options: {
        insurance_value: SHIPPING_DEFAULTS.insurance_value,
      },
      products,
      invoice: {
        key: '',
      },
    };

    console.log('Payload final sendo enviado:', JSON.stringify(requestBody, null, 2));

    const apiUrl = `${SUPABASE_URL}/functions/v1/generate-shipment`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
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
