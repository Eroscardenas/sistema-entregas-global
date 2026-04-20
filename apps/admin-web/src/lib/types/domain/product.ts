import type { ProductKind } from '@/lib/types/enums';

export type ProductDTO = {
  id: string;
  nombre: string;
  kind: ProductKind;
  ice_type: string;      // en UI puedes restringirlo con constants
  kg_por_unidad: number;
  precio_base: number;
  activo: boolean;
};
