import { useEffect, useState, useRef } from 'react';
import { supabase, Product, Accessory, Motoboy, Supplier } from '../lib/supabase';
import { Trash2, ShoppingCart, TrendingUp, Loader2 } from 'lucide-react';
import { calculateCardFee, getFeePercentageLabel } from '../lib/cardFees';
import UnifiedSearch from '../components/UnifiedSearch';
import QuickAdd from '../components/QuickAdd';
import AutocompleteInput from '../components/AutocompleteInput';
import { validateAddressForDeliveryType } from '../lib/addressValidation';
import { fetchAddressByCep } from '../lib/viaCep';
import { formatCpf, cleanCpf, validateCpf } from '../lib/cpfValidation';

interface City {
  id: string;
  name: string;
}

interface Neighborhood {
  id: string;
  name: string;
}

interface SaleProduct {
  product_id: string;
  product?: Product;
  quantity: number;
  unit_price: number;
  unit_cost: number;
}

interface SaleAccessoryItem {
  accessory_id: string | null;
  accessory?: Accessory;
  quantity: number;
  cost: number;
  custom_name?: string;
}

interface ManualItem {
  name: string;
  price: number;
  cost: number;
  quantity: number;
}

interface PaymentEntry {
  method: string;
  card_brand: string;
  installments: number;
  amount: number;
}

interface SalesProps {
  triggerFastSale?: number;
  onNavigate?: (page: string) => void;
}

export default function Sales({ triggerFastSale, onNavigate }: SalesProps) {
  console.log('Nova Venda loaded');

  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('');
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepError, setCepError] = useState('');
  const [cpfError, setCpfError] = useState('');
  const [cpfDisplay, setCpfDisplay] = useState('');

  const novaSaleRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_cpf: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    city: '',
    neighborhood: '',
    state: '',
    zip_code: '',
    delivery_type: 'motoboy',
    motoboy_id: '',
    supplier_id: '',
    delivery_fee: 20,
    delivery_cost: 0,
    volumes: 1,
  });

  const [saleProducts, setSaleProducts] = useState<SaleProduct[]>([]);
  const [saleAccessories, setSaleAccessories] = useState<SaleAccessoryItem[]>([]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'pago' | 'a_cobrar'>('a_cobrar');
  const [perProductSupplierIds, setPerProductSupplierIds] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<PaymentEntry[]>([
    { method: 'credit_card', card_brand: 'visa_mastercard', installments: 10, amount: 0 },
  ]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (triggerFastSale && triggerFastSale > 0) {
      setTimeout(() => {
        novaSaleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        setTimeout(() => {
          setIsHighlighted(true);

          setTimeout(() => {
            setIsHighlighted(false);
          }, 1000);
        }, 500);
      }, 100);
    }
  }, [triggerFastSale]);

  // Handle ESC key to clear form
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Check if user is in the sales page and not typing in a different context
        const target = e.target as HTMLElement;
        const isInForm = target.closest('form') !== null;

        if (isInForm) {
          e.preventDefault();
          clearForm();
        }
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, []);



  const loadData = async () => {
    try {
      console.log('Loading data for Nova Venda...');
      const [productsRes, accessoriesRes, motoboysRes, suppliersRes, citiesRes, neighborhoodsRes] = await Promise.all([
        supabase.from('products').select('*').order('model'),
        supabase.from('accessories').select('*').order('name'),
        supabase.from('motoboys').select('*').order('name'),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('cities').select('*').order('name'),
        supabase.from('neighborhoods').select('*').order('name'),
      ]);

      console.log('Data loaded:', {
        products: productsRes.data?.length,
        accessories: accessoriesRes.data?.length,
        motoboys: motoboysRes.data?.length,
        suppliers: suppliersRes.data?.length,
        cities: citiesRes.data?.length,
        neighborhoods: neighborhoodsRes.data?.length
      });

      setProducts(productsRes.data || []);
      setFilteredProducts(productsRes.data || []);
      setAccessories(accessoriesRes.data || []);
      setMotoboys(motoboysRes.data || []);
      setSuppliers(suppliersRes.data || []);
      setCities(citiesRes.data || []);
      setNeighborhoods(neighborhoodsRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Erro ao carregar dados. Por favor, recarregue a página.');
    } finally {
      setLoading(false);
      console.log('Loading complete');
    }
  };

  const calculateVolumes = (productsList: SaleProduct[]) => {
  const totalSmartWatches = productsList.reduce((sum, sp) => {
    const product = products.find((p) => p.id === sp.product_id);
    if ((product as any)?.category === 'smartwatch') {
      return sum + sp.quantity;
    }
    return sum;
  }, 0);
  return Math.max(1, totalSmartWatches);
};

  useEffect(() => {
    const volumes = calculateVolumes(saleProducts);
    setFormData((prev) => ({ ...prev, volumes }));
  }, [saleProducts]);

  const addProductFromSearch = (product: Product) => {
    const existing = saleProducts.find((sp) => sp.product_id === product.id);
    if (existing) {
      const updated = saleProducts.map((sp) =>
        sp.product_id === product.id ? { ...sp, quantity: sp.quantity + 1 } : sp
      );
      setSaleProducts(updated);
    } else {
      setSaleProducts([
        ...saleProducts,
        { product_id: product.id, product, quantity: 1, unit_price: product.price, unit_cost: product.cost },
      ]);
    }
  };

  const updateProduct = (index: number, field: string, value: string | number) => {
    const updated = [...saleProducts];
    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      updated[index] = { ...updated[index], product_id: value as string, product };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setSaleProducts(updated);
  };

  const removeProduct = (index: number) => {
    setSaleProducts(saleProducts.filter((_, i) => i !== index));
  };

  const updateAccessory = (index: number, field: string, value: string | number) => {
    const updated = [...saleAccessories];
    if (field === 'accessory_id') {
      const accessory = accessories.find((a) => a.id === value);
      updated[index] = { ...updated[index], accessory_id: value as string, accessory };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setSaleAccessories(updated);
  };

  const removeAccessory = (index: number) => {
    setSaleAccessories(saleAccessories.filter((_, i) => i !== index));
  };

  const addAccessoryFromSearch = (accessory: Accessory) => {
    const existing = saleAccessories.find((sa) => sa.accessory_id === accessory.id);
    if (existing) {
      const updated = saleAccessories.map((sa) =>
        sa.accessory_id === accessory.id ? { ...sa, quantity: sa.quantity + 1 } : sa
      );
      setSaleAccessories(updated);
    } else {
      setSaleAccessories([
        ...saleAccessories,
        { accessory_id: accessory.id, accessory, quantity: 1, cost: accessory.cost },
      ]);
    }
  };

  const addManualItem = (name: string) => {
    setManualItems([...manualItems, { name, price: 0, cost: 0, quantity: 1 }]);
  };

  const updateManualItem = (index: number, field: string, value: string | number) => {
    const updated = [...manualItems];
    updated[index] = { ...updated[index], [field]: value };
    setManualItems(updated);
  };

  const removeManualItem = (index: number) => {
    setManualItems(manualItems.filter((_, i) => i !== index));
  };

  const saveProductCost = async (productId: string, cost: number) => {
    try {
      await supabase.from('products').update({ cost }).eq('id', productId);
    } catch (error) {
      console.error('Error saving product cost:', error);
    }
  };

  const updatePaymentMethod = (index: number, field: string, value: string | number) => {
    const updated = [...paymentMethods];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'method' && value !== 'credit_card' && value !== 'debit_card' && value !== 'payment_link') {
      updated[index].card_brand = '';
      updated[index].installments = 0;
    }
    if (field === 'method' && value !== 'credit_card' && value !== 'payment_link') {
      updated[index].installments = 0;
    }
    setPaymentMethods(updated);
  };

  const addPaymentEntry = () => {
    setPaymentMethods([...paymentMethods, { method: 'pix', card_brand: '', installments: 0, amount: 0 }]);
  };

  const removePaymentEntry = (index: number) => {
    setPaymentMethods(paymentMethods.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    try {
      const totalSalePrice = (saleProducts || []).reduce((sum, sp) => sum + (sp.unit_price || 0) * (sp.quantity || 0), 0);
      const totalManualPrice = (manualItems || []).reduce((sum, mi) => sum + (mi.price || 0) * (mi.quantity || 0), 0);
      const totalProductCost = (saleProducts || []).reduce((sum, sp) => {
        return sum + (sp.unit_cost || 0) * (sp.quantity || 0);
      }, 0);
      const totalAccessoryCost = (saleAccessories || []).reduce((sum, sa) => {
        return sum + (sa.cost || 0) * (sa.quantity || 0);
      }, 0);
      const totalManualCost = (manualItems || []).reduce((sum, mi) => sum + (mi.cost || 0) * (mi.quantity || 0), 0);

      const totalWithManual = totalSalePrice + totalManualPrice;

      const allAmountsZero = paymentMethods.every((pm) => pm.amount === 0);
      const cardFee = allAmountsZero
        ? calculateCardFee(totalWithManual, paymentMethods[0]?.method || 'pix', paymentMethods[0]?.card_brand || '', paymentMethods[0]?.installments || 0)
        : paymentMethods.reduce((sum, pm) => sum + calculateCardFee(pm.amount, pm.method, pm.card_brand || '', pm.installments || 0), 0);

      const deliveryFee = formData.delivery_type === 'motoboy' ? (formData.delivery_fee || 0) : 0;
      const deliveryCost = formData.delivery_type === 'correios' ? (formData.delivery_cost || 0) : 0;
      const totalCost = totalProductCost + totalAccessoryCost + totalManualCost + deliveryFee + deliveryCost;
      const netReceived = totalWithManual - cardFee;
      const profit = netReceived - totalCost;

      return {
        totalSalePrice: totalWithManual,
        totalProductCost,
        totalAccessoryCost,
        cardFee,
        deliveryFee,
        deliveryCost,
        totalCost,
        netReceived,
        profit,
      };
    } catch (error) {
      console.error('Error in calculateTotals:', error);
      return {
        totalSalePrice: 0,
        totalProductCost: 0,
        totalAccessoryCost: 0,
        cardFee: 0,
        deliveryFee: 0,
        deliveryCost: 0,
        totalCost: 0,
        netReceived: 0,
        profit: 0,
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (saleProducts.length === 0 && manualItems.length === 0) {
      alert('Por favor, adicione pelo menos um produto ou item');
      return;
    }

    for (const mi of manualItems) {
      if (mi.price < 0) {
        alert(`Por favor, insira o preço para o item "${mi.name}"`);
        return;
      }
    }

    const smartwatchItems = saleProducts.filter(sp => (sp.product as any)?.category === 'smartwatch');
    const isMultiSupplier = smartwatchItems.length >= 2;

    if (isMultiSupplier) {
      if (smartwatchItems.some(sp => !perProductSupplierIds[sp.product_id])) {
        alert('Por favor, selecione o fornecedor para cada smartwatch');
        return;
      }
    } else if (supplierSearch.trim() === '') {
      alert('Por favor, informe o fornecedor');
      return;
    }

    if (formData.delivery_type === 'correios') {
      if (!formData.address_street || !formData.address_number || !neighborhoodSearch.trim() ||
          !citySearch.trim() || !formData.state || !formData.zip_code || !formData.customer_cpf) {
        alert('Preencha todos os dados para envio pelos Correios');
        return;
      }

      const cleanedCpf = cleanCpf(formData.customer_cpf);
      if (!validateCpf(cleanedCpf)) {
        alert('CPF inválido');
        return;
      }
    }

    const addressValidation = validateAddressForDeliveryType(formData.delivery_type, {
      customer_name: formData.customer_name,
      street: formData.address_street,
      number: formData.address_number,
      neighborhood: neighborhoodSearch.trim(),
      city: citySearch.trim(),
      state: formData.state,
      zip_code: formData.zip_code,
    });

    if (!addressValidation.isValid) {
      alert(addressValidation.message);
      return;
    }

    for (const sp of saleProducts) {
     if (sp.unit_price < 0) {
  alert('Por favor, insira o preço de venda para todos os produtos');
  return;
}
      const product = products.find((p) => p.id === sp.product_id);
     if (!product) {
  alert(`Produto não encontrado`);
  return;
}
    }

    const allAmountsZero = paymentMethods.every((pm) => pm.amount === 0);
    if (!allAmountsZero) {
      const totalExpected = saleProducts.reduce((s, sp) => s + sp.unit_price * sp.quantity, 0) +
        manualItems.reduce((s, mi) => s + mi.price * mi.quantity, 0);
      const totalAllocated = paymentMethods.reduce((s, pm) => s + pm.amount, 0);
      if (Math.abs(totalAllocated - totalExpected) > 0.01) {
        alert(`Total alocado (R$ ${totalAllocated.toFixed(2)}) não bate com o valor da venda (R$ ${totalExpected.toFixed(2)})`);
        return;
      }
    }

    try {
      // Auto-create supplier if it doesn't exist
      let supplierId = formData.supplier_id;

      if (isMultiSupplier) {
        supplierId = perProductSupplierIds[smartwatchItems[0]?.product_id] || '';
      } else if (!supplierId && supplierSearch.trim()) {
        const supplierName = supplierSearch.trim();
        const existingSupplier = suppliers.find(
          (s) => s.name.toLowerCase() === supplierName.toLowerCase()
        );

        if (existingSupplier) {
          supplierId = existingSupplier.id;
        } else {
          const { data: newSupplier, error: supplierError } = await supabase
            .from('suppliers')
            .insert([{ name: supplierName }])
            .select()
            .single();

          if (supplierError) throw supplierError;
          supplierId = newSupplier.id;

          // Reload suppliers to update the list
          const { data: updatedSuppliers } = await supabase
            .from('suppliers')
            .select('*')
            .order('name');
          setSuppliers(updatedSuppliers || []);
        }
      }

      // Auto-create city if it doesn't exist
      let cityName = citySearch.trim();
      if (cityName) {
        const existingCity = cities.find(
          (c) => c.name.toLowerCase() === cityName.toLowerCase()
        );

        if (!existingCity) {
          const { error: cityError } = await supabase
            .from('cities')
            .insert([{ name: cityName }]);

          if (cityError && !cityError.message.includes('duplicate')) {
            throw cityError;
          }

          // Reload cities
          const { data: updatedCities } = await supabase
            .from('cities')
            .select('*')
            .order('name');
          setCities(updatedCities || []);
        }
      }

      // Auto-create neighborhood if it doesn't exist
      let neighborhoodName = neighborhoodSearch.trim();
      if (neighborhoodName) {
        const existingNeighborhood = neighborhoods.find(
          (n) => n.name.toLowerCase() === neighborhoodName.toLowerCase()
        );

        if (!existingNeighborhood) {
          const { error: neighborhoodError } = await supabase
            .from('neighborhoods')
            .insert([{ name: neighborhoodName }]);

          if (neighborhoodError && !neighborhoodError.message.includes('duplicate')) {
            throw neighborhoodError;
          }

          // Reload neighborhoods
          const { data: updatedNeighborhoods } = await supabase
            .from('neighborhoods')
            .select('*')
            .order('name');
          setNeighborhoods(updatedNeighborhoods || []);
        }
      }

      const totals = calculateTotals();

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([
          {
            customer_name: formData.customer_name,
            customer_phone: formData.customer_phone || null,
            customer_cpf: formData.customer_cpf ? cleanCpf(formData.customer_cpf) : null,
            address_street: formData.address_street || null,
            address_number: formData.address_number || null,
            address_complement: formData.address_complement || null,
            city: cityName,
            neighborhood: neighborhoodName,
            state: formData.state || null,
            zip_code: formData.zip_code || null,
            payment_method: paymentMethods[0]?.method || 'pix',
            card_brand: paymentMethods.find((pm) => pm.method === 'credit_card' || pm.method === 'debit_card' || pm.method === 'payment_link')?.card_brand || null,
            installments: paymentMethods.find((pm) => pm.method === 'credit_card' || pm.method === 'payment_link')?.installments || 1,
            payment_methods: paymentMethods,
            delivery_type: formData.delivery_type,
            motoboy_id: formData.delivery_type === 'motoboy' ? (formData.motoboy_id || null) : null,
            supplier_id: supplierId || null,
            delivery_fee: totals.deliveryFee,
            delivery_cost: totals.deliveryCost,
            card_fee: totals.cardFee,
            total_cost: totals.totalCost,
            total_sale_price: totals.totalSalePrice,
            net_received: totals.netReceived,
            profit: totals.profit,
            volumes: formData.volumes,
            manual_items: manualItems.length > 0 ? manualItems : null,
            payment_status: paymentStatus,
            status: 'em_separacao',
            sale_date: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (saleError) throw saleError;

      const saleItemsData = saleProducts.map((sp) => ({
        sale_id: saleData.id,
        product_id: sp.product_id,
        quantity: sp.quantity,
        unit_price: sp.unit_price,
        total_price: sp.unit_price * sp.quantity,
        ...(isMultiSupplier ? { supplier_id: perProductSupplierIds[sp.product_id] || null } : {}),
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItemsData);

      if (itemsError) throw itemsError;

      if (saleAccessories.length > 0) {
        const accessoriesData = saleAccessories.map((sa) => ({
          sale_id: saleData.id,
          accessory_id: sa.accessory_id,
          custom_name: sa.custom_name || null,
          quantity: sa.quantity,
          cost: sa.cost,
        }));

        const { error: accError } = await supabase.from('sale_accessories').insert(accessoriesData);

        if (accError) throw accError;
      }

      for (const mi of manualItems) {
        const modelName = mi.name.trim();
        const existingProduct = products.find(
          (p) => (p as any).model?.toLowerCase() === modelName.toLowerCase() && (p as any).category === 'acessorio'
        );

        if (!existingProduct) {
          await supabase.from('products').insert([{
            category: 'acessorio',
            model: modelName,
            cost: mi.cost,
            price: mi.price,
            current_stock: 0,
          }]);
        }
      }

     for (const sp of saleProducts) {
        const product = products.find((p) => p.id === sp.product_id);
        if (product) {
          const { error: stockError } = await supabase
            .from('products')
            .update({ current_stock: product.current_stock - sp.quantity })
            .eq('id', sp.product_id);

          if (stockError) throw stockError;

          // Atualizar estoque no Tiny
          if ((product as any).tiny_id) {
            const novoEstoque = product.current_stock - sp.quantity;
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-tiny-stock`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ tiny_id: (product as any).tiny_id, quantidade: novoEstoque }),
            });
          }
        }
      }
      alert('Venda registrada com sucesso!');
      resetForm();
      onNavigate?.('history');
    } catch (error: any) {
      console.error('Error saving sale:', error);
      const errorMessage = error?.message || 'Erro desconhecido';
      alert(`Erro ao salvar venda: ${errorMessage}`);
    }
  };

  const handleCepChange = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    setFormData({ ...formData, zip_code: cleanCep });
    setCepError('');

    if (cleanCep.length === 8) {
      setLoadingCep(true);
      const address = await fetchAddressByCep(cleanCep);
      setLoadingCep(false);

      if (address) {
        setFormData(prev => ({
          ...prev,
          address_street: address.logradouro || prev.address_street,
          state: address.uf || prev.state,
        }));

        if (address.localidade) {
          setCitySearch(address.localidade);
        }

        if (address.bairro) {
          setNeighborhoodSearch(address.bairro);
        }

        setTimeout(() => {
          document.querySelector<HTMLInputElement>('input[placeholder="Número*"]')?.focus();
        }, 100);
      } else {
        setCepError('CEP inválido');
      }
    }
  };

  const handleCpfChange = (value: string) => {
    const formatted = formatCpf(value);
    setCpfDisplay(formatted);
    const cleaned = cleanCpf(value);
    setFormData({ ...formData, customer_cpf: cleaned });
    setCpfError('');

    if (cleaned.length === 11 && !validateCpf(cleaned)) {
      setCpfError('CPF inválido');
    }
  };

  const resetForm = () => {
    setFormData({
      customer_name: '',
      customer_phone: '',
      customer_cpf: '',
      address_street: '',
      address_number: '',
      address_complement: '',
      city: '',
      neighborhood: '',
      state: '',
      zip_code: '',
      delivery_type: 'motoboy',
      motoboy_id: '',
      supplier_id: '',
      delivery_fee: 0,
      delivery_cost: 0,
      volumes: 1,
    });
    setSaleProducts([]);
    setSaleAccessories([]);
    setManualItems([]);
    setPerProductSupplierIds({});
    setPaymentStatus('a_cobrar');
    setPaymentMethods([{ method: 'credit_card', card_brand: 'visa_mastercard', installments: 10, amount: 0 }]);
    setSupplierSearch('');
    setCitySearch('');
    setNeighborhoodSearch('');
    setCepError('');
    setCpfError('');
    setCpfDisplay('');
  };

  const clearForm = () => {
    resetForm();
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <div className="text-white text-xl">Carregando dados...</div>
        </div>
      </div>
    );
  }

  const smartwatchItemsForUI = saleProducts.filter(sp => (sp.product as any)?.category === 'smartwatch');
  const isMultiSupplierUI = smartwatchItemsForUI.length >= 2;

  let totals;
  try {
    totals = calculateTotals();
  } catch (error) {
    console.error('Error calculating totals:', error);
    totals = {
      productsCost: 0,
      productsSale: 0,
      accessoriesCost: 0,
      deliveryCost: 0,
      deliveryFee: 0,
      totalCost: 0,
      totalSale: 0,
      grossProfit: 0,
      cardFee: 0,
      netProfit: 0
    };
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div ref={novaSaleRef} className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3 mb-2">
          <ShoppingCart size={32} />
          Nova Venda
        </h1>
        <p className="text-gray-400">Registre uma nova venda e gerencie todos os detalhes</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
      <QuickAdd
  products={products}
  accessories={accessories}
  onAddProduct={addProductFromSearch}
  onAddAccessory={addAccessoryFromSearch}
  onAddManualItem={addManualItem}
/>
        <UnifiedSearch
          products={products}
          accessories={accessories}
          onAddProduct={addProductFromSearch}
          onAddAccessory={addAccessoryFromSearch}
          onAddManualItem={addManualItem}
          isHighlighted={isHighlighted}
        />

        {/* Selected Products */}
        {saleProducts.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Produtos Selecionados</h2>
            <div className="space-y-3">
              {saleProducts.map((sp, index) => (
                <div
                  key={index}
                  className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                >
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-3">
                      <div className="text-white font-medium">
                        {sp.product?.model} - {sp.product?.color}
                      </div>
                      <div className="text-gray-400 text-sm">
                        Estoque: {sp.product?.current_stock}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">Qtd</label>
                      <input
                        type="number"
                        min="1"
                        max={Math.max(sp.product?.current_stock || 0, sp.quantity)}
                        value={sp.quantity}
                        onChange={(e) => updateProduct(index, 'quantity', parseInt(e.target.value))}
                        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none"
                        required
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">Custo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={sp.unit_cost}
                        onChange={(e) => updateProduct(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                        onBlur={(e) => saveProductCost(sp.product_id, parseFloat(e.target.value) || 0)}
                        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-3">
                      <label className="block text-xs text-gray-400 mb-1">Preço Venda (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={sp.unit_price}
                        onChange={(e) => updateProduct(index, 'unit_price', parseFloat(e.target.value))}
                        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none"
                        required
                      />
                    </div>

                    <div className="col-span-1 text-right">
                      <div className="text-xs text-gray-400">Subtotal</div>
                      <div className="text-orange-500 font-bold text-lg">
                        R$ {(sp.unit_price * sp.quantity).toFixed(2)}
                      </div>
                    </div>

                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeProduct(index)}
                        className="text-red-400 hover:text-red-300 p-2"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {saleAccessories.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Acessórios Selecionados</h2>
            <div className="space-y-3">
              {saleAccessories.map((sa, index) => (
                <div key={index} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                  <div className="grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-5 text-white font-medium">
                      {sa.accessory?.name || sa.custom_name}
                      {sa.custom_name && <span className="text-xs text-gray-400 ml-2">(personalizado)</span>}
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">Qtd</label>
                      <input
                      type="number"
                      min="1"
                      value={sa.quantity}
                      onChange={(e) => updateAccessory(index, 'quantity', parseInt(e.target.value))}
                      className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none"
                    />
                    </div>

                    <div className="col-span-3">
                      <label className="block text-xs text-gray-400 mb-1">Custo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={sa.cost}
                        onChange={(e) => updateAccessory(index, 'cost', parseFloat(e.target.value) || 0)}
                        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-1 text-right">
                      <div className="text-xs text-gray-400">Subtotal</div>
                      <div className="text-orange-500 font-bold">
                        R$ {(sa.cost * sa.quantity).toFixed(2)}
                      </div>
                    </div>

                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeAccessory(index)}
                        className="text-red-400 hover:text-red-300 p-2"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {manualItems.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Itens Manuais</h2>
            <div className="space-y-3">
              {manualItems.map((mi, index) => (
                <div key={index} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-4">
                      <div className="text-white font-medium">{mi.name}</div>
                      <div className="text-gray-400 text-xs">Item personalizado</div>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">Qtd</label>
                      <input
                        type="number"
                        min="1"
                        value={mi.quantity}
                        onChange={(e) => updateManualItem(index, 'quantity', parseInt(e.target.value))}
                        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none"
                        required
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">Custo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={mi.cost}
                        onChange={(e) => updateManualItem(index, 'cost', parseFloat(e.target.value) || 0)}
                        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">Preço Venda (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={mi.price}
                        onChange={(e) => updateManualItem(index, 'price', parseFloat(e.target.value))}
                        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none"
                        required
                      />
                    </div>

                    <div className="col-span-1 text-right">
                      <div className="text-xs text-gray-400">Subtotal</div>
                      <div className="text-orange-500 font-bold">
                        R$ {(mi.price * mi.quantity).toFixed(2)}
                      </div>
                    </div>

                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeManualItem(index)}
                        className="text-red-400 hover:text-red-300 p-2"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Customer & Payment Info - Compact */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-lg font-bold text-white mb-4">Cliente</h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nome do Cliente"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                required
              />
              <input
                type="tel"
                placeholder="Telefone (opcional)"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />

              {formData.delivery_type === 'correios' && (
                <div>
                  <input
                    type="text"
                    placeholder="CPF*"
                    maxLength={14}
                    value={cpfDisplay}
                    onChange={(e) => handleCpfChange(e.target.value)}
                    className={`w-full bg-gray-700 text-white rounded-lg px-4 py-2 border ${
                      cpfError ? 'border-red-500' : 'border-orange-500'
                    } focus:border-orange-500 focus:outline-none`}
                    required
                  />
                  {cpfError && (
                    <p className="text-red-500 text-sm mt-1">{cpfError}</p>
                  )}
                </div>
              )}

              {formData.delivery_type === 'motoboy' && (
                <input
                  type="text"
                  placeholder="CPF (opcional)"
                  maxLength={14}
                  value={cpfDisplay}
                  onChange={(e) => handleCpfChange(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                />
              )}

              {formData.delivery_type === 'correios' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="CEP*"
                        maxLength={8}
                        value={formData.zip_code}
                        onChange={(e) => handleCepChange(e.target.value)}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                      />
                      {loadingCep && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Estado (UF)*"
                      maxLength={2}
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  {cepError && (
                    <p className="text-red-500 text-sm">{cepError}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Rua*"
                      value={formData.address_street}
                      onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                      className="col-span-2 w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Número*"
                      value={formData.address_number}
                      onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Complemento (opcional)"
                    maxLength={18}
                    value={formData.address_complement}
                    onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  />
                </>
              )}

              {formData.delivery_type === 'motoboy' && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Rua (opcional)"
                      value={formData.address_street}
                      onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                      className="col-span-2 w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Número"
                      value={formData.address_number}
                      onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Complemento (opcional)"
                    value={formData.address_complement}
                    onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  />
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <AutocompleteInput
                  value={citySearch}
                  onChange={setCitySearch}
                  items={cities}
                  placeholder={formData.delivery_type === 'correios' ? 'Cidade*' : 'Cidade'}
                  required={formData.delivery_type === 'motoboy' || formData.delivery_type === 'correios'}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                />
                <AutocompleteInput
                  value={neighborhoodSearch}
                  onChange={setNeighborhoodSearch}
                  items={neighborhoods}
                  placeholder={formData.delivery_type === 'correios' ? 'Bairro*' : 'Bairro'}
                  required={formData.delivery_type === 'motoboy' || formData.delivery_type === 'correios'}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                />
              </div>


              {isMultiSupplierUI ? (
                <div className="space-y-2">
                  <label className="block text-xs text-gray-400">Fornecedor por Smartwatch</label>
                  {smartwatchItemsForUI.map(sp => (
                    <div key={sp.product_id} className="flex items-center gap-2">
                      <span className="text-white text-sm flex-1 truncate">
                        {sp.product?.model} {(sp.product as any)?.color}
                      </span>
                      <select
                        value={perProductSupplierIds[sp.product_id] || ''}
                        onChange={(e) => setPerProductSupplierIds(prev => ({ ...prev, [sp.product_id]: e.target.value }))}
                        className="bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
                        required
                      >
                        <option value="">Selecionar fornecedor</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <AutocompleteInput
                  value={supplierSearch}
                  onChange={(value) => {
                    setSupplierSearch(value);
                    setFormData({ ...formData, supplier_id: '' });
                  }}
                  onSelect={(supplier) => {
                    setFormData({ ...formData, supplier_id: supplier.id });
                  }}
                  items={suppliers}
                  placeholder="Selecionar fornecedor"
                  required
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                />
              )}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Pagamento</h2>
              <button
                type="button"
                onClick={addPaymentEntry}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-colors text-sm font-medium"
              >
                + Adicionar forma de pagamento
              </button>
            </div>

            <div className="space-y-3">
              {paymentMethods.map((pm, index) => (
                <div key={index} className="bg-gray-700 rounded-lg p-4 border border-gray-600 space-y-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={pm.method}
                      onChange={(e) => updatePaymentMethod(index, 'method', e.target.value)}
                      className="flex-1 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                    >
                      <option value="pix">PIX (Sem taxa)</option>
                      <option value="cash">Dinheiro (Sem taxa)</option>
                      <option value="debit_card">Débito</option>
                      <option value="credit_card">Crédito</option>
                      <option value="payment_link">Link de Pagamento</option>
                    </select>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Valor (R$)"
                      value={pm.amount || ''}
                      onChange={(e) => updatePaymentMethod(index, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-36 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                    />

                    {paymentMethods.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePaymentEntry(index)}
                        className="text-red-400 hover:text-red-300 p-1.5"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  {(pm.method === 'credit_card' || pm.method === 'debit_card' || pm.method === 'payment_link') && (
                    <div className="flex gap-3">
                      <select
                        value={pm.card_brand}
                        onChange={(e) => updatePaymentMethod(index, 'card_brand', e.target.value)}
                        className="flex-1 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                      >
                        <option value="">Bandeira (definir depois)</option>
                        <option value="visa_mastercard">Visa / Mastercard</option>
                        <option value="elo_amex">Elo / Amex</option>
                      </select>

                      {(pm.method === 'credit_card' || pm.method === 'payment_link') && (
                        <select
                          value={pm.installments}
                          onChange={(e) => updatePaymentMethod(index, 'installments', parseInt(e.target.value))}
                          className="flex-1 bg-gray-600 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-orange-500 focus:outline-none text-sm"
                        >
                          <option value="0">Parcelas (definir depois)</option>
                          {pm.card_brand && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                            <option key={n} value={n}>
                              {n}x ({getFeePercentageLabel('credit_card', pm.card_brand, n)})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {(pm.method === 'credit_card' || pm.method === 'debit_card' || pm.method === 'payment_link') && pm.amount > 0 && pm.card_brand && (
                    <div className="text-xs text-red-400">
                      Taxa: R$ {calculateCardFee(pm.amount, pm.method, pm.card_brand, pm.installments).toFixed(2)} ({getFeePercentageLabel(pm.method, pm.card_brand, pm.installments)})
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-600">
              <div className="text-xs text-gray-400 mb-2">Status do Pagamento</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('pago')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    paymentStatus === 'pago'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  Pago
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('a_cobrar')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    paymentStatus === 'a_cobrar'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  A Cobrar
                </button>
              </div>
            </div>

            {(() => {
              const totalAllocated = paymentMethods.reduce((s, pm) => s + pm.amount, 0);
              const remaining = totals.totalSalePrice - totalAllocated;
              const isBalanced = Math.abs(remaining) < 0.01;
              const hasAmounts = totalAllocated > 0;
              return (
                <div className="mt-4 pt-3 border-t border-gray-600 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Total da Venda</div>
                    <div className="text-white font-bold">R$ {totals.totalSalePrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Alocado</div>
                    <div className={`font-bold ${!hasAmounts ? 'text-gray-400' : isBalanced ? 'text-green-400' : 'text-yellow-400'}`}>
                      R$ {totalAllocated.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Falta Alocar</div>
                    <div className={`font-bold ${!hasAmounts ? 'text-gray-400' : isBalanced ? 'text-green-400' : remaining > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                      R$ {remaining.toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Delivery Info */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-bold text-white mb-4">Entrega</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <select
              value={formData.delivery_type}
              onChange={(e) => setFormData({ ...formData, delivery_type: e.target.value, motoboy_id: '', delivery_fee: 0, delivery_cost: 0 })}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              required
            >
              <option value="loja_fisica">Loja Física</option>
              <option value="motoboy">Motoboy</option>
              <option value="correios">Correios (SEDEX)</option>
            </select>

            {formData.delivery_type === 'motoboy' && (
              <>
                <select
                  value={formData.motoboy_id}
                  onChange={(e) => setFormData({ ...formData, motoboy_id: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                >
                  <option value="">Selecionar Motoboy</option>
                  {motoboys.map((motoboy) => (
                    <option key={motoboy.id} value={motoboy.id}>
                      {motoboy.name}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  placeholder="Taxa de Entrega (R$)"
                  step="0.01"
                  min="0"
                  value={formData.delivery_fee}
                  onChange={(e) =>
                    setFormData({ ...formData, delivery_fee: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
                  required
                />
              </>
            )}

            {formData.delivery_type === 'correios' && (
              <input
                type="number"
                placeholder="Custo Correios (R$)"
                step="0.01"
                min="0"
                value={formData.delivery_cost}
                onChange={(e) =>
                  setFormData({ ...formData, delivery_cost: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none"
              />
            )}
          </div>
        </div>

        {/* Volumes and Shipping Info */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-bold text-white mb-4">Envio</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="text-gray-300 text-sm font-medium w-32">Volumes:</label>
              <input
                type="number"
                min="1"
                value={formData.volumes}
                onChange={(e) => setFormData({ ...formData, volumes: parseInt(e.target.value) || 1 })}
                className="w-24 bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-center font-semibold"
                required
              />
              <div className="text-gray-400 text-xs">
                Calculado automaticamente
              </div>
            </div>

            {formData.delivery_type === 'correios' && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-blue-400 text-sm font-medium">
                  Envio padrão: Envelope até 300g | Seguro: R$150
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Profit Summary - Prominent */}
        <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black rounded-xl p-6 border-2 border-orange-500 shadow-xl">
          <div className="flex items-center gap-3 mb-5">
            <TrendingUp className="text-orange-500" size={28} />
            <h2 className="text-2xl font-bold text-white">Resumo Financeiro</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Valor Total</div>
              <div className="text-white text-2xl font-bold">
                R$ {totals.totalSalePrice.toFixed(2)}
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Taxa do Cartão</div>
              <div className="text-red-400 text-2xl font-bold">
                - R$ {totals.cardFee.toFixed(2)}
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Valor Recebido</div>
              <div className="text-blue-400 text-2xl font-bold">
                R$ {totals.netReceived.toFixed(2)}
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4 border border-orange-600">
              <div className="text-gray-400 text-sm mb-1">Lucro Final</div>
              <div
                className={`text-3xl font-bold ${
                  totals.profit >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                R$ {totals.profit.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <div className="text-sm text-gray-400 mb-2">Detalhamento de Custos:</div>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Custo Produtos:</span>
                <span className="text-gray-300 font-medium">
                  R$ {totals.totalProductCost.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Custo Acessórios:</span>
                <span className="text-gray-300 font-medium">
                  R$ {totals.totalAccessoryCost.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Taxa Motoboy:</span>
                <span className="text-gray-300 font-medium">
                  R$ {totals.deliveryFee.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Custo Correios:</span>
                <span className="text-gray-300 font-medium">
                  R$ {totals.deliveryCost.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saleProducts.length === 0 && manualItems.length === 0}
            className="flex-1 bg-orange-500 text-white px-6 py-4 rounded-lg hover:bg-orange-600 transition-colors font-bold text-xl disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            <ShoppingCart size={24} />
            Confirmar Venda
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="px-8 py-4 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium"
          >
            Limpar
          </button>
        </div>
      </form>
    </div>
  );
}
