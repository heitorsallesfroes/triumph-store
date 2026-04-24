import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim()))
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const DUPLICATE_ID  = 'ef69b296-fc27-4bb7-8878-4095f41b4ef5';
const CORRECT_ID    = 'e849feb8-1217-4f78-8f6f-97f3698041a0';
const SALE_ITEM_ID  = '76d15c0c-6e02-45ae-8ef7-bb59e04c70c7';

// 1. Reatribuir sale_item ao produto correto
const { error: e1 } = await sb.from('sale_items')
  .update({ product_id: CORRECT_ID })
  .eq('id', SALE_ITEM_ID);

if (e1) { console.error('❌ Erro ao reatribuir sale_item:', e1.message); process.exit(1); }
console.log('✅ sale_item reatribuído para S11P/PTO');

// 2. Verificar que o duplicado não tem mais sale_items
const { data: remaining } = await sb.from('sale_items')
  .select('id').eq('product_id', DUPLICATE_ID);

if (remaining.length > 0) {
  console.error(`❌ Ainda há ${remaining.length} sale_item(s) no produto duplicado. Abortando.`);
  process.exit(1);
}
console.log('✅ Produto duplicado sem sale_items vinculados');

// 3. Deletar produto duplicado
const { error: e2 } = await sb.from('products').delete().eq('id', DUPLICATE_ID);

if (e2) { console.error('❌ Erro ao excluir produto duplicado:', e2.message); process.exit(1); }
console.log('✅ Produto duplicado excluído (ef69b296)');
console.log('\nMigração concluída com sucesso.');
