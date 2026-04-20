import { z } from 'zod';
import { ORDER_RULES } from '@/lib/constants';
import { zUuid } from './common';

export const OrderItemSchema = z.object({
  product_id: zUuid,
  qty: z.number().int().min(ORDER_RULES.MIN_QTY).max(ORDER_RULES.MAX_QTY),
  // precio_aplicado normalmente lo calcula el server usando base/override
  precio_aplicado: z.number().min(0),
});

export const OrderCreateSchema = z.object({
  customer_id: zUuid,
  notes: z.string().trim().max(ORDER_RULES.NOTES_MAX).optional().nullable(),
  items: z.array(OrderItemSchema).min(1),
});

export type OrderCreateInput = z.infer<typeof OrderCreateSchema>;
