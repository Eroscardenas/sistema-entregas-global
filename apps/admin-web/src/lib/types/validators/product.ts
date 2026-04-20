import { z } from 'zod';
import { PRODUCT_RULES } from '@/lib/constants';
import { zIceType, zProductKind } from './common';

export const ProductCreateSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  kind: zProductKind,
  ice_type: zIceType.default('normal'),
  kg_por_unidad: z.number().min(PRODUCT_RULES.MIN_KG).max(PRODUCT_RULES.MAX_KG),
  precio_base: z.number().min(PRODUCT_RULES.MIN_PRICE).max(PRODUCT_RULES.MAX_PRICE).default(0),
  activo: z.boolean().default(true),
});

export const ProductUpdateSchema = ProductCreateSchema.partial().extend({
  id: z.string().uuid(),
});

export type ProductCreateInput = z.infer<typeof ProductCreateSchema>;
export type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;
