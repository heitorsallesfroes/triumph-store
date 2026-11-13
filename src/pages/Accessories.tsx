import { useEffect, useState } from 'react';
import { supabase, Accessory } from '../lib/supabase';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

const soDigitos = (v: unknown) => String(v ?? '').replace(/D/g, '');
const ncmFmt = (v: unknown) => { const d = soDigitos(v); return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d; };

export default function Accessories() {
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAccessory, setEditingAccessory] = useState<Accessory | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cost: '',
    ncm: '',
  });

  useEffect(() => {
    loadAccessories();
  }, []);

  const loadAccessories = async () => {
    try {
      const { data, error } = await supabase
        .from('accessories')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setAccessories(data || []);
    } catch (error) {
      console.error('Error loading accessories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const ncm = soDigitos(formData.ncm);
      if (ncm && ncm.length !== 8) { alert('O NCM tem 8 números (ex: 9113.90.00). Deixe vazio se não souber.'); return; }
      const accessoryData = {
        name: formData.name,
        cost: parseFloat(formData.cost),
        ncm: ncm || null,
      };

      const salvar = (dados: Partial<typeof accessoryData>) => (editingAccessory
        ? supabase.from('accessories').update(dados).eq('id', editingAccessory.id)
        : supabase.from('accessories').insert([dados]));
      let { error } = await salvar(accessoryData);
      // migration accessories.ncm ainda não aplicada: salva o resto e avisa que o NCM não foi gravado
      if (error && /ncm/i.test(error.message || '')) {
        ({ error } = await salvar({ name: accessoryData.name, cost: accessoryData.cost }));
        if (!error && ncm) alert('Salvo, mas sem o NCM: falta aplicar a migration 20261121120000_acessorios_ncm.sql no Supabase.');
      }
      if (error) throw error;

      resetForm();
      loadAccessories();
    } catch (error) {
      console.error('Error saving accessory:', error);
      alert('Erro ao salvar acessório');
    }
  };

  const handleEdit = (accessory: Accessory) => {
    setEditingAccessory(accessory);
    setFormData({
      name: accessory.name,
      cost: accessory.cost.toString(),
      ncm: ncmFmt(accessory.ncm),
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este acessório?')) return;

    try {
      const { error } = await supabase
        .from('accessories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadAccessories();
    } catch (error) {
      console.error('Error deleting accessory:', error);
      alert('Erro ao excluir acessório');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      cost: '',
      ncm: '',
    });
    setEditingAccessory(null);
    setShowForm(false);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-white">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Acessórios / Brindes</h1>
          <p className="text-gray-400 mt-2">
            Gerencie acessórios e brindes (sem controle de estoque, usado para cálculo de lucro)
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Plus size={20} />
          Adicionar Acessório
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingAccessory ? 'Editar Acessório' : 'Adicionar Novo Acessório'}
              </h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  placeholder="ex: Pulseira de Silicone, Fone Bluetooth"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Custo (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  placeholder="5.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  NCM (para a nota fiscal)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={formData.ncm}
                  onChange={(e) => setFormData({ ...formData, ncm: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  placeholder="ex: 9113.90.00 (pulseira), 8518.30.00 (fone)"
                />
                <p className="text-xs text-gray-500 mt-1">8 números. Sem NCM o brinde trava a emissão da NF-e.</p>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
                >
                  {editingAccessory ? 'Atualizar Acessório' : 'Adicionar Acessório'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Custo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                NCM
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {accessories.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                  Nenhum acessório ainda. Clique em "Adicionar Acessório" para começar.
                </td>
              </tr>
            ) : (
              accessories.map((accessory) => (
                <tr key={accessory.id} className="hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-white">{accessory.name}</td>
                  <td className="px-6 py-4 text-gray-300">R$ {accessory.cost.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    {soDigitos(accessory.ncm).length === 8
                      ? <span className="text-gray-300 font-mono">{ncmFmt(accessory.ncm)}</span>
                      : <span className="text-red-400 text-sm">sem NCM</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(accessory)}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(accessory.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
