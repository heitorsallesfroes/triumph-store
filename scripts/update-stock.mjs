import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load .env manually
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => l.split('=').map(s => s.trim()))
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const updates = [
  { sku: 'GT5M/PRA',      stock: 9  },
  { sku: 'GT5M/PTO',      stock: -1 },
  { sku: 'GT5M/RSG',      stock: 4  },
  { sku: 'HK08/PTO',      stock: 19 },
  { sku: 'HT43/PTO',      stock: 9  },
  { sku: 'HT43/STL',      stock: 2  },
  { sku: 'MRex4/PRA',     stock: 3  },
  { sku: 'MRex4/PTO',     stock: 10 },
  { sku: 'MRex4/PCL',     stock: 1  },
  { sku: 'MA27U/PCB',     stock: 1  },
  { sku: 'MA27U/PCL',     stock: 1  },
  { sku: 'MA27U/PCP',     stock: 1  },
  { sku: 'S11P/PRA',      stock: 22 },
  { sku: 'S11P/PTO',      stock: 30 },
  { sku: 'S11P/RSG',      stock: 6  },
  { sku: 'U5X/PMN',       stock: 6  },
  { sku: 'U35G/MN',       stock: 0  },
  { sku: 'U35G/TN',       stock: 2  },
  { sku: 'U3Mini/PRACro', stock: 0  },
  { sku: 'U3Mini/PTOCro', stock: 7  },
  { sku: 'U3Mini/RSGCro', stock: 4  },
  { sku: 'U4Pro/PTN',     stock: 15 },
  { sku: 'U4Pro/PMN',     stock: 23 },
  { sku: 'W11M/PRA',      stock: 60 },
  { sku: 'W11M/PTO',      stock: 38 },
  { sku: 'W11M/RSG',      stock: 43 },
  { sku: 'X5/RPTR',       stock: 8  },
  { sku: 'ZBBT/PRAC',     stock: 0  },
  { sku: 'ZBBT/PTOE',     stock: 3  },
];

let ok = 0;
const notFound = [];
const errors = [];

for (const { sku, stock } of updates) {
  const { data, error } = await supabase
    .from('products')
    .update({ current_stock: stock })
    .eq('sku', sku)
    .select('sku, model, color, current_stock');

  if (error) {
    errors.push(`${sku}: ${error.message}`);
  } else if (!data || data.length === 0) {
    notFound.push(sku);
  } else {
    console.log(`✅ ${sku.padEnd(16)} → ${data[0].model} ${data[0].color} = ${stock}`);
    ok++;
  }
}

console.log(`\n--- Resultado ---`);
console.log(`✅ Atualizados : ${ok}`);
if (notFound.length) {
  console.log(`⚠️  Não encontrados (${notFound.length}): ${notFound.join(', ')}`);
}
if (errors.length) {
  console.log(`❌ Erros (${errors.length}):`);
  errors.forEach(e => console.log(`   ${e}`));
}
