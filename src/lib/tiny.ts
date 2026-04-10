const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface TinyProduct {
  id: number;
  nome: string;
  codigo: string;
  preco: number;
  preco_custo: number;
  situacao: string;
}

export async function importarProdutosDeTiny(): Promise<{
  success: boolean;
  imported: number;
  error?: string;
}> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/import-tiny-products`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      imported: 0,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}