export type SaleStatus =
  | 'em_separacao'
  | 'embalado'
  | 'em_rota'
  | 'finalizado'
  | 'pago'
  | 'embalar_amanha';

export interface StatusConfig {
  value: SaleStatus;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const SALE_STATUSES: StatusConfig[] = [
  {
    value: 'em_separacao',
    label: 'Em separação',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500',
  },
  {
    value: 'embalado',
    label: 'Embalado',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500',
  },
  {
    value: 'em_rota',
    label: 'Em rota de entrega',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500',
  },
  {
    value: 'finalizado',
    label: 'Finalizado',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500',
  },
  {
    value: 'pago',
    label: 'Pago',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500',
  },
  {
    value: 'embalar_amanha',
    label: 'Embalar amanhã',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500',
  },
];

export function getStatusConfig(status: SaleStatus): StatusConfig {
  return SALE_STATUSES.find(s => s.value === status) || SALE_STATUSES[0];
}
