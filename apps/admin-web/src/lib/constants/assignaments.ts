export const ASSIGNMENT_STATUS = ['ACTIVA', 'CERRADA','TERMINADA','CANCELADA'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS)[number];

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  ACTIVA: 'Activa',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
  TERMINADA: 'Terminada',
};

export const ASSIGNMENT_RULES = {
  LOAD_MAX_PRODUCTS: 60, // cantidad distinta de productos en carga
  LOAD_MAX_QTY_PER_PRODUCT: 9999,
  NOTES_MAX: 500,
} as const;
