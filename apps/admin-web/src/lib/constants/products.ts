export const PRODUCT_KIND = ['bolsa', 'barra'] as const;
export type ProductKind = (typeof PRODUCT_KIND)[number];

export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  bolsa: 'Bolsa',
  barra: 'Barra',
};

// Tipos de hielo (texto libre en DB, pero en UI conviene controlarlo)
export const ICE_TYPES = ['normal', 'gourmet'] as const;
export type IceType = (typeof ICE_TYPES)[number];

export const ICE_TYPE_LABEL: Record<IceType, string> = {
  normal: 'Normal',
  gourmet: 'Gourmet',
};

// Validaciones generales
export const PRODUCT_RULES = {
  MIN_KG: 0.1,
  MAX_KG: 200, // por unidad (suficiente para bolsa/barra)
  MIN_PRICE: 0,
  MAX_PRICE: 999999,
} as const;
