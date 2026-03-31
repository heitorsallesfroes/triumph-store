import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Settings() {
  const [isExporting, setIsExporting] = useState(false);

  const exportBackup = async () => {
    try {
      setIsExporting(true);

      const [
        productsResult,
        accessoriesResult,
        salesResult,
        suppliersResult,
        citiesResult,
        neighborhoodsResult,
        motoboysResult
      ] = await Promise.all([
        supabase.from('products').select('*').order('created_at'),
        supabase.from('accessories').select('*').order('created_at'),
        supabase.from('sales').select('*').order('created_at'),
        supabase.from('suppliers').select('*').order('created_at'),
        supabase.from('cities').select('*').order('name'),
        supabase.from('neighborhoods').select('*').order('name'),
        supabase.from('motoboys').select('*').order('created_at')
      ]);

      if (productsResult.error) throw productsResult.error;
      if (accessoriesResult.error) throw accessoriesResult.error;
      if (salesResult.error) throw salesResult.error;
      if (suppliersResult.error) throw suppliersResult.error;
      if (citiesResult.error) throw citiesResult.error;
      if (neighborhoodsResult.error) throw neighborhoodsResult.error;
      if (motoboysResult.error) throw motoboysResult.error;

      const backup = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: {
          products: productsResult.data || [],
          accessories: accessoriesResult.data || [],
          sales: salesResult.data || [],
          suppliers: suppliersResult.data || [],
          cities: citiesResult.data || [],
          neighborhoods: neighborhoodsResult.data || [],
          motoboys: motoboysResult.data || []
        }
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `triumph-store-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert('Backup exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar backup:', error);
      alert('Erro ao exportar backup. Por favor, tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold text-white mb-2">Configurações</h1>
        <p className="text-gray-400 mb-8">Gerencie as configurações do sistema</p>

        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-6 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-1">Backup do Sistema</h2>
            <p className="text-gray-400 text-sm">
              Exporte todos os dados do sistema em formato JSON
            </p>
          </div>

          <div className="p-6">
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-medium text-white mb-3">Exportar Backup Completo</h3>
              <p className="text-gray-400 text-sm mb-4">
                O backup incluirá todos os dados de: produtos, acessórios, vendas, fornecedores,
                cidades, bairros e motoboys. Use este arquivo para restaurar o sistema posteriormente.
              </p>

              <button
                onClick={exportBackup}
                disabled={isExporting}
                className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Exportando...</span>
                  </>
                ) : (
                  <>
                    <Download size={20} />
                    <span>Exportar Backup</span>
                  </>
                )}
              </button>

              <div className="mt-4 p-4 bg-gray-800 rounded border border-gray-700">
                <p className="text-xs text-gray-400">
                  <strong className="text-gray-300">Nota:</strong> O arquivo de backup contém
                  todos os dados sensíveis do sistema. Mantenha-o em local seguro.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
