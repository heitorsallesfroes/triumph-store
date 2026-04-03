import { useState, useRef } from 'react';
import { Zap, X, Check } from 'lucide-react';
import { Product, Accessory } from '../lib/supabase';

interface QuickAddProps {
  products: Product[];
  accessories: Accessory[];
  onAddProduct: (product: Product) => void;
  onAddAccessory: (accessory: Accessory) => void;
  onAddManualItem: (name: string) => void;
}

interface ParsedItem {
  query: string;
  found: Product | Accessory | null;
  type: 'product' | 'accessory' | 'manual';
  matched: boolean;
}

export default function QuickAdd({ products, accessories, onAddProduct, onAddAccessory, onAddManualItem }: QuickAddProps) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParsedItem[]>([]);
  const [added, setAdded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalize = (str: string) =>
    str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const findBestMatch = (query: string): { found: Product | Accessory | null; type: 'product' | 'accessory' | 'manual' } => {
    const q = normalize(query);
    if (!q) return { found: null, type: 'manual' };

    // Busca em produtos
    let bestProduct: Product | null = null;
    let bestProductScore = 0;

    for (const product of products) {
      const fullName = normalize(`${product.model} ${product.color}`);
      const model = normalize(product.model);
      const color = normalize(product.color);

      let score = 0;
      if (fullName === q) score = 100;
      else if (fullName.includes(q)) score = 80;
      else if (q.split(' ').every(word => fullName.includes(word))) score = 70;
      else if (model.includes(q) || q.includes(model)) score = 50;
      else if (color.includes(q)) score = 30;

      if (score > bestProductScore) {
        bestProductScore = score;
        bestProduct = product;
      }
    }

    // Busca em acessórios
    let bestAcc: Accessory | null = null;
    let bestAccScore = 0;

    for (const acc of accessories) {
      const name = normalize(acc.name);
      let score = 0;
      if (name === q) score = 100;
      else if (name.includes(q)) score = 80;
      else if (q.split(' ').every(word => name.includes(word))) score = 70;
      else if (q.split(' ').some(word => word.length > 2 && name.includes(word))) score = 40;

      if (score > bestAccScore) {
        bestAccScore = score;
        bestAcc = acc;
      }
    }

    if (bestProductScore >= 40 && bestProductScore >= bestAccScore) {
      return { found: bestProduct, type: 'product' };
    }
    if (bestAccScore >= 40) {
      return { found: bestAcc, type: 'accessory' };
    }
    return { found: null, type: 'manual' };
  };

  const parseText = (raw: string) => {
    if (!raw.trim()) { setPreview([]); return; }

    const parts = raw.split('+').map(p => p.trim()).filter(Boolean);
    const parsed: ParsedItem[] = parts.map(part => {
      // Remove quantidade do início (ex: "2x", "2 ")
      const cleanPart = part.replace(/^\d+x?\s*/i, '').trim();
      const { found, type } = findBestMatch(cleanPart);
      return {
        query: part,
        found,
        type: found ? type : 'manual',
        matched: !!found,
      };
    });
    setPreview(parsed);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    parseText(val);
    setAdded(false);
  };

  const handleConfirm = () => {
    if (preview.length === 0) return;

    preview.forEach(item => {
      if (item.matched && item.type === 'product') {
        onAddProduct(item.found as Product);
      } else if (item.matched && item.type === 'accessory') {
        onAddAccessory(item.found as Accessory);
      } else {
        onAddManualItem(item.query.replace(/^\d+x?\s*/i, '').trim());
      }
    });

    setAdded(true);
    setTimeout(() => {
      setText('');
      setPreview([]);
      setAdded(false);
      inputRef.current?.focus();
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && preview.length > 0) {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <div className="rounded-xl p-4 mb-3" style={{ background: '#111118', border: '1px solid #1a1a2a', borderLeft: '3px solid #f5c518' }}>
      <div className="flex items-center gap-2 mb-3">
        <Zap size={15} style={{ color: '#f5c518' }} />
        <span className="text-sm font-semibold text-white">Entrada Rápida</span>
        <span className="text-xs" style={{ color: '#3a3a5a' }}>— separe os itens com +</span>
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="ex: w11 mini prata + milanese prata + fone i12"
          className="flex-1 px-4 py-2.5 rounded-lg text-sm text-white"
          style={{ background: '#0d0d14', border: '1px solid #1a1a2a' }}
          autoComplete="off"
        />
        <button
          onClick={handleConfirm}
          disabled={preview.length === 0}
          className="px-4 py-2.5 rounded-lg text-sm font-bold transition-all"
          style={{
            background: added ? '#22c55e' : preview.length > 0 ? '#f5c518' : '#1a1a2a',
            color: added ? '#fff' : preview.length > 0 ? '#0a0a0f' : '#3a3a5a',
            cursor: preview.length > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          {added ? <Check size={16} /> : 'Adicionar'}
        </button>
      </div>

      {/* Preview dos itens reconhecidos */}
      {preview.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {preview.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: item.matched ? '#1a2a1a' : '#2a1a1a',
                border: `1px solid ${item.matched ? '#22c55e40' : '#ef444440'}`,
                color: item.matched ? '#22c55e' : '#ef4444',
              }}
            >
              {item.matched ? <Check size={11} /> : <X size={11} />}
              {item.matched
                ? item.type === 'product'
                  ? `${(item.found as Product).model} ${(item.found as Product).color}`
                  : (item.found as Accessory).name
                : `"${item.query}" (manual)`
              }
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
