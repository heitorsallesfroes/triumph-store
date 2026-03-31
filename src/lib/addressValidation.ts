export interface AddressData {
  customer_name: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  message?: string;
}

export function validateAddressForDeliveryType(
  deliveryType: string,
  addressData: AddressData
): ValidationResult {
  const missingFields: string[] = [];

  if (deliveryType === 'correios') {
    if (!addressData.customer_name?.trim()) missingFields.push('Nome do cliente');
    if (!addressData.street?.trim()) missingFields.push('Rua');
    if (!addressData.number?.trim()) missingFields.push('Número');
    if (!addressData.neighborhood?.trim()) missingFields.push('Bairro');
    if (!addressData.city?.trim()) missingFields.push('Cidade');
    if (!addressData.state?.trim()) missingFields.push('Estado');
    if (!addressData.zip_code?.trim()) missingFields.push('CEP');

    if (missingFields.length > 0) {
      return {
        isValid: false,
        missingFields,
        message: `Preencha o endereço completo para envio pelos Correios: ${missingFields.join(', ')}`,
      };
    }
  } else if (deliveryType === 'motoboy') {
    if (!addressData.customer_name?.trim()) missingFields.push('Nome do cliente');
    if (!addressData.neighborhood?.trim()) missingFields.push('Bairro');
    if (!addressData.city?.trim()) missingFields.push('Cidade');

    if (missingFields.length > 0) {
      return {
        isValid: false,
        missingFields,
        message: `Preencha os campos obrigatórios para entrega via motoboy: ${missingFields.join(', ')}`,
      };
    }
  }

  return {
    isValid: true,
    missingFields: [],
  };
}

export function formatAddressForDisplay(addressData: AddressData, deliveryType: string): string {
  if (deliveryType === 'correios' && addressData.street && addressData.number && addressData.neighborhood && addressData.city && addressData.state && addressData.zip_code) {
    return `${addressData.street}, ${addressData.number}\n${addressData.neighborhood} - ${addressData.city}/${addressData.state}\nCEP: ${addressData.zip_code}`;
  }

  if (deliveryType === 'motoboy' && addressData.neighborhood && addressData.city) {
    if (addressData.street && addressData.number) {
      return `${addressData.street}, ${addressData.number}\n${addressData.neighborhood} - ${addressData.city}`;
    }
    return `${addressData.neighborhood} - ${addressData.city}`;
  }

  const parts = [];
  if (addressData.street && addressData.number) parts.push(`${addressData.street}, ${addressData.number}`);
  if (addressData.neighborhood) parts.push(addressData.neighborhood);
  if (addressData.city) parts.push(addressData.city);
  if (addressData.state) parts.push(addressData.state);

  return parts.join(' - ');
}
