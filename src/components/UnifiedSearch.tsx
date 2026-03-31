import { useState, useEffect, useRef } from 'react';
import { Search, Plus } from 'lucide-react';
import { Product, Accessory } from '../lib/supabase';

interface UnifiedSearchItem {
  type: 'product' | 'accessory';
  id: string;
  displayName: string;
  secondaryInfo: string;
  data: Product | Accessory;
}

interface UnifiedSearchProps {
  products: Product[];
  accessories: Accessory[];
  onAddProduct: (product: Product) => void;
  onAddAccessory: (accessory: Accessory) => void;
  onAddManualItem?: (name: string) => void;
  isHighlighted?: boolean;
}

export default function UnifiedSearch({
  products,
  accessories,
  onAddProduct,
  onAddAccessory,
  onAddManualItem,
  isHighlighted = false,
}: UnifiedSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredItems, setFilteredItems] = useState<UnifiedSearchItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredItems([]);
      setSelectedIndex(0);
      return;
    }

    const term = searchTerm.toLowerCase();
    const items: UnifiedSearchItem[] = [];

    products.forEach((product) => {
      const matchesModel = product.model.toLowerCase().includes(term);
      const matchesColor = product.color.toLowerCase().includes(term);

      if (matchesModel || matchesColor) {
        items.push({
          type: 'product',
          id: product.id,
          displayName: `${product.model} ${product.color}`,
          secondaryInfo: `Estoque: ${product.current_stock} | Custo: R$ ${product.cost.toFixed(2)}`,
          data: product,
        });
      }
    });

    accessories.forEach((accessory) => {
      if (accessory.name.toLowerCase().includes(term)) {
        items.push({
          type: 'accessory',
          id: accessory.id,
          displayName: accessory.name,
          secondaryInfo: `Custo: R$ ${accessory.cost.toFixed(2)}`,
          data: accessory,
        });
      }
    });

    setFilteredItems(items);
    setSelectedIndex(0);
  }, [searchTerm, products, accessories]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const hasManualOption = onAddManualItem && searchTerm.trim() && filteredItems.length === 0;
    const totalOptions = filteredItems.length + (hasManualOption ? 1 : 0);

    if (totalOptions === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % totalOptions);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hasManualOption) {
        handleAddManualItem();
      } else if (filteredItems[selectedIndex]) {
        handleAddItem(filteredItems[selectedIndex]);
      }
    }
  };

  const handleAddItem = (item: UnifiedSearchItem) => {
    if (item.type === 'product') {
      onAddProduct(item.data as Product);
    } else {
      onAddAccessory(item.data as Accessory);
    }

    setSearchTerm('');
    setFilteredItems([]);
    setSelectedIndex(0);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleAddManualItem = () => {
    if (onAddManualItem && searchTerm.trim()) {
      onAddManualItem(searchTerm.trim());
      setSearchTerm('');
      setFilteredItems([]);
      setSelectedIndex(0);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <label className="block text-lg font-semibold text-white mb-3">
        Buscar Produto ou Acessório
      </label>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite modelo, cor ou nome do acessório..."
          className={`w-full bg-gray-700 text-white rounded-lg pl-12 pr-4 py-3 border border-gray-600 focus:border-orange-500 focus:outline-none text-lg transition-all duration-300 ${
            isHighlighted ? 'ring-4 ring-orange-500 ring-opacity-50 border-orange-500 scale-105' : ''
          }`}
        />
      </div>

      {(filteredItems.length > 0 || (onAddManualItem && searchTerm.trim())) && (
        <div className="mt-3 bg-gray-700 rounded-lg border border-gray-600 max-h-96 overflow-y-auto">
          {filteredItems.map((item, index) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => handleAddItem(item)}
              className={`w-full text-left px-4 py-3 transition-colors border-b border-gray-600 last:border-b-0 ${
                index === selectedIndex ? 'bg-gray-600' : 'hover:bg-gray-600'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{item.displayName}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        item.type === 'product'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}
                    >
                      {item.type === 'product' ? 'Produto' : 'Acessório'}
                    </span>
                  </div>
                  <div className="text-gray-400 text-sm">{item.secondaryInfo}</div>
                </div>
                <Plus size={20} className="text-orange-500" />
              </div>
            </button>
          ))}
          {onAddManualItem && searchTerm.trim() && filteredItems.length === 0 && (
            <button
              type="button"
              onClick={handleAddManualItem}
              className={`w-full text-left px-4 py-3 transition-colors ${
                selectedIndex === 0 ? 'bg-gray-600' : 'hover:bg-gray-600'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">Adicionar manualmente: "{searchTerm}"</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      Item Manual
                    </span>
                  </div>
                  <div className="text-gray-400 text-sm">Criar item personalizado com preço manual</div>
                </div>
                <Plus size={20} className="text-orange-500" />
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
