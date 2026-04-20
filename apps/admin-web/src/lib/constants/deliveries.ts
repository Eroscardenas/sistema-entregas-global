export const DELIVERY_STATUS = ['PENDIENTE', 'ENTREGADA', 'CANCELADA'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUS)[number];

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  PENDIENTE: 'Pendiente',
  ENTREGADA: 'Entregada',
  CANCELADA: 'Cancelada',
};

export const DELIVERY_RULES = {
  MIN_QTY_ASSIGNED: 1,
  MAX_QTY_ASSIGNED: 9999,
  MIN_QTY_REAL: 0,
  MAX_QTY_REAL: 9999,

  CANCEL_REASON_MAX: 200,
} as const;

// Progreso semáforo (para UI)
export const PROGRESS_THRESHOLDS = {
  RED_MAX: 39,
  YELLOW_MAX: 79,
  GREEN_MIN: 80,
} as const;
