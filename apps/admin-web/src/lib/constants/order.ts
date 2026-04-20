export const ORDER_STATUS = [
  'NUEVO',
  'VISTO',
  'EN_VALIDACION',
  'APROBADO',
  'ASIGNADO',
  'RECHAZADO',
  'CANCELADO',
] as const;

export type OrderStatus = (typeof ORDER_STATUS)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NUEVO: 'Nuevo',
  VISTO: 'Visto',
  EN_VALIDACION: 'En validación',
  APROBADO: 'Aprobado',
  ASIGNADO: 'Asignado',
  RECHAZADO: 'Rechazado',
  CANCELADO: 'Cancelado',
};

export const ORDER_RULES = {
  MIN_QTY: 1,
  MAX_QTY: 9999,
  NOTES_MAX: 500,
} as const;
